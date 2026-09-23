/**
 * Idea generators. Every idea is assembled from curated parts, so the vocabulary stays controlled
 * while the combinations run into the millions.
 *
 * Two things keep the feed from feeling repetitive, which is what the first version got wrong:
 *
 * 1. **Shapes, not one template.** The old generator emitted "<subject> <setting>, <light>, <lens>,
 *    <style>" every single time, so even tens of thousands of combinations read as the same sentence
 *    with the nouns swapped. Each kind now has a set of shapes — a portrait, a landscape, a still
 *    life, a surreal juxtaposition, a poster brief — and picks between them.
 * 2. **A short memory.** `fresh()` keeps the last few head-words per bucket and re-rolls when one
 *    comes up again, so you do not get three lighthouses in a row just because the dice said so.
 */
const r = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!
const maybe = (p: number): boolean => Math.random() < p
/** n distinct members of a, in random order. */
const some = <T,>(a: readonly T[], n: number): T[] => [...a].sort(() => Math.random() - 0.5).slice(0, n)

const HISTORY = 8
const recent: Record<string, string[]> = {}
/** Re-roll while the idea's head-word is one of the last few from this bucket. */
function fresh<T>(bucket: string, gen: () => T, key: (v: T) => string, tries = 12): T {
  const seen = (recent[bucket] ??= [])
  let v = gen()
  for (let i = 0; i < tries && seen.includes(key(v)); i++) v = gen()
  seen.push(key(v)); if (seen.length > HISTORY) seen.shift()
  return v
}
/** Pick a shape by weight: the everyday shapes should come up more often than the exotic ones. */
function weighted<T>(entries: readonly (readonly [number, T])[]): T {
  const total = entries.reduce((n, e) => n + e[0], 0)
  let x = Math.random() * total
  for (const [w, v] of entries) { x -= w; if (x <= 0) return v }
  return entries[entries.length - 1]![1]
}

/* ------------------------------------------------------------------ images */
/** Where a subject plausibly belongs. A glassblower on a Scottish moor and a shepherd in a subway
 *  car are the kind of nonsense a flat subject list produces, so each one carries its own answer. */
