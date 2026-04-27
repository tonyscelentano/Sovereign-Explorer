use serde_json::json;
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use tauri::Manager;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

// ─── Global Process Registry ────────────────────────────────────────────────
static ACTIVE_PROCESSES: once_cell::sync::Lazy<Mutex<HashMap<String, Box<dyn portable_pty::Child + Send>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

// ─── Separated Stdin Registry ───────────────────────────────────────────────
static ACTIVE_STDIN: once_cell::sync::Lazy<Mutex<HashMap<String, Box<dyn Write + Send>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

// ─── Master PTY Registry ────────────────────────────────────────────────────
static ACTIVE_PTY_MASTER: once_cell::sync::Lazy<Mutex<HashMap<String, Box<dyn portable_pty::MasterPty + Send>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

fn get_lock<T>(m: &'static Mutex<T>) -> Result<MutexGuard<'static, T>, String> {
    m.lock().map_err(|e| format!("Lock poisoned: {}", e))
}

#[tauri::command]
pub fn spawn_persistent_shell(task_id: String, shell: String, cwd: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let pty_system = native_pty_system();
    
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Failed to create PTY pair: {}", e))?;

    let shell_bin = match shell.as_str() {
        "pwsh" => "pwsh.exe",
        "cmd" => "cmd.exe",
        _ => "powershell.exe",
    };

    let cmd = CommandBuilder::new(&shell_bin);
    let mut cmd = cmd;
    cmd.cwd(&cwd);

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn persistent shell: {}", e))?;

    let master = pair.master;
    let reader = master.try_clone_reader().map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = master.take_writer().map_err(|e| format!("Failed to take writer: {}", e))?;

    let tid = task_id.clone();

    {
        let mut handles = get_lock(&ACTIVE_STDIN)?;
        handles.insert(tid.clone(), writer);
        let mut masters = get_lock(&ACTIVE_PTY_MASTER)?;
        masters.insert(tid.clone(), master);
        let mut procs = get_lock(&ACTIVE_PROCESSES)?;
        procs.insert(tid.clone(), child);
    }

    let tid_out = tid.clone();
    let ah_out = app_handle.clone();
    thread::spawn(move || {
        let mut buf_reader = BufReader::new(reader);
        let mut buffer = [0u8; 4096];

        loop {
            match buf_reader.read(&mut buffer) {
                Ok(0) => break, 
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buffer[..n]);
                    let _ = ah_out.emit_all("terminal-output", json!({
                        "taskId": tid_out,
                        "stream": "stdout",
                        "line": text.to_string(),
                        "is_pty": true
                    }));
                }
                Err(_) => break,
            }
        }
        
        let exit_code = {
            if let Ok(mut procs) = get_lock(&ACTIVE_PROCESSES) {
                if let Some(mut c) = procs.remove(&tid_out) {
                    c.wait().ok().map(|s| s.exit_code() as i32).unwrap_or(0)
                } else { -1 }
            } else { -1 }
        };

        if let Ok(mut handles) = get_lock(&ACTIVE_STDIN) { handles.remove(&tid_out); }
        if let Ok(mut masters) = get_lock(&ACTIVE_PTY_MASTER) { masters.remove(&tid_out); }

        let _ = ah_out.emit_all("terminal-output", json!({
            "taskId": tid_out,
            "stream": "exit",
            "code": exit_code
        }));
    });

    Ok(task_id)
}

