#!/bin/bash
# ===============================================================
#  corte-maderable - launcher de PRUEBA (Mac)
# ===============================================================
#
#  Para probar el modo "sin cuadro de impresión" en tu Mac antes
#  de instalar en planta.
#
#  Que hace:
#    - Arranca Chrome con --kiosk-printing (sin diálogo de impresión).
#    - Perfil dedicado en /tmp, no toca tu Chrome de siempre.
#    - Apunta a http://localhost:3000 (dev server local).
#
#  Cómo usar:
#    1. Levantar el dev server desde otra terminal:
#         cd public && python3 -m http.server 3000
#    2. Click derecho sobre este archivo en Finder > Abrir.
#       (La primera vez Mac va a preguntar permiso porque es un
#       script descargado/sin firmar. Se le da OK.)
#    3. En la ventana de Chrome que se abre, ir a Etiquetas y
#       tocar una pieza. Debe imprimir directo a la impresora
#       default de la Mac, sin diálogo.
#
#  Si no tenés ninguna impresora física configurada, dejá
#  "Guardar como PDF" como default temporalmente para verificar
#  el comportamiento.
#
# ===============================================================

PROFILE="/tmp/corte-maderable-mac-test"
URL="http://localhost:3000"

if [ ! -d "/Applications/Google Chrome.app" ]; then
  echo "No encuentro Google Chrome en /Applications."
  echo "Instalalo desde https://www.google.com/chrome/ y volve a correr."
  exit 1
fi

# Verificar que el server esté arriba antes de abrir Chrome.
if ! curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
  echo "⚠  El server local no responde en $URL"
  echo "    Levantá el dev server primero:"
  echo "      cd <repo>/public && python3 -m http.server 3000"
  echo
  read -p "Igual querés abrir Chrome y ver qué pasa? (s/N) " yn
  case "$yn" in
    [sS]*) ;;
    *) exit 1 ;;
  esac
fi

open -na "Google Chrome" --args \
  --user-data-dir="$PROFILE" \
  --kiosk-printing \
  --no-first-run \
  --no-default-browser-check \
  --app="$URL"
