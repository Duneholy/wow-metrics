@echo off
echo Stopping wow_metrics (Backend and Frontend)...

:: Stop Backend (Port 4000)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":4000"') do (
    taskkill /F /PID %%a 2>nul
)

:: Stop Frontend (Port 5173, 5174, 5175, 5176)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":5173"') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":5174"') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":5175"') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":5176"') do (
    taskkill /F /PID %%a 2>nul
)

:: Also brutally kill node.js to be absolutely sure no detached ghosts remain
taskkill /F /IM node.exe 2>nul

echo Successfully stopped.
pause


