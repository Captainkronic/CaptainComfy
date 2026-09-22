import { ASPECTS, type AspectKey } from './types'

/** Width/height for an aspect + megapixel budget, snapped to a multiple (Z-Image wants 16). */
export function sizeFor(aspect: AspectKey, megapixels: number, multiple = 16): { width: number; height: number } {
  const a = ASPECTS[aspect]
  const px = Math.max(0.1, megapixels) * 1_000_000
  const unit = Math.sqrt(px / (a.w * a.h))
  const snap = (v: number): number => Math.max(multiple, Math.round(v / multiple) * multiple)
  return { width: snap(unit * a.w), height: snap(unit * a.h) }
}

/** ACE-Step accepts any positive seconds; clamp to a sane range. */
export function clampSeconds(s: number): number {
  return Math.min(240, Math.max(10, Math.round(s)))
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}

/** Image-tab quality presets: steps and pixel budget together. 'balanced' is Z-Image Turbo's own
 *  recipe (8 steps at 1 MP); the others trade one or the other for time. Seconds are measured on
 *  the Studio with the weights resident (2026-09-22). */
export type ImageQuality = 'draft' | 'fast' | 'balanced' | 'high'
export const IMAGE_QUALITY: Record<ImageQuality, { megapixels: number; steps: number; label: string; hint: string; seconds: number }> = {
  draft: { megapixels: 0.5, steps: 4, label: 'Draft', hint: '0.5 MP, 4 steps', seconds: 11 },
  fast: { megapixels: 1.0, steps: 6, label: 'Fast', hint: '1 MP, 6 steps', seconds: 35 },
  balanced: { megapixels: 1.0, steps: 8, label: 'Balanced', hint: '1 MP, 8 steps', seconds: 47 },
  high: { megapixels: 1.5, steps: 8, label: 'High', hint: '1.5 MP, 8 steps', seconds: 78 }
}
/** The preset that matches these settings, or null when they were set by hand. */
export function imageQualityOf(p: { megapixels: number; steps: number }): ImageQuality | null {
  return ((Object.keys(IMAGE_QUALITY) as ImageQuality[]).find((k) => IMAGE_QUALITY[k].megapixels === p.megapixels && IMAGE_QUALITY[k].steps === p.steps)) ?? null
}
