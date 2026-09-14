/** Pre-canned starting points. Short on purpose: Gemma expands them when Enrich is on. */
export const SUGGESTIONS = {
  image: [
    'a woman with curly hair at a sunny harbor, pastel houses behind',
    'a lighthouse on a rocky cliff at dusk, waves below',
    'a red vintage bicycle leaning on a stone wall in Provence, lavender field behind',
    'a cozy cabin in snowy woods at night, warm light in the windows',
    'a street food stall in Tokyo at night, neon reflections in the rain',
    'an old fisherman mending nets on a wooden pier at sunrise',
    'a golden retriever puppy asleep in a sunbeam on a kitchen floor',
    'a desert highway at golden hour, a single classic car in the distance',
    'a greenhouse full of tropical plants, light streaming through glass',
    'a barista pouring latte art in a small brick café',
    'a mountain lake perfectly still at dawn, mist over the water',
    'a child flying a kite on a windy beach, long shadows',
    'a night market in Marrakech, lanterns and spice piles',
    'an astronaut relaxing in a lawn chair on the moon, Earth rising',
    'a rainy Paris street from a café window, umbrellas passing',
    'a jazz trumpeter on a dim stage, single spotlight, smoke',
    'a farmhouse kitchen table with fresh bread and tomatoes, morning light',
    'a surfer walking out of the ocean at sunset, board under arm',
    'a fox in a snowy birch forest looking straight at the camera',
    'a vintage record shop interior, crates of vinyl, afternoon light'
  ],
  edit: [
    'change the jacket to red, keep everything else the same',
    'make it golden hour with warm sunset light',
    'turn the sky into a dramatic stormy one',
    'give them sunglasses',
    'make it a rainy evening with wet reflections',
    'change the season to autumn with orange leaves',
    'add gentle falling snow',
    'make the background a quiet beach at dusk',
    'change the hair color to silver',
    'convert to a black and white film photograph',
    'add a small dog sitting beside them',
    'make it nighttime with city lights behind',
    'give the scene a soft pastel color palette',
    'replace the background with a mountain lake',
    'add a warm knitted scarf'
  ],
  musicStyle: [
    'warm acoustic folk-pop with a gentle female vocal',
    'chill lo-fi hip hop for studying, dusty drums, warm Rhodes piano',
    'upbeat synth-pop with a driving bassline and bright female vocals',
    'slow late-night jazz trio, brushed drums, upright bass, piano',
    'anthemic indie rock, jangly guitars, big chorus, male vocal',
    'cinematic orchestral build, strings and taiko drums, no vocals',
    'sunny reggae groove, offbeat guitar, warm bass, laid-back male vocal',
    'dreamy shoegaze, washed-out guitars, whispered vocals',
    'classic country ballad, pedal steel, acoustic guitar, storytelling vocal',
    'deep house, four-on-the-floor, filtered chords, soulful vocal chops',
    'bossa nova, nylon guitar, soft percussion, intimate vocal',
    '80s power ballad, gated drums, big synths, soaring vocal',
    'minimal piano and cello, melancholic, instrumental',
    'funky disco, slap bass, horns, group vocals',
    'ambient drone with soft field recordings, instrumental'
  ],
  lyrics: [
    'a song about staying one more day in a small harbor town',
    'a song about driving home at 2 a.m. with the windows down',
    'a song about the first snow of the year',
    'a song about missing someone who moved across the ocean',
    'a song about a dog waiting by the door',
    'a song about quitting a job and feeling free',
    'a song about a city that never gets dark',
    'a song about dancing in the kitchen on a Tuesday',
    'a song about an old photograph found in a coat pocket',
    'a song about summer ending too soon',
    '[instrumental]',
    'a song about a lighthouse keeper who talks to the sea',
    'a song about learning to say no',
    'a song about a train journey through the mountains',
    'a song about a friend who always shows up'
  ]
} as const
export type SuggestionKind = keyof typeof SUGGESTIONS

export function pick(kind: SuggestionKind, not?: string): string {
  const list = SUGGESTIONS[kind] as readonly string[]
  const pool = list.filter((s) => s !== not)
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0]!
}
