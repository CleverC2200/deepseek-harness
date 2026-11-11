import { describe, expect, it, vi } from 'vitest'
import { DesktopBackendController } from '../src/backend-controller.ts'
import { DesktopRestartUpdate, type DesktopHostUpdateRequest, type DesktopHostUpdateResult } from '../src/restart-update.ts'

function setup() {
  const events: string[] = []
  const operation = vi.fn(async (request: { action: string }): Promise<DesktopHostUpdateResult> => {
    events.push(request.action)
    if (request.action === 'plugins-install') return { ok: true, value: { operationId: 'one' } }
    if (request.action === 'plugins-status') return { ok: true, value: { operationId: 'one', state: 'ready' } }
    return { ok: true, value: {} }
  })
  const host = { updateTasks: vi.fn(async (_action: 'lock' | 'unlock') => { events.push('lock'); return true }), updateOperation: operation }
  const download = vi.fn(async () => { events.push('download'); return { phase: 'ready', version: '2.0.0' } as const })
  const install = vi.fn(async () => { events.push('install'); return { phase: 'installing' } as const })
  const stop = vi.fn(async () => { events.push('stop') })
  const wait = vi.fn(async () => {})
  const progress = vi.fn()
  const restart = new DesktopRestartUpdate({
    host: () => host, recoverLockedHost: async () => { await host.updateTasks('lock'); return host }, state: () => ({ phase: 'available', version: '2.0.0' }), download, install,
    block: (active) => { events.push(active ? 'block' : 'unblock') },
    progress, stop,
    relaunch: async () => { events.push('relaunch') }, wait,
  })
  return { restart, events, host, operation, install, stop, wait, progress }
}

describe('native restart update', () => {
  it('locks immediately and joins duplicate requests through plugin readiness and one relaunch', async () => {
    const { restart, events } = setup()
    const request = { kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] }
    const first = restart.start(request)
    expect(events).toEqual(['block'])
    expect(restart.start(request)).toBe(first)
    await first
    expect(events).toEqual(['block', 'lock', 'plugins-install', 'plugins-status', 'stop', 'relaunch'])
  })
})

it('prepares the exact desktop candidate and installs through the existing updater', async () => {
  const { restart, events } = setup()
  await restart.start({ kind: 'desktop', version: '2.0.0' })
  expect(events).toEqual(['block', 'lock', 'desktop-prepare', 'download', 'install'])
})

it('retains the native lock and never stops a writer whose status is unknown', async () => {
  const { restart, events, operation, wait, progress } = setup()
  const waiting = Promise.withResolvers<undefined>()
  wait.mockImplementationOnce(() => waiting.promise)
  operation.mockImplementation(async () => ({ ok: true, value: { operationId: 'one', state: 'unknown' } }))
  const pending = restart.start({ kind: 'plugins-restart' })
  void pending.catch(() => {})
  await vi.waitFor(() => { expect(progress).toHaveBeenCalledWith('unknown') })
  expect(restart.active).toBe(true)
  expect(events).not.toContain('stop')
  expect(events).not.toContain('unblock')
  operation.mockImplementation(async () => ({ ok: true, value: { operationId: 'one', state: 'ready' } }))
  await pending
  await restart.recover()
  waiting.resolve(undefined)
})

it.each([
  { kind: 'desktop', version: 'other' },
  { kind: 'plugins-restart', url: 'https://untrusted/' },
  { kind: 'plugins', plans: [] },
  { kind: 'plugins', plans: [{ packageName: '../escape', planId: 'one' }] },
])('refuses invalid or stale input before blocking: %j', (request) => {
  const { restart, events } = setup()
  expect(() => restart.start(request)).toThrow()
  expect(events).toEqual([])
})

it('restores ordinary operations only after a definite failed writer', async () => {
  const { restart, events, operation } = setup()
  operation.mockImplementation(async () => ({ ok: true, value: { operationId: 'one', state: 'failed' } }))
  await expect(restart.start({ kind: 'plugins-restart' })).rejects.toThrow(/failed/)
  expect(restart.active).toBe(false)
  expect(events).toContain('unblock')
  expect(events).not.toContain('stop')
})

it('never uses a different operation to recover an accepted plugin update', async () => {
  const { restart, operation, events, stop } = setup()
  stop.mockRejectedValueOnce(new Error('clean stop failed'))
  await expect(restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'plan' }] })).rejects.toThrow(/clean stop/)
  events.length = 0
  operation.mockImplementation(async () => ({ ok: true, value: { operationId: 'different', state: 'ready' } }))
  await restart.recover()
  expect(events).not.toContain('stop')
  expect(restart.active).toBe(true)
})

it('keeps ordinary Desktop installation available without a company adapter', async () => {
  const { restart, operation, install } = setup()
  operation.mockResolvedValue({ ok: false, error: { code: 'route-missing' } })
  await restart.start({ kind: 'desktop', version: '2.0.0' })
  expect(install).toHaveBeenCalledOnce()
})

