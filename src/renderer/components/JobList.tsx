import type { JSX } from 'react'
import { useState } from 'react'
import type { EditParams, ImageParams, Job, Kind, MusicParams, Output } from '@shared/types'
import { EDIT_QUALITY, editQualityOf, sizeFor } from '@shared/sizing'
import { IMAGE_MODELS, imageModel, imageQualityOf } from '@shared/models'
import { useStore } from '../state/store'
import { call } from '../lib'
import { isLoopback, liteOutUrl } from '@shared/net'

/** Everything that decided the result, in one line: the quality preset by name (or the numbers when set
 *  by hand), the output size, steps, seed, candidates, upscale, Gemma. Old jobs may lack some fields. */
function settingsOf(job: Job): { preset: string; items: string[] } {
  const items: string[] = []
  if (job.kind === 'image') {
    const p = job.params as ImageParams; const m = IMAGE_MODELS[imageModel(p.model)]; const q = imageQualityOf(p); const size = sizeFor(p.aspect, p.megapixels, m.snap); const up = p.upscale ?? 1
    const preset = `${m.label} · ${q ? m.presets[q].label : `custom: ${p.megapixels} MP, ${p.steps} steps${up > 1 ? `, ${up}x upscale` : ''}`}`
    items.push(`${p.aspect} ${size.width}x${size.height}${up > 1 ? ` → ${size.width * up}x${size.height * up}` : ''}`, `${p.steps} steps${m.recipe.cfg > 1 ? `, CFG ${m.recipe.cfg}` : ''}`, `~${m.memory.peakGb} GB peak`)
    if (p.count > 1) items.push(`${p.count} candidates`)
    items.push(p.enrich ? 'Gemma rewrote the prompt' : 'prompt as written')
    return { preset, items }
  }
  if (job.kind === 'edit') {
    const p = job.params as EditParams; const q = editQualityOf(p); const up = p.upscale ?? 1
    const preset = q ? `${EDIT_QUALITY[q].label} edit` : `custom edit: ${p.megapixels} MP, ${p.steps} steps${up > 1 ? `, ${up}x upscale` : ''}`
    return { preset, items: [`${p.megapixels} MP canvas${up > 1 ? `, ${up}x upscaled` : ''}`, `${p.steps} steps`, p.source ? 'edited a result in place' : 'uploaded file', p.enrich ? 'Gemma sharpened the instruction' : 'instruction as written'] }
  }
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

/** Delete a result for good. Main puts a modal confirmation in front of it and only unlinks the PNG
 *  once that is accepted, so there is nothing to undo here and nothing to double-check twice. */
function DeleteButton({ o }: { o: Output }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const del = async (): Promise<void> => {
    setBusy(true); setErr('')
    try { const r = await call('output:delete', o); if (!r.deleted && r.detail !== 'Cancelled') setErr(r.detail) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return (
    <>
      <button className="btn ghost danger" disabled={busy} title="Delete this file from ComfyUI's output folder for good" onClick={() => { void del() }}>{busy ? 'Deleting…' : '🗑 Delete'}</button>
      {err && <span className="err">{err}</span>}
    </>
  )
}

/** Remove a finished run from the list. Cancelled and failed runs leave nothing behind, so this is
 *  pure tidying; a run that produced images keeps them on disk, and the Delete under an image is what
 *  removes a file. Main refuses a run that is still going, and says so. */
function RemoveRunButton({ job }: { job: Job }): JSX.Element {
  const removeJob = useStore((s) => s.removeJob)
  const [err, setErr] = useState('')
  const keepsFiles = job.outputs.length > 0
  const go = async (): Promise<void> => {
    setErr('')
    try { const r = await call('jobs:remove', job.id); if (r.removed) removeJob(job.id); else setErr(r.detail) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <>
      <button className="btn ghost danger" onClick={() => { void go() }}
        title={keepsFiles ? 'Remove this run from the list. Its images stay on disk: use Delete under an image to remove the file.' : 'Remove this run from the list'}>
        🗑 Delete{keepsFiles ? ' run' : ''}
      </button>
      {err && <span className="err">{err}</span>}
    </>
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
  const summary = job.kind === 'image' ? (params as ImageParams).prompt : job.kind === 'edit' ? `${(params as EditParams).imageName}: ${(params as EditParams).instruction}` : `${(params as MusicParams).style}\n${(params as MusicParams).lyrics}`
  return (
    <div className="card">
      <div className="head">
        <span className={`badge ${job.status}`}>{job.status}</span>
        <span className="prompt" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        <span className="meta">{elapsed(job)}</span>
        {live && <button className="btn ghost" onClick={() => { void call('jobs:cancel', job.id) }}>Cancel</button>}
        {!live && <RemoveRunButton job={job} />}
      </div>
      <Settings job={job} />
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
      {job.outputs.length > 0 && job.kind !== 'edit' && (
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
              <DeleteButton o={o} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


export default function JobList({ kind }: { kind: Kind }): JSX.Element {
  const jobs = useStore((s) => s.jobs).filter((j) => j.kind === kind)
  const local = useStore((s) => (s.health ? isLoopback(s.health.comfy.host) : true))
  const removeJob = useStore((s) => s.removeJob)
  const [zoom, setZoom] = useState<Output | null>(null)
  // Runs that produced nothing. They are the ones that pile up, so they get their own sweep: it
  // touches no files, and leaves finished runs and anything still going alone.
  const spent = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled')
  const clearSpent = async (): Promise<void> => {
    for (const j of spent) { const r = await call('jobs:remove', j.id); if (r.removed) removeJob(j.id) }
  }
  return (
    <div className="results">
      <div className="head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="meta">{jobs.length} {kind} job{jobs.length === 1 ? '' : 's'}{spent.length > 0 ? `, ${spent.length} of them cancelled or failed` : ''}</span>
        <span>
          {spent.length > 0 && <button className="btn ghost danger" title="Remove every cancelled or failed run of this kind from the list. No files are touched." onClick={() => { void clearSpent() }}>🗑 Delete {spent.length} cancelled or failed</button>}
          <button className="btn ghost" onClick={() => { void call('jobs:clearFinished').then(() => location.reload()) }}>Clear finished</button>
        </span>
      </div>
      {jobs.length === 0 && <div className="empty">Nothing yet. Fill in the form and press Generate.</div>}
      {jobs.map((j) => <Card key={j.id} job={j} onZoom={setZoom} local={local} />)}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom.url} alt="" /></div>}
    </div>
  )
}
