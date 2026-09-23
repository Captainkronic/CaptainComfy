/**
 * Thin ComfyUI client: health, start-if-needed, submit, live progress over its
 * WebSocket, and output URLs. Everything the renderer shows comes from ComfyUI's
 * own /view endpoint, so no file bytes ever pass through IPC.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { join } from 'node:path'
import type { ApiGraph } from '@shared/graphs'
import type { Output } from '@shared/types'
import { liteOutUrl } from '@shared/net'

export interface ComfyEvent {
  type: 'executing' | 'progress' | 'executed' | 'execution_success' | 'execution_error' | 'execution_interrupted' | 'execution_start' | 'status' | string
  data: Record<string, unknown>
}

/** Free RAM that says the Z-Image weights are really gone from a 36 GB host (they are ~20 GB). */
const FREE_AFTER_FREE_GB = 22

export class ComfyClient {
  private ws: WebSocket | null = null
  private listeners = new Set<(e: ComfyEvent) => void>()
  readonly clientId = `lite-${Math.random().toString(36).slice(2)}`
  constructor(private host: string) {}

  setHost(host: string): void { if (host !== this.host) { this.host = host; this.closeWs() } }
  get base(): string { return this.host.replace(/\/+$/, '') }

  async up(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(`${this.base}/system_stats`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const j = (await res.json()) as { system?: { comfyui_version?: string }; devices?: Array<{ name?: string; vram_total?: number }> }
      const dev = j.devices?.[0]
      return { ok: true, detail: `ComfyUI ${j.system?.comfyui_version ?? ''} on ${dev?.name ?? 'device'}`.trim() }
    } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
  }

