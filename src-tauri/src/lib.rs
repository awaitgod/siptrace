use std::io::Write;
use tauri::{LogicalSize, Size, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn set_module_window_size(window: WebviewWindow, is_launcher: bool) {
    if is_launcher {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(344.0, 266.0))));
        let _ = window.set_size(Size::Logical(LogicalSize::new(364.0, 268.0)));
        let _ = window.center();
    } else {
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(1024.0, 680.0))));
        let needs_expand = match (window.inner_size(), window.scale_factor()) {
            (Ok(phys), Ok(scale)) if scale > 0.0 => {
                let w = phys.width as f64 / scale;
                let h = phys.height as f64 / scale;
                w < 1024.0 || h < 680.0
            }
            _ => true,
        };
        if needs_expand {
            let _ = window.set_size(Size::Logical(LogicalSize::new(1280.0, 820.0)));
            let _ = window.center();
        }
    }
}

#[tauri::command]
async fn export_text_file(
    window: WebviewWindow,
    filename: String,
    content: String,
    extension: String,
    description: String,
) -> Result<Option<String>, String> {
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
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    file.persist(&path)
        .map_err(|error| error.error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_module_window_size,
            export_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running SIPTrace");
}