type Where = 'in' | 'out' | 'any' | 'self-in' | 'self-out'
/** People as a bare noun phrase: these take an action from ACTIONS. */
const PEOPLE: readonly (readonly [string, Where])[] = [
  ['a woman with curly hair', 'any'], ['an old fisherman', 'out'], ['a street food vendor', 'out'], ['a jazz trumpeter', 'in'],
  ['a surfer', 'out'], ['a barista', 'in'], ['a lone hiker', 'out'], ['a ballet dancer', 'in'], ['a motorcyclist', 'out'],
  ['a florist', 'in'], ['an astronaut', 'any'], ['a monk', 'any'], ['a chess player', 'in'], ['a skateboarder', 'out'],
  ['a violinist', 'in'], ['a market trader', 'out'], ['a glassblower', 'in'], ['twin sisters', 'any'], ['a beekeeper', 'out'],
  ['a lighthouse keeper', 'out'], ['a tattoo artist', 'in'], ['a librarian', 'in'], ['a rock climber', 'out'],
  ['a fire dancer', 'out'], ['a train conductor', 'any'], ['a pastry chef', 'in'], ['a night-shift nurse', 'in'],
  ['a street magician', 'out'], ['an elderly couple', 'any'], ['a botanist', 'any'], ['a lifeguard', 'out'],
  ['a shepherd', 'out'], ['a watchmaker', 'in'], ['a puppeteer', 'in'], ['a cartographer', 'in'], ['a stilt walker', 'out'],
  ['a teenage drummer', 'in'], ['a bus driver', 'any'], ['a fortune teller', 'in'], ['a deep-sea diver', 'out'],
  ['a wandering poet', 'any'], ['a scrapyard mechanic', 'out'], ['a choir conductor', 'in'], ['a falconer', 'out']
]
/** Complete little scenes. They already carry their own action, so nothing is appended. */
const VIGNETTES: readonly (readonly [string, Where])[] = [
  ['a chef plating in a busy kitchen', 'self-in'], ['a woman reading on a fire escape', 'self-out'], ['a couple sharing headphones', 'any'],
  ['a girl with a telescope', 'out'], ['a man teaching his daughter to ride a bike', 'out'], ['a busker with an accordion', 'out'],
  ['a potter at the wheel', 'self-in'], ['a boxer between rounds', 'self-in'], ['a diver surfacing', 'self-out'],
  ['a child flying a kite', 'out'], ['a woman in a yellow raincoat waiting to cross', 'out'],
  ['two old men arguing over dominoes', 'any'], ['a baker pulling loaves from the oven', 'self-in'],
  ['a boy carrying a goldfish in a bag', 'any'], ['a cellist practising alone', 'in'],
  ['a farmer walking a fence line', 'self-out'], ['a night watchman doing his rounds', 'any']
]
const ANIMALS: readonly (readonly [string, 'land' | 'water' | 'air'])[] = [
  ['a fox', 'land'], ['a golden retriever puppy', 'land'], ['a snow leopard', 'land'], ['a wild horse', 'land'],
  ['a sleeping lion', 'land'], ['a barn owl', 'air'], ['a humpback whale', 'water'], ['a hare in long grass', 'land'],
  ['a heron', 'water'], ['a tabby cat', 'land'], ['an octopus', 'water'], ['a herd of elephants', 'land'],
  ['a flock of starlings', 'air'], ['a reindeer', 'land'], ['a hummingbird', 'air'], ['a tortoise', 'land'],
  ['a pod of dolphins', 'water'], ['a raven', 'air'], ['a red panda', 'land'], ['a school of sardines', 'water'],
  ['a highland cow', 'land'], ['a praying mantis', 'land'], ['a polar bear', 'land'], ['a swarm of fireflies', 'air'],
  ['a mountain goat', 'land'], ['a kingfisher', 'water'], ['a sea turtle', 'water'], ['a lynx', 'land']
]
const WATER_PLACES = ['in open ocean', 'over a coral reef', 'in a kelp forest', 'in a glacial fjord', 'in a sunlit shallow lagoon', 'in a slow river bend', 'in a mangrove channel']
const LAND_ACTS = ['mid-leap', 'asleep in a sunbeam', 'staring straight at the camera', 'half-hidden in tall grass', 'drinking at the water\'s edge', 'silhouetted against the sky', 'shaking off water', 'curled around its young', 'stalking through undergrowth', 'emerging from mist', 'standing perfectly still']
const WATER_ACTS = ['gliding through open water', 'breaching', 'caught in a shaft of sunlight', 'trailing a stream of bubbles', 'moving as one shoal', 'staring straight at the camera', 'silhouetted against the surface', 'half-buried in sand']
const AIR_ACTS = ['caught mid-flight', 'wings spread wide', 'perched and watching', 'silhouetted against the sky', 'taking off all at once', 'hovering perfectly still']
const actsFor = (h: 'land' | 'water' | 'air'): readonly string[] => h === 'water' ? WATER_ACTS : h === 'air' ? AIR_ACTS : LAND_ACTS
const ACTIONS = ['mid-laugh', 'lost in thought', 'caught mid-stride', 'leaning against a doorway', 'looking back over one shoulder', 'counting change', 'tying their boots', 'reading a folded letter', 'cupping a mug with both hands', 'sketching in a notebook', 'arguing on the phone', 'carrying too many bags', 'checking a pocket watch', 'laughing at something off-frame', 'half-asleep', 'deep in concentration', 'stretching after a long day']
/** Only used when the scene is outside: a monk sheltering under an awning inside a boxing gym was not it. */
const OUTDOOR_ACTIONS = ['shielding their eyes from the sun', 'sheltering under an awning', 'waiting out a downpour', 'brushing snow off their coat', 'watching the horizon', 'squinting into the wind']
const actionFor = (inside: boolean): string => r(inside ? ACTIONS : [...ACTIONS, ...OUTDOOR_ACTIONS])
const EVENTS = ['a storm rolls in', 'the last train leaves', 'the streetlights come on', 'snow begins to fall', 'the tide turns', 'fireworks start overhead', 'the power cuts out', 'a parade passes', 'the fog lifts', 'the market packs up', 'the rain finally stops', 'the church bells start']
const INDOORS = ['in a small brick café', 'in a dim jazz club', 'in an old vinyl record shop', 'in a greenhouse full of tropical plants', 'in a quiet library', 'in a neon-lit arcade', 'in a cluttered artist studio', 'in a Nordic sauna by the water', 'in a subway car at rush hour', 'in a sunlit farmhouse kitchen', 'in a Moroccan riad courtyard', 'in a launderette at midnight', 'in a cramped tailor\'s shop', 'in a university lecture hall', 'in a hotel lobby at 3 a.m.', 'in a boxing gym', 'in a planetarium', 'in an aircraft hangar', 'backstage before a show', 'in a tea house with paper screens', 'in a bookshop with a ladder', 'in a workshop full of half-finished work']
/** Wild places: animals go here, and people can too. */
const WILD = ['on a rocky cliff above the sea', 'in a snowy birch forest', 'in a Provence lavender field', 'on a foggy mountain lake at dawn', 'on a windy beach', 'in an Icelandic lava field', 'on a Scottish moor', 'in a Tuscan vineyard', 'on a frozen lake', 'in a wheat field before a storm', 'in a redwood grove', 'in a cherry orchard in bloom', 'on a salt flat at sunrise', 'in a terraced rice field', 'at a Highland loch', 'in a field of sunflowers', 'in a bamboo forest', 'in a mangrove channel', 'on a windswept dune ridge', 'in an alpine meadow']
/** Built places: people only. */
const URBAN = ['at a sunny harbour with pastel houses', 'in a rain-soaked Tokyo alley', 'in a Marrakech souk', 'on a rooftop over the city at night', 'on a desert highway at golden hour', 'in a Venetian side canal', 'in a Norwegian fjord village', 'on a Coney Island boardwalk', 'in a Kyoto temple garden', 'on a Havana street', 'on a Lisbon tram', 'at a mountain hut in the Alps', 'in a Bangkok floating market', 'on a Greek island terrace', 'under a mural-covered overpass', 'at a roadside motel at night', 'on a fishing pier in fog', 'in an abandoned drive-in cinema', 'at a desert gas station', 'on a suspension bridge in rain', 'at a ski lift in whiteout', 'on a cobbled street after rain', 'at a harbour full of fishing boats']
const OUTDOORS = [...WILD, ...URBAN]
function placeFor(w: Where): { place: string; inside: boolean } {
  // A subject that names its own setting keeps it; adding a second one gives you a busy kitchen
  // inside an aircraft hangar.
  if (w === 'self-in') return { place: '', inside: true }
  if (w === 'self-out') return { place: '', inside: false }
  const inside = w === 'in' || (w === 'any' && maybe(0.45))
  return { place: inside ? r(INDOORS) : r(OUTDOORS), inside }
}
const PLACES = ['a lighthouse on a headland', 'a farmhouse with a red roof', 'a cabin in deep snow', 'a ferris wheel at dusk', 'a rooftop garden above traffic', 'a canal lined with houseboats', 'a lone oak in a bare field', 'an arched stone bridge', 'a tide pool at low water', 'a waterfall through moss', 'an empty night market', 'a grand old train station', 'a diner on a crossroads', 'a hilltop chapel', 'a shipwreck on a beach', 'a bathhouse in steam', 'a fishing village clinging to a cliff', 'a rice barn in fog', 'a Brutalist housing block', 'a windmill in a flat landscape', 'a monastery on a rock spire', 'a drowned church tower in a lake', 'a spiral staircase in an old library', 'a greenhouse gone wild', 'a city seen from a cable car', 'an airfield at first light']
const OBJECTS = ['a cracked leather satchel', 'three lemons and a knife', 'a stack of worn paperbacks', 'a brass compass and folded maps', 'an unmade bed and morning coffee', 'a pair of muddy boots', 'a typewriter and a full ashtray', 'a bowl of cherries on linen', 'a violin case left open', 'fresh bread and a butter dish', 'a camera and spent film rolls', 'a jar of wildflowers', 'oysters on crushed ice', 'a chess set mid-game', 'keys, coins and a train ticket', 'a fountain pen on blotting paper', 'a birthday cake with one candle', 'tools laid out on a workbench', 'a teapot and two cups', 'seashells and beach glass']
const SURFACES = ['on scrubbed pine', 'on dark slate', 'on rumpled linen', 'on a marble counter', 'on a zinc bar top', 'on weathered oak', 'against a plaster wall', 'on a steel workbench']
/** Light has to match the room. A hilltop chapel lit by a projector in a dark room was the giveaway. */
const INDOOR_LIGHT = ['candlelight', 'stage spotlight and smoke', 'warm tungsten light', 'flickering fluorescent light', 'hard shadows through blinds', 'the green wash of an exit sign', 'projector light in a dark room', 'a single window\'s light', 'dusty light beams', 'firelight', 'fairy lights', 'soft overcast light through glass']
const OUTDOOR_LIGHT = ['golden hour light', 'soft overcast light', 'harsh midday sun', 'blue hour glow', 'neon reflections in the rain', 'moonlight', 'dappled light through leaves', 'foggy diffused light', 'dramatic storm light', 'backlit rim light', 'cool morning mist', 'sunset silhouette', 'car headlights sweeping past', 'firelight', 'fairy lights', 'the last light before dusk']
const LIGHT = [...new Set([...INDOOR_LIGHT, ...OUTDOOR_LIGHT])]
const lightFor = (inside: boolean): string => r(inside ? INDOOR_LIGHT : OUTDOOR_LIGHT)
const LENS = ['85mm portrait, shallow depth of field', '35mm documentary, eye level', '24mm wide, dramatic perspective', 'macro close-up', 'telephoto compression', 'low angle looking up', 'high angle looking down', 'over-the-shoulder', 'centred symmetrical composition', 'candid, slightly off-centre', 'tilt-shift miniature look', 'long exposure', 'shot through a rain-streaked window', 'framed by a doorway', 'extreme close-up on hands']
const PHOTO_MEDIA = ['cinematic photograph', 'Kodak Portra film look', 'black and white film photograph', 'editorial fashion photograph', 'Polaroid snapshot', 'National Geographic photograph', 'documentary photojournalism', 'large format 4x5 portrait', 'infrared photograph', 'disposable camera flash photo', 'tintype portrait']
const PAINT_MEDIA = ['oil painting', 'watercolour illustration', 'gouache painting', 'impressionist painting', 'acrylic on canvas, visible brushwork', 'ink wash painting', 'pastel drawing', 'tempera panel painting']
const DRAWN_MEDIA = ['pencil sketch', 'charcoal drawing', 'children\'s book illustration', 'anime key visual', 'Ghibli-style illustration', 'noir comic panel', 'ukiyo-e woodblock print', 'linocut print', 'etching with cross-hatching', 'storyboard frame', 'scientific illustration plate', 'stained glass window']
const GRAPHIC_MEDIA = ['Art Deco poster', 'Bauhaus poster', 'Swiss International Style layout', 'risograph print in two colours', 'silkscreen gig poster', 'mid-century travel poster', 'flat vector illustration', 'collage of torn paper', 'blueprint schematic', 'vintage matchbook art']
const RENDER_MEDIA = ['hyperrealistic render', 'cyberpunk concept art', 'claymation still', 'isometric diorama', 'miniature paper craft scene', 'low-poly render', 'chrome and glass product render', 'voxel art']
const ALL_MEDIA = [...PHOTO_MEDIA, ...PAINT_MEDIA, ...DRAWN_MEDIA, ...GRAPHIC_MEDIA, ...RENDER_MEDIA]
const MOOD = ['calm', 'joyful', 'melancholic', 'mysterious', 'tense', 'nostalgic', 'serene', 'playful', 'lonely', 'triumphant', 'cozy', 'eerie', 'romantic', 'gritty', 'dreamy', 'defiant', 'weary', 'reverent', 'hopeful']
const PALETTE = ['muted earth tones', 'teal and orange', 'soft pastels', 'high-contrast black, white and red', 'warm sepia', 'cold blues and greys', 'sun-bleached primaries', 'neon pink and cyan', 'forest greens and brass', 'cream, navy and gold', 'dusty rose and sage', 'monochrome with one spot colour']
const ERA = ['the 1920s', 'the 1950s', 'the 1970s', 'the 1980s', 'the near future', 'the year 2140', 'the Victorian era', 'the Edwardian era', 'a solarpunk 2050']
const GENRE_SCENES = ['a derelict space station orbiting a gas giant', 'a rain-slick cyberpunk street market', 'a wizard\'s cluttered study', 'a detective\'s office with the blinds drawn', 'a Viking longship in heavy sea', 'a post-apocalyptic overgrown shopping mall', 'a deep-sea research submarine', 'a desert caravan under two moons', 'a steampunk airship dock', 'an underwater city dome', 'a haunted coaching inn', 'a frontier saloon at noon', 'a moon base greenhouse', 'a dragon sleeping on a hoard', 'a samurai duel in falling snow', 'a jungle temple reclaimed by roots']
const ABSTRACT = ['flowing ink in water', 'cracked dry earth', 'layered sedimentary rock', 'frost patterns on glass', 'oil slick iridescence', 'woven textile fibres', 'smoke curling in still air', 'molten glass', 'aerial farmland patchwork', 'magnified pollen grains', 'rippled sand dunes', 'peeling painted metal']
const POSTER_BRIEFS = ['a travel poster for a place that does not exist', 'a festival poster for a music festival on a glacier', 'a book cover for a novel about a lighthouse', 'a coffee packaging label', 'a film poster for a heist set in a bakery', 'a museum exhibition poster about deep time', 'an album cover for an ambient record', 'a poster for a night bus service', 'a wine label for a small vineyard', 'a poster for a public library', 'a cover for a magazine about cold-water swimming', 'a seed packet illustration', 'a poster for a chess tournament', 'a label for hot sauce', 'a cover for a field guide to clouds']
const FOOD = ['a bowl of ramen with a soft egg', 'a tray of pastries fresh from the oven', 'a roast dinner mid-carve', 'a stack of pancakes with syrup pouring', 'street tacos on a paper plate', 'a cheese board with figs and honey', 'a pot of stew on a stove', 'shaved ice with fruit syrup', 'a full English breakfast', 'dumplings in a bamboo steamer']

