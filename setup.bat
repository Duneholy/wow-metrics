@echo off
setlocal EnableExtensions
cd /d "%~dp0" 2>nul || (
  echo [ERROR] Cannot open project folder.
  goto :END
)

echo ===================================================
echo       wow_metrics - Production build
echo ===================================================
echo.
echo OPTIONAL. Builds backend\dist and frontend\dist
echo Then run: cd backend ^&^& npm start  -^>  http://localhost:4000
echo.
echo For daily use: install.bat + Launch wow_metrics.bat
echo.
pause

if not exist "backend\node_modules\" (
  echo backend\node_modules missing - running install.bat first...
  call "%~dp0install.bat"
  if errorlevel 1 goto :END
)

cd /d "%~dp0backend"
if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

echo [1/5] Backend dependencies...
call npm install
if errorlevel 1 goto :END

echo [2/5] Prisma...
call npx prisma generate
if errorlevel 1 goto :END
call npx prisma db push
if errorlevel 1 goto :END

echo [3/5] Backend build...
call npm run build
if errorlevel 1 goto :END

cd /d "%~dp0frontend"
echo [4/5] Frontend dependencies...
call npm install
if errorlevel 1 goto :END

echo [5/5] Frontend build...
call npm run build
if errorlevel 1 goto :END

cd /d "%~dp0"
echo.
echo ===================================================
echo  SUCCESS - production build ready
echo ===================================================
echo.
echo   cd backend
echo   npm start
echo   Open http://localhost:4000
echo.

:END
echo.
pause
endlocal


