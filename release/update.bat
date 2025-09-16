@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "TARGET=%SCRIPT_DIR%tag-painter\scripts\update.ps1"
if not exist "%TARGET%" (
  echo Could not find "%TARGET%"
  exit /b 1
)
where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  set "PS_CMD=pwsh"
) else (
  set "PS_CMD=powershell"
)
"%PS_CMD%" -NoProfile -ExecutionPolicy Bypass -File "%TARGET%" %*
set "RESULT=%ERRORLEVEL%"
if "%RESULT%"=="-1073741510" goto :cleanup
if "%RESULT%"=="3221225786" goto :cleanup
pause

:cleanup
exit /b %RESULT%
