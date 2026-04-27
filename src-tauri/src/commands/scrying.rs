use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
pub struct FileMetadata {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub created: u64,
    pub is_readonly: bool,
    pub extension: String,
    pub mime_guess: String,
    pub line_count: Option<u64>,
}

#[tauri::command]
pub fn extract_file_data(path: String) -> Result<String, String> {
    let mut cmd = Command::new("..\\sidecar\\.venv\\Scripts\\python.exe");
    cmd.arg("..\\sidecar\\extractor.py").arg("--path").arg(&path);
    
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd.output().map_err(|e| format!("Failed to spawn extractor: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn file_metadata(path: String) -> Result<FileMetadata, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("Cannot read metadata: {}", e))?;

    let modified = meta.modified().ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64).unwrap_or(0);

    let created = meta.created().ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64).unwrap_or(0);

    let ext = p.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mime_guess = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "rs" => "text/x-rust",
        "js" => "text/javascript",
        "py" => "text/x-python",
        "css" => "text/css",
        "html" => "text/html",
        "json" => "application/json",
        "toml" => "text/toml",
        "md" => "text/markdown",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }.to_string();

    // Count lines for text files under 2MB
    let line_count = if mime_guess.starts_with("text/") && meta.len() < 2 * 1024 * 1024 {
        fs::read_to_string(&p).ok().map(|s| s.lines().count() as u64)
    } else {
        None
    };

    Ok(FileMetadata {
        name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
        path,
        size: meta.len(),
        modified,
        created,
        is_readonly: meta.permissions().readonly(),
        extension: ext,
        mime_guess,
        line_count,
    })
}
