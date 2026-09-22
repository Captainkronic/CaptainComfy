/**
 * Greeting cards: the Card-Generator workflow (AGENTS.md in ~/Documents/Card-Generator) without
 * the agent. The prompt is assembled here, deterministically, in the order that guide prescribes:
 * format + medium, top lettering, scene, bottom lettering, lettering lock, palette + mood. The
 * lettering strings go in verbatim and are never touched by an LLM; Gemma only drafts the scene.
 * The OCR verdict logic is a port of read_text.py (macOS Vision, literal + corrected passes).
 */

// ---- shapes and quality: the sizes tested on 2026-09-21 (880x1232 for a standard portrait) ----

export type CardShape = 'portrait' | 'landscape' | 'square' | 'photo-portrait' | 'photo-landscape' | 'a-portrait' | 'a-landscape'
export const CARD_SHAPES: Record<CardShape, { w: number; h: number; label: string }> = {
  portrait: { w: 5, h: 7, label: '5x7 card, portrait' },
  landscape: { w: 7, h: 5, label: '7x5 card, landscape' },
  square: { w: 1, h: 1, label: 'Square' },
  'photo-portrait': { w: 2, h: 3, label: '4x6 photo print, portrait' },
  'photo-landscape': { w: 3, h: 2, label: '6x4 photo print, landscape' },
  'a-portrait': { w: 1000, h: 1414, label: 'A-series paper, portrait' },
  'a-landscape': { w: 1414, h: 1000, label: 'A-series paper, landscape' }
}
export type CardQuality = 'draft' | 'quick' | 'standard' | 'final'
/** Z-Image Turbo's recipe is 8 steps, which 'standard' and 'final' keep; the pixel budget is what
 *  separates those two. 'quick' and 'draft' trade steps for time (measured warm on the Studio at
 *  880x1232 on 2026-09-22: 8 steps 54 s, 6 steps 40 s, 4 steps 28 s). Lettering held in every test
 *  render at 6 and 4 steps (both OCR readers), but four samples do not make them the default. */
export const CARD_QUALITY: Record<CardQuality, { megapixels: number; steps: number; label: string }> = {
  draft: { megapixels: 1.1, steps: 4, label: 'draft: 4 steps, about half the time, composition checks' },
  quick: { megapixels: 1.1, steps: 6, label: 'quick: 6 steps, about a quarter faster' },
  standard: { megapixels: 1.1, steps: 8, label: 'standard: 8 steps, about 175 dpi at 5x7' },
  final: { megapixels: 1.6, steps: 8, label: 'final: 8 steps, about 215 dpi at 5x7, slower' }
}

/** Same rounding as generate_card.py: the short side first, so landscape mirrors portrait exactly. */
export function cardSize(shape: CardShape, quality: CardQuality): { width: number; height: number } {
  const s = CARD_SHAPES[shape]
  const [shortU, longU] = s.w <= s.h ? [s.w, s.h] : [s.h, s.w]
  const px = CARD_QUALITY[quality].megapixels * 1_000_000
  const short = Math.max(256, Math.round(Math.sqrt((px * shortU) / longU) / 16) * 16)
  const long = Math.max(256, Math.round((short * longU) / shortU / 16) * 16)
  return s.w <= s.h ? { width: short, height: long } : { width: long, height: short }
}

// ---- looks: each medium named by the marks it leaves (DESIGN.md part 2), with matching lettering ----

