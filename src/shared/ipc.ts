import type { EditParams, Health, ImageParams, Job, MusicParams, Output } from './types'

export interface Settings {
  comfyHost: string          // http://127.0.0.1:8188
  comfyDir: string           // .../StudioUi/ComfyUI  (has main.py and .venv)
  comfyModelPathsYaml: string
  comfyInputDir: string
  comfyOutputDir: string
  comfyFlags: string[]
  omlxHost: string           // http://127.0.0.1:8000/v1
  omlxModel: string
  /** Load Gemma only for the enrichment step and unload it before ComfyUI starts, so its ~7 GB is free during generation. */
  releaseGemma: boolean
}

export interface IpcApi {
  'settings:get': () => Promise<Settings>
  'settings:update': (patch: Partial<Settings>) => Promise<Settings>
  'health:get': () => Promise<Health>
  'settings:presets': () => Promise<{ local: { comfyHost: string; omlxHost: string }; studio: { comfyHost: string; omlxHost: string } }>
  'comfy:start': () => Promise<{ ok: boolean; detail: string }>
  'jobs:list': () => Promise<Job[]>
  'jobs:submitImage': (p: ImageParams) => Promise<Job>
  'jobs:submitMusic': (p: MusicParams) => Promise<Job>
  'jobs:submitEdit': (p: EditParams) => Promise<Job>
  /** Native open dialog; returns the path plus a small data: URL preview the renderer may show. */
  'dialog:pickImage': () => Promise<{ path: string; name: string; preview: string } | null>
  'jobs:cancel': (id: string) => Promise<void>
  'jobs:clearFinished': () => Promise<void>
  'enrich:preview': (mode: 'image' | 'image_edit' | 'music_style' | 'music_lyrics', text: string) => Promise<{ text: string; used: boolean; detail: string }>
  'shell:reveal': (output: Output) => Promise<void>
  'shell:open': (output: Output) => Promise<void>
}
export type IpcChannel = keyof IpcApi

export interface IpcEvents {
  'event:job': Job
  'event:health': Health
}
export type IpcEventChannel = keyof IpcEvents
export const IPC_EVENT_CHANNELS: IpcEventChannel[] = ['event:job', 'event:health']
