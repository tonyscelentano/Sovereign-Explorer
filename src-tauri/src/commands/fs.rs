use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
pub struct DriveEntry {
    pub name: String,
    pub path: String,
    pub total_size: u64,
    pub free_space: u64,
}

#[tauri::command]
pub fn list_drives() -> Vec<DriveEntry> {
    use std::process::Command;

    let mut drives = Vec::new();
    
    // Using PowerShell Get-CimInstance is more modern and reliable than wmic
    let script = "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, Size, FreeSpace | ForEach-Object { \"$($_.DeviceID),$($_.VolumeName),$($_.FreeSpace),$($_.Size)\" }";
    
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", script]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    if let Ok(output) = cmd.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 4 {
                let drive_letter = parts[0].trim();
                let volume_name = parts[1].trim();
                let free_space = parts[2].trim().parse::<u64>().unwrap_or(0);
                let total_size = parts[3].trim().parse::<u64>().unwrap_or(0);

                let display_name = if volume_name.is_empty() {
                    format!("Local Disk ({})", drive_letter)
                } else {
                    format!("{} ({})", volume_name, drive_letter)
                };

                drives.push(DriveEntry {
                    name: display_name,
                    path: format!("{}\\", drive_letter),
                    total_size,
                    free_space,
                });
            }
        }
    }
    
    drives
}

/// A single file or directory entry returned to the frontend.
#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// Milliseconds since UNIX epoch (JS-friendly)
    pub modified: u64,
    pub extension: String,
}

/// Read a directory and return its immediate children.
#[tauri::command]
pub fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    if path.is_empty() || path == "this-pc" {
        let drives = list_drives();
        return Ok(drives.into_iter().map(|d| FileEntry {
            name: d.name,
            path: d.path,
            is_dir: true,
            size: d.total_size,
            modified: 0,
            extension: "drive".to_string(),
        }).collect());
    }

    let dir = PathBuf::from(&path);

    if !dir.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Cannot read {}: {}", path, e))?;

    for item in read_dir {
        let item = match item {
            Ok(i) => i,
            Err(_) => continue, // skip entries we can't access
        };

        let metadata = match item.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_name = item.file_name().to_string_lossy().to_string();

        // Conditionally skip hidden/system files starting with '.'
        if !show_hidden && file_name.starts_with('.') {
            continue;
        }

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let extension = item
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        entries.push(FileEntry {
            name: file_name,
            path: item.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
            extension,
        });
    }

    // Folders first, then alphabetical within each group
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Return the user's home directory as a starting point.
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

