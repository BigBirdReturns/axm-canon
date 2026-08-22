@echo off
setlocal
set "PYTHONSAFEPATH=1"
set "HERE=%~dp0"
for %%I in ("%HERE%..\..\..\..") do set "REPO=%%~fI"
set "OUT=%HERE%LOCAL_AGOT_RECOVERY_HANDOFF"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%HERE%reconstruct_handoff.py" run --repo-root "%REPO%" --out "%OUT%" --force
) else (
  python "%HERE%reconstruct_handoff.py" run --repo-root "%REPO%" --out "%OUT%" --force
)
set "RC=%errorlevel%"
echo.
echo Exit code: %RC%
pause
exit /b %RC%
