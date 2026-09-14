import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { Settings } from '@shared/ipc'
import { isLoopback } from '@shared/net'
import { call } from '../lib'
import { useStore } from '../state/store'

export default function SettingsPanel(): JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  const [presets, setPresets] = useState<{ local: { comfyHost: string; omlxHost: string }; studio: { comfyHost: string; omlxHost: string } } | null>(null)
  const [saved, setSaved] = useState('')
  const refreshHealth = useStore((x) => x.refreshHealth)
  const health = useStore((x) => x.health)
  useEffect(() => { void call('settings:get').then(setS); void call('settings:presets').then(setPresets) }, [])
  if (!s) return <div className="empty">Loading…</div>
  const up = <K extends keyof Settings>(k: K, v: Settings[K]): void => setS({ ...s, [k]: v })
  const apply = async (patch: Partial<Settings>): Promise<void> => { const n = await call('settings:update', patch); setS(n); await refreshHealth(); setSaved('Saved'); setTimeout(() => setSaved(''), 1500) }
  return (
    <>
      <div className="field"><label>Where generation runs</label>
        <div className="row">
          <button className={`btn ${isLoopback(s.comfyHost) ? 'primary' : ''}`} onClick={() => presets && void apply({ comfyHost: presets.local.comfyHost, omlxHost: presets.local.omlxHost })}>This Mac</button>
          <button className={`btn ${!isLoopback(s.comfyHost) ? 'primary' : ''}`} onClick={() => presets && void apply({ comfyHost: presets.studio.comfyHost, omlxHost: presets.studio.omlxHost })}>Studio over Tailscale</button>
        </div>
        <div className="hint">On the MacBook pick Studio: the models never leave the Mac Studio; only prompts and results cross the tailnet.</div>
      </div>
      <div className="field"><label>ComfyUI</label><input value={s.comfyHost} onChange={(e) => up('comfyHost', e.target.value)} />
        <div className="hint">{health ? (health.comfy.up ? health.comfy.detail : `not answering: ${health.comfy.detail}`) : ''}</div></div>
      <div className="field"><label>Gemma (oMLX, OpenAI-compatible)</label><input value={s.omlxHost} onChange={(e) => up('omlxHost', e.target.value)} />
        <div className="hint">{health ? (health.omlx.up ? health.omlx.detail : `not answering: ${health.omlx.detail}`) : ''}</div></div>
      <label className="toggle"><input type="checkbox" checked={s.releaseGemma} onChange={(e) => { void apply({ releaseGemma: e.target.checked }) }} /> Load Gemma only for enrichment, release it before generating</label>
      <div className="hint">On: Gemma's ~7 GB is freed before ComfyUI loads the image or music model. Each job pays ~10 s to reload it. Off: Gemma stays resident (faster, less headroom).</div>
      <div className="field"><label>Gemma model id</label><input value={s.omlxModel} onChange={(e) => up('omlxModel', e.target.value)} /></div>
      {isLoopback(s.comfyHost) && (
        <div className="field"><label>Local ComfyUI install (only used by Start it)</label><input value={s.comfyDir} onChange={(e) => up('comfyDir', e.target.value)} />
          <div className="hint">Output dir: {s.comfyOutputDir}</div></div>
      )}
      <button className="btn primary" onClick={() => { void apply({ comfyHost: s.comfyHost, omlxHost: s.omlxHost, omlxModel: s.omlxModel, comfyDir: s.comfyDir }) }}>Save</button>
      <div className="hint">{saved}</div>
    </>
  )
}
