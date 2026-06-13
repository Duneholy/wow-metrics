@echo off
title wow_metrics - Install
cd /d "%~dp0"
if not exist "%~dp0backend" (
  color 4F
  echo ===============================================================
  echo  [CRITICAL ERROR] PROJECT FOLDERS NOT FOUND!
  echo ===============================================================
  echo.
  echo  Did you run this file directly from inside the .rar archive?
  echo.
  echo  You MUST EXTRACT the entire archive to a normal folder on your 
  echo  computer ^(like your Desktop^) before running the installation!
  echo.
  echo ===============================================================
  pause
  exit /b 1
)

if not exist "%~dp0install.bat" (
  echo [ERROR] install.bat not found in:
  echo %~dp0
  pause
  exit /b 1
)
:: Keep window open even if install.bat fails
cmd /k call "%~dp0install.bat"