export type LookKey = 'flat' | 'gouache' | 'cutpaper' | 'riso' | 'screen' | 'watercolour' | 'linocut' | 'pencil'
export interface Look {
  label: string
  medium: string          // "drawn as ...: physical evidence"
  palette: string         // default palette, editable
  backing: string         // what the top third is: the calm surface behind the title
  top: string             // top lettering style and colour
  band: string            // the bottom banner or band
  bottom: string          // bottom lettering style and colour
  mood: string
}
export const LOOKS: Record<LookKey, Look> = {
  flat: { label: 'Flat vector picture-book (ages 1-4)', medium: 'drawn as a flat vector picture-book illustration: bold simple rounded shapes, thick clean dark outlines, flat bright colour throughout', palette: 'sky blue, sunshine yellow, bright red, leaf green and cream', backing: 'plain pale blue sky', top: 'Large chunky rounded hand-lettered text', band: 'a wide plain cream banner runs across the full width', bottom: 'neat rounded navy lettering', mood: 'Simple, bold and joyful' },
  gouache: { label: 'Picture-book gouache (ages 5-10)', medium: 'painted in gouache: flat opaque colour, visible soft brush strokes, matte and slightly chalky', palette: 'warm cream, deep teal, coral, mustard yellow and apple red', backing: 'plain warm cream paper', top: 'Large friendly rounded brush-lettered text in deep teal', band: 'a wide plain band of warm cream', bottom: 'small neat coral brush lettering', mood: 'Warm, lively and handmade in feeling' },
  cutpaper: { label: 'Cut paper collage', medium: 'made as a cut paper collage: hard-edged paper shapes, slight drop shadows where layers overlap, torn fibrous edges', palette: 'teal, tangerine, lemon yellow, soft pink and kraft brown', backing: 'plain kraft-brown paper', top: 'Chunky cut-paper lettering in lemon yellow with a thin dark shadow', band: 'a wide plain strip of cream paper', bottom: 'neat dark brown cut-paper lettering', mood: 'Playful and tactile' },
  riso: { label: 'Risograph print (teens and adults)', medium: 'printed as a risograph: two or three inks, visible misregistration, grainy flat colour', palette: 'fluorescent pink, teal blue and cream', backing: 'plain cream paper', top: 'Bold sans-serif lettering in teal blue ink', band: 'a plain cream band', bottom: 'small neat pink lettering', mood: 'Bold and graphic, with one strong idea' },
  screen: { label: 'Mid-century screen print (milestones)', medium: 'screen printed in the mid-century poster style: limited inks, bold geometric shapes, slight ink texture', palette: 'mustard yellow, burnt orange, charcoal and cream', backing: 'plain cream paper', top: 'Bold geometric sans-serif lettering in charcoal', band: 'a plain cream band', bottom: 'small neat burnt-orange lettering', mood: 'Restrained and confident, with lots of empty space' },
  watercolour: { label: 'Botanical watercolour (weddings, babies)', medium: 'painted in soft watercolour on cold-pressed paper: wet-edged washes, pigment pooling at the edges, paper grain showing through, plenty of untouched off-white paper', palette: 'sage green, blush pink, soft gold and warm off-white', backing: 'clean untouched off-white paper', top: 'Refined classic serif lettering in dark forest green', band: 'clean off-white paper', bottom: 'small widely spaced serif lettering in soft gold', mood: 'Calm, refined and elegant' },
  linocut: { label: 'Linocut', medium: 'cut and printed as a linocut: bold black shapes, visible carving marks, solid flat ink', palette: 'black ink, brick red and natural cream', backing: 'plain cream paper', top: 'Bold carved lettering in black ink', band: 'a plain cream band', bottom: 'small carved brick-red lettering', mood: 'Strong, simple and handmade' },
  pencil: { label: 'Coloured pencil (new baby, get well)', medium: 'drawn in coloured pencil: waxy layered strokes, paper tooth breaking the colour', palette: 'soft peach, mint, butter yellow, lilac and white', backing: 'clean white paper', top: 'Gentle rounded hand-drawn lettering in lilac', band: 'clean white paper', bottom: 'small neat mint-green lettering', mood: 'Soft, gentle and sweet' }
}
/** DESIGN.md part 1: the look an occasion usually wants, by the recipient's age. */
export function lookForAge(age: number | null): LookKey {
  if (age === null) return 'riso'
  if (age <= 4) return 'flat'
  if (age <= 10) return 'gouache'
  if (age >= 40 && age % 10 === 0) return 'screen'
  return 'riso'
}

// ---- the form (kept in the renderer) and the job (what main needs) ----

