# CaptainComfy

A slim desktop front end for generating **images** (Z-Image Turbo), **editing images**
(FLUX.2 Klein 4B, instruction edits) and making **music** (ACE-Step 1.5 Turbo) on the
Mac Studio, without touching the ComfyUI canvas.
ComfyUI stays as the headless engine; this app only talks to its HTTP/WebSocket
API. Results are shown through the app's own `lite-out://` scheme, which streams
files from the ComfyUI output directory: ComfyUI 0.33 answers **403** to any request
marked `Sec-Fetch-Site: cross-site`, which is what an Electron page's `<img>` loads
are, so its `/view` URLs cannot be used directly from the renderer (kept as `viewUrl`
for reference).

Short prompts are optionally rewritten by **Gemma 4 E4B** running in oMLX
(`127.0.0.1:8000`) with a task-specific brief (image / music style / lyrics),
and the rewrite is shown on the job card so you always see what was sent.

## Deploy (the normal way to ship a change)

```bash
npm run deploy            # build here, install to ~/Applications, relaunch
npm run deploy:macbook    # rsync source to the MacBook over the tailnet, build there, install, relaunch
npm run deploy:all        # both
```

`scripts/deploy.sh` holds one build recipe and runs it on either machine. It installs Node
user-level if a machine lacks it, so a fresh Mac needs nothing but Tailscale and ssh access.
Hosts, user, key and remote path are variables at the top (or `MACBOOK_HOST=…` env).

## Run (development)

```bash
npm install            # once; also downloads the Electron binary
npm run build && npm start
```

`npm run dev` gives hot reload. `npm run package` produces `dist/mac-arm64/CaptainComfy.app`.

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
Every result has **Download** (saves to a location you pick, default ~/Downloads, fetched over the
tailnet when remote). "Show in Finder" appears only where the output folder actually exists (the Studio).

**Studio side (done on 2026-09-13):** Comfy Desktop's launch args include
`--listen 127.0.0.1,100.120.207.33`, so ComfyUI listens on loopback *and* its
tailnet address, never on the LAN. oMLX already listens on all interfaces. There is
no authentication on either service; the tailnet is the boundary, which is the same
posture as LM Studio and oMLX here.

### On the MacBook

```bash
git clone https://github.com/Captainkronic/CaptainComfy.git
cd CaptainComfy
npm install
npm run package      # -> dist/mac-arm64/CaptainComfy.app
```

Nothing else to install: no Python, no models, no ComfyUI.

## Suggestions

Every prompt box opens pre-filled with an idea, and **⟳ New idea** swaps in another. Ideas are
assembled from curated parts in `src/shared/ideas.ts` (subjects, settings, light, lens, style;
genres with their own tempo range, instruments, moods, vocals; edit operations; lyric themes),
which gives well over 100,000 distinct image prompts and thousands of music styles, each with a
bpm that fits its genre. About one in seven picks is one of the hand-written seeds in
`suggestions.ts`. Edit either file to steer the vocabulary.

## Cards

The **Card** tab is the Card-Generator workflow (`~/Documents/Card-Generator/AGENTS.md`) without the
agent. You fill in who the card is for, their age, what they love, the lettering (top lines and a
sign-off, exactly as they must appear), a look and a palette; the app assembles the prompt in the
guide's order (format + medium, top lettering, scene, bottom lettering, lettering lock, palette +
mood) and shows it in full, editable, with a word count against the 320-word ceiling.

- **Gemma drafts only the scene paragraph**, at form time, into an editable box (`card_scene` brief
  in `src/shared/enrich.ts`). The lettering is never given to an LLM, and rendering needs no Gemma,
  so re-rolls are pure ComfyUI time.
