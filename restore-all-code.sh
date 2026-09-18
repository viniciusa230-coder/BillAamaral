#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ARCHIVE_DIR="$ROOT/archives"
PARTS=("$ARCHIVE_DIR"/LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part*)

if [ "${#PARTS[@]}" -ne 6 ]; then
  echo "Esperadas 6 partes; encontradas ${#PARTS[@]}." >&2
  exit 1
fi

TMP_ARCHIVE="${TMPDIR:-/tmp}/LicitaGestao_Todo_Codigo_Historico.tar.xz"
cat "${PARTS[@]}" | tr -d '\r\n' | base64 -d > "$TMP_ARCHIVE"

DEST="$ROOT/_historico_extraido"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xJf "$TMP_ARCHIVE" -C "$DEST"

for name in versions prototypes legacy; do
  if [ -d "$DEST/$name" ]; then
    rm -rf "$ROOT/$name"
    cp -a "$DEST/$name" "$ROOT/$name"
  fi
done

echo "Codigo historico restaurado em versions/, prototypes/ e legacy/."
