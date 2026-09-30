//! The folder backend's disk side: read `outliner.json` and its conflict
//! copies, replace it only if it still holds what was read, and retire copies
//! whose content has been merged. Plus the app's own replica of the workspace,
//! and the allow list of folders the backend may touch.
//!
//! Plain `std` on purpose, so this file compiles and tests on its own
//! (`rustc --edition 2021 --test src-tauri/src/folder.rs`) without the Tauri
//! crates.
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
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// The one file the backend owns.
pub const CANONICAL: &str = "outliner.json";

/// Where merged copies go instead of being deleted. Hidden, so most sync
/// services and file browsers leave it out of sight, and never read back.
pub const RETIRED: &str = ".outliner-merged";

/// Refuses to read something that cannot be a workspace, rather than load it into memory.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Read–compare–write on the synced folder is one step for every writer in
/// this process.
static FOLDER_LOCK: Mutex<()> = Mutex::new(());

/// The app's data folder has its own lock, held while the replica is written
/// and while the allow list changes: a slow network folder must not hold up a
/// local save.
static DATA_LOCK: Mutex<()> = Mutex::new(());

/// Takes a lock even if a command panicked while holding it. The locks guard
/// `()`, so a poisoned one protects no half-changed state, and one panicked
/// command must not make every later folder command panic too.
fn hold(lock: &'static Mutex<()>) -> MutexGuard<'static, ()> {
    lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Nanoseconds since the epoch, for names that must not collide; 0 if the
/// clock reads earlier than 1970.
fn nanos() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

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
    if !matches!(middle.chars().next(), Some(' ' | '.' | '-' | '(' | '_')) {
        return false;
    }
    let finder = middle.strip_prefix(" copy").map(|tail| tail.trim_start().chars().all(|c| c.is_ascii_digit()));
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
    // The order is part of the answer: `src/sync/api/remote/file.ts` keys its
    // "folder unchanged" cache on the copies in this order. Directory order is
    // arbitrary, so without the sort an unchanged folder could miss that cache
    // on every poll and hand the merge a fresh object each time — the idle
    // re-render trap in docs/design/code-rationale.md.
    copies.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Read { canonical, copies })
}

fn current_stamp(path: &Path, name: &str) -> Result<Option<String>, String> {
    Ok(read_entry(path, name)?.map(|entry| entry.stamp))
}

/// Moves each copy into `.outliner-merged/`, but only if it still holds the
/// bytes that were read and merged — a sync service may have delivered a new
/// version under the same name since. Returns the names it could not move.
pub fn retire(dir: &Path, copies: &[Seen]) -> Vec<String> {
    let _held = hold(&FOLDER_LOCK);
    retire_locked(dir, copies)
}

/// `retire`, for a caller that already holds `FOLDER_LOCK`.
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
        let destination = target.join(format!("{}-{}", nanos(), copy.name));
        if fs::create_dir_all(&target).and_then(|_| fs::rename(&source, destination)).is_err() {
            failed.push(copy.name.clone());
        }
    }
    failed
}

/// Replaces the canonical file with `text` if it still has the stamp
/// `expect` (`None` = expected to be absent). `Ok(None)` means it moved on and
/// the caller should pull and merge again.
///
/// After a successful write, retires the listed conflict copies: their
/// content is in `text`, since the caller merged them before writing.
pub fn write(dir: &Path, text: &str, expect: Option<&str>, retire: &[Seen]) -> Result<Option<String>, String> {
    let _held = hold(&FOLDER_LOCK);
    if current_stamp(&dir.join(CANONICAL), CANONICAL)?.as_deref() != expect {
        return Ok(None);
    }
    replace(dir, CANONICAL, text)?;
    retire_locked(dir, retire);
    Ok(Some(stamp(text.as_bytes())))
}

