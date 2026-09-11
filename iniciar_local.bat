@echo off
title Visual-FX Local Launcher
cd /d "%~dp0"

:: Verificar si el servidor ya esta escuchando en el puerto 3500
netstat -ano | findstr ":3500 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo Iniciando servidor Visual-FX en segundo plano...
    start /min "Visual-FX Server" cmd /c "node server.js"
    timeout /t 2 /nobreak >nul
) else (
    echo El servidor Visual-FX ya esta en ejecucion en el puerto 3500.
)

:: Abrir aplicacion en el navegador predeterminado
start http://localhost:3500
exit
