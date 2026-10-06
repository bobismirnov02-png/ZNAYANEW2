@echo off
setlocal
cd /d "%~dp0"
title ZNAYA
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_ZNAYA.ps1"
endlocal
