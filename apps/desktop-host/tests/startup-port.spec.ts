import { createServer, type Server } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'

const startup = vi.hoisted(() => ({ urls: [] as string[] }))
const servers: Server[] = []
const originalArgv = process.argv
const originalListeners = {
  message: new Set(process.listeners('message')),
  disconnect: new Set(process.listeners('disconnect')),
}

vi.mock('@deepseek-ai/dsh-app-boot', () => ({
  loadLayeredEnv: () => ({}),
  loadProfileDirectory: () => ({}),
  reportSkippedBundles: () => {},
}))
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ resolveDshHome: () => '/isolated-home' }))
vi.mock('../src/office-engine.ts', () => ({ installOfficeEngineResolution: () => {} }))
vi.mock('../src/office.ts', () => ({}))
vi.mock('../src/update-tasks.ts', () => ({ installDesktopUpdateTaskControl: () => () => false }))
vi.mock('../src/quit-inspection.ts', () => ({ installDesktopQuitInspection: () => () => ({ activeTasks: false, scheduledTasks: false }) }))
vi.mock('../src/platform-session.ts', () => ({ installPlatformSessionPublisher: () => {} }))
vi.mock('@deepseek-ai/dsh/profile-boot', () => ({
  runProfile: async (options: { args: string[] }) => {
    const port = Number(options.args[options.args.indexOf('--port') + 1])
    expect(port).toBe(0)
    const server = createServer((_, response) => { response.end('owned desktop') })
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TCP listener required')
    return {
      ctx: {
        plugin: async () => {},
        webServer: { port: address.port, collectIndexInjections: () => [] },
        connection: { authenticatedUrl: (url: string) => { startup.urls.push(url); return url } },
      },
      shutdown: { shutdown: async () => {} },
    }
  },
}))

afterEach(async () => {
  process.argv = originalArgv
  for (const listener of process.listeners('message'))
    if (!originalListeners.message.has(listener)) process.removeListener('message', listener)
  for (const listener of process.listeners('disconnect'))
    if (!originalListeners.disconnect.has(listener)) process.removeListener('disconnect', listener)
  for (const server of servers.splice(0)) {
    if (server.listening) await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve() })
      server.closeAllConnections()
    })
  }
  startup.urls.length = 0
})

it('starts two desktop hosts on different system-assigned ports and reports their actual addresses', async () => {
  process.argv = ['node', 'desktop-host', '/runtime', '/profile']
  const { main } = await import('../src/index.ts')
  await Promise.all([main(), main()])
  expect(startup.urls).toHaveLength(2)
  expect(new Set(startup.urls).size).toBe(2)
  for (const url of startup.urls) {
    expect(new URL(url).hostname).toBe('127.0.0.1')
    expect(await (await fetch(url)).text()).toBe('owned desktop')
  }
})
