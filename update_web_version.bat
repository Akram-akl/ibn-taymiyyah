@echo off
echo ===========================================
echo      Publishing to iPhone/Web Link...
echo ===========================================
echo.
call firebase deploy --only hosting
echo.
echo ===========================================
echo      Done! The link is updated.
echo ===========================================
pause
