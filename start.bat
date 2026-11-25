@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Lego Studio Engine
where node >nul 2>nul || (echo Chua cai Node.js. Cai ban LTS tai nodejs.org roi chay lai. & pause & exit /b 1)
where python >nul 2>nul || (echo Chua cai Python 3.10+. Cai tai python.org roi chay lai. & pause & exit /b 1)
if not exist node_modules (echo Dang cai thu vien lan dau, doi vai phut... & call npm install || (echo Cai thu vien bi loi. & pause & exit /b 1))
if not exist workspace\channel_library\baked\textures (echo Dang chuan bi tai nguyen lan dau... & python bootstrap_studio.py || (echo Chuan bi tai nguyen bi loi. & pause & exit /b 1))
if exist apps\server\package.json if exist apps\studio-ui\package.json goto app
echo Studio chua co giao dien (dang o Giai doan 0). Kiem tra moi truong:
python apps\brick-engine\tools\studio_doctor.py
pause
exit /b 0
:app
echo Dang mo server va giao dien Studio...
start "Lego Studio - Server" cmd /k npm run dev:server
start "Lego Studio - Studio" cmd /k npm run dev:ui
timeout /t 4 /nobreak >nul
start "" http://localhost:5174
echo Da mo. Muon tat app: dong hai cua so Server va Studio.
timeout /t 5 >nul
