import { BRIEFS, cleanLLMText, lyricsAreFinal, type EnrichMode } from '@shared/enrich'

export interface EnrichResult { text: string; used: boolean; detail: string }

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
export async function enrich(host: string, model: string, mode: EnrichMode, text: string, maxTokens = 220, systemOverride?: string): Promise<EnrichResult> {
  const original = text.trim()
  if (!original) return { text: original, used: false, detail: 'empty' }
  if (mode === 'music_lyrics' && lyricsAreFinal(original)) return { text: original, used: false, detail: 'lyrics already structured; passed through' }
  try {
    const res = await fetch(`${host.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.7, messages: [{ role: 'system', content: systemOverride ?? BRIEFS[mode] }, { role: 'user', content: original }] })
    })
    if (!res.ok) return { text: original, used: false, detail: `oMLX HTTP ${res.status}` }
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
    return { ok: res.ok, detail: res.ok ? 'unloaded' : `HTTP ${res.status}` }
  } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
}

/** Warm the model before the first enrichment call (the chat call would load it anyway; this just makes the status honest). */
export async function loadModel(host: string, model: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${adminBase(host)}/admin/api/models/${encodeURIComponent(model)}/load`, { method: 'POST', signal: AbortSignal.timeout(120_000) })
    return { ok: res.ok, detail: res.ok ? 'loaded' : `HTTP ${res.status}` }
  } catch (err) { return { ok: false, detail: err instanceof Error ? err.message : String(err) } }
}
