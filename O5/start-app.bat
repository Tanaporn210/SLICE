@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo 🚀 กำลังเปิดระบบ TaxFlow AI...
echo ========================================================
start "" "http://localhost:3000"
node server.js
pause
