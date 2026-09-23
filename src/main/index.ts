import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { comfyViewUrl, isLoopback, LOCAL, parseLiteOut, resultCacheName, safeResultName, STUDIO } from '@shared/net'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { IpcApi, IpcEvents } from '@shared/ipc'
import type { Health } from '@shared/types'
import { ComfyClient } from './comfy'
import { enrich, omlxUp } from './enrich'
import { JobManager } from './jobs'
import { ocrBinary, secondReaderStatus } from './ocr'
import { SettingsStore } from './settings'

// Results are read by the renderer through this scheme instead of ComfyUI's /view URL: a file://
// page loading http:// images fails silently in Chromium, and files must not be exposed as file://.
protocol.registerSchemesAsPrivileged([{ scheme: 'lite-out', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } }])

// A packaged app has no visible stdout, so everything main logs also goes to
// ~/Library/Logs/captainllama-lite/main.log (a few KB; overwritten per launch is not needed).
const LOG_DIR = join(app.getPath('home'), 'Library', 'Logs', 'captaincomfy')
const LOG_FILE = join(LOG_DIR, 'main.log')
try { mkdirSync(LOG_DIR, { recursive: true }) } catch { /* logging is best effort */ }
for (const level of ['log', 'warn', 'error'] as const) {
  const orig = console[level].bind(console)
  console[level] = (...args: unknown[]): void => {
    orig(...args)
    try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`) } catch { /* ignore */ }
  }
}
process.on('unhandledRejection', (r) => console.error('[lite] unhandled rejection: ' + (r instanceof Error ? r.stack ?? r.message : String(r))))
console.log(`[lite] starting ${app.getVersion()} on ${process.platform} ${process.arch}`)

let win: BrowserWindow | null = null
function emit<K extends keyof IpcEvents>(channel: K, payload: IpcEvents[K]): void { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

// One-time migration from the app's previous name.
for (const f of ['settings.json', 'jobs.json']) {
  const oldFile = join(app.getPath('appData'), 'captainllama-lite', f); const newFile = join(app.getPath('userData'), f)
  if (existsSync(oldFile) && !existsSync(newFile)) { try { mkdirSync(app.getPath('userData'), { recursive: true }); copyFileSync(oldFile, newFile); console.log(`[lite] migrated ${f} from captainllama-lite`) } catch { /* ignore */ } }
}
const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
const comfy = new ComfyClient(settings.get().comfyHost)
const jobs = new JobManager({ comfy, omlx: () => ({ host: settings.get().omlxHost, model: settings.get().omlxModel, release: settings.get().releaseGemma }), emit: (j) => emit('event:job', j), file: join(app.getPath('userData'), 'jobs.json'), outputDir: () => settings.get().comfyOutputDir, dataDir: app.getPath('userData'), comfyWhere: () => { const s = settings.get(); return { host: s.comfyHost, ssh: { user: s.sshUser, key: s.sshKey, host: new URL(s.comfyHost).hostname } } }, startComfy: () => startComfy(), autoRestart: () => settings.get().autoRestartComfy })

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
async function remoteStart(): Promise<{ ok: boolean; detail: string }> {
  const s = settings.get(); const host = new URL(s.comfyHost).hostname
  console.log(`[lite] remote start: ssh ${s.sshUser}@${host} ${s.remoteStartCommand}`)
  const out = await new Promise<{ ok: boolean; detail: string }>((res) => {
    execFile('/usr/bin/ssh', ['-i', s.sshKey.replace(/^~/, app.getPath('home')), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10',
      `${s.sshUser}@${host}`, s.remoteStartCommand], { timeout: 240_000 }, (err, stdout, stderr) => {
      const text = `${stdout}${stderr}`.trim().split('\n').pop() ?? ''
      res(err ? { ok: false, detail: text || err.message } : { ok: true, detail: text })
    })
  })
  if (out.ok) { for (let i = 0; i < 20; i++) { if ((await comfy.up()).ok) break; await new Promise((r) => setTimeout(r, 2000)) } }
  console.log(`[lite] remote start result: ${JSON.stringify(out)}`)
  return out
}
let starting: Promise<{ ok: boolean; detail: string }> | null = null
/** One start at a time: a waiting job and the health check may both ask within seconds. */
function startComfy(): Promise<{ ok: boolean; detail: string }> {
  if (starting) return starting
  const s = settings.get()
  starting = (isLoopback(s.comfyHost) ? comfy.start({ dir: s.comfyDir, yaml: s.comfyModelPathsYaml, input: s.comfyInputDir, output: s.comfyOutputDir, flags: s.comfyFlags }) : remoteStart()).finally(() => { starting = null })
  return starting
}
handle('comfy:start', async () => startComfy())
handle('comfy:warm', async (what, prompt) => jobs.warm(what, prompt))
handle('jobs:list', async () => jobs.list())
handle('jobs:submitImage', async (p) => jobs.submit('image', p))
handle('jobs:submitMusic', async (p) => jobs.submit('music', p))
handle('jobs:submitEdit', async (p) => jobs.submit('edit', p))
handle('jobs:submitCard', async (p) => jobs.submit('card', p))
handle('ocr:status', async () => {
  const st = settings.get(); const w = { local: isLoopback(st.comfyHost), ssh: { user: st.sshUser, key: st.sshKey, host: new URL(st.comfyHost).hostname } }
  const [a, b] = await Promise.all([ocrBinary(app.getPath('userData')), secondReaderStatus(w)])
  return { ok: a.binary !== null || b.ok, detail: `${a.detail}; ${b.detail}` }
})
handle('dialog:pickImage', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
  if (r.canceled || r.filePaths.length === 0) return null
  const path = r.filePaths[0]!; const ext = path.toLowerCase().split('.').pop()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
  const bytes = readFileSync(path)
  return { path, name: path.split('/').pop() ?? path, preview: bytes.length < 12_000_000 ? `data:${mime};base64,${bytes.toString('base64')}` : '' }
})
handle('jobs:cancel', async (id) => jobs.cancel(id))
handle('jobs:clearFinished', async () => jobs.clearFinished())
handle('enrich:preview', async (mode, text) => {
  const s = settings.get()
  if (jobs.busy()) return { text, used: false, detail: 'A job is running; Gemma would not fit beside it. Try again when it finishes.' }
  await jobs.loadGemma(s.omlxHost, s.omlxModel); return enrich(s.omlxHost, s.omlxModel, mode, text)
})
const outputPath = (o: { subfolder: string; filename: string }): string => join(settings.get().comfyOutputDir, o.subfolder, o.filename)
handle('shell:reveal', async (o) => shell.showItemInFolder(outputPath(o)))
handle('output:save', async (o) => {
  const r = await dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), o.filename), title: 'Save result' })
  if (r.canceled || !r.filePath) return null
  // Read from this disk only when ComfyUI is this Mac's own. This Mac has an output folder at the
  // same path as the Studio's, so when ComfyUI is remote a result named image_00069_.png here is a
  // different picture from the one being saved; fetch the real bytes over the tailnet instead.
  const local = outputPath(o)
  let bytes: Buffer
  if (isLoopback(settings.get().comfyHost) && existsSync(local)) bytes = readFileSync(local)
  else {
    const res = await fetch(comfyViewUrl(settings.get().comfyHost, o.subfolder, o.filename, o.type), { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`ComfyUI ${res.status} while fetching ${o.filename}`)
    bytes = Buffer.from(await res.arrayBuffer())
  }
  writeFileSync(r.filePath, bytes); shell.showItemInFolder(r.filePath)
  return { path: r.filePath }
})
// Deleting is the one irreversible thing this app does, so it is fenced three ways: the name must be
// an ordinary result name, the resolved path must sit inside ComfyUI's own output folder, and the user
// has to confirm in a modal dialog. Only then is the PNG unlinked — on this disk when ComfyUI is
// local, over the same ssh route the second OCR reader uses when it runs on the Studio.
function sshRun(cmd: string): Promise<{ ok: boolean; out: string }> {
  const s = settings.get(); const host = new URL(s.comfyHost).hostname
  return new Promise((res) => {
    execFile('/usr/bin/ssh', ['-i', s.sshKey.replace(/^~/, app.getPath('home')), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', `${s.sshUser}@${host}`, cmd], { timeout: 30_000 },
    (err, stdout, stderr) => res({ ok: !err, out: `${stdout}${stderr}`.trim() }))
  })
}
handle('output:delete', async (o) => {
  if (o.type !== 'output') return { deleted: false, detail: `${o.filename} is a ${o.type} file, not a saved result; ComfyUI clears those itself.` }
  const rel = safeResultName(o)
  if (!rel) return { deleted: false, detail: `Refusing to delete an unexpected path: ${o.subfolder}/${o.filename}` }
  const s = settings.get(); const root = resolve(s.comfyOutputDir); const file = resolve(root, rel)
  if (!file.startsWith(root + sep)) return { deleted: false, detail: `Refusing to delete anything outside ${root}` }
  const local = isLoopback(s.comfyHost)
  const where = local ? 'this Mac' : new URL(s.comfyHost).hostname
  const r = win
    ? await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Delete', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'Delete this image?', message: `Delete ${o.filename}?`,
      detail: `The file is removed from ComfyUI's output folder on ${where}, and from this job. This cannot be undone.`
    })
    : { response: 1 }
  if (r.response !== 0) return { deleted: false, detail: 'Cancelled' }
  // The delete itself, on the machine that actually made the file. This Mac has an output folder of
  // its own at the same path, so when ComfyUI is remote the local copy is deliberately left alone: a
  // result named image_00069_.png there is a different picture from image_00069_.png here.
  // A file that has already gone counts as done, so a second press cannot get stuck.
  if (local) { try { rmSync(file, { force: true }) } catch (err) { return { deleted: false, detail: `Could not delete ${file}: ${String(err)}` } } }
  else {
    const res = await sshRun(`rm -f -- '${file}'`)
    if (!res.ok) return { deleted: false, detail: `Could not delete it on ${where}: ${res.out.slice(0, 160) || 'ssh failed'}` }
  }
  try { rmSync(join(app.getPath('userData'), 'results', resultCacheName(o)), { force: true }) } catch { /* the cache copy is disposable */ }
  jobs.forgetOutput(o)
  console.log(`[lite] deleted ${o.subfolder}/${o.filename} on ${where}`)
  return { deleted: true, detail: `Deleted ${o.filename}` }
})
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
  console.log(`[lite] comfy=${settings.get().comfyHost} omlx=${settings.get().omlxHost}`)
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
    // Local fast path, only when ComfyUI is this Mac's own: this Mac has an input and an output
    // folder at the same paths as the Studio's, so when ComfyUI is remote a file named
    // image_00069_.png here is a different picture from the one asked for. Remote falls through to
    // the fetched-for-OCR cache and then to ComfyUI itself over the tailnet.
    if (isLoopback(s.comfyHost)) {
      const root = resolve(o.type === 'input' ? s.comfyInputDir : s.comfyOutputDir)
      const file = resolve(root, o.subfolder, o.filename)
      if (file.startsWith(root + sep) && existsSync(file)) return net.fetch(pathToFileURL(file).toString())
    }
    // A copy fetched for OCR serves the same bytes without a second trip over the tailnet.
    const cached = join(app.getPath('userData'), 'results', resultCacheName(o))
    if (o.type === 'output' && existsSync(cached)) return net.fetch(pathToFileURL(cached).toString())
    // Remote path: pull it from ComfyUI over the tailnet. Node's fetch sends no Sec-Fetch-Site
    // header, so ComfyUI's cross-site 403 does not apply here the way it does to the renderer.
    try {
      const r = await fetch(comfyViewUrl(s.comfyHost, o.subfolder, o.filename, o.type), { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) return new Response(`ComfyUI ${r.status}`, { status: r.status })
      return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } })
    } catch (err) { return new Response(String(err), { status: 502 }) }
  })
  win = createWindow()
  jobs.resume()
  // Headless test hook: CAPTAINCOMFY_TEST_IMAGE=<model> renders one Draft image with that model, waits, logs, quits.
  const testImage = process.env['CAPTAINCOMFY_TEST_IMAGE']
  if (testImage) setTimeout(() => { void (async () => {
    const { IMAGE_MODELS, imageModel } = await import('@shared/models'); const m = imageModel(testImage); const t = IMAGE_MODELS[m].presets.draft
    const job = jobs.submit('image', { prompt: 'a lighthouse on a rocky cliff at dusk, waves below', enrich: false, model: m, aspect: '3:2', megapixels: t.megapixels, count: 1, steps: t.steps, seed: 11, upscale: t.upscale })
    await new Promise((r) => setTimeout(r, 3000))
    while (jobs.list().some((j) => j.id === job.id && (j.status === 'queued' || j.status === 'enriching' || j.status === 'running'))) await new Promise((r) => setTimeout(r, 2000))
    const j = jobs.list().find((x) => x.id === job.id)!; console.log(`[test-image] ${m}: ${j.status} ${j.progressLabel} ${j.error ?? ''} outputs=${j.outputs.map((o) => o.filename).join(',')} ${Math.round(((j.finishedAt ?? 0) - (j.startedAt ?? 0)) / 1000)} s`); app.quit()
  })() }, 2500)
  // Headless test hook: CAPTAINCOMFY_TEST_EDIT_SOURCE=sub/file.png edits that ComfyUI result in place, waits, logs, quits.
  const testSource = process.env['CAPTAINCOMFY_TEST_EDIT_SOURCE']
  if (testSource) setTimeout(() => { void (async () => {
    const i = testSource.lastIndexOf('/'); const subfolder = i >= 0 ? testSource.slice(0, i) : ''; const filename = testSource.slice(i + 1)
    const job = jobs.submit('edit', { imagePath: '', imageName: filename, source: { subfolder, filename, type: 'output' }, instruction: process.env['CAPTAINCOMFY_TEST_INSTRUCTION'] ?? 'make it a snowy winter evening', enrich: false, megapixels: 1, steps: 4, seed: 7 })
    await new Promise((r) => setTimeout(r, 3000))
    while (jobs.list().some((j) => j.id === job.id && (j.status === 'queued' || j.status === 'enriching' || j.status === 'running'))) await new Promise((r) => setTimeout(r, 2000))
    const j = jobs.list().find((x) => x.id === job.id)!; console.log(`[test-edit] ${j.status} ${j.progressLabel} ${j.error ?? ''} outputs=${j.outputs.map((o) => o.filename).join(',')} before=${JSON.stringify(j.uploaded)}`); app.quit()
  })() }, 2500)
  // Headless test hook: CAPTAINCOMFY_TEST_EDIT=/path/to.png submits one edit job at startup.
  const testEdit = process.env['CAPTAINCOMFY_TEST_EDIT']
  if (testEdit) setTimeout(() => { jobs.submit('edit', { imagePath: testEdit, imageName: testEdit.split('/').pop() ?? testEdit, instruction: process.env['CAPTAINCOMFY_TEST_INSTRUCTION'] ?? 'make it a rainy evening', enrich: true, megapixels: 1, steps: 4, seed: 7 }) }, 3000)
  // Headless card test: CAPTAINCOMFY_TEST_CARD=/path/draft.json (a CardDraft; an empty scene is drafted by Gemma
  // first) runs the whole pipeline, writes the finished jobs of the series to CAPTAINCOMFY_TEST_OUT and quits.
  const testCard = process.env['CAPTAINCOMFY_TEST_CARD']
  if (testCard) setTimeout(() => { void (async () => {
    const { cardPrompt, draftToParams, sceneRequest } = await import('@shared/card')
    const draft = JSON.parse(readFileSync(testCard, 'utf8')) as import('@shared/card').CardDraft
    const s = settings.get()
    if (!draft.scene.trim()) { await jobs.loadGemma(s.omlxHost, s.omlxModel); const r = await enrich(s.omlxHost, s.omlxModel, 'card_scene', sceneRequest(draft)); console.log(`[test-card] scene: ${r.detail}\n${r.text}`); if (!r.used) { console.log('[test-card] no scene draft; aborting'); app.quit(); return } draft.scene = r.text }
    const params = draftToParams(draft, `test-${Date.now().toString(36)}`)
    console.log(`[test-card] prompt (${cardPrompt(draft).split(/\s+/).length} words):\n${params.prompt}`)
    jobs.submit('card', params)
    const live = (): boolean => jobs.list().some((j) => j.kind === 'card' && (j.params as import('@shared/card').CardParams).series === params.series && (j.status === 'queued' || j.status === 'enriching' || j.status === 'running'))
    await new Promise((r) => setTimeout(r, 3000))
    while (live()) await new Promise((r) => setTimeout(r, 2000))
    const done = jobs.list().filter((j) => j.kind === 'card' && (j.params as import('@shared/card').CardParams).series === params.series)
    const out = process.env['CAPTAINCOMFY_TEST_OUT']; if (out) writeFileSync(out, JSON.stringify(done, null, 2))
    console.log(`[test-card] finished: ${done.map((j) => `${j.status} ${j.progressLabel} ${j.outputs.map((o) => o.filename).join(',')}`).join(' | ')}`)
    app.quit()
  })() }, 2000)
  // Headless UI check: CAPTAINCOMFY_SHOT=/path.png [CAPTAINCOMFY_TAB=card] captures the window after 4 s and quits.
  const shot = process.env['CAPTAINCOMFY_SHOT']
  if (shot) setTimeout(() => { void (async () => { try { const tab = process.env['CAPTAINCOMFY_TAB']; if (tab) { await win?.webContents.executeJavaScript(`document.querySelector('.tab[data-tab="${tab}"]')?.click()`) }; const click = process.env['CAPTAINCOMFY_CLICK']; if (click) { await new Promise((r) => setTimeout(r, 600)); await win?.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(click)})?.click()`) } await new Promise((r) => setTimeout(r, Number(process.env['CAPTAINCOMFY_SHOT_DELAY'] ?? 800))); const img = await win?.webContents.capturePage(); if (img) writeFileSync(shot, img.toPNG()); console.log(`[shot] wrote ${shot}`) } catch (e) { console.log('[shot] failed ' + String(e)) } app.quit() })() }, 3500)
  if (process.env['LITE_PROBE']) setTimeout(() => { void win?.webContents.executeJavaScript("(() => { const imgs=[...document.querySelectorAll('.grid img')]; return JSON.stringify({ cards: document.querySelectorAll('.card').length, grids: document.querySelectorAll('.grid').length, imgs: imgs.map(i => ({ src: i.src.slice(0, 80), complete: i.complete, w: i.naturalWidth, h: i.naturalHeight, box: i.getBoundingClientRect().width + 'x' + i.getBoundingClientRect().height })) }) })()").then((r) => console.log('[probe] ' + String(r))).catch((e) => console.log('[probe] failed ' + String(e))) }, 6000)
  // Self-repair: ComfyUI down for two health checks in a row is started again (the Start button's path;
  // comfy-start removes duplicates and waits for memory to settle), at most once every three minutes.
  let comfyDownChecks = 0, lastAutoStart = 0
  setInterval(() => {
    void health().then((h) => {
      emit('event:health', h)
      comfyDownChecks = h.comfy.up ? 0 : comfyDownChecks + 1
      if (comfyDownChecks >= 2 && settings.get().autoRestartComfy && Date.now() - lastAutoStart > 3 * 60_000) {
        lastAutoStart = Date.now(); console.log('[lite] ComfyUI has been down for 20 s; starting it')
        void startComfy().then((r) => console.log(`[lite] self-repair start of ComfyUI: ${JSON.stringify(r)}`))
      }
    })
    jobs.watchdog()
  }, 10_000)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
