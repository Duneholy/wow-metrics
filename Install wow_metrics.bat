@echo off
title wow_metrics - Install
cd /d "%~dp0"
if not exist "%~dp0install.bat" (
  echo [ERROR] install.bat not found in:
  echo %~dp0
  pause
  exit /b 1
)
:: Keep window open even if install.bat fails
cmd /k call "%~dp0install.bat"
