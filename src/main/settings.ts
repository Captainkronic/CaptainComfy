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
  // The flags proven on this Mac on 2026-09-13. bf16 is the correct precision for these
  // models on Metal; reserve/cache/smart-memory keep a 36 GB machine out of swap storms.
  comfyFlags: ['--reserve-vram', '6', '--cache-none', '--disable-smart-memory', '--bf16-unet', '--bf16-vae', '--bf16-text-enc', '--listen', '127.0.0.1,100.120.207.33'],
  omlxHost: process.env['OMLX_HOST'] ?? 'http://127.0.0.1:8000/v1',
  omlxModel: process.env['OMLX_MODEL'] ?? 'gemma-4-E4B-it-MLX-4bit',
  releaseGemma: true
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
