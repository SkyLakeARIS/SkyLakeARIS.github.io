@echo off
setlocal EnableExtensions
pushd "%~dp0"

set "site_exit_code=0"
set "powershell_path=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%powershell_path%" set "powershell_path=powershell.exe"

"%powershell_path%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "scripts\setup-tools.ps1"
if errorlevel 1 (
  set "site_exit_code=%ERRORLEVEL%"
  echo Failed to prepare the project-local Node.js and pnpm environment.
  goto site_end
)

if /I "%~1"=="setup" (
  call ".local\pnpm.cmd" install --frozen-lockfile
  set "site_exit_code=%ERRORLEVEL%"
  goto site_end
)

if /I "%~1"=="install" (
  call ".local\pnpm.cmd" %*
  set "site_exit_code=%ERRORLEVEL%"
  goto site_end
)

call ".local\pnpm.cmd" install --frozen-lockfile --prefer-offline
if errorlevel 1 (
  set "site_exit_code=%ERRORLEVEL%"
  goto site_end
)

if "%~1"=="" (
  call ".local\pnpm.cmd" dev
) else (
  call ".local\pnpm.cmd" %*
)
set "site_exit_code=%ERRORLEVEL%"

:site_end
popd
exit /b %site_exit_code%