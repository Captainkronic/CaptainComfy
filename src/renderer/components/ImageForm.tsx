import type { JSX } from 'react'
import { useState } from 'react'
import { ASPECTS, type AspectKey, type ImageParams } from '@shared/types'
import { IMAGE_QUALITY, imageQualityOf, sizeFor, type ImageQuality } from '@shared/sizing'
import { call } from '../lib'
import { pick } from '@shared/suggestions'
import Suggest from './Suggest'
import Segmented from './Segmented'

const QUALITY_KEY = 'captaincomfy.imageQuality'
function rememberedQuality(): ImageQuality {
  try { const q = localStorage.getItem(QUALITY_KEY); return q && q in IMAGE_QUALITY ? (q as ImageQuality) : 'balanced' } catch { return 'balanced' }
}

export default function ImageForm(): JSX.Element {
  const q0 = IMAGE_QUALITY[rememberedQuality()]
  const [p, setP] = useState<ImageParams>({ prompt: pick('image'), enrich: true, aspect: '1:1', megapixels: q0.megapixels, count: 1, steps: q0.steps, seed: null, upscale: q0.upscale })
  const [busy, setBusy] = useState(false)
  const size = sizeFor(p.aspect, p.megapixels, 16)
  const quality = imageQualityOf(p)
  const up = <K extends keyof ImageParams>(k: K, v: ImageParams[K]): void => setP({ ...p, [k]: v })
  const setQuality = (k: ImageQuality): void => { setP({ ...p, megapixels: IMAGE_QUALITY[k].megapixels, steps: IMAGE_QUALITY[k].steps, upscale: IMAGE_QUALITY[k].upscale }); try { localStorage.setItem(QUALITY_KEY, k) } catch { /* not vital */ } }
  const submit = async (): Promise<void> => { if (!p.prompt.trim()) return; setBusy(true); try { await call('jobs:submitImage', p) } finally { setBusy(false) } }
  const seconds = quality ? IMAGE_QUALITY[quality].seconds : 0
  return (
    <>
      <div className="field"><label>Prompt <Suggest kind="image" current={p.prompt} onPick={(s) => up('prompt', s)} /></label>
        <textarea value={p.prompt} onChange={(e) => up('prompt', e.target.value)} placeholder="a woman with curly hair at a sunny harbor, pastel houses behind" />
        <div className="hint">{p.enrich ? 'A short idea is enough. Gemma adds setting, light, lens and style before rendering.' : 'Used exactly as written.'}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="field"><label>Quality {quality === null && <span className="meta">custom: {p.megapixels} MP, {p.steps} steps{(p.upscale ?? 1) > 1 ? `, ${p.upscale}x upscaled` : ''}</span>}</label>
        <Segmented options={(Object.keys(IMAGE_QUALITY) as ImageQuality[]).map((k) => ({ key: k, label: IMAGE_QUALITY[k].label, hint: `${IMAGE_QUALITY[k].hint}${IMAGE_QUALITY[k].seconds ? ` · ~${IMAGE_QUALITY[k].seconds} s` : ''}` }))} value={quality} onChange={setQuality} />
        <div className="hint">Balanced is Z-Image Turbo's own recipe. Above High the canvas stays at 1.5 MP (bigger does not fit the Studio's memory): Ultra adds steps, Print adds pixels with a RealESRGAN 2x upscale. Times are per image with the model resident; a cold load adds about 40 s.</div>
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
              <option value={0.5}>0.5 quick</option><option value={1}>1.0 standard</option><option value={1.5}>1.5 sharp</option><option value={2}>2.0 max (slow, may swap)</option>
            </select></div>
          <div className="field"><label>Steps</label><input type="number" min={1} max={12} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">Turbo model: 8 is designed-for</div></div>
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
      <div className="hint">Z-Image Turbo.{seconds ? ` About ${seconds * Math.max(1, p.count)} s for ${p.count > 1 ? `${p.count} images` : 'one image'} once the model is resident` : ''}{p.enrich ? ', plus Gemma\'s load and rewrite.' : '.'}</div>
    </>
  )
}
