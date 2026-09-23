import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { EditParams } from '@shared/types'
import { call } from '../lib'
import { pick as suggest } from '@shared/suggestions'
import Suggest from './Suggest'
import { useStore } from '../state/store'

export default function EditForm(): JSX.Element {
  const [p, setP] = useState<EditParams>({ imagePath: '', imageName: '', instruction: suggest('edit'), enrich: true, megapixels: 1.0, steps: 4, seed: null })
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
        {!p.source && <div className="hint">PNG, JPEG or WebP. It is uploaded to ComfyUI at job time, so this works from the MacBook too. Any result in the Image, Card or Edit tab can also be sent here with its ✎ Edit button.</div>}
      </div>
      <div className="field"><label>What to change <Suggest kind="edit" current={p.instruction} onPick={(s) => up('instruction', s)} /></label>
        <textarea value={p.instruction} onChange={(e) => up('instruction', e.target.value)} placeholder="change the jacket to red, keep everything else the same" />
        <div className="hint">{p.enrich ? 'Gemma turns this into a precise edit instruction that preserves everything you did not mention.' : 'Used exactly as written.'}</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="row">
        <div className="field"><label>Canvas (megapixels)</label>
          <select value={p.megapixels} onChange={(e) => up('megapixels', Number(e.target.value))}>
            <option value={0.5}>0.5 quick</option><option value={1}>1.0 standard</option><option value={1.5}>1.5 sharp</option>
          </select><div className="hint">Keeps the source aspect ratio</div></div>
        <div className="field"><label>Steps</label><input type="number" min={2} max={12} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">Klein 4B distilled: 4</div></div>
      </div>
      <div className="field"><label>Seed (blank = random)</label><input type="number" value={p.seed ?? ''} onChange={(e) => up('seed', e.target.value === '' ? null : Number(e.target.value))} /></div>
      <button className="btn primary" disabled={busy || !ready} onClick={() => { void submit() }}>Edit image</button>
      <div className="hint">FLUX.2 Klein 4B. Roughly 20-40 s per edit at 1.0 MP on the Studio, plus the model load the first time; the result gets its own ✎ Edit button, so edits can be chained.</div>
    </>
  )
}
