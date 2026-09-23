import type { JSX } from 'react'
import { useState } from 'react'
import type { EditParams, ImageParams, Job, Kind, MusicParams, Output } from '@shared/types'
import { CARD_QUALITY, CARD_SHAPES, cardQualityKey, cardSize, type CardParams, type LetteringReport } from '@shared/card'
import { IMAGE_QUALITY, imageQualityOf, sizeFor } from '@shared/sizing'
import { useStore } from '../state/store'
import { call } from '../lib'
import { isLoopback, liteOutUrl } from '@shared/net'

/** Everything that decided the result, in one line: the quality preset by name (or the numbers when set
 *  by hand), the output size, steps, seed, candidates, upscale, Gemma. Old jobs may lack some fields. */
function settingsOf(job: Job): { preset: string; items: string[] } {
  const items: string[] = []
  if (job.kind === 'image') {
    const p = job.params as ImageParams; const q = imageQualityOf(p); const size = sizeFor(p.aspect, p.megapixels, 16); const up = p.upscale ?? 1
    const preset = q ? IMAGE_QUALITY[q].label : `custom: ${p.megapixels} MP, ${p.steps} steps${up > 1 ? `, ${up}x upscale` : ''}`
    items.push(`${p.aspect} ${size.width}x${size.height}${up > 1 ? ` → ${size.width * up}x${size.height * up}` : ''}`, `${p.steps} steps`)
    if (p.count > 1) items.push(`${p.count} candidates`)
    items.push(p.enrich ? 'Gemma rewrote the prompt' : 'prompt as written')
    return { preset, items }
  }
  if (job.kind === 'card') {
    const p = job.params as CardParams; const qk = cardQualityKey(p.quality); const q = CARD_QUALITY[qk]; const size = cardSize(p.shape, qk)
    items.push(`${CARD_SHAPES[p.shape].label} ${size.width}x${size.height}${q.upscale > 1 ? ` → ${size.width * q.upscale}x${size.height * q.upscale}` : ''}`, `${q.steps} steps`)
    if (p.count > 1) items.push(`${p.count} candidates`)
    items.push(`attempt ${p.attempt} of ${p.attempts}`, p.verify ? 'lettering read by OCR' : 'no OCR')
    return { preset: q.label, items }
  }
  if (job.kind === 'edit') { const p = job.params as EditParams; return { preset: 'FLUX.2 Klein edit', items: [`${p.megapixels} MP canvas`, `${p.steps} steps`, p.enrich ? 'Gemma sharpened the instruction' : 'instruction as written'] } }
  const p = job.params as MusicParams
  return { preset: 'ACE-Step', items: [`${p.seconds} s`, `${p.bpm} bpm`, `${p.steps} steps`, p.enrich ? 'Gemma expanded style and lyrics' : 'as written'] }
}

function Settings({ job }: { job: Job }): JSX.Element {
  const { preset, items } = settingsOf(job)
  return (
    <div className="settings">
      <b>{preset}</b>
      {items.map((t) => <span key={t}>{t}</span>)}
      {job.seed !== undefined && <span>seed {job.seed}</span>}
      {(job.retries ?? 0) > 0 && <span>re-run after a ComfyUI restart</span>}
    </div>
  )
}

