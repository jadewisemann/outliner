//! The native shell: the same static build as the web app, in a system
//! webview, with a handful of commands a browser tab cannot offer.
//!
//! What lives here is deliberately small (DESIGN.md principle 20). The shell
//! reads and writes bytes, opens the system browser, and brings its window
//! forward; it never parses, validates or merges notes. Those stay in the web
//! code, which is the one implementation every platform runs.

mod folder;

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
struct NativeInfo {
    mobile: bool,
    os: &'static str,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    text: String,
    stamp: String,
}

#[derive(Serialize)]
struct FolderRead {
    canonical: Option<Entry>,
    copies: Vec<Entry>,
}

impl From<folder::Entry> for Entry {
    fn from(entry: folder::Entry) -> Self {
        Entry { name: entry.name, text: entry.text, stamp: entry.stamp }
    }
}

#[tauri::command]
fn native_info() -> NativeInfo {
    NativeInfo { mobile: cfg!(mobile), os: std::env::consts::OS }
}

/// Only web and mail links: anything else handed to the OS opener could start a program.
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err("only http, https and mailto links open outside".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|error| error.to_string())
}

/// An absolute folder, or an error for anything that is not one.
fn folder_path(dir: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(dir);
    if !path.is_absolute() {
        return Err("the folder must be an absolute path".into());
    }
    Ok(path)
}

// Async so the disk work runs off the main thread: a slow network drive must
// not freeze the window.
#[tauri::command]
async fn folder_read(dir: String) -> Result<FolderRead, String> {
    let read = folder::read(&folder_path(&dir)?)?;
    Ok(FolderRead {
        canonical: read.canonical.map(Entry::from),
        copies: read.copies.into_iter().map(Entry::from).collect(),
    })
}

#[tauri::command]
async fn folder_write(dir: String, text: String, expect: Option<String>, remove: Vec<String>) -> Result<Option<String>, String> {
    folder::write(&folder_path(&dir)?, &text, expect.as_deref(), &remove)
}

#[cfg(desktop)]
#[tauri::command]
async fn folder_pick(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title("동기화할 폴더").blocking_pick_folder();
    match picked {
        None => Ok(None),
        Some(path) => path.into_path().map(|p| Some(p.to_string_lossy().into_owned())).map_err(|e| e.to_string()),
    }
}

/// A phone hands out content URIs, not paths, so there is no folder to pick.
#[cfg(mobile)]
#[tauri::command]
async fn folder_pick() -> Result<Option<String>, String> {
    Err("folders are a desktop feature".into())
}

/// A system-wide key that brings the window forward from anywhere — the
/// keyboard way back into the app, since there is no dock click in a
/// keyboard-only workflow. ⌘⌥O on macOS, Ctrl+Alt+O elsewhere. A key that
/// another program already holds is skipped rather than failing start-up.
#[cfg(desktop)]
fn summon_shortcut(app: &tauri::App) -> tauri::Result<()> {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    app.handle().plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

    let primary = if cfg!(target_os = "macos") { Modifiers::SUPER } else { Modifiers::CONTROL };
    let shortcut = Shortcut::new(Some(primary | Modifiers::ALT), Code::KeyO);
    let registered = app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
    if let Err(error) = registered {
        eprintln!("outliner: global shortcut unavailable: {error}");
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_dialog::init()).setup(|app| {
        summon_shortcut(app)?;
        Ok(())
    });

    builder
        .invoke_handler(tauri::generate_handler![native_info, open_external, folder_read, folder_write, folder_pick])
        .run(tauri::generate_context!())
        .expect("error while running the outliner shell");
}
