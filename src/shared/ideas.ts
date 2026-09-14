/**
 * Idea generators. Every idea is assembled from curated parts, so the vocabulary is
 * controlled ("pre-canned") but the combinations run into the tens of thousands.
 * Music genres carry their own tempo range so the bpm always fits the style.
 */
const r = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!
const maybe = (p: number): boolean => Math.random() < p

/* ------------------------------------------------------------------ images */
const SUBJECTS = ['a woman with curly hair', 'an old fisherman', 'a golden retriever puppy', 'a fox', 'a lighthouse', 'a red vintage bicycle', 'a street food vendor', 'a jazz trumpeter', 'a child flying a kite', 'a surfer', 'a barista', 'a lone hiker', 'a cat on a windowsill', 'a ballet dancer', 'a motorcyclist', 'a florist', 'an astronaut', 'a wooden sailboat', 'a steam train', 'a wild horse', 'a monk', 'a chess player', 'a skateboarder', 'a violinist', 'a snow leopard', 'a market trader', 'a lantern maker', 'a glassblower', 'twin sisters', 'a sleeping lion', 'a hot air balloon', 'a classic convertible', 'a farmhouse', 'a cabin', 'a ferris wheel', 'a bookshop', 'a greenhouse', 'a tea house', 'a bakery window', 'a diner', 'a rooftop garden', 'a canal boat', 'a lone oak tree', 'a stone bridge', 'a tide pool', 'a waterfall', 'a desert highway', 'a night market', 'a train station', 'a harbor']
const INDOOR_SETTINGS = ['in a small brick café', 'in a dim jazz club', 'in an old vinyl record shop', 'in a greenhouse full of tropical plants', 'in a quiet library', 'in a neon-lit arcade', 'in a Paris café window', 'in a cluttered artist studio', 'in a Nordic sauna by the water', 'in a subway car at rush hour', 'in a sunlit farmhouse kitchen', 'in a Moroccan riad courtyard']
const SETTINGS_ALL = ['at a sunny harbor with pastel houses', 'on a rocky cliff above the sea', 'in a snowy birch forest', 'in a rain-soaked Tokyo alley', 'in a Provence lavender field', 'on a foggy mountain lake at dawn', 'in a Marrakech souk', 'on a windy beach', 'in a small brick café', 'on a rooftop over the city at night', 'in a sunlit farmhouse kitchen', 'in a dim jazz club', 'in an old vinyl record shop', 'in a greenhouse full of tropical plants', 'on a desert highway at golden hour', 'in a quiet library', 'in a Venetian side canal', 'on a Scottish moor', 'in a neon-lit arcade', 'in a Norwegian fjord village', 'in a Tuscan vineyard', 'at a Coney Island boardwalk', 'in a Kyoto temple garden', 'in a Havana street', 'in an Icelandic lava field', 'on a Lisbon tram', 'in a Paris café window', 'at a mountain hut in the Alps', 'in a Moroccan riad courtyard', 'on a frozen lake', 'in a wheat field before a storm', 'in a Bangkok floating market', 'on a Greek island terrace', 'in a redwood grove', 'in a subway car at rush hour', 'in a cluttered artist studio', 'under a highway overpass covered in murals', 'in a Nordic sauna by the water', 'at a roadside motel at night', 'in a cherry orchard in bloom']
const OUTDOOR_ONLY = new Set(['a lighthouse', 'a red vintage bicycle', 'a child flying a kite', 'a surfer', 'a lone hiker', 'a motorcyclist', 'a wooden sailboat', 'a steam train', 'a wild horse', 'a skateboarder', 'a snow leopard', 'a hot air balloon', 'a classic convertible', 'a farmhouse', 'a cabin', 'a ferris wheel', 'a canal boat', 'a lone oak tree', 'a stone bridge', 'a tide pool', 'a waterfall', 'a desert highway', 'a night market', 'a train station', 'a harbor', 'a sleeping lion', 'a rooftop garden', 'a bookshop', 'a greenhouse', 'a tea house', 'a bakery window', 'a diner'])
const INDOOR_ONLY = new Set(['a barista', 'a chess player', 'a glassblower', 'a cat on a windowsill', 'a ballet dancer', 'a violinist'])
const OUTDOOR_SETTINGS = SETTINGS_ALL.filter((s) => !INDOOR_SETTINGS.includes(s))

