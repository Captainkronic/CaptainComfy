/**
 * One job at a time, in order. ComfyUI executes serially anyway, and running
 * the LLM enrichment inline keeps the sequence readable: enrich -> submit ->
 * watch -> collect. Progress is only ever reported from real events.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { editGraph, imageGraph, musicGraph, NODE_LABELS, type ApiGraph } from '@shared/graphs'
import { randomSeed } from '@shared/sizing'
import type { EditParams, ImageParams, Job, JobStatus, MusicParams, Output } from '@shared/types'
import type { ComfyClient, ComfyEvent } from './comfy'
import { liteOutUrl } from '@shared/net'
import { enrich, loadModel, unloadModel } from './enrich'
import { musicStyleBrief, normalizeStyleTags } from '@shared/enrich'

export interface JobDeps {
  comfy: ComfyClient
  omlx: () => { host: string; model: string; release: boolean }
  emit: (job: Job) => void
  file: string
}

export class JobManager {
  private jobs: Job[] = []
  private running = false
  private unsubscribe: (() => void) | null = null
  private aborts = new Map<string, () => void>()
  private current: Job | null = null
  private lastActivity = 0
  /** Runs every 10 s from main: restarts an idle pump with queued work, and fails a job that has gone silent. */
  watchdog(): void {
    const stale = this.running && this.current && Date.now() - this.lastActivity > 10 * 60_000
    if (stale && this.current) {
      console.warn(`[lite] job ${this.current.id} silent for 10 min; failing it and releasing the queue`)
      this.patch(this.current, { status: 'failed', error: 'no progress for 10 minutes (ComfyUI or Gemma stopped responding)', progressLabel: 'Failed', finishedAt: Date.now() })
      this.aborts.get(this.current.id)?.(); this.running = false; this.current = null
    }
    if (!this.running && this.jobs.some((j) => j.status === 'queued')) void this.pump()
  }
  constructor(private readonly d: JobDeps) {
    try { if (existsSync(d.file)) this.jobs = (JSON.parse(readFileSync(d.file, 'utf8')) as Job[]).map((j) => ({ ...j, outputs: (j.outputs ?? []).map((o) => ({ ...o, viewUrl: o.viewUrl ?? o.url, url: liteOutUrl(o.subfolder, o.filename, o.type) })) })).map((j) => (j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') ? j : { ...j, status: 'failed' as const, error: 'app closed while running' }) } catch { this.jobs = [] }
  }
  list(): Job[] { return this.jobs.map((j) => ({ ...j })) }
  /** Call once after construction: jobs left queued by a previous run start again. */
  resume(): void { if (this.jobs.some((j) => j.status === 'queued')) void this.pump() }

  submit(kind: 'image' | 'edit' | 'music', params: ImageParams | EditParams | MusicParams): Job {
    const job: Job = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, kind, createdAt: Date.now(), status: 'queued', params, progress: null, progressLabel: 'Queued', outputs: [] }
    this.jobs.unshift(job); this.save(); this.d.emit(job); void this.pump(); return job
  }
  async cancel(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id); if (!job) return
    if (job.promptId) await this.d.comfy.cancel(job.promptId)
    if (job.status === 'queued' || job.status === 'enriching' || job.status === 'running') this.patch(job, { status: 'cancelled', progressLabel: 'Cancelled', finishedAt: Date.now() })
    this.aborts.get(job.id)?.()   // wake the watcher so the next queued job can start
  }
  clearFinished(): void { this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'enriching' || j.status === 'running'); this.save() }

  private patch(job: Job, p: Partial<Job>): void { Object.assign(job, p); this.lastActivity = Date.now(); this.save(); this.d.emit(job) }
  private save(): void { try { mkdirSync(dirname(this.d.file), { recursive: true }); writeFileSync(this.d.file, JSON.stringify(this.jobs.slice(0, 200))) } catch { /* non-fatal */ } }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (;;) {
        const next = [...this.jobs].reverse().find((j) => j.status === 'queued')
        if (!next) break
        this.current = next; this.lastActivity = Date.now()
        await this.run(next)
        this.current = null
      }
    } finally { this.running = false }
  }

  private async run(job: Job): Promise<void> {
    const { host, model, release } = this.d.omlx()
    let gemmaUsed = false
    const seed = (job.params.seed ?? null) === null ? randomSeed() : (job.params.seed as number)
    let graph: ApiGraph
    try {
      if (job.kind === 'image') {
        const p = job.params as ImageParams
        let prompt = p.prompt
        if (p.enrich) {
          this.patch(job, { status: 'enriching', progressLabel: 'Loading Gemma', startedAt: Date.now() })
          await loadModel(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is rewriting the prompt' })
          const r = await enrich(host, model, 'image', p.prompt); prompt = r.text
          this.patch(job, { enriched: { prompt: r.used ? r.text : undefined }, progressLabel: r.detail })
        }
        if (job.status === 'cancelled') return
        graph = imageGraph(p, prompt, seed)
      } else if (job.kind === 'edit') {
        const p = job.params as EditParams
        this.patch(job, { status: 'enriching', progressLabel: 'Uploading source image to ComfyUI', startedAt: Date.now() })
        const up = await this.d.comfy.uploadImage(p.imagePath)
        this.patch(job, { uploaded: up })
        let instruction = p.instruction
        if (p.enrich) {
          this.patch(job, { progressLabel: 'Loading Gemma' })
          await loadModel(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is sharpening the edit instruction' })
          const r = await enrich(host, model, 'image_edit', p.instruction); instruction = r.text
          this.patch(job, { enriched: { prompt: r.used ? r.text : undefined }, progressLabel: r.detail })
        }
        if ((job.status as JobStatus) === 'cancelled') return
        graph = editGraph(p, instruction, seed, up.subfolder ? `${up.subfolder}/${up.name}` : up.name)
      } else {
        const p = job.params as MusicParams
        let style = p.style, lyrics = p.lyrics
        if (p.enrich) {
          this.patch(job, { status: 'enriching', progressLabel: 'Loading Gemma', startedAt: Date.now() })
          await loadModel(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is expanding the style' })
          const s = await enrich(host, model, 'music_style', p.style, 220, musicStyleBrief(p.bpm)); style = s.text
          this.patch(job, { progressLabel: 'Gemma is writing the lyrics' })
          const l = await enrich(host, model, 'music_lyrics', p.lyrics); lyrics = l.text
          this.patch(job, { enriched: { style: s.used ? s.text : undefined, lyrics: l.used ? l.text : undefined }, progressLabel: `${s.detail}; ${l.detail}` })
        }
        style = normalizeStyleTags(style, p.bpm)   // tags and the bpm parameter must agree
        this.patch(job, { enriched: { ...(job.enriched ?? {}), style } })
        if (job.status === 'cancelled') return
        graph = musicGraph(p, style, lyrics, seed)
      }
      if (gemmaUsed && release) {
        this.patch(job, { progressLabel: 'Releasing Gemma so ComfyUI has the memory' })
        const u = await unloadModel(host, model)
        if (!u.ok) this.patch(job, { progressLabel: `Could not release Gemma (${u.detail}); continuing` })
      }
      if ((job.status as JobStatus) === 'cancelled') return  // patch() mutates; TS's narrowing does not see it
      this.patch(job, { status: 'running', progressLabel: 'Sending to ComfyUI', startedAt: job.startedAt ?? Date.now() })
      const promptId = await this.d.comfy.submit(graph)
      this.patch(job, { promptId })
      await this.watch(job, promptId, graph)
    } catch (err) {
      this.patch(job, { status: 'failed', error: err instanceof Error ? err.message : String(err), progressLabel: 'Failed', finishedAt: Date.now() })
    }
  }

  private watch(job: Job, promptId: string, graph: ApiGraph): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      let eventError: string | null = null
      this.aborts.set(job.id, () => { eventError = eventError ?? 'cancelled'; void finish() })
      const finish = async (): Promise<void> => {
        if (settled) return; settled = true; off(); clearInterval(poll); this.aborts.delete(job.id)
        // ComfyUI emits the finishing event a beat before it writes history; wait for history to exist.
        let r: { outputs: Output[]; status?: string; error?: string } = { outputs: [] }
        for (let i = 0; i < 20; i++) {
          r = await this.d.comfy.outputs(promptId).catch(() => ({ outputs: [], error: 'could not read history' }))
          if (r.status) break
          await new Promise((res) => setTimeout(res, 500))
        }
        if (job.status === 'cancelled') { resolve(); return }
        const err = eventError ?? r.error ?? (r.status === 'error' ? 'ComfyUI reported an error' : r.status ? null : 'ComfyUI never wrote a result for this job')
        if (err) this.patch(job, { status: 'failed', error: err, progressLabel: 'Failed', finishedAt: Date.now(), outputs: r.outputs })
        else this.patch(job, { status: 'done', progress: 1, progressLabel: 'Done', finishedAt: Date.now(), outputs: r.outputs })
        resolve()
      }
      const off = this.d.comfy.on((e: ComfyEvent) => {
        const d = e.data
        if (d['prompt_id'] !== promptId) return
        if (e.type === 'executing') {
          const node = d['node'] as string | null
          if (node === null) { void finish(); return }
          const cls = graph[node]?.class_type ?? node
          this.patch(job, { progress: null, progressLabel: NODE_LABELS[cls] ?? cls })
        } else if (e.type === 'progress') {
          const v = Number(d['value']), m = Number(d['max'])
          if (m > 0) this.patch(job, { progress: v / m, progressLabel: `Generating  ${v}/${m} steps` })
        } else if (e.type === 'execution_error') {
          eventError = `${String(d['node_type'] ?? '')}: ${String(d['exception_message'] ?? 'error')}`.trim(); void finish()
        } else if (e.type === 'execution_interrupted') { eventError = 'interrupted'; void finish() }
        else if (e.type === 'execution_success') { void finish() }
      })
      // Belt and braces every 15 s: history done -> finish; prompt gone from queue AND history
      // (ComfyUI restarted or was killed) -> fail instead of waiting forever.
      const poll = setInterval(() => {
        void (async () => {
          const r = await this.d.comfy.outputs(promptId).catch(() => null)
          if (r?.status) { void finish(); return }
          const q = await this.d.comfy.queued(promptId).catch(() => null)
          if (q === false && r && !r.status) { eventError = 'ComfyUI no longer has this job (it was restarted or killed)'; void finish() }
        })()
      }, 15_000)
    })
  }
}
