#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::Write, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::{Update, UpdaterExt};

type Prepared = (Update, Vec<u8>);

struct Updater {
    status: &'static str,
    busy: bool,
    closing: bool,
    prepared: Option<Prepared>,
}

impl Default for Updater {
    fn default() -> Self {
        Self {
            status: "次回の更新確認を待っています。",
            busy: false,
            closing: false,
            prepared: None,
        }
    }
}

#[tauri::command]
fn desktop_update_status(state: State<'_, Mutex<Updater>>) -> (bool, &'static str) {
    let state = state.lock().unwrap();
    (state.prepared.is_some(), state.status)
}

async fn download_update(app: &AppHandle) -> tauri_plugin_updater::Result<Option<Prepared>> {
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(45))
        .restart_after_install(false)
        .build()?;
    let Some(update) = updater.check().await? else {
        return Ok(None);
    };
    app.state::<Mutex<Updater>>().lock().unwrap().status = "新版を取得しています。";
    let installer = update.download(|_, _| {}, || {}).await?;
    Ok(Some((update, installer)))
}

#[tauri::command]
async fn check_desktop_update(app: AppHandle) {
    let updater = app.state::<Mutex<Updater>>();
    {
        let mut state = updater.lock().unwrap();
        if state.busy || state.closing || state.prepared.is_some() {
            return;
        }
        state.busy = true;
        state.status = "更新を確認しています。";
    }
    let result = download_update(&app).await;
    let mut state = updater.lock().unwrap();
    state.busy = false;
    state.status = match result {
        Ok(Some(prepared)) => {
            state.prepared = Some(prepared);
            "新版を取得しました。ゲームを閉じると更新します。"
        }
        Ok(None) => "最新版を使用しています。",
        Err(_) => "更新を確認または取得できませんでした。次回の確認時に再試行します。",
    };
}

#[tauri::command]
fn apply_prepared_update(app: AppHandle) -> Result<(), String> {
    let updater = app.state::<Mutex<Updater>>();
    let (update, installer) = {
        let mut state = updater.lock().unwrap();
        if !state.closing {
            return Err("The window is not closing.".into());
        }
        state.prepared.take().ok_or("No downloaded update.")?
    };
    if let Err(error) = update.install(installer) {
        let mut state = updater.lock().unwrap();
        state.closing = false;
        state.status = "更新を適用できませんでした。";
        return Err(error.to_string());
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn cancel_update_close(state: State<'_, Mutex<Updater>>) {
    let mut state = state.lock().unwrap();
    state.closing = false;
    state.prepared = None;
    state.status = "更新を適用できませんでした。";
}

#[tauri::command]
async fn export_game_save(
    app: AppHandle,
    window: WebviewWindow,
    contents: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(destination) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("セーブの書き出し")
            .set_file_name("little-town-chronicles-save.json")
            .add_filter("セーブファイル（JSON）", &["json"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = destination.into_path().map_err(|error| error.to_string())?;
        let parent = path.parent().ok_or("The save path has no parent folder.")?;
        // Replace an existing backup only after the new export has been written.
        let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
        file.write_all(contents.as_bytes()).map_err(|error| error.to_string())?;
        file.persist(&path).map_err(|error| error.to_string())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Updater::default()))
        .invoke_handler(tauri::generate_handler![
            desktop_update_status,
            check_desktop_update,
            apply_prepared_update,
            cancel_update_close,
            export_game_save
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(2)).await;
                loop {
                    check_desktop_update(handle.clone()).await;
                    tokio::time::sleep(Duration::from_secs(4 * 60 * 60)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let WindowEvent::CloseRequested { api, .. } = event else { return };
            let app = window.app_handle();
            let updater = app.state::<Mutex<Updater>>();
            {
                let mut state = updater.lock().unwrap();
                if state.closing {
                    api.prevent_close();
                    return;
                }
                if state.prepared.is_none() {
                    return;
                }
                state.closing = true;
            }
            let dispatched = app.get_webview_window("main")
                .is_some_and(|view| view.eval("window.journeyApplyPreparedUpdate()").is_ok());
            if !dispatched {
                updater.lock().unwrap().closing = false;
                return;
            }
            api.prevent_close();
            let handle = app.clone();
            // If the game view cannot acknowledge the save, leave the update for a later launch.
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                let updater = handle.state::<Mutex<Updater>>();
                let timed_out = {
                    let mut state = updater.lock().unwrap();
                    if state.closing && state.prepared.is_some() {
                        state.closing = false;
                        true
                    } else {
                        false
                    }
                };
                if timed_out {
                    handle.exit(0);
                }
            });
        })
        .run(tauri::generate_context!())
        .expect("Could not launch Little Town Chronicles");
}
