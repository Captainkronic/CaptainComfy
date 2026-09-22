import type { JSX } from 'react'

/** A row of exclusive choices, each with a small hint line. `value` may match none (a custom setting). */
export default function Segmented<K extends string>({ options, value, onChange }: { options: Array<{ key: K; label: string; hint?: string }>; value: K | null; onChange: (k: K) => void }): JSX.Element {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={value === o.key ? 'active' : ''} onClick={() => onChange(o.key)}>
          <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  )
}