const IMAGE_SHAPES: readonly (readonly [number, () => { text: string; key: string }])[] = [
  // A person, doing something, somewhere that suits them. The bread and butter.
  [24, () => { const [who, where] = r(PEOPLE); const p = placeFor(where); const parts = [`${who} ${actionFor(p.inside)}`, p.place, lightFor(p.inside)].filter(Boolean)
    if (maybe(0.6)) parts.push(r(LENS)); parts.push(r(ALL_MEDIA)); if (maybe(0.35)) parts.push(`${r(MOOD)} mood`)
    return { text: parts.join(', '), key: who } }],
  // A ready-made vignette, which already has its own action.
  [12, () => { const [who, where] = r(VIGNETTES); const p = placeFor(where); const parts = [who, p.place, lightFor(p.inside)].filter(Boolean)
    if (maybe(0.5)) parts.push(r(LENS)); parts.push(r(ALL_MEDIA))
    return { text: parts.join(', '), key: who } }],
  // Built around a moment happening around them.
  [9, () => { const [who, where] = r(PEOPLE); const inside = where === 'in'
    return { text: [`${who} ${actionFor(inside)} as ${r(EVENTS)}`, inside ? r(INDOORS) : r(OUTDOORS), lightFor(inside), r(ALL_MEDIA)].join(', '), key: who } }],
  // Wildlife, in wild places only.
  [12, () => { const [a, habitat] = r(ANIMALS); const parts = [`${a} ${r(actsFor(habitat))}`, r(habitat === 'water' ? WATER_PLACES : WILD), lightFor(false)]
    if (maybe(0.5)) parts.push(r(LENS)); parts.push(r(ALL_MEDIA))
    return { text: parts.join(', '), key: a } }],
  // A place, with no one in it.
  [13, () => { const pl = r(PLACES); const parts = [pl, lightFor(false)]
    if (maybe(0.6)) parts.push(r(LENS)); parts.push(r(ALL_MEDIA)); if (maybe(0.4)) parts.push(`${r(MOOD)} mood`)
    return { text: parts.join(', '), key: pl } }],
  // Still life.
  [8, () => { const o = r(OBJECTS); return { text: [`a still life of ${o}`, r(SURFACES), lightFor(true), r(maybe(0.5) ? PHOTO_MEDIA : PAINT_MEDIA)].join(', '), key: o } }],
  // Interior, architectural, empty.
  [6, () => { const s = r(INDOORS); return { text: [`the empty interior of ${s.replace(/^in /, '')}`, lightFor(true), r(LENS), r(ALL_MEDIA)].join(', '), key: s } }],
  // Genre fiction: sci-fi, fantasy, noir, western.
  [9, () => { const g = r(GENRE_SCENES); return { text: [g, r(LIGHT), r(maybe(0.6) ? RENDER_MEDIA : ALL_MEDIA), `${r(MOOD)} mood`].join(', '), key: g } }],
  // Deliberate nonsense: the one shape allowed to put the wrong thing in the wrong place.
  [5, () => { const a = r(ANIMALS)[0]; const b = r(URBAN); return { text: [`${a} ${b}, impossibly out of place`, lightFor(false), r(ALL_MEDIA), `${r(MOOD)} mood`].join(', '), key: a } }],
  // A design brief rather than a scene.
  [5, () => { const b = r(POSTER_BRIEFS); return { text: [b, r(PALETTE), r(GRAPHIC_MEDIA)].join(', '), key: b } }],
  // Period piece.
  [4, () => { const [who, where] = r(PEOPLE); const e = r(ERA); const p = placeFor(where)
    return { text: [`${who} in ${e}`, p.place, lightFor(p.inside), r(ALL_MEDIA)].filter(Boolean).join(', '), key: e } }],
  // Pure texture.
  [4, () => { const a = r(ABSTRACT); return { text: [`an abstract close-up of ${a}`, r(PALETTE), r(LIGHT), r(maybe(0.5) ? PHOTO_MEDIA : RENDER_MEDIA)].join(', '), key: a } }],
  // Food.
  [4, () => { const f = r(FOOD); return { text: [f, r(SURFACES), lightFor(true), (maybe(0.7) ? 'overhead flat lay' : r(LENS)), r(PHOTO_MEDIA)].join(', '), key: f } }]
]
export function imageIdea(): string {
  return fresh('image', () => weighted(IMAGE_SHAPES)(), (v) => v.key).text
}

