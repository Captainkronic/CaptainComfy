import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Settings } from '@shared/ipc'

const HOME = homedir()
export const DEFAULTS: Settings = {
  comfyHost: process.env['COMFY_HOST'] ?? 'http://127.0.0.1:8188',
  comfyDir: process.env['COMFY_DIR'] ?? '/Volumes/StudioExtend/ComfyExtend/StudioUi/ComfyUI',
  comfyModelPathsYaml: join(HOME, 'Library/Application Support/Comfy Desktop/instance-model-paths/inst-1786875206899.yaml'),
  comfyInputDir: join(HOME, 'ComfyUI-Shared/input'),
  comfyOutputDir: join(HOME, 'ComfyUI-Shared/output'),
  // No precision flags: ComfyUI picks per model, which is the only thing that works for all of them.
  // --bf16-unet was dropped on 2026-09-22 after it was traced to the black SDXL renders: it forced
  // bf16 on fp16-native SDXL checkpoints, whose attention needs the mantissa, and the sampler returned
  // an all-NaN latent for some prompt/seed/size combinations -- decoded as a solid black image, with
  // no error anywhere. Left to itself ComfyUI loads SDXL as float16 and Z-Image as bfloat16 (its
  // weights are already bf16, so the flag never bought anything), at identical memory.
  // --cache-none and --disable-smart-memory were dropped the same day: they cost ~40 s of model
  // reloading per render, and ComfyUI 0.35's RAM-pressure cache plus the app's /free calls keep the
  // 36 GB Studio out of swap without them.
  comfyFlags: ['--reserve-vram', '6', '--listen', '127.0.0.1,100.120.207.33'],
  omlxHost: process.env['OMLX_HOST'] ?? 'http://127.0.0.1:8000/v1',
  omlxModel: process.env['OMLX_MODEL'] ?? 'gemma-4-26b-a4b-it-6bit',
  releaseGemma: true,
  sshUser: 'adam',
  sshKey: join(HOME, '.ssh', 'id_ed25519'),
  remoteStartCommand: '$HOME/.local/bin/comfy-start',
  autoRestartComfy: true
}

/** Flags retired on 2026-09-22, stripped from saved settings on load. A saved copy overrides the
 *  default for ever, so changing DEFAULTS alone would have left every existing install broken: the
 *  cache pair costs ~40 s of model reloading per render, and the bf16 trio forced fp16-native SDXL
 *  checkpoints into bf16, where the sampler returns NaN latents that decode to a black image. */
const RETIRED_FLAGS = ['--cache-none', '--disable-smart-memory', '--bf16-unet', '--bf16-vae', '--bf16-text-enc']

export class SettingsStore {
  private data: Settings
  constructor(private readonly file: string) {
    this.data = { ...DEFAULTS }
    try {
      if (existsSync(file)) this.data = { ...DEFAULTS, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>) }
    } catch { /* corrupt file: fall back to defaults, never crash on boot */ }
    const kept = (this.data.comfyFlags ?? []).filter((f) => !RETIRED_FLAGS.includes(f))
    if (kept.length !== (this.data.comfyFlags ?? []).length) {
      console.log(`[lite] dropped retired ComfyUI flags from saved settings: ${(this.data.comfyFlags ?? []).filter((f) => RETIRED_FLAGS.includes(f)).join(' ')}`)
      this.update({ comfyFlags: kept })
    }
  }
  get(): Settings { return { ...this.data } }
  update(patch: Partial<Settings>): Settings {
    this.data = { ...this.data, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    return this.get()
  }
}
