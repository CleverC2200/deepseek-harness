import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { apply, Config } from '../src/index.ts'
import { MODEL_SELECTION_CONFIG_GLOBAL } from '../src/config.ts'

describe('model selection deployment config', () => {
  it('validates provider ids and keeps an absent filter distinct from an empty one', async () => {
    expect(Config({})).toEqual({})
    expect(Config({ visibleProviders: undefined })).toEqual({ visibleProviders: undefined })
    expect(Config({ visibleProviders: [] })).toEqual({ visibleProviders: [] })
    expect(Config({ visibleProviders: ['gea-analysis'] })).toEqual({ visibleProviders: ['gea-analysis'] })
    expect((await Config['~standard'].validate({ visibleProviders: [1] })).issues).toBeDefined()
  })

  it('projects the deployment filter and releases its injection on plugin disposal', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const fiber = ctx.plugin({ apply, Config }, { visibleProviders: ['gea-analysis'] })
    await fiber.await()
    const table: IndexInjection[] = []
    ctx.emit('webserver/index-inject', table)
    expect(table).toEqual([{ kind: 'global', name: MODEL_SELECTION_CONFIG_GLOBAL, value: { visibleProviders: ['gea-analysis'] } }])
    await fiber.dispose()
    const disposed: typeof table = []
    ctx.emit('webserver/index-inject', disposed)
    expect(disposed).toEqual([])
  })
})