#[tauri::command]
pub fn spawn_command(task_id: String, shell: String, args: String, cwd: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let pty_system = native_pty_system();
    
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Failed to create PTY pair: {}", e))?;

    let shell_bin = match shell.as_str() {
        "pwsh" => "pwsh.exe",
        "cmd" => "cmd.exe",
        _ => "powershell.exe",
    };

    let flag = if shell == "cmd" { "/c" } else { "-c" };

    let mut cmd = CommandBuilder::new(&shell_bin);
    cmd.arg(&flag);
    cmd.arg(&args);
    cmd.cwd(&cwd);

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command inside PTY: {}", e))?;

    let master = pair.master;
    let reader = match master.try_clone_reader() {
        Ok(r) => r,
        Err(_) => return Err("Failed to clone PTY reader".to_string()),
    };

    let writer = match master.take_writer() {
        Ok(w) => w,
        Err(_) => return Err("Failed to take PTY writer".to_string()),
    };

    let tid = task_id.clone();

    // Store the master writer
    {
        let mut handles = get_lock(&ACTIVE_STDIN).map_err(|e| e.to_string())?;
        handles.insert(tid.clone(), writer);
    }
    
    {
        let mut masters = get_lock(&ACTIVE_PTY_MASTER).map_err(|e| e.to_string())?;
        masters.insert(tid.clone(), master);
    }

    {
        let mut procs = get_lock(&ACTIVE_PROCESSES).map_err(|e| e.to_string())?;
        procs.insert(tid.clone(), child);
    }

    // Stream PTY output
    let tid_out = tid.clone();
    let ah_out = app_handle.clone();
    thread::spawn(move || {
        let mut buf_reader = BufReader::new(reader);
        let mut buffer = [0u8; 1024];

        loop {
            match buf_reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buffer[..n]);
                    let _ = ah_out.emit_all("terminal-output", json!({
                        "taskId": tid_out,
                        "stream": "stdout",
                        "line": text.to_string(),
                        "is_pty": true
                    }));
                }
                Err(_) => break,
            }
        }
        
        let exit_code = {
            if let Ok(mut procs) = get_lock(&ACTIVE_PROCESSES) {
                let tid_for_cleanup = tid_out.clone();
                if let Some(mut c) = procs.remove(&tid_for_cleanup) {
                    c.wait().ok().map(|s| s.exit_code() as i32).unwrap_or(0)
                } else {
                    -1 // Already killed
                }
            } else { -1 }
        };

        let tid_for_cleanup = tid_out.clone();
        {
            if let Ok(mut handles) = get_lock(&ACTIVE_STDIN) { handles.remove(&tid_for_cleanup); }
            if let Ok(mut masters) = get_lock(&ACTIVE_PTY_MASTER) { masters.remove(&tid_for_cleanup); }
        }

        let _ = ah_out.emit_all("terminal-output", json!({
            "taskId": tid_for_cleanup,
            "stream": "exit",
            "code": exit_code
        }));
    });

    Ok(task_id)
}

#[tauri::command]
pub fn kill_command(task_id: String) -> Result<(), String> {
    // Drop stdin first (broken pipe signals the child before hard-kill)
    {
        let mut handles = ACTIVE_STDIN.lock().unwrap();
        handles.remove(&task_id);
    }
    let mut procs = ACTIVE_PROCESSES.lock().unwrap();
    if let Some(mut child) = procs.remove(&task_id) {
        child.kill().map_err(|e| format!("Kill failed: {}", e))?;
        Ok(())
    } else {
        Err(format!("No active process with taskId: {}", task_id))
    }
}

pub fn cleanup_all_processes() {
    // 1. Drop all stdin handles first
    {
        let mut handles = ACTIVE_STDIN.lock().unwrap();
        handles.clear();
    }
    
    // 2. Kill all active child processes
    {
        let mut procs = ACTIVE_PROCESSES.lock().unwrap();
        for (id, mut child) in procs.drain() {
            println!("[PTY] Cleaning up taskId: {}", id);
            let _ = child.kill();
        }
    }

    // 3. Drop all master PTY handles
    {
        let mut masters = ACTIVE_PTY_MASTER.lock().unwrap();
        masters.clear();
    }
}

#[tauri::command]
pub fn send_input(task_id: String, input: String) -> Result<(), String> {
    let mut handles = ACTIVE_STDIN.lock().unwrap();
    if let Some(stdin) = handles.get_mut(&task_id) {
        stdin.write_all(input.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    } else {
        Err(format!("No stdin for taskId: {}", task_id))
    }
}

#[tauri::command]
pub fn close_stdin(task_id: String) -> Result<(), String> {
    let mut handles = ACTIVE_STDIN.lock().unwrap();
    if handles.remove(&task_id).is_some() {
        Ok(()) // Drop closes the pipe → child sees EOF
    } else {
        Err(format!("No stdin for taskId: {}", task_id))
    }
}

#[tauri::command]
pub fn resize_pty(task_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let masters = ACTIVE_PTY_MASTER.lock().unwrap();
    if let Some(master) = masters.get(&task_id) {
        master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    } else {
        Err(format!("No PTY master for taskId: {}", task_id))
    }
}
