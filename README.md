# CaptainLlama Lite

A slim desktop front end for generating **images** (Z-Image Turbo) and **music**
(ACE-Step 1.5 Turbo) on the Mac Studio, without touching the ComfyUI canvas.
ComfyUI stays as the headless engine; this app only talks to its HTTP/WebSocket
API. Results are shown through the app's own `lite-out://` scheme, which streams
files from the ComfyUI output directory: ComfyUI 0.33 answers **403** to any request
marked `Sec-Fetch-Site: cross-site`, which is what an Electron page's `<img>` loads
are, so its `/view` URLs cannot be used directly from the renderer (kept as `viewUrl`
for reference).

Short prompts are optionally rewritten by **Gemma 4 E4B** running in oMLX
(`127.0.0.1:8000`) with a task-specific brief (image / music style / lyrics),
and the rewrite is shown on the job card so you always see what was sent.

## Run

```bash
npm install            # once; also downloads the Electron binary
npm run build && npm start
```

`npm run dev` gives hot reload. `npm run package` produces `dist/mac-arm64/CaptainLlama Lite.app`.

## Portable: run it on the MacBook, generate on the Studio

The app is a thin client. Open **Settings** and pick **Studio over Tailscale**
(or type the hosts by hand):

| | Host |
|---|---|
| ComfyUI | `http://adams-mac-studio.tailc7bb1e.ts.net:8188` |
| Gemma via oMLX | `http://adams-mac-studio.tailc7bb1e.ts.net:8000/v1` |

On first launch, if nothing answers on localhost but the Studio does, the app
switches itself to the Studio and logs that it did.

Results are fetched by the app's main process from ComfyUI's `/view` endpoint and
handed to the UI through `lite-out://`, so nothing needs to be mounted or shared.
"Show in Finder" only works where the output folder actually exists (the Studio).

**Studio side (done on 2026-09-13):** Comfy Desktop's launch args include
`--listen 127.0.0.1,100.120.207.33`, so ComfyUI listens on loopback *and* its
tailnet address, never on the LAN. oMLX already listens on all interfaces. There is
no authentication on either service; the tailnet is the boundary, which is the same
posture as LM Studio and oMLX here.

### On the MacBook

```bash
git clone git@github.com:Captainkronic/captainllama-lite.git
cd captainllama-lite
npm install
npm run package      # -> dist/mac-arm64/CaptainLlama Lite.app
```

Nothing else to install: no Python, no models, no ComfyUI.

## Gemma lifecycle

With **Load Gemma only for enrichment** on (the default), each job does:
load Gemma in oMLX → rewrite the prompt(s) → **unload Gemma** → submit to ComfyUI.
oMLX drops from ~7 GB to ~300 MB before the image or music model loads, which is
the difference between comfortable and cramped on a 36 GB Studio. It costs about
12 s per job to reload. Turn it off in Settings if you would rather keep Gemma
resident. Uses oMLX's admin API (`/admin/api/models/<id>/load|unload`), which is
unauthenticated on this host.

## How it fits the machine

- Uses the ComfyUI backend on `127.0.0.1:8188` if one is running (Comfy Desktop's, or its own).
  If nothing answers, the **Start it** banner launches the StudioUi install headlessly with the
  flags proven on 2026-09-13: `--reserve-vram 6 --cache-none --disable-smart-memory --bf16-unet
  --bf16-vae --bf16-text-enc`, the Comfy Desktop model-paths YAML, and `~/ComfyUI-Shared` for
  input/output.
- Recipes live in `src/shared/graphs.ts` and are the same graphs as the "Easy" templates in ComfyUI.
  Z-Image: res_multistep, cfg 1, shift 3, 8 steps. ACE-Step: euler, cfg 1, shift 3, 8 steps, one
  duration value driving both encoder and latent. Do not switch the image sampler to `uni_pc` on
  Apple Silicon; it produces garbage.
- Progress is only what ComfyUI reports: the current node's name, and a step bar only while the
  sampler emits step counts. No fabricated percentages.
- Jobs persist in `~/Library/Application Support/captainllama-lite/jobs.json`; settings (hosts,
  ComfyUI dir, flags, Gemma model) in `settings.json` next to it. Env overrides: `COMFY_HOST`,
  `COMFY_DIR`, `OMLX_HOST`, `OMLX_MODEL`.

## Layout

```
src/shared   types, sizing, graphs (recipes), enrich briefs, IPC contract
src/main     comfy client (HTTP + WS), oMLX enrichment, sequential job manager, settings, window
src/preload  the only bridge: window.lite.invoke / .on
src/renderer React + zustand: Image tab, Music tab, job list with inline results
scripts/     node --test unit tests for sizing and graph wiring
```

## Tests

```bash
npm test
```

Type-checks both tsconfigs and runs the unit tests (sizing snaps to 16, graph wiring, lyrics guard).
