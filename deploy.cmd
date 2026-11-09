@echo off
rem Double-click or run: deploy.cmd [repo-url] ["commit message"]
set "GITBASH=D:\Program Files\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=C:\Program Files\Git\bin\bash.exe"
"%GITBASH%" "%~dp0deploy.sh" %*
pause
