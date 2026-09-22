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
# One ComfyUI only. A backend that is not the one on 8188 (Comfy Desktop's, pushed to 8189 because the
# port was taken, or a leftover) would load a second 20 GB copy of the weights; 36 GB cannot hold two.
for p in $(pgrep -f "python.*main\.py"); do
  ps -o command= -p "$p" | grep -q "ComfyUI" || continue
  echo "stopping duplicate ComfyUI $p"; kill "$p" 2>/dev/null
done
# After a memory-guard kill the kernel needs a moment to reclaim the dead process and its swap; a cold
# load started too soon reached critical pressure and was killed again (2026-09-22 14:58). Wait for
# free + inactive memory to come back to at least 20 GB, up to 90 s.
for i in $(seq 1 30); do
  avail=$(vm_stat | awk '/page size/{ps=$8} /Pages free/{gsub(/\./,"",$3); f=$3} /Pages inactive/{gsub(/\./,"",$3); i=$3} END{printf "%d", (f+i)*ps/1073741824}')
  [ "${avail:-0}" -ge 20 ] && break
  [ "$i" -eq 1 ] && echo "waiting for memory to settle (${avail} GB available)"
  sleep 3
done
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
