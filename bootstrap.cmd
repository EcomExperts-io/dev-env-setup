@echo off
REM EcomExperts dev environment bootstrap - Windows (double-click friendly)
REM
REM Execution policy is a PowerShell-only concept - it doesn't apply to a
REM .cmd file at all, so this can always run with a plain double-click, no
REM prompts, no manual "Set-ExecutionPolicy" step first. It just launches
REM bootstrap.ps1 with the policy bypassed for this one process only
REM (nothing persistent or machine-wide is changed - the next PowerShell
REM window someone opens is completely unaffected), which also covers
REM downloaded/Mark-of-the-Web scripts, so no Unblock-File step is needed
REM either.
REM
REM This is only needed when running from a local copy of this repo. The
REM one-line install (irm ... | iex, see README) never hits execution
REM policy in the first place - Invoke-Expression isn't a script-file
REM launch, so there's nothing for the policy to block.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1"
set EXITCODE=%errorlevel%

echo.
pause
exit /b %EXITCODE%