export interface CardDraft {
  recipient: string
  age: number | null       // null = adult. Shapes the whole image, never describes the person.
  interests: string
  lines: string            // top lettering, one line per line, exactly as it must appear
  caps: boolean            // render the top lines in capitals (the most reliable letterform)
  bottom: string           // sign-off, exactly as it must appear ("From, The Sutins")
  scene: string            // 5 or 6 sentences; drafted by Gemma or written by hand
  look: LookKey
  palette: string
  shape: CardShape
  quality: CardQuality
  count: number            // candidates per attempt, rendered as one batch (1..4)
  seed: number | null
  verify: boolean          // OCR every candidate and compare with the lettering
  attempts: number         // renders allowed when no candidate passes (1..6, the AGENTS.md budget)
  promptOverride: string   // non-empty: sent verbatim instead of the assembled prompt
}
export const LINE_MAX = 25         // characters per line the model renders reliably
export const PROMPT_WORDS_MAX = 320
export const CARD_ATTEMPTS_MAX = 6

export function defaultDraft(): CardDraft {
  return { recipient: '', age: null, interests: '', lines: 'HAPPY BIRTHDAY', caps: true, bottom: '', scene: '', look: 'flat', palette: LOOKS.flat.palette, shape: 'portrait', quality: 'standard', count: 1, seed: null, verify: true, attempts: 3, promptOverride: '' }
}

export interface CardParams {
  prompt: string          // the full prompt, exactly as sent
  expect: string[]        // every lettering string on the card, in order, verified by OCR
  title: string           // one-line summary for the job card
  shape: CardShape
  quality: CardQuality
  count: number
  seed: number | null
  verify: boolean
  attempts: number        // budget for this card, follow-ups included
  attempt: number         // 1-based
  series: string          // ties the attempts of one card together
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
function ageWords(age: number | null): string {
  if (age === null || age >= 20) return 'for an adult'
  if (age >= 13) return 'for a teenager'
  return `made for a ${ONES[age] ?? String(age)} year old`
}
const quoteList = (xs: string[]): string => xs.map((x) => `"${x}"`).reduce((acc, x, i) => (i === 0 ? x : i === xs.length - 1 ? `${acc} and ${x}` : `${acc}, ${x}`), '')

/** The top lines as they will appear on the card. */
export function topLines(d: CardDraft): string[] {
  return d.lines.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).map((l) => (d.caps ? l.toUpperCase() : l))
}
export function expectedLettering(d: CardDraft): string[] {
  const b = d.bottom.trim()
  return b ? [...topLines(d), b] : topLines(d)
}

/** The assembled prompt, in the AGENTS.md skeleton order. */
export function cardPrompt(d: CardDraft): string {
  const look = LOOKS[d.look]
  const shape = CARD_SHAPES[d.shape]
  const orientation = shape.w === shape.h ? 'square' : shape.w < shape.h ? 'portrait' : 'landscape'
  const lines = topLines(d)
  const bottom = d.bottom.trim()
  const kids = d.age !== null && d.age <= 10
  const p1 = `A ${kids ? "children's " : ''}greeting card front, ${orientation} format, ${look.medium}. The artwork fills the whole image right to the edges, with square corners.`
  let reads = ''
  lines.forEach((l, i) => {
    if (i === 0) reads += `reads "${l}" on one line`
    else if (i === lines.length - 1) reads += `, and directly below it "${l}" on its own line in bigger letters, written once`
    else reads += `, directly below it "${l}" on its own line`
  })
  const p2 = lines.length ? `The top third of the card is ${look.backing}, reserved for the title. ${look.top} ${reads}. ${d.look === 'flat' ? 'The lettering is sunshine yellow with a thick navy outline, evenly spaced, every letter crisp and easy to read.' : 'Every letter is crisp, evenly spaced and easy to read.'}` : ''
  const p3 = d.scene.trim()
  const p4 = bottom ? `At the bottom of the card, ${look.band}, and on it ${look.bottom} reads "${bottom}" on a single line, centred.` : ''
  const all = bottom ? [...lines, bottom] : lines
  const p5 = `${all.length ? `The only words anywhere on the card are ${quoteList(all)}. ` : ''}Palette: ${d.palette.trim().replace(/\.$/, '')}. ${look.mood}, ${ageWords(d.age)}.`
  return [p1, p2, p3, p4, p5].filter(Boolean).join('\n\n')
}
export function wordCount(text: string): number { return text.trim() ? text.trim().split(/\s+/).length : 0 }

