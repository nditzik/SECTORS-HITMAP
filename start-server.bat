@echo off
title Sector Heatmap Server
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js is not installed.
    echo  Please download from: https://nodejs.org
    echo.
    pause
    exit /b
)

echo.
echo  Starting Sector Heatmap server on port 3458...
echo  Browser will open automatically.
echo.
node server.js
pause
