@echo off
setlocal
set "PYTHONSAFEPATH=1"
py -3 -W error -S "%~dp0record_diff_review.py" %*
exit /b %errorlevel%
