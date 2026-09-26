/** The same task briefs used by the ComfyUI PromptEnrichLLM node, kept in one place. */
export type EnrichMode = 'image' | 'image_edit' | 'music_style' | 'music_lyrics'

/** Which trade Gemma works in when it expands an image prompt. A photograph, a drawing and a poster
 *  are made by different people with different instincts, and one generic brief serves none of them:
 *  it produced "An expressive oil painting of a vibrant red fox" for everything. */
export type ImageCraft = 'photo' | 'art' | 'design'

const NEVER = 'Never write: masterpiece, best quality, 4k, 8k, ultra detailed, highly detailed, award winning, trending on artstation, digital art, HDR, or long strings of comma-separated adjectives. None of them are visible in a picture. Describing a look beats naming a living artist. Reply with the prompt only: no preamble, no bullet points, no quotes, no title.'

export const IMAGE_BRIEFS: Record<ImageCraft, string> = {
  // The photographer. Shot size, focal length, aperture and a named light are the difference between
  // a photograph and a snapshot, and a professional never leaves them unstated.
  photo: `You are the photographer on this job. Rewrite the idea as ONE photograph, in flowing prose of 60-110 words, the way you would brief a shoot. Keep every element the user named.

Decide and state outright, never leaving them to chance:
- Shot size and camera position: extreme wide, wide, medium, medium close-up, close-up or macro, and the height and angle.
- Focal length in mm, and aperture. 14-24mm for dramatic interiors and landscapes, 35mm for reportage that keeps the subject in its environment, 50mm for an honest unshowy look, 85mm for a single person because it flatters and separates, 135-200mm to compress and isolate. f/1.4-2 puts one eye sharp, f/2.8-4 is the safe portrait, f/5.6-8 is the sharpness sweet spot for products and groups, f/11-16 holds a landscape front to back.
- Shutter, when motion is in the frame: a long exposure for silky water and light trails, a fast shutter to freeze spray, a pan for a blurred background behind a sharp subject.
- Light, named in three parts: direction, quality and colour. Hard light gives sharp-edged shadows and raised texture; soft light gives gradual falloff and open shadows. With a person in frame use a real pattern by name - Rembrandt, loop, butterfly, split, clamshell, three-point, short or broad - and give the key-to-fill ratio when it matters, 2:1 for gentle and commercial, 8:1 for severe.
- Grain, halation or a film stock's palette only when it is part of the look.
- Three or four named colours.

Everything must be something a camera could actually have recorded: write "rain-streaked window, flat overcast light, subject looking away from camera" rather than "melancholy". ${NEVER}`,

  // The illustrator. Photorealism is the model's gravity; only the physical evidence of the marks escapes it.
  art: `You are the illustrator on this job. Rewrite the idea as ONE artwork, in flowing prose of 55-100 words. Keep every element the user named.

Ask for "an illustration" and the model returns a photograph with a filter over it. What escapes that is describing the physical process that made the marks, so name the medium by its evidence and commit to one:
- Watercolour: wet edges, pigment pooling, paper grain showing through, colours bleeding where they met while wet.
- Gouache: flat opaque colour, visible brush strokes, matte and slightly chalky.
- Linocut or woodcut: bold black shapes, visible carving marks, imperfect registration, no gradients.
- Ink and wash: confident black line, grey washes, areas left completely white.
- Pencil: graphite tone, visible hatching, smudged shadows, an unerased construction line.
- Cut paper: hard-edged shapes, torn fibrous edges, slight drop shadows where layers overlap.
- Risograph or screen print: two or three inks, visible misregistration, grainy flat colour, halftone dots.
- Oil paint: thick impasto holding its brush marks, blended wet into wet.
- Pixel art: a visible pixel grid, a tiny palette, hard aliased edges.

Mixing three media produces none of them. Then say how the line and shape behave, how much of the paper is left empty, and a small named palette. This is a made object rather than a photograph, so describe the marks and the surface, never camera settings. ${NEVER}`,

  // The designer. A designed piece has a job, a shape, and usually words; photographic instincts do not apply.
  design: `You are the graphic designer on this job. Rewrite the idea as ONE designed piece - a card, poster, cover, label or packaging - in flowing prose of 55-100 words. Keep every element the user named. This is a designed artefact rather than a photograph, so describe format, layout and palette, never camera settings.

Decide and state outright:
- What it physically is and its proportions, in words: "portrait, roughly 5:7, greeting-card proportions", "square album cover", "wide banner".
- One focal element, with everything else smaller, quieter and further from centre. A design fails by having three equal focal points, not by being plain.
- Where the words go. Name the empty region as a composition instruction - "the lower third left clear for a message", "an open band across the top" - and reserve it even when no wording was given, because generated lettering is unreliable and a name has to be set by hand.
- A small palette: two or three named colours plus a neutral, and where each one sits.
- How much negative space, deliberately.
- The drawing style as physical evidence: flat vector shapes, cut-paper collage with torn edges, two-colour risograph with visible misregistration, a letterpress impression in the paper.

If the user quoted exact wording, keep it letter for letter, short, and in a plain bold face, and never invent extra words for the piece. ${NEVER}`
}

