/** The same task briefs used by the ComfyUI PromptEnrichLLM node, kept in one place. */
export type EnrichMode = 'image' | 'image_edit' | 'music_style' | 'music_lyrics' | 'card_scene'

export const BRIEFS: Record<EnrichMode, string> = {
  image: 'You rewrite a short idea into ONE rich text-to-image prompt. Keep the user\'s subject and intent exactly. Add concrete setting, lighting, lens/framing, mood and visual style. One paragraph, under 80 words, present tense, no lists, no quotes, no preamble, no explanations.',
  image_edit: "An image already exists and will be edited by an instruction-following image model. Rewrite the user's short request into ONE precise edit instruction: name exactly what changes and keep everything else implicitly unchanged. Do not describe the whole scene or restate parts the user didn't ask to change. Imperative mood (e.g. 'Change...', 'Remove...', 'Add...'), under 40 words, no lists, no quotes, no preamble.",
  music_style: 'Turn the user\'s idea into a comma-separated list of music tags for a text-to-music model: genre, subgenre, key instruments, vocal type (or instrumental), mood, era/production feel, and tempo as \'NNN bpm\'. Under 40 words. Output ONLY the comma-separated tags, no sentences, no quotes, no preamble.',
  music_lyrics: 'Write short original song lyrics on the given theme using [Verse], [Chorus] and optionally [Bridge] tags, under 120 words, singable, no title, no quotes, no preamble.',
  // The composition rules of the Card-Generator guide (AGENTS.md section 6), for the scene paragraph only.
  card_scene: "You write the SCENE paragraph of an image prompt for a greeting card. The card's lettering is handled elsewhere: write no words, titles, signs, labels or text of any kind, and say nothing about letter styles. Describe only the picture in the middle of the card, as if captioning a finished illustration: five or six plain sentences, 100 to 130 words in total, present tense. Turn the recipient's interests into concrete drawable subjects; when there are two interests, one is the focal subject and the other a supporting element. Sentence one names the single focal subject in the middle of the card with the exact words 'the biggest thing in the picture', its colour and what it is doing. Then at most three supporting elements, each in its own sentence with its position (far left, right, below, behind), its colour and its size compared with the focal subject, listed from left to right. Name each subject's defining parts (an airplane: two wings, a tail fin and a spinning propeller on its nose; a steam train: a tall smokestack, round wheels on the rails; an excavator: an arm that ends in a toothed bucket). Every vehicle, animal or character in the scene, the supporting ones included, has 'a friendly cartoon face, two big round eyes and a wide curved smile'. For a young child use few things and simple shapes. Finish with one sentence of ground and background in large areas of flat colour, leaving the top third of the card as plain open sky or paper. Never mention signs, labels, number plates, books, gift tags, banners, balloons with writing, or any object that carries text; a present is 'a solid-colour gift box with plain unmarked sides'. Never describe the recipient or any real person. Never use the words beautiful, stunning, detailed, masterpiece, 4k, digital art, 3D or render. No lists, no quotes, no preamble, no explanations."
}
/** Reply budgets: the scene paragraph needs more room than a tag list. */
export const MAX_TOKENS: Record<EnrichMode, number> = { image: 220, image_edit: 220, music_style: 220, music_lyrics: 220, card_scene: 360 }

const TAGGED = /\[(verse|chorus|bridge|intro|outro|instrumental|inst)[^\]]*\]/i

/** Lyrics that are already structured (or explicitly instrumental) must never be rewritten. */
export function lyricsAreFinal(text: string): boolean {
  return TAGGED.test(text)
}

/** Tags for ACE-Step must agree with the bpm parameter: strip any tempo Gemma or the user wrote, append ours. */
export function normalizeStyleTags(style: string, bpm: number): string {
  const b = Math.round(bpm)
  const cleaned = style
    .replace(/\b\d{2,3}\s*bpm\b/gi, '')
    .split(',').map((s) => s.trim()).filter(Boolean).join(', ')
  return cleaned ? `${cleaned}, ${b} bpm` : `${b} bpm`
}

/** The music-style brief with the exact tempo baked in, so the LLM never suggests its own. */
export function musicStyleBrief(bpm: number): string {
  const b = Math.round(bpm)
  return BRIEFS.music_style.replace("and tempo as 'NNN bpm'", `and the tempo, which is exactly ${b} bpm (write '${b} bpm' and never any other tempo)`)
}

export function cleanLLMText(t: string): string {
  return t.trim().replace(/^(here('s| is)[^:\n]*:\s*)/i, '').trim().replace(/^["']|["']$/g, '').trim()
}
