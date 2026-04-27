use std::process::{Command, Stdio};
use std::thread;
use std::io::{BufRead, BufReader};
use tauri::Manager;

pub fn spawn_sidecar(app_handle: tauri::AppHandle) {
    let pid = std::process::id().to_string();
    
    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from("."));

    // We try to run the sidecar via its venv
    let mut cmd = Command::new("..\\sidecar\\.venv\\Scripts\\python.exe");
    cmd.arg("..\\sidecar\\main.py").arg(&pid).arg(&home_dir);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.stdout(Stdio::piped());
    // Discard stderr or pipe it, we won't read it
    cmd.stderr(Stdio::null());

    match cmd.spawn() {
        Ok(mut child) => {
            let stdout = child.stdout.take().expect("Failed to grab sidecar stdout");
            let ah = app_handle.clone();
            
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(text) => {
                            // Forward JSON string payload directly
                            let _ = ah.emit_all("sidecar-telemetry", text);
                        }
                        Err(_) => break,
                    }
                }
                println!("[Sidecar] Process exited.");
                // Python sidecar will auto-kill itself when it detects parent PID is dead
                let _ = child.kill(); 
            });
        }
        Err(e) => {
            eprintln!("Failed to spawn Python sidecar: {}", e);
        }
    }
}
