import { create } from 'zustand'
import type { Health, Job, Kind, Output } from '@shared/types'
type Tab = Kind | 'settings'
import { call, listen } from '../lib'

interface State {
  tab: Tab
  jobs: Job[]
  health: Health | null
  /** A result sent to the Edit tab with its Edit button; the form picks it up. */
  editSource: Output | null
  setEditSource: (o: Output | null) => void
  setTab: (t: Tab) => void
  boot: () => Promise<void>
  refreshHealth: () => Promise<void>
}
export const useStore = create<State>((set, get) => ({
  tab: 'image', jobs: [], health: null, editSource: null,
  setEditSource: (editSource) => set({ editSource }),
  setTab: (tab) => set({ tab }),
  boot: async () => {
    set({ jobs: await call('jobs:list') })
    listen('event:job', (job) => set((s) => ({ jobs: s.jobs.some((j) => j.id === job.id) ? s.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...s.jobs] })))
    listen('event:health', (health) => set({ health }))
    await get().refreshHealth()
  },
  refreshHealth: async () => set({ health: await call('health:get') })
}))
