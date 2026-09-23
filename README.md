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
**🗑 Delete** removes the PNG for good, after a modal confirmation: on this Mac when ComfyUI is local,
otherwise over ssh on the machine that made it — never the local copy, because both Macs keep an
output folder at the same path and a name like `image_00069_.png` exists on each with different
pictures inside. The name has to pass `safeResultName` first, so only ordinary result names resolve,
and the result is then dropped from the job.

Runs themselves are cleared separately, and this never touches a file. Every finished run has **🗑 Delete** in its header (**Delete run** when it still has images, to keep it distinct from the Delete under an image), and the results header carries **🗑 Delete N cancelled or failed** to sweep the ones that produced nothing — the pile that actually accumulates. A run still queued or rendering is refused with a message: cancel it first, so the pump never loses a job under itself. `Clear finished` remains the blunt instrument that drops every finished run of that kind.

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
assembled from curated parts in `src/shared/ideas.ts`: ~115 million distinct image prompts, ~437,000
music styles each with a bpm that fits its genre, and ~6,000 lyric themes. About one in twelve picks
is one of the hand-written seeds in `suggestions.ts`. Edit either file to steer the vocabulary.

**Shapes, not one template.** The first version emitted `<subject> <setting>, <light>, <lens>,
<style>` every single time, so despite tens of thousands of combinations every idea read as the same
sentence with the nouns swapped — the complaint was that it repeated itself, and the template was the
repetition. Images now pick between thirteen shapes (a person mid-action, a ready-made vignette, a
moment happening around someone, wildlife, an empty place, a still life, an interior, a genre scene,
a deliberate absurdity, a design brief, a period piece, pure texture, food) and music between five
(genre-led, written as a brief for a use, two genres crossed, led by one instrument, described by its
production).

**Things that have to agree.** A flat list of parts produces nonsense, so the vocabulary is tagged:
subjects carry where they belong (a glassblower indoors, a shepherd outdoors, a monk either), light
follows the room (no projector beam on a hilltop chapel), outdoor-only actions never land indoors (no
sheltering under an awning inside a boxing gym), subjects that name their own setting do not get a
second one (no busy kitchen inside an aircraft hangar), animals get actions and places that suit land,
water or air (no cat caught mid-flight, no dolphin in tall grass), and two genres only fuse when
their tempo ranges overlap, so the bpm stays honest for both names.

**A short memory.** `fresh()` holds the last eight head-words per kind and re-rolls when one comes up
again, so you do not get three lighthouses in a row just because the dice said so. Measured: 0.45
repeated head-words per twelve image ideas, 0.22 repeated lyric ideas per eight.

## Image models

The Image tab's **Model** toggle (`src/shared/models.ts`) offers what the Studio has: **Z-Image Turbo**
(the default; 8 steps, no guidance, and the one that draws lettering),
**Juggernaut Z** (RunDiffusion's fine-tune of Z-Image *Base*: 35 steps at CFG 6 per its model card,
two model passes per step, measured 380 s warm at 1 MP; beautiful, film-like, slow), and the SDXL
checkpoints **Juggernaut XI**, **Juggernaut Ragnarok** and **RealVisXL V5** (30 steps at CFG 5,
DPM++ 2M Karras, sizes snapped to 8, the fp16-fix VAE, Balanced 47 s warm). Each model carries its own quality table, and the job
pump treats each as its own family, freeing one before loading another. Wan 2.2 (video) and Stable
Audio are not image models.

### The black SDXL renders, and what they actually were

Both SDXL checkpoints returned solid black images for some prompt/seed/size combinations — no error,
`Prompt executed` in the log, a 4.5 KB PNG. The first diagnosis (2026-09-22) blamed the VAE and
switched to the fp16-fix one; that was wrong, and only changed which seeds happened to survive.

Re-running one failing render (`seed 3804137162`, 1224²) through a plain `VAEDecode`, through the
checkpoint's own VAE and through the tiled decode gave the same black frame every time: **the latent
was already NaN when it left the sampler.** The cause was `--bf16-unet` in the Studio's launch args,
added for Z-Image. SDXL checkpoints are fp16-native and their attention needs the mantissa; bf16 has
7 bits against fp16's 10, so some combinations overflowed to NaN. Nothing else explained it —
changing sampler, scheduler, CFG, negative prompt or canvas each rescued *some* cases and not others.

Dropping the flag fixed every previously-black case (4 of 4, unchanged prompts and seeds). ComfyUI
now chooses: `float16` for SDXL, `bfloat16` for Z-Image (whose weights are bf16 already, so the flag
never bought anything), at identical memory — 4.9 GB for SDXL, 11.7 GB for the Z-Image UNet. The
flags are gone from `settings.ts`, `~/.local/bin/comfy-start` and Comfy Desktop's `installations.json`
(backups `*.bak-20260922-bf16`). **A black render means NaN in sampling — look at precision, not the VAE.**

### What each one costs the Studio

