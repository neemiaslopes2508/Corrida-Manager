@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=8787"
title Corrida Manager - Local

echo ==========================================================
echo   CORRIDA MANAGER - JOGO LOCAL
echo ==========================================================
echo.

rem ---------- Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  echo Instale o Node.js 20 ou superior em https://nodejs.org
  echo.
  pause
  exit /b 1
)

set "NODEVER="
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODEVER=%%v"
if not defined NODEVER (
  echo [ERRO] Nao foi possivel executar "node --version".
  pause
  exit /b 1
)

set "NODEMAJOR=0"
for /f "tokens=1 delims=." %%a in ("%NODEVER:v=%") do set "NODEMAJOR=%%a"
if %NODEMAJOR% LSS 20 (
  echo [ERRO] Node.js %NODEVER% e antigo. O projeto exige Node.js 20 ou superior.
  echo Atualize em https://nodejs.org
  pause
  exit /b 1
)
echo Node.js %NODEVER% encontrado.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm.cmd nao foi encontrado no PATH.
  echo Reinstale o Node.js marcando a opcao de adicionar ao PATH.
  pause
  exit /b 1
)

rem ---------- Dependencias ----------
if not exist "node_modules\tsx\package.json" goto install_deps
if not exist "node_modules\ws\package.json" goto install_deps
if not exist "node_modules\vite\package.json" goto install_deps
if not exist "node_modules\react\package.json" goto install_deps
goto deps_ok

:install_deps
echo.
echo Dependencias ausentes ou incompletas. Executando "npm install"...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao instalar as dependencias. Verifique sua conexao e tente novamente.
  pause
  exit /b 1
)

:deps_ok
echo Dependencias verificadas.

rem ---------- Servidor ja ativo? ----------
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo Ja existe um servidor ativo em http://localhost:8787
  echo Abrindo o navegador...
  start "" "http://localhost:8787"
  echo.
  echo Feche esta janela quando terminar. O servidor existente nao sera encerrado.
  pause >nul
  exit /b 0
)

rem ---------- Iniciar ----------
echo.
echo Compilando e iniciando o servidor local...
echo O navegador abrira automaticamente quando o servidor estiver pronto.
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.

set "CM_OPEN_BROWSER=local"
call npm.cmd run host
set "EXITCODE=%errorlevel%"

echo.
echo Servidor encerrado (codigo %EXITCODE%).
pause
exit /b %EXITCODE%
