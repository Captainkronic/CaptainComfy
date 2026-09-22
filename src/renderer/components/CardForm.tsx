import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { CARD_ATTEMPTS_MAX, CARD_QUALITY, CARD_SHAPES, cardPrompt, cardSize, draftToParams, LINE_MAX, LOOKS, lookForAge, PROMPT_WORDS_MAX, sceneRequest, topLines, wordCount, type CardQuality, type CardShape, type LookKey } from '@shared/card'
import { call } from '../lib'
import { useStore } from '../state/store'

/** The Card-Generator brief as a form. The prompt is assembled in the guide's order and shown in full;
 *  Gemma drafts only the scene paragraph, here, where it can be read and edited before anything renders. */
export default function CardForm(): JSX.Element {
  const d = useStore((s) => s.cardDraft)
  const up = useStore((s) => s.setCardDraft)
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState('')
  const [ocr, setOcr] = useState<{ ok: boolean; detail: string } | null>(null)
  useEffect(() => { void call('ocr:status').then(setOcr) }, [])
  // Load ahead of the click: Gemma when the scene is still empty (a draft is likely next), the
  // Z-Image weights once a scene is in place (a render is likely next).
  const warm = (): void => { void call('comfy:warm', d.scene.trim() ? 'zimage' : 'gemma') }
  useEffect(warm, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const lines = topLines(d)
  const longLines = lines.filter((l) => l.length > LINE_MAX)
  const prompt = d.promptOverride.trim() || cardPrompt(d)
  const words = wordCount(prompt)
  const size = cardSize(d.shape, d.quality)
  const canSubmit = !busy && lines.length > 0 && (d.scene.trim() || d.promptOverride.trim())

  const setAge = (age: number | null): void => { const look = lookForAge(age); up(look !== d.look && LOOKS[d.look].palette === d.palette ? { age, look, palette: LOOKS[look].palette } : { age }) }
  const setLook = (look: LookKey): void => up({ look, palette: LOOKS[look].palette })
  const setName = (recipient: string): void => {
    // Keep the name line in step with the recipient until the user edits the lines by hand.
    const ls = d.lines.split('\n'); const prev = d.recipient.trim().toUpperCase()
    const nameLine = ls.length >= 2 ? ls[ls.length - 1]!.trim().toUpperCase() : ''
    const auto = ls.length === 1 || nameLine === prev || nameLine === ''
    up(auto ? { recipient, lines: recipient.trim() ? `${ls[0] ?? 'HAPPY BIRTHDAY'}\n${recipient.trim()}` : ls[0] ?? 'HAPPY BIRTHDAY' } : { recipient })
  }
  const draftScene = async (): Promise<void> => {
    setDrafting('Gemma is drafting the scene…')
    try { const r = await call('enrich:preview', 'card_scene', sceneRequest(d)); if (r.used) { up({ scene: r.text }); void call('comfy:warm', 'zimage') } setDrafting(r.detail) } finally { setTimeout(() => setDrafting(''), 4000) }
  }
  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    try { await call('jobs:submitCard', draftToParams(d, `${Date.now().toString(36)}`)) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="row">
        <div className="field"><label>For</label><input value={d.recipient} onChange={(e) => setName(e.target.value)} placeholder="Nicholas" /></div>
        <div className="field"><label>Age (blank for an adult)</label><input type="number" min={1} max={120} value={d.age ?? ''} onChange={(e) => setAge(e.target.value === '' ? null : Number(e.target.value))} />
          <div className="hint">Shapes the whole picture; the card never describes the person.</div></div>
      </div>
      <div className="field"><label>Loves</label><input value={d.interests} onChange={(e) => up({ interests: e.target.value })} placeholder="airplanes and trains" /></div>
      <div className="field"><div className="label-row"><label htmlFor="card-lines">Top lettering, one line per line</label><label className="toggle mini"><input type="checkbox" checked={d.caps} onChange={(e) => up({ caps: e.target.checked })} /> capitals</label></div>
        <textarea id="card-lines" value={d.lines} onChange={(e) => up({ lines: e.target.value })} placeholder={'HAPPY 4TH BIRTHDAY\nNICHOLAS!'} style={{ minHeight: 64 }} />
        <div className={`hint ${longLines.length ? 'warn' : ''}`}>{longLines.length ? `Over ${LINE_MAX} characters, which the model renders unreliably: ${longLines.map((l) => `"${l}"`).join(', ')}. Break it at a natural pause.` : 'Exactly what will be drawn, letter for letter. The last line is the name and comes out biggest. Three lines at most.'}</div>
      </div>
      <div className="field"><label>Bottom line</label><input value={d.bottom} onChange={(e) => up({ bottom: e.target.value })} placeholder="From, The Sutins" />
        <div className="hint">Sign-off on a plain banner. Mixed case is fine here; leave empty for none.</div></div>
      <div className="field"><div className="label-row"><label htmlFor="card-scene">Scene</label><button type="button" className="btn ghost suggest" disabled={!!drafting} onClick={() => { void draftScene() }}>{drafting ? '…' : '✎ Draft with Gemma'}</button></div>
        <textarea id="card-scene" value={d.scene} onChange={(e) => up({ scene: e.target.value })} onBlur={() => { if (d.scene.trim()) void call('comfy:warm', 'zimage') }} placeholder="Five or six sentences: the biggest thing in the picture first, then each supporting thing with its position, colour and size, faces spelled out, ground and background last." />
        <div className="hint">{drafting || 'The picture between the title and the sign-off. Gemma drafts it from the fields above (the lettering is never given to Gemma); edit freely.'}</div>
      </div>
      <div className="row">
        <div className="field"><label>Look</label>
          <select value={d.look} onChange={(e) => setLook(e.target.value as LookKey)}>{(Object.keys(LOOKS) as LookKey[]).map((k) => <option key={k} value={k}>{LOOKS[k].label}</option>)}</select></div>
        <div className="field"><label>Palette</label><input value={d.palette} onChange={(e) => up({ palette: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Shape</label>
          <select value={d.shape} onChange={(e) => up({ shape: e.target.value as CardShape })}>{(Object.keys(CARD_SHAPES) as CardShape[]).map((k) => <option key={k} value={k}>{CARD_SHAPES[k].label}</option>)}</select></div>
        <div className="field"><label>Quality</label>
          <select value={d.quality} onChange={(e) => up({ quality: e.target.value as CardQuality })}>{(Object.keys(CARD_QUALITY) as CardQuality[]).map((k) => <option key={k} value={k}>{CARD_QUALITY[k].label}</option>)}</select>
          <div className="hint">{size.width} x {size.height}, {CARD_QUALITY[d.quality].steps} steps</div></div>
      </div>
      <div className="row">
        <div className="field"><label>Candidates per attempt</label><input type="number" min={1} max={4} value={d.count} onChange={(e) => up({ count: Number(e.target.value) })} /><div className="hint">Rendered together as one batch</div></div>
        <div className="field"><label>Seed (blank = random)</label><input type="number" value={d.seed ?? ''} onChange={(e) => up({ seed: e.target.value === '' ? null : Number(e.target.value) })} /><div className="hint">Same seed + edited prompt keeps the layout</div></div>
      </div>
      <label className="toggle"><input type="checkbox" checked={d.verify} onChange={(e) => up({ verify: e.target.checked })} /> Read the lettering back with OCR and re-roll a new seed when it is wrong, up to
        <input type="number" min={1} max={CARD_ATTEMPTS_MAX} value={d.attempts} onChange={(e) => up({ attempts: Number(e.target.value) })} style={{ width: 56 }} disabled={!d.verify} /> attempts</label>
      <div className={`hint ${ocr && !ocr.ok ? 'warn' : ''}`}>{ocr ? ocr.detail : 'Checking OCR…'}</div>
      <details className="prompt-preview" open={d.promptOverride.trim() ? true : undefined}>
        <summary>Prompt as it will be sent <span className={`meta ${words > PROMPT_WORDS_MAX ? 'warn' : ''}`}>{words} words{words > PROMPT_WORDS_MAX ? ` (over ${PROMPT_WORDS_MAX}: the end may be ignored)` : ''}{d.promptOverride.trim() ? ', edited by hand' : ''}</span></summary>
        <textarea value={prompt} onChange={(e) => up({ promptOverride: e.target.value })} style={{ minHeight: 220, fontSize: 12.5 }} />
        <div className="hint">Editing here overrides the assembled prompt. {d.promptOverride.trim() && <button type="button" className="btn ghost suggest" onClick={() => up({ promptOverride: '' })}>Back to the assembled prompt</button>}</div>
      </details>
      <button className="btn primary" disabled={!canSubmit} onClick={() => { void submit() }}>Make the card</button>
      <div className="hint">Z-Image Turbo on the Studio, measured at 880x1232 with the model resident: about {({ draft: 28, quick: 40, standard: 55, final: 90 } as const)[d.quality]} s per candidate{d.count > 1 ? `, ${d.count} candidates about ${d.count * ({ draft: 28, quick: 40, standard: 55, final: 90 } as const)[d.quality]} s` : ''}. The model is loaded in the background once a scene is in place; a cold load adds about 40 s. Gemma is not used at render time.</div>
    </>
  )
}