Measured 2026-09-22 on the 36 GB Studio: free RAM at idle minus the floor during a render, at 1 MP.

| Model | Weights | Peak | Free while rendering | Largest canvas |
|---|---|---|---|---|
| Z-Image Turbo | 11.5 GB UNet + 7.5 GB Qwen3 | **20.8 GB** | 5.6 GB (4.0 GB at 1.5 MP) | 1.5 MP |
| Juggernaut Z | the same, plus a guidance pass | **24.0 GB** | 5.4 GB | **1.0 MP** |
| Juggernaut XI | one 6.6 GB SDXL checkpoint | **12.7 GB** | 18.3 GB (17.1 at 1.5 MP) | 1.5 MP |
| Juggernaut Ragnarok | one 6.6 GB SDXL checkpoint | **12.5 GB** | ~17.5 GB (cost-derived) | 1.5 MP |
| RealVisXL V5 | one 6.5 GB SDXL checkpoint | **12.3 GB** | 14.8 GB (13.6 at 1.5 MP) | 1.5 MP |

The Z-Image family is heavy because its 11.5 GB UNet needs the 7.5 GB Qwen3 text encoder beside it,
where an SDXL checkpoint carries its UNet, both CLIPs and a VAE in one 6.6 GB file. CFG above 1 adds
a second model pass per step, which is why Juggernaut Z costs ~3 GB more than Turbo on the same
weights — and why at 1.5 MP it reached critical kernel pressure and `comfy-memory-guard.sh` SIGKILLed
ComfyUI mid-render. Its ceiling is therefore 1.0 MP: High and Ultra buy quality with steps, and Print
reaches print size through the tiled RealESRGAN upscale, which costs almost nothing.
`ImageModelSpec.memory` holds these figures, the form shows them under the Model toggle, and the pump
caps any job to its model's `maxMegapixels`.

## What makes generation fast (and what makes it slow)

Measured on the Studio (M4 Max, 36 GB) on 2026-09-22, Z-Image at 880x1232, 8 steps at about
6.4 s each: with the old `--cache-none --disable-smart-memory` flags every render took **102 s**,
about 40 s of it reloading the 7.7 GB text encoder and the 11.7 GB UNet. Without those flags
(applied that day to Comfy Desktop's `launchArgs` in `installations.json` and to
`scripts/comfy-start.sh`) a cold render takes 94 s, a **warm re-roll 54 s** and a warm edited prompt
57 s; encoding the prompt on the CPU costs only ~4 s, so `--gpu-only` was not worth its risk.
ComfyUI 0.35's default RAM-pressure cache evicts by itself when memory gets tight. The app's side:

- **Quality presets**. Image tab (per image, warm): Draft 0.5 MP /
  4 steps 11 s, Fast 1 MP / 6 steps 35 s, Balanced 1 MP / 8 steps 47 s (the model's recipe), High
  1.5 MP / 8 steps 78 s, Ultra 1.5 MP / 12 steps 108 s, Print 1.5 MP / 8 steps + RealESRGAN 2x
  (2464 px) 80 s; Detail, Steps, Upscale and Seed stay under Advanced and show "custom" when
  edited.
- **Sampling above 1.5 MP is not survivable on the 36 GB Studio**: a 2 MP render took the kernel to
  critical memory pressure and the guard killed ComfyUI. Hence the tiers above High add steps or
  upscale (RealESRGAN x4plus, the official release, in `~/ComfyUI-Shared/models/upscale_models`,
  tiled by ComfyUI, ~3 s at 1.5 MP) rather than a bigger canvas. 1.5 MP peaks at ~8.5 GB of swap.
- **Measured and rejected** on the M4 Max (2026-09-22), so nobody has to try them again:
  `--use-pytorch-cross-attention` (8.4 s/step instead of 6.4, and its full attention matrix pushed
  available RAM under 2 GB, so the memory guard killed ComfyUI; the default sub-quadratic attention
  is the right one on MPS), `--fp16-unet` (7.4 s/step *on Z-Image*, whose weights are bf16 — these
  precision timings are per model, which is exactly why no precision flag is forced globally any
  more; see the black SDXL renders above), `--fp16-vae` (saves ~1 s of decode), `--disable-mmap`
  (53 s to step 1 cold, no better than mmap), `TorchCompileModel` (inductor's Metal backend cannot
  find its own `c10/metal/utils.h` on this torch build), and batching candidates (each image costs
  its full sampling time on MPS; only the load is shared). torch is 2.12.1 already.
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
Studio and from the MacBook. **Every result in the Image and Edit tabs has an ✎ Edit
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
  If nothing answers, the **Start it** banner launches the StudioUi install headlessly with
  `--reserve-vram 6` and no precision flags (the cache flags went on 2026-09-22 for speed, the bf16
  ones the same day for the black SDXL renders above), the Comfy Desktop model-paths YAML, and
  `~/ComfyUI-Shared` for input/output.
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
