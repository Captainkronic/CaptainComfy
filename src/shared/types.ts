export type Kind = 'image' | 'music'

export interface ImageParams {
  prompt: string
  enrich: boolean
  aspect: AspectKey
  megapixels: number   // 0.5 .. 2.0
  count: number        // 1 .. 4
  steps: number        // 4 .. 12 (Turbo)
  seed: number | null  // null = random
}

export interface MusicParams {
  style: string
  lyrics: string       // theme, tagged lyrics, or "[instrumental]"
  enrich: boolean
  seconds: number      // 10 .. 240
  bpm: number
  steps: number
  seed: number | null
}

export type AspectKey = '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9'
export const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  '1:1': { w: 1, h: 1, label: 'Square' },
  '3:2': { w: 3, h: 2, label: 'Photo' },
  '2:3': { w: 2, h: 3, label: 'Portrait photo' },
  '4:3': { w: 4, h: 3, label: 'Standard' },
  '3:4': { w: 3, h: 4, label: 'Portrait' },
  '16:9': { w: 16, h: 9, label: 'Widescreen' },
  '9:16': { w: 9, h: 16, label: 'Phone' },
  '21:9': { w: 21, h: 9, label: 'Ultrawide' }
}

export interface Output {
  filename: string
  subfolder: string
  type: 'output' | 'temp'
  url: string          // lite-out://out/<subfolder>/<filename>, served by the app from the output dir
  viewUrl: string      // ComfyUI's own /view URL, kept for reference
}

export type JobStatus = 'queued' | 'enriching' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  kind: Kind
  createdAt: number
  status: JobStatus
  params: ImageParams | MusicParams
  enriched?: { prompt?: string; style?: string; lyrics?: string }
  promptId?: string
  /** 0..1 step progress inside the current node, or null when unknown (honest: no fake bars). */
  progress: number | null
  progressLabel: string
  outputs: Output[]
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface Health {
  comfy: { up: boolean; host: string; detail: string }
  omlx: { up: boolean; host: string; model: string; detail: string }
}
