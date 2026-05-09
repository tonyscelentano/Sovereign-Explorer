import sys
import json
import time
import os
import psutil
import threading
import collections
import difflib
import hashlib
from PIL import Image
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

APP_DATA_DIR = os.path.join(
    os.getenv('APPDATA') or os.path.expanduser('~'),
    'sovereign-explorer'
)

def send_msg(type, data):
    """Sends a JSON message to stdout for Rust/Tauri to consume."""
    try:
        print(json.dumps({"type": type, "data": data}), flush=True)
    except OSError:
        sys.exit(0)

# ─── THUMBNAIL ENGINE ────────────────────────────────────────────────────────
CACHE_DIR = os.path.join(APP_DATA_DIR, 'cache', 'thumbnails')
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR, exist_ok=True)

def get_thumb_path(source_path):
    """Generate a unique hash-based path for a thumbnail."""
    h = hashlib.md5(source_path.encode('utf-8')).hexdigest()
    return os.path.join(CACHE_DIR, f"{h}.webp")

def generate_thumbnail(path):
    """Generates a 128px WebP thumbnail if it doesn't exist."""
    thumb_path = get_thumb_path(path)
    if os.path.exists(thumb_path):
        os.utime(thumb_path, None)
        return thumb_path

    try:
        with Image.open(path) as img:
            # Handle orientation from EXIF
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except Exception: pass
            
            img.thumbnail((128, 128))
            img.save(thumb_path, "WEBP", quality=80)
        return thumb_path
    except Exception:
        return None

def clean_cache():
    """Remove thumbnails older than 7 days."""
    now = time.time()
    week_ago = now - (7 * 24 * 60 * 60)
    try:
        for f in os.listdir(CACHE_DIR):
            if not f.endswith('.webp'): continue
            fp = os.path.join(CACHE_DIR, f)
            if os.path.getmtime(fp) < week_ago:
                os.remove(fp)
    except Exception:
        pass

# ─── DIFF ENGINE ─────────────────────────────────────────────────────────────
FILE_CACHE = collections.OrderedDict()
MAX_CACHE_FILES = 100
MAX_FILE_BYTES = 1024 * 1024 # 1MB limit for diffing
WATCHED_EXTS = {'.txt', '.md', '.py', '.js', '.css', '.html', '.rs', '.json', '.toml', '.ps1'}

class MomentumHandler(FileSystemEventHandler):
    def process_file(self, path):
        path = os.path.abspath(path)
        ext = os.path.splitext(path)[1].lower()
        
        # Handle Thumbnail Requests (via file touch or dedicated channel)
        # For now, we'll keep it simple: if it's an image, we pre-gen the thumb
        if ext in {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}:
            generate_thumbnail(path)
            return

        if ext not in WATCHED_EXTS: return
        
        # Ignore agent and build directories
        ignore_dirs = {"node_modules", ".git", "target", ".venv", ".roo", ".claude", ".agents", ".cursor", ".gemini"}
        path_parts = set(path.replace('\\', '/').split('/'))
        if ignore_dirs.intersection(path_parts): return

        try:
            if not os.path.exists(path): return
            if os.path.getsize(path) > MAX_FILE_BYTES: return

            # Retry reading up to 10 times if the file is locked or partially written
            new_lines = None
            for _ in range(10):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        new_lines = f.readlines()
                    break
                except Exception:
                    time.sleep(0.1)
            
            if new_lines is None:
                return

            adds = 0
            subs = 0
            
            if path in FILE_CACHE:
                old_lines = FILE_CACHE[path]
                if old_lines != new_lines:
                    diff = difflib.ndiff(old_lines, new_lines)
                    for line in diff:
                        if line.startswith('+ '): adds += 1
                        elif line.startswith('- '): subs += 1
            else:
                adds = len(new_lines)
                
            FILE_CACHE[path] = new_lines
            if len(FILE_CACHE) > MAX_CACHE_FILES:
                FILE_CACHE.popitem(last=False)
                
            if adds > 0 or subs > 0:
                send_msg("momentum", {
                    "file": os.path.basename(path),
                    "path": path,
                    "adds": adds,
                    "subs": subs,
                    "time": time.time()
                })
        except Exception as e:
            with open(os.path.join(APP_DATA_DIR, 'sidecar_error.log'), 'a') as log:
                log.write(f"Error processing {path}: {e}\n")
            pass 

    def on_modified(self, event):
        if event.is_directory: return
        self.process_file(event.src_path)

    def on_created(self, event):
        if event.is_directory: return
        self.process_file(event.src_path)

    def on_moved(self, event):
        if event.is_directory: return
        self.process_file(event.dest_path)

# ─── MAIN LOOP ───────────────────────────────────────────────────────────────
def main():
    parent_pid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    initial_watch_dir = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].strip() else None
    
    send_msg("status", {"message": f"Sovereign Sidecar Active (Watching {initial_watch_dir})", "pid": os.getpid()})

    # Clean old cache on startup
    clean_cache()

    observers = []
    current_watch_dirs = [initial_watch_dir] if initial_watch_dir else []

    def start_observers(dirs):
        nonlocal observers
        for obs in observers:
            obs.stop()
            obs.join()
        observers = []
        for d in dirs:
            if d and os.path.exists(d):
                obs = Observer()
                obs.schedule(MomentumHandler(), d, recursive=True)
                obs.start()
                observers.append(obs)

    start_observers(current_watch_dirs)

    try:
        last_disk = psutil.disk_io_counters()
        watch_file_path = os.path.join(APP_DATA_DIR, 'watch_path.txt')
        
        while True:
            # Liveness check
            if parent_pid and not psutil.pid_exists(parent_pid):
                sys.exit(0)

            # Check if watch path changed dynamically
            try:
                valid_dirs = []
                if os.path.exists(watch_file_path):
                    with open(watch_file_path, 'r', encoding='utf-8') as f:
                        lines = [line.strip().strip('"') for line in f.readlines() if line.strip()]
                        valid_dirs = [d for d in lines if os.path.exists(d)]
                
                if set(valid_dirs) != set(current_watch_dirs):
                    current_watch_dirs = valid_dirs
                    start_observers(current_watch_dirs)
                    send_msg("status", {"message": f"Sidecar Switched to {len(current_watch_dirs)} workspaces", "pid": os.getpid()})
            except Exception as e:
                with open(os.path.join(APP_DATA_DIR, 'sidecar_error.log'), 'a') as log:
                    log.write(f"Error reading watch_path.txt: {e}\n")
                pass

            time.sleep(1)
            
            current_disk = psutil.disk_io_counters()
            cpu_pct = psutil.cpu_percent()
            
            r_bytes = current_disk.read_bytes - last_disk.read_bytes if last_disk else 0
            w_bytes = current_disk.write_bytes - last_disk.write_bytes if last_disk else 0
            last_disk = current_disk
            
            send_msg("pulse", {
                "heartbeat": True,
                "cpu": cpu_pct,
                "read_rate": r_bytes,
                "write_rate": w_bytes,
                "timestamp": time.time()
            })
            
    except KeyboardInterrupt:
        for obs in observers:
            obs.stop()
    for obs in observers:
        obs.join()

if __name__ == "__main__":
    main()