/* ------------------------------------------------------------------- edits */
const EDIT_OPS = [
  () => `change the ${r(['jacket', 'shirt', 'dress', 'hat', 'car', 'door', 'wall', 'sky', 'umbrella', 'scarf', 'shoes', 'sofa', 'curtains', 'bicycle', 'tablecloth', 'front gate'])} to ${r(['red', 'deep blue', 'emerald green', 'mustard yellow', 'white', 'black', 'pastel pink', 'burnt orange', 'lavender', 'teal', 'cream', 'burgundy', 'charcoal', 'dusty rose'])}`,
  () => `make it ${r(['golden hour', 'a rainy evening', 'nighttime with city lights', 'a foggy morning', 'a snowy winter day', 'autumn with orange leaves', 'a hot summer afternoon', 'blue hour', 'a stormy afternoon', 'spring with cherry blossoms', 'a misty dawn', 'a clear starry night', 'an overcast winter noon', 'a heatwave at dusk'])}`,
  () => `give them ${r(['sunglasses', 'a warm knitted scarf', 'a wide-brim hat', 'headphones', 'a bouquet of flowers', 'a coffee cup', 'an umbrella', 'a vintage camera', 'a leather jacket', 'a paper lantern', 'a book', 'a bright yellow raincoat', 'a guitar', 'a birthday cake', 'a pair of binoculars', 'a sleeping cat in their arms'])}`,
  () => `add ${r(['gentle falling snow', 'a small dog', 'birds in the sky', 'string lights', 'a distant sailboat', 'steam rising from a cup', 'fireflies', 'a rainbow', 'blowing leaves', 'a cat asleep nearby', 'balloons', 'a full moon', 'soft rain', 'a cup of tea on the table', 'a hot air balloon on the horizon', 'puddles with reflections'])}`,
  () => `replace the background with ${r(['a quiet beach at dusk', 'a mountain lake', 'a neon city street', 'a wheat field', 'a snowy forest', 'a Mediterranean harbour', 'a desert at night', 'a cozy library', 'a rooftop garden', 'a foggy pier', 'a Japanese garden', 'a stadium at night', 'a plain studio backdrop', 'an old European square', 'a greenhouse', 'a train platform'])}`,
  () => `change the hair to ${r(['silver', 'short and curly', 'long and straight', 'auburn', 'platinum blonde', 'a braided updo', 'jet black', 'soft waves', 'a buzz cut', 'copper red', 'a high ponytail', 'shoulder-length with bangs'])}`,
  () => `convert to ${r(['a black and white film photograph', 'a watercolour painting', 'an oil painting', 'a pencil sketch', 'a vintage postcard', 'an anime illustration', 'a Polaroid snapshot', 'a comic book panel', 'a claymation still', 'a stained glass window', 'a charcoal drawing', 'a 1970s film still', 'a risograph print', 'a linocut'])}`,
  () => `give the scene ${r(['a soft pastel palette', 'warm sepia tones', 'cool cinematic teal and orange', 'high contrast dramatic lighting', 'a dreamy soft glow', 'muted film colours', 'vivid saturated colours', 'a cold blue tint', 'golden warm tones', 'a faded vintage look'])}`,
  () => `make them ${r(['smile warmly', 'laugh', 'look at the camera', 'look away thoughtfully', 'close their eyes', 'wink', 'look surprised', 'look serene'])}`,
  () => `${r(['remove the people in the background', 'remove the text and signs', 'remove the car', 'remove the clutter on the table', 'remove the power lines', 'remove the reflection', 'remove the watermark', 'clean up the wall'])}`,
  () => `make it look like ${r(['the 1920s', 'the 1950s', 'the 1970s', 'the 1980s', 'the year 2080', 'a Renaissance painting', 'a Wes Anderson film', 'a noir film', 'a fashion magazine cover', 'a travel brochure'])}`,
  () => `${r(['zoom out to show more of the room', 'crop to a tight portrait', 'make it a wide cinematic frame', 'tilt the camera slightly', 'shoot it from a low angle', 'shoot it from above'])}`
]
export function editIdea(): string {
  const a = r(EDIT_OPS)()
  if (!maybe(0.5)) return `${a}, keep everything else the same`
  let b = r(EDIT_OPS)(); if (b.split(' ')[0] === a.split(' ')[0]) b = r(EDIT_OPS)()
  return `${a}, ${b}, keep everything else the same`
}

