#!/bin/sh
# Comprime un video de divulgación para la web: H.264 + AAC, hasta 720 px de alto, con la
# información al principio del archivo para que empiece a reproducirse antes de bajarse entero.
# Uso: tools/comprimir_video.sh ENTRADA SALIDA [CRF]   (CRF 28 por defecto; subirlo achica el archivo)
set -e
[ $# -ge 2 ] || { echo "Uso: $0 ENTRADA SALIDA [CRF]"; exit 1; }
CRF="${3:-28}"
mkdir -p "$(dirname "$2")"
ffmpeg -y -v error -i "$1" -vf "scale=-2:'min(720,ih)'" -c:v libx264 -preset slow -crf "$CRF" \
  -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$2"
BYTES=$(wc -c < "$2")
echo "$2: $((BYTES / 1024 / 1024)) MB"
[ "$BYTES" -le 10485760 ] || echo "AVISO: pesa más de 10 MB; probar con un CRF mayor (p. ej. $0 $1 $2 $((CRF + 3)))"