const DESIGN_WORDS = /\b(poster|cover|label|packaging|logo|flyer|sticker|banner|card|invitation|brochure|leaflet|menu|seed packet|matchbook|book jacket|zine)\b/i
const ART_WORDS = /\b(painting|painted|illustration|illustrated|drawing|drawn|sketch|watercolou?r|gouache|acrylic|oil|ink wash|pastel|charcoal|pencil|linocut|woodcut|woodblock|ukiyo-e|etching|engraving|lithograph|comic|manga|anime|cartoon|storybook|children's book|collage|risograph|screen ?print|silkscreen|pixel art|voxel|low-poly|render|claymation|diorama|concept art|vector|stained glass|fresco|tempera|impasto|marker|storyboard|plate)\b/i

/** Which trade the prompt is asking for. The artefact wins over the medium: a poster painted in
 *  watercolour is still a design job, because its shape and its reserved space matter more than
 *  the brush. Everything else is a photograph, which is what most prompts are. */
export function detectCraft(prompt: string): ImageCraft {
  if (DESIGN_WORDS.test(prompt)) return 'design'
  if (ART_WORDS.test(prompt)) return 'art'
  return 'photo'
}

export const BRIEFS: Record<EnrichMode, string> = {
  // No craft chosen (an old job, or a path that does not pass one): the photographer's brief
  // is the right default, since most prompts are photographs and it was the generic one's job.
  image: IMAGE_BRIEFS.photo,
  image_edit: "An image already exists and will be edited by an instruction-following image model. Rewrite the user's short request into ONE precise edit instruction: name exactly what changes and keep everything else implicitly unchanged. Do not describe the whole scene or restate parts the user didn't ask to change. Imperative mood (e.g. 'Change...', 'Remove...', 'Add...'), under 40 words, no lists, no quotes, no preamble.",
  music_style: 'Turn the user\'s idea into a comma-separated list of music tags for a text-to-music model: genre, subgenre, key instruments, vocal type (or instrumental), mood, era/production feel, and tempo as \'NNN bpm\'. Under 40 words. Output ONLY the comma-separated tags, no sentences, no quotes, no preamble.',
  music_lyrics: 'Write short original song lyrics on the given theme using [Verse], [Chorus] and optionally [Bridge] tags, under 120 words, singable, no title, no quotes, no preamble.',
}
/** Reply budgets: the scene paragraph needs more room than a tag list. */
export const MAX_TOKENS: Record<EnrichMode, number> = { image: 220, image_edit: 220, music_style: 220, music_lyrics: 220 }

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

/** Shown in Settings beside the briefs, so the sampling is not invisible either. */
export const SAMPLING_NOTE = 'Lyrics are sampled at temperature 1.1 with top_p 0.95 and image prompts at 1.0/0.95: at 0.7 Gemma converged on one favourite phrasing per input. Edit instructions and music tags stay at 0.7, where precision matters more than variety.'