#[tauri::command]
pub fn create_dir(name: String) -> Result<(), String> {
    fs::create_dir_all(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(name: String) -> Result<(), String> {
    let path = PathBuf::from(&name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&name).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copy_files(sources: Vec<String>, dest_folder: String) -> Result<(), String> {
    for src in sources {
        let src_path = PathBuf::from(&src);
        if let Some(name) = src_path.file_name() {
            let mut dest_path = PathBuf::from(&dest_folder).join(name);
            
            // If destination already exists, generate a unique " - Copy" name
            if dest_path.exists() {
                dest_path = generate_unique_path(&dest_path);
            }

            // Handle both files and directories
            if src_path.is_dir() {
                copy_dir_recursive(&src_path, &dest_path)?;
            } else {
                fs::copy(&src_path, &dest_path).map_err(|e| format!("Failed to copy {}: {}", src, e))?;
            }
        }
    }
    Ok(())
}

fn generate_unique_path(path: &PathBuf) -> PathBuf {
    let fallback = std::path::Path::new(".");
    let parent = path.parent().unwrap_or(fallback);
    let file_stem = path.file_stem().map(|s| s.to_string_lossy()).unwrap_or_default();
    let extension = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    
    // First try: "filename - Copy.ext"
    let mut new_path = parent.join(format!("{} - Copy{}", file_stem, extension));
    
    // Subsequent tries: "filename - Copy (2).ext", etc.
    let mut counter = 2;
    while new_path.exists() {
        new_path = parent.join(format!("{} - Copy ({}){}", file_stem, counter, extension));
        counter += 1;
    }
    
    new_path
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_files(sources: Vec<String>, dest_folder: String) -> Result<(), String> {
    for src in sources {
        let src_path = PathBuf::from(&src);
        if let Some(name) = src_path.file_name() {
            let dest_path = PathBuf::from(&dest_folder).join(name);
            
            // If source and destination are the same, skip
            if src_path == dest_path {
                continue;
            }

            fs::rename(&src_path, &dest_path).map_err(|e| format!("Failed to move {}: {}", src, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_theme_icons(app_handle: tauri::AppHandle, theme_name: String) -> Result<Vec<String>, String> {
    let patterns = vec![
        "../src/assets/themes/IconPacks",
        "src/assets/themes/IconPacks",
        "assets/themes/IconPacks",
    ];

    let mut theme_path = None;
    for pattern in patterns {
        if let Some(mut path) = app_handle.path_resolver().resolve_resource(pattern) {
            path.push(&theme_name);
            if path.exists() && path.is_dir() {
                theme_path = Some(path);
                break;
            }
        }
    }

    let theme_path = theme_path.ok_or_else(|| "Could not resolve theme folder".to_string())?;
    
    // Check webp first, then ico
    let mut icons_dir = theme_path.join("webp");
    if !icons_dir.exists() {
        icons_dir = theme_path.join("ico");
    }

    if !icons_dir.exists() {
        return Ok(Vec::new());
    }

    let mut icons = Vec::new();
    if let Ok(entries) = std::fs::read_dir(icons_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".webp") || name.ends_with(".ico") {
                        icons.push(name);
                    }
                }
            }
        }
    }
    
    // Sort logically (Icon-001 before Icon-010)
    icons.sort();
    Ok(icons)
}

#[tauri::command]
pub fn list_icon_packs(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    // Try multiple resolution patterns to handle dev/prod and absolute/relative path quirks
    let patterns = vec![
        "../src/assets/themes/IconPacks",
        "src/assets/themes/IconPacks",
        "assets/themes/IconPacks",
    ];

    let mut resource_path = None;
    for pattern in patterns {
        if let Some(path) = app_handle.path_resolver().resolve_resource(pattern) {
            if path.exists() && path.is_dir() {
                resource_path = Some(path);
                break;
            }
        }
    }

    let resource_path = resource_path.ok_or_else(|| "Could not resolve IconPacks resource folder after trying multiple patterns".to_string())?;

    let mut packs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(resource_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    // We only want folders that contain an 'ico' folder (basic validation)
                    if entry.path().join("ico").exists() {
                        packs.push(name);
                    }
                }
            }
        }
    }
    
    if packs.is_empty() {
        return Err("IconPacks folder found but no valid pack subfolders (containing 'ico') were detected.".to_string());
    }

    packs.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(packs)
}

/// Send one or more paths to the OS recycle bin / trash.
#[tauri::command]
pub fn delete_items(paths: Vec<String>) -> Result<(), String> {
    trash::delete_all(&paths).map_err(|e| format!("Delete failed: {}", e))
}

/// Rename a file or directory within its current parent folder.
#[tauri::command]
pub fn rename_item(old_path: String, new_name: String) -> Result<(), String> {
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("New name cannot contain path separators".to_string());
    }
    let src = PathBuf::from(&old_path);
    let dest = src
        .parent()
        .ok_or_else(|| format!("Cannot determine parent of: {}", old_path))?
        .join(&new_name);
    fs::rename(&src, &dest).map_err(|e| format!("Cannot rename: {}", e))
}

/// Open a file or directory with its default OS handler.
/// Tries 'pwsh' then 'powershell', uses 'Invoke-Item -LiteralPath' for safety.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let escaped = path.replace('\'', "''");
    let script = format!("Invoke-Item -LiteralPath '{}'", escaped);

    // Try pwsh first, then powershell
    let shell = if std::process::Command::new("pwsh").arg("-Command").arg("exit").status().is_ok() {
        "pwsh"
    } else {
        "powershell"
    };

    let mut cmd = std::process::Command::new(shell);
    cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.spawn().map_err(|e| format!("Cannot open {}: {}", path, e))?;
    Ok(())
}

#[derive(Serialize)]
pub struct OpenWithHandler {
    pub name: String,
    pub cmd: String,
}

