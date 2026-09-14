import type { JSX } from 'react'
import { pick, type SuggestionKind } from '@shared/suggestions'

/** "New idea": swap the field for a different pre-canned suggestion. */
export default function Suggest({ kind, current, onPick }: { kind: Exclude<SuggestionKind, 'musicStyle'>; current: string; onPick: (s: string) => void }): JSX.Element {
  return <button type="button" className="btn ghost suggest" title="Replace with a different suggestion" onClick={() => onPick(pick(kind, current))}>⟳ New idea</button>
}