/// Renames a canonical file the web side could not read to
/// `outliner.unreadable-<time>.json`, if it still has the stamp that was read.
/// From then on it is an unreadable copy: never merged, never moved, there for
/// a person to look at. Returns whether it was set aside.
pub fn set_aside(dir: &Path, expect: &str) -> Result<bool, String> {
    let _held = hold(&FOLDER_LOCK);
    let source = dir.join(CANONICAL);
    if current_stamp(&source, CANONICAL)?.as_deref() != Some(expect) {
        return Ok(false);
    }
    fs::rename(&source, dir.join(format!("outliner.unreadable-{}.json", nanos())))
        .map(|_| true)
        .map_err(|error| format!("cannot set {CANONICAL} aside: {error}"))
}

/// Writes `name` in `dir` atomically: beside, then rename. A reader (or a
/// sync service) never sees half a workspace, and a crash mid-write leaves
/// the previous file intact. The leading dot keeps most sync services from
/// uploading the temporary, and `is_copy` from reading it as a copy.
fn replace(dir: &Path, name: &str, text: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let temporary = dir.join(format!(".{name}.{}.{}.tmp", std::process::id(), nanos()));
    write_then_rename(&temporary, &dir.join(name), text.as_bytes()).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("cannot write {name}: {error}")
    })
}