function elapsed(j: Job): string {
  if (!j.startedAt) return ''
  const s = Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

/** One candidate's OCR verdict, in the words of the card guide: pass, check (look at these letters), fail. */
function Verdict({ r }: { r: LetteringReport | undefined }): JSX.Element {
  if (!r) return <div className="verdict pending">Reading the lettering…</div>
  const mark = r.verdict === 'pass' ? '✓' : r.verdict === 'check' ? '⚠' : r.verdict === 'fail' ? '✗' : '·'
  return (
    <div className={`verdict ${r.verdict}`} title={r.literal.length ? `OCR read (literal pass):\n${r.literal.map((l) => `${l.text}  [${l.where}, ${Math.round(l.confidence * 100)}%]`).join('\n')}` : r.detail}>
      <b>{mark} {r.verdict === 'pass' ? 'lettering verified' : r.verdict === 'check' ? 'look at the lettering' : r.verdict === 'fail' ? 'lettering wrong' : 'not checked'}</b> {r.detail}
      {r.checks.filter((c) => c.notes?.length).map((c) => <div key={c.expected} className="notes">{c.notes!.join('; ')}</div>)}
    </div>
  )
}

function CardActions({ job }: { job: Job }): JSX.Element {
  const p = job.params as CardParams
  const setDraft = useStore((s) => s.setCardDraft)
  const reroll = (): void => { void call('jobs:submitCard', { ...p, seed: null, attempt: 1, series: Date.now().toString(36) }) }
  const edit = (): void => { setDraft({ promptOverride: p.prompt, seed: job.seed ?? null }); document.querySelector('.form')?.scrollTo({ top: 0, behavior: 'smooth' }) }
  return (
    <span>
      <button className="btn ghost" title="Same prompt, new seed" onClick={reroll}>↻ Re-roll</button>
      <button className="btn ghost" title="Put this prompt and seed in the form to edit: the layout stays, the edit applies" onClick={edit}>✎ Edit this prompt</button>
    </span>
  )
}

/** Send a result to the Edit tab: the form loads it, you describe the change, the Klein edit runs on it. */
function EditButton({ o }: { o: Output }): JSX.Element {
  const setEditSource = useStore((s) => s.setEditSource); const setTab = useStore((s) => s.setTab)
  return <button className="btn ghost" title="Edit this image with a new instruction" onClick={() => { setEditSource(o); setTab('edit') }}>✎ Edit</button>
}

function Card({ job, onZoom, local }: { job: Job; onZoom: (o: Output) => void; local: boolean }): JSX.Element {
  const live = job.status === 'queued' || job.status === 'enriching' || job.status === 'running'
  const params = job.params
  const card = job.kind === 'card' ? (params as CardParams) : null
  const summary = card ? `${card.title}: ${card.expect.map((e) => `"${e}"`).join(' · ')}` : job.kind === 'image' ? (params as ImageParams).prompt : job.kind === 'edit' ? `${(params as EditParams).imageName}: ${(params as EditParams).instruction}` : `${(params as MusicParams).style}\n${(params as MusicParams).lyrics}`
  return (
    <div className="card">
      <div className="head">
        <span className={`badge ${job.status}`}>{job.status}</span>
        <span className="prompt" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        <span className="meta">{elapsed(job)}</span>
        {live && <button className="btn ghost" onClick={() => { void call('jobs:cancel', job.id) }}>Cancel</button>}
      </div>
      <Settings job={job} />
      {card && <details className="prompt-preview"><summary>Prompt as sent</summary><div className="enriched">{card.prompt}</div></details>}
      {job.kind === 'image' && <details className="prompt-preview"><summary>Prompt as typed</summary><div className="enriched">{(params as ImageParams).prompt}</div></details>}
      {live && (
        <>
          <div className={`bar ${job.progress === null ? 'indeterminate' : ''}`}><i style={job.progress === null ? undefined : { width: `${Math.round(job.progress * 100)}%` }} /></div>
          <div className="meta"><span>{job.progressLabel}</span>{job.progress === null && job.status === 'running' && <span>(no step count for this stage)</span>}</div>
        </>
      )}
      {!live && job.progressLabel && job.status !== 'done' && <div className="meta">{job.progressLabel}</div>}
      {job.enriched?.prompt && <div className="enriched"><b>Gemma:</b> {job.enriched.prompt}</div>}
      {job.enriched?.style && <div className="enriched"><b>Style:</b> {job.enriched.style}</div>}
      {job.enriched?.lyrics && <div className="enriched"><b>Lyrics:</b>{'\n'}{job.enriched.lyrics}</div>}
      {job.error && <div className="err">{job.error}</div>}
      {job.kind === 'edit' && job.uploaded && (
        <div className="grid two">
          <figure><img src={liteOutUrl(job.uploaded.subfolder, job.uploaded.name, job.uploaded.type ?? 'input')} alt="" onClick={() => onZoom({ filename: job.uploaded!.name, subfolder: job.uploaded!.subfolder, type: 'output', url: liteOutUrl(job.uploaded!.subfolder, job.uploaded!.name, job.uploaded!.type ?? 'input'), viewUrl: '' })} /><figcaption>Before</figcaption></figure>
          {job.outputs[0]
            ? <figure><img src={job.outputs[0].url} alt="" onClick={() => onZoom(job.outputs[0]!)} /><figcaption>After</figcaption></figure>
            : <figure><div className="pending">{live ? 'Editing…' : 'No result'}</div><figcaption>After</figcaption></figure>}
        </div>
      )}
      {job.outputs.length > 0 && job.kind === 'card' && (
        <div className="grid">
          {job.outputs.map((o, i) => (
            <figure key={o.url}>
              <img src={o.url} alt="" onClick={() => onZoom(o)} />
              {card!.verify && card!.expect.length > 0 && <Verdict r={job.lettering?.[i]} />}
              <figcaption>{job.outputs.length > 1 ? `candidate ${i + 1}` : ''}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {job.outputs.length > 0 && job.kind !== 'edit' && job.kind !== 'card' && (
        job.kind !== 'music'
          ? <div className="grid">{job.outputs.map((o) => <img key={o.url} src={o.url} alt="" onClick={() => onZoom(o)} />)}</div>
          : job.outputs.map((o) => <audio key={o.url} controls preload="metadata" src={o.url} />)
      )}
      {job.outputs.length > 0 && (
        <div className="meta">
          {job.outputs.map((o) => (
            <span key={o.url}>
              <button className="btn ghost" onClick={() => { void call('output:save', o) }}>⬇ Download {o.filename}</button>
              {job.kind !== 'music' && <EditButton o={o} />}
              {local && <button className="btn ghost" onClick={() => { void call('shell:reveal', o) }}>Show in Finder</button>}
            </span>
          ))}
        </div>
      )}
      {card && !live && <div className="meta"><CardActions job={job} /></div>}
    </div>
  )
}


export default function JobList({ kind }: { kind: Kind }): JSX.Element {
  const jobs = useStore((s) => s.jobs).filter((j) => j.kind === kind)
  const local = useStore((s) => (s.health ? isLoopback(s.health.comfy.host) : true))
  const [zoom, setZoom] = useState<Output | null>(null)
  return (
    <div className="results">
      <div className="head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="meta">{jobs.length} {kind} job{jobs.length === 1 ? '' : 's'}</span>
        <button className="btn ghost" onClick={() => { void call('jobs:clearFinished').then(() => location.reload()) }}>Clear finished</button>
      </div>
      {jobs.length === 0 && <div className="empty">Nothing yet. Fill in the form and press Generate.</div>}
      {jobs.map((j) => <Card key={j.id} job={j} onZoom={setZoom} local={local} />)}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom.url} alt="" /></div>}
    </div>
  )
}
