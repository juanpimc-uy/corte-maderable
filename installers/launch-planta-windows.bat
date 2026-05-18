@echo off
REM ================================================================
REM  corte-maderable - launcher de PLANTA (Windows)
REM ================================================================
REM
REM  Que hace este script:
REM    - Arranca Chrome con --kiosk-printing  (sin cuadro de impresion)
REM    - Perfil dedicado de Chrome para no pisar el de la PC
REM    - Pantalla completa, sin barra de direcciones
REM    - Apunta a corte.maderable.uy
REM
REM  Como instalar en la PC de planta:
REM    1. Copiar este .bat al escritorio.
REM    2. (Opcional) Click derecho sobre el icono > Cambiar icono.
REM    3. Click derecho > Propiedades > Acceso directo > Avanzado >
REM       marcar "Ejecutar como administrador" si la planta lo pide.
REM    4. Doble click para abrir.
REM
REM  Antes de la primera corrida:
REM    - Instalar el driver de la Datamax.
REM    - En Configuracion > Impresoras, dejar la Datamax como
REM      "Impresora predeterminada".
REM
REM ================================================================

set "PROFILE=%LOCALAPPDATA%\corte-maderable-profile"
set "URL=https://corte.maderable.uy"

REM Si Chrome no esta en su ruta default, ajustar CHROME a la ruta real.
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  echo No encontre Chrome en las rutas estandar. Edita este .bat y
  echo apunta la variable CHROME al chrome.exe correcto.
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --user-data-dir="%PROFILE%" ^
  --kiosk-printing ^
  --start-fullscreen ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=TranslateUI ^
  --app=%URL%
