import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
// Transpile the TS modules on the fly with tsc into a temp dir so node --test can import them.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = mkdtempSync(join(tmpdir(), 'cll-'))
execFileSync('npx', ['tsc', 'src/shared/types.ts', 'src/shared/sizing.ts', 'src/shared/graphs.ts', 'src/shared/enrich.ts', 'src/shared/net.ts', 'src/shared/ideas.ts', 'src/shared/suggestions.ts', 'src/shared/models.ts', '--outDir', out, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--skipLibCheck'], { stdio: 'inherit' })
writeFileSync(join(out, 'package.json'), '{"type":"module"}')
import { readdirSync, readFileSync } from 'node:fs'
for (const f of readdirSync(out)) if (f.endsWith('.js')) writeFileSync(join(out, f), readFileSync(join(out, f), 'utf8').replace(/from '(\.\/[a-z]+)'/g, "from '$1.js'"))
const fix = async (n) => import(join(out, n + '.js'))
const { sizeFor, clampSeconds, IMAGE_QUALITY, imageQualityOf, EDIT_QUALITY, editQualityOf } = await fix('sizing')
const { imageGraph, musicGraph, editGraph } = await fix('graphs')
const { safeResultName } = await fix('net')
const { IMAGE_MODELS } = await fix('models')
const { lyricsAreFinal, cleanLLMText, normalizeStyleTags, musicStyleBrief, detectCraft, IMAGE_BRIEFS } = await fix('enrich')

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
test('image models: Turbo keeps its recipe, Juggernaut Z gets guidance and a negative, SDXL gets its own graph', () => {
  const base = { prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1, count: 1, steps: 8, seed: null }
  const t = imageGraph({ ...base, model: 'zimage' }, 'p', 1); assert.equal(t['1'].inputs.unet_name, 'z_image_turbo_bf16.safetensors'); assert.equal(t['6'].class_type, 'ConditioningZeroOut'); assert.equal(t['8'].inputs.cfg, 1)
  const j = imageGraph({ ...base, model: 'juggernaut-z', steps: 35 }, 'p', 1); assert.equal(j['1'].inputs.unet_name, 'Juggernaut_Z_V1_by_RunDiffusion.safetensors'); assert.equal(j['6'].class_type, 'CLIPTextEncode'); assert.equal(j['8'].inputs.cfg, 6); assert.equal(j['8'].inputs.steps, 35)
  const x = imageGraph({ ...base, model: 'realvisxl', steps: 30, upscale: 2 }, 'p', 1); assert.equal(x['1'].class_type, 'CheckpointLoaderSimple'); assert.equal(x['1'].inputs.ckpt_name, 'RealVisXL_V5.0_fp16.safetensors'); assert.equal(x['8'].inputs.vae_name, 'sdxl_vae_fp16_fix.safetensors'); assert.equal(x['5'].inputs.sampler_name, 'dpmpp_2m'); assert.equal(x['4'].inputs.width % 8, 0); assert.deepEqual(x['10'].inputs.images, ['13', 0])
  assert.equal(imageGraph(base, 'p', 1)['1'].inputs.unet_name, 'z_image_turbo_bf16.safetensors')   // old jobs without a model
  for (const k of Object.keys(IMAGE_MODELS)) assert.equal(IMAGE_MODELS[k].presets.balanced.megapixels, 1)
})
test('image quality presets round-trip and balanced is the recipe', () => {
  assert.equal(IMAGE_QUALITY.balanced.steps, 8); assert.equal(IMAGE_QUALITY.balanced.megapixels, 1)
  for (const k of Object.keys(IMAGE_QUALITY)) assert.equal(imageQualityOf(IMAGE_QUALITY[k]), k)
  assert.equal(imageQualityOf({ megapixels: 1, steps: 7 }), null); assert.equal(imageQualityOf({ megapixels: 1.5, steps: 8, upscale: 2 }), 'print'); assert.equal(imageQualityOf({ megapixels: 1.5, steps: 8 }), 'high'); assert.equal(imageQualityOf({ model: 'realvisxl', megapixels: 1, steps: 30 }), 'balanced'); assert.equal(imageQualityOf({ model: 'realvisxl', megapixels: 1, steps: 8 }), null)
  assert.equal(EDIT_QUALITY.balanced.steps, 4); for (const k of Object.keys(EDIT_QUALITY)) assert.equal(editQualityOf(EDIT_QUALITY[k]), k); assert.equal(editQualityOf({ megapixels: 1, steps: 6 }), null)
  const e2 = editGraph({ imagePath: '/x.png', imageName: 'x.png', instruction: 'i', enrich: false, megapixels: 1.5, steps: 4, seed: null, upscale: 2 }, 'i', 1, 'x.png')
  assert.equal(e2['18'].class_type, 'VAEDecodeTiled'); assert.equal(e2['22'].inputs.scale_by, 0.5); assert.deepEqual(e2['19'].inputs.images, ['22', 0])
  const e1 = editGraph({ imagePath: '/x.png', imageName: 'x.png', instruction: 'i', enrich: false, megapixels: 2, steps: 4, seed: null }, 'i', 1, 'x.png')
  assert.equal(e1['5'].inputs.megapixels, 1.5); assert.equal(e1['20'], undefined); assert.deepEqual(e1['19'].inputs.images, ['18', 0])
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

const { imageIdea, editIdea, musicIdea, lyricIdea, IDEA_SPACE, USE_CASES, GENRE_BY_NAME, ATMOSPHERIC, BED_FRIENDLY, IDEA_CATEGORIES, CARD_FOR } = await fix('ideas')
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

const { modelFamily, annotatedSource } = await fix('graphs')

test('model family: one per weight set, so consecutive jobs reuse what ComfyUI holds', () => {
  assert.notEqual(modelFamily('image'), modelFamily('music')); assert.notEqual(modelFamily('image'), modelFamily('edit'))
  assert.notEqual(modelFamily('image', 'zimage'), modelFamily('image', 'juggernaut-z')); assert.equal(modelFamily('image', 'realvisxl'), 'sdxl-realvisxl')
})
test('a result is named for LoadImage with its folder annotation', () => {
  assert.equal(annotatedSource({ subfolder: 'lite', filename: 'image_00066_.png', type: 'output' }), 'lite/image_00066_.png [output]')
  assert.equal(annotatedSource({ subfolder: '', filename: 'x.png', type: 'temp' }), 'x.png [temp]')
  const g = editGraph({ imagePath: '', imageName: 'x', instruction: 'i', enrich: false, megapixels: 1, steps: 4, seed: null, source: { subfolder: 'lite', filename: 'x.png', type: 'output' } }, 'i', 1, annotatedSource({ subfolder: 'lite', filename: 'x.png', type: 'output' }))
  assert.equal(g['4'].inputs.image, 'lite/x.png [output]')
})

test('safeResultName: only ordinary result names, nothing that climbs out or carries shell syntax', () => {
  assert.equal(safeResultName({ subfolder: 'lite', filename: 'image_00069_.png' }), 'lite/image_00069_.png')
  assert.equal(safeResultName({ subfolder: '', filename: 'ComfyUI_00001_.png' }), 'ComfyUI_00001_.png')
  assert.equal(safeResultName({ subfolder: 'lite/card', filename: 'a b-c.png' }), 'lite/card/a b-c.png')
  for (const bad of [
    { subfolder: '..', filename: 'x.png' },                 // climbs a level
    { subfolder: 'lite/../..', filename: 'x.png' },
    { subfolder: '', filename: '../../.ssh/id_ed25519' },
    { subfolder: '', filename: '.hidden' },                 // hidden file
    { subfolder: '', filename: "x'; rm -rf ~ #.png" },      // would break out of the ssh quoting
    { subfolder: '', filename: '$(whoami).png' },
    { subfolder: '', filename: '' }
  ]) assert.equal(safeResultName(bad), null, JSON.stringify(bad))
})

test('no preset asks a model for more pixels than it survived on the Studio', () => {
  for (const [key, m] of Object.entries(IMAGE_MODELS)) {
    assert.ok(m.memory.peakGb > 0 && m.memory.maxMegapixels > 0, `${key} has no measured memory`)
    for (const [tier, preset] of Object.entries(m.presets)) {
      assert.ok(preset.megapixels <= m.memory.maxMegapixels,
        `${key} ${tier} samples ${preset.megapixels} MP but ${m.label} tops out at ${m.memory.maxMegapixels} MP`)
    }
  }
  // Juggernaut Z is the heavy one: 1 MP only, and Print still reaches print size through the upscaler.
  assert.equal(IMAGE_MODELS['juggernaut-z'].memory.maxMegapixels, 1.0)
  assert.equal(IMAGE_MODELS['juggernaut-z'].presets.print.upscale, 2)
})

test('every use-case names genres that exist, and enough of them to stay varied', () => {
  for (const [use, names] of USE_CASES) {
    assert.ok(names.length >= 4, `${use} offers only ${names.length} genres`)
    assert.equal(new Set(names).size, names.length, `${use} lists a genre twice`)
    for (const n of names) assert.ok(GENRE_BY_NAME.has(n), `${use} names a genre that does not exist: ${n}`)
  }
  // The pairing has to actually bite: a meditation app must never be scored with a power ballad.
  const calm = USE_CASES.find(([u]) => u === 'a meditation app')[1]
  for (const bad of ['80s power ballad', 'metal', 'drum and bass', 'pop-punk']) assert.ok(!calm.includes(bad))
})

test('fused genres share a tempo range, and a bed genre only crosses with one that leaves room', () => {
  let fusions = 0
  for (let i = 0; i < 3000; i++) {
    const m = musicIdea()
    const hit = /^(.+?) crossed with ([^,]+),/.exec(m.text)
    if (!hit) continue
    fusions++
    const [, a, b] = hit
    const ga = GENRE_BY_NAME.get(a), gb = GENRE_BY_NAME.get(b)
    assert.ok(ga && gb, `unknown genre in "${m.text}"`)
    assert.ok(m.bpm >= Math.max(ga.bpm[0], gb.bpm[0]) && m.bpm <= Math.min(ga.bpm[1], gb.bpm[1]), `${m.text} @ ${m.bpm}`)
    if (ATMOSPHERIC.has(a)) assert.ok(BED_FRIENDLY.has(b), `${a} should not cross with ${b}`)
    if (ATMOSPHERIC.has(b)) assert.ok(BED_FRIENDLY.has(a), `${b} should not cross with ${a}`)
    const parts = m.text.split(', ')
    assert.notEqual(parts[1], parts[2], `the same instrument twice in "${m.text}"`)
  }
  assert.ok(fusions > 200, `only ${fusions} fusions in 3000 ideas`)
})

test('idea categories narrow what the generator offers', () => {
  const cards = Array.from({ length: 120 }, () => imageIdea(['cards']))
  for (const c of cards) {
    assert.match(c, /^a birthday card for /, c)
    // The scene has to suit the recipient: no cat on the presents for the child who loves horses.
    const hit = CARD_FOR.find(([who]) => c.startsWith(`a birthday card for ${who},`))
    assert.ok(hit, `unknown recipient in "${c}"`)
    const scene = c.slice(`a birthday card for ${hit[0]}, `.length).split(', ')[0]
    const generic = ['a cake with candles', 'balloons rising over rooftops', 'a parade of animals carrying presents', 'a treehouse party', 'a tower of stacked cupcakes', 'bunting strung between two trees']
    assert.ok(hit[1].includes(scene) || generic.includes(scene), `"${scene}" does not suit ${hit[0]}`)
  }
  assert.ok(new Set(cards).size > 100, `only ${new Set(cards).size} distinct card ideas in 120`)

  const design = Array.from({ length: 80 }, () => imageIdea(['design']))
  for (const d of design) assert.ok(!d.startsWith('a birthday card'), d)

  // Photoreal must never finish a scene as a painting, and Artwork must never finish one as a photo.
  const PAINTY = ['oil painting', 'watercolour illustration', 'pencil sketch', 'linocut print', 'anime key visual', 'gouache painting']
  const PHOTOY = ['cinematic photograph', 'Kodak Portra film look', 'Polaroid snapshot', 'tintype portrait', 'infrared photograph']
  for (const idea of Array.from({ length: 200 }, () => imageIdea(['photoreal']))) {
    for (const bad of PAINTY) assert.ok(!idea.includes(bad), `photoreal produced "${bad}": ${idea}`)
  }
  for (const idea of Array.from({ length: 200 }, () => imageIdea(['artwork']))) {
    for (const bad of PHOTOY) assert.ok(!idea.includes(bad), `artwork produced "${bad}": ${idea}`)
  }
  // No categories means everything, as before.
  assert.ok(new Set(Array.from({ length: 300 }, () => imageIdea())).size > 290)
  assert.equal(IDEA_CATEGORIES.length, 4)
})

test('a negative prompt reaches the models that can use one, and is ignored by Turbo', () => {
  const base = { prompt: 'x', enrich: false, aspect: '1:1', megapixels: 1, count: 1, steps: 30, seed: null }
  const MINE = 'no people, no text, no watermark'
  // SDXL: node 3 is the negative encode.
  const xl = imageGraph({ ...base, model: 'juggernaut-xi', negative: MINE }, 'p', 1)
  assert.equal(xl['3'].inputs.text, MINE)
  // Juggernaut Z runs guidance too, through the Z-Image graph's node 6.
  const jz = imageGraph({ ...base, model: 'juggernaut-z', negative: MINE }, 'p', 1)
  assert.equal(jz['6'].class_type, 'CLIPTextEncode'); assert.equal(jz['6'].inputs.text, MINE)
  // Empty or whitespace falls back to the model's own default rather than sending nothing.
  for (const empty of [undefined, '', '   ']) {
    const g = imageGraph({ ...base, model: 'realvisxl', negative: empty }, 'p', 1)
    assert.equal(g['3'].inputs.text, IMAGE_MODELS['realvisxl'].recipe.negative)
  }
  // Turbo has no guidance pass: the negative slot stays a zeroed conditioning whatever is typed.
  const t = imageGraph({ ...base, model: 'zimage', steps: 8, negative: MINE }, 'p', 1)
  assert.equal(t['6'].class_type, 'ConditioningZeroOut')
  assert.equal(JSON.stringify(t).includes(MINE), false, 'Turbo must not carry the negative text')
})

test('the enrichment brief matches the trade the prompt is asking for', () => {
  // The artefact wins over the medium: a poster painted in watercolour is still a design job.
  assert.equal(detectCraft('a birthday card for a 4-year-old who loves dinosaurs, cut-paper collage'), 'design')
  assert.equal(detectCraft('a book cover for a novel about a lighthouse, oil painting'), 'design')
  assert.equal(detectCraft('a poster for a night bus service'), 'design')
  assert.equal(detectCraft('a fox in a snowy birch forest, oil painting'), 'art')
  assert.equal(detectCraft('an abstract close-up of cracked dry earth, linocut print'), 'art')
  assert.equal(detectCraft('a lighthouse on a headland, golden hour light, Kodak Portra film look'), 'photo')
  assert.equal(detectCraft('a barista laughing, 85mm portrait, shallow depth of field'), 'photo')
  assert.equal(detectCraft(''), 'photo')

  // Each brief has to carry its own trade's vocabulary, and not the others'.
  assert.match(IMAGE_BRIEFS.photo, /focal length/i); assert.match(IMAGE_BRIEFS.photo, /aperture/i)
  assert.match(IMAGE_BRIEFS.photo, /Rembrandt/); assert.match(IMAGE_BRIEFS.photo, /key-to-fill/i)
  assert.match(IMAGE_BRIEFS.art, /pigment pooling/i); assert.match(IMAGE_BRIEFS.art, /carving marks/i)
  assert.ok(!/aperture/i.test(IMAGE_BRIEFS.art), 'the illustrator brief must not talk about aperture')
  assert.match(IMAGE_BRIEFS.design, /negative space/i); assert.match(IMAGE_BRIEFS.design, /proportions/i)
  assert.ok(!/focal length/i.test(IMAGE_BRIEFS.design), 'the design brief must not talk about focal length')

  // The banned phrases are the tell of an amateur prompt; every brief forbids them.
  for (const [name, brief] of Object.entries(IMAGE_BRIEFS)) {
    for (const junk of ['masterpiece', '4k', 'ultra detailed', 'trending on artstation', 'HDR']) {
      assert.ok(brief.includes(junk), `${name} brief should forbid "${junk}"`)
    }
    assert.match(brief, /Reply with the prompt only/)
  }
})
