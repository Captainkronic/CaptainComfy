import type { JSX } from 'react'
import { useState } from 'react'
import { ASPECTS, type AspectKey, type ImageParams } from '@shared/types'
import { sizeFor } from '@shared/sizing'
import { call } from '../lib'
import { pick } from '@shared/suggestions'
import Suggest from './Suggest'

export default function ImageForm(): JSX.Element {
  const [p, setP] = useState<ImageParams>({ prompt: pick('image'), enrich: true, aspect: '1:1', megapixels: 1.0, count: 1, steps: 8, seed: null })
  const [busy, setBusy] = useState(false)
  const size = sizeFor(p.aspect, p.megapixels, 16)
  const up = <K extends keyof ImageParams>(k: K, v: ImageParams[K]): void => setP({ ...p, [k]: v })
  const submit = async (): Promise<void> => { if (!p.prompt.trim()) return; setBusy(true); try { await call('jobs:submitImage', p) } finally { setBusy(false) } }
  return (
    <>
      <div className="field"><label>Prompt <Suggest kind="image" current={p.prompt} onPick={(s) => up('prompt', s)} /></label>
        <textarea value={p.prompt} onChange={(e) => up('prompt', e.target.value)} placeholder="a woman with curly hair at a sunny harbor, pastel houses behind" />
        <div className="hint">{p.enrich ? 'A short idea is enough. Gemma adds setting, light, lens and style before rendering.' : 'Used exactly as written.'}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="row">
        <div className="field"><label>Aspect</label>
          <select value={p.aspect} onChange={(e) => up('aspect', e.target.value as AspectKey)}>
            {(Object.keys(ASPECTS) as AspectKey[]).map((k) => <option key={k} value={k}>{k} {ASPECTS[k].label}</option>)}
          </select></div>
        <div className="field"><label>Detail (megapixels)</label>
          <select value={p.megapixels} onChange={(e) => up('megapixels', Number(e.target.value))}>
            <option value={0.5}>0.5 quick</option><option value={1}>1.0 standard</option><option value={1.5}>1.5 sharp</option><option value={2}>2.0 max (slow)</option>
          </select>
          <div className="hint">{size.width} x {size.height}</div></div>
      </div>
      <div className="row">
        <div className="field"><label>How many</label><input type="number" min={1} max={4} value={p.count} onChange={(e) => up('count', Number(e.target.value))} /></div>
        <div className="field"><label>Steps</label><input type="number" min={4} max={12} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">Turbo model: 8 is designed-for</div></div>
      </div>
      <div className="field"><label>Seed (blank = random)</label><input type="number" value={p.seed ?? ''} onChange={(e) => up('seed', e.target.value === '' ? null : Number(e.target.value))} /></div>
      <button className="btn primary" disabled={busy || !p.prompt.trim()} onClick={() => { void submit() }}>Generate image</button>
      <div className="hint">Z-Image Turbo. Measured on the Studio at 1.1 MP: about 55 s while the model is resident, about 95 s when it has to load, plus Gemma's load and rewrite if enrichment is on.</div>
    </>
  )
}
