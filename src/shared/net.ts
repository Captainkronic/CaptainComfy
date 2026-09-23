/** Host helpers shared by main and renderer. */
export const STUDIO = {
  comfyHost: 'http://adams-mac-studio.tailc7bb1e.ts.net:8188',
  omlxHost: 'http://adams-mac-studio.tailc7bb1e.ts.net:8000/v1'
}
export const LOCAL = { comfyHost: 'http://127.0.0.1:8188', omlxHost: 'http://127.0.0.1:8000/v1' }

export function isLoopback(host: string): boolean {
  try { const h = new URL(host).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]' } catch { return false }
}

/** lite-out://out/<subfolder>/<filename>?t=<type>  (subfolder may be empty) */
export function liteOutUrl(subfolder: string, filename: string, type: string): string {
  const path = [subfolder, filename].filter(Boolean).map(encodeURIComponent).join('/')
  return `lite-out://out/${path}?t=${encodeURIComponent(type)}`
}
export function parseLiteOut(url: string): { subfolder: string; filename: string; type: string } | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'lite-out:') return null
    const parts = u.pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent).filter(Boolean)
    if (parts.length === 0) return null
    const filename = parts.pop() as string
    return { subfolder: parts.join('/'), filename, type: u.searchParams.get('t') || 'output' }
  } catch { return null }
}
export function comfyViewUrl(comfyHost: string, subfolder: string, filename: string, type: string): string {
  const q = new URLSearchParams({ filename, subfolder, type })
  return `${comfyHost.replace(/\/+$/, '')}/view?${q.toString()}`
}

/** `subfolder/filename` when it is an ordinary ComfyUI result name, else null. Every segment must be
 *  plain (letters, digits, dot, dash, underscore, space), so the joined name cannot climb out of the
 *  output folder, name a hidden file or carry anything a remote shell would read as syntax. Delete
 *  resolves against this and nothing else: it is the difference between removing one PNG and removing
 *  whatever a malformed name points at. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/
export function safeResultName(o: { subfolder: string; filename: string }): string | null {
  const segments = [...o.subfolder.split('/').filter(Boolean), o.filename]
  if (segments.some((s) => !SAFE_SEGMENT.test(s) || s === '..')) return null
  return segments.join('/')
}
