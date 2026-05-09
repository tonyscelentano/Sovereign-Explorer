# Sovereign Explorer — Project Workspace Policy

## Do Not Dos (GUI Applets)
- Do not use loose dependency ranges (>=) for GUI frameworks; pin exact versions.
- Do not install/run from global Python for project apps; always use a local .venv.
- Do not rely on recently changed framework widgets (Tabs, etc.) without version-specific verification.
- Do not ship launch scripts that tie app lifecycle to console windows unless debugging.
- Do not treat deprecation warnings as harmless noise during active development; resolve early.
