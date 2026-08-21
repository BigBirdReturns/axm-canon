@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  set /p DB=Exact ASOIAF-PRIVATE-CORPUS.sqlite3 path: 
) else (
  set DB=%~1
)
if "%~2"=="" (
  set /p CANDIDATES=Public-safe CANDIDATES.json path: 
) else (
  set CANDIDATES=%~2
)
if "%~3"=="" (
  set /p REVIEWER=Named human reviewer: 
) else (
  set REVIEWER=%~3
)
if not exist "%DB%" (
  echo Exact private database not found.
  exit /b 10
)
if not exist "%CANDIDATES%" (
  echo Candidate file not found.
  exit /b 11
)
if not exist "LOCAL_REVIEW_INTAKES" mkdir "LOCAL_REVIEW_INTAKES"
py -3 review_server.py serve --database "%DB%" --candidates "%CANDIDATES%" --reviewer "%REVIEWER%" --host 127.0.0.1 --port 8765 --output-dir "LOCAL_REVIEW_INTAKES"
if errorlevel 1 python review_server.py serve --database "%DB%" --candidates "%CANDIDATES%" --reviewer "%REVIEWER%" --host 127.0.0.1 --port 8765 --output-dir "LOCAL_REVIEW_INTAKES"
endlocal
