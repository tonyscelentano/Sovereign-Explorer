# Sovereign Explorer

**Sovereign Explorer** is a GPU-accelerated, telemetry-aware, and fully customizable file explorer built for the modern Windows power user. It combines the speed of **Rust** (Tauri), the system intelligence of **Python**, and a modular **Vanilla JS** frontend.

> **Status:** Pre-Alpha. Experimental and under active development.

<img width="1280" height="818" alt="image" src="https://github.com/user-attachments/assets/7e6a7fd5-eac3-4dec-ae5b-091137d82293" />

---

## 🚀 Accomplishments So Far

### Core Navigation & FS
- **Native Breadcrumbs:** Reactive path navigation with a typeable address bar (Ctrl+L).
- **Logical Drives:** Modernized "This PC" view using PowerShell CimInstance queries.
- **File Operations:** Full support for Create, Rename, Copy, Move, and Delete (Recycle Bin via `trash` crate).
- **Fast Search:** Local filtering and infrastructure for GPU-backed semantic search.

### System Intelligence (Python Sidecar)
- **Live Telemetry:** Real-time Disk I/O rates and CPU usage piped to the UI.
- **Thumbnail Engine:** High-performance WebP thumbnail generation for images.
- **Momentum Tracking:** Real-time diff tracking for code files in watched workspaces.

### Power User Tools
- **Persistent Terminal:** Integrated PTY supporting PowerShell, pwsh, and CMD with resize/input handling.
- **Selection Manager:** Multi-select, keyboard navigation, and Cut/Copy/Paste clipboard.
- **Customization:** Modular "plug-and-play" extension system and CSS-based visual customizer.

---

## ⚠️ Current Technical Limitations

- **Windows Only:** The current architecture relies heavily on Windows-specific APIs (Registry, PowerShell, and Explorer.exe).
- **Pre-Alpha:** Many UI edge cases and complex shell context menu integrations are still in development.
- **Manual Sidecar Setup:** Users currently need to manually manage the Python `.venv` for the sidecar.

---

## 🛠️ Quick Start (Developer Setup)

### Prerequisites
- **Rust:** Latest stable toolchain.
- **Node.js:** For Tauri CLI management.
- **Python 3.12+:** For the system intelligence sidecar.

### Installation
1. Clone the repository.
2. Install Node dependencies:
   ```powershell
   npm install
   ```
3. Setup the Sidecar virtual environment:
   ```powershell
   cd sidecar
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Launch the application:
   ```powershell
   npm run dev
   ```

---

## 📜 License
MIT (TBD) — Created April 2026.
