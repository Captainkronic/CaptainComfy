/**
 * Read the lettering on a rendered card with macOS Vision. The recogniser runs in a small Swift
 * program (the same one as Card-Generator/tools/ocr.swift), compiled once into the app's data
 * folder with the Xcode command line tools' swiftc. Without swiftc, cards still render; they just
 * carry no lettering verdict, and ocrStatus() says why.
 */
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OcrLine } from '@shared/card'

const SOURCE = `import Foundation
import ImageIO
import Vision

let arguments = CommandLine.arguments
guard arguments.count == 2 || (arguments.count == 3 && arguments[2] == "--correct") else {
    FileHandle.standardError.write("usage: ocr <image> [--correct]\\n".data(using: .utf8)!)
    exit(2)
}
let useCorrection = arguments.count == 3
let url = URL(fileURLWithPath: arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write("cannot read image: \\(arguments[1])\\n".data(using: .utf8)!)
    exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = useCorrection
request.recognitionLanguages = ["en-US"]
request.minimumTextHeight = 0.008
do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    FileHandle.standardError.write("text recognition failed: \\(error)\\n".data(using: .utf8)!)
    exit(1)
}
var lines: [[String: Any]] = []
for observation in request.results ?? [] {
    guard let best = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    lines.append(["text": best.string, "confidence": Double(best.confidence), "x": Double(box.minX),
                  "y": Double(1.0 - box.maxY), "w": Double(box.width), "h": Double(box.height)])
}
lines.sort { ($0["y"] as! Double) < ($1["y"] as! Double) }
let payload: [String: Any] = ["width": image.width, "height": image.height, "lines": lines]
let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
`
const HASH = createHash('sha256').update(SOURCE).digest('hex').slice(0, 16)

let status: { binary: string | null; detail: string } | null = null
let building: Promise<{ binary: string | null; detail: string }> | null = null

function run(cmd: string, args: string[], timeout = 120_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((res) => execFile(cmd, args, { timeout, maxBuffer: 8_000_000 }, (err, stdout, stderr) => res({ ok: !err, out: err ? `${stderr}${stdout}`.trim() || err.message : stdout })))
}

/** The compiled helper, building it on first use. Never throws; a missing toolchain is reported, not fatal. */
export function ocrBinary(dataDir: string): Promise<{ binary: string | null; detail: string }> {
  if (status) return Promise.resolve(status)
  if (building) return building
  building = (async () => {
    const dir = join(dataDir, 'bin'); const binary = join(dir, 'ocr'); const stamp = join(dir, 'ocr.hash')
    if (existsSync(binary) && existsSync(stamp) && readFileSync(stamp, 'utf8') === HASH) return (status = { binary, detail: 'Vision OCR ready' })
    try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'ocr.swift'), SOURCE) } catch (err) { return (status = { binary: null, detail: `cannot write ${dir}: ${String(err)}` }) }
    console.log('[ocr] compiling the Vision helper (first run, about 15 s)')
    const r = await run('/usr/bin/xcrun', ['swiftc', '-O', join(dir, 'ocr.swift'), '-o', binary], 300_000)
    if (!r.ok) { console.warn(`[ocr] swiftc failed: ${r.out.slice(0, 400)}`); return (status = { binary: null, detail: 'OCR unavailable: the Vision helper did not compile. Install the Xcode command line tools (xcode-select --install).' }) }
    writeFileSync(stamp, HASH)
    return (status = { binary, detail: 'Vision OCR ready' })
  })()
  return building
}

async function recognise(binary: string, image: string, corrected: boolean): Promise<OcrLine[]> {
  const r = await run(binary, corrected ? [image, '--correct'] : [image], 60_000)
  if (!r.ok) throw new Error(r.out.slice(0, 300))
  return (JSON.parse(r.out) as { lines: OcrLine[] }).lines
}

/** Both passes (literal, then language-corrected) for one image. */
export async function readLettering(dataDir: string, image: string): Promise<{ literal: OcrLine[]; corrected: OcrLine[] } | { error: string }> {
  const s = await ocrBinary(dataDir)
  if (!s.binary) return { error: s.detail }
  try { return { literal: await recognise(s.binary, image, false), corrected: await recognise(s.binary, image, true) } } catch (err) { return { error: `text recognition failed: ${err instanceof Error ? err.message : String(err)}` } }
}

/** The second reader: scripts/card-ocr.py (RapidOCR) installed as ~/.local/bin/card-ocr by deploy.sh on
 *  the machine that runs ComfyUI. Local when ComfyUI is local; otherwise over the same ssh path the
 *  "Start it on the Studio" button uses, reading the result straight from ComfyUI there (no download). */
export interface SecondReader { local: boolean; viewUrl: string; localPath?: string; ssh: { user: string; key: string; host: string } }
const CARD_OCR = '.local/bin/card-ocr'
let secondStatus: { host: string; ok: boolean; detail: string } | null = null

async function sshRun(r: SecondReader['ssh'], command: string, timeout: number): Promise<{ ok: boolean; out: string }> {
  return run('/usr/bin/ssh', ['-i', r.key.replace(/^~/, homedir()), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', `${r.user}@${r.host}`, command], timeout)
}

/** Whether card-ocr is installed where ComfyUI runs; cached per host. */
export async function secondReaderStatus(o: { local: boolean; ssh: SecondReader['ssh'] }): Promise<{ ok: boolean; detail: string }> {
  const host = o.local ? 'local' : o.ssh.host
  if (secondStatus && secondStatus.host === host) return secondStatus
  let ok: boolean, detail: string
  if (o.local) { ok = existsSync(join(homedir(), CARD_OCR)); detail = ok ? 'RapidOCR ready on this Mac' : 'RapidOCR not installed on this Mac (npm run deploy installs it)' }
  else { const r = await sshRun(o.ssh, `test -x "$HOME/${CARD_OCR}" && echo yes`, 20_000); ok = r.ok && r.out.trim() === 'yes'; detail = ok ? `RapidOCR ready on ${o.ssh.host}` : `RapidOCR not reachable on ${o.ssh.host} (${r.ok ? 'not installed: run scripts/card-ocr-install.sh there' : r.out.slice(0, 120)})` }
  secondStatus = { host, ok, detail }
  return secondStatus
}

/** RapidOCR's lines for one result, or null when the reader is unavailable (the verdict then says "Vision only"). */
export async function readSecond(o: SecondReader): Promise<OcrLine[] | null> {
  const s = await secondReaderStatus(o)
  if (!s.ok) return null
  // On the ComfyUI host, its own loopback address serves the result; the tailnet name need not resolve there.
  const url = o.local ? null : o.viewUrl.replace(/^(https?:\/\/)[^/]+/, (_, p: string) => `${p}127.0.0.1:${new URL(o.viewUrl).port || '8188'}`)
  const r = o.local ? await run(join(homedir(), CARD_OCR), [o.localPath ?? ''], 120_000) : await sshRun(o.ssh, `"$HOME/${CARD_OCR}" --url '${url}'`, 120_000)
  if (!r.ok) { console.warn(`[ocr] card-ocr failed: ${r.out.slice(0, 300)}`); return null }
  try { return (JSON.parse(r.out) as { lines: OcrLine[] }).lines } catch { console.warn(`[ocr] card-ocr returned no JSON: ${r.out.slice(0, 200)}`); return null }
}
