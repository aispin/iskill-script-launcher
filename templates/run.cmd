@echo off
rem ============================================================
rem  <SKILL NAME> - Windows double-click entry
rem
rem  Double-click THIS file. Reason: double-clicking a .ps1 opens
rem  Notepad instead of running it. This shim calls PowerShell with
rem  -ExecutionPolicy Bypass so it just works.
rem
rem  This file is intentionally pure ASCII: cmd.exe has its own
rem  code page mess, and Chinese bytes here would be mangled.
rem
rem  Real logic lives in scripts\launcher.py (one cross-platform codebase).
rem ============================================================
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set rc=%ERRORLEVEL%
endlocal & exit /b %rc%