const LIGHT = ['golden hour light', 'soft overcast light', 'harsh midday sun', 'blue hour glow', 'neon reflections in the rain', 'candlelight', 'a single window\'s light', 'dappled light through leaves', 'moonlight', 'stage spotlight and smoke', 'warm tungsten interior light', 'foggy diffused light', 'dramatic storm light', 'fairy lights', 'backlit rim light', 'cool morning mist', 'sunset silhouette', 'firelight', 'fluorescent light', 'dusty light beams']
const LENS = ['85mm portrait, shallow depth of field', '35mm documentary, eye level', '24mm wide, dramatic perspective', 'macro close-up', 'telephoto compression', 'low angle looking up', 'high angle looking down', 'over-the-shoulder', 'centered symmetrical composition', 'candid, slightly off-center', 'tilt-shift miniature look', 'long exposure']
const STYLE = ['cinematic photograph', 'Kodak Portra film look', 'black and white film photograph', 'oil painting', 'watercolor illustration', 'studio product shot', 'editorial fashion photograph', 'vintage postcard', 'Polaroid snapshot', 'anime key visual', 'Ghibli-style illustration', 'pencil sketch', 'ukiyo-e woodblock print', 'Art Deco poster', 'hyperrealistic render', 'children\'s book illustration', 'noir comic panel', 'National Geographic photograph', 'cyberpunk concept art', 'impressionist painting']
const MOOD = ['calm', 'joyful', 'melancholic', 'mysterious', 'tense', 'nostalgic', 'serene', 'playful', 'lonely', 'triumphant', 'cozy', 'eerie', 'romantic', 'gritty', 'dreamy']

export function imageIdea(): string {
  const subject = r(SUBJECTS)
  const setting = OUTDOOR_ONLY.has(subject) ? r(OUTDOOR_SETTINGS) : INDOOR_ONLY.has(subject) ? r(INDOOR_SETTINGS) : r(SETTINGS_ALL)
  const parts = [`${subject} ${setting}`, r(LIGHT)]
  if (maybe(0.7)) parts.push(r(LENS))
  if (maybe(0.8)) parts.push(r(STYLE))
  if (maybe(0.5)) parts.push(`${r(MOOD)} mood`)
  return parts.join(', ')
}

