/**
 * ComfyUI API-format graphs. These are byte-for-byte the recipes proven on the
 * Mac Studio on 2026-09-13 (see the Easy templates in ComfyUI). Anything model-
 * specific lives here and nowhere else.
 */
import type { ImageParams, MusicParams } from './types'
import { clampSeconds, sizeFor } from './sizing'

export const MODELS = {
  image: { unet: 'z_image_turbo_bf16.safetensors', clip: 'qwen_3_4b.safetensors', clipType: 'lumina2', vae: 'ae.safetensors' },
  music: { ckpt: 'ace_step_1.5_turbo_aio.safetensors' }
} as const

export type ApiGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>

export function imageGraph(p: ImageParams, finalPrompt: string, seed: number, prefix = 'lite/image'): ApiGraph {
  const { width, height } = sizeFor(p.aspect, p.megapixels, 16)
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.image.unet, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.image.clip, type: MODELS.image.clipType, device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.image.vae } },
    '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: finalPrompt } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    '7': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: Math.min(4, Math.max(1, p.count)) } },
    '8': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0],
           seed, steps: Math.min(12, Math.max(4, p.steps)), cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: prefix } }
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
  VAEDecodeAudio: 'Decoding audio', SaveImage: 'Saving', SaveAudioMP3: 'Saving MP3', EmptySD3LatentImage: 'Preparing canvas', 'EmptyAceStep1.5LatentAudio': 'Preparing'
}
