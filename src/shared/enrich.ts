/** The same task briefs used by the ComfyUI PromptEnrichLLM node, kept in one place. */
export type EnrichMode = 'image' | 'image_edit' | 'music_style' | 'music_lyrics'

export const BRIEFS: Record<EnrichMode, string> = {
  image: 'You rewrite a short idea into ONE rich text-to-image prompt. Keep the user\'s subject and intent exactly. Add concrete setting, lighting, lens/framing, mood and visual style. One paragraph, under 80 words, present tense, no lists, no quotes, no preamble, no explanations.',
  image_edit: "An image already exists and will be edited by an instruction-following image model. Rewrite the user's short request into ONE precise edit instruction: name exactly what changes and keep everything else implicitly unchanged. Do not describe the whole scene or restate parts the user didn't ask to change. Imperative mood (e.g. 'Change...', 'Remove...', 'Add...'), under 40 words, no lists, no quotes, no preamble.",
  music_style: 'Turn the user\'s idea into a comma-separated list of music tags for a text-to-music model: genre, subgenre, key instruments, vocal type (or instrumental), mood, era/production feel, and tempo as \'NNN bpm\'. Under 40 words. Output ONLY the comma-separated tags, no sentences, no quotes, no preamble.',
  music_lyrics: 'Write short original song lyrics on the given theme using [Verse], [Chorus] and optionally [Bridge] tags, under 120 words, singable, no title, no quotes, no preamble.'
}

const TAGGED = /\[(verse|chorus|bridge|intro|outro|instrumental|inst)[^\]]*\]/i

/** Lyrics that are already structured (or explicitly instrumental) must never be rewritten. */
export function lyricsAreFinal(text: string): boolean {
  return TAGGED.test(text)
}

export function cleanLLMText(t: string): string {
  return t.trim().replace(/^(here('s| is)[^:\n]*:\s*)/i, '').trim().replace(/^["']|["']$/g, '').trim()
}
