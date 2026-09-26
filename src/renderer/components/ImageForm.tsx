import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ASPECTS, type AspectKey, type ImageParams } from '@shared/types'
import { sizeFor } from '@shared/sizing'
import { IMAGE_MODELS, imageModel, imageQualityOf, type ImageModel, type ImageQuality } from '@shared/models'
import { IDEA_CATEGORIES, type IdeaCategory } from '@shared/ideas'
import { detectCraft } from '@shared/enrich'
import { call } from '../lib'
import { pick } from '@shared/suggestions'
import Suggest from './Suggest'
import Segmented from './Segmented'

const CRAFT_NAME = { photo: 'Photographer', art: 'Illustrator', design: 'Graphic designer' } as const
const CRAFT_HINT = {
  photo: 'Shot size, focal length and aperture, a named lighting pattern with its key-to-fill ratio, shutter when there is motion, and a small palette.',
  art: 'The medium named by the marks it leaves — pooling pigment, carving marks, torn paper edges — because a style word alone returns a filtered photograph.',
  design: 'Format and proportions, one focal element, a reserved empty area for the words, and a small palette. No lens or exposure.'
} as const
const QUALITY_KEY = 'captaincomfy.imageQuality', MODEL_KEY = 'captaincomfy.imageModel', CATS_KEY = 'captaincomfy.ideaCategories'
/** Which kinds of idea ⟳ New idea may offer. All of them until you say otherwise. */
function rememberedCats(): IdeaCategory[] {
  const all = IDEA_CATEGORIES.map((c) => c.key)
  try {
    const raw = localStorage.getItem(CATS_KEY); if (!raw) return all
    const saved = (JSON.parse(raw) as string[]).filter((k): k is IdeaCategory => all.includes(k as IdeaCategory))
    return saved.length ? saved : all
  } catch { return all }
}
function remembered(): { model: ImageModel; quality: ImageQuality } {
  try { const q = localStorage.getItem(QUALITY_KEY); const m = imageModel(localStorage.getItem(MODEL_KEY) ?? undefined); return { model: m, quality: q && q in IMAGE_MODELS[m].presets ? (q as ImageQuality) : 'balanced' } } catch { return { model: 'zimage', quality: 'balanced' } }
}

/** The idea categories, tucked into a menu so the prompt field keeps its space. A <details> gives
 *  the open/close behaviour for free; the only thing it lacks is closing when you click elsewhere. */
function IdeaTypes({ cats, onToggle }: { cats: IdeaCategory[]; onToggle: (k: IdeaCategory) => void }): JSX.Element {
  const box = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent): void => { const d = box.current; if (d?.open && !d.contains(e.target as Node)) d.open = false }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])
  const chosen = IDEA_CATEGORIES.filter((c) => cats.includes(c.key))
  const summary = chosen.length === IDEA_CATEGORIES.length ? 'All' : chosen.length === 1 ? chosen[0]!.label : `${chosen.length} of ${IDEA_CATEGORIES.length}`
  return (
    <details className="dropdown" ref={box}>
      <summary title={`New idea draws on: ${chosen.map((c) => c.label).join(', ')}`}>Idea types: {summary} ▾</summary>
      <div className="menu">
        {IDEA_CATEGORIES.map((c) => (
          <label key={c.key} className={cats.includes(c.key) ? 'on' : ''}>
            <input type="checkbox" checked={cats.includes(c.key)} onChange={() => onToggle(c.key)} />
            <span>{c.label}<small>{c.hint}</small></span>
          </label>
        ))}
      </div>
    </details>
  )
}

