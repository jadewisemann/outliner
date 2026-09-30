//! The folder backend's disk side: read `outliner.json` and its conflict
//! copies, replace it only if it still holds what was read, and retire copies
//! whose content has been merged. Plus the app's own replica of the workspace.
//!
//! Plain `std` on purpose, so this file compiles and tests on its own
//! (`rustc --edition 2021 --test src/folder.rs`) without the Tauri crates.
//!
//! Nothing here looks inside a file. Parsing, validation and the merge all
//! happen in the web code (`src/sync/api/remote/file.ts`), the same code a
//! browser runs — the shell moves bytes and nothing else (DESIGN.md
//! principle 20). That is also why a sealed workspace needs no special case.
//!
//! Nothing here deletes a file either. A merged conflict copy is *moved* into
//! `.outliner-merged/`, and an unreadable canonical file is renamed aside:
//! every step the backend takes on someone else's bytes can be undone by
//! hand (ADR-0011).

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// The one file the backend owns.
pub const CANONICAL: &str = "outliner.json";

/// Where merged copies go instead of being deleted. Hidden, so most sync
/// services and file browsers leave it out of sight, and never read back.
pub const RETIRED: &str = ".outliner-merged";

/// Refuses to read something that cannot be a workspace, rather than load it into memory.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Read–compare–write on the synced folder is one step for every writer in
/// this process. The replica has its own lock: a slow network folder must not
/// hold up a local save.
static FOLDER: Mutex<()> = Mutex::new(());
static REPLICA_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub name: String,
    pub text: String,
    /// A hash of the bytes: the version the web code hands back on write.
    pub stamp: String,
}

#[derive(Debug, Default)]
pub struct Read {
    pub canonical: Option<Entry>,
    pub copies: Vec<Entry>,
}

/// A copy as it was read: retired only if it still holds exactly these bytes.
#[derive(Debug, Clone)]
pub struct Seen {
    pub name: String,
    pub stamp: String,
}

/// FNV-1a over the bytes. Stable across builds and runs, which `DefaultHasher`
/// does not promise, and only ever compared for equality.
pub fn stamp(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}-{}", bytes.len())
}

/// Whether a file name is a copy that a sync service made of the canonical
/// file: Dropbox `outliner (… conflicted copy …).json`, Google Drive
/// `outliner (1).json`, iCloud `outliner 2.json`, Syncthing
/// `outliner.sync-conflict-….json`, OneDrive `outliner-MACHINE.json` — and
/// the canonical file set aside as `outliner.unreadable-….json`.
///
/// Not a copy: what a person makes on purpose. macOS Finder's Duplicate
/// (`outliner copy.json`, `outliner copy 2.json`) is a snapshot someone chose
/// to keep, and merging an old snapshot would bring back rows deleted since.
pub fn is_copy(name: &str) -> bool {
    if name == CANONICAL || name.contains('/') || name.contains('\\') || name.starts_with('.') {
        return false;
    }
    let Some(rest) = name.strip_prefix("outliner") else {
        return false;
    };
    let Some(middle) = rest.strip_suffix(".json") else {
        return false;
    };
    if middle.is_empty() || !matches!(middle.chars().next(), Some(' ' | '.' | '-' | '(' | '_')) {
        return false;
    }
    let finder = middle.strip_prefix(" copy").map(|tail| tail.is_empty() || tail.trim_start().chars().all(|c| c.is_ascii_digit()));
    finder != Some(true)
}

fn read_entry(path: &Path, name: &str) -> Result<Option<Entry>, String> {
    match fs::metadata(path) {
        Ok(meta) if !meta.is_file() => return Ok(None),
        Ok(meta) if meta.len() > MAX_BYTES => return Err(format!("{name} is larger than {MAX_BYTES} bytes")),
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("cannot read {name}: {error}")),
    }
    match fs::read(path) {
        Ok(bytes) => Ok(Some(Entry {
            name: name.to_string(),
            stamp: stamp(&bytes),
            // Lossy rather than failing: bytes that are not UTF-8 are not a
            // workspace either, and the web side's validation drops them.
            text: String::from_utf8_lossy(&bytes).into_owned(),
        })),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("cannot read {name}: {error}")),
    }
}

pub fn read(dir: &Path) -> Result<Read, String> {
    let canonical = read_entry(&dir.join(CANONICAL), CANONICAL)?;
    let mut copies = Vec::new();
    let listing = match fs::read_dir(dir) {
        Ok(listing) => listing,
        // A folder that does not exist yet is an empty remote; the first
        // write creates it.
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Read { canonical, copies }),
        Err(error) => return Err(format!("cannot list {}: {error}", dir.display())),
    };
    for item in listing.flatten() {
        let Ok(name) = item.file_name().into_string() else { continue };
        if !is_copy(&name) {
            continue;
        }
        // A copy that cannot be read is left alone, not reported as an error:
        // the canonical file is still usable, and the copy stays on disk.
        if let Ok(Some(entry)) = read_entry(&item.path(), &name) {
            copies.push(entry);
        }
    }
    // Directory order is arbitrary; the merge does not care, but a stable
    // order keeps the behaviour reproducible.
    copies.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Read { canonical, copies })
}

