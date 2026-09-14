import type { IpcApi, IpcChannel, IpcEventChannel, IpcEvents } from '@shared/ipc'
declare global {
  interface Window {
    lite: {
      invoke(channel: IpcChannel, ...args: unknown[]): Promise<unknown>
      on(channel: IpcEventChannel, listener: (payload: unknown) => void): () => void
      platform: string
    }
  }
}
export function call<K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>): ReturnType<IpcApi[K]> {
  return window.lite.invoke(channel, ...args) as ReturnType<IpcApi[K]>
}
export function listen<K extends IpcEventChannel>(channel: K, fn: (payload: IpcEvents[K]) => void): () => void {
  return window.lite.on(channel, (p) => fn(p as IpcEvents[K]))
}
