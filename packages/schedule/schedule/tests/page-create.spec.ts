import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { harness } from './harness.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
async function setup() {
  const test = await harness({ onContext: ctx => contexts.push(ctx) })
  const create = vi.fn<Context['sessionController']['create']>(async request => ({
    sessionId: request.sessionId ?? SessionId('unexpected-session'),
  }))
  Object.assign(test.ctx.sessionController, { create })
  return { ...test, create }
}
const requestId = 'ec077e6f-291f-48e6-9fa6-8c263dfd7120'
const request = { requestId, title: 'Review inventory', prompt: 'Check inventory', every_seconds: 3600 }

describe('task page creation', () => {
  it('saves a task with its linked session and uses the shared catalog', async () => {
    const { service, create } = await setup()
    const result = await service.createTask(request)
    expect(result).toMatchObject({ created: true, record: {
      title: request.title, prompt: request.prompt, kind: 'every', status: 'active',
      sessionId: `schedule-session-${requestId}`,
    } })
    expect(create).toHaveBeenCalledExactlyOnceWith({ sessionId: `schedule-session-${requestId}` })
    expect(await service.catalog()).toEqual([result.created ? result.record : undefined])
  })

  it('coalesces concurrent submissions and adopts a committed task on retry', async () => {
    const { service, create } = await setup()
    const [first, second] = await Promise.all([service.createTask(request), service.createTask(request)])
    expect(first).toEqual(second)
    expect(await service.createTask({ ...request, title: 'Changed draft' })).toEqual(first)
    expect(create).toHaveBeenCalledOnce()
    expect(await service.catalog()).toHaveLength(1)
  })

  it.each([
    [{ ...request, requestId: '../../bad' }, 'invalid_selector'],
    [{ ...request, title: '' }, 'invalid_prompt'],
    [{ ...request, every_seconds: 1 }, 'frequency_too_high'],
    [{ requestId, title: 'Past', prompt: 'Check', at: '2000-01-01T00:00:00Z' }, 'not_future'],
    [{ requestId, title: 'Zone', prompt: 'Check', daily: { time: '09:00:00', time_zone: 'invalid/zone' } }, 'invalid_time_zone'],
  ] as const)('rejects invalid input before creating a session', async (input, code) => {
    const { service, create } = await setup()
    expect(await service.createTask(input)).toEqual({ created: false, code })
    expect(create).not.toHaveBeenCalled()
    expect(await service.catalog()).toEqual([])
  })

  it('preserves the task list when session creation fails and allows the same submission to recover', async () => {
    const { service, create } = await setup()
    create.mockRejectedValueOnce(new Error('session unavailable'))
    await expect(service.createTask(request)).rejects.toThrow('session unavailable')
    expect(await service.catalog()).toEqual([])
    expect((await service.createTask(request)).created).toBe(true)
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1])
  })
})
