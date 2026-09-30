//! The native shell: the same static build as the web app, in a system
//! webview, with a handful of commands a browser tab cannot offer.
//!
//! What lives here is deliberately small (DESIGN.md principle 20). The shell
//! reads and writes bytes (the folder backend's file, and the app's own
//! replica of the workspace), opens the system browser, and brings its window
//! forward; it never parses, validates or merges notes. Those stay in the web
//! code, which is the one implementation every platform runs.

mod folder;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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

impl From<folder::Read> for FolderRead {
    fn from(read: folder::Read) -> Self {
        FolderRead {
            canonical: read.canonical.map(Entry::from),
            copies: read.copies.into_iter().map(Entry::from).collect(),
        }
    }
}

#[derive(Deserialize)]
struct Seen {
    name: String,
    stamp: String,
}

impl From<Seen> for folder::Seen {
    fn from(copy: Seen) -> Self {
        folder::Seen { name: copy.name, stamp: copy.stamp }
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

/// The app's data folder: the replica and the allow list live here. Per-user
/// and per-app on every platform, and removed with the app.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|error| error.to_string())
}

/// Disk work runs on the blocking pool: a slow network folder must neither
/// freeze the window nor tie up the async workers that carry other commands.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())?
}

/// Runs `work` on the folder the page named, if the person allowed it: the
/// gate is `folder::permitted`, and only `folder_pick` and `folder_allow` can
/// allow a folder. Reading the allow list is disk work too, so it runs on the
/// blocking pool along with `work`.
async fn in_folder<T: Send + 'static>(
    app: tauri::AppHandle,
    dir: String,
    work: impl FnOnce(&Path) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    // A name that can never be allowed is refused before anything is looked up.
    folder::absolute(&dir)?;
    let data = data_dir(&app)?;
    blocking(move || {
        let path = folder::permitted(&data, &dir)?;
        work(&path)
    })
    .await
}

#[tauri::command]
async fn folder_read(app: tauri::AppHandle, dir: String) -> Result<FolderRead, String> {
    in_folder(app, dir, |path| folder::read(path).map(FolderRead::from)).await
}

#[tauri::command]
async fn folder_write(
    app: tauri::AppHandle,
    dir: String,
    text: String,
    expect: Option<String>,
    retire: Vec<Seen>,
) -> Result<Option<String>, String> {
    let retire: Vec<folder::Seen> = retire.into_iter().map(folder::Seen::from).collect();
    in_folder(app, dir, move |path| folder::write(path, &text, expect.as_deref(), &retire)).await
}

/// Moves copies whose content the canonical file already holds; returns the
/// names it could not move.
#[tauri::command]
async fn folder_retire(app: tauri::AppHandle, dir: String, copies: Vec<Seen>) -> Result<Vec<String>, String> {
    let copies: Vec<folder::Seen> = copies.into_iter().map(folder::Seen::from).collect();
    in_folder(app, dir, move |path| Ok(folder::retire(path, &copies))).await
}

#[tauri::command]
async fn folder_set_aside(app: tauri::AppHandle, dir: String, expect: String) -> Result<bool, String> {
    in_folder(app, dir, move |path| folder::set_aside(path, &expect)).await
}

/// Async like every command that waits: a command without `async` runs on the
/// main thread, and a blocking dialog there waits on the event loop it blocks.
#[cfg(desktop)]
#[tauri::command]
async fn folder_pick(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title("동기화할 폴더").blocking_pick_folder();
    let Some(path) = picked else { return Ok(None) };
    let dir = path.into_path().map_err(|error| error.to_string())?.to_string_lossy().into_owned();
    let data = data_dir(&app)?;
    // Picking is the person's say-so.
    blocking(move || {
        folder::allow(&data, &dir)?;
        Ok(Some(dir))
    })
    .await
}

/// A phone hands out content URIs, not paths, so there is no folder to pick.
#[cfg(mobile)]
#[tauri::command]
async fn folder_pick() -> Result<Option<String>, String> {
    Err("folders are a desktop feature".into())
}

/// Allows a typed-in folder after the person confirms it in a native dialog
/// the page cannot draw or click. True if the folder is (now) allowed.
#[cfg(desktop)]
#[tauri::command]
async fn folder_allow(app: tauri::AppHandle, dir: String) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    folder::absolute(&dir)?;
    let data = data_dir(&app)?;
    let (known_data, known_dir) = (data.clone(), dir.clone());
    if blocking(move || Ok(folder::is_allowed(&known_data, &known_dir))).await? {
        return Ok(true);
    }
    let yes = app
        .dialog()
        .message(format!("이 폴더에 outliner.json을 두고 동기화합니다.\n\n{dir}"))
        .title("폴더 동기화 허용")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();
    if yes {
        blocking(move || folder::allow(&data, &dir)).await?;
    }
    Ok(yes)
}

#[cfg(mobile)]
#[tauri::command]
async fn folder_allow() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
async fn replica_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    blocking(move || folder::replica_read(&dir)).await
}

#[tauri::command]
async fn replica_write(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    blocking(move || folder::replica_write(&dir, &text)).await
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
        .invoke_handler(tauri::generate_handler![
            native_info,
            open_external,
            folder_read,
            folder_write,
            folder_retire,
            folder_set_aside,
            folder_pick,
            folder_allow,
            replica_read,
            replica_write
        ])
        .run(tauri::generate_context!())
        .expect("error while running the outliner shell");
}
