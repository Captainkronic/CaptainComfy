import type { JSX } from 'react'
import { useState } from 'react'
import { ASPECTS, type AspectKey, type ImageParams } from '@shared/types'
import { sizeFor } from '@shared/sizing'
import { IMAGE_MODELS, imageModel, imageQualityOf, type ImageModel, type ImageQuality } from '@shared/models'
import { call } from '../lib'
import { pick } from '@shared/suggestions'
import Suggest from './Suggest'
import Segmented from './Segmented'

const QUALITY_KEY = 'captaincomfy.imageQuality', MODEL_KEY = 'captaincomfy.imageModel'
function remembered(): { model: ImageModel; quality: ImageQuality } {
  try { const q = localStorage.getItem(QUALITY_KEY); const m = imageModel(localStorage.getItem(MODEL_KEY) ?? undefined); return { model: m, quality: q && q in IMAGE_MODELS[m].presets ? (q as ImageQuality) : 'balanced' } } catch { return { model: 'zimage', quality: 'balanced' } }
}

export default function ImageForm(): JSX.Element {
  const r0 = remembered(); const q0 = IMAGE_MODELS[r0.model].presets[r0.quality]
  const [p, setP] = useState<ImageParams>({ prompt: pick('image'), enrich: true, model: r0.model, aspect: '1:1', megapixels: q0.megapixels, count: 1, steps: q0.steps, seed: null, upscale: q0.upscale })
  const [busy, setBusy] = useState(false)
  const model = imageModel(p.model); const spec = IMAGE_MODELS[model]; const presets = spec.presets
  const size = sizeFor(p.aspect, p.megapixels, spec.snap)
  const quality = imageQualityOf(p)
  const up = <K extends keyof ImageParams>(k: K, v: ImageParams[K]): void => setP({ ...p, [k]: v })
  const setQuality = (k: ImageQuality, m: ImageModel = model): void => { const t = IMAGE_MODELS[m].presets[k]; setP({ ...p, model: m, megapixels: t.megapixels, steps: t.steps, upscale: t.upscale }); try { localStorage.setItem(QUALITY_KEY, k); localStorage.setItem(MODEL_KEY, m) } catch { /* not vital */ } }
  // A new model keeps the tier (Balanced stays Balanced) but takes that model's own steps and size.
  const setModel = (m: ImageModel): void => setQuality(quality ?? 'balanced', m)
  const submit = async (): Promise<void> => { if (!p.prompt.trim()) return; setBusy(true); try { await call('jobs:submitImage', p) } finally { setBusy(false) } }
  const seconds = quality ? presets[quality].seconds : 0
  return (
    <>
      <div className="field"><label>Prompt <Suggest kind="image" current={p.prompt} onPick={(s) => up('prompt', s)} /></label>
        <textarea value={p.prompt} onChange={(e) => up('prompt', e.target.value)} placeholder="a woman with curly hair at a sunny harbor, pastel houses behind" />
        <div className="hint">{p.enrich ? 'A short idea is enough. Gemma adds setting, light, lens and style before rendering.' : 'Used exactly as written.'}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="field"><label>Model</label>
        <Segmented options={(Object.keys(IMAGE_MODELS) as ImageModel[]).map((k) => ({ key: k, label: IMAGE_MODELS[k].label, hint: IMAGE_MODELS[k].kind === 'sdxl' ? 'SDXL' : k === 'zimage' ? 'Z-Image, distilled' : 'Z-Image, base' }))} value={model} onChange={setModel} />
        <div className="hint">{spec.blurb}. Switching models frees the other one's weights first (they cannot share the Studio's memory), so the first render after a switch loads cold.</div>
      </div>
      <div className="field"><label>Quality {quality === null && <span className="meta">custom: {p.megapixels} MP, {p.steps} steps{(p.upscale ?? 1) > 1 ? `, ${p.upscale}x upscaled` : ''}</span>}</label>
        <Segmented options={(Object.keys(presets) as ImageQuality[]).map((k) => ({ key: k, label: presets[k].label, hint: `${presets[k].hint}${presets[k].seconds ? ` · ~${presets[k].seconds} s` : ''}` }))} value={quality} onChange={(k) => setQuality(k)} />
        <div className="hint">Balanced is the model's own recipe ({presets.balanced.steps} steps{spec.recipe.cfg > 1 ? ` at CFG ${spec.recipe.cfg}` : ''}). Above High the canvas stays at 1.5 MP (bigger does not fit the Studio's memory): Ultra adds steps, Print adds pixels with a RealESRGAN 2x upscale. Times are per image with the model resident; a cold load adds about 40 s.</div>
      </div>
      <div className="row">
        <div className="field"><label>Aspect</label>
          <select value={p.aspect} onChange={(e) => up('aspect', e.target.value as AspectKey)}>
            {(Object.keys(ASPECTS) as AspectKey[]).map((k) => <option key={k} value={k}>{k} {ASPECTS[k].label}</option>)}
          </select><div className="hint">{size.width} x {size.height}{(p.upscale ?? 1) > 1 ? ` → ${size.width * (p.upscale ?? 1)} x ${size.height * (p.upscale ?? 1)}` : ''}</div></div>
        <div className="field"><label>How many</label><input type="number" min={1} max={4} value={p.count} onChange={(e) => up('count', Number(e.target.value))} /><div className="hint">Rendered as one batch; each image costs its full time</div></div>
      </div>
      <details className="advanced">
        <summary>Advanced: detail, steps, seed</summary>
        <div className="row">
          <div className="field"><label>Detail (megapixels)</label>
            <select value={p.megapixels} onChange={(e) => up('megapixels', Number(e.target.value))}>
              <option value={0.5}>0.5 quick</option><option value={1}>1.0 standard</option><option value={1.5}>1.5 sharp</option>
            </select></div>
          <div className="field"><label>Steps</label><input type="number" min={1} max={60} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">{spec.label}: {presets.balanced.steps} is the recipe</div></div>
        </div>
        <div className="row">
          <div className="field"><label>Upscale</label>
            <select value={p.upscale ?? 1} onChange={(e) => up('upscale', Number(e.target.value))}>
              <option value={1}>none</option><option value={2}>2x (RealESRGAN x4, halved)</option><option value={4}>4x (RealESRGAN x4)</option>
            </select><div className="hint">After decoding, tiled; costs little memory</div></div>
          <div className="field"><label>Seed (blank = random)</label><input type="number" value={p.seed ?? ''} onChange={(e) => up('seed', e.target.value === '' ? null : Number(e.target.value))} /></div>
        </div>
      </details>
      <button className="btn primary" disabled={busy || !p.prompt.trim()} onClick={() => { void submit() }}>Generate image</button>
      <div className="hint">{spec.label}.{seconds ? ` About ${seconds * Math.max(1, p.count)} s for ${p.count > 1 ? `${p.count} images` : 'one image'} once the model is resident` : ''}{p.enrich ? ', plus Gemma\'s load and rewrite.' : '.'}</div>
    </>
  )
}
