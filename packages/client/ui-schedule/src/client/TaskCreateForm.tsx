import clsx from 'clsx'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useId, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskManagerInjected } from './TaskManagerPage.tsx'
import { draftError, RuleCard, ruleChange, type RuleShown } from './TaskDetail.tsx'
import { timingError, zonedWallClock } from './task-timing.ts'
import type { TaskManagerKey } from './task-manager-locales.ts'
import css from './TaskCreateForm.module.css'

type Props = Pick<TaskManagerInjected, 'onCreateTask'> & PropsLocale<'schedule.manager'> & {
  readonly onClose: () => void
  readonly onCreated: () => void
}

function initialDraft(): RuleShown {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const next = zonedWallClock(new Date(Date.now() + 3_600_000).toISOString(), timeZone)
  return {
    title: '', prompt: '', kind: 'once', weekdays: [1],
    draft: { date: next.slice(0, 10), time: next.slice(11, 19), timeZone, seconds: '3600', expression: '0 9 * * *' },
  }
}

export function TaskCreateForm({ onCreateTask, onClose, onCreated, t }: Props) {
  const formId = useId()
  const [requestId] = useState(() => randomUUID())
  const [values, setValues] = useState(initialDraft)
  const [intervalUnit, setIntervalUnit] = useState<ComponentProps<typeof RuleCard>['intervalUnit']>('hour')
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const disabled = pending || uncertain
  const [failure, setFailure] = useState<TaskManagerKey>()
  const submitting = useRef(false)
  const edit = (patch: Partial<RuleShown>): void => {
    setValues(current => ({ ...current, ...patch }))
    setFailure(undefined)
  }
  const close = (): void => { if (!submitting.current) onClose() }
  const save = async (): Promise<void> => {
    if (submitting.current) return
    const invalid = draftError(values)
    if (invalid !== undefined) { setFailure(invalid); return }
    submitting.current = true
    setPending(true)
    setFailure(undefined)
    try {
      const { kind: _kind, ...timing } = ruleChange(values.draft, values.kind, values.weekdays)
      const result = await onCreateTask({ requestId, title: values.title.trim(), prompt: values.prompt.trim(), ...timing })
      if (!result.ok) { setUncertain(true); setFailure('create.error'); return }
      if (!result.value.created) { setUncertain(false); setFailure(timingError(result.value.code)); return }
      onCreated()
    } catch {
      setUncertain(true)
      setFailure('create.error')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return <Modal
    open title={t('empty.action')} closeLabel={t('detail.close')} onClose={close}
    className={clsx(css.dialog)} contentClassName={clsx(css.content)}
    footer={<>
      <Button disabled={pending} onClick={close}>{t('rule.cancel')}</Button>
      <Button variant="primary" disabled={pending} type="submit" form={formId}>
        {t(pending ? 'create.pending' : uncertain ? 'create.retry' : 'create.action')}
      </Button>
    </>}
  >
    <form id={formId} className={css.form} onSubmit={(event) => { event.preventDefault(); void save() }} aria-busy={pending}>
      <label className={css.field}>
        <span>{t('detail.name')}</span>
        <Input data-modal-autofocus value={values.title} maxLength={120} disabled={disabled}
          onChange={(event) => { edit({ title: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('detail.instruction')}</span>
        <textarea value={values.prompt} rows={4} disabled={disabled}
          onChange={(event) => { edit({ prompt: event.target.value }) }} />
      </label>
      <RuleCard task={undefined} values={values} intervalUnit={intervalUnit} disabled={disabled} failure={undefined}
        onChooseKind={(kind, unit) => {
          if (unit !== undefined) setIntervalUnit(unit)
          edit({ kind, draft: unit === undefined ? values.draft : {
            ...values.draft, seconds: unit === 'hour' ? '3600' : '60',
          } })
        }}
        onChooseZone={(timeZone) => { edit({ draft: { ...values.draft, timeZone } }) }}
        onToggleWeekday={(weekday) => { edit({ weekdays: values.weekdays.includes(weekday)
          ? values.weekdays.filter(day => day !== weekday) : [...values.weekdays, weekday].toSorted() }) }}
        onEditDraft={(patch) => { edit({ draft: { ...values.draft, ...patch } }) }} t={t}
      />
      <p className={css.hint}>{t('create.sessionHint')}</p>
      {failure !== undefined && <p className={css.error} role="alert">{t(failure)}</p>}
    </form>
  </Modal>
}
