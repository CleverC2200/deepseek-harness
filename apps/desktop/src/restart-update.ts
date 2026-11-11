import type { DesktopUpdateState } from './ipc.ts'

export type DesktopRestartUpdateRequest =
  | { kind: 'desktop'; version: string }
  | { kind: 'plugins'; plans: { packageName: string; planId: string }[] }
  | { kind: 'plugins-restart' }

export type DesktopHostUpdateRequest =
  | { action: 'plugins-install'; plans: { packageName: string; planId: string }[] }
  | { action: 'plugins-status'; operationId?: string }
  | { action: 'desktop-prepare'; desktopVersion: string }
  | { action: 'desktop-cancel' }

export type DesktopHostUpdateResult = { ok: true; value: unknown } | { ok: false; error: { code: string } }

export function parseDesktopHostUpdateResult(input: unknown): DesktopHostUpdateResult | undefined {
  if (typeof input !== 'object' || input === null || !('ok' in input)) return undefined
  if (input.ok === true && 'value' in input) return { ok: true, value: input.value }
  if (input.ok === false && 'error' in input && typeof input.error === 'object' && input.error !== null
    && 'code' in input.error && typeof input.error.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(input.error.code)) {
    return { ok: false, error: { code: input.error.code } }
  }
  return undefined
}

function text(value: unknown, max = 200): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value) }
function keys(value: object, names: string[]): boolean { return Object.keys(value).every(key => names.includes(key)) }
function parse(input: unknown): DesktopRestartUpdateRequest {
  if (typeof input !== 'object' || input === null || !('kind' in input)) throw new Error('desktop update: invalid request')
  if (input.kind === 'plugins-restart' && keys(input, ['kind'])) return { kind: input.kind }
  if (input.kind === 'desktop' && keys(input, ['kind', 'version']) && 'version' in input && text(input.version)) return { kind: input.kind, version: input.version }
  if (input.kind === 'plugins' && keys(input, ['kind', 'plans']) && 'plans' in input && Array.isArray(input.plans)
    && input.plans.length > 0 && input.plans.length <= 100) {
    const plans = input.plans.map((plan: unknown) => {
      if (typeof plan !== 'object' || plan === null || !keys(plan, ['packageName', 'planId'])
        || !('packageName' in plan) || !text(plan.packageName, 214) || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(plan.packageName)
        || !('planId' in plan) || !text(plan.planId)) throw new Error('desktop update: invalid plan')
      return { packageName: plan.packageName, planId: plan.planId }
    })
    if (new Set(plans.map(plan => plan.packageName)).size !== plans.length) throw new Error('desktop update: duplicate plan')
    return { kind: input.kind, plans }
  }
  throw new Error('desktop update: invalid request')
}

interface RestartDependencies {
  host(): { updateTasks(action: 'lock' | 'unlock'): Promise<boolean>; updateOperation(request: DesktopHostUpdateRequest): Promise<DesktopHostUpdateResult> } | undefined
  recoverLockedHost(): Promise<ReturnType<RestartDependencies['host']>>
  state(): DesktopUpdateState
  download(version: string): Promise<DesktopUpdateState>
  install(version: string): Promise<DesktopUpdateState>
  block(active: boolean): void
  progress(phase: 'preparing' | 'plugins' | 'desktop' | 'restarting' | 'unknown' | 'failed'): void
  stop(): Promise<void>
  relaunch(): Promise<void>
  wait(): Promise<void>
}

export class DesktopRestartUpdate {
  private paused = false
  private interrupted = Promise.withResolvers<void>()
  private recovery: Promise<void> | undefined
  private operation: { key: string; request: DesktopRestartUpdateRequest; operationId?: string; promise: Promise<void> } | undefined
  constructor(private readonly dependencies: RestartDependencies) {}
  get active(): boolean { return this.operation !== undefined }

  start(input: unknown): Promise<void> {
    const request = parse(input)
    const key = JSON.stringify(request)
    if (this.operation !== undefined) {
      if (this.operation.key !== key) throw new Error('desktop update: another operation is active')
      return this.operation.promise
    }
    if (request.kind === 'desktop' && request.version !== this.dependencies.state().version) throw new Error('desktop update: target changed')
    this.paused = false
    this.interrupted = Promise.withResolvers<void>()
    this.dependencies.block(true)
    const promise = Promise.resolve().then(() => this.run(request))
    this.operation = { key, request, promise }
    return promise
  }

  failed(): void { this.paused = true; this.interrupted.resolve(); this.dependencies.progress('unknown') }

  recover(): Promise<void> {
    if (this.recovery !== undefined) return this.recovery
    if (!this.paused) return Promise.resolve()
    this.recovery = this.doRecover().finally(() => { this.recovery = undefined })
    return this.recovery
  }