/* ------------------------------------------------------------------- music */
interface Genre { name: string; bpm: [number, number]; instruments: string[]; moods: string[]; vocals: string[]; eras?: string[] }
const GENRES: Genre[] = [
  { name: 'lo-fi hip hop', bpm: [70, 90], instruments: ['dusty drums', 'warm Rhodes piano', 'vinyl crackle', 'muted trumpet sample', 'soft sub bass', 'tape hiss'], moods: ['chill', 'nostalgic', 'rainy-day', 'late-night'], vocals: ['instrumental', 'instrumental', 'faint vocal chops'] },
  { name: 'deep house', bpm: [120, 126], instruments: ['four-on-the-floor kick', 'filtered chords', 'rolling bassline', 'shuffled hi-hats', 'warm pads'], moods: ['hypnotic', 'sultry', 'late-night', 'groovy'], vocals: ['soulful vocal chops', 'instrumental', 'smooth female vocal'] },
  { name: 'acoustic folk-pop', bpm: [88, 110], instruments: ['fingerpicked guitar', 'brushed drums', 'upright bass', 'banjo', 'harmonica', 'soft piano'], moods: ['warm', 'hopeful', 'intimate', 'wistful'], vocals: ['gentle female vocal', 'warm male vocal', 'harmonized duet'] },
  { name: 'synth-pop', bpm: [110, 128], instruments: ['bright arpeggiated synths', 'driving bassline', 'gated drums', 'shimmering pads', 'chorused guitar'], moods: ['upbeat', 'bittersweet', 'neon', 'euphoric'], vocals: ['bright female vocals', 'breathy male vocal', 'layered harmonies'], eras: ['80s', 'modern', 'mid-2000s'] },
  { name: 'jazz trio', bpm: [60, 96], instruments: ['brushed drums', 'upright bass', 'piano', 'ride cymbal', 'muted trumpet'], moods: ['late-night', 'smoky', 'reflective', 'elegant'], vocals: ['instrumental', 'instrumental', 'husky female vocal'] },
  { name: 'indie rock', bpm: [120, 150], instruments: ['jangly guitars', 'driving drums', 'melodic bass', 'tambourine', 'fuzz guitar'], moods: ['anthemic', 'restless', 'sunny', 'yearning'], vocals: ['male vocal', 'shouted gang vocals on the chorus', 'female vocal'] },
  { name: 'cinematic orchestral', bpm: [70, 110], instruments: ['strings', 'taiko drums', 'french horns', 'choir', 'harp', 'timpani'], moods: ['epic', 'tender', 'ominous', 'triumphant'], vocals: ['instrumental', 'instrumental', 'wordless choir'] },
  { name: 'reggae', bpm: [70, 90], instruments: ['offbeat guitar skank', 'warm bass', 'one-drop drums', 'organ bubble', 'melodica'], moods: ['sunny', 'laid-back', 'conscious', 'easy'], vocals: ['laid-back male vocal', 'call-and-response vocals', 'instrumental dub'] },
  { name: 'shoegaze', bpm: [100, 125], instruments: ['washed-out guitars', 'reverb-drenched drums', 'droning bass', 'tremolo guitar', 'synth haze'], moods: ['dreamy', 'melancholic', 'hazy', 'overwhelming'], vocals: ['whispered vocals', 'buried female vocal', 'androgynous vocal'] },
  { name: 'country ballad', bpm: [66, 88], instruments: ['pedal steel', 'acoustic guitar', 'brushed snare', 'fiddle', 'piano'], moods: ['heartbroken', 'tender', 'homesick', 'proud'], vocals: ['storytelling male vocal', 'warm female vocal', 'duet'] },
  { name: 'bossa nova', bpm: [120, 140], instruments: ['nylon guitar', 'soft percussion', 'brushed drums', 'flute', 'Rhodes'], moods: ['intimate', 'breezy', 'romantic', 'sunset'], vocals: ['intimate vocal', 'soft female vocal', 'instrumental'] },
  { name: '80s power ballad', bpm: [64, 80], instruments: ['gated drums', 'big synths', 'clean electric guitar', 'piano', 'guitar solo'], moods: ['soaring', 'heartfelt', 'dramatic'], vocals: ['soaring vocal', 'powerhouse female vocal', 'raspy male vocal'] },
  { name: 'minimal piano', bpm: [56, 76], instruments: ['felt piano', 'cello', 'room ambience', 'soft strings'], moods: ['melancholic', 'still', 'tender', 'grieving'], vocals: ['instrumental', 'instrumental', 'instrumental'] },
  { name: 'disco', bpm: [112, 126], instruments: ['slap bass', 'horns', 'strings', 'four-on-the-floor drums', 'wah guitar', 'clavinet'], moods: ['funky', 'glittering', 'celebratory'], vocals: ['group vocals', 'diva vocal', 'falsetto male vocal'] },
  { name: 'ambient', bpm: [50, 70], instruments: ['soft drones', 'field recordings', 'granular textures', 'slow swelling pads', 'distant piano'], moods: ['weightless', 'meditative', 'glacial', 'hopeful'], vocals: ['instrumental', 'instrumental', 'instrumental'] },
  { name: 'techno', bpm: [126, 140], instruments: ['relentless kick', 'acid bassline', 'metallic percussion', 'rave stabs', 'filtered noise risers'], moods: ['hypnotic', 'dark', 'relentless', 'euphoric'], vocals: ['instrumental', 'instrumental', 'robotic vocal snippets'] },
  { name: 'trap', bpm: [130, 160], instruments: ['808 bass', 'rapid hi-hats', 'dark synth stabs', 'bell melody', 'snare rolls'], moods: ['moody', 'aggressive', 'hazy', 'triumphant'], vocals: ['rap vocal', 'auto-tuned melodic vocal', 'instrumental'] },
  { name: 'trip-hop', bpm: [80, 100], instruments: ['slow heavy drums', 'deep sub bass', 'string sample', 'vinyl crackle', 'Rhodes piano'], moods: ['brooding', 'cinematic', 'smoky', 'seductive'], vocals: ['breathy female vocal', 'instrumental', 'spoken word'] },
  { name: 'pop-punk', bpm: [150, 180], instruments: ['fast driving drums', 'crunchy power chords', 'octave guitar leads', 'melodic bass'], moods: ['restless', 'nostalgic', 'defiant', 'heartbroken'], vocals: ['emotional male vocal', 'gang vocals', 'female vocal'] },
  { name: 'gospel', bpm: [72, 100], instruments: ['Hammond organ', 'piano', 'handclaps', 'tambourine', 'bass'], moods: ['uplifting', 'joyous', 'reverent'], vocals: ['choir', 'powerhouse lead vocal with choir', 'call-and-response'] },
  { name: 'afrobeats', bpm: [98, 112], instruments: ['log drum', 'shakers', 'warm bass', 'plucked guitar', 'bright synth'], moods: ['sunny', 'flirty', 'celebratory', 'laid-back'], vocals: ['smooth male vocal', 'female vocal', 'duet'] },
  { name: 'flamenco', bpm: [110, 150], instruments: ['nylon guitar', 'palmas handclaps', 'cajón', 'castanets'], moods: ['fiery', 'sorrowful', 'passionate'], vocals: ['instrumental', 'raw male vocal', 'female vocal'] },
  { name: 'drum and bass', bpm: [170, 176], instruments: ['fast breakbeats', 'deep sub bass', 'atmospheric pads', 'reese bass'], moods: ['liquid', 'dark', 'euphoric', 'rolling'], vocals: ['instrumental', 'soulful female vocal', 'MC vocal snippets'] },
  { name: 'bluegrass', bpm: [120, 160], instruments: ['banjo', 'fiddle', 'mandolin', 'upright bass', 'acoustic guitar'], moods: ['rollicking', 'homesick', 'joyful'], vocals: ['high lonesome male vocal', 'three-part harmony', 'instrumental'] },
  { name: 'city pop', bpm: [100, 120], instruments: ['slap bass', 'bright electric piano', 'clean funk guitar', 'brass hits', 'shimmering synths'], moods: ['breezy', 'nocturnal', 'romantic', 'glossy'], vocals: ['smooth female vocal', 'male vocal', 'instrumental'], eras: ['late 70s', '80s'] },
  { name: 'metal', bpm: [120, 190], instruments: ['down-tuned guitars', 'double kick drums', 'heavy groove riffs', 'screaming lead guitar'], moods: ['furious', 'crushing', 'epic', 'menacing'], vocals: ['harsh male vocal', 'clean soaring vocal', 'instrumental'] },
  { name: 'soul', bpm: [70, 100], instruments: ['live drums', 'warm bass', 'horns', 'Wurlitzer', 'strings'], moods: ['heartfelt', 'sultry', 'joyful', 'aching'], vocals: ['powerhouse female vocal', 'smooth male vocal', 'backing harmonies'], eras: ['60s', '70s', 'modern'] },
  { name: 'chiptune', bpm: [120, 170], instruments: ['square wave leads', 'noise-channel drums', 'arpeggiated bass'], moods: ['playful', 'heroic', 'bouncy'], vocals: ['instrumental', 'instrumental'] },
  { name: 'new age', bpm: [56, 80], instruments: ['flute', 'soft synth pads', 'harp', 'rain sounds', 'singing bowls'], moods: ['healing', 'serene', 'floating'], vocals: ['instrumental', 'instrumental', 'wordless vocal'] },
  { name: 'ska', bpm: [140, 180], instruments: ['upstroke guitar', 'walking bass', 'horn section', 'organ'], moods: ['bouncy', 'cheeky', 'sunny'], vocals: ['shouty male vocal', 'group vocals'] },
  { name: 'dub', bpm: [64, 88], instruments: ['cavernous reverb', 'tape delay throws', 'heavy bass', 'skanking guitar', 'melodica'], moods: ['spacious', 'stoned', 'mystic'], vocals: ['instrumental', 'toasted vocal snippets'] },
  { name: 'klezmer', bpm: [90, 150], instruments: ['clarinet', 'violin', 'accordion', 'tuba', 'frame drum'], moods: ['jubilant', 'bittersweet', 'frenetic'], vocals: ['instrumental', 'group vocals'] },
  { name: 'qawwali', bpm: [80, 120], instruments: ['harmonium', 'tabla', 'handclaps', 'dholak'], moods: ['ecstatic', 'devotional', 'building'], vocals: ['lead vocal with chorus responses', 'soaring male vocal'] },
  { name: 'highlife', bpm: [100, 130], instruments: ['interlocking guitars', 'horn section', 'congas', 'bright bass'], moods: ['sunny', 'celebratory', 'easy'], vocals: ['group vocals', 'smooth male vocal'] },
  { name: 'cumbia', bpm: [85, 105], instruments: ['accordion', 'güira scraper', 'bass drum', 'electric guitar'], moods: ['danceable', 'warm', 'nostalgic'], vocals: ['male vocal', 'call-and-response'] },
  { name: 'post-rock', bpm: [70, 140], instruments: ['clean delayed guitars', 'slow-building drums', 'swelling strings', 'distorted climax guitars'], moods: ['cathartic', 'vast', 'patient'], vocals: ['instrumental', 'instrumental', 'distant spoken word'] },
  { name: 'garage rock', bpm: [130, 170], instruments: ['overdriven guitar', 'simple pounding drums', 'fuzz bass', 'tambourine'], moods: ['raw', 'snotty', 'urgent'], vocals: ['shouted male vocal', 'female vocal'] },
  { name: 'UK garage', bpm: [128, 138], instruments: ['shuffled two-step drums', 'sub bass', 'chopped vocal stabs', 'warm chords'], moods: ['bouncy', 'nocturnal', 'flirty'], vocals: ['chopped vocal samples', 'smooth female vocal', 'MC snippets'] },
  { name: 'synthwave', bpm: [95, 118], instruments: ['analog synth bass', 'gated reverb drums', 'neon arpeggios', 'saxophone lead'], moods: ['nocturnal', 'nostalgic', 'driving'], vocals: ['instrumental', 'breathy female vocal'], eras: ['80s'] },
  { name: 'baroque chamber', bpm: [60, 120], instruments: ['harpsichord', 'string quartet', 'recorder', 'viola da gamba'], moods: ['stately', 'intricate', 'melancholy'], vocals: ['instrumental', 'countertenor'] },
  { name: 'math rock', bpm: [120, 170], instruments: ['tapped guitar lines', 'odd-time drums', 'clean bass', 'glockenspiel'], moods: ['intricate', 'playful', 'restless'], vocals: ['instrumental', 'half-sung male vocal'] },
  { name: 'doom metal', bpm: [50, 80], instruments: ['downtuned riffs', 'slow crushing drums', 'feedback drone', 'organ'], moods: ['bleak', 'monolithic', 'funereal'], vocals: ['bellowed male vocal', 'instrumental', 'clean mournful vocal'] },
  { name: 'salsa', bpm: [150, 190], instruments: ['piano montuno', 'timbales', 'congas', 'horn section', 'bass tumbao'], moods: ['fiery', 'celebratory', 'sweaty'], vocals: ['lead sonero with coro', 'group vocals'] },
  { name: 'french chanson', bpm: [70, 120], instruments: ['accordion', 'nylon guitar', 'upright bass', 'brushed drums'], moods: ['wistful', 'romantic', 'wry'], vocals: ['expressive female vocal', 'spoken-sung male vocal'] },
  { name: 'vaporwave', bpm: [60, 90], instruments: ['pitched-down samples', 'lush 80s pads', 'gated snare', 'chorused bass'], moods: ['hazy', 'uncanny', 'nostalgic'], vocals: ['slowed vocal samples', 'instrumental'] }
]
/** What a track is for, and the genres that actually suit it. Left to pick freely this shape
 *  produced "music for a meditation app, 80s power ballad"; the fit is a curatorial judgement, not
 *  something two numbers derive, so each use carries its own shortlist. A test checks every name
 *  here still exists in GENRES, so renaming a genre cannot quietly break the pairing. */
