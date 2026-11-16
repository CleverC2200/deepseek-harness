// @vitest-environment jsdom
/** The app-wide deletion toast: one outcome store behind one overlay banner. */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  createTaskToastSource, ScheduleTaskToast,
  type TaskToastState, type ScheduleTaskToastProps,
} from '../src/client/TaskToast.tsx'
import { en, zh } from '../src/client/task-manager-locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

function mount(state: TaskToastState | null, dictionary: typeof en | typeof zh = en) {
  const dismiss = vi.fn()
  const props = {
    useToast: <T,>(select: (value: TaskToastState | null) => T): T => select(state),
    dismiss,
    t: makeTranslate(dictionary),
  } as ScheduleTaskToastProps
  return { view: render(<ScheduleTaskToast {...props} />), dismiss }
}

describe('task toast source', () => {
  it('publishes each settled outcome under a new sequence and ignores pending', () => {
    const source = createTaskToastSource()
    const listener = vi.fn()
    const stop = source.hooks.toast.subscribe(listener)
    expect(source.hooks.toast.getSnapshot()).toBeNull()

    // A pending outcome raises nothing: the deletion already in flight reports its own.
    source.report('pending')
    expect(listener).not.toHaveBeenCalled()
    expect(source.hooks.toast.getSnapshot()).toBeNull()

    source.report('deleted')
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'deleted', seq: 1 })
    source.report('failed')
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'deleteFailed', seq: 2 })
    // The next outcome advances the sequence, so a re-shown banner restarts.
    source.report('deleted')
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'deleted', seq: 3 })
    source.dismiss()
    expect(source.hooks.toast.getSnapshot()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(4)

    stop()
    source.report('deleted')
    expect(listener).toHaveBeenCalledTimes(4)
  })
})

describe('ScheduleTaskToast', () => {
  it.each([en, zh])('shows creation guidance long enough to read', (dictionary) => {
    vi.useFakeTimers()
    const { dismiss } = mount({ kind: 'createInSession', seq: 1 }, dictionary)
    expect(screen.getByRole('alert').textContent).toBe(dictionary['toast.createInSession'])
    act(() => { vi.advanceTimersByTime(10000) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing while no outcome shows', () => {
    mount(null)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the success banner for a confirmed deletion and dismisses once done', () => {
    vi.useFakeTimers()
    const { dismiss } = mount({ kind: 'deleted', seq: 1 })
    expect(screen.getByRole('alert').textContent).toBe(en['toast.deleted'])
    act(() => { vi.runAllTimers() })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('shows the warning banner for a deletion that could not be confirmed', () => {
    mount({ kind: 'deleteFailed', seq: 2 }, zh)
    expect(screen.getByRole('alert').textContent).toBe(zh['toast.deleteFailed'])
  })
})
