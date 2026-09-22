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

/** Never throws: on any failure the original text is returned with used=false and a reason. */
export async function enrich(host: string, model: string, mode: EnrichMode, text: string, maxTokens = MAX_TOKENS[mode], systemOverride?: string): Promise<EnrichResult> {
  const original = text.trim()
  if (!original) return { text: original, used: false, detail: 'empty' }
  if (mode === 'music_lyrics' && lyricsAreFinal(original)) return { text: original, used: false, detail: 'lyrics already structured; passed through' }
  try {
    const res = await fetch(`${host.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.7, messages: [{ role: 'system', content: systemOverride ?? BRIEFS[mode] }, { role: 'user', content: original }] })
    })
    if (!res.ok) return { text: original, used: false, detail: `oMLX HTTP ${res.status}` }
    resident = true
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_time?: number } }
    const out = cleanLLMText(j.choices?.[0]?.message?.content ?? '')
    if (!out) return { text: original, used: false, detail: 'empty reply' }
    return { text: out, used: true, detail: `Gemma ${mode === 'card_scene' ? 'drafted it' : 'rewrote it'}${j.usage?.total_time ? ` in ${j.usage.total_time.toFixed(1)} s` : ''}` }
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
