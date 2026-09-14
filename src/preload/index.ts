import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENT_CHANNELS, type IpcChannel, type IpcEventChannel } from '../shared/ipc'

const bridge = {
  invoke(channel: IpcChannel, ...args: unknown[]): Promise<unknown> { return ipcRenderer.invoke(channel, ...args) },
  on(channel: IpcEventChannel, listener: (payload: unknown) => void): () => void {
    if (!IPC_EVENT_CHANNELS.includes(channel)) throw new Error(`Unknown event channel: ${channel}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  platform: process.platform
}
contextBridge.exposeInMainWorld('lite', bridge)
