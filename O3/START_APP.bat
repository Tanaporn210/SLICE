@echo off
chcp 65001 >nul
title AquaSense O3 - Smart Aquaculture Server
cd /d "%~dp0"
echo ==========================================================
echo 🐟🦐 กำลังเริ่มต้นระบบ AquaSense O3 (Smart Aquaculture App)...
echo ==========================================================
start http://localhost:3030
node server.js
pause
