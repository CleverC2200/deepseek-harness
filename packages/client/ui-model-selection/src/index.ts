/** Host configuration projected to the browser model menus at page boot. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { MODEL_SELECTION_CONFIG_GLOBAL, type ModelSelectionConfig } from './config.ts'

/** Validated deployment options; the default retains every provider. */
export const Config: z<ModelSelectionConfig> = z.object({
  visibleProviders: z.union([z.const(undefined), z.array(z.string())]),
})

/**
 * Publish model menu options without changing Host model routing or Session selections.
 * @param ctx - Host context providing page initialization events.
 * @param config - validated deployment provider scope.
 */
export function apply(ctx: Context, config: ModelSelectionConfig): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: MODEL_SELECTION_CONFIG_GLOBAL, value: config })
  })
}
