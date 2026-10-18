@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=8787"
title Corrida Manager - Online

echo ==========================================================
echo   CORRIDA MANAGER - MULTIPLAYER ONLINE (Cloudflare)
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

rem ---------- cloudflared ----------
if exist "tools\cloudflared.exe" goto cloudflared_ok
where cloudflared >nul 2>nul
if not errorlevel 1 goto cloudflared_ok
echo.
echo cloudflared nao encontrado. Ele sera baixado automaticamente na primeira execucao (cerca de 55 MB).

:cloudflared_ok

rem ---------- Porta 8787 livre? ----------
echo.
echo Verificando a porta 8787...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo [AVISO] Ja existe um servidor ativo na porta 8787.
  echo Feche o jogo local ou outro servidor antes de iniciar o modo online.
  echo O Cloudflare Quick Tunnel precisa da porta 8787 livre.
  echo.
  pause
  exit /b 1
)

rem ---------- Iniciar ----------
echo.
echo Iniciando servidor + Cloudflare Quick Tunnel...
echo Aguarde: o link publico https://....trycloudflare.com aparecera abaixo.
echo O navegador do host sera aberto automaticamente quando o link ficar pronto.
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.

set "CM_OPEN_BROWSER=public"
call npm.cmd run online
set "EXITCODE=%errorlevel%"

echo.
echo Servidor e tunel encerrados (codigo %EXITCODE%).
echo O link publico deixa de funcionar ao fechar esta janela.
pause
exit /b %EXITCODE%