export const USE_CASES: readonly (readonly [string, readonly string[]])[] = [
  ['a title sequence', ['cinematic orchestral', 'synthwave', 'trip-hop', 'post-rock', 'jazz trio', 'city pop', 'baroque chamber']],
  ['a rainy commute', ['lo-fi hip hop', 'trip-hop', 'ambient', 'shoegaze', 'minimal piano', 'jazz trio', 'vaporwave', 'post-rock']],
  ['a cooking video', ['bossa nova', 'highlife', 'soul', 'city pop', 'afrobeats', 'cumbia', 'reggae', 'french chanson']],
  ['a late-night study session', ['lo-fi hip hop', 'ambient', 'minimal piano', 'new age', 'vaporwave', 'jazz trio', 'post-rock']],
  ['a travel montage', ['indie rock', 'afrobeats', 'highlife', 'synth-pop', 'disco', 'city pop', 'bluegrass', 'cumbia']],
  ['a boss fight', ['metal', 'doom metal', 'techno', 'drum and bass', 'trap', 'chiptune', 'cinematic orchestral', 'math rock']],
  ['a wedding first dance', ['soul', 'country ballad', 'acoustic folk-pop', '80s power ballad', 'bossa nova', 'jazz trio', 'french chanson', 'gospel']],
  ['a meditation app', ['ambient', 'new age', 'minimal piano', 'baroque chamber']],
  ['a podcast intro', ['lo-fi hip hop', 'deep house', 'synth-pop', 'indie rock', 'disco', 'city pop', 'UK garage', 'chiptune']],
  ['closing credits', ['post-rock', 'cinematic orchestral', 'minimal piano', 'soul', 'acoustic folk-pop', 'ambient', 'french chanson']],
  ['a runway show', ['techno', 'deep house', 'UK garage', 'trap', 'synthwave', 'disco', 'city pop']],
  ['a road trip playlist', ['indie rock', 'country ballad', 'bluegrass', 'garage rock', 'soul', 'synth-pop', 'ska', 'highlife']],
  ['a training montage', ['pop-punk', 'metal', 'trap', 'techno', 'disco', 'drum and bass', 'chiptune', 'garage rock']],
  ['a funeral scene', ['minimal piano', 'cinematic orchestral', 'gospel', 'ambient', 'baroque chamber', 'post-rock']],
  ['a product launch film', ['synth-pop', 'deep house', 'cinematic orchestral', 'ambient', 'post-rock', 'city pop', 'UK garage']],
  ['a village festival', ['klezmer', 'highlife', 'cumbia', 'salsa', 'bluegrass', 'ska', 'flamenco', 'qawwali', 'gospel']],
  ['a heist getaway', ['techno', 'drum and bass', 'trip-hop', 'disco', 'city pop', 'garage rock', 'UK garage', 'synthwave']],
  ['an ice rink at night', ['synthwave', 'ambient', 'minimal piano', 'city pop', 'vaporwave', 'shoegaze', 'baroque chamber']],
  ['a nature documentary', ['cinematic orchestral', 'ambient', 'minimal piano', 'new age', 'post-rock', 'baroque chamber']],
  ['a dive bar at closing time', ['garage rock', 'country ballad', 'soul', 'jazz trio', 'ska', 'french chanson', 'trip-hop']]
]
export const GENRE_BY_NAME = new Map(GENRES.map((g) => [g.name, g]))
const PRODUCTION = ['heavily compressed and loud', 'lo-fi bedroom production', 'lush studio production with wide stereo', 'drenched in plate reverb', 'tape-saturated', 'crisp modern mix with deep low end']
/** Only for music people actually play in a room: a sample-built genre is not close-miked. */
const LIVE_PRODUCTION = ['recorded live in one room', 'sparse and dry, close-miked', 'one take, room mics up']
const ELECTRONIC = new Set(['deep house', 'techno', 'trap', 'drum and bass', 'UK garage', 'synthwave', 'vaporwave', 'chiptune', 'lo-fi hip hop', 'ambient'])
const productionFor = (g: Genre): string => r(ELECTRONIC.has(g.name) ? PRODUCTION : [...PRODUCTION, ...LIVE_PRODUCTION])

