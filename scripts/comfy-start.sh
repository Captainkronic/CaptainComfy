#!/usr/bin/env bash
# Start the Studio's ComfyUI headlessly if nothing answers on 8188. Idempotent; safe to call
# repeatedly and from a remote ssh session. Installed to ~/.local/bin/comfy-start by deploy.sh.
set -uo pipefail
COMFY_DIR="${COMFY_DIR:-/Volumes/StudioExtend/ComfyExtend/StudioUi/ComfyUI}"
YAML="${COMFY_YAML:-$HOME/Library/Application Support/Comfy Desktop/instance-model-paths/inst-1786875206899.yaml}"
INPUT="${COMFY_INPUT:-$HOME/ComfyUI-Shared/input}"; OUTPUT="${COMFY_OUTPUT:-$HOME/ComfyUI-Shared/output}"
LISTEN="${COMFY_LISTEN:-127.0.0.1,100.120.207.33}"; PORT="${COMFY_PORT:-8188}"
LOG="$HOME/Library/Logs/captaincomfy/comfyui-headless.log"; mkdir -p "$(dirname "$LOG")"
up() { curl -s --max-time 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/system_stats" | grep -q 200; }
if up; then echo "already running"; exit 0; fi
[ -x "$COMFY_DIR/.venv/bin/python" ] || { echo "no ComfyUI at $COMFY_DIR"; exit 1; }
cd "$COMFY_DIR"
# No --cache-none / --disable-smart-memory since 2026-09-22: with ComfyUI's RAM-pressure cache the
# models stay resident between prompts (a warm Z-Image render takes 54 s instead of 94 s), the app
# frees them before Gemma loads or the model family changes, and idle-unload.py frees them after
# 15 idle minutes. Comfy Desktop's launchArgs in installations.json carry the same set.
nohup ./.venv/bin/python main.py --enable-manager --reserve-vram 6 \
  --bf16-unet --bf16-vae --bf16-text-enc --listen "$LISTEN" --port "$PORT" --disable-auto-launch \
  --extra-model-paths-config "$YAML" --input-directory "$INPUT" --output-directory "$OUTPUT" >> "$LOG" 2>&1 < /dev/null &
disown
for i in $(seq 1 60); do sleep 3; if up; then echo "started in $((i*3)) s"; exit 0; fi; done
echo "did not answer within 180 s; see $LOG"; exit 1