/** What the scene drafter is told about this card. Plain facts; the brief in enrich.ts does the rest. */
export function sceneRequest(d: CardDraft): string {
  const who = d.recipient.trim() ? `${d.recipient.trim()}, ` : ''
  const age = d.age === null ? 'an adult' : d.age >= 13 ? 'a teenager' : `${ONES[d.age] ?? d.age} years old`
  const title = topLines(d)[0]
  return [`Recipient: ${who}${age}.`, d.interests.trim() ? `Loves: ${d.interests.trim()}.` : '', title ? `The card's title says: ${title}.` : '', `Medium: ${LOOKS[d.look].medium}.`, `Palette: ${d.palette.trim()}.`].filter(Boolean).join(' ')
}

export function draftToParams(d: CardDraft, series: string): CardParams {
  const prompt = d.promptOverride.trim() || cardPrompt(d)
  const who = d.recipient.trim() || topLines(d)[0] || 'card'
  return { prompt, expect: expectedLettering(d), title: d.age === null ? who : `${who}, ${d.age}`, shape: d.shape, quality: d.quality, count: Math.min(4, Math.max(1, Math.round(d.count))), seed: d.seed, verify: d.verify, attempts: Math.min(CARD_ATTEMPTS_MAX, Math.max(1, Math.round(d.attempts))), attempt: 1, series }
}

// ---- OCR verdicts: read_text.py's idea with two independent literal readers ----
//
// Reader A is macOS Vision with language correction off (what is really drawn), reader B is
// RapidOCR (PaddleOCR v4 on ONNX) on the ComfyUI host. Neither has a language model, so neither
// "corrects" a real misspelling; but each has its own blind spots (Vision reads a fat rounded D as O,
// RapidOCR drops spaces), so a phrase is confirmed when EITHER reads it letter for letter, and the
// comparison ignores spaces. Vision's corrected pass is a note only. Measured on 14 cards, 43 phrases
// (2026-09-22): Vision 40 exact, RapidOCR 43, together 43 with no false alarm.

export interface OcrLine { text: string; confidence: number; x: number; y: number; w: number; h: number }
export interface LetteringCheck { expected: string; result: 'confirmed' | 'check' | 'not found'; read?: string; notes?: string[] }
export interface LetteringReport {
  verdict: 'pass' | 'check' | 'fail' | 'unavailable'
  detail: string
  literal: Array<{ text: string; where: string; confidence: number }>
  corrected: string[]
  /** The second reader's lines, when it ran. */
  second?: string[]
  checks: LetteringCheck[]
  unexpected: string[]
}
const MIN_CONFIDENCE = 0.5   // below this a "word" is usually texture, not lettering
const NEAR_MISS = 0.75       // similarity above which a stretch of text counts as "the phrase, misspelled"

// With autocorrect off, Vision sometimes answers in Cyrillic or Greek letters that look exactly like
// Latin ones (and a Cyrillic Ч for a 4). They are the same shapes on the card, so fold them back.
const LOOKALIKES = new Map([...'АВЕЗКМНОРСТУХаеорсухіјѕΑΒΕΖΗΙΚΜΝΟΡΤΥΧοЧч'].map((c, i) => [c, [...'ABE3KMHOPCTYXaeopcyxijsABEZHIKMNOPTYXo44'][i]!]))
export const foldLookalikes = (t: string): string => [...t].map((c) => LOOKALIKES.get(c) ?? c).join('')

