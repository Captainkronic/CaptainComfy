import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
// Transpile the TS modules on the fly with tsc into a temp dir so node --test can import them.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = mkdtempSync(join(tmpdir(), 'cll-'))
execFileSync('npx', ['tsc', 'src/shared/types.ts', 'src/shared/sizing.ts', 'src/shared/graphs.ts', 'src/shared/enrich.ts', 'src/shared/net.ts', 'src/shared/ideas.ts', 'src/shared/suggestions.ts', 'src/shared/card.ts', '--outDir', out, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--skipLibCheck'], { stdio: 'inherit' })
writeFileSync(join(out, 'package.json'), '{"type":"module"}')
import { readdirSync, readFileSync } from 'node:fs'
for (const f of readdirSync(out)) if (f.endsWith('.js')) writeFileSync(join(out, f), readFileSync(join(out, f), 'utf8').replace(/from '(\.\/[a-z]+)'/g, "from '$1.js'"))
const fix = async (n) => import(join(out, n + '.js'))
const { sizeFor, clampSeconds, IMAGE_QUALITY, imageQualityOf } = await fix('sizing')
const { imageGraph, musicGraph, editGraph } = await fix('graphs')
const { lyricsAreFinal, cleanLLMText, normalizeStyleTags, musicStyleBrief } = await fix('enrich')

test('sizeFor snaps to 16 and honours aspect', () => {
  const s = sizeFor('1:1', 1.0); assert.equal(s.width, 1008); assert.equal(s.height, 1008)
  const w = sizeFor('16:9', 1.0); assert.ok(w.width > w.height); assert.equal(w.width % 16, 0); assert.equal(w.height % 16, 0)
})
test('upscale tail: RealESRGAN x4 after decode, halved for 2x, straight for 4x', () => {
  const g2 = imageGraph({ prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1.5, count: 1, steps: 8, seed: null, upscale: 2 }, 'f', 1)
  assert.equal(g2['11'].class_type, 'UpscaleModelLoader'); assert.deepEqual(g2['12'].inputs.image, ['9', 0]); assert.equal(g2['13'].inputs.scale_by, 0.5); assert.deepEqual(g2['10'].inputs.images, ['13', 0])
  const g4 = imageGraph({ prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1.5, count: 1, steps: 8, seed: null, upscale: 4 }, 'f', 1)
  assert.equal(g4['13'], undefined); assert.deepEqual(g4['10'].inputs.images, ['12', 0])
  const g1 = imageGraph({ prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1, count: 1, steps: 8, seed: null }, 'f', 1)
  assert.equal(g1['11'], undefined); assert.deepEqual(g1['10'].inputs.images, ['9', 0])
})
test('image quality presets round-trip and balanced is the recipe', () => {
  assert.equal(IMAGE_QUALITY.balanced.steps, 8); assert.equal(IMAGE_QUALITY.balanced.megapixels, 1)
  for (const k of Object.keys(IMAGE_QUALITY)) assert.equal(imageQualityOf(IMAGE_QUALITY[k]), k)
  assert.equal(imageQualityOf({ megapixels: 1, steps: 7 }), null); assert.equal(imageQualityOf({ megapixels: 1.5, steps: 8, upscale: 2 }), 'print'); assert.equal(imageQualityOf({ megapixels: 1.5, steps: 8 }), 'high')
})
test('clampSeconds bounds', () => { assert.equal(clampSeconds(3), 10); assert.equal(clampSeconds(999), 240); assert.equal(clampSeconds(30.4), 30) })
test('image graph wires the proven recipe', () => {
  const g = imageGraph({ prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1, count: 2, steps: 8, seed: null }, 'final', 42)
  assert.equal(g['8'].inputs.sampler_name, 'res_multistep'); assert.equal(g['8'].inputs.cfg, 1); assert.equal(g['7'].inputs.batch_size, 2)
  assert.equal(g['5'].inputs.text, 'final'); assert.equal(g['8'].inputs.seed, 42)
})
test('music graph keeps encoder duration and latent seconds identical', () => {
  const g = musicGraph({ style: 's', lyrics: 'l', enrich: false, seconds: 45, bpm: 100, steps: 8, seed: null }, 'tags', '[instrumental]', 7)
  assert.equal(g['3'].inputs.duration, g['5'].inputs.seconds); assert.equal(g['6'].inputs.sampler_name, 'euler'); assert.equal(g['3'].inputs.lyrics, '[instrumental]')
})
test('lyrics guard', () => { assert.ok(lyricsAreFinal('[Verse]\nla')); assert.ok(lyricsAreFinal('[instrumental]')); assert.ok(!lyricsAreFinal('a song about rain')) })
test('cleanLLMText strips preamble and quotes', () => { assert.equal(cleanLLMText('Here is your prompt: "a cat"'), 'a cat') })

const { liteOutUrl, parseLiteOut, isLoopback, comfyViewUrl } = await fix('net')
test('lite-out url round-trips and marks type', () => {
  const u = liteOutUrl('audio/sub dir', 'a b.mp3', 'output'); const p = parseLiteOut(u)
  assert.deepEqual(p, { subfolder: 'audio/sub dir', filename: 'a b.mp3', type: 'output' })
  assert.equal(parseLiteOut('http://x'), null); assert.equal(parseLiteOut('lite-out://out/'), null)
})
test('loopback detection and view url', () => {
  assert.ok(isLoopback('http://127.0.0.1:8188')); assert.ok(isLoopback('http://localhost:8188')); assert.ok(!isLoopback('http://adams-mac-studio.tailc7bb1e.ts.net:8188'))
  assert.equal(comfyViewUrl('http://h:1/', 's', 'f.png', 'output'), 'http://h:1/view?filename=f.png&subfolder=s&type=output')
})

test('edit graph mirrors the Klein 4B distilled template', () => {
  const g = editGraph({ imagePath: '/x.png', imageName: 'x.png', instruction: 'i', enrich: false, megapixels: 1, steps: 4, seed: null }, 'final', 9, 'captaincomfy_x.png')
  assert.equal(g['4'].inputs.image, 'captaincomfy_x.png'); assert.equal(g['7'].inputs.text, 'final')
  assert.deepEqual(g['10'].inputs, { conditioning: ['7', 0], latent: ['9', 0] }); assert.deepEqual(g['11'].inputs.conditioning, ['8', 0])
  assert.equal(g['16'].inputs.cfg, 1); assert.equal(g['14'].inputs.sampler_name, 'euler'); assert.equal(g['15'].inputs.steps, 4); assert.deepEqual(g['12'].inputs.width, ['6', 0])
})

test('style tags always carry the configured bpm and nothing else', () => {
  assert.equal(normalizeStyleTags('lofi hip hop, mellow, 80 bpm', 96), 'lofi hip hop, mellow, 96 bpm')
  assert.equal(normalizeStyleTags('deep house, 120BPM, filtered chords', 124), 'deep house, filtered chords, 124 bpm')
  assert.equal(normalizeStyleTags('', 100), '100 bpm')
  assert.ok(musicStyleBrief(96).includes("exactly 96 bpm")); assert.ok(!musicStyleBrief(96).includes('NNN'))
})

const { imageIdea, editIdea, musicIdea, lyricIdea, IDEA_SPACE } = await fix('ideas')
test('idea space is in the thousands and samples are distinct', () => {
  assert.ok(IDEA_SPACE.image > 100000, 'image ' + IDEA_SPACE.image); assert.ok(IDEA_SPACE.music > 5000, 'music ' + IDEA_SPACE.music); assert.ok(IDEA_SPACE.edit >= 800, 'edit ' + IDEA_SPACE.edit)
  const imgs = new Set(Array.from({ length: 500 }, imageIdea)); assert.ok(imgs.size > 490, `only ${imgs.size} distinct image ideas in 500`)
  const mus = new Set(Array.from({ length: 500 }, () => musicIdea().text)); assert.ok(mus.size > 450, `only ${mus.size} distinct music ideas in 500`)
  assert.ok(new Set(Array.from({ length: 200 }, editIdea)).size > 150); assert.ok(new Set(Array.from({ length: 200 }, lyricIdea)).size > 100)
})
test('music ideas carry a tempo that fits their genre', () => {
  for (let i = 0; i < 300; i++) { const m = musicIdea(); assert.ok(m.bpm >= 50 && m.bpm <= 190, m.text); assert.ok(m.text.split(',').length >= 4) }
  const dnb = Array.from({ length: 400 }, musicIdea).filter((m) => m.text.includes('drum and bass'))
  for (const m of dnb) assert.ok(m.bpm >= 170 && m.bpm <= 176, `${m.text} @ ${m.bpm}`)
})

const { cardSize, cardPrompt, cardQualityKey, draftToParams, defaultDraft, expectedLettering, checkLettering, letterDifferences, foldLookalikes, lookForAge, wordCount } = await fix('card')
const { cardGraph, modelFamily, warmupGraph } = await fix('graphs')
const line = (text, y = 0.05, conf = 1) => ({ text, confidence: conf, x: 0.2, y, w: 0.6, h: 0.06 })

test('card sizes equal the presets tested in Card-Generator', () => {
  assert.deepEqual(cardSize('portrait', 'balanced'), { width: 880, height: 1232 }); assert.deepEqual(cardSize('landscape', 'balanced'), { width: 1232, height: 880 })
  assert.deepEqual(cardSize('portrait', 'high'), { width: 1072, height: 1504 }); assert.deepEqual(cardSize('square', 'balanced'), { width: 1056, height: 1056 })
  assert.deepEqual(cardSize('photo-portrait', 'standard'), { width: 864, height: 1296 }); assert.deepEqual(cardSize('a-landscape', 'final'), { width: 1488, height: 1056 })   // legacy keys still resolve
  assert.equal(cardQualityKey('quick'), 'fast'); assert.equal(cardQualityKey('final'), 'high'); assert.equal(cardQualityKey('standard'), 'balanced'); assert.equal(cardQualityKey('draft'), 'draft'); assert.equal(cardQualityKey('nonsense'), 'balanced')
})
test('card prompt follows the skeleton and carries the lettering verbatim', () => {
  const d = { ...defaultDraft(), recipient: 'Nicholas', age: 4, lines: 'Happy 4th Birthday\nNicholas!', bottom: 'From, The Sutins', scene: 'A big red airplane flies through the sky.' }
  const p = cardPrompt(d)
  assert.ok(p.startsWith("A children's greeting card front, portrait format, drawn as a flat vector"))
  assert.ok(p.includes('reads "HAPPY 4TH BIRTHDAY" on one line, and directly below it "NICHOLAS!" on its own line in bigger letters, written once'))
  assert.ok(p.includes('reads "From, The Sutins" on a single line, centred'))
  assert.ok(p.includes('The only words anywhere on the card are "HAPPY 4TH BIRTHDAY", "NICHOLAS!" and "From, The Sutins".'))
  assert.ok(p.endsWith('made for a four year old.')); assert.ok(p.indexOf('reserved for the title') < p.indexOf('airplane') && p.indexOf('airplane') < p.indexOf('At the bottom'))
  assert.deepEqual(expectedLettering(d), ['HAPPY 4TH BIRTHDAY', 'NICHOLAS!', 'From, The Sutins'])
  assert.deepEqual(expectedLettering({ ...d, caps: false }), ['Happy 4th Birthday', 'Nicholas!', 'From, The Sutins'])
  const adult = cardPrompt({ ...d, age: null, look: 'riso', lines: 'HAPPY BIRTHDAY', bottom: '' })
  assert.ok(adult.startsWith('A greeting card front') && adult.endsWith('for an adult.') && adult.includes('The only words anywhere on the card are "HAPPY BIRTHDAY".') && !adult.includes('At the bottom'))
  assert.ok(wordCount(p) > 60 && wordCount(p) < 320)
  const params = draftToParams(d, 's1'); assert.equal(params.prompt, p); assert.equal(params.title, 'Nicholas, 4'); assert.equal(params.attempt, 1)
  assert.equal(draftToParams({ ...d, promptOverride: 'custom' }, 's1').prompt, 'custom')
})
test('card graph uses the tested recipe at card size, candidates as one batch', () => {
  const g = cardGraph({ prompt: 'p', expect: [], title: 't', shape: 'portrait', quality: 'balanced', count: 3, seed: null, verify: true, attempts: 3, attempt: 1, series: 's' }, 4040)
  assert.equal(g['7'].inputs.width, 880); assert.equal(g['7'].inputs.height, 1232); assert.equal(g['7'].inputs.batch_size, 3)
  assert.equal(g['8'].inputs.steps, 8); assert.equal(g['8'].inputs.sampler_name, 'res_multistep'); assert.equal(g['8'].inputs.seed, 4040); assert.equal(g['5'].inputs.text, 'p')
  const q = cardGraph({ prompt: 'p', expect: [], title: 't', shape: 'portrait', quality: 'fast', count: 1, seed: null, verify: true, attempts: 3, attempt: 1, series: 's' }, 1)
  assert.equal(q['8'].inputs.steps, 6); assert.equal(q['7'].inputs.width, 880)
  const f = cardGraph({ prompt: 'p', expect: [], title: 't', shape: 'portrait', quality: 'high', count: 1, seed: null, verify: true, attempts: 3, attempt: 1, series: 's' }, 1)
  assert.equal(f['8'].inputs.steps, 8); assert.equal(f['7'].inputs.width, 1072)
  const c = cardGraph({ prompt: 'p', expect: [], title: 't', shape: 'portrait', quality: 'print', count: 1, seed: null, verify: true, attempts: 3, attempt: 1, series: 's' }, 1)
  assert.equal(c['7'].inputs.width, 1072); assert.equal(c['13'].inputs.scale_by, 0.5); assert.deepEqual(c['10'].inputs.images, ['13', 0])
  assert.equal(modelFamily('card'), modelFamily('image')); assert.notEqual(modelFamily('card'), modelFamily('music'))
  assert.equal(lookForAge(3), 'flat'); assert.equal(lookForAge(8), 'gouache'); assert.equal(lookForAge(40), 'screen'); assert.equal(lookForAge(null), 'riso')
})
test('warm-up graph loads the same weights, tiny, and keeps its output out of the output folder', () => {
  const w = warmupGraph(), g = cardGraph({ prompt: 'p', expect: [], title: 't', shape: 'portrait', quality: 'balanced', count: 1, seed: null, verify: true, attempts: 3, attempt: 1, series: 's' }, 1)
  assert.deepEqual(w['1'], g['1']); assert.deepEqual(w['2'], g['2']); assert.deepEqual(w['3'], g['3'])
  assert.equal(w['7'].inputs.width, 256); assert.equal(w['8'].inputs.steps, 1); assert.equal(w['10'].class_type, 'PreviewImage')
})
test('lettering verdicts: two literal readers, letters not words', () => {
  const expect = ['HAPPY 4TH BIRTHDAY', 'NICHOLAS!', 'From, The Sutins']
  const good = [line('HAPPY 4TH BIRTHDAY'), line('NICHOLAS!', 0.12), line('From, The Sutins', 0.9)]
  const wrapped = [line('HAPPY 4TH'), line('BIRTHDAY', 0.1), line('NICHOLAS!', 0.15), line('From, The Sutins', 0.9)]
  const merged = [line('HAPPY4THBIRTHDAY'), line('NICHOLAS!', 0.15), line('From, TheSutins', 0.9)]
  assert.equal(checkLettering(expect, good, good, null).verdict, 'pass')
  assert.equal(checkLettering(expect, wrapped, wrapped, merged).verdict, 'pass')          // a wrapped title and dropped spaces both match
  assert.ok(checkLettering(expect, good, good, null).detail.endsWith('(Vision only)'))
  // Vision reads a fat D as O; RapidOCR reads it exactly: confirmed, with the disagreement noted
  const oay = [line('HAPPY 4TH BIRTHOAY'), line('NICHOLAS!', 0.12), line('From, The Sutins', 0.9)]
  const two = checkLettering(expect, oay, oay, merged); assert.equal(two.verdict, 'pass'); assert.deepEqual(two.checks[0].notes, ["Vision read 'happy4thbirthoay'; RapidOCR read it exactly"])
  // the same reading from one reader alone, or from both: a check naming the letter as a person would count it
  const one = checkLettering(expect, oay, oay, null); assert.equal(one.verdict, 'check'); assert.equal(one.checks[0].result, 'check')
  assert.deepEqual(one.checks[0].notes, ["letter 16: expected 'd', OCR read 'o'"])
  const both = checkLettering(expect, oay, oay, [line('HAPPY 4TH BIRTHOAY'), line('NICHOLAS!', 0.12), line('From, The Sutins', 0.9)]); assert.equal(both.verdict, 'check')
  // a line missing in every reader: fail
  const bad = [line('HAPPY 4TH BIRTHDAY'), line('From, The Sutins', 0.9)]
  const r3 = checkLettering(expect, bad, bad, bad); assert.equal(r3.verdict, 'fail'); assert.equal(r3.checks[1].result, 'not found')
  // strays: a wheel read as letters by one reader is ignored; a doubled name seen by both is a check
  assert.equal(checkLettering(expect, [...good, line('0000', 0.6)], good, merged).verdict, 'pass')
  assert.equal(checkLettering(expect, [...good, line('000', 0.6)], good, null).verdict, 'check')
  const doubled = [line('HAPPY 4TH BIRTHDAY'), line('NICHOLAS!', 0.12), line('NICHOLAS!', 0.2), line('From, The Sutins', 0.9)]
  const d = checkLettering(expect, doubled, doubled, doubled); assert.equal(d.verdict, 'check'); assert.deepEqual(d.unexpected, ['nicholas'])
  assert.equal(checkLettering(expect, [...good, line('xx', 0.6, 0.2)], good, null).verdict, 'pass')   // low confidence is noise
  assert.equal(foldLookalikes('H\u0410\u0420PY'), 'HAPPY'); assert.equal(foldLookalikes('HAPPY \u0427TH'), 'HAPPY 4TH')
  assert.deepEqual(letterDifferences('owen', 'oven'), ["letter 2: expected 'w', OCR read 'v'"])
  assert.deepEqual(letterDifferences('sutins', 'sutin'), ["letter 6: 's' is missing in the OCR reading"])
  assert.deepEqual(letterDifferences('mia', 'miia'), ["after letter 2: OCR read an extra 'i'"])
})