fn current_stamp(path: &Path, name: &str) -> Result<Option<String>, String> {
    Ok(read_entry(path, name)?.map(|entry| entry.stamp))
}

/// Moves each copy into `.outliner-merged/`, but only if it still holds the
/// bytes that were read and merged — a sync service may have delivered a new
/// version under the same name since. Returns the names it could not move.
fn retire_locked(dir: &Path, copies: &[Seen]) -> Vec<String> {
    let mut failed = Vec::new();
    let target = dir.join(RETIRED);
    for copy in copies {
        if !is_copy(&copy.name) {
            continue;
        }
        let source = dir.join(&copy.name);
        match current_stamp(&source, &copy.name) {
            Ok(Some(now)) if now == copy.stamp => {}
            // Gone already, or changed: nothing to do now; a changed copy is
            // merged on the next pull.
            _ => continue,
        }
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let moved = fs::create_dir_all(&target).and_then(|_| {
            let destination = target.join(format!("{nanos}-{}", copy.name));
            fs::rename(&source, destination)
        });
        if moved.is_err() {
            failed.push(copy.name.clone());
        }
    }
    failed
}

pub fn retire(dir: &Path, copies: &[Seen]) -> Vec<String> {
    let _held = FOLDER.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    retire_locked(dir, copies)
}

/// Replaces the canonical file with `text` if it still has the stamp
/// `expect` (`None` = expected to be absent). `Ok(None)` means it moved on and
/// the caller should pull and merge again.
///
/// After a successful write, retires the listed conflict copies: their
/// content is in `text`, since the caller merged them before writing.
pub fn write(dir: &Path, text: &str, expect: Option<&str>, retired: &[Seen]) -> Result<Option<String>, String> {
    let _held = FOLDER.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if current_stamp(&dir.join(CANONICAL), CANONICAL)?.as_deref() != expect {
        return Ok(None);
    }
    replace(dir, CANONICAL, text)?;
    retire_locked(dir, retired);
    Ok(Some(stamp(text.as_bytes())))
}

/// Renames a canonical file the web side could not read to
/// `outliner.unreadable-<time>.json`, if it still has the stamp that was read.
/// From then on it is an unreadable copy: never merged, never moved, there for
/// a person to look at. Returns whether it was set aside.
pub fn set_aside(dir: &Path, expect: &str) -> Result<bool, String> {
    let _held = FOLDER.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let source = dir.join(CANONICAL);
    if current_stamp(&source, CANONICAL)?.as_deref() != Some(expect) {
        return Ok(false);
    }
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    fs::rename(&source, dir.join(format!("outliner.unreadable-{nanos}.json")))
        .map(|_| true)
        .map_err(|error| format!("cannot set {CANONICAL} aside: {error}"))
}

/// Writes `name` in `dir` atomically: beside, then rename. A reader (or a
/// sync service) never sees half a workspace, and a crash mid-write leaves
/// the previous file intact. The leading dot keeps most sync services from
/// uploading the temporary.
fn replace(dir: &Path, name: &str, text: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let temporary: PathBuf = dir.join(format!(".{name}.{}.{nanos}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary, dir.join(name))
    })();
    result.map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("cannot write {name}: {error}")
    })
}

/// The app's own copy of the workspace, in its data folder: written after
/// every local save, read back at start. One writer — this app, on this
/// device — so the web side orders the writes and the newest simply wins.
pub const REPLICA: &str = "workspace.json";

pub fn replica_write(dir: &Path, text: &str) -> Result<(), String> {
    let _held = REPLICA_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    replace(dir, REPLICA, text)
}

pub fn replica_read(dir: &Path) -> Result<Option<String>, String> {
    Ok(read_entry(&dir.join(REPLICA), REPLICA)?.map(|entry| entry.text))
}

/// Folders the person has allowed the folder backend to touch, one per line,
/// kept in the app's data folder. The page can ask to use a folder; only the
/// shell (a folder picker, or a native confirmation) can allow one.
pub const ALLOWED: &str = "allowed-folders.txt";

pub fn allowed(data: &Path) -> Vec<String> {
    fs::read_to_string(data.join(ALLOWED))
        .map(|text| text.lines().filter(|line| !line.is_empty()).map(str::to_string).collect())
        .unwrap_or_default()
}

