import { describe, expect, it, vi } from 'vitest'
import { DesktopRestartUpdate, type DesktopHostUpdateResult } from '../src/restart-update.ts'

function setup() {
  const events: string[] = []
  const operation = vi.fn(async (request: { action: string }): Promise<DesktopHostUpdateResult> => {
    events.push(request.action)
    if (request.action === 'plugins-install') return { ok: true, value: { operationId: 'one' } }
    if (request.action === 'plugins-status') return { ok: true, value: { operationId: 'one', state: 'ready' } }
    return { ok: true, value: {} }
  })
  const host = { updateTasks: vi.fn(async () => { events.push('lock'); return true }), updateOperation: operation }
  const download = vi.fn(async () => { events.push('download'); return { phase: 'ready', version: '2.0.0' } as const })
  const install = vi.fn(async () => { events.push('install'); return { phase: 'installing' } as const })
  const stop = vi.fn(async () => { events.push('stop') })
  const wait = vi.fn(async () => {})
  const progress = vi.fn()
  const restart = new DesktopRestartUpdate({
    host: () => host, state: () => ({ phase: 'available', version: '2.0.0' }), download, install,
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
  waiting.resolve(undefined)
  await pending
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
