@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Hyperion Orbit - Mise a jour securisee

rem ============================================================================
rem  Hyperion Orbit - Updater securise
rem
rem  Fonctionnement :
rem   1. Verifie que le BAT est bien dans le dossier du jeu.
rem   2. Recupere le dernier commit GitHub pour eviter les updates inutiles.
rem   3. Telecharge et extrait la nouvelle version dans %%TEMP%%.
rem   4. Valide la nouvelle version AVANT de toucher au jeu local.
rem   5. Sauvegarde l'installation actuelle.
rem   6. Remplace les fichiers.
rem   7. En cas d'echec, restaure automatiquement la sauvegarde.
rem
rem  Le BAT lui-meme est conserve. S'il existe dans le depot sous le meme nom,
rem  il sera remplace automatiquement apres la fin de la mise a jour.
rem ============================================================================

rem --- Configuration ----------------------------------------------------------
set "REPO=angeanubis55-source/hyperion-orbit"
set "BRANCH=main"
set "REQUIRED_FILE=index.html"
set "AUTO_LAUNCH=0"
set "LAUNCH_FILE=index.html"

rem --- Dossier du jeu ---------------------------------------------------------
set "GAMEDIR=%~dp0"
if "%GAMEDIR:~-1%"=="\" set "GAMEDIR=%GAMEDIR:~0,-1%"
set "BATNAME=%~nx0"
set "VERSIONFILE=%GAMEDIR%\.hyperion-version"
set "MARKERFILE=%GAMEDIR%\.hyperion-orbit-root"

cd /d "%GAMEDIR%" 2>nul
if errorlevel 1 goto bad_dir

rem --- Protections contre une suppression dans un mauvais dossier ------------
call :IsDangerousDirectory "%GAMEDIR%"
if errorlevel 1 goto dangerous_dir

if not exist "%GAMEDIR%\%REQUIRED_FILE%" goto wrong_game_dir