it('preserves an installed company adapter failure instead of treating it as absent', async () => {
  const { restart, operation, install, events } = setup()
  operation.mockImplementation(async request => request.action === 'desktop-prepare'
    ? { ok: false, error: { code: 'source-failed' } }
    : { ok: true, value: { operationId: null, state: 'failed' } })
  await expect(restart.start({ kind: 'desktop', version: '2.0.0' })).rejects.toThrow(/preparation/)
  expect(install).not.toHaveBeenCalled()
  expect(events).toContain('unblock')
})

function backendSetup(
  replacementResult: DesktopHostUpdateResult | Promise<DesktopHostUpdateResult> = { ok: true, value: { operationId: 'accepted', state: 'ready' } },
) {
  const events: string[] = []
  const waiting = Promise.withResolvers<undefined>()
  const cleanup = Promise.withResolvers<undefined>()
  const hosts: ReturnType<typeof createHost>[] = []
  function createHost(fail: (error: Error) => void, generation: number) {
    const host = {
      fail,
      start: vi.fn(async () => { events.push(`start-${generation}`) }),
      stop: vi.fn(async () => { events.push(`stop-${generation}`); if (generation === 0) await cleanup.promise }),
      updateTasks: vi.fn(async (action: string) => { events.push(`${action}-${generation}`); return true }),
      updateOperation: vi.fn(async (request: DesktopHostUpdateRequest): Promise<DesktopHostUpdateResult> => {
        events.push(`${request.action}-${generation}`)
        return generation === 0 ? { ok: true, value: { operationId: 'accepted', state: 'running' } } : replacementResult
      }),
    }
    return host
  }
  const backend = new DesktopBackendController((fail) => {
    const host = createHost(fail, hosts.length)
    hosts.push(host)
    return host
  }, (state) => { if (state.phase === 'error') restart.failed() })
  const restart = new DesktopRestartUpdate({
    host: () => backend.host,
    recoverLockedHost: async () => { await backend.start(async () => {}); await backend.host?.updateTasks('lock'); return backend.host },
    state: () => ({ phase: 'available', version: '2.0.0' }),
    download: async () => ({ phase: 'ready' }), install: async () => ({ phase: 'installing' }),
    block: (active) => { events.push(active ? 'block' : 'unblock') },
    progress: (phase) => { events.push(phase) },
    stop: () => backend.stop(), relaunch: async () => { events.push('relaunch') },
    wait: () => waiting.promise,
  })
  return { restart, backend, hosts, waiting, cleanup, events }
}

it('rechecks the accepted update through a replacement Host after fatal cleanup and relaunches once', async () => {
  const { restart, backend, hosts, waiting, cleanup, events } = backendSetup()
  await backend.start(async () => {})
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(events).toContain('plugins-status-0') })
  hosts[0]!.fail(new Error('Host exited'))
  const recovery = restart.recover()
  expect(restart.recover()).toBe(recovery)
  await Promise.resolve()
  expect(hosts).toHaveLength(1)
  cleanup.resolve(undefined)
  await recovery
  expect(hosts).toHaveLength(2)
  expect(hosts[1]!.updateTasks).toHaveBeenCalledWith('lock')
  expect(hosts[1]!.updateOperation).toHaveBeenCalledWith({ action: 'plugins-status', operationId: 'accepted' })
  expect(events.filter(event => event === 'relaunch')).toHaveLength(1)
  expect(events).not.toContain('unblock')
  waiting.resolve(undefined)
  await pending
  await restart.recover()
  expect(events.filter(event => event === 'relaunch')).toHaveLength(1)
  expect(hosts[1]!.stop).toHaveBeenCalledOnce()
})

it('makes a communication unknown recheck actionable without leaving an older poller to restart twice', async () => {
  const { restart, backend, hosts, cleanup, waiting, events } = backendSetup()
  cleanup.resolve(undefined)
  await backend.start(async () => {})
  hosts[0]!.updateOperation.mockImplementation(async (request: DesktopHostUpdateRequest) => {
    if (request.action === 'plugins-install') return { ok: true, value: { operationId: 'accepted' } }
    throw new Error('IPC disconnected')
  })
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(events).toContain('unknown') })
  hosts[0]!.updateOperation.mockResolvedValue({ ok: true, value: { operationId: 'accepted', state: 'ready' } })
  await restart.recover()
  expect(events.filter(event => event === 'relaunch')).toHaveLength(1)
  waiting.resolve(undefined)
  await pending
  expect(events.filter(event => event === 'relaunch')).toHaveLength(1)
  expect(hosts[0]!.stop).toHaveBeenCalledOnce()
  expect(hosts[0]!.updateTasks.mock.calls).toEqual([['lock'], ['lock']])
})

