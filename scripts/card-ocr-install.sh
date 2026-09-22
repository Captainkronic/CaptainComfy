#!/usr/bin/env bash
# Install the card-ocr reader (RapidOCR in its own venv) on this machine: ~/.local/card-ocr plus a
# ~/.local/bin/card-ocr wrapper. Idempotent; deploy.sh runs it. Needs the system python3 (Xcode
# command line tools) and network for pip the first time. About 120 MB.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.local/card-ocr"
mkdir -p "$DIR" "$HOME/.local/bin"
[ -x "$DIR/venv/bin/python" ] || /usr/bin/python3 -m venv "$DIR/venv"
"$DIR/venv/bin/python" -c "import rapidocr_onnxruntime, cv2" 2>/dev/null || "$DIR/venv/bin/pip" install -q --disable-pip-version-check rapidocr_onnxruntime
cp "$HERE/card-ocr.py" "$DIR/card-ocr.py"
printf '#!/bin/sh\nexec "%s/venv/bin/python" "%s/card-ocr.py" "$@"\n' "$DIR" "$DIR" > "$HOME/.local/bin/card-ocr"
chmod +x "$HOME/.local/bin/card-ocr"
echo "card-ocr installed at $HOME/.local/bin/card-ocr"
