use tauri::{LogicalSize, Size, WebviewWindow};

#[tauri::command]
fn set_module_window_size(window: WebviewWindow, is_launcher: bool) {
    if is_launcher {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(390.0, 580.0))));
        let _ = window.set_size(Size::Logical(LogicalSize::new(414.0, 648.0)));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_module_window_size])
        .run(tauri::generate_context!())
        .expect("error while running SIPTrace");
}
