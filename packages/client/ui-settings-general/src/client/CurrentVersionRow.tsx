/** Installed release version in General Settings for Web and Desktop. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import css from './CurrentVersionRow.module.css'

/**
 * Render the installed Desktop release or the Web build version supplied by the settings owner.
 * @param props - runtime share and localized copy.
 * @returns the current release label, or nothing when the version is unavailable.
 */
export function CurrentVersionRow({ t, useVersion }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<{
    hooks: { version: ObservableSnapshot<string | undefined> }
  }>) {
  const version = useVersion(value => value)
  if (version === undefined) return null
  return <div className={css.row}>{t('general.currentVersion', { version })}</div>
}
