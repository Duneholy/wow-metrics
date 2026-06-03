@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" 2>nul || (
  echo [ERROR] Cannot open project folder: %~dp0
  goto :END
)

set "ROOT=%CD%"
set "LOG=%ROOT%\install.log"
set "FAIL=0"
echo [%date% %time%] install started > "%LOG%"
echo Project folder: %ROOT%
echo Log file: %LOG%
echo.

if not exist "%ROOT%\backend\" (
  echo [ERROR] Missing folder: backend
  goto :FAIL
)
if not exist "%ROOT%\frontend\" (
  echo [ERROR] Missing folder: frontend
  goto :FAIL
)
if not exist "%ROOT%\backend\package.json" (
  echo [ERROR] Missing backend\package.json
  goto :FAIL
)

echo ===================================================
echo       wow_metrics - Installation
echo ===================================================
echo.

call :EnsureNodeJs
if errorlevel 1 goto :FAIL

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo Using Node.js !NODE_VER!
echo.

echo [1/4] Backend dependencies...
cd /d "%ROOT%\backend"
call npm install >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm install failed in backend. See install.log
  goto :FAIL
)
echo OK

echo.
echo [2/4] Environment file (.env)...
if not exist ".env" (
  if not exist ".env.example" (
    echo [ERROR] Missing backend\.env.example
    goto :FAIL
  )
  copy /Y ".env.example" ".env" >nul
  echo Created backend\.env from .env.example
) else (
  echo backend\.env already exists - left unchanged
)

echo.
echo [3/4] SQLite database (Prisma)...
call npx prisma generate >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] prisma generate failed. See install.log
  goto :FAIL
)
call npx prisma db push >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] prisma db push failed. See install.log
  goto :FAIL
)
echo OK

echo.
echo [4/4] Frontend dependencies...
cd /d "%ROOT%\frontend"
call npm install >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm install failed in frontend. See install.log
  goto :FAIL
)
echo OK

cd /d "%ROOT%"
echo.
echo ===================================================
echo  SUCCESS - installation complete
echo ===================================================
echo.
echo Next: double-click "Launch wow_metrics.bat"
echo [%date% %time%] success >> "%LOG%"
goto :END

:: ---------------------------------------------------------------------------
:EnsureNodeJs
where node >nul 2>&1
if not errorlevel 1 (
  call :CheckNpm
  if not errorlevel 1 exit /b 0
)

echo Node.js was not found on this PC.
echo Starting automatic installation (may take a few minutes)...
echo Administrator rights may be required - if install fails, right-click
echo "Install wow_metrics.bat" and choose "Run as administrator".
echo [%date% %time%] node missing, auto-install >> "%LOG%"
echo.

call :InstallNodeJs
call :RefreshNodePath

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is still not available after automatic install.
  echo 1. Restart this PC, then run "Install wow_metrics.bat" again
  echo 2. Or install manually: https://nodejs.org/  ^(LTS^)
  exit /b 1
)

call :CheckNpm
if errorlevel 1 (
  echo [ERROR] npm not found after Node.js install.
  exit /b 1
)

for /f "delims=" %%v in ('node -v 2^>nul') do echo Node.js is ready: %%v
exit /b 0

:CheckNpm
where npm >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:RefreshNodePath
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
)
exit /b 0

:InstallNodeJs
set "NODE_INSTALLED=0"

where winget >nul 2>&1
if not errorlevel 1 (
  echo [1/2] Trying winget ^(Node.js LTS^)...
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --disable-interactivity >> "%LOG%" 2>&1
  if not errorlevel 1 set "NODE_INSTALLED=1"
  if "!NODE_INSTALLED!"=="0" (
    winget install --id OpenJS.NodeJS -e --accept-package-agreements --accept-source-agreements --disable-interactivity >> "%LOG%" 2>&1
    if not errorlevel 1 set "NODE_INSTALLED=1"
  )
  call :RefreshNodePath
  where node >nul 2>&1
  if not errorlevel 1 exit /b 0
)

echo [2/2] Downloading Node.js LTS installer from nodejs.org...
if not exist "%ROOT%\scripts\install-node.ps1" (
  echo [ERROR] Missing scripts\install-node.ps1
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\install-node.ps1" >> "%LOG%" 2>&1
if errorlevel 1 exit /b 1
call :RefreshNodePath
exit /b 0

:FAIL
set "FAIL=1"
echo [%date% %time%] install failed >> "%LOG%"

:END
cd /d "%ROOT%" 2>nul
echo.
if "%FAIL%"=="1" (
  echo Installation failed. Open install.log in this folder for details.
) else (
  echo Done.
)
echo Press any key to close...
pause >nul
endlocal
exit /b %FAIL%
