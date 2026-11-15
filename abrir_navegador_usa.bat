@echo off
chcp 65001 >nul
title Visual-FX - Navegador Privado USA (Contabo New Jersey)
cd /d "%~dp0"
node scripts\usa_browser_sync.js
pause
