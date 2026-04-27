// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            commands::sidecar::spawn_sidecar(app.handle());
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                println!("[Tauri] Window closing — initiating process cleanup...");
                commands::pty::cleanup_all_processes();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::list_drives,
            commands::fs::list_directory,
            commands::fs::get_home_dir,
            commands::fs::create_dir,
            commands::fs::create_file,
            commands::fs::copy_files,
            commands::fs::move_files,
            commands::fs::delete_items,
            commands::fs::rename_item,
            commands::fs::open_path,
            commands::fs::get_open_with_handlers,
            commands::fs::open_path_with,
            commands::fs::show_in_folder,
            commands::fs::list_plugin_files,
            commands::fs::list_icon_packs,
            commands::fs::list_theme_icons,
            commands::scrying::extract_file_data,
            commands::scrying::file_metadata,
            commands::pty::spawn_persistent_shell,
            commands::pty::spawn_command,
            commands::pty::kill_command,
            commands::pty::send_input,
            commands::pty::close_stdin,
            commands::pty::resize_pty,
            commands::fonts::get_system_fonts
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Failed to run tauri application: {}", e);
            std::process::exit(1);
        });
}
