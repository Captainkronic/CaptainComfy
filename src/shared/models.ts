/**
 * The image models the Image tab can use, with what makes each one different: files, recipe (steps,
 * guidance, sampler, negative prompt), size snapping and its own quality presets. Everything else
 * (the form, the job pump, the memory choreography) is model-agnostic. Cards stay on Z-Image Turbo:
 * it is the one that renders lettering reliably.
 */
export type ImageModel = 'zimage' | 'juggernaut-z' | 'juggernaut-xi' | 'realvisxl'
export type ImageQuality = 'draft' | 'fast' | 'balanced' | 'high' | 'ultra' | 'print'
export interface QualityPreset { megapixels: number; steps: number; upscale: number; label: string; hint: string; seconds: number }

export interface ImageModelSpec {
  label: string
  blurb: string
  /** How the graph is built: Z-Image family (UNET + Qwen3 text encoder + ae VAE) or an SDXL checkpoint. */
  kind: 'zimage' | 'sdxl'
  /** Weights that must not share the Studio with another family's: the pump frees ComfyUI on a change. */
  family: string
  files: { unet?: string; ckpt?: string; clip?: string; vae?: string }
  recipe: { cfg: number; sampler: string; scheduler: string; shift?: number; negative: string }
  /** Latent size multiple: 16 for Z-Image, 8 for SDXL. */
  snap: number
  presets: Record<ImageQuality, QualityPreset>
}

const NEGATIVE = 'blurry, low quality, watermark, text, deformed, extra limbs'
const q = (megapixels: number, steps: number, upscale: number, label: string, hint: string, seconds: number): QualityPreset => ({ megapixels, steps, upscale, label, hint, seconds })

export const IMAGE_MODELS: Record<ImageModel, ImageModelSpec> = {
  // Distilled for 8 steps at cfg 1: one model pass per step, the fastest here. Seconds measured on the
  // Studio with the weights resident (2026-09-22).
  zimage: {
    label: 'Z-Image Turbo', blurb: '8 steps, no guidance pass: fastest, and the one that draws lettering', kind: 'zimage', family: 'zimage',
    files: { unet: 'z_image_turbo_bf16.safetensors', clip: 'qwen_3_4b.safetensors', vae: 'ae.safetensors' },
    recipe: { cfg: 1, sampler: 'res_multistep', scheduler: 'simple', shift: 3, negative: '' }, snap: 16,
    presets: {
      draft: q(0.5, 4, 1, 'Draft', '0.5 MP, 4 steps', 11), fast: q(1.0, 6, 1, 'Fast', '1 MP, 6 steps', 35), balanced: q(1.0, 8, 1, 'Balanced', '1 MP, 8 steps', 47),
      high: q(1.5, 8, 1, 'High', '1.5 MP, 8 steps', 78), ultra: q(1.5, 12, 1, 'Ultra', '1.5 MP, 12 steps', 108), print: q(1.5, 8, 2, 'Print', '1.5 MP, 2x upscale', 80)
    }
  },
  // RunDiffusion's fine-tune of Z-Image *Base* (not Turbo): the model card says 35 steps at CFG 6
  // (25-45, 6-9). Guidance means two model passes per step: measured 380 s warm for Balanced (11 s a
  // step at 1 MP); the other tiers are derived from that rate.
  'juggernaut-z': {
    label: 'Juggernaut Z', blurb: 'Z-Image fine-tune for photographic lighting and skin; 35 steps at CFG 6, so much slower', kind: 'zimage', family: 'juggernaut-z',
    files: { unet: 'Juggernaut_Z_V1_by_RunDiffusion.safetensors', clip: 'qwen_3_4b.safetensors', vae: 'ae.safetensors' },
    recipe: { cfg: 6, sampler: 'res_multistep', scheduler: 'simple', shift: 3, negative: NEGATIVE }, snap: 16,
    presets: {
      draft: q(0.5, 20, 1, 'Draft', '0.5 MP, 20 steps', 110), fast: q(1.0, 25, 1, 'Fast', '1 MP, 25 steps', 270), balanced: q(1.0, 35, 1, 'Balanced', '1 MP, 35 steps', 380),
      high: q(1.5, 35, 1, 'High', '1.5 MP, 35 steps', 575), ultra: q(1.5, 45, 1, 'Ultra', '1.5 MP, 45 steps', 740), print: q(1.5, 35, 2, 'Print', '1.5 MP, 2x upscale', 580)
    }
  },
  // SDXL checkpoints: 30 steps at CFG 5 with DPM++ 2M Karras, the fp16-fix VAE (Juggernaut XI's own
  // VAE overflows to a black image in reduced precision), sizes snapped to 8. Seconds measured warm on
  // RealVisXL; Juggernaut XI is the same architecture.
  'juggernaut-xi': {
    label: 'Juggernaut XI', blurb: 'SDXL photoreal; 30 steps at CFG 5', kind: 'sdxl', family: 'sdxl-juggernaut-xi',
    files: { ckpt: 'Juggernaut-XI-byRunDiffusion.safetensors', vae: 'sdxl_vae_fp16_fix.safetensors' },
    recipe: { cfg: 5, sampler: 'dpmpp_2m', scheduler: 'karras', negative: NEGATIVE }, snap: 8,
    presets: {
      draft: q(0.5, 20, 1, 'Draft', '0.5 MP, 20 steps', 18), fast: q(1.0, 20, 1, 'Fast', '1 MP, 20 steps', 33), balanced: q(1.0, 30, 1, 'Balanced', '1 MP, 30 steps', 47),
      high: q(1.5, 30, 1, 'High', '1.5 MP, 30 steps', 79), ultra: q(1.5, 40, 1, 'Ultra', '1.5 MP, 40 steps', 97), print: q(1.5, 30, 2, 'Print', '1.5 MP, 2x upscale', 83)
    }
  },
  realvisxl: {
    label: 'RealVisXL V5', blurb: 'SDXL photoreal; 30 steps at CFG 5', kind: 'sdxl', family: 'sdxl-realvisxl',
    files: { ckpt: 'RealVisXL_V5.0_fp16.safetensors', vae: 'sdxl_vae_fp16_fix.safetensors' },
    recipe: { cfg: 5, sampler: 'dpmpp_2m', scheduler: 'karras', negative: NEGATIVE }, snap: 8,
    presets: {
      draft: q(0.5, 20, 1, 'Draft', '0.5 MP, 20 steps', 18), fast: q(1.0, 20, 1, 'Fast', '1 MP, 20 steps', 33), balanced: q(1.0, 30, 1, 'Balanced', '1 MP, 30 steps', 47),
      high: q(1.5, 30, 1, 'High', '1.5 MP, 30 steps', 79), ultra: q(1.5, 40, 1, 'Ultra', '1.5 MP, 40 steps', 97), print: q(1.5, 30, 2, 'Print', '1.5 MP, 2x upscale', 83)
    }
  }
}
export const DEFAULT_MODEL: ImageModel = 'zimage'
export function imageModel(key: string | undefined): ImageModel { return key && key in IMAGE_MODELS ? (key as ImageModel) : DEFAULT_MODEL }

/** The preset of `model` that matches these settings, or null when they were set by hand. */
export function imageQualityOf(p: { model?: string; megapixels: number; steps: number; upscale?: number }): ImageQuality | null {
  const presets = IMAGE_MODELS[imageModel(p.model)].presets
  return ((Object.keys(presets) as ImageQuality[]).find((k) => presets[k].megapixels === p.megapixels && presets[k].steps === p.steps && presets[k].upscale === (p.upscale ?? 1))) ?? null
}
