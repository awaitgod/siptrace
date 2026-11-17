use std::io::Write;
#[cfg(windows)]
use tauri::Manager;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
mod window_placement {
    use std::{fs, mem::size_of, path::PathBuf};
    use tauri::{Manager, WebviewWindow, Window, Wry};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, SetWindowPlacement, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, WINDOWPLACEMENT,
        WPF_RESTORETOMAXIMIZED,
    };

    fn path(window: &impl Manager<Wry>) -> Option<PathBuf> {
        Some(
            window
                .path()
                .app_config_dir()
                .ok()?
                .join("window-placement.txt"),
        )
    }

    pub fn restore(window: &WebviewWindow<Wry>) {
        let Some(path) = path(window) else { return };
        let Ok(contents) = fs::read_to_string(path) else {
            return;
        };
        let values: Option<Vec<i32>> = contents
            .split_whitespace()
            .map(|value| value.parse().ok())
            .collect();
        let Some(values) = values else { return };
        let [left, top, right, bottom, maximized] = values.as_slice() else {
            return;
        };
        if right <= left || bottom <= top {
            return;
        }
        let Ok(handle) = window.hwnd() else { return };
        let mut placement = WINDOWPLACEMENT {
            length: size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        // Win32 adjusts restored placement when the saved display is unavailable.
        placement.rcNormalPosition.left = *left;
        placement.rcNormalPosition.top = *top;
        placement.rcNormalPosition.right = *right;
        placement.rcNormalPosition.bottom = *bottom;
        placement.showCmd = if *maximized == 1 {
            SW_SHOWMAXIMIZED
        } else {
            SW_SHOWNORMAL
        } as u32;
        unsafe { SetWindowPlacement(handle.0 as _, &placement) };
    }

    pub fn save(window: &Window<Wry>) {
        let Some(path) = path(window) else { return };
        let Ok(handle) = window.hwnd() else { return };
        let mut placement = WINDOWPLACEMENT {
            length: size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        if unsafe { GetWindowPlacement(handle.0 as _, &mut placement) } == 0 {
            return;
        }
        let rect = placement.rcNormalPosition;
        let maximized = placement.showCmd == SW_SHOWMAXIMIZED as u32
            || placement.flags & WPF_RESTORETOMAXIMIZED != 0;
        if let Some(directory) = path.parent() {
            if fs::create_dir_all(directory).is_err() {
                return;
            }
        }
        let _ = fs::write(
            path,
            format!(
                "{} {} {} {} {}",
                rect.left,
                rect.top,
                rect.right,
                rect.bottom,
                u8::from(maximized)
            ),
        );
    }
}

#[tauri::command]
async fn export_text_file(
    window: WebviewWindow,
    filename: String,
    content: Option<String>,
    bytes: Option<Vec<u8>>,
    extension: String,
    description: String,
) -> Result<Option<String>, String> {
    let payload = bytes
        .or_else(|| content.map(String::into_bytes))
        .ok_or("Нет данных для экспорта")?;
    let selected = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Сохранить экспортируемый файл")
        .set_file_name(filename)
        .add_filter(description, &[&extension])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let directory = path
        .parent()
        .ok_or("Не удалось определить папку назначения")?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    file.write_all(&payload)
        .map_err(|error| error.to_string())?;
    file.persist(&path)
        .map_err(|error| error.error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                window_placement::restore(&window);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window_placement::save(window);
            }
        })
        .invoke_handler(tauri::generate_handler![export_text_file])
        .run(tauri::generate_context!())
        .expect("error while running SIPTrace");
}
