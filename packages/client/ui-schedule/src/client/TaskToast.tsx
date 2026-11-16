/**
 * App-wide task creation guidance and deletion outcomes.
 *
 * Every deletion — the Tasks page detail, the session task tab, and the
 * Session-header popover — reports its settled outcome into one store, and one
 * `shell.overlay` entry renders it as the app-wide banner. The surfaces keep no
 * in-place deletion notice of their own, so an outcome outlives the panel or
 * tab that asked for it.
 */
import type { ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { CatalogDeleteOutcome } from './catalog-source.ts'

/** One task notice; `seq` keys the banner so a re-show restarts it. */
export interface TaskToastState {
  readonly kind: 'deleted' | 'deleteFailed' | 'createInSession'
  readonly seq: number
}

/** Task notices shared by the page and the app-wide overlay. */
export interface TaskToastSource {
  /** Current notice for the overlay entry, or null while none shows. */
  readonly hooks: { readonly toast: HostObservable<TaskToastState | null> }
  /**
   * Show the notice of one settled deletion; 'pending' raises nothing because
   * the deletion already in flight reports its own outcome.
   * @param outcome - resolution of `CatalogInjected.onDelete`.
   */
  readonly report: (outcome: CatalogDeleteOutcome) => void
  readonly showCreateHint: () => void
  /** Clear the shown notice. */
  readonly dismiss: () => void
}

/**
 * Create the task notice store the overlay entry shows.
 * @returns the observable notice with its report and dismiss actions.
 */
export function createTaskToastSource(): TaskToastSource {
  let state: TaskToastState | null = null
  let seq = 0
  const listeners = new Set<() => void>()
  const publish = (next: TaskToastState | null): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    hooks: {
      toast: {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
    },
    report: (outcome) => {
      if (outcome === 'pending') return
      publish({ kind: outcome === 'deleted' ? 'deleted' : 'deleteFailed', seq: ++seq })
    },
    showCreateHint: () => { publish({ kind: 'createInSession', seq: ++seq }) },
    dismiss: () => { publish(null) },
  }
}

/** Props of the `shell.overlay` entry: the notice store and localized copy. */
export type ScheduleTaskToastProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'schedule.manager'>
  & InjectFace<Omit<TaskToastSource, 'report' | 'showCreateHint'>>

/**
 * Render creation guidance or the latest deletion outcome.
 * @param props - the notice hook, its dismissal, and the locale seat.
 * @returns the banner on display, or null.
 */
export function ScheduleTaskToast({ useToast, dismiss, t }: ScheduleTaskToastProps): ReactNode {
  const toast = useToast(current => current)
  if (toast === null) return null
  if (toast.kind === 'createInSession') {
    return <Toast key={`schedule-create-${String(toast.seq)}`} text={t('toast.createInSession')} holdMs={10000} onDone={dismiss} />
  }
  return toast.kind === 'deleted'
    ? <Toast key={`schedule-delete-${String(toast.seq)}`} text={t('toast.deleted')} tone="success" onDone={dismiss} />
    : <Toast
      key={`schedule-delete-${String(toast.seq)}`}
      text={t('toast.deleteFailed')}
      icon={<IconWarningOutlineRegular />}
      onDone={dismiss}
    />
}
