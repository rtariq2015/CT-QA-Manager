@echo off
powershell.exe -NoProfile -File "%~dp0Update-CT-QA-Manager.ps1"
if errorlevel 1 echo Update did not finish. See the message above.
pause
