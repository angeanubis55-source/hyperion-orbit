@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Hyperion Orbit - Mise a jour

rem ---------------------------------------------------------------------------
rem  Hyperion Orbit : double-clique ce fichier pour jouer.
rem  1. Il se recopie dans TEMP et se relance depuis la-bas (pour pouvoir
rem     tout supprimer ici sans se tirer une balle dans le pied).
rem  2. Il telecharge le ZIP de la derniere version depuis GitHub.
rem  3. Il supprime TOUT dans ce dossier, dezippe et remet tout en place.
rem  4. Il demarre le serveur local (Node) et ouvre le jeu dans le navigateur.
rem  Rien a installer a part Node.js : https://nodejs.org/
rem ---------------------------------------------------------------------------

if /i not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\HyperionOrbit-run.bat" >nul
  call "%TEMP%\HyperionOrbit-run.bat" --run "%~dp0"
  exit /b %errorlevel%
)

set "GAMEDIR=%~2"
if not defined GAMEDIR set "GAMEDIR=%~dp0"
cd /d "%GAMEDIR%" 2>nul
if errorlevel 1 (
  echo Impossible d'ouvrir le dossier : %GAMEDIR%
  pause
  exit /b 1
)

set "REPO=angeanubis55-source/hyperion-orbit"
set "BRANCH=main"
set "ZIPURL=https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
set "WORKDIR=%TEMP%\hyperion-orbit-upd"
set "ZIPFILE=%WORKDIR%\jeu.zip"
set "EXTRACTDIR=%WORKDIR%\extract"

echo ============================================
echo  Hyperion Orbit - Mise a jour + lancement
echo  Dossier : %GAMEDIR%
echo ============================================
echo.

rem --- [1/4] Telechargement -----------------------------------------------
if exist "%WORKDIR%" rmdir /s /q "%WORKDIR%"
mkdir "%WORKDIR%" 2>nul
mkdir "%EXTRACTDIR%" 2>nul

echo [1/4] Telechargement de la derniere version...
set "DL_OK=0"
where curl.exe >nul 2>nul
if errorlevel 1 goto dl_powershell
curl.exe -L --fail --retry 2 -o "%ZIPFILE%" "%ZIPURL%"
if not errorlevel 1 set "DL_OK=1"
goto dl_verif

:dl_powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%ZIPURL%' -OutFile '%ZIPFILE%' } catch { exit 1 }"
if not errorlevel 1 set "DL_OK=1"

:dl_verif
if "%DL_OK%"=="1" goto dl_ok
echo.
echo Echec du telechargement. Verifie ta connexion internet puis reessaie.
echo (Le jeu local n'a pas ete touche.)
pause
exit /b 1
:dl_ok
echo Telechargement termine.
echo.

rem --- [2/4] Extraction ----------------------------------------------------
echo [2/4] Extraction...
set "SRCDIR="
where tar.exe >nul 2>nul
if errorlevel 1 goto unzip_powershell
tar -xf "%ZIPFILE%" -C "%EXTRACTDIR%"
if errorlevel 1 goto unzip_fail
goto unzip_findroot

:unzip_powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath '%ZIPFILE%' -DestinationPath '%EXTRACTDIR%' -Force } catch { exit 1 }"
if errorlevel 1 goto unzip_fail
goto unzip_findroot

:unzip_fail
echo.
echo Echec de l'extraction. Relance le script.
pause
exit /b 1

:unzip_findroot
for /d %%d in ("%EXTRACTDIR%\*") do if not defined SRCDIR set "SRCDIR=%%d"
if not defined SRCDIR goto unzip_fail
echo Extraction terminee.
echo.

rem --- [3/4] Remplacement des fichiers -------------------------------------
echo [3/4] Remplacement des fichiers...
attrib -r -s -h /s /d "%GAMEDIR%\*" >nul 2>&1
del /f /q "%GAMEDIR%\*" >nul 2>&1
for /d %%d in ("%GAMEDIR%\*") do rmdir /s /q "%%d" >nul 2>&1
robocopy "%SRCDIR%" "%GAMEDIR%" /E /MOVE /NFL /NDL /NJH /NJS >nul 2>&1
if errorlevel 8 (
  echo.
  echo Echec de l'installation. Relance le script.
  pause
  exit /b 1
)
if not exist "%GAMEDIR%\index.html" (
  echo.
  echo Installation incomplete (index.html manquant). Relance le script.
  pause
  exit /b 1
)
rmdir /s /q "%WORKDIR%" >nul 2>&1
echo Fichiers a jour.
echo.

rem --- [4/4] Lancement ------------------------------------------------------
echo [4/4] Lancement du jeu...
where node >nul 2>nul
set "NODE=node"
if not errorlevel 1 goto node_ok
if exist "%ProgramFiles%\nodejs\node.exe" goto node_pf
echo.
echo Node.js est introuvable.
echo Installe Node 20 ou plus depuis https://nodejs.org/ puis relance ce script.
pause
exit /b 1
:node_pf
set "NODE=%ProgramFiles%\nodejs\node.exe"
:node_ok

set "URLFILE=%TEMP%\hyperion-url.txt"
del "%URLFILE%" >nul 2>&1
(
echo @echo off
echo cd /d "%GAMEDIR%"
echo "%NODE%" SCRIPTS\GAME_SERVER.js ^> "%URLFILE%" 2^>^&1
) > "%TEMP%\hyperion-serveur.bat"
start "HyperionOrbit-Serveur" /min "%TEMP%\hyperion-serveur.bat"

set "GAMEURL="
for /l %%i in (1,1,30) do (
  if not defined GAMEURL (
    for /f "usebackq delims=" %%u in (`findstr /c:"http://" "%URLFILE%" 2^>nul`) do set "GAMEURL=%%u"
  )
  if defined GAMEURL goto open_browser
  timeout /t 1 /nobreak >nul
)

echo.
echo Le serveur n'a pas demarre. Regarde la fenetre "HyperionOrbit-Serveur".
pause
exit /b 1

:open_browser
echo.
echo Jeu pret : %GAMEURL%
start "" "%GAMEURL%"
echo.
echo Le jeu tourne dans ton navigateur.
echo Pour arreter le jeu, ferme la fenetre "HyperionOrbit-Serveur".
echo Tu peux fermer cette fenetre.
pause
exit /b 0
