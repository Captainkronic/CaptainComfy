import type { JSX } from 'react'
import { useState } from 'react'
import type { MusicParams } from '@shared/types'
import { call } from '../lib'
import { pick } from '@shared/suggestions'
import Suggest from './Suggest'

export default function MusicForm(): JSX.Element {
  const [p, setP] = useState<MusicParams>({ style: pick('musicStyle'), lyrics: pick('lyrics'), enrich: true, seconds: 30, bpm: 96, steps: 8, seed: null })
  const [busy, setBusy] = useState(false)
  const up = <K extends keyof MusicParams>(k: K, v: MusicParams[K]): void => setP({ ...p, [k]: v })
  const submit = async (): Promise<void> => { if (!p.style.trim()) return; setBusy(true); try { await call('jobs:submitMusic', p) } finally { setBusy(false) } }
  return (
    <>
      <div className="field"><label>Style <Suggest kind="musicStyle" current={p.style} onPick={(s) => up('style', s)} /></label>
        <textarea value={p.style} onChange={(e) => up('style', e.target.value)} placeholder="warm acoustic folk-pop with a gentle female vocal" style={{ minHeight: 64 }} />
        <div className="hint">{p.enrich ? 'Gemma expands this into genre, instruments, vocal, mood and tempo tags.' : 'Comma-separated tags, used as written.'}</div>
      </div>
      <div className="field"><label>Lyrics or theme <Suggest kind="lyrics" current={p.lyrics} onPick={(s) => up('lyrics', s)} /></label>
        <textarea value={p.lyrics} onChange={(e) => up('lyrics', e.target.value)} placeholder={'a song about staying one more day in a small harbor town\n\nor paste lyrics with [Verse] / [Chorus] tags, or write [instrumental]'} style={{ minHeight: 120 }} />
        <div className="hint">Tagged lyrics and [instrumental] are always used exactly as written, even with enrichment on.</div>
      </div>
      <label className="toggle"><input type="checkbox" checked={p.enrich} onChange={(e) => up('enrich', e.target.checked)} /> Enrich with Gemma</label>
      <div className="row">
        <div className="field"><label>Length (seconds)</label><input type="number" min={10} max={240} step={5} value={p.seconds} onChange={(e) => up('seconds', Number(e.target.value))} /><div className="hint">30 is a quick test; 60-180 is a song</div></div>
        <div className="field"><label>Tempo (bpm)</label><input type="number" min={40} max={220} value={p.bpm} onChange={(e) => up('bpm', Number(e.target.value))} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Steps</label><input type="number" min={4} max={16} value={p.steps} onChange={(e) => up('steps', Number(e.target.value))} /><div className="hint">Turbo model: 8</div></div>
        <div className="field"><label>Seed (blank = random)</label><input type="number" value={p.seed ?? ''} onChange={(e) => up('seed', e.target.value === '' ? null : Number(e.target.value))} /></div>
      </div>
      <button className="btn primary" disabled={busy || !p.style.trim()} onClick={() => { void submit() }}>Generate music</button>
      <div className="hint">ACE-Step 1.5 Turbo. A 30 s clip took about 70 s on this Mac.</div>
    </>
  )
}