export default function ImageForm(): JSX.Element {
  const r0 = remembered(); const q0 = IMAGE_MODELS[r0.model].presets[r0.quality]
  // The opening idea honours the remembered categories too, or the form contradicts its own toggles.
  const [p, setP] = useState<ImageParams>({ prompt: pick('image', undefined, rememberedCats()), enrich: true, model: r0.model, aspect: '1:1', megapixels: q0.megapixels, count: 1, steps: q0.steps, seed: null, upscale: q0.upscale, negative: '', craft: 'auto' })
  const [busy, setBusy] = useState(false)
  const [cats, setCats] = useState<IdeaCategory[]>(rememberedCats)
  // Unticking the last category would leave New idea nothing to draw on, so the last one stays put.
  const toggleCat = (k: IdeaCategory): void => {
    const next = cats.includes(k) ? cats.filter((c) => c !== k) : [...cats, k]
    if (!next.length) return
    setCats(next); try { localStorage.setItem(CATS_KEY, JSON.stringify(next)) } catch { /* not vital */ }
  }
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
      <div className="field">
        <div className="fieldhead">
          <label>Prompt</label>
          <span className="controls">
            <IdeaTypes cats={cats} onToggle={toggleCat} />
            <Suggest kind="image" current={p.prompt} onPick={(s) => up('prompt', s)} cats={cats} />
          </span>
        </div>
        <textarea value={p.prompt} onChange={(e) => up('prompt', e.target.value)} placeholder="a woman with curly hair at a sunny harbor, pastel houses behind" />
        <div className="hint">{p.enrich ? 'A short idea is enough. Gemma adds setting, light, lens and style before rendering.' : 'Used exactly as written.'}</div>
      </div>
      {/* A negative only exists where there is a guidance pass to apply it to. Turbo is distilled for
          CFG 1, so the field is shown disabled rather than hidden: otherwise it looks like a bug. */}
      <div className="field"><label>Negative prompt</label>
        <textarea className="short" value={p.negative ?? ''} disabled={spec.recipe.cfg <= 1}
          onChange={(e) => up('negative', e.target.value)} placeholder={spec.recipe.cfg > 1 ? spec.recipe.negative : ''} />
        <div className="hint">{spec.recipe.cfg > 1
          ? <>What to steer away from. Empty uses {spec.label}&rsquo;s default, shown in grey.</>
          : <>{spec.label} renders without a guidance pass (CFG 1), so a negative prompt has no effect on it. Pick another model to use one.</>}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      {p.enrich && (
        <div className="field"><label>Gemma writes as</label>
          <select value={p.craft ?? 'auto'} onChange={(e) => up('craft', e.target.value as ImageParams['craft'])}>
            <option value="auto">Auto — read from the prompt</option>
            <option value="photo">Photographer</option>
            <option value="art">Illustrator</option>
            <option value="design">Graphic designer</option>
          </select>
          <div className="hint">{CRAFT_HINT[(p.craft ?? 'auto') === 'auto' ? detectCraft(p.prompt) : (p.craft as 'photo' | 'art' | 'design')]}
            {(p.craft ?? 'auto') === 'auto' && <> <span className="meta">(auto picked {CRAFT_NAME[detectCraft(p.prompt)]})</span></>}
          </div>
        </div>
      )}
      <div className="field"><label>Model</label>
        <Segmented options={(Object.keys(IMAGE_MODELS) as ImageModel[]).map((k) => ({ key: k, label: IMAGE_MODELS[k].label, hint: `${IMAGE_MODELS[k].kind === 'sdxl' ? 'SDXL' : k === 'zimage' ? 'Z-Image, distilled' : 'Z-Image, base'} · ~${Math.round(IMAGE_MODELS[k].memory.peakGb)} GB` }))} value={model} onChange={setModel} />
        <div className="hint">{spec.blurb}. Switching models frees the other one's weights first (they cannot share the Studio's memory), so the first render after a switch loads cold.</div>
        <div className="hint">Measured on the Studio: about <b>{spec.memory.peakGb} GB</b> of its 36 GB while it renders, leaving roughly {spec.memory.freeGb} GB free. Extra images in one job render one after another, so they cost time, not memory.</div>
      </div>
      <div className="field"><label>Quality {quality === null && <span className="meta">custom: {p.megapixels} MP, {p.steps} steps{(p.upscale ?? 1) > 1 ? `, ${p.upscale}x upscaled` : ''}</span>}</label>
        <Segmented options={(Object.keys(presets) as ImageQuality[]).map((k) => ({ key: k, label: presets[k].label, hint: `${presets[k].hint}${presets[k].seconds ? ` · ~${presets[k].seconds} s` : ''}` }))} value={quality} onChange={(k) => setQuality(k)} />
        <div className="hint">Balanced is the model's own recipe ({presets.balanced.steps} steps{spec.recipe.cfg > 1 ? ` at CFG ${spec.recipe.cfg}` : ''}). {spec.memory.maxMegapixels < 1.5
          ? `This model is too heavy to sample above ${spec.memory.maxMegapixels} MP on the Studio, so High and Ultra buy quality with steps instead, and Print gets its pixels from a RealESRGAN 2x upscale.`
          : 'Above High the canvas stays at 1.5 MP (bigger does not fit the Studio\'s memory): Ultra adds steps, Print adds pixels with a RealESRGAN 2x upscale.'} Times are per image with the model resident; a cold load adds about 40 s.</div>
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
            {/* Only sizes this model survived: anything larger is refused by the pump anyway. */}
            <select value={p.megapixels} onChange={(e) => up('megapixels', Number(e.target.value))}>
              {[[0.5, '0.5 quick'], [1, '1.0 standard'], [1.5, '1.5 sharp']].filter(([v]) => (v as number) <= spec.memory.maxMegapixels)
                .map(([v, label]) => <option key={v as number} value={v as number}>{label as string}</option>)}
            </select><div className="hint">{spec.label} tops out at {spec.memory.maxMegapixels} MP here</div></div>
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
