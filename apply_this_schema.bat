@echo off
chcp 65001 >nul
title Apply Schema to this Supabase Project
echo ====================================================
echo    Apply Schema to THIS Supabase Project Only
echo ====================================================
echo.
echo Project Folder: %CD%
echo.
pause
py "..\apply_all_to_supabase.py" "%CD%"
echo.
pause
