/**
 * ComfyUI API-format graphs. These are byte-for-byte the recipes proven on the
 * Mac Studio on 2026-09-13 (see the Easy templates in ComfyUI). Anything model-
 * specific lives here and nowhere else.
 */
import type { EditParams, ImageParams, MusicParams } from './types'
import type { CardParams } from './card'
import { CARD_QUALITY, cardQualityKey, cardSize } from './card'
import { clampSeconds, sizeFor } from './sizing'

export const MODELS = {
  image: { unet: 'z_image_turbo_bf16.safetensors', clip: 'qwen_3_4b.safetensors', clipType: 'lumina2', vae: 'ae.safetensors' },
  edit: { unet: 'flux-2-klein-4b.safetensors', clip: 'qwen_3_4b.safetensors', clipType: 'flux2', vae: 'flux2-vae.safetensors' },
  music: { ckpt: 'ace_step_1.5_turbo_aio.safetensors' },
  upscale: 'RealESRGAN_x4plus.pth'   // ~/ComfyUI-Shared/models/upscale_models on the Studio, official Real-ESRGAN release
} as const

export type ApiGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** Z-Image Turbo text-to-image: res_multistep, cfg 1, shift 3. Shared by the Image and Card tabs.
 *  `upscale` 2 or 4 runs RealESRGAN x4 on the decoded image (tiled by ComfyUI, so it costs little
 *  memory) and, for 2, scales the result back by half with lanczos. Sampling above 1.5 MP is not
 *  survivable on the 36 GB Studio; this is how anything larger gets made. */
export function zImageGraph(o: { prompt: string; width: number; height: number; batch: number; steps: number; seed: number; prefix: string; upscale?: number }): ApiGraph {
  const up = o.upscale === 2 || o.upscale === 4 ? o.upscale : 1
  const g: ApiGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.image.unet, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.image.clip, type: MODELS.image.clipType, device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.image.vae } },
    '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: o.prompt } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    '7': { class_type: 'EmptySD3LatentImage', inputs: { width: o.width, height: o.height, batch_size: Math.min(4, Math.max(1, o.batch)) } },
    '8': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0],
           seed: o.seed, steps: Math.min(12, Math.max(1, o.steps)), cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: o.prefix } }
  }
  if (up > 1) {
    g['11'] = { class_type: 'UpscaleModelLoader', inputs: { model_name: MODELS.upscale } }
    g['12'] = { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['11', 0], image: ['9', 0] } }
    if (up === 4) g['10']!.inputs['images'] = ['12', 0]
    else { g['13'] = { class_type: 'ImageScaleBy', inputs: { image: ['12', 0], upscale_method: 'lanczos', scale_by: up / 4 } }; g['10']!.inputs['images'] = ['13', 0] }
  }
  return g
}

export function imageGraph(p: ImageParams, finalPrompt: string, seed: number, prefix = 'lite/image'): ApiGraph {
  const { width, height } = sizeFor(p.aspect, p.megapixels, 16)
  return zImageGraph({ prompt: finalPrompt, width, height, batch: p.count, steps: p.steps, seed, prefix, upscale: p.upscale })
}

/** A greeting card: the tested card sizes, the preset's steps, N candidates as one batch. */
export function cardGraph(p: CardParams, seed: number, prefix = 'lite/card'): ApiGraph {
  const { width, height } = cardSize(p.shape, p.quality)
  const q = CARD_QUALITY[cardQualityKey(p.quality)]
  return zImageGraph({ prompt: p.prompt, width, height, batch: p.count, steps: q.steps, seed, prefix, upscale: q.upscale })
}

/** A 1-step 256x256 render that only exists to load the Z-Image weights while the user is still
 *  typing; PreviewImage keeps it out of the output folder. Identical every time, so once the node
 *  cache holds it ComfyUI answers from cache in a moment. */
export function warmupGraph(prompt = 'warm up'): ApiGraph {
  // With the card's own prompt, the text encoding is cached too and the real render skips it.
  const g = zImageGraph({ prompt, width: 256, height: 256, batch: 1, steps: 1, seed: 1, prefix: 'lite/warmup' })
  g['10'] = { class_type: 'PreviewImage', inputs: { images: ['9', 0] } }
  return g
}