/* ------------------------------------------------------------------- edits */
const EDIT_OPS = [
  () => `change the ${r(['jacket', 'shirt', 'dress', 'hat', 'car', 'door', 'wall', 'sky', 'umbrella', 'scarf', 'shoes', 'sofa', 'curtains', 'bicycle'])} to ${r(['red', 'deep blue', 'emerald green', 'mustard yellow', 'white', 'black', 'pastel pink', 'burnt orange', 'lavender', 'teal', 'cream', 'burgundy'])}`,
  () => `make it ${r(['golden hour', 'a rainy evening', 'nighttime with city lights', 'a foggy morning', 'a snowy winter day', 'autumn with orange leaves', 'a hot summer afternoon', 'blue hour', 'a stormy afternoon', 'spring with cherry blossoms', 'a misty dawn', 'a clear starry night'])}`,
  () => `give them ${r(['sunglasses', 'a warm knitted scarf', 'a wide-brim hat', 'headphones', 'a bouquet of flowers', 'a coffee cup', 'an umbrella', 'a vintage camera', 'a leather jacket', 'a paper lantern', 'a book', 'a bright yellow raincoat', 'a guitar', 'a birthday cake'])}`,
  () => `add ${r(['gentle falling snow', 'a small dog', 'birds in the sky', 'string lights', 'a distant sailboat', 'steam rising from a cup', 'fireflies', 'a rainbow', 'blowing leaves', 'a cat asleep nearby', 'balloons', 'a full moon', 'soft rain', 'a cup of tea on the table'])}`,
  () => `replace the background with ${r(['a quiet beach at dusk', 'a mountain lake', 'a neon city street', 'a wheat field', 'a snowy forest', 'a Mediterranean harbor', 'a desert at night', 'a cozy library', 'a rooftop garden', 'a foggy pier', 'a Japanese garden', 'a stadium at night', 'a plain studio backdrop', 'an old European square'])}`,
  () => `change the hair to ${r(['silver', 'short and curly', 'long and straight', 'auburn', 'platinum blonde', 'a braided updo', 'jet black', 'soft waves', 'a buzz cut', 'copper red', 'a high ponytail', 'shoulder-length with bangs'])}`,
  () => `convert to ${r(['a black and white film photograph', 'a watercolor painting', 'an oil painting', 'a pencil sketch', 'a vintage postcard', 'an anime illustration', 'a Polaroid snapshot', 'a comic book panel', 'a claymation still', 'a stained glass window', 'a charcoal drawing', 'a 1970s film still'])}`,
  () => `give the scene ${r(['a soft pastel palette', 'warm sepia tones', 'cool cinematic teal and orange', 'high contrast dramatic lighting', 'a dreamy soft glow', 'muted film colors', 'vivid saturated colors', 'a cold blue tint', 'golden warm tones', 'a faded vintage look'])}`,
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
  { name: 'ska', bpm: [140, 180], instruments: ['upstroke guitar', 'walking bass', 'horn section', 'organ'], moods: ['bouncy', 'cheeky', 'sunny'], vocals: ['shouty male vocal', 'group vocals'] }
]
export function musicIdea(): { text: string; bpm: number } {
  const g = r(GENRES)
  const bpm = g.bpm[0] + Math.floor(Math.random() * (g.bpm[1] - g.bpm[0] + 1))
  const ins = [...g.instruments].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
  const parts = [g.eras && maybe(0.6) ? `${r(g.eras)} ${g.name}` : g.name, ...ins, r(g.moods), r(g.vocals)]
  return { text: parts.join(', '), bpm }
}

/* ------------------------------------------------------------------ lyrics */
const THEME_SUBJECTS = ['a small harbor town', 'driving home at 2 a.m.', 'the first snow of the year', 'someone who moved across the ocean', 'a dog waiting by the door', 'quitting a job', 'a city that never gets dark', 'dancing in the kitchen on a Tuesday', 'an old photograph in a coat pocket', 'summer ending too soon', 'a lighthouse keeper', 'learning to say no', 'a train through the mountains', 'a friend who always shows up', 'the last night before moving out', 'a letter never sent', 'a garden your grandmother planted', 'a diner at 4 a.m.', 'a lake you swam in as a kid', 'the sound of rain on a tin roof', 'a bicycle left in the snow', 'a promise made at sixteen', 'a bus that never came', 'the smell of a bakery at dawn', 'a stranger who returned your wallet', 'a house with the lights still on', 'a river that changed course', 'a phone call you kept avoiding', 'an airport at midnight', 'a wedding in the rain']
const THEME_ANGLES = ['and what it taught you', 'and how it still feels', 'told as a goodbye', 'told as a thank-you', 'from the other person\'s point of view', 'as a promise to come back', 'as a warning', 'as a celebration', 'years later', 'in the present tense, tonight']
export function lyricIdea(): string {
  if (maybe(0.12)) return '[instrumental]'
  return maybe(0.55) ? `a song about ${r(THEME_SUBJECTS)} ${r(THEME_ANGLES)}` : `a song about ${r(THEME_SUBJECTS)}`
}

/** Approximate distinct-combination counts, for the README and the test. */
export const IDEA_SPACE = {
  image: SUBJECTS.length * SETTINGS_ALL.length * LIGHT.length * STYLE.length,
  edit: EDIT_OPS.length * 12 * (EDIT_OPS.length * 12),
  music: GENRES.reduce((n, g) => n + (g.bpm[1] - g.bpm[0] + 1) * g.instruments.length * g.moods.length * g.vocals.length, 0),
  lyrics: THEME_SUBJECTS.length * (THEME_ANGLES.length + 1) + 1
}
