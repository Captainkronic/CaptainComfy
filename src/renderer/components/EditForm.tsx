import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { EditParams } from '@shared/types'
import { EDIT_QUALITY, editQualityOf, type EditQuality } from '@shared/sizing'
import { call } from '../lib'
import { pick as suggest } from '@shared/suggestions'
import Suggest from './Suggest'
import Segmented from './Segmented'
import { useStore } from '../state/store'

const QUALITY_KEY = 'captaincomfy.editQuality'
function rememberedQuality(): EditQuality {
  try { const q = localStorage.getItem(QUALITY_KEY); return q && q in EDIT_QUALITY ? (q as EditQuality) : 'balanced' } catch { return 'balanced' }
}

export default function EditForm(): JSX.Element {
  const q0 = EDIT_QUALITY[rememberedQuality()]
  const [p, setP] = useState<EditParams>({ imagePath: '', imageName: '', instruction: suggest('edit'), enrich: true, megapixels: q0.megapixels, steps: q0.steps, seed: null, upscale: q0.upscale })
  const quality = editQualityOf(p)
  const setQuality = (k: EditQuality): void => { setP({ ...p, megapixels: EDIT_QUALITY[k].megapixels, steps: EDIT_QUALITY[k].steps, upscale: EDIT_QUALITY[k].upscale }); try { localStorage.setItem(QUALITY_KEY, k) } catch { /* not vital */ } }
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const editSource = useStore((s) => s.editSource)
  const setEditSource = useStore((s) => s.setEditSource)
  // A result sent here with its Edit button becomes the source: ComfyUI reads it in place, no upload.
  useEffect(() => {
    if (!editSource) return
    setP((prev) => ({ ...prev, imagePath: '', imageName: editSource.filename, source: { subfolder: editSource.subfolder, filename: editSource.filename, type: editSource.type === 'temp' ? 'temp' : 'output' } }))
    setPreview(editSource.url)
  }, [editSource])
  const up = <K extends keyof EditParams>(k: K, v: EditParams[K]): void => setP({ ...p, [k]: v })
  const pickFile = async (): Promise<void> => { const r = await call('dialog:pickImage'); if (r) { setEditSource(null); setP({ ...p, imagePath: r.path, imageName: r.name, source: undefined }); setPreview(r.preview) } }
  const ready = Boolean(p.source || p.imagePath) && Boolean(p.instruction.trim())
  const submit = async (): Promise<void> => { if (!ready) return; setBusy(true); try { await call('jobs:submitEdit', p) } finally { setBusy(false) } }
  return (
    <>
      <div className="field"><label>Source image</label>
        {p.source && <div className="enriched"><b>Editing a result:</b> {p.imageName}, read straight from ComfyUI's output folder. The edit keeps it and saves a new image.</div>}
        <button className="btn" style={p.source ? { marginTop: 8 } : undefined} onClick={() => { void pickFile() }}>{p.source ? 'Choose a file instead…' : p.imageName ? `Change image (${p.imageName})` : 'Choose image…'}</button>
        {preview && <img src={preview} alt="" style={{ width: '100%', marginTop: 8, borderRadius: 8, border: '1px solid var(--line)' }} />}
        {!p.source && <div className="hint">PNG, JPEG or WebP. It is uploaded to ComfyUI at job time, so this works from the MacBook too. Any result in the Image or Edit tab can also be sent here with its ✎ Edit button.</div>}
      </div>
      <div className="field"><label>What to change <Suggest kind="edit" current={p.instruction} onPick={(s) => up('instruction', s)} /></label>
        <textarea value={p.instruction} onChange={(e) => up('instruction', e.target.value)} placeholder="change the jacket to red, keep everything else the same" />
        <div className="hint">{p.enrich ? 'Gemma turns this into a precise edit instruction that preserves everything you did not mention.' : 'Used exactly as written.'}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="field"><label>Quality {quality === null && <span className="meta">custom: {p.megapixels} MP, {p.steps} steps{(p.upscale ?? 1) > 1 ? `, ${p.upscale}x upscaled` : ''}</span>}</label>
        <Segmented options={(Object.keys(EDIT_QUALITY) as EditQuality[]).map((k) => ({ key: k, label: EDIT_QUALITY[k].label, hint: `${EDIT_QUALITY[k].hint}${EDIT_QUALITY[k].seconds ? ` · ~${EDIT_QUALITY[k].seconds} s` : ''}` }))} value={quality} onChange={setQuality} />
        <div className="hint">Balanced is FLUX.2 Klein's own recipe (4 steps), so there is no faster tier at the same size. The canvas keeps the source's aspect ratio; Ultra adds steps, Print adds pixels with a RealESRGAN 2x upscale. Times are per edit with the model resident; switching from Z-Image loads Klein first (about 30 s).</div>
      </div>
      <details className="advanced">
        <summary>Advanced: canvas, steps, upscale, seed</summary>
        <div className="row">
          <div className="field"><label>Canvas (megapixels)</label>
            <select value={p.megapixels} onChange={(e) => up('megapixels', Number(e.target.value))}>
              <option value={0.5}>0.5 quick</option><option value={1}>1.0 standard</option><option value={1.5}>1.5 sharp</option>
            </select><div className="hint">Keeps the source aspect ratio</div></div>
          <div className="field"><label>Steps</label><input type="number" min={2} max={12} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">Klein 4B distilled: 4</div></div>
        </div>
        <div className="row">
          <div className="field"><label>Upscale</label>
            <select value={p.upscale ?? 1} onChange={(e) => up('upscale', Number(e.target.value))}>
              <option value={1}>none</option><option value={2}>2x (RealESRGAN x4, halved)</option><option value={4}>4x (RealESRGAN x4)</option>
            </select></div>
          <div className="field"><label>Seed (blank = random)</label><input type="number" value={p.seed ?? ''} onChange={(e) => up('seed', e.target.value === '' ? null : Number(e.target.value))} /></div>
        </div>
      </details>
      <button className="btn primary" disabled={busy || !ready} onClick={() => { void submit() }}>Edit image</button>
      <div className="hint">FLUX.2 Klein 4B.{quality && EDIT_QUALITY[quality].seconds ? ` About ${EDIT_QUALITY[quality].seconds} s once Klein is resident` : ''}{p.enrich ? ', plus Gemma\'s load and rewrite.' : '.'} The result gets its own ✎ Edit button, so edits can be chained.</div>
    </>
  )
}