/** Which weights a job needs. Consecutive jobs of one family reuse ComfyUI's resident models; a change frees them first. */
export function modelFamily(kind: 'image' | 'edit' | 'music' | 'card'): 'zimage' | 'klein' | 'ace' {
  return kind === 'music' ? 'ace' : kind === 'edit' ? 'klein' : 'zimage'
}

/** Instruction edit with FLUX.2 Klein 4B (distilled): reference latent on both positive and zeroed
 *  negative, cfg 1, euler, Flux2Scheduler sized from the scaled source image. Same wiring as
 *  ComfyUI's bundled image_flux2_klein_image_edit_4b_distilled template. */
export function editGraph(p: EditParams, finalInstruction: string, seed: number, uploadedImage: string, prefix = 'lite/edit'): ApiGraph {
  const mp = Math.min(2, Math.max(0.25, p.megapixels))
  const steps = Math.min(12, Math.max(2, p.steps))
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.edit.unet, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.edit.clip, type: MODELS.edit.clipType, device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.edit.vae } },
    '4': { class_type: 'LoadImage', inputs: { image: uploadedImage } },
    '5': { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['4', 0], upscale_method: 'nearest-exact', megapixels: mp, resolution_steps: 1 } },
    '6': { class_type: 'GetImageSize', inputs: { image: ['5', 0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: finalInstruction } },
    '8': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['7', 0] } },
    '9': { class_type: 'VAEEncode', inputs: { pixels: ['5', 0], vae: ['3', 0] } },
    '10': { class_type: 'ReferenceLatent', inputs: { conditioning: ['7', 0], latent: ['9', 0] } },
    '11': { class_type: 'ReferenceLatent', inputs: { conditioning: ['8', 0], latent: ['9', 0] } },
    '12': { class_type: 'EmptyFlux2LatentImage', inputs: { width: ['6', 0], height: ['6', 1], batch_size: 1 } },
    '13': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '14': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '15': { class_type: 'Flux2Scheduler', inputs: { steps, width: ['6', 0], height: ['6', 1] } },
    '16': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive: ['10', 0], negative: ['11', 0], cfg: 1 } },
    '17': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['13', 0], guider: ['16', 0], sampler: ['14', 0], sigmas: ['15', 0], latent_image: ['12', 0] } },
    '18': { class_type: 'VAEDecode', inputs: { samples: ['17', 0], vae: ['3', 0] } },
    '19': { class_type: 'SaveImage', inputs: { images: ['18', 0], filename_prefix: prefix } }
  }
}

export function musicGraph(p: MusicParams, style: string, lyrics: string, seed: number, prefix = 'audio/lite'): ApiGraph {
  const seconds = clampSeconds(p.seconds)
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: MODELS.music.ckpt } },
    '2': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '3': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { clip: ['1', 1], tags: style, lyrics, seed, bpm: Math.round(p.bpm), duration: seconds,
           timesignature: '4', language: 'en', keyscale: 'E minor', generate_audio_codes: true, cfg_scale: 2.0, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0.0 } },
    '4': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['3', 0] } },
    '5': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: { model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0],
           seed, steps: Math.min(16, Math.max(4, p.steps)), cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '7': { class_type: 'VAEDecodeAudio', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    '8': { class_type: 'SaveAudioMP3', inputs: { audio: ['7', 0], filename_prefix: prefix, quality: 'V0' } }
  }
}

/** Human labels for the nodes we report progress on. Honest: unknown nodes show their class name. */
export const NODE_LABELS: Record<string, string> = {
  UNETLoader: 'Loading image model', CLIPLoader: 'Loading text encoder', VAELoader: 'Loading VAE', CheckpointLoaderSimple: 'Loading music model',
  CLIPTextEncode: 'Encoding prompt', 'TextEncodeAceStepAudio1.5': 'Encoding song', KSampler: 'Generating', VAEDecode: 'Decoding image',
  VAEDecodeAudio: 'Decoding audio', SaveImage: 'Saving', ImageScaleToTotalPixels: 'Scaling source image', VAEEncode: 'Encoding source image', ReferenceLatent: 'Attaching reference', SamplerCustomAdvanced: 'Generating', GetImageSize: 'Reading size', Flux2Scheduler: 'Scheduling', SaveAudioMP3: 'Saving MP3', EmptySD3LatentImage: 'Preparing canvas', 'EmptyAceStep1.5LatentAudio': 'Preparing', UpscaleModelLoader: 'Loading the upscaler', ImageUpscaleWithModel: 'Upscaling', ImageScaleBy: 'Resizing'
}