function bpmIn(g: Genre): number { return g.bpm[0] + Math.floor(Math.random() * (g.bpm[1] - g.bpm[0] + 1)) }
/** Genres that work as a bed rather than as a song. They only cross with music that leaves room for
 *  a bed: "ambient crossed with 80s power ballad" is two records playing at once. */
export const ATMOSPHERIC = new Set(['ambient', 'new age', 'minimal piano', 'baroque chamber', 'vaporwave'])
export const BED_FRIENDLY = new Set([...ATMOSPHERIC, 'post-rock', 'shoegaze', 'trip-hop', 'lo-fi hip hop', 'doom metal', 'techno', 'dub', 'cinematic orchestral', 'synthwave', 'deep house'])
/** Two genres fuse only when the tempo ranges overlap — so the bpm is honest for both names — and
 *  when neither is a bed genre paired with something that has no room for one. */
function fuses(a: Genre, b: Genre): boolean {
  if (a.name === b.name) return false
  if (a.bpm[0] > b.bpm[1] || a.bpm[1] < b.bpm[0]) return false
  if (ATMOSPHERIC.has(a.name) && !BED_FRIENDLY.has(b.name)) return false
  if (ATMOSPHERIC.has(b.name) && !BED_FRIENDLY.has(a.name)) return false
  return true
}
function fusionPair(): { a: Genre; b: Genre; bpm: number } | null {
  const a = r(GENRES)
  const options = GENRES.filter((g) => fuses(a, g))
  if (!options.length) return null
  const b = r(options)
  const lo = Math.max(a.bpm[0], b.bpm[0]), hi = Math.min(a.bpm[1], b.bpm[1])
  return { a, b, bpm: lo + Math.floor(Math.random() * (hi - lo + 1)) }
}

