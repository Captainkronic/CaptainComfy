/**
 * The image models the Image tab can use, with what makes each one different: files, recipe (steps,
 * guidance, sampler, negative prompt), size snapping and its own quality presets. Everything else
 * (the form, the job pump, the memory choreography) is model-agnostic.
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
  /** What the machine gives up while this model renders, measured on the 36 GB Studio on 2026-09-22
   *  (free RAM at idle minus the floor during a render): `peakGb` at 1 MP, and `maxMegapixels`, the
   *  largest canvas that survived. Sampling past it is not slow, it is fatal — the kernel reaches
   *  critical pressure and the memory guard SIGKILLs ComfyUI mid-render. Bigger output comes from the
   *  upscaler instead, which is tiled and costs almost nothing. */
  memory: { peakGb: number; freeGb: number; maxMegapixels: number }
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
    // 11.5 GB UNet + 7.5 GB Qwen3 encoder + activations. 1.5 MP ran at 4.0 GB free: tight but steady.
    memory: { peakGb: 20.8, freeGb: 5.6, maxMegapixels: 1.5 },
    presets: {
      draft: q(0.5, 4, 1, 'Draft', '0.5 MP, 4 steps', 11), fast: q(1.0, 6, 1, 'Fast', '1 MP, 6 steps', 35), balanced: q(1.0, 8, 1, 'Balanced', '1 MP, 8 steps', 47),
      high: q(1.5, 8, 1, 'High', '1.5 MP, 8 steps', 78), ultra: q(1.5, 12, 1, 'Ultra', '1.5 MP, 12 steps', 108), print: q(1.5, 8, 2, 'Print', '1.5 MP, 2x upscale', 80)
    }
  },
  // RunDiffusion's fine-tune of Z-Image *Base* (not Turbo): the model card says 35 steps at CFG 6
  // (25-45, 6-9). Guidance means two model passes per step: measured 380 s warm for Balanced (11 s a
  // step at 1 MP); the other tiers are derived from that rate.
  // The heaviest model here, and the only one that cannot use the full canvas: the same weights as
  // Z-Image Turbo plus a doubled activation for the guidance pass came to 24 GB at 1 MP, and at 1.5 MP
  // it took the Studio to critical pressure and the guard killed ComfyUI mid-render (2026-09-22). So
  // High and Ultra buy quality with steps, and Print gets its pixels from the upscaler.
  'juggernaut-z': {
    label: 'Juggernaut Z', blurb: 'Z-Image fine-tune for photographic lighting and skin; 35 steps at CFG 6, so much slower and the heaviest on memory', kind: 'zimage', family: 'juggernaut-z',
    files: { unet: 'Juggernaut_Z_V1_by_RunDiffusion.safetensors', clip: 'qwen_3_4b.safetensors', vae: 'ae.safetensors' },
    recipe: { cfg: 6, sampler: 'res_multistep', scheduler: 'simple', shift: 3, negative: NEGATIVE }, snap: 16,
    memory: { peakGb: 24.0, freeGb: 5.4, maxMegapixels: 1.0 },
    presets: {
      draft: q(0.5, 20, 1, 'Draft', '0.5 MP, 20 steps', 110), fast: q(1.0, 25, 1, 'Fast', '1 MP, 25 steps', 270), balanced: q(1.0, 35, 1, 'Balanced', '1 MP, 35 steps', 380),
      high: q(1.0, 45, 1, 'High', '1 MP, 45 steps', 490), ultra: q(1.0, 60, 1, 'Ultra', '1 MP, 60 steps', 650), print: q(1.0, 35, 2, 'Print', '1 MP, 2x upscale', 390)
    }
  },
  // SDXL checkpoints: 30 steps at CFG 5 with DPM++ 2M Karras, the fp16-fix VAE (Juggernaut XI's own
  // VAE overflows to a black image in reduced precision), sizes snapped to 8. Seconds measured warm on
  // RealVisXL; Juggernaut XI is the same architecture.
  // Far the lightest here: one 6.6 GB checkpoint carries the UNet, both CLIPs and a VAE, where the
  // Z-Image family needs an 11.5 GB UNet beside a 7.5 GB text encoder. 12.7 GB at 1 MP and 1.5 MP still
  // left 17 GB free at normal pressure, so these are the models to reach for when the Studio is busy.
  'juggernaut-xi': {
    label: 'Juggernaut XI', blurb: 'SDXL photoreal; 30 steps at CFG 5, and the lightest on memory', kind: 'sdxl', family: 'sdxl-juggernaut-xi',
    files: { ckpt: 'Juggernaut-XI-byRunDiffusion.safetensors', vae: 'sdxl_vae_fp16_fix.safetensors' },
    recipe: { cfg: 5, sampler: 'dpmpp_2m', scheduler: 'karras', negative: NEGATIVE }, snap: 8,
    memory: { peakGb: 12.7, freeGb: 17.1, maxMegapixels: 1.5 },
    presets: {
      draft: q(0.5, 20, 1, 'Draft', '0.5 MP, 20 steps', 18), fast: q(1.0, 20, 1, 'Fast', '1 MP, 20 steps', 33), balanced: q(1.0, 30, 1, 'Balanced', '1 MP, 30 steps', 47),
      high: q(1.5, 30, 1, 'High', '1.5 MP, 30 steps', 79), ultra: q(1.5, 40, 1, 'Ultra', '1.5 MP, 40 steps', 97), print: q(1.5, 30, 2, 'Print', '1.5 MP, 2x upscale', 83)
    }
  },
  realvisxl: {
    label: 'RealVisXL V5', blurb: 'SDXL photoreal; 30 steps at CFG 5, and the lightest on memory', kind: 'sdxl', family: 'sdxl-realvisxl',
    files: { ckpt: 'RealVisXL_V5.0_fp16.safetensors', vae: 'sdxl_vae_fp16_fix.safetensors' },
    recipe: { cfg: 5, sampler: 'dpmpp_2m', scheduler: 'karras', negative: NEGATIVE }, snap: 8,
    memory: { peakGb: 12.3, freeGb: 13.6, maxMegapixels: 1.5 },
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