it.each(['running', 'unknown', 'failed', 'different'] as const)('retains the replacement Host and blocks business until the accepted writer is definitely ended: %s', async (state) => {
  const { restart, backend, hosts, cleanup, events } = backendSetup({ ok: true, value: {
    operationId: state === 'different' ? 'another' : 'accepted', state: state === 'different' ? 'ready' : state,
  } })
  await backend.start(async () => {})
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(events).toContain('plugins-status-0') })
  hosts[0]!.fail(new Error('Host exited'))
  const recovery = restart.recover()
  cleanup.resolve(undefined)
  await recovery
  await pending
  expect(hosts[1]!.stop).not.toHaveBeenCalled()
  expect(events).not.toContain('relaunch')
  if (state === 'failed') {
    expect(restart.active).toBe(false)
    expect(hosts[1]!.updateTasks).toHaveBeenCalledWith('unlock')
    expect(events).toContain('unblock')
  } else {
    expect(restart.active).toBe(true)
    expect(hosts[1]!.updateTasks).not.toHaveBeenCalledWith('unlock')
    expect(events).not.toContain('unblock')
  }
})

it('never adopts a different journal operation when the install acceptance was lost', async () => {
  const { restart, backend, hosts, cleanup, events } = backendSetup()
  cleanup.resolve(undefined)
  await backend.start(async () => {})
  hosts[0]!.updateOperation.mockRejectedValueOnce(new Error('acceptance lost'))
  await expect(restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })).rejects.toThrow('acceptance lost')
  hosts[0]!.updateOperation.mockResolvedValue({ ok: true, value: { operationId: 'different', state: 'ready' } })
  hosts[0]!.updateOperation.mockClear()
  await restart.recover()
  expect(hosts[0]!.updateOperation).not.toHaveBeenCalled()
  expect(hosts[0]!.updateTasks).not.toHaveBeenCalledWith('unlock')
  expect(hosts[0]!.stop).not.toHaveBeenCalled()
  expect(restart.active).toBe(true)
  expect(events).not.toContain('unblock')
  expect(events).not.toContain('relaunch')
})

it('waits for the in-flight old status before recovery and ignores its late ready response', async () => {
  const { restart, backend, hosts, cleanup, events } = backendSetup()
  cleanup.resolve(undefined)
  await backend.start(async () => {})
  const oldStatus = Promise.withResolvers<DesktopHostUpdateResult>()
  hosts[0]!.updateOperation.mockImplementation(async request => request.action === 'plugins-install'
    ? { ok: true, value: { operationId: 'accepted' } } : oldStatus.promise)
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(hosts[0]!.updateOperation).toHaveBeenCalledWith({ action: 'plugins-status', operationId: 'accepted' }) })
  hosts[0]!.fail(new Error('Host exited'))
  const recovery = restart.recover()
  await Promise.resolve()
  expect(hosts).toHaveLength(1)
  oldStatus.resolve({ ok: true, value: { operationId: 'accepted', state: 'ready' } })
  await recovery
  await pending
  expect(hosts[0]!.stop).toHaveBeenCalledOnce()
  expect(hosts[1]!.stop).toHaveBeenCalledOnce()
  expect(events.filter(event => event === 'relaunch')).toHaveLength(1)
})

it('keeps takeover blocked when the failed Host cleanup cannot confirm exit', async () => {
  const { restart, backend, hosts, events } = backendSetup()
  await backend.start(async () => {})
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(events).toContain('plugins-status-0') })
  hosts[0]!.stop.mockRejectedValueOnce(new Error('cleanup failed'))
  hosts[0]!.fail(new Error('Host failed'))
  await restart.recover()
  await pending
  expect(hosts).toHaveLength(1)
  expect(hosts[0]!.stop).toHaveBeenCalledOnce()
  expect(restart.active).toBe(true)
  expect(events).not.toContain('unblock')
  expect(events).not.toContain('relaunch')
})

it('keeps a second Host failure blocked instead of relaunching from a late recovery status', async () => {
  const status = Promise.withResolvers<DesktopHostUpdateResult>()
  const { restart, backend, hosts, cleanup, events } = backendSetup(status.promise)
  cleanup.resolve(undefined)
  await backend.start(async () => {})
  const pending = restart.start({ kind: 'plugins', plans: [{ packageName: 'plugin', planId: 'approved' }] })
  await vi.waitFor(() => { expect(events).toContain('plugins-status-0') })
  hosts[0]!.fail(new Error('first Host failed'))
  const recovery = restart.recover()
  await vi.waitFor(() => { expect(events).toContain('plugins-status-1') })
  hosts[1]!.fail(new Error('replacement Host failed'))
  status.resolve({ ok: true, value: { operationId: 'accepted', state: 'ready' } })
  await recovery
  await pending
  expect(restart.active).toBe(true)
  expect(events).not.toContain('unblock')
  expect(events).not.toContain('relaunch')
  expect(hosts).toHaveLength(2)
})
