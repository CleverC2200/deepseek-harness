/** Prepare the Desktop production dependency graph with bundled pnpm. */

import { execFileSync, spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import { resolveNpmRegistry, resolveDesktopPnpmStoreConfiguration } from './desktop-release-environment.mjs'

function physicalPath(path: string): string {
  try { return realpathSync(path) }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(physicalPath(parent), basename(path))
  }
}

/**
 * Resolve a writable, searchable download store before resetting outputs and create an isolated production installer.
 * @param options - Bundled executables and private preparation paths.
 * @returns Runner that settles after its pnpm command exits; shared stores survive preparation cleanup.
 */
export function createDesktopRuntimePnpmRunner(options: {
  node: string
  pnpm: string
  runtimeRoot: string
  buildRoot: string
  buildState: string
  outputRoot: string
  environment?: NodeJS.ProcessEnv
}): (args: readonly string[]) => Promise<void> {
  const { node, pnpm, runtimeRoot, buildRoot, buildState, environment = process.env } = options
  const selection = resolveDesktopPnpmStoreConfiguration(environment)
  let storePath = selection.kind === 'cold' ? join(buildRoot, 'store') : selection.kind === 'explicit' ? selection.path : undefined
  if (storePath === undefined) {
    try {
      storePath = execFileSync(node, ['--expose-internals', pnpm, 'store', 'path', '--silent'], {
        env: desktopNodeEnvironment(node, undefined, environment),
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    } catch {
      throw new Error('desktop runtime: cannot resolve public pnpm store; check caller pnpm configuration or set DSH_DESKTOP_PNPM_STORE_DIR')
    }
  }
  if (!isAbsolute(storePath) || /[\r\n\0]/u.test(storePath)) {
    throw new Error('desktop runtime: pnpm store must be one absolute path')
  }
  const store = physicalPath(resolve(storePath))
  if (selection.kind !== 'cold') {
    for (const directory of [buildRoot, buildState, options.outputRoot]) {
      const within = relative(physicalPath(resolve(directory)), store)
      if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within))) {
        throw new Error('desktop runtime: shared pnpm store must be outside preparation cleanup directories')
      }
    }
  }
  mkdirSync(store, { recursive: true })
  accessSync(store, constants.W_OK | constants.X_OK)
  return args => new Promise((resolvePromise, reject) => {
    const [command, ...commandArgs] = args
    if (command === undefined) throw new Error('desktop runtime: pnpm command is required')
    const registry = resolveNpmRegistry(environment)
    const config = join(buildState, 'config')
    const userConfig = join(config, 'npmrc')
    mkdirSync(config, { recursive: true })
    writeFileSync(userConfig, '')
    const child = spawn(node, [
      '--expose-internals',
      pnpm,
      `--config.registry=${registry}`,
      `--config.store-dir=${store}`,
      '--config.enable-global-virtual-store=false',
      `--config.userconfig=${userConfig}`,
      command,
      ...commandArgs,
    ], {
      cwd: buildRoot,
      env: {
        ...Object.fromEntries(Object.entries(environment).filter(([name]) => (
          name !== 'NODE_OPTIONS' && name !== 'NODE_PATH' && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)
        ))),
        NPM_CONFIG_REGISTRY: registry,
        NPM_CONFIG_STORE_DIR: store,
        NPM_CONFIG_USERCONFIG: userConfig,
        ...desktopNodeEnvironment(node, join(runtimeRoot, 'bin'), {}),
        PATH: `${join(runtimeRoot, 'bin')}${delimiter}${environment.PATH ?? ''}`,
        XDG_CACHE_HOME: join(buildState, 'cache'),
        XDG_CONFIG_HOME: config,
        XDG_STATE_HOME: join(buildState, 'state'),
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop runtime: pnpm exited with ${String(code ?? signal)}`))
    })
  })
}
