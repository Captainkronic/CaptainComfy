import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { comfyViewUrl, isLoopback, LOCAL, parseLiteOut, STUDIO } from '@shared/net'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { IpcApi, IpcEvents } from '@shared/ipc'
import type { Health } from '@shared/types'
import { ComfyClient } from './comfy'
import { enrich, omlxUp } from './enrich'
import { JobManager } from './jobs'
import { SettingsStore } from './settings'

// Results are read by the renderer through this scheme instead of ComfyUI's /view URL: a file://
// page loading http:// images fails silently in Chromium, and files must not be exposed as file://.
protocol.registerSchemesAsPrivileged([{ scheme: 'lite-out', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } }])

let win: BrowserWindow | null = null
function emit<K extends keyof IpcEvents>(channel: K, payload: IpcEvents[K]): void { win?.webContents.send(channel, payload) }

const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
const comfy = new ComfyClient(settings.get().comfyHost)
const jobs = new JobManager({ comfy, omlx: () => ({ host: settings.get().omlxHost, model: settings.get().omlxModel, release: settings.get().releaseGemma }), emit: (j) => emit('event:job', j), file: join(app.getPath('userData'), 'jobs.json') })

async function health(): Promise<Health> {
  const s = settings.get()
  const [c, o] = await Promise.all([comfy.up(), omlxUp(s.omlxHost, s.omlxModel)])
  return { comfy: { up: c.ok, host: s.comfyHost, detail: c.detail }, omlx: { up: o.ok, host: s.omlxHost, model: s.omlxModel, detail: o.detail } }
}

function handle<K extends keyof IpcApi>(channel: K, fn: (...args: Parameters<IpcApi[K]>) => ReturnType<IpcApi[K]>): void {
  ipcMain.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
}
handle('settings:get', async () => settings.get())
handle('settings:update', async (patch) => { const s = settings.update(patch); comfy.setHost(s.comfyHost); return s })
handle('health:get', health)
handle('settings:presets', async () => ({ local: LOCAL, studio: STUDIO }))
handle('comfy:start', async () => { const s = settings.get(); if (!isLoopback(s.comfyHost)) return { ok: false, detail: `ComfyUI at ${s.comfyHost} is remote; start it on that machine.` }; return comfy.start({ dir: s.comfyDir, yaml: s.comfyModelPathsYaml, input: s.comfyInputDir, output: s.comfyOutputDir, flags: s.comfyFlags }) })
handle('jobs:list', async () => jobs.list())
handle('jobs:submitImage', async (p) => jobs.submit('image', p))
handle('jobs:submitMusic', async (p) => jobs.submit('music', p))
handle('jobs:cancel', async (id) => jobs.cancel(id))
handle('jobs:clearFinished', async () => jobs.clearFinished())
handle('enrich:preview', async (mode, text) => { const s = settings.get(); return enrich(s.omlxHost, s.omlxModel, mode, text) })
const outputPath = (o: { subfolder: string; filename: string }): string => join(settings.get().comfyOutputDir, o.subfolder, o.filename)
handle('shell:reveal', async (o) => shell.showItemInFolder(outputPath(o)))
handle('shell:open', async (o) => { await shell.openPath(outputPath(o)) })

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1240, height: 860, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#06070a',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 12 },
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.mjs'), sandbox: false, contextIsolation: true, nodeIntegration: false }
  })
  w.on('ready-to-show', () => w.show())
  // Renderer problems (CSP refusals, failed image loads, React errors) must reach the main log.
  w.webContents.on('console-message', (ev) => { const e = ev as unknown as { level: string | number; message: string }; if (String(e.level) !== 'info' && String(e.level) !== '0' && String(e.level) !== '1') console.log(`[renderer:${e.level}] ${e.message}`) })
  w.webContents.on('did-fail-load', (_e, code, desc, url) => console.log(`[renderer] failed to load ${url}: ${code} ${desc}`))
  w.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) void w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void w.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return w
}

async function autoDetect(): Promise<void> {
  // First run on a machine with no local ComfyUI: if the Studio answers, use it and say so.
  const s = settings.get()
  if (!isLoopback(s.comfyHost)) return
  if ((await comfy.up()).ok) return
  const probe = new ComfyClient(STUDIO.comfyHost)
  if ((await probe.up()).ok) { settings.update({ comfyHost: STUDIO.comfyHost, omlxHost: STUDIO.omlxHost }); comfy.setHost(STUDIO.comfyHost); console.log('[lite] no local ComfyUI; switched to the Studio over Tailscale') }
}

void app.whenReady().then(async () => {
  await autoDetect()
  protocol.handle('lite-out', async (req) => {
    const o = parseLiteOut(req.url)
    if (!o) return new Response('bad url', { status: 400 })
    const s = settings.get()
    // Local fast path: the file is on this disk (running on the Studio).
    const root = resolve(s.comfyOutputDir)
    const file = resolve(root, o.subfolder, o.filename)
    if (file.startsWith(root + sep) && existsSync(file)) return net.fetch(pathToFileURL(file).toString())
    // Remote path: pull it from ComfyUI over the tailnet. Node's fetch sends no Sec-Fetch-Site
    // header, so ComfyUI's cross-site 403 does not apply here the way it does to the renderer.
    try {
      const r = await fetch(comfyViewUrl(s.comfyHost, o.subfolder, o.filename, o.type), { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) return new Response(`ComfyUI ${r.status}`, { status: r.status })
      return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } })
    } catch (err) { return new Response(String(err), { status: 502 }) }
  })
  win = createWindow()
  if (process.env['LITE_PROBE']) setTimeout(() => { void win?.webContents.executeJavaScript("(() => { const imgs=[...document.querySelectorAll('.grid img')]; return JSON.stringify({ cards: document.querySelectorAll('.card').length, grids: document.querySelectorAll('.grid').length, imgs: imgs.map(i => ({ src: i.src.slice(0, 80), complete: i.complete, w: i.naturalWidth, h: i.naturalHeight, box: i.getBoundingClientRect().width + 'x' + i.getBoundingClientRect().height })) }) })()").then((r) => console.log('[probe] ' + String(r))).catch((e) => console.log('[probe] failed ' + String(e))) }, 6000)
  setInterval(() => { void health().then((h) => emit('event:health', h)) }, 10_000)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
