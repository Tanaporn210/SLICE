@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo 🌱 กำลังเริ่มต้นระบบ O2 Smart Farm AI...
echo ====================================================
start "" "http://localhost:3000"
node server.js
pause
