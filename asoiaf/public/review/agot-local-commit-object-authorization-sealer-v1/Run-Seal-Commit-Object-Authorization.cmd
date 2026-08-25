@echo off
setlocal
set "PYTHONSAFEPATH=1"
py -3 -W error -S "%~dp0seal_authorization.py" %*
exit /b %errorlevel%