pub fn allow(data: &Path, dir: &str) -> Result<(), String> {
    let _held = REPLICA_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut list = allowed(data);
    if !list.iter().any(|known| known == dir) {
        list.push(dir.to_string());
    }
    replace(data, ALLOWED, &(list.join("\n") + "\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("outliner-folder-{tag}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seen(dir: &Path, name: &str) -> Seen {
        Seen { name: name.to_string(), stamp: stamp(&fs::read(dir.join(name)).unwrap()) }
    }

    #[test]
    fn recognises_the_copies_sync_services_make() {
        for name in [
            "outliner (Jade's conflicted copy 2026-09-29).json",
            "outliner (1).json",
            "outliner 2.json",
            "outliner.sync-conflict-20260929-101010-ABCDEFG.json",
            "outliner-MACBOOK.json",
            "outliner.unreadable-123.json",
        ] {
            assert!(is_copy(name), "{name}");
        }
        for name in [
            "outliner.json",
            "outliner.json.tmp",
            ".outliner.json.1.2.tmp",
            "outlinerx.json",
            "notes.json",
            "../outliner (1).json",
            "sub\\outliner (1).json",
            // Made on purpose by a person, not by a sync service.
            "outliner copy.json",
            "outliner copy 2.json",
        ] {
            assert!(!is_copy(name), "{name}");
        }
    }

    #[test]
    fn an_empty_or_missing_folder_reads_as_nothing() {
        let dir = scratch("empty");
        let read = read(&dir.join("not-yet")).unwrap();
        assert!(read.canonical.is_none() && read.copies.is_empty());
    }

    #[test]
    fn writes_only_over_what_was_read() {
        let dir = scratch("cas");
        // Absent is a version too: a second first write loses.
        let first = write(&dir, "{\"a\":1}", None, &[]).unwrap().expect("first write");
        assert_eq!(write(&dir, "{\"b\":2}", None, &[]).unwrap(), None);

        let read1 = read(&dir).unwrap();
        assert_eq!(read1.canonical.as_ref().unwrap().stamp, first);
        let second = write(&dir, "{\"c\":3}", Some(&first), &[]).unwrap().expect("matching write");
        // The first stamp is stale now.
        assert_eq!(write(&dir, "{\"d\":4}", Some(&first), &[]).unwrap(), None);
        assert_eq!(read(&dir).unwrap().canonical.unwrap().stamp, second);
        assert_eq!(fs::read_to_string(dir.join(CANONICAL)).unwrap(), "{\"c\":3}");
    }

    #[test]
    fn retires_merged_copies_by_moving_them_and_only_if_unchanged() {
        let dir = scratch("copies");
        fs::write(dir.join("outliner (1).json"), "{}").unwrap();
        fs::write(dir.join("outliner (2).json"), "{\"old\":1}").unwrap();
        fs::write(dir.join("keep.json"), "{}").unwrap();
        let one = seen(&dir, "outliner (1).json");
        let two = seen(&dir, "outliner (2).json");
        // (2) changes after it was read: its new bytes were never merged.
        fs::write(dir.join("outliner (2).json"), "{\"new\":1}").unwrap();

        let not_copy = Seen { name: "keep.json".into(), stamp: stamp(b"{}") };
        write(&dir, "{}", None, &[one, two, not_copy]).unwrap().unwrap();

        assert!(!dir.join("outliner (1).json").exists());
        let moved: Vec<_> = fs::read_dir(dir.join(RETIRED)).unwrap().flatten().map(|e| e.file_name().into_string().unwrap()).collect();
        assert_eq!(moved.len(), 1);
        assert!(moved[0].ends_with("outliner (1).json"));
        assert!(dir.join("outliner (2).json").exists(), "changed copy stays for the next pull");
        assert!(dir.join("keep.json").exists());
        // The retired folder is not read as a copy, and no temporary is left behind.
        assert_eq!(read(&dir).unwrap().copies.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["outliner (2).json"]);
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn sets_an_unreadable_canonical_file_aside_instead_of_overwriting_it() {
        let dir = scratch("aside");
        fs::write(dir.join(CANONICAL), "{ not json").unwrap();
        let read1 = read(&dir).unwrap();
        let stale = "0000000000000000-1";
        assert!(!set_aside(&dir, stale).unwrap(), "only the bytes that were read");
        assert!(set_aside(&dir, &read1.canonical.unwrap().stamp).unwrap());
        let read2 = read(&dir).unwrap();
        assert!(read2.canonical.is_none());
        assert_eq!(read2.copies.len(), 1);
        assert_eq!(read2.copies[0].text, "{ not json");
    }

    #[test]
    fn keeps_a_replica_and_an_allow_list() {
        let dir = scratch("replica").join("nested");
        assert_eq!(replica_read(&dir).unwrap(), None);
        replica_write(&dir, "one").unwrap();
        replica_write(&dir, "two").unwrap();
        assert_eq!(replica_read(&dir).unwrap().as_deref(), Some("two"));
        assert!(!is_copy(REPLICA));

        assert!(allowed(&dir).is_empty());
        allow(&dir, "/a").unwrap();
        allow(&dir, "/b").unwrap();
        allow(&dir, "/a").unwrap();
        assert_eq!(allowed(&dir), ["/a", "/b"]);
    }
}