/** The letters that matter, lower-case, no spaces or punctuation: "HAPPY 4TH BIRTHDAY" -> "happy4thbirthday". */
export const letters = (t: string): string => foldLookalikes(t).replace(/[‘’]/g, "'").toLowerCase().replace(/[^a-z0-9&']/g, '')
function region(l: OcrLine): string {
  const my = l.y + l.h / 2, mx = l.x + l.w / 2
  return `${my < 1 / 3 ? 'top' : my > 2 / 3 ? 'bottom' : 'middle'} ${mx < 0.38 ? 'left' : mx > 0.62 ? 'right' : 'centre'}`
}
/** Longest-common-subsequence table, the basis of both the similarity ratio and the diff notes. */
function lcsTable(a: string, b: string): number[][] {
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
  return t
}
export function similarity(a: string, b: string): number { return a.length + b.length === 0 ? 1 : (2 * lcsTable(a, b)[0]![0]!) / (a.length + b.length) }

/** Plain-English notes on where two strings differ: "letter 12: expected 'd', OCR read 'o'". */
export function letterDifferences(expected: string, seen: string): string[] {
  const t = lcsTable(expected, seen); const notes: string[] = []
  let i = 0, j = 0
  while (i < expected.length || j < seen.length) {
    if (i < expected.length && j < seen.length && expected[i] === seen[j]) { i++; j++; continue }
    // One run of differences: follow the LCS path until the next matching letter.
    const i0 = i, j0 = j
    while (i < expected.length || j < seen.length) {
      if (i < expected.length && j < seen.length && expected[i] === seen[j]) break
      if (j >= seen.length || (i < expected.length && t[i + 1]![j]! >= t[i]![j + 1]!)) i++
      else j++
    }
    const e = expected.slice(i0, i), s = seen.slice(j0, j)
    if (e && s) notes.push(`letter ${i0 + 1}: expected '${e}', OCR read '${s}'`)
    else if (e) notes.push(`letter ${i0 + 1}: '${e}' is missing in the OCR reading`)
    else notes.push(`after letter ${i0}: OCR read an extra '${s}'`)
  }
  return notes
}

/** One reader's view of one phrase: where it sits in the reader's letter stream, or its closest miss. */
interface Match { exact: boolean; start: number; end: number; read: string; score: number }
function matchPhrase(stream: string, needle: string): Match {
  const at = stream.indexOf(needle)
  if (at >= 0) return { exact: true, start: at, end: at + needle.length, read: needle, score: 1 }
  let best: Match = { exact: false, start: -1, end: -1, read: '', score: 0 }
  for (const size of new Set([Math.max(1, needle.length - 2), needle.length - 1, needle.length, needle.length + 1, needle.length + 2].filter((n) => n >= 1))) {
    for (let s = 0; s + size <= stream.length; s++) {
      const read = stream.slice(s, s + size); const score = similarity(needle, read)
      if (score > best.score) best = { exact: false, start: s, end: s + size, read, score: Math.round(score * 100) / 100 }
    }
  }
  return best
}
/** The residue of a reader's stream once every matched phrase is removed: stray lettering, if any. */
function residue(stream: string, matches: Match[]): string[] {
  const used = new Array<boolean>(stream.length).fill(false)
  for (const m of matches) if (m.exact || m.score >= NEAR_MISS) for (let i = m.start; i < m.end; i++) used[i] = true
  const out: string[] = []; let cur = ''
  for (let i = 0; i <= stream.length; i++) { if (i < stream.length && !used[i]) cur += stream[i]; else { if (cur) out.push(cur); cur = '' } }
  return out
}

export function checkLettering(expect: string[], literalLines: OcrLine[], correctedLines: OcrLine[], secondLines?: OcrLine[] | null): LetteringReport {
  const lit = literalLines.map((l) => ({ ...l, text: foldLookalikes(l.text) }))
  const cor = correctedLines.map((l) => ({ ...l, text: foldLookalikes(l.text) }))
  const sec = secondLines ? secondLines.map((l) => ({ ...l, text: foldLookalikes(l.text) })) : null
  const report: LetteringReport = { verdict: 'pass', detail: '', literal: lit.map((l) => ({ text: l.text, where: region(l), confidence: Math.round(l.confidence * 100) / 100 })), corrected: cor.map((l) => l.text), checks: [], unexpected: [] }
  if (sec) report.second = sec.map((l) => l.text)
  const streamOf = (ls: OcrLine[]): string => ls.filter((l) => l.confidence >= MIN_CONFIDENCE).map((l) => letters(l.text)).join('')
  const A = streamOf(lit), C = streamOf(cor), B = sec ? streamOf(sec) : null
  const matchesA: Match[] = [], matchesB: Match[] = []
  for (const phrase of expect) {
    const needle = letters(phrase)
    if (!needle) continue
    const a = matchPhrase(A, needle); matchesA.push(a)
    const b = B === null ? null : matchPhrase(B, needle); if (b) matchesB.push(b)
    const check: LetteringCheck = { expected: phrase, result: 'confirmed' }
    if (a.exact || b?.exact) {
      // Confirmed by a literal reader. Say so when the other one saw it differently, for the record.
      const other = a.exact ? b : a
      if (other && !other.exact && other.score >= NEAR_MISS) check.notes = [`${a.exact ? 'RapidOCR' : 'Vision'} read '${other.read}'; ${a.exact ? 'Vision' : 'RapidOCR'} read it exactly`]
    } else {
      // A near miss is a 'check' that names the letter: only a look at the card can tell a fat D read
      // as O from a D drawn wrong. 'not found' (fails the card, allows a re-roll) is for a line that is
      // missing or garbled in every reader.
      const near = [a, ...(b ? [b] : [])].filter((m) => m.score >= NEAR_MISS).sort((x, y) => y.score - x.score)[0]
      const seen = [a, ...(b ? [b] : [])].filter((m) => m.read && m.score >= 0.5).sort((x, y) => y.score - x.score)[0]
      if (seen) {
        // Positions in the notes count the letters of the phrase as written, spaces included.
        const pos = [...phrase].map((c, i) => (letters(c) ? i + 1 : 0)).filter(Boolean)
        const spaced = (n: string): string => n.replace(/letter (\d+)/, (_, d: string) => `letter ${pos[Math.min(pos.length, Number(d)) - 1] ?? d}`)
        check.read = seen.read; check.notes = letterDifferences(needle, seen.read).map(spaced)
      }
      if (b && a.read && b.read && a.read !== b.read && a.score >= 0.5 && b.score >= 0.5) check.notes = [...(check.notes ?? []), `Vision read '${a.read}', RapidOCR read '${b.read}'`]
      if (C.includes(needle)) check.notes = [...(check.notes ?? []), 'the language-corrected pass reads it correctly']
      if (near) { check.result = 'check'; if (report.verdict === 'pass') report.verdict = 'check' }
      else { check.result = 'not found'; report.verdict = 'fail' }
    }
    report.checks.push(check)
  }
  // Stray lettering: what is left of the stream once the phrases are taken out. With two readers a
  // stray counts only when both see it (a wheel read as an O by one reader is not a doubled word).
  const strayA = residue(A, matchesA).filter((s) => s.length >= 2)
  report.unexpected = B === null ? strayA.filter((s) => s.length >= 3) : strayA.filter((s) => s.length >= 3 && residue(B, matchesB).some((t) => t.includes(s) || s.includes(t)))
  if (report.unexpected.length && report.verdict === 'pass') report.verdict = 'check'
  const problems = report.checks.filter((c) => c.result !== 'confirmed').map((c) => `${c.result === 'check' ? 'look at' : 'not found'}: "${c.expected}"${c.read ? ` (OCR read "${c.read}")` : ''}`)
  if (report.unexpected.length) problems.push(`also read: ${report.unexpected.join(' ')}`)
  report.detail = report.verdict === 'pass' ? `reads ${expect.map((e) => `"${e}"`).join(' · ')}${B === null ? ' (Vision only)' : ''}` : problems.join('; ')
  return report
}
