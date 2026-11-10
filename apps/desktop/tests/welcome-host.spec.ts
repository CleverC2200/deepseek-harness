/** Native onboarding reuses authenticated Web RPC and never reads credential values. */
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { authenticateWebHost } from '../src/web-document.ts'
import { connectDesktopWelcome } from '../src/welcome-backend.ts'

function transport(preference?: string) {
  const keys = new Map<string, string>()
  const namespaces = [
    { ns: 'llm-deepseek', value: { apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' } },
    { ns: 'llm-pi-ai', value: { profiles: { example: { apiKeyEnv: 'EXAMPLE_API_KEY' } } } },
    { ns: 'locale', value: preference === undefined ? {} : { preference } },
  ]
  const send = vi.fn<NonNullable<Parameters<typeof connectDesktopWelcome>[2]>>(async (_input, init) => {
    if (init?.method !== 'POST') return new Response('index')
    const { rpcId, method, payload } = JSON.parse(init.body as string) as {
      rpcId: string
      method: string
      payload: { args: { ref: string; value: string; refs: string[] } }
    }
    let value: unknown
    if (method === 'account/getState') value = { links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null }
    else if (method === 'settings/describe') value = { namespaces }
    else if (method === 'llm/listConfigurableProviders') value = [{ settingsNs: 'llm-pi-ai', settingsPath: ['profiles', 'example'] }]
    else if (method === 'productAnalytics/enabled') value = true
    else if (method === 'productAnalytics/report') value = undefined
    else if (method === 'credentials/set') keys.set(payload.args.ref, payload.args.value)
    else value = Object.fromEntries(payload.args.refs.map(ref => [ref, { configured: keys.has(ref), writable: true }]))
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
  })
  return { send, keys, namespaces }
}

const url = 'http://127.0.0.1:19387/?token=fixture'

describe('desktop welcome Web operations', () => {
  it('uses authenticated RPC when the Host HTTP document is unavailable', async () => {
    const host = transport('zh')
    const rpc = host.send.getMockImplementation()!
    host.send.mockImplementation(async (input, init) => init?.method === 'POST'
      ? rpc(input, init)
      : new Response(null, { status: 401 }))
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send.mock.calls.every(([input, init]) =>
      init?.method === 'POST' && !new URL(input).searchParams.has('token'))).toBe(true)
  })

  it('shares the Host cookie over real HTTP without requiring its index document', async () => {
    let authorized = true
    let exchanges = 0
    const requests: string[] = []
    const server = createServer((request, response) => {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => { body += chunk })
      request.on('end', () => {
        if (request.url === '/?token=fixture') {
          exchanges++
          response.writeHead(303, { 'set-cookie': 'session=owned; HttpOnly; SameSite=Strict', location: '/' }).end()
          return
        }
        if (!authorized || request.headers.cookie !== 'session=owned') {
          response.writeHead(401).end()
          return
        }
        if (request.url !== '/api/settings/describe' || request.method !== 'POST') {
          response.writeHead(404).end()
          return
        }
        requests.push(request.url)
        const { rpcId } = JSON.parse(body) as { rpcId: string }
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          type: 'server-response', rpcId,
          result: { ok: true, value: { namespaces: [{ ns: 'locale', value: { preference: 'zh' } }] } },
        }))
      })
    })
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('missing HTTP listener')
      const launch = `http://127.0.0.1:${address.port}/?token=fixture`
      const cookie = await authenticateWebHost(launch)
      expect((await fetch(new URL('/', launch), { headers: { cookie } })).status).toBe(404)
      const backend = await connectDesktopWelcome(launch, cookie)
      expect(await backend.readLocalePreference()).toBe('zh')
      expect(exchanges).toBe(1)
      expect(requests).toEqual(['/api/settings/describe', '/api/settings/describe'])
      authorized = false
      await expect(backend.readLocalePreference()).rejects.toThrow('Web request failed (HTTP 401)')
      await expect(connectDesktopWelcome(launch, cookie)).rejects.toThrow('Web request failed (HTTP 401)')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => { if (error) reject(error); else resolve() }))
    }
  })

  it('authenticates through Web and stores only through the configured credential reference', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    expect(host.send).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:19387/api/settings/describe', expect.objectContaining({ method: 'POST' }))
    expect(await backend.analyticsEnabled()).toBe(true)
    expect(await backend.save('sk-example')).toEqual({ ok: true })
    expect(host.keys.get('CUSTOM_DEEPSEEK_KEY')).toBe('sk-example')
    expect(await backend.read()).toEqual({ loggedIn: false, hasApiKey: true, writable: true, localePreference: null })
    for (const [input, init] of host.send.mock.calls) {
      expect(input).toMatch(/^http:\/\/127\.0\.0\.1:19387\/api\//u)
      expect(init).toMatchObject({ credentials: 'include', redirect: 'error' })
    }
  })

  it('reads the explicit language preference and recognizes another provider key', async () => {
    const host = transport('zh')
    host.keys.set('EXAMPLE_API_KEY', 'sk-other')
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    expect(await backend.read()).toMatchObject({ localePreference: 'zh', hasApiKey: true })
    host.keys.clear()
    expect(await backend.read()).toMatchObject({ hasApiKey: false })
    expect(host.send.mock.calls.every(([, init]) => !(init?.body as string | undefined)?.includes('credentials/set'))).toBe(true)
  })

  it('reads language without querying account or model providers', async () => {
    const host = transport('zh')
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    host.send.mockClear()
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send).toHaveBeenCalledOnce()
    expect(host.send.mock.calls[0]![0]).toContain('/api/settings/describe')
  })

  it('allows profiles without the official provider and retains custom key detection', async () => {
    const host = transport()
    host.namespaces.splice(0, 1)
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    expect(await backend.read()).toMatchObject({ hasApiKey: false, writable: false })
    host.keys.set('EXAMPLE_API_KEY', 'custom-key')
    expect(await backend.read()).toMatchObject({ hasApiKey: true, writable: false })
    expect(await backend.save('official-key')).toEqual({ ok: false })
    expect(host.keys.has('undefined')).toBe(false)
  })

  it.each(['', 'bad key', 'key\n'])('rejects malformed keys without contacting a provider: %s', async (value) => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    host.send.mockClear()
    expect(await backend.save(value)).toEqual({ ok: false })
    expect(host.send).not.toHaveBeenCalled()
  })

  it('keeps provider diagnostics out of failures and rejects unmatched RPC envelopes', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    host.send.mockRejectedValueOnce(new Error('private credential sk-must-not-leak'))
    expect(await backend.save('sk-example')).toEqual({ ok: false })
    host.send.mockResolvedValueOnce(Response.json({ type: 'server-response', rpcId: 'other', result: { ok: true } }))
    await expect(backend.read()).rejects.toThrow('Web RPC failed')
  })


  it('submits native analytics through authenticated RPC with a bounded request', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, 'session=owned', host.send)
    const event = { eventName: 'desktop_app_launch' as const, timestamp: 100, attributes: {} }
    await backend.report(event)
    const [input, init] = host.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/api/productAnalytics/report')
    expect(init?.credentials).toBe('include')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init!.body as string)).toMatchObject({ payload: { args: { event } } })
  })

  it('refuses an unauthenticated Web launch', async () => {
    const send = vi.fn<NonNullable<Parameters<typeof connectDesktopWelcome>[2]>>(async () => new Response(null, { status: 401 }))
    await expect(connectDesktopWelcome(url, 'session=owned', send)).rejects.toThrow('Web request failed (HTTP 401)')
  })
})
