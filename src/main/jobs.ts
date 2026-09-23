/**
 * One job at a time, in order. ComfyUI executes serially anyway, and running
 * the LLM enrichment inline keeps the sequence readable: enrich -> submit ->
 * watch -> collect. Progress is only ever reported from real events.
 */
import { powerSaveBlocker } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { annotatedSource, editGraph, imageGraph, modelFamily, musicGraph, NODE_LABELS, type ApiGraph } from '@shared/graphs'
import { randomSeed } from '@shared/sizing'
import { IMAGE_MODELS, imageModel } from '@shared/models'
import type { EditParams, ImageParams, Job, JobStatus, Kind, MusicParams, Output } from '@shared/types'
import type { ComfyClient, ComfyEvent } from './comfy'
import { liteOutUrl } from '@shared/net'
import { enrich, gemmaLoaded, gemmaResident, loadModel, unloadModel } from './enrich'
import { musicStyleBrief, normalizeStyleTags } from '@shared/enrich'

export interface JobDeps {
  comfy: ComfyClient
  omlx: () => { host: string; model: string; release: boolean }
  emit: (job: Job) => void
  file: string
  /** Start ComfyUI where it should run (the same path as the Start button), and whether a waiting job may do so by itself. */
  startComfy: () => Promise<{ ok: boolean; detail: string }>
  autoRestart: () => boolean
}

const MIN_FREE_GB = 3.5   // a warm render on the 36 GB Studio runs at 4.7-5.9 GB free (pressure level 1, measured 2026-09-22)
const MAX_RETRIES = 2
/** Sampling above this per image has killed ComfyUI on the 36 GB Studio; Print adds pixels by upscaling instead. */
const MAX_SAMPLE_MP = 1.6
const COMFY_WAIT_MS = 60 * 60_000
const LOST = 'ComfyUI no longer has this job (it was restarted or killed)'

