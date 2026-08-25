@echo off
setlocal
set "PYTHONSAFEPATH=1"
py -3 -W error -S "%~dp0adapt_receipt.py" %*
exit /b %errorlevel%