const MUSIC_SHAPES: readonly (readonly [number, () => { text: string; bpm: number; key: string }])[] = [
  // Genre-led, the familiar shape.
  [40, () => { const g = r(GENRES); const parts = [g.eras && maybe(0.6) ? `${r(g.eras)} ${g.name}` : g.name, ...some(g.instruments, 2 + Math.floor(Math.random() * 2)), r(g.moods), r(g.vocals)]
    return { text: parts.join(', '), bpm: bpmIn(g), key: g.name } }],
  // Written as a brief: what the track is for.
  [18, () => { const [use, names] = r(USE_CASES)
    const pool = names.map((n) => GENRE_BY_NAME.get(n)).filter((g): g is Genre => Boolean(g))
    const g = r(pool.length ? pool : GENRES)
    const parts = [`music for ${use}`, g.name, ...some(g.instruments, 2), r(g.moods), r(g.vocals)]
    return { text: parts.join(', '), bpm: bpmIn(g), key: g.name } }],
  // Two genres crossed, tempos permitting.
  [16, () => { const f = fusionPair(); if (!f) { const g = r(GENRES); return { text: [g.name, ...some(g.instruments, 2), r(g.moods), r(g.vocals)].join(', '), bpm: bpmIn(g), key: g.name } }
    const lead = r(f.a.instruments); const second = r(f.b.instruments.filter((i) => i !== lead)) ?? r(f.b.instruments)
    const parts = [`${f.a.name} crossed with ${f.b.name}`, lead, second, r(f.a.moods), r(maybe(0.5) ? f.a.vocals : f.b.vocals)]
    return { text: parts.join(', '), bpm: f.bpm, key: `${f.a.name}+${f.b.name}` } }],
  // Led by the instrument doing the work.
  [14, () => { const g = r(GENRES); const lead = r(g.instruments)
    const parts = [`${lead}-led ${g.name}`, ...some(g.instruments.filter((i) => i !== lead), 2), r(g.moods), r(g.vocals)]
    return { text: parts.join(', '), bpm: bpmIn(g), key: g.name } }],
  // The same genre, but described by how it was recorded.
  [12, () => { const g = r(GENRES); const parts = [g.name, ...some(g.instruments, 2), productionFor(g), r(g.moods), r(g.vocals)]
    return { text: parts.join(', '), bpm: bpmIn(g), key: g.name } }]
]
export function musicIdea(): { text: string; bpm: number } {
  const v = fresh('music', () => weighted(MUSIC_SHAPES)(), (x) => x.key)
  return { text: v.text, bpm: v.bpm }
}

/* ------------------------------------------------------------------ lyrics */
const THEME_SUBJECTS = ['a small harbour town', 'driving home at 2 a.m.', 'the first snow of the year', 'someone who moved across the ocean', 'a dog waiting by the door', 'quitting a job', 'a city that never gets dark', 'dancing in the kitchen on a Tuesday', 'an old photograph in a coat pocket', 'summer ending too soon', 'a lighthouse keeper', 'learning to say no', 'a train through the mountains', 'a friend who always shows up', 'the last night before moving out', 'a letter never sent', 'a garden your grandmother planted', 'a diner at 4 a.m.', 'a lake you swam in as a kid', 'the sound of rain on a tin roof', 'a bicycle left in the snow', 'a promise made at sixteen', 'a bus that never came', 'the smell of a bakery at dawn', 'a stranger who returned your wallet', 'a house with the lights still on', 'a river that changed course', 'a phone call you kept avoiding', 'an airport at midnight', 'a wedding in the rain', 'the week the factory closed', 'a name you stopped saying out loud', 'teaching someone to swim', 'the last bus across the bridge', 'a radio station that only plays at night', 'a coat that still smells like them', 'the summer everyone left town', 'a boat you never finished building', 'the neighbour who fed the strays', 'moving a piano up three flights', 'a power cut that lasted three days', 'the year you learned to cook', 'a scar and the story behind it', 'a jar of coins for something better', 'the dog that found its way home', 'a map folded the wrong way', 'someone singing in the next flat', 'a field that used to be a school']
const THEME_ANGLES = ['and what it taught you', 'and how it still feels', 'told as a goodbye', 'told as a thank-you', 'from the other person\'s point of view', 'as a promise to come back', 'as a warning', 'as a celebration', 'years later', 'in the present tense, tonight', 'as a list of small things', 'as a question never answered', 'told by someone who was not there', 'as an apology that arrives too late', 'as advice to a younger self']
const LYRIC_FORMS = ['with a chorus that repeats one line', 'as a call and response', 'with a spoken bridge', 'with no chorus, just verses that build', 'with a chorus that changes meaning each time', 'as a duet between two people who disagree', 'with the last verse answering the first']
export function lyricIdea(): string {
  if (maybe(0.1)) return '[instrumental]'
  // The subject is drawn inside the generator, not outside it: picking it first would hand fresh()
  // the same subject on every retry, and the history could never reject anything.
  return fresh('lyrics', () => {
    const subject = r(THEME_SUBJECTS)
    const bits = [`a song about ${subject}`]
    if (maybe(0.6)) bits.push(r(THEME_ANGLES))
    if (maybe(0.3)) bits.push(r(LYRIC_FORMS))
    return { text: bits.join(' '), subject }
  }, (v) => v.subject).text
}

/** Approximate distinct-combination counts, for the README and the test. */
const mediaCount = ALL_MEDIA.length
export const IDEA_SPACE = {
  image: ((PEOPLE.length + VIGNETTES.length) * ACTIONS.length * (INDOORS.length + OUTDOORS.length) * LIGHT.length * mediaCount)
    + (ANIMALS.length * LAND_ACTS.length * (WILD.length + WATER_PLACES.length) * LIGHT.length * mediaCount)
    + (PLACES.length * LIGHT.length * LENS.length * mediaCount)
    + (OBJECTS.length * SURFACES.length * LIGHT.length * (PHOTO_MEDIA.length + PAINT_MEDIA.length))
    + (GENRE_SCENES.length * LIGHT.length * mediaCount * MOOD.length)
    + (POSTER_BRIEFS.length * PALETTE.length * GRAPHIC_MEDIA.length),
  edit: EDIT_OPS.length * 14 * (EDIT_OPS.length * 14),
  music: GENRES.reduce((n, g) => n + (g.bpm[1] - g.bpm[0] + 1) * g.instruments.length * g.moods.length * g.vocals.length, 0)
    * (1 + USE_CASES.length / 4 + (PRODUCTION.length + LIVE_PRODUCTION.length) / 4),
  lyrics: THEME_SUBJECTS.length * (THEME_ANGLES.length + 1) * (LYRIC_FORMS.length + 1) + 1
}
