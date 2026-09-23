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

/** Image-tab presets live per model in models.ts; these are Z-Image Turbo's, kept under the old name. */
export { imageQualityOf, type ImageQuality } from './models'
import { IMAGE_MODELS } from './models'
export const IMAGE_QUALITY = IMAGE_MODELS.zimage.presets

/** Edit-tab presets for FLUX.2 Klein 4B (distilled for 4 steps, so Balanced is the recipe and there is no
 *  tier below it but a smaller canvas). Seconds measured on the Studio with Klein resident (2026-09-22). */
export type EditQuality = 'draft' | 'balanced' | 'high' | 'ultra' | 'print'
export const EDIT_QUALITY: Record<EditQuality, { megapixels: number; steps: number; upscale: number; label: string; hint: string; seconds: number }> = {
  draft: { megapixels: 0.5, steps: 4, upscale: 1, label: 'Draft', hint: '0.5 MP, 4 steps', seconds: 20 },
  balanced: { megapixels: 1.0, steps: 4, upscale: 1, label: 'Balanced', hint: '1 MP, 4 steps', seconds: 37 },
  high: { megapixels: 1.5, steps: 4, upscale: 1, label: 'High', hint: '1.5 MP, 4 steps', seconds: 66 },
  ultra: { megapixels: 1.5, steps: 8, upscale: 1, label: 'Ultra', hint: '1.5 MP, 8 steps', seconds: 116 },
  print: { megapixels: 1.5, steps: 4, upscale: 2, label: 'Print', hint: '1.5 MP, 2x upscale', seconds: 71 }
}
export function editQualityOf(p: { megapixels: number; steps: number; upscale?: number }): EditQuality | null {
  return ((Object.keys(EDIT_QUALITY) as EditQuality[]).find((k) => EDIT_QUALITY[k].megapixels === p.megapixels && EDIT_QUALITY[k].steps === p.steps && EDIT_QUALITY[k].upscale === (p.upscale ?? 1))) ?? null
}
