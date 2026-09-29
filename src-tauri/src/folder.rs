//! The folder backend's disk side: read `outliner.json` and its conflict
//! copies, and replace it only if it still holds what was read.
//!
//! Plain `std` on purpose, so this file compiles and tests on its own
//! (`rustc --edition 2021 --test src/folder.rs`) without the Tauri crates.
//!
//! Nothing here looks inside a file. Parsing, validation and the merge all
//! happen in the web code (`src/sync/api/remote/file.ts`), the same code a
//! browser runs — the shell moves bytes and nothing else (DESIGN.md
//! principle 20). That is also why a sealed workspace needs no special case.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// The one file the backend owns.
pub const CANONICAL: &str = "outliner.json";

/// Refuses to read something that cannot be a workspace, rather than load it into memory.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Read–compare–write is one step for every writer in this process.
static WRITES: Mutex<()> = Mutex::new(());

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
/// `outliner.sync-conflict-….json`, OneDrive `outliner-MACHINE.json`.
pub fn is_copy(name: &str) -> bool {
    if name == CANONICAL || name.contains('/') || name.contains('\\') {
        return false;
    }
    let Some(rest) = name.strip_prefix("outliner") else {
        return false;
    };
    name.ends_with(".json") && rest.len() > ".json".len() && matches!(rest.chars().next(), Some(' ' | '.' | '-' | '(' | '_'))
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

/// Replaces the canonical file with `text` if it still has the stamp
/// `expect` (`None` = expected to be absent). `Ok(None)` means it moved on and
/// the caller should pull and merge again.
///
/// After a successful write, removes the listed conflict copies: their content
/// was merged into `text` by the caller. Only names that look like copies are
/// touched, so a bad argument cannot delete anything else in the folder.
pub fn write(dir: &Path, text: &str, expect: Option<&str>, remove: &[String]) -> Result<Option<String>, String> {
    let _held = WRITES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let target = dir.join(CANONICAL);
    let current = read_entry(&target, CANONICAL)?.map(|entry| entry.stamp);
    if current.as_deref() != expect {
        return Ok(None);
    }

    fs::create_dir_all(dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    // Write beside, then rename: a reader (or the sync service) never sees
    // half a workspace, and a crash mid-write leaves the previous file intact.
    // The leading dot keeps most sync services from uploading the temporary.
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let temporary: PathBuf = dir.join(format!(".{CANONICAL}.{}.{nanos}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary, &target)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(format!("cannot write {CANONICAL}: {error}"));
    }

    for name in remove {
        if is_copy(name) {
            let _ = fs::remove_file(dir.join(name));
        }
    }
    Ok(Some(stamp(text.as_bytes())))
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

    #[test]
    fn recognises_the_copies_sync_services_make() {
        for name in [
            "outliner (Jade's conflicted copy 2026-09-29).json",
            "outliner (1).json",
            "outliner 2.json",
            "outliner.sync-conflict-20260929-101010-ABCDEFG.json",
            "outliner-MACBOOK.json",
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
    fn removes_merged_copies_and_nothing_else() {
        let dir = scratch("copies");
        fs::write(dir.join("outliner (1).json"), "{}").unwrap();
        fs::write(dir.join("keep.json"), "{}").unwrap();
        let read1 = read(&dir).unwrap();
        assert_eq!(read1.copies.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["outliner (1).json"]);

        let names = vec!["outliner (1).json".to_string(), "keep.json".to_string(), "../outliner (2).json".to_string()];
        write(&dir, "{}", None, &names).unwrap().unwrap();
        assert!(!dir.join("outliner (1).json").exists());
        assert!(dir.join("keep.json").exists());
        // No temporary is left behind.
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).collect();
        assert!(leftovers.is_empty());
    }
}
