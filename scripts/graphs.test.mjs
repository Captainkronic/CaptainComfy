import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
// Transpile the TS modules on the fly with tsc into a temp dir so node --test can import them.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = mkdtempSync(join(tmpdir(), 'cll-'))
execFileSync('npx', ['tsc', 'src/shared/types.ts', 'src/shared/sizing.ts', 'src/shared/graphs.ts', 'src/shared/enrich.ts', 'src/shared/net.ts', 'src/shared/ideas.ts', 'src/shared/suggestions.ts', '--outDir', out, '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--skipLibCheck'], { stdio: 'inherit' })
writeFileSync(join(out, 'package.json'), '{"type":"module"}')
import { readdirSync, readFileSync } from 'node:fs'
for (const f of readdirSync(out)) if (f.endsWith('.js')) writeFileSync(join(out, f), readFileSync(join(out, f), 'utf8').replace(/from '(\.\/[a-z]+)'/g, "from '$1.js'"))
const fix = async (n) => import(join(out, n + '.js'))
const { sizeFor, clampSeconds } = await fix('sizing')
const { imageGraph, musicGraph, editGraph } = await fix('graphs')
const { lyricsAreFinal, cleanLLMText, normalizeStyleTags, musicStyleBrief } = await fix('enrich')

test('sizeFor snaps to 16 and honours aspect', () => {
  const s = sizeFor('1:1', 1.0); assert.equal(s.width, 1008); assert.equal(s.height, 1008)
  const w = sizeFor('16:9', 1.0); assert.ok(w.width > w.height); assert.equal(w.width % 16, 0); assert.equal(w.height % 16, 0)
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