/// The part of `replace` that can leave a temporary behind, so that one error
/// path removes it. Every byte is on disk before the target name points at it.
fn write_then_rename(temporary: &Path, target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::File::create(temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(temporary, target)
}

/// The app's own copy of the workspace, in its data folder: written after
/// every local save, read back at start. One writer — this app, on this
/// device — so the web side orders the writes and the newest simply wins.
pub const REPLICA: &str = "workspace.json";

pub fn replica_write(dir: &Path, text: &str) -> Result<(), String> {
    let _held = hold(&DATA_LOCK);
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

/// Puts `dir` on the allow list. Refuses a name that would not stay one line
/// here, whatever `absolute` already did: one folder per line is this list's
/// own format.
pub fn allow(data: &Path, dir: &str) -> Result<(), String> {
    one_line(dir)?;
    let _held = hold(&DATA_LOCK);
    let mut list = allowed(data);
    if !list.iter().any(|known| known == dir) {
        list.push(dir.to_string());
    }
    replace(data, ALLOWED, &(list.join("\n") + "\n"))
}

/// Whether `dir` is on the allow list, spelled exactly as it was allowed:
/// `/a/` is not `/a`, and neither is a folder inside `/a`.
pub fn is_allowed(data: &Path, dir: &str) -> bool {
    allowed(data).iter().any(|known| known == dir)
}

/// The folder a command was handed, if it is a name the allow list could
/// hold: an absolute path, on one line. Checked before anything else, so a
/// refused name never reaches a confirmation dialog.
pub fn absolute(dir: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(dir);
    if !path.is_absolute() {
        return Err("the folder must be an absolute path".into());
    }
    one_line(dir)?;
    Ok(path)
}

/// The gate in front of every folder command: the folder, if the person
/// allowed it. The page names a folder; only the shell's picker or its
/// confirmation dialog can allow one, so a script in the page cannot aim the
/// folder commands at an arbitrary place.
pub fn permitted(data: &Path, dir: &str) -> Result<PathBuf, String> {
    let path = absolute(dir)?;
    if !is_allowed(data, dir) {
        return Err("this folder has not been allowed".into());
    }
    Ok(path)
}

/// The allow list is one folder per line, read back with `lines()`. A `\n` in
/// a name would save it as two entries, so one confirmation would allow two
/// folders; `lines()` also drops a `\r` at a line's end, so a `\r` could change
/// which folder was saved. No real path holds a NUL.
fn one_line(dir: &str) -> Result<(), String> {
    if dir.contains(|c: char| matches!(c, '\n' | '\r' | '\0')) {
        return Err("the folder path must not contain a line break or a NUL byte".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("outliner-folder-{tag}-{}", nanos()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seen(dir: &Path, name: &str) -> Seen {
        Seen { name: name.to_string(), stamp: stamp(&fs::read(dir.join(name)).unwrap()) }
    }

    /// The names in `dir`, sorted.
    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<_> =
            fs::read_dir(dir).unwrap().flatten().map(|e| e.file_name().into_string().unwrap()).collect();
        names.sort();
        names
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
        let moved = names(&dir.join(RETIRED));
        assert_eq!(moved.len(), 1);
        assert!(moved[0].ends_with("outliner (1).json"));
        assert!(dir.join("outliner (2).json").exists(), "changed copy stays for the next pull");
        assert!(dir.join("keep.json").exists());
        // The retired folder is not read as a copy, and no temporary is left behind.
        assert_eq!(
            read(&dir).unwrap().copies.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            ["outliner (2).json"]
        );
        assert!(names(&dir).iter().all(|name| !name.ends_with(".tmp")));
    }

    #[test]
    fn retires_a_covered_copy_without_writing_and_keeps_one_that_changed() {
        let dir = scratch("retire");
        fs::write(dir.join(CANONICAL), "{\"a\":1}").unwrap();
        // Already in the canonical file: moved straight away, no write needed.
        fs::write(dir.join("outliner (1).json"), "{\"a\":1}").unwrap();
        fs::write(dir.join("outliner 2.json"), "{\"old\":1}").unwrap();
        let covered = seen(&dir, "outliner (1).json");
        let changed = seen(&dir, "outliner 2.json");
        // A sync service delivers a new version under the same name after the read.
        fs::write(dir.join("outliner 2.json"), "{\"new\":1}").unwrap();

        assert!(retire(&dir, &[covered, changed]).is_empty(), "nothing failed to move");

        let moved = names(&dir.join(RETIRED));
        assert_eq!(moved.len(), 1);
        assert!(moved[0].ends_with("-outliner (1).json"), "{}", moved[0]);
        assert_eq!(fs::read_to_string(dir.join("outliner 2.json")).unwrap(), "{\"new\":1}");
        // Nothing was written: the canonical file is as it was, and no temporary appeared.
        assert_eq!(fs::read_to_string(dir.join(CANONICAL)).unwrap(), "{\"a\":1}");
        assert_eq!(names(&dir), [RETIRED, "outliner 2.json", CANONICAL]);
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

    #[test]
    fn permits_only_an_absolute_folder_allowed_exactly_as_named() {
        let data = scratch("gate");
        let folder = scratch("gate-folder");
        let dir = folder.to_str().unwrap();
        let unlisted = "this folder has not been allowed";

        assert_eq!(permitted(&data, "notes/outliner").unwrap_err(), "the folder must be an absolute path");
        assert_eq!(permitted(&data, dir).unwrap_err(), unlisted);
        allow(&data, dir).unwrap();
        assert_eq!(permitted(&data, dir).unwrap(), folder);
        // Matched as the string that was allowed, not as a place on disk.
        for other in [format!("{dir}/"), format!("{dir}/inner")] {
            assert_eq!(permitted(&data, &other).unwrap_err(), unlisted, "{other}");
        }
        // Absolute first: a relative name is refused even if it is on the list.
        allow(&data, "notes/outliner").unwrap();
        assert_eq!(permitted(&data, "notes/outliner").unwrap_err(), "the folder must be an absolute path");
    }

    #[test]
    fn a_line_break_cannot_carry_a_second_folder_onto_the_allow_list() {
        let data = scratch("smuggle");
        let first = scratch("smuggle-folder");
        let second = std::env::temp_dir();
        let refused = "the folder path must not contain a line break or a NUL byte";
        for glue in ["\n", "\r\n", "\r", "\0"] {
            let dir = format!("{}{glue}{}", first.display(), second.display());
            assert_eq!(absolute(&dir).unwrap_err(), refused, "{dir:?}");
            assert_eq!(permitted(&data, &dir).unwrap_err(), refused, "{dir:?}");
            // `allow` refuses it on its own too, whoever calls it.
            assert_eq!(allow(&data, &dir).unwrap_err(), refused, "{dir:?}");
        }
        assert!(!data.join(ALLOWED).exists());
        assert!(!is_allowed(&data, second.to_str().unwrap()));
    }
}
