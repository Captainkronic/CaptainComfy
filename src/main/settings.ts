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
  // bf16 is the correct precision for these models on Metal. --cache-none and --disable-smart-memory
  // were dropped on 2026-09-22: they cost ~40 s of model reloading per render, and ComfyUI 0.35's
  // RAM-pressure cache plus the app's /free calls keep the 36 GB Studio out of swap without them.
  comfyFlags: ['--reserve-vram', '6', '--bf16-unet', '--bf16-vae', '--bf16-text-enc', '--listen', '127.0.0.1,100.120.207.33'],
  omlxHost: process.env['OMLX_HOST'] ?? 'http://127.0.0.1:8000/v1',
  omlxModel: process.env['OMLX_MODEL'] ?? 'gemma-4-26b-a4b-it-6bit',
  releaseGemma: true,
  sshUser: 'adam',
  sshKey: join(HOME, '.ssh', 'id_ed25519'),
  remoteStartCommand: '$HOME/.local/bin/comfy-start'
}

export class SettingsStore {
  private data: Settings
  constructor(private readonly file: string) {
    this.data = { ...DEFAULTS }
    try {
      if (existsSync(file)) this.data = { ...DEFAULTS, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>) }
    } catch { /* corrupt file: fall back to defaults, never crash on boot */ }
  }
  get(): Settings { return { ...this.data } }
  update(patch: Partial<Settings>): Settings {
    this.data = { ...this.data, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    return this.get()
  }
}
