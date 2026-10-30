#!/usr/bin/env bash
# Картинка для реестра миниатюр — в том же виде, что все img/mini/*.webp:
# фото одной фигурки без фона, обрезанное по контуру и вписанное в
# прозрачный квадрат 720×720 с полем 19 px (фигура до 682 px по большей
# стороне), по центру, WebP с альфа-каналом.
#
#   tools/mini-image.sh <фото: файл или URL> <id миниатюры> [fuzz]
#
# Фон убирается по цвету угла кадра: годится студийное фото на
# однотонном (обычно белом или сером) фоне. Полупрозрачные эффекты
# (клинки, кристаллы, молнии) на светлом фоне частично теряются —
# результат всегда проверяйте глазами. fuzz — допуск цвета фона,
# по умолчанию 8%; поднимите, если остался ореол, опустите, если съело
# светлые детали фигурки. PNG с прозрачностью обрабатывается как есть.
# Нужен ImageMagick 7 (magick).
set -euo pipefail

src=${1:?usage: tools/mini-image.sh <photo|url> <mini-id> [fuzz]}
id=${2:?usage: tools/mini-image.sh <photo|url> <mini-id> [fuzz]}
fuzz=${3:-8%}

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/img/mini/$id.webp"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [[ $src =~ ^https?:// ]]; then
  curl -fsSL -A 'Mozilla/5.0' "$src" -o "$tmp/src"
  src="$tmp/src"
fi

# Есть ли уже прозрачность: тогда фон не трогаем.
opaque=$(magick "$src" -format '%[opaque]' info: 2>/dev/null || echo true)

if [[ $opaque == true || $opaque == True ]]; then
  # Маска фона: всё, что близко к цвету угла кадра. Заливки от краёв мало —
  # просветы между ногами и под оружием замкнуты и остались бы белыми.
  # Поэтому берём все области цвета фона, а мелкие (блики и светлые детали
  # покраски, меньше 0.1% кадра) возвращаем фигурке.
  bg=$(magick "$src" -format '%[pixel:p{0,0}]' info:)
  area=$(magick "$src" -format '%[fx:int(w*h/1000)]' info:)
  magick "$src" -alpha off -fuzz "$fuzz" -fill white -opaque "$bg" -fill black +opaque white \
    -define connected-components:area-threshold="$area" \
    -define connected-components:mean-color=true \
    -connected-components 4 -negate \
    -morphology Erode Disk:1 -blur 0x0.7 "$tmp/alpha.png"
  magick "$src" -alpha off "$tmp/alpha.png" -compose CopyOpacity -composite "$tmp/cut.png"
else
  magick "$src" "$tmp/cut.png"
fi

magick "$tmp/cut.png" -trim +repage -resize 682x682 \
  -background none -gravity center -extent 720x720 \
  -quality 90 -define webp:alpha-quality=100 "$out"

echo "$out"
magick "$out" -format '%wx%h, фигура %@\n' info:
