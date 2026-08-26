@echo off
chcp 65001 >nul
title MooView Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-mooview.ps1"
set "MOOVIEW_EXIT_CODE=%ERRORLEVEL%"

if not "%MOOVIEW_EXIT_CODE%"=="0" (
    echo.
    echo MooView could not be started. See the Japanese error above.
    pause
)

exit /b %MOOVIEW_EXIT_CODE%
