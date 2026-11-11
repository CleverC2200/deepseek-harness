/** Client-owned observation of the optional Desktop preload. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopUpdateBridge, DesktopUpdateView } from '../types.ts'

/** Owns one preload subscription across both sidebar locations. */
export class DesktopUpdateSource {
  /** Framework-observed carrier status shared by both sidebar controls. */
  readonly store = createSnapshotStore<DesktopUpdateView>({ failed: false, opening: false })
  private live = true
  private generation = 0
  private enabled = false
  private unsubscribe: (() => void) | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopUpdateBridge | undefined) {
    this.setEnabled(true)
  }

  /**
   * Start or stop observing native updates while retaining an in-flight dialog.
   * @param enabled - whether the sidebar can display the native update control.
   */
  setEnabled(enabled: boolean): void {
    if (!this.live || this.enabled === enabled) return
    this.enabled = enabled
    const generation = ++this.generation
    this.unsubscribe?.()
    this.unsubscribe = undefined
    if (!enabled) {
      this.store.set({ failed: false, opening: this.store.getSnapshot().opening })
      return
    }
    if (this.bridge === undefined) return
    let received = false
    this.unsubscribe = this.bridge.subscribe((presentation) => {
      if (!this.live || generation !== this.generation) return
      received = true
      this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    })
    void this.bridge.status().then((presentation) => {
      if (this.live && generation === this.generation && !received) {
        this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
      }
    }, () => {
      if (this.live && generation === this.generation && !received) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
  }

  /** Invoke one user action; subsequent clicks join the shell-owned operation. */
  open(): void {
    if (!this.live || !this.enabled || this.bridge === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    const generation = this.generation
    this.store.set({ ...state, opening: true })
    void this.bridge.open().catch(() => {
      if (this.live && generation === this.generation) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /** Detach the carrier and ignore any pending status or action completion. */
  dispose(): void { this.live = false; this.unsubscribe?.() }
}