- **Lettering is read back by two independent literal readers**: macOS Vision with language
  correction off (`src/main/ocr.ts`, compiled on first use with the Xcode command line tools) and
  RapidOCR (PaddleOCR v4 on ONNX, `scripts/card-ocr.py`, installed by `deploy.sh` as
  `~/.local/bin/card-ocr` on the machine that runs ComfyUI and called there over ssh, so nothing is
  downloaded first). Neither has a language model, so neither "corrects" a real misspelling; each
  has its own blind spot (Vision reads a fat rounded D as O, RapidOCR drops spaces), so a phrase is
  confirmed when either reads it letter for letter and the comparison ignores spaces. Benchmarked on
  14 cards / 43 phrases on 2026-09-22: Vision 40 exact, RapidOCR 43, together no false alarm;
  Tesseract (20) and a 4B vision LLM (42, but it invents doubled words) were rejected. Verdicts:
  pass / look at these letters / wrong. When no candidate is at least a "look", the same prompt goes
  again on a new seed, up to the attempts you allow (the guide's budget is 6).
- Sizes are the tested card presets (880x1232 for a standard 5x7 portrait; `final` is 1.6 MP), 8
  steps, candidates rendered as one batch. Same seed + edited prompt keeps the layout; **Re-roll**
  and **Edit this prompt** on every finished card do the two moves of the guide's playbook.
- Print advice: `final.png` at 5x7 in on heavy matte card stock, or a photo service as a 5x7.

## What makes generation fast (and what makes it slow)

Measured on the Studio (M4 Max, 36 GB) on 2026-09-22, Z-Image at 880x1232, 8 steps at about
6.4 s each: with the old `--cache-none --disable-smart-memory` flags every render took **102 s**,
about 40 s of it reloading the 7.7 GB text encoder and the 11.7 GB UNet. Without those flags
(applied that day to Comfy Desktop's `launchArgs` in `installations.json` and to
`scripts/comfy-start.sh`) a cold render takes 94 s, a **warm re-roll 54 s** and a warm edited prompt
57 s; encoding the prompt on the CPU costs only ~4 s, so `--gpu-only` was not worth its risk.
ComfyUI 0.35's default RAM-pressure cache evicts by itself when memory gets tight. The app's side:

- **Pre-warming**: once a card has its scene (on opening the tab, after a Gemma draft, after editing
  the scene), the app submits a 1-step 256x256 prompt that loads the Z-Image weights while you are
  still reading (`warmupGraph`, `JobManager.warm`). Measured: 48 s from cold, 0.0 s when already
  warm (ComfyUI answers from cache), and the real render afterwards takes 55 s instead of 94.
  Idle only, debounced to once a minute, and it releases Gemma first.
- **Quality presets**, the same words on both tabs. Image tab (per image, warm): Draft 0.5 MP /
  4 steps 11 s, Fast 1 MP / 6 steps 35 s, Balanced 1 MP / 8 steps 47 s (the model's recipe), High
  1.5 MP / 8 steps 78 s, Ultra 1.5 MP / 12 steps 108 s, Print 1.5 MP / 8 steps + RealESRGAN 2x
  (2464 px) 80 s; Detail, Steps, Upscale and Seed stay under Advanced and show "custom" when
  edited. Card tab (per candidate): Draft 4 steps 28 s, Fast 6 steps 40 s, Balanced 8 steps 55 s,
  High 1072x1504 91 s, Print = High upscaled 2x to 2144x3008 (about 430 dpi at 5x7) 97 s; a card's
  Draft keeps the full size because lettering needs the pixels. In the test renders the lettering
  held at 6 and 4 steps, and through the upscale, but few samples are not proof, so Balanced stays
  the default.
- **Sampling above 1.5 MP is not survivable on the 36 GB Studio**: a 2 MP render took the kernel to
  critical memory pressure and the guard killed ComfyUI. Hence the tiers above High add steps or
  upscale (RealESRGAN x4plus, the official release, in `~/ComfyUI-Shared/models/upscale_models`,
  tiled by ComfyUI, ~3 s at 1.5 MP) rather than a bigger canvas. 1.5 MP peaks at ~8.5 GB of swap.
- The warm-up carries the card's own prompt, so its text encoding is cached and the real render
  starts sampling within a couple of seconds.
- **Measured and rejected** on the M4 Max (2026-09-22), so nobody has to try them again:
  `--use-pytorch-cross-attention` (8.4 s/step instead of 6.4, and its full attention matrix pushed
  available RAM under 2 GB, so the memory guard killed ComfyUI; the default sub-quadratic attention
  is the right one on MPS), `--fp16-unet` (7.4 s/step: bf16 is native here and the weights are
  bf16), `--fp16-vae` (saves ~1 s of decode, not worth the black-image caveat), `--disable-mmap`
  (53 s to step 1 cold, no better than mmap), `TorchCompileModel` (inductor's Metal backend cannot
  find its own `c10/metal/utils.h` on this torch build), and batching candidates (each image costs
  its full sampling time on MPS; only the load is shared). torch is 2.12.1 already.
- Card renders use no Gemma at job time; a scene drafted in the form leaves Gemma resident, and the
  job pump releases it before submitting anyway (`gemmaResident()` in `src/main/enrich.ts`).
- Gemma as configured (`gemma-4-26b-a4b-it-6bit`, 21 GB) cannot share the machine with Z-Image
  (20 GB): every Gemma load goes through `JobManager.loadGemma`, which first POSTs ComfyUI `/free`
  (unload models, drop the node cache). Drafting a scene is refused while a job is running.
- Consecutive jobs of one model family reuse whatever ComfyUI keeps resident; a switch (image → music)
  frees the old weights first (`modelFamily` in `src/shared/graphs.ts`). On the Studio,
  `~/.config/comfy-mcp/idle-unload.py` frees the resident models after 15 idle minutes, and
  `~/bin/comfy-memory-guard.sh` kills ComfyUI if memory runs out.
- **Recovery and guardrails** (after five memory-guard kills on 2026-09-22, all traced in ComfyUI's
  log): candidates render as separate prompts, never a batch (same time on MPS, a fraction of the
  memory); every Z-Image decode is tiled (`VAEDecodeTiled`), so decoding never forces the UNet out to
  CPU copies; sampling is capped at 1.6 MP per image; before each render the host's free RAM is
  checked and ComfyUI freed first under 10 GB; after asking ComfyUI to free, the app waits until free
  RAM has really come back before loading Gemma (ComfyUI only drops weights when its garbage
  collector runs, up to 10 s later); a job ComfyUI loses to a restart waits for it, **starts it
  itself after 20 s** (Settings toggle; the Start button's path, on the Studio `comfy-start` over
  ssh), and resubmits, resuming at the candidate it was on, twice at most before failing with a
  reason; on a relaunch the app reattaches to a prompt ComfyUI is still running, re-queues jobs that
  were waiting or enriching, and recovers finished ones from history; a power-save blocker keeps
  the app awake while a remote render is in flight.

## Image editing

The **Edit** tab takes a source image and an instruction. A file you pick is uploaded to
ComfyUI's input folder at job time under a unique name, so it works identically from the
Studio and from the MacBook. **Every result in the Image, Card and Edit tabs has an ✎ Edit
button** that sends it here instead: ComfyUI reads it in place from its output folder
(`LoadImage` with a `name [output]` annotation, `annotatedSource` in `src/shared/graphs.ts`),
nothing is uploaded, and the edited image gets its own ✎ Edit button, so edits chain. The graph is ComfyUI's own FLUX.2 Klein 4B distilled edit
recipe (reference latent on positive and zeroed negative, cfg 1, euler, 4 steps, canvas
sized from the scaled source) and matches the "Easy Image to Image" template in ComfyUI.
Gemma's `image_edit` brief rewrites the request into a precise instruction that preserves
everything you did not mention.

## Starting ComfyUI from the MacBook

If ComfyUI on the Studio is down, the banner's **Start it on the Studio** button sshes to the
ComfyUI host (Settings: ssh user, key, command) and runs `~/.local/bin/comfy-start`, which
`npm run deploy` installs on the Studio from `scripts/comfy-start.sh`. The script is idempotent:
it exits at once if 8188 already answers, otherwise starts ComfyUI headless with the proven
flags, listening on loopback and the tailnet IP, and waits until it responds. The MacBook's
`~/.ssh/id_ed25519` is authorized on the Studio; the app never handles passwords.

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
  Z-Image: res_multistep, cfg 1, shift 3, 8 steps. Klein edit: euler, cfg 1, 4 steps, Flux2Scheduler. ACE-Step: euler, cfg 1, shift 3, 8 steps, one
  duration value driving both encoder and latent. Do not switch the image sampler to `uni_pc` on
  Apple Silicon; it produces garbage.
- Progress is only what ComfyUI reports: the current node's name, and a step bar only while the
  sampler emits step counts. No fabricated percentages.
- Jobs persist in `~/Library/Application Support/captaincomfy/jobs.json`; settings (hosts,
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