  /** Start the local install headlessly if nothing answers. Detached: outlives this app on purpose. */
  async start(opts: { dir: string; yaml: string; input: string; output: string; flags: string[] }, timeoutMs = 240_000): Promise<{ ok: boolean; detail: string }> {
    if ((await this.up()).ok) return { ok: true, detail: 'already running' }
    const python = join(opts.dir, '.venv', 'bin', 'python')
    const main = join(opts.dir, 'main.py')
    if (!existsSync(python) || !existsSync(main)) return { ok: false, detail: `No ComfyUI at ${opts.dir}` }
    const port = /:(\d+)/.exec(this.host)?.[1] ?? '8188'
    const args = [main, '--port', port, '--disable-auto-launch', ...opts.flags]
    if (existsSync(opts.yaml)) args.push('--extra-model-paths-config', opts.yaml)
    if (existsSync(opts.input)) args.push('--input-directory', opts.input)
    if (existsSync(opts.output)) args.push('--output-directory', opts.output)
    const child = execFile(python, args, { cwd: opts.dir, detached: true, stdio: 'ignore' } as never, () => undefined)
    child.unref?.()
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      await new Promise((r) => setTimeout(r, 2000))
      if ((await this.up()).ok) return { ok: true, detail: `started in ${Math.round((Date.now() - t0) / 1000)} s` }
    }
    return { ok: false, detail: `did not answer within ${Math.round(timeoutMs / 1000)} s` }
  }

  /** Upload a local image into ComfyUI's top-level input folder under a unique name (LoadImage
   *  validates against that folder's listing). Works the same locally and over the tailnet. */
  async uploadImage(path: string): Promise<{ name: string; subfolder: string }> {
    const bytes = readFileSync(path)
    const ext = extname(path).toLowerCase() || '.png'
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
    const name = `captaincomfy_${Date.now().toString(36)}_${basename(path, extname(path)).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40)}${ext}`
    const form = new FormData()
    form.append('image', new Blob([bytes], { type: mime }), name)
    form.append('type', 'input'); form.append('overwrite', 'true')
    const res = await fetch(`${this.base}/upload/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const j = (await res.json()) as { name: string; subfolder?: string }
    return { name: j.name, subfolder: j.subfolder ?? '' }
  }

  async submit(graph: ApiGraph): Promise<string> {
    const res = await fetch(`${this.base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: this.clientId }), signal: AbortSignal.timeout(30_000) })
    const j = (await res.json()) as { prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, unknown> }
    if (!res.ok || !j.prompt_id) {
      const nodeErr = j.node_errors && Object.keys(j.node_errors).length ? ' ' + JSON.stringify(j.node_errors).slice(0, 400) : ''
      throw new Error((j.error?.message ?? `HTTP ${res.status}`) + nodeErr)
    }
    return j.prompt_id
  }

  /** Free RAM on the ComfyUI host in GB (what its own model management goes by), or null when unreachable. */
  async freeRamGb(): Promise<number | null> {
    try { const j = (await (await fetch(`${this.base}/system_stats`, { signal: AbortSignal.timeout(4000) })).json()) as { system?: { ram_free?: number } }; return j.system?.ram_free ? j.system.ram_free / 2 ** 30 : null } catch { return null }
  }

  /** Drop resident models and the node cache. ComfyUI acts on the flags at once when idle; the short
   *  wait keeps the next submit from racing ahead of it. */
  async free(): Promise<void> {
    await fetch(`${this.base}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.timeout(20_000) }).catch(() => undefined)
    // The flags take effect once the running prompt (a warm-up, say) has finished: wait for that.
    for (let i = 0; i < 45; i++) {
      const q = await fetch(`${this.base}/queue`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json() as Promise<{ queue_running: unknown[] }>).catch(() => null)
      if (!q || q.queue_running.length === 0) break
      await new Promise((r) => setTimeout(r, 2000))
    }
    // ComfyUI drops the weights when its garbage collector runs, up to ~10 s later. Loading a 21 GB
    // Gemma before the 20 GB of Z-Image is really gone put the Studio 15 GB into swap and got ComfyUI
    // killed (2026-09-22 14:54). So wait until free RAM on the host has actually come back and settled.
    let last = -1, steady = 0
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const free = await this.freeRamGb()
      if (free === null) break
      if (free >= FREE_AFTER_FREE_GB) break
      if (Math.abs(free - last) < 0.5) { if (++steady >= 3) break } else steady = 0
      last = free
    }
  }


  async cancel(promptId: string): Promise<void> {
    await fetch(`${this.base}/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }) }).catch(() => undefined)
    // If it is the running one, /queue delete is a no-op; interrupt covers that case.
    const q = await fetch(`${this.base}/queue`).then((r) => r.json() as Promise<{ queue_running: unknown[][] }>).catch(() => null)
    if (q?.queue_running.some((item) => item[1] === promptId)) await fetch(`${this.base}/interrupt`, { method: 'POST' }).catch(() => undefined)
  }

  /** true = running or pending, false = not in the queue, null = could not ask. */
  async queued(promptId: string): Promise<boolean | null> {
    try {
      const q = await fetch(`${this.base}/queue`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json() as Promise<{ queue_running: unknown[][]; queue_pending: unknown[][] }>)
      return [...q.queue_running, ...q.queue_pending].some((item) => item[1] === promptId)
    } catch { return null }
  }

  async outputs(promptId: string): Promise<{ outputs: Output[]; status?: string; error?: string }> {
    const res = await fetch(`${this.base}/history/${promptId}`, { signal: AbortSignal.timeout(10_000) })
    const j = (await res.json()) as Record<string, { status?: { status_str?: string; messages?: Array<[string, Record<string, unknown>]> }; outputs?: Record<string, Record<string, Array<{ filename: string; subfolder: string; type: 'output' | 'temp' }>>> }>
    const h = j[promptId]
    if (!h) return { outputs: [] }
    const outs: Output[] = []
    for (const node of Object.values(h.outputs ?? {})) {
      for (const key of ['images', 'audio', 'gifs', 'video']) {
        for (const f of node[key] ?? []) if (f.type !== 'temp') outs.push({ filename: f.filename, subfolder: f.subfolder ?? '', type: f.type, viewUrl: this.viewUrl(f.filename, f.subfolder ?? '', f.type), url: liteOutUrl(f.subfolder ?? '', f.filename, f.type) })
      }
    }
    const err = h.status?.messages?.find((m) => m[0] === 'execution_error')?.[1]
    return { outputs: outs, status: h.status?.status_str, error: err ? `${String(err['node_type'] ?? '')}: ${String(err['exception_message'] ?? '')}`.trim() : undefined }
  }

  viewUrl(filename: string, subfolder: string, type: string): string {
    const q = new URLSearchParams({ filename, subfolder, type })
    return `${this.base}/view?${q.toString()}`
  }

  /** Subscribe to live events; reconnects lazily on the next call if the socket dropped. */
  on(fn: (e: ComfyEvent) => void): () => void {
    this.listeners.add(fn); this.ensureWs()
    return () => { this.listeners.delete(fn) }
  }

  private ensureWs(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    try {
      const url = `${this.base.replace(/^http/, 'ws')}/ws?clientId=${this.clientId}`
      const ws = new WebSocket(url)
      ws.onmessage = (m): void => {
        if (typeof m.data !== 'string') return // binary preview frames: ignore
        try { const e = JSON.parse(m.data) as ComfyEvent; for (const fn of this.listeners) fn(e) } catch { /* not JSON */ }
      }
      ws.onclose = (): void => { this.ws = null; if (this.listeners.size) setTimeout(() => this.ensureWs(), 2000) }
      ws.onerror = (): void => { /* onclose follows */ }
      this.ws = ws
    } catch { this.ws = null }
  }
  private closeWs(): void { try { this.ws?.close() } catch { /* ignore */ } this.ws = null }
}
