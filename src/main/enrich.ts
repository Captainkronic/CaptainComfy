import { BRIEFS, cleanLLMText, lyricsAreFinal, MAX_TOKENS, type EnrichMode } from '@shared/enrich'

export interface EnrichResult { text: string; used: boolean; detail: string }

/** Whether this app has left Gemma loaded in oMLX (a chat call loads it as a side effect). The job
 *  pump uses it to release the memory before a render even when that render itself needs no Gemma. */
let resident = false
export function gemmaResident(): boolean { return resident }

/** What oMLX actually holds: the model may have been loaded by another app instance or by hand, and a
 *  21 GB Gemma beside Z-Image gets ComfyUI killed by the memory guard. Falls back to the local flag. */
export async function gemmaLoaded(host: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${adminBase(host)}/admin/api/models`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return resident
    const j = (await res.json()) as { models?: Array<{ id: string; loaded?: boolean; is_loading?: boolean }> }
    const m = j.models?.find((x) => x.id === model)
    if (m) resident = Boolean(m.loaded || m.is_loading)
    return resident
  } catch { return resident }
}

export async function omlxUp(host: string, model: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${host.replace(/\/+$/, '')}/models`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    const j = (await res.json()) as { data?: Array<{ id: string }> }
    const has = j.data?.some((m) => m.id === model) ?? false
    return { ok: has, detail: has ? `oMLX serving ${model}` : `oMLX up but ${model} is not listed` }
  } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
}

/** How widely to sample, per mode. At 0.7 Gemma converges hard on a favourite phrasing for a given
 *  input: the same lyric theme opened "Sunlight dancing on the glass" in 6 runs out of 6, and the
 *  same image idea opened "An expressive oil painting of a vibrant red fox" in 4 out of 4. The whole
 *  texts always differed — it is the phrasing that repeats, not the output — so the creative modes
 *  get a wider sampler. Measured over 6 runs a theme, distinct openings went 3/6 -> 6/6 on one lyric
 *  theme and 1/6 -> 2/6 on a stickier one. Temperature alone did not do it; top_p is what helped.
 *  The two literal modes stay where they are: an edit instruction and a tag list want precision,
 *  not variety, and normalizeStyleTags has to be able to parse the style back. */
const SAMPLING: Record<EnrichMode, { temperature: number; top_p?: number }> = {
  image: { temperature: 1.0, top_p: 0.95 },
  image_edit: { temperature: 0.7 },
  music_style: { temperature: 0.7 },
  music_lyrics: { temperature: 1.1, top_p: 0.95 }
}

/** Never throws: on any failure the original text is returned with used=false and a reason. */
export async function enrich(host: string, model: string, mode: EnrichMode, text: string, maxTokens = MAX_TOKENS[mode], systemOverride?: string): Promise<EnrichResult> {
  const original = text.trim()
  if (!original) return { text: original, used: false, detail: 'empty' }
  if (mode === 'music_lyrics' && lyricsAreFinal(original)) return { text: original, used: false, detail: 'lyrics already structured; passed through' }
  try {
    const res = await fetch(`${host.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model, max_tokens: maxTokens, ...SAMPLING[mode], messages: [{ role: 'system', content: systemOverride ?? BRIEFS[mode] }, { role: 'user', content: original }] })
    })
    if (!res.ok) return { text: original, used: false, detail: `oMLX HTTP ${res.status}` }
    resident = true
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_time?: number } }
    const out = cleanLLMText(j.choices?.[0]?.message?.content ?? '')
    if (!out) return { text: original, used: false, detail: 'empty reply' }
    return { text: out, used: true, detail: `Gemma rewrote it${j.usage?.total_time ? ` in ${j.usage.total_time.toFixed(1)} s` : ''}` }
  } catch (err) { return { text: original, used: false, detail: `oMLX unreachable (${err instanceof Error ? err.message : String(err)}); original used` } }
}

function adminBase(host: string): string { return host.replace(/\/+$/, '').replace(/\/v1$/, '') }

/** Release the model's memory. Best effort: a failure here only costs RAM, never a generation. */
export async function unloadModel(host: string, model: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${adminBase(host)}/admin/api/models/${encodeURIComponent(model)}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) })
    if (res.ok) resident = false
    return { ok: res.ok, detail: res.ok ? 'unloaded' : `HTTP ${res.status}` }
  } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
}

/** Warm the model before the first enrichment call (the chat call would load it anyway; this just makes the status honest). */
export async function loadModel(host: string, model: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${adminBase(host)}/admin/api/models/${encodeURIComponent(model)}/load`, { method: 'POST', signal: AbortSignal.timeout(120_000) })
    if (res.ok) resident = true
    return { ok: res.ok, detail: res.ok ? 'loaded' : `HTTP ${res.status}` }
  } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
}