  private async doRecover(): Promise<void> {
    const current = this.operation
    if (current === undefined) return
    await current.promise.catch(() => undefined)
    this.paused = false
    try {
      const host = await this.dependencies.recoverLockedHost()
      if (this.paused) return
      if (host === undefined) { this.failed(); return }
      if (current.request.kind === 'plugins' && current.operationId === undefined) { this.failed(); return }
      const result = await host.updateOperation({ action: 'plugins-status', ...current.operationId === undefined ? {} : { operationId: current.operationId } })
      if (this.paused) return
      if (!result.ok && result.error.code === 'route-missing' && current.request.kind === 'desktop') {
        this.dependencies.progress('restarting')
        const installed = await this.dependencies.install(current.request.version)
        if (this.paused) return
        if (installed.phase !== 'installing') this.failed()
        return
      }
      if (!result.ok || typeof result.value !== 'object' || result.value === null || !('state' in result.value)) {
        this.failed(); return
      }
      if (current.operationId !== undefined && (!('operationId' in result.value) || result.value.operationId !== current.operationId)) { this.failed(); return }
      if (result.value.state === 'running' || result.value.state === 'unknown') { this.failed(); return }
      if (current.request.kind === 'desktop' && (result.value.state === 'idle' || result.value.state === 'failed')) {
        const cancelled = await host.updateOperation({ action: 'desktop-cancel' })
        if (this.paused) return
        if (!cancelled.ok && cancelled.error.code !== 'route-missing') { this.failed(); return }
      }
      if (result.value.state === 'ready') {
        if (!('operationId' in result.value) || !text(result.value.operationId)) { this.failed(); return }
        this.dependencies.progress('restarting')
        if (current.request.kind === 'desktop') {
          const installed = await this.dependencies.install(current.request.version)
          if (this.paused) return
          if (installed.phase !== 'installing') { this.failed(); return }
        }
        else {
          await this.dependencies.stop()
          if (this.paused) return
          await this.dependencies.relaunch()
        }
        return
      }
      if (result.value.state === 'idle' || result.value.state === 'failed') {
        await host.updateTasks('unlock')
        if (this.paused) return
        this.operation = undefined
        this.dependencies.block(false)
        this.dependencies.progress('failed')
        return
      }
      this.failed()
    } catch { this.failed() }
  }

  private async run(request: DesktopRestartUpdateRequest): Promise<void> {
    const host = this.dependencies.host()
    let safe = host === undefined
    try {
      if (host === undefined) throw new Error('desktop update: Host unavailable')
      this.dependencies.progress('preparing')
      await host.updateTasks('lock')
      if (this.paused) return
      safe = true
      if (request.kind === 'desktop') {
        safe = false
        const prepared = await host.updateOperation({ action: 'desktop-prepare', desktopVersion: request.version })
        if (this.paused) return
        if (!prepared.ok && prepared.error.code !== 'route-missing') {
          const status = await host.updateOperation({ action: 'plugins-status' })
          safe = status.ok && typeof status.value === 'object' && status.value !== null && 'state' in status.value
            && (status.value.state === 'idle' || status.value.state === 'failed')
          throw new Error('desktop update: preparation failed')
        }
        this.dependencies.progress('desktop')
        const current = this.dependencies.state()
        const retained = current.phase === 'ready' || (current.phase === 'error' && current.failedOperation === 'install')
        const downloaded = retained ? current : await this.dependencies.download(request.version)
        if (this.paused) return
        if (!retained && downloaded.phase !== 'ready') {
          const cancelled = await host.updateOperation({ action: 'desktop-cancel' })
          safe = cancelled.ok || (!cancelled.ok && cancelled.error.code === 'route-missing')
          throw new Error('desktop update: download failed')
        }
        this.dependencies.progress('restarting')
        const installed = await this.dependencies.install(request.version)
        if (this.paused) return
        if (installed.phase !== 'installing') throw new Error('desktop update: installation failed')
        return
      }
      let operationId: string | undefined
      if (request.kind === 'plugins') {
        safe = false
        const accepted = await host.updateOperation({ action: 'plugins-install', plans: request.plans })
        if (!accepted.ok || typeof accepted.value !== 'object' || accepted.value === null
          || !('operationId' in accepted.value) || !text(accepted.value.operationId)) throw new Error('desktop update: installation state unavailable')
        operationId = accepted.value.operationId
        if (this.operation !== undefined) this.operation.operationId = operationId
        if (this.paused) return
      }
      safe = false
      this.dependencies.progress('plugins')
      for (;;) {
        let status: DesktopHostUpdateResult
        try { status = await host.updateOperation({ action: 'plugins-status', ...operationId === undefined ? {} : { operationId } }) }
        catch { status = { ok: false, error: { code: 'host-unavailable' } } }
        if (this.paused) return
        if (status.ok && typeof status.value === 'object' && status.value !== null && 'state' in status.value
          && 'operationId' in status.value && (operationId === undefined || operationId === status.value.operationId)) {
          if ((status.value.state === 'ready' || status.value.state === 'running') && text(status.value.operationId)) {
            operationId = status.value.operationId
            if (this.operation !== undefined) this.operation.operationId = operationId
          }
          if (status.value.state === 'ready' && text(status.value.operationId)) break
          if (status.value.state === 'failed' || (request.kind === 'plugins-restart' && status.value.state === 'idle')) {
            safe = true
            throw new Error('desktop update: plugin installation failed')
          }
          if (status.value.state !== 'running') { this.failed(); return }
          this.dependencies.progress('plugins')
        } else { this.failed(); return }
        await Promise.race([this.dependencies.wait(), this.interrupted.promise])
        if (this.paused) return
      }
      this.dependencies.progress('restarting')
      await this.dependencies.stop()
      if (this.paused) return
      await this.dependencies.relaunch()
    } catch (error) {
      if (this.paused) throw error
      if (safe) {
        try { await host?.updateTasks('unlock') }
        catch { this.failed(); throw error }
        this.operation = undefined
        this.dependencies.block(false)
        this.dependencies.progress('failed')
      } else this.failed()
      throw error
    }
  }
}