rem Au premier lancement, demande une confirmation avant d'autoriser toute
rem suppression dans ce dossier. Les lancements suivants utilisent le marqueur.
if not exist "%MARKERFILE%" (
    echo(
    echo PREMIER LANCEMENT - VERIFICATION DE SECURITE
    echo Dossier detecte : %GAMEDIR%
    echo Fichier detecte : %REQUIRED_FILE%
    echo(
    choice /C ON /N /M "Confirmer que ce dossier est bien Hyperion Orbit ? [O/N] "
    if errorlevel 2 exit /b 1
    >"%MARKERFILE%" echo Hyperion Orbit installation root
)

rem --- URLs et dossiers temporaires ------------------------------------------
set "ZIPURL=https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
set "APIURL=https://api.github.com/repos/%REPO%/commits/%BRANCH%"
set "RUNID=%RANDOM%%RANDOM%"
set "WORKDIR=%TEMP%\hyperion-orbit-upd-%RUNID%"
set "ZIPFILE=%WORKDIR%\jeu.zip"
set "EXTRACTDIR=%WORKDIR%\extract"
set "BACKUPDIR=%WORKDIR%\backup"
set "REMOTE_SHA_FILE=%WORKDIR%\remote-sha.txt"
set "SELFUPDATE=%TEMP%\hyperion-orbit-updater-new-%RUNID%.bat"
set "SELFHELPER=%TEMP%\hyperion-orbit-updater-self-%RUNID%.cmd"

mkdir "%WORKDIR%" 2>nul
mkdir "%EXTRACTDIR%" 2>nul
mkdir "%BACKUPDIR%" 2>nul
if not exist "%WORKDIR%" goto temp_fail

cls
echo ============================================
echo  Hyperion Orbit - Mise a jour securisee
echo  Dossier : %GAMEDIR%
echo ============================================
echo(

rem --- [1/6] Verification de version -----------------------------------------
echo [1/6] Verification de la version GitHub...
set "REMOTE_SHA="
set "LOCAL_SHA="

if exist "%VERSIONFILE%" set /p "LOCAL_SHA="<"%VERSIONFILE%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $h=@{'User-Agent'='Hyperion-Orbit-Updater'}; $r=Invoke-RestMethod -Headers $h -Uri '%APIURL%'; [Console]::Write($r.sha)" ^
  > "%REMOTE_SHA_FILE%" 2>nul

if exist "%REMOTE_SHA_FILE%" set /p "REMOTE_SHA="<"%REMOTE_SHA_FILE%"

if defined REMOTE_SHA (
    echo Version distante : !REMOTE_SHA:~0,12!
    if defined LOCAL_SHA echo Version locale    : !LOCAL_SHA:~0,12!

    if /i "!REMOTE_SHA!"=="!LOCAL_SHA!" (
        echo(
        echo Hyperion Orbit est deja a jour.
        call :CleanupWorkdir
        goto maybe_launch
    )
) else (
    echo Impossible de verifier le commit distant.
    echo La mise a jour complete va etre tentee quand meme.
)

echo(

rem --- [2/6] Telechargement ---------------------------------------------------
echo [2/6] Telechargement de la derniere version...
set "DL_OK=0"

where curl.exe >nul 2>nul
if errorlevel 1 goto dl_powershell

curl.exe -L --fail --retry 2 --retry-delay 2 -o "%ZIPFILE%" "%ZIPURL%"
if not errorlevel 1 (
    set "DL_OK=1"
    goto dl_verif
)

echo curl a echoue, tentative avec PowerShell...

:dl_powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri '%ZIPURL%' -OutFile '%ZIPFILE%'" >nul 2>&1
if not errorlevel 1 set "DL_OK=1"

:dl_verif
if not "%DL_OK%"=="1" goto dl_fail
if not exist "%ZIPFILE%" goto dl_fail
for %%Z in ("%ZIPFILE%") do if %%~zZ LSS 1024 goto dl_fail

echo Telechargement termine.
echo(

rem --- [3/6] Extraction + validation -----------------------------------------
echo [3/6] Extraction et validation...
set "SRCDIR="

where tar.exe >nul 2>nul
if errorlevel 1 goto unzip_powershell

tar -xf "%ZIPFILE%" -C "%EXTRACTDIR%" >nul 2>&1
if errorlevel 1 goto unzip_powershell_fallback
goto unzip_findroot

:unzip_powershell_fallback
rem Si tar existe mais echoue, on retente avec PowerShell.
rmdir /s /q "%EXTRACTDIR%" >nul 2>&1
mkdir "%EXTRACTDIR%" >nul 2>&1

:unzip_powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '%ZIPFILE%' -DestinationPath '%EXTRACTDIR%' -Force" >nul 2>&1
if errorlevel 1 goto unzip_fail

:unzip_findroot
for /d %%d in ("%EXTRACTDIR%\*") do if not defined SRCDIR set "SRCDIR=%%~fd"
if not defined SRCDIR goto unzip_fail

if not exist "%SRCDIR%\%REQUIRED_FILE%" goto validation_fail

echo Nouvelle version validee avant remplacement.
echo(

rem Prepare eventuellement l'auto-update du BAT.
if exist "%SRCDIR%\%BATNAME%" (
    copy /y "%SRCDIR%\%BATNAME%" "%SELFUPDATE%" >nul 2>&1
)

rem --- [4/6] Sauvegarde -------------------------------------------------------
echo [4/6] Sauvegarde de la version actuelle...
robocopy "%GAMEDIR%" "%BACKUPDIR%" /E /COPY:DAT /DCOPY:T /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XF "%BATNAME%" >nul
set "RC=!ERRORLEVEL!"
if !RC! GEQ 8 goto backup_fail

if not exist "%BACKUPDIR%\%REQUIRED_FILE%" goto backup_fail

echo Sauvegarde terminee.
echo(

rem --- [5/6] Remplacement -----------------------------------------------------
echo [5/6] Installation de la nouvelle version...

attrib -r -s -h /s /d "%GAMEDIR%\*" >nul 2>&1
set "DELETE_FAIL=0"

for %%f in ("%GAMEDIR%\*") do (
    if /i not "%%~nxf"=="%BATNAME%" (
        del /f /q "%%~ff" >nul 2>&1
        if exist "%%~ff" set "DELETE_FAIL=1"
    )
)

for /d %%d in ("%GAMEDIR%\*") do (
    rmdir /s /q "%%~fd" >nul 2>&1
    if exist "%%~fd" set "DELETE_FAIL=1"
)

if "!DELETE_FAIL!"=="1" goto install_fail_rollback

robocopy "%SRCDIR%" "%GAMEDIR%" /E /COPY:DAT /DCOPY:T /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XF "%BATNAME%" >nul
set "RC=!ERRORLEVEL!"
if !RC! GEQ 8 goto install_fail_rollback

if not exist "%GAMEDIR%\%REQUIRED_FILE%" goto install_fail_rollback

rem Re-cree le marqueur apres installation.
>"%MARKERFILE%" echo Hyperion Orbit installation root

rem Sauvegarde le commit installe si on a pu le recuperer.
if defined REMOTE_SHA (
    >"%VERSIONFILE%" echo !REMOTE_SHA!
)

echo Installation terminee.
echo(

rem --- [6/6] Verification finale ---------------------------------------------
echo [6/6] Verification finale...
if not exist "%GAMEDIR%\%REQUIRED_FILE%" goto install_fail_rollback

echo Mise a jour terminee avec succes.

rem L'ancienne installation n'est supprimee qu'apres validation finale.
call :CleanupWorkdir

rem L'auto-update du BAT sera lance apres le PAUSE final, afin de ne jamais
rem remplacer le script pendant qu'il est encore en cours d'execution.
if exist "%SELFUPDATE%" set "DO_SELFUPDATE=1"

goto maybe_launch

rem ============================================================================
rem  ERREURS ET ROLLBACK
rem ============================================================================

:dl_fail
echo(
echo ERREUR : echec du telechargement.
echo Le jeu local n'a pas ete touche.
call :CleanupWorkdir
pause
exit /b 1

:unzip_fail
echo(
echo ERREUR : impossible d'extraire l'archive telechargee.
echo Le jeu local n'a pas ete touche.
call :CleanupWorkdir
pause
exit /b 1

:validation_fail
echo(
echo ERREUR : la version telechargee est invalide.
echo Fichier obligatoire manquant : %REQUIRED_FILE%
echo Le jeu local n'a pas ete touche.
call :CleanupWorkdir
pause
exit /b 1

:backup_fail
if exist "%SELFUPDATE%" del /f /q "%SELFUPDATE%" >nul 2>&1
echo(
echo ERREUR : impossible de creer une sauvegarde fiable.
echo Par securite, aucun fichier du jeu n'a ete remplace.
echo Sauvegarde temporaire : %BACKUPDIR%
pause
exit /b 1

:install_fail_rollback
echo(
echo ERREUR pendant l'installation.
echo Restauration automatique de l'ancienne version...

attrib -r -s -h /s /d "%GAMEDIR%\*" >nul 2>&1

for %%f in ("%GAMEDIR%\*") do (
    if /i not "%%~nxf"=="%BATNAME%" del /f /q "%%~ff" >nul 2>&1
)
for /d %%d in ("%GAMEDIR%\*") do rmdir /s /q "%%~fd" >nul 2>&1

robocopy "%BACKUPDIR%" "%GAMEDIR%" /E /COPY:DAT /DCOPY:T /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >nul
set "ROLLBACK_RC=!ERRORLEVEL!"

if !ROLLBACK_RC! GEQ 8 goto rollback_failed
if not exist "%GAMEDIR%\%REQUIRED_FILE%" goto rollback_failed

echo Ancienne version restauree avec succes.
call :CleanupWorkdir
if exist "%SELFUPDATE%" del /f /q "%SELFUPDATE%" >nul 2>&1
pause
exit /b 1

:rollback_failed
echo(
echo ATTENTION : la restauration automatique n'a pas pu etre terminee.
echo NE SUPPRIME PAS ce dossier de sauvegarde :
echo %BACKUPDIR%
echo(
echo Ferme Hyperion Orbit et tout programme pouvant verrouiller ses fichiers,
echo puis copie manuellement le contenu de la sauvegarde dans :
echo %GAMEDIR%
pause
exit /b 2

:temp_fail
echo Impossible de creer le dossier temporaire de mise a jour.
pause
exit /b 1

:wrong_game_dir
echo(
echo SECURITE : Hyperion Orbit n'a pas ete detecte dans ce dossier.
echo Fichier attendu : %REQUIRED_FILE%
echo(
echo Place ce BAT directement dans le dossier principal du jeu.
echo Aucun fichier n'a ete supprime.
pause
exit /b 1

:dangerous_dir
echo(
echo SECURITE : l'updater refuse de fonctionner dans ce dossier :
echo %GAMEDIR%
echo(
echo Ce dossier ressemble a un dossier systeme ou personnel important.
echo Place l'updater dans le dossier principal de Hyperion Orbit.
echo Aucun fichier n'a ete supprime.
pause
exit /b 1

:bad_dir
echo Impossible d'ouvrir le dossier du jeu.
pause
exit /b 1

rem ============================================================================
rem  SOUS-ROUTINES
rem ============================================================================

:IsDangerousDirectory
set "CHECKDIR=%~f1"
if "%CHECKDIR:~-1%"=="\" set "CHECKDIR=%CHECKDIR:~0,-1%"
if /i "%CHECKDIR%"=="%SystemDrive%" exit /b 1
if /i "%CHECKDIR%"=="%SystemRoot%" exit /b 1
if /i "%CHECKDIR%"=="%USERPROFILE%" exit /b 1
if /i "%CHECKDIR%"=="%USERPROFILE%\Desktop" exit /b 1
if /i "%CHECKDIR%"=="%USERPROFILE%\Downloads" exit /b 1
if /i "%CHECKDIR%"=="%USERPROFILE%\Documents" exit /b 1
if not "%ProgramFiles%"=="" if /i "%CHECKDIR%"=="%ProgramFiles%" exit /b 1
if not "%ProgramFiles(x86)%"=="" if /i "%CHECKDIR%"=="%ProgramFiles(x86)%" exit /b 1
if not "%ProgramData%"=="" if /i "%CHECKDIR%"=="%ProgramData%" exit /b 1
exit /b 0

:CleanupWorkdir
if defined WORKDIR if exist "%WORKDIR%" rmdir /s /q "%WORKDIR%" >nul 2>&1
exit /b 0

:ScheduleSelfUpdate
>"%SELFHELPER%" echo @echo off
>>"%SELFHELPER%" echo ping 127.0.0.1 -n 3 ^>nul
>>"%SELFHELPER%" echo copy /y "%SELFUPDATE%" "%GAMEDIR%\%BATNAME%" ^>nul 2^>^&1
>>"%SELFHELPER%" echo del /f /q "%SELFUPDATE%" ^>nul 2^>^&1
>>"%SELFHELPER%" echo del /f /q "%%~f0" ^>nul 2^>^&1
start "" /min cmd /c ""%SELFHELPER%""
exit /b 0

:maybe_launch
if "%AUTO_LAUNCH%"=="1" (
    if exist "%GAMEDIR%\%LAUNCH_FILE%" start "" "%GAMEDIR%\%LAUNCH_FILE%"
)
echo(
pause
if defined DO_SELFUPDATE call :ScheduleSelfUpdate
exit /b 0
