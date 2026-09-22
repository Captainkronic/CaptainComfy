import { create } from 'zustand'
import type { Health, Job, Kind } from '@shared/types'
import { defaultDraft, type CardDraft } from '@shared/card'
type Tab = Kind | 'settings'
import { call, listen } from '../lib'

interface State {
  tab: Tab
  jobs: Job[]
  health: Health | null
  /** The Card form, kept here so switching tabs never loses a half-written card; mirrored to localStorage. */
  cardDraft: CardDraft
  setTab: (t: Tab) => void
  setCardDraft: (patch: Partial<CardDraft>) => void
  boot: () => Promise<void>
  refreshHealth: () => Promise<void>
}
const DRAFT_KEY = 'captaincomfy.cardDraft'
function loadDraft(): CardDraft {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? { ...defaultDraft(), ...(JSON.parse(raw) as Partial<CardDraft>) } : defaultDraft() } catch { return defaultDraft() }
}
export const useStore = create<State>((set, get) => ({
  tab: 'image', jobs: [], health: null, cardDraft: loadDraft(),
  setTab: (tab) => set({ tab }),
  setCardDraft: (patch) => { const cardDraft = { ...get().cardDraft, ...patch }; set({ cardDraft }); try { localStorage.setItem(DRAFT_KEY, JSON.stringify(cardDraft)) } catch { /* not vital */ } },
  boot: async () => {
    set({ jobs: await call('jobs:list') })
    listen('event:job', (job) => set((s) => ({ jobs: s.jobs.some((j) => j.id === job.id) ? s.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...s.jobs] })))
    listen('event:health', (health) => set({ health }))
    await get().refreshHealth()
  },
  refreshHealth: async () => set({ health: await call('health:get') })
}))
