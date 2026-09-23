import type { JSX } from 'react'
import { pick, type SuggestionKind } from '@shared/suggestions'
import type { IdeaCategory } from '@shared/ideas'

/** "New idea": swap the field for a different suggestion, within the ticked categories. */
export default function Suggest({ kind, current, onPick, cats }: { kind: Exclude<SuggestionKind, 'musicStyle'>; current: string; onPick: (s: string) => void; cats?: readonly IdeaCategory[] }): JSX.Element {
  return <button type="button" className="btn ghost suggest" title="Replace with a different suggestion" onClick={() => onPick(pick(kind, current, cats))}>⟳ New idea</button>
}