export class JobManager {
  private jobs: Job[] = []
  private running = false
  private unsubscribe: (() => void) | null = null
  private aborts = new Map<string, () => void>()
  private current: Job | null = null
  private lastActivity = 0
  private lastFamily: string | null = null
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
    try {
      // A kind this build no longer has (the retired Card tab) is dropped on load: the tabs would never
      // show it, and a stale queued one would otherwise be built as the kind the job pump falls through to.
      if (existsSync(d.file)) this.jobs = (JSON.parse(readFileSync(d.file, 'utf8')) as Job[]).filter((j) => j.kind === 'image' || j.kind === 'edit' || j.kind === 'music').map((j) => ({ ...j, outputs: (j.outputs ?? []).map((o) => ({ ...o, viewUrl: o.viewUrl ?? o.url, url: liteOutUrl(o.subfolder, o.filename, o.type) })) })).map((j) => {
        // Across a relaunch: finished jobs stay as they are; a job ComfyUI has (running with a prompt id) is
        // reconciled by resume(); anything still waiting or only enriching simply runs again from the start.
        if (j.status === 'done' || j.status === 'cancelled' || j.status === 'queued' || (j.status === 'running' && j.promptId)) return j
        if (j.status === 'failed') return (j.error === 'app closed while running' && j.progressLabel === 'Queued' && j.outputs.length === 0) ? { ...j, status: 'queued' as const, error: undefined } : j
        return { ...j, status: 'queued' as const, promptId: undefined, progress: null, progressLabel: 'Queued again after a relaunch' }
      })
    } catch { this.jobs = [] }
  }
  list(): Job[] { return this.jobs.map((j) => ({ ...j })) }
  busy(): boolean { return this.running }
  /** Call once after construction: jobs left queued by a previous run start again, and a job that was
   *  running with a prompt id is reconciled with ComfyUI's history, which may well hold its result. */
  resume(): void {
    void (async () => {
      for (const job of this.jobs.filter((j) => j.status === 'running' && j.promptId)) {
        if ((await this.d.comfy.queued(job.promptId!)) === true) {
          // Still running or pending in ComfyUI: watch it to the end (node labels fall back to class names).
          console.log(`[lite] reattached to ${job.kind} job ${job.id}, still in ComfyUI's queue`)
          this.running = true; this.current = job; this.lastActivity = Date.now()
          try {
            const r = await this.watch(job, job.promptId!, {})
            const outputs = [...job.outputs, ...r.outputs]; const count = Math.max(1, Number((job.params as { count?: number }).count ?? 1))
            if ((job.status as JobStatus) === 'cancelled') { /* left as the user set it */ }
            else if (r.error) this.patch(job, { status: r.error === LOST && (job.retries ?? 0) < MAX_RETRIES ? 'queued' : 'failed', retries: r.error === LOST ? (job.retries ?? 0) + 1 : job.retries, promptId: undefined, error: r.error === LOST ? undefined : r.error, progressLabel: r.error === LOST ? 'ComfyUI was restarted; retrying' : 'Failed', finishedAt: r.error === LOST ? undefined : Date.now() })
            else if (outputs.length < count) this.patch(job, { status: 'queued', promptId: undefined, outputs, progressLabel: `Queued again for candidate ${outputs.length + 1} of ${count}` })
            else this.patch(job, { status: 'done', progress: 1, progressLabel: 'Done', finishedAt: Date.now(), outputs })
          } finally { this.running = false; this.current = null }
          continue
        }
        const r = await this.d.comfy.outputs(job.promptId!).catch(() => null)
        if (r?.status === 'success' && r.outputs.length) {
          console.log(`[lite] recovered ${job.kind} job ${job.id} from ComfyUI history (${r.outputs.map((o) => o.filename).join(', ')})`)
          this.patch(job, { status: 'done', progress: 1, progressLabel: 'Done (recovered after a restart)', finishedAt: Date.now(), outputs: r.outputs })
        } else if ((r === null || !r.status) && (job.retries ?? 0) < MAX_RETRIES) {
          // ComfyUI is down or has forgotten the prompt (killed under it): run it again once it is back.
          console.warn(`[lite] ${job.kind} job ${job.id} lost (ComfyUI ${r === null ? 'unreachable' : 'has no record of it'}); retry ${(job.retries ?? 0) + 1} of ${MAX_RETRIES}`)
          this.patch(job, { status: 'queued', retries: (job.retries ?? 0) + 1, promptId: undefined, progress: null, progressLabel: `ComfyUI was restarted; retrying (${(job.retries ?? 0) + 1} of ${MAX_RETRIES})` })
        } else this.patch(job, { status: 'failed', error: r?.error ?? 'app closed while running', progressLabel: 'Failed', finishedAt: Date.now(), outputs: r?.outputs ?? [] })
      }
      if (this.jobs.some((j) => j.status === 'queued')) void this.pump()
    })()
  }

  submit(kind: Kind, params: ImageParams | EditParams | MusicParams): Job {
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

  /** Drop a deleted result from whichever job produced it. */
  forgetOutput(o: { subfolder: string; filename: string }): void {
    for (const job of this.jobs) {
      const i = job.outputs.findIndex((x) => x.filename === o.filename && x.subfolder === o.subfolder)
      if (i < 0) continue
      this.patch(job, { outputs: job.outputs.filter((_, n) => n !== i) })
    }
  }

  private patch(job: Job, p: Partial<Job>): void { Object.assign(job, p); this.lastActivity = Date.now(); this.save(); this.d.emit(job) }
  private save(): void { try { mkdirSync(dirname(this.d.file), { recursive: true }); writeFileSync(this.d.file, JSON.stringify(this.jobs.slice(0, 200))) } catch { /* non-fatal */ } }

  /** Gemma (21 GB as configured) and Z-Image (20 GB) cannot share the Studio's 36 GB: drop whatever
   *  ComfyUI holds before Gemma loads. Cheap when ComfyUI holds nothing. */
  async loadGemma(host: string, model: string): Promise<void> {
    if (gemmaResident()) { await loadModel(host, model); return }   // pre-loaded by this instance: ComfyUI was freed then
    await this.d.comfy.free(); this.lastFamily = null
    await loadModel(host, model)
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    // A thin client waiting minutes for a remote render must not be napped or slept meanwhile.
    const blocker = powerSaveBlocker.start('prevent-app-suspension')
    try {
      for (;;) {
        const next = [...this.jobs].reverse().find((j) => j.status === 'queued')
        if (!next) break
        this.current = next; this.lastActivity = Date.now()
        await this.run(next)
        this.current = null
      }
    } finally { this.running = false; powerSaveBlocker.stop(blocker) }
  }

  private async run(job: Job): Promise<void> {
    const { host, model, release } = this.d.omlx()
    let gemmaUsed = false
    const seed = job.seed ?? ((job.params.seed ?? null) === null ? randomSeed() : (job.params.seed as number))
    this.patch(job, { seed })
    // Candidates render as separate prompts (seed, seed+1, ...): a batch costs the same time on MPS and
    // several times the memory. A job re-queued after a ComfyUI restart carries on from the ones it has.
    let count = 1
    let build: (i: number) => ApiGraph
    try {
      if (job.kind === 'image') {
        let p = job.params as ImageParams; count = Math.max(1, p.count)
        // Every model has its own ceiling, and the heavy ones sit below the global one: Juggernaut Z
        // took the Studio to critical pressure at 1.5 MP and the guard killed ComfyUI mid-render.
        const m = IMAGE_MODELS[imageModel(p.model)]; const cap = Math.min(MAX_SAMPLE_MP, m.memory.maxMegapixels)
        if (p.megapixels > cap) { p = { ...p, megapixels: cap }; this.patch(job, { progressLabel: `${(job.params as ImageParams).megapixels} MP capped to ${cap}: sampling larger than that on ${m.label} trips the memory guard and kills ComfyUI (Print upscales instead)` }) }
        let prompt = job.enriched?.prompt ?? p.prompt
        if (p.enrich && !job.enriched?.prompt) {
          this.patch(job, { status: 'enriching', progressLabel: 'Loading Gemma', startedAt: Date.now() })
          await this.loadGemma(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is rewriting the prompt' })
          const r = await enrich(host, model, 'image', p.prompt); prompt = r.text
          this.patch(job, { enriched: { prompt: r.used ? r.text : undefined }, progressLabel: r.detail })
        }
        if (job.status === 'cancelled') return
        const pp = p
        build = (i) => imageGraph({ ...pp, count: 1 }, prompt, seed + i)
      } else if (job.kind === 'edit') {
        const p = job.params as EditParams
        let loadName: string
        if (p.source) {
          // A result ComfyUI already holds: read it in place, no upload.
          loadName = annotatedSource(p.source)
          this.patch(job, { status: 'enriching', uploaded: { name: p.source.filename, subfolder: p.source.subfolder, type: p.source.type }, progressLabel: 'Editing a result in place', startedAt: Date.now() })
        } else {
          this.patch(job, { status: 'enriching', progressLabel: 'Uploading source image to ComfyUI', startedAt: Date.now() })
          const up = await this.d.comfy.uploadImage(p.imagePath)
          this.patch(job, { uploaded: { ...up, type: 'input' } })
          loadName = up.subfolder ? `${up.subfolder}/${up.name}` : up.name
        }
        let instruction = job.enriched?.prompt ?? p.instruction
        if (p.enrich && !job.enriched?.prompt) {
          this.patch(job, { progressLabel: 'Loading Gemma' })
          await this.loadGemma(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is sharpening the edit instruction' })
          const r = await enrich(host, model, 'image_edit', p.instruction); instruction = r.text
          this.patch(job, { enriched: { prompt: r.used ? r.text : undefined }, progressLabel: r.detail })
        }
        if ((job.status as JobStatus) === 'cancelled') return
        const g = editGraph(p, instruction, seed, loadName)
        build = () => g
      } else {
        const p = job.params as MusicParams
        let style = job.enriched?.style ?? p.style, lyrics = job.enriched?.lyrics ?? p.lyrics
        if (p.enrich && !job.enriched?.style) {
          this.patch(job, { status: 'enriching', progressLabel: 'Loading Gemma', startedAt: Date.now() })
          await this.loadGemma(host, model); gemmaUsed = true
          this.patch(job, { progressLabel: 'Gemma is expanding the style' })
          const s = await enrich(host, model, 'music_style', p.style, 220, musicStyleBrief(p.bpm)); style = s.text
          this.patch(job, { progressLabel: 'Gemma is writing the lyrics' })
          const l = await enrich(host, model, 'music_lyrics', p.lyrics); lyrics = l.text
          this.patch(job, { enriched: { style: s.used ? s.text : undefined, lyrics: l.used ? l.text : undefined }, progressLabel: `${s.detail}; ${l.detail}` })
        }
        style = normalizeStyleTags(style, p.bpm)   // tags and the bpm parameter must agree
        this.patch(job, { enriched: { ...(job.enriched ?? {}), style } })
        if (job.status === 'cancelled') return
        const g = musicGraph(p, style, lyrics, seed)
        build = () => g
      }
      // Another instance may have left Gemma resident: ask oMLX.
      if (release && (gemmaUsed || await gemmaLoaded(host, model))) {
        this.patch(job, { progressLabel: 'Releasing Gemma so ComfyUI has the memory' })
        const u = await unloadModel(host, model)
        if (!u.ok) this.patch(job, { progressLabel: `Could not release Gemma (${u.detail}); continuing` })
      }
      if ((job.status as JobStatus) === 'cancelled') return  // patch() mutates; TS's narrowing does not see it
      // Consecutive jobs of one model family reuse what ComfyUI has resident (when its node cache is on);
      // switching families frees the old weights first so the new ones never have to fit beside them.
      const family = modelFamily(job.kind, job.kind === 'image' ? (job.params as ImageParams).model : undefined)
      if (this.lastFamily && this.lastFamily !== family) { this.patch(job, { progressLabel: 'Freeing the previous model in ComfyUI' }); await this.d.comfy.free() }
      this.lastFamily = family
      const outputs: Output[] = [...job.outputs]
      for (let i = outputs.length; i < count; i++) {
        const tag = count > 1 ? `candidate ${i + 1} of ${count}: ` : ''
        if (!(await this.waitForComfy(job, tag))) return
        // Resident weights plus CPU-side copies of a partially unloaded model leave too little for the next
        // render; below this much free RAM a clean reload (about 40 s) beats a kernel-pressure kill.
        const freeGb = await this.d.comfy.freeRamGb()
        if (freeGb !== null && freeGb < MIN_FREE_GB) { this.patch(job, { progressLabel: `${tag}Freeing memory in ComfyUI first (${freeGb.toFixed(1)} GB free)` }); await this.d.comfy.free(); this.lastFamily = null }
        this.patch(job, { status: 'running', progress: null, progressLabel: `${tag}Sending to ComfyUI`, startedAt: job.startedAt ?? Date.now() })
        const graph = build(i)
        const promptId = await this.d.comfy.submit(graph)
        this.patch(job, { promptId })
        const r = await this.watch(job, promptId, graph, tag)
        if ((job.status as JobStatus) === 'cancelled') return
        if (r.error === LOST) {
          if ((job.retries ?? 0) < MAX_RETRIES) {
            // ComfyUI was restarted or killed under this prompt: queue the job again; it resumes at this candidate.
            console.warn(`[lite] ${job.kind} job ${job.id} lost to a ComfyUI restart; retry ${(job.retries ?? 0) + 1} of ${MAX_RETRIES}`)
            this.patch(job, { status: 'queued', retries: (job.retries ?? 0) + 1, promptId: undefined, progress: null, outputs, progressLabel: `ComfyUI was restarted; retrying (${(job.retries ?? 0) + 1} of ${MAX_RETRIES})` })
            return
          }
          throw new Error(`ComfyUI was killed under this job ${MAX_RETRIES + 1} times; it is too big for the Studio's memory (try fewer candidates, a lower quality, or Print instead of a larger canvas)`)
        }
        if (r.error) throw new Error(r.error)
        outputs.push(...r.outputs)
        this.patch(job, { outputs })
      }
      this.patch(job, { status: 'done', progress: 1, progressLabel: 'Done', finishedAt: Date.now(), outputs })
    } catch (err) {
      this.patch(job, { status: 'failed', error: err instanceof Error ? err.message : String(err), progressLabel: 'Failed', finishedAt: Date.now() })
    }
  }

  /** ComfyUI may be down (killed by the memory guard, or being restarted). Wait for it, and after 20 s
   *  start it ourselves when allowed, the way the Start button does. False when the job was cancelled. */
  private async waitForComfy(job: Job, tag: string): Promise<boolean> {
    if ((await this.d.comfy.up()).ok) return true
    this.patch(job, { status: 'running', progress: null, progressLabel: `${tag}Waiting for ComfyUI to come back`, startedAt: job.startedAt ?? Date.now() })
    const t0 = Date.now(); let started = false
    while (!(await this.d.comfy.up()).ok) {
      if ((job.status as JobStatus) === 'cancelled') return false
      if (Date.now() - t0 > COMFY_WAIT_MS) throw new Error('ComfyUI did not come back within an hour')
      if (!started && this.d.autoRestart() && Date.now() - t0 > 20_000) {
        started = true
        this.patch(job, { progressLabel: `${tag}ComfyUI is down; starting it` })
        const r = await this.d.startComfy(); console.log(`[lite] auto-start of ComfyUI: ${JSON.stringify(r)}`)
        this.patch(job, { progressLabel: r.ok ? `${tag}ComfyUI started (${r.detail}); waiting for it to answer` : `${tag}Could not start ComfyUI (${r.detail}); still waiting for it` })
      }
      await new Promise((r) => setTimeout(r, 5000)); this.lastActivity = Date.now()
    }
    this.lastFamily = null   // a fresh ComfyUI holds nothing
    // A fresh ComfyUI after a kill: let the host's memory settle before the cold load (see comfy-start.sh).
    this.patch(job, { progressLabel: `${tag}ComfyUI is back; letting memory settle` })
    for (let i = 0; i < 20; i++) { const free = await this.d.comfy.freeRamGb(); if (free === null || free >= 22) break; await new Promise((r) => setTimeout(r, 3000)) }
    return true
  }


  /** Follow one prompt to its end. Resolves with its outputs, or an error (LOST when ComfyUI no longer
   *  has it); the caller decides what that means for the job. */
  private watch(job: Job, promptId: string, graph: ApiGraph, tag = ''): Promise<{ outputs: Output[]; error?: string }> {
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
        const err = eventError ?? r.error ?? (r.status === 'error' ? 'ComfyUI reported an error' : r.status ? null : 'ComfyUI never wrote a result for this job')
        resolve(err ? { outputs: r.outputs, error: err } : { outputs: r.outputs })
      }
      const off = this.d.comfy.on((e: ComfyEvent) => {
        const d = e.data
        if (d['prompt_id'] !== promptId) return
        if (e.type === 'executing') {
          const node = d['node'] as string | null
          if (node === null) { void finish(); return }
          const cls = graph[node]?.class_type ?? node
          this.patch(job, { progress: null, progressLabel: tag + (NODE_LABELS[cls] ?? cls) })
        } else if (e.type === 'progress') {
          const v = Number(d['value']), m = Number(d['max'])
          if (m > 0) this.patch(job, { progress: v / m, progressLabel: `${tag}Generating  ${v}/${m} steps` })
        } else if (e.type === 'execution_error') {
          eventError = `${String(d['node_type'] ?? '')}: ${String(d['exception_message'] ?? 'error')}`.trim(); void finish()
        } else if (e.type === 'execution_interrupted') { eventError = 'interrupted'; void finish() }
        else if (e.type === 'execution_success') { void finish() }
      })
      // Belt and braces every 15 s: history done -> finish; prompt gone from queue AND history
      // (ComfyUI restarted or was killed) -> LOST instead of waiting forever. ComfyUI unreachable for
      // three polls in a row (killed under this prompt) is LOST too, so the job re-queues and restarts it.
      let unreachable = 0
      const poll = setInterval(() => {
        void (async () => {
          const r = await this.d.comfy.outputs(promptId).catch(() => null)
          if (r?.status) { void finish(); return }
          const q = await this.d.comfy.queued(promptId).catch(() => null)
          if (q === false && r && !r.status) { eventError = LOST; void finish(); return }
          if (r === null && q === null) { if (++unreachable >= 3) { eventError = LOST; void finish() } } else unreachable = 0
        })()
      }, 15_000)
    })
  }
}
