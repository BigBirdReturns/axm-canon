@echo off
setlocal
set "PYTHONSAFEPATH=1"
py -3 -W error -S "%~dp0seal_patch_bundle.py" %*
exit /b %errorlevel%