/// Query the Windows registry via PowerShell for apps associated with a file extension.
#[tauri::command]
pub fn get_open_with_handlers(extension: String) -> Result<Vec<OpenWithHandler>, String> {
    if extension.is_empty() { return Ok(Vec::new()); }
    
    let ext = if extension.starts_with('.') { extension } else { format!(".{}", extension) };
    
    // PowerShell script to find associated apps for an extension
    let script = format!(r#"
        $ext = "{}"
        $handlers = @()
        
        # 1. Check User Choice
        $progId = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\UserChoice" -ErrorAction SilentlyContinue).ProgId
        if ($progId) {{
            $cmd = (Get-ItemProperty "HKCR:\$progId\shell\open\command" -ErrorAction SilentlyContinue)."(default)"
            if ($cmd) {{ $handlers += [PSCustomObject]@{{ name = "Default App ($progId)"; cmd = $cmd }} }}
        }}

        # 2. Check OpenWithList
        $list = Get-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList" -ErrorAction SilentlyContinue
        if ($list) {{
            $list.Property | ForEach-Object {{
                $val = $list.GetValue($_)
                if ($val -match "\.exe$") {{
                    $handlers += [PSCustomObject]@{{ name = $val; cmd = $val }}
                }}
            }}
        }}

        $handlers | ConvertTo-Json -Compress
    "#, ext);

    let shell = if std::process::Command::new("pwsh").arg("-Command").arg("exit").status().is_ok() { "pwsh" } else { "powershell" };
    let mut cmd = std::process::Command::new(shell);
    cmd.args(["-NoProfile", "-Command", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    if stdout.trim().is_empty() { return Ok(Vec::new()); }

    // Minimal JSON parsing or just return the raw string if complex.
    // For now, let's assume we can parse it into our struct.
    let results: serde_json::Value = serde_json::from_str(&stdout).unwrap_or(serde_json::Value::Array(vec![]));
    
    let mut final_handlers = Vec::new();
    if let Some(arr) = results.as_array() {
        for item in arr {
            if let (Some(name), Some(cmd)) = (item["name"].as_str(), item["cmd"].as_str()) {
                final_handlers.push(OpenWithHandler {
                    name: name.to_string(),
                    cmd: cmd.to_string(),
                });
            }
        }
    } else if let Some(obj) = results.as_object() {
        // Handle single object return
         if let (Some(name), Some(cmd)) = (obj["name"].as_str(), obj["cmd"].as_str()) {
                final_handlers.push(OpenWithHandler {
                    name: name.to_string(),
                    cmd: cmd.to_string(),
                });
            }
    }

    Ok(final_handlers)
}

#[tauri::command]
pub fn open_path_with(path: String, cmd_template: String) -> Result<(), String> {
    // cmd_template is often something like: "C:\Path\To\App.exe" "%1"
    let cmd_part = cmd_template.replace("\"%1\"", "").replace("%1", "").trim().to_string();
    
    let mut cmd = std::process::Command::new(cmd_part);
    cmd.arg(&path);
    
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.spawn().map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}

/// Reveal a file or directory in Windows Explorer (opens parent and selects it).
#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    let mut cmd = std::process::Command::new("explorer.exe");
    cmd.arg(format!("/select,\"{}\"", path));

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.spawn().map_err(|e| format!("Cannot show {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
pub fn list_plugin_files(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    // In dev mode, resolve_resource might fail if the folder isn't explicitly in tauri.conf.json resources.
    // We'll try resolve_resource first, then fallback to relative path from executable.
    let ext_dir = app_handle.path_resolver().resolve_resource("../src/js/extensions")
        .or_else(|| app_handle.path_resolver().resolve_resource("src/js/extensions"))
        // Fallback: look for src/js/extensions relative to current working directory (useful for tauri dev)
        .or_else(|| {
            let mut path = std::env::current_dir().ok()?;
            path.push("src/js/extensions");
            if path.exists() { Some(path) } else { None }
        })
        // Fallback: if we are in src-tauri, go up one and into src
        .or_else(|| {
            let mut path = std::env::current_dir().ok()?;
            if path.ends_with("src-tauri") {
                path.pop();
                path.push("src/js/extensions");
                if path.exists() { Some(path) } else { None }
            } else { None }
        })
        .ok_or_else(|| "Could not resolve extensions folder".to_string())?;

    println!("[Rust] Extensions directory resolved to: {:?}", ext_dir);

    if !ext_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(ext_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".js") && name != "registry.js" {
                        files.push(name);
                    }
                }
            }
        }
    }
    
    files.sort();
    Ok(files)
}
