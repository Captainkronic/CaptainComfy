import type { JSX } from 'react'
import { useState } from 'react'
import type { ImageParams, Job, Kind, MusicParams, Output } from '@shared/types'
import { useStore } from '../state/store'
import { call } from '../lib'

function elapsed(j: Job): string {
  if (!j.startedAt) return ''
  const s = Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function Card({ job, onZoom }: { job: Job; onZoom: (o: Output) => void }): JSX.Element {
  const live = job.status === 'queued' || job.status === 'enriching' || job.status === 'running'
  const params = job.params
  const summary = job.kind === 'image' ? (params as ImageParams).prompt : `${(params as MusicParams).style}\n${(params as MusicParams).lyrics}`
  return (
    <div className="card">
      <div className="head">
        <span className={`badge ${job.status}`}>{job.status}</span>
        <span className="prompt" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        <span className="meta">{elapsed(job)}</span>
        {live && <button className="btn ghost" onClick={() => { void call('jobs:cancel', job.id) }}>Cancel</button>}
      </div>
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
      {job.outputs.length > 0 && (
        job.kind === 'image'
          ? <div className="grid">{job.outputs.map((o) => <img key={o.url} src={o.url} alt="" onClick={() => onZoom(o)} />)}</div>
          : job.outputs.map((o) => <audio key={o.url} controls preload="metadata" src={o.url} />)
      )}
      {job.outputs.length > 0 && (
        <div className="meta">
          {job.outputs.map((o) => <button key={o.url} className="btn ghost" onClick={() => { void call('shell:reveal', o) }}>Show {o.filename} in Finder</button>)}
        </div>
      )}
    </div>
  )
}


export default function JobList({ kind }: { kind: Kind }): JSX.Element {
  const jobs = useStore((s) => s.jobs).filter((j) => j.kind === kind)
  const [zoom, setZoom] = useState<Output | null>(null)
  return (
    <div className="results">
      <div className="head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="meta">{jobs.length} {kind} job{jobs.length === 1 ? '' : 's'}</span>
        <button className="btn ghost" onClick={() => { void call('jobs:clearFinished').then(() => location.reload()) }}>Clear finished</button>
      </div>
      {jobs.length === 0 && <div className="empty">Nothing yet. Fill in the form and press Generate.</div>}
      {jobs.map((j) => <Card key={j.id} job={j} onZoom={setZoom} />)}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom.url} alt="" /></div>}
    </div>
  )
}
