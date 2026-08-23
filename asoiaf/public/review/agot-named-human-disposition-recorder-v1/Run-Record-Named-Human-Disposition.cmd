@echo off
setlocal
set "PYTHONSAFEPATH=1"
py -3 -W error -S "%~dp0record_disposition.py" %*
exit /b %errorlevel%
