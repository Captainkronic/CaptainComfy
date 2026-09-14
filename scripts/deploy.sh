#!/usr/bin/env bash
# CaptainComfy deploy.
#   scripts/deploy.sh local     build here, install to ~/Applications, relaunch
#   scripts/deploy.sh macbook   sync source to the MacBook over the tailnet, build there, install, relaunch
#   scripts/deploy.sh all       both
# Override with env: MACBOOK_HOST, MACBOOK_USER, MACBOOK_KEY, REMOTE_DIR
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="CaptainComfy"
MACBOOK_HOST="${MACBOOK_HOST:-adams-macbook-pro.tailc7bb1e.ts.net}"
MACBOOK_USER="${MACBOOK_USER:-adam}"
MACBOOK_KEY="${MACBOOK_KEY:-$HOME/.ssh/id_ed25519_studio_to_macbook}"
REMOTE_DIR="${REMOTE_DIR:-\$HOME/Documents/GitHub/CaptainComfy}"
SSH=(ssh -i "$MACBOOK_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 "$MACBOOK_USER@$MACBOOK_HOST")

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }

build_and_install() {   # runs on whichever machine we are on
  export PATH="$HOME/.local/node/bin:$PATH"
  cd "$1"
  if ! command -v node >/dev/null; then
    say "installing Node LTS user-level (no sudo)"
    mkdir -p "$HOME/.local" && cd "$HOME/.local"
    V=$(curl -s --max-time 15 https://nodejs.org/dist/index.json | /usr/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print(next(r['version'] for r in d if r.get('lts')))")
    curl -sL -o node.tgz "https://nodejs.org/dist/$V/node-$V-darwin-arm64.tar.gz" && tar xzf node.tgz && rm -rf node && mv "node-$V-darwin-arm64" node && rm node.tgz
    grep -q '.local/node/bin' "$HOME/.zprofile" 2>/dev/null || echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> "$HOME/.zprofile"
    cd "$1"
  fi
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then say "npm install"; npm install --no-audit --no-fund; fi
  [ -d node_modules/electron/dist/Electron.app ] || { say "fetching Electron"; node node_modules/electron/install.js; }
  say "type-check"; npm run typecheck >/tmp/captaincomfy-typecheck.log 2>&1 || { cat /tmp/captaincomfy-typecheck.log; echo "type errors: not deploying"; exit 1; }
  say "build + package"; npm run package >/tmp/captaincomfy-package.log 2>&1 || { tail -30 /tmp/captaincomfy-package.log; exit 1; }
  say "install to ~/Applications/$APP.app"
  pkill -f "$APP.app/Contents/MacOS" 2>/dev/null || true; sleep 1
  mkdir -p "$HOME/Applications"; rm -rf "$HOME/Applications/$APP.app"; cp -R "dist/mac-arm64/$APP.app" "$HOME/Applications/"
  open -a "$HOME/Applications/$APP.app"; sleep 6
  pgrep -f "$APP.app/Contents/MacOS" >/dev/null && say "$APP is running on $(hostname)" || { echo "did not start; see ~/Library/Logs/captaincomfy/main.log"; exit 1; }
  tail -3 "$HOME/Library/Logs/captaincomfy/main.log" 2>/dev/null || true
}

deploy_local() { say "local deploy on $(hostname)"; build_and_install "$HERE"; }

deploy_macbook() {
  say "syncing source to $MACBOOK_USER@$MACBOOK_HOST:$REMOTE_DIR"
  "${SSH[@]}" "mkdir -p $REMOTE_DIR"
  rsync -a --delete --exclude node_modules --exclude dist --exclude out --exclude .DS_Store \
    -e "ssh -i $MACBOOK_KEY -o IdentitiesOnly=yes -o BatchMode=yes" "$HERE/" "$MACBOOK_USER@$MACBOOK_HOST:$REMOTE_DIR/"
  say "building on the MacBook"
  # Ship this very function to the remote shell so there is one build recipe, not two.
  "${SSH[@]}" "bash -s" <<REMOTE
$(declare -f say build_and_install)
APP="$APP"
build_and_install "$REMOTE_DIR"
REMOTE
}

case "${1:-local}" in
  local) deploy_local ;;
  macbook) deploy_macbook ;;
  all) deploy_local; deploy_macbook ;;
  *) echo "usage: $0 [local|macbook|all]"; exit 2 ;;
esac
