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
