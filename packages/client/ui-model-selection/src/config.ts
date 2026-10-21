/** Deployment options shared by the Host injection and browser model directory. */
export interface ModelSelectionConfig {
  /** Visible provider ids; absent shows all providers, while an empty list shows no choices. */
  visibleProviders?: readonly string[]
}

/** Public boot-injection key for model menu deployment options. */
export const MODEL_SELECTION_CONFIG_GLOBAL = '__DSH_MODEL_SELECTION_CONFIG__'

declare global {
  var __DSH_MODEL_SELECTION_CONFIG__: ModelSelectionConfig | undefined
}
