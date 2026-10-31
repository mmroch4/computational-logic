#!/usr/bin/env bash
# Gera as imagens de partilha a partir dos modelos em scripts/share-images/:
#   og-image.html         → og-image.png (1200×630, Open Graph / Twitter)
#   og-image.html?lang=en → og-image-en.png (a mesma imagem em inglês)
#   apple-touch-icon.html → apple-touch-icon.png (180×180, ecrã principal do iOS)
# Usa o Chrome headless (como o check-page.sh). Correr só quando um modelo mudar.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/usr/bin/google-chrome}"

render() { # <modelo> <saída> <largura> <altura>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=5000 --window-size="$3,$4" \
    --screenshot="$PWD/$2" "file://$PWD/scripts/share-images/$1" 2>/dev/null
  echo "$2 ($3×$4)"
}

render og-image.html og-image.png 1200 630
render "og-image.html?lang=en" og-image-en.png 1200 630
render apple-touch-icon.html apple-touch-icon.png 180 180
