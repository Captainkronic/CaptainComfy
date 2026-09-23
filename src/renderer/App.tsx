import type { JSX } from 'react'
import { useEffect } from 'react'
import { useStore } from './state/store'
import ImageForm from './components/ImageForm'
import MusicForm from './components/MusicForm'
import EditForm from './components/EditForm'
import JobList from './components/JobList'
import { call } from './lib'
import SettingsPanel from './components/SettingsPanel'
import { isLoopback } from '@shared/net'

export default function App(): JSX.Element {
  const { tab, setTab, boot, health, refreshHealth } = useStore()
  useEffect(() => { void boot() }, [boot])
  return (
    <div className="app">
      <div className="titlebar">
        <div className="tabs">
          {([['image', 'Image'], ['edit', 'Edit'], ['music', 'Music'], ['settings', 'Settings']] as const).map(([k, label]) => (
            <button key={k} data-tab={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="health" title={`${health?.comfy.detail ?? ''}\n${health?.omlx.detail ?? ''}`}>
          <span>{health ? (isLoopback(health.comfy.host) ? 'this Mac' : 'Studio') : ''}</span>
          <span><i className={`dot ${health ? (health.comfy.up ? 'ok' : 'bad') : ''}`} />ComfyUI</span>
          <span><i className={`dot ${health ? (health.omlx.up ? 'ok' : 'bad') : ''}`} />Gemma</span>
        </div>
      </div>
      <div className="main">
        <div className="form">
          {health && !health.comfy.up && tab !== 'settings' && (
            <div className="banner">
              <span>{isLoopback(health.comfy.host) ? 'ComfyUI is not running.' : `ComfyUI on the Studio is not answering (${health.comfy.host}).`}</span>
              <button className="btn" onClick={() => { void call('comfy:start').then(() => refreshHealth()) }}>{isLoopback(health.comfy.host) ? 'Start it' : 'Start it on the Studio'}</button>
            </div>
          )}
          {tab === 'image' ? <ImageForm /> : tab === 'edit' ? <EditForm /> : tab === 'music' ? <MusicForm /> : <SettingsPanel />}
        </div>
        {tab === 'settings' ? <div className="results"><div className="empty">Settings apply immediately. Jobs already queued keep running where they were sent.</div></div> : <JobList kind={tab} />}
      </div>
    </div>
  )
}
