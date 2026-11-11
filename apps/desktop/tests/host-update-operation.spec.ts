import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { dispatchDesktopUpdate } from '../../desktop-host/src/update-operation.ts'

describe('private Desktop update dispatch', () => {
  it('uses the official in-process Fetch handler at the fixed route', async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe('/api/desktop/update')
      expect(request.method).toBe('POST')
      expect(await request.json()).toEqual({ action: 'plugins-status' })
      return Response.json({ ok: true, value: { operationId: null, state: 'idle' } })
    })
    const createSharedFetchHandler = vi.fn(() => ({ fetch }))
    const result = await dispatchDesktopUpdate({ createSharedFetchHandler }, { action: 'plugins-status' })
    expect(createSharedFetchHandler).toHaveBeenCalledWith('/api')
    expect(result).toEqual({ ok: true, value: { operationId: null, state: 'idle' } })
  })
})

it('refuses the private route to ordinary HTTP even before admission is locked', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { installDesktopUpdateTaskControl } = await import('../../desktop-host/src/update-tasks.ts')
  const ctx = new Context()
  installDesktopUpdateTaskControl(ctx)
  const incoming = new IncomingMessage(new Socket())
  incoming.url = '/api/desktop/update?ignored=1'
  const response = new ServerResponse(incoming)
  const writeHead = vi.spyOn(response, 'writeHead')
  const next = vi.fn(async () => {})
  await ctx.waterfall('connection/request', incoming, response, next)
  expect(writeHead).toHaveBeenCalledWith(403)
  expect(next).not.toHaveBeenCalled()
  await ctx.fiber.dispose()
})
