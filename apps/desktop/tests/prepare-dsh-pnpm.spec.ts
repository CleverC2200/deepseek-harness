import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDesktopRuntimePnpmRunner } from '../scripts/prepare-dsh-pnpm.ts'

const present: unknown = expect.anything()
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'desktop-pnpm-store-')))
  roots.push(root)
  const buildRoot = join(root, 'production')
  const pnpm = join(root, 'pnpm.mjs')
  const capture = join(root, 'capture.json')
  const sharedStore = join(root, 'public-store', 'v11')
  mkdirSync(buildRoot)
  writeFileSync(pnpm, `import { readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args.includes('path')) {
  console.log(readFileSync(process.env.npm_config_userconfig, 'utf8').trim())
} else {
  writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args, cwd: process.cwd(), env: process.env,
    npmrc: readFileSync(process.env.NPM_CONFIG_USERCONFIG, 'utf8') }))
}
`)
  const npmrc = join(root, 'caller.npmrc')
  writeFileSync(npmrc, sharedStore)
  const options = { node: process.execPath, pnpm, buildRoot, runtimeRoot: join(root, 'runtime'), buildState: join(root, 'state'), outputRoot: join(root, 'output'),
    environment: { ...process.env, npm_config_userconfig: npmrc, NPM_CONFIG__AUTH: 'auth-sentinel',
      PNPM_HOME: join(root, 'pnpm-home'), COREPACK_HOME: join(root, 'corepack-home'), NODE_OPTIONS: '--no-warnings', NODE_PATH: root } }
  return { root, sharedStore, capture, options }
}

async function runDesktopRuntimePnpm(args: readonly string[], options: Parameters<typeof createDesktopRuntimePnpmRunner>[0]) {
  return createDesktopRuntimePnpmRunner(options)(args)
}

it('resolves the caller store before isolating the production installation environment', async () => {
  const { sharedStore, capture, options } = fixture()
  await runDesktopRuntimePnpm(['install', '--prod'], options)
  const child: unknown = JSON.parse(readFileSync(capture, 'utf8'))
  const args: unknown = expect.arrayContaining([`--config.store-dir=${sharedStore}`, '--config.enable-global-virtual-store=false'])
  expect(child).toMatchObject({
    args,
    env: { NPM_CONFIG_STORE_DIR: sharedStore }, npmrc: '', cwd: options.buildRoot,
  })
  for (const name of ['npm_config_userconfig', 'NPM_CONFIG__AUTH', 'PNPM_HOME', 'COREPACK_HOME', 'NODE_OPTIONS', 'NODE_PATH']) {
    expect(child).not.toMatchObject({ env: { [name]: present } })
  }
})

it('uses an explicit absolute store without resolving caller configuration', async () => {
  const { root, capture, options } = fixture()
  const store = join(root, 'selected-store')
  await runDesktopRuntimePnpm(['install', '--prod'], { ...options,
    environment: { DSH_DESKTOP_PNPM_STORE_DIR: store } })
  const child: unknown = JSON.parse(readFileSync(capture, 'utf8'))
  const args: unknown = expect.arrayContaining([`--config.store-dir=${store}`])
  expect(child).toMatchObject({ args })
  expect(child).not.toMatchObject({ env: { DSH_DESKTOP_PNPM_STORE_DIR: present } })
})

it('keeps cold downloads private and leaves the public store intact after staging cleanup', async () => {
  const { sharedStore, capture, options } = fixture()
  mkdirSync(sharedStore, { recursive: true })
  const sentinel = join(sharedStore, 'retained-content')
  writeFileSync(sentinel, 'public content')
  await runDesktopRuntimePnpm(['install', '--prod'], { ...options,
    environment: { ...options.environment, DSH_DESKTOP_PNPM_COLD_DOWNLOAD: '1' } })
  const child: unknown = JSON.parse(readFileSync(capture, 'utf8'))
  const args: unknown = expect.arrayContaining([`--config.store-dir=${join(options.buildRoot, 'store')}`])
  expect(child).toMatchObject({ args })
  rmSync(options.buildRoot, { recursive: true, force: true })
  rmSync(options.buildState, { recursive: true, force: true })
  expect(readFileSync(sentinel, 'utf8')).toBe('public content')
})

it('rejects invalid store settings before starting the installation', async () => {
  const { capture, options } = fixture()
  const invalid = [
    { DSH_DESKTOP_PNPM_STORE_DIR: 'relative/store' },
    { DSH_DESKTOP_PNPM_STORE_DIR: '' },
    { DSH_DESKTOP_PNPM_COLD_DOWNLOAD: 'true' },
    { DSH_DESKTOP_PNPM_COLD_DOWNLOAD: '1', DSH_DESKTOP_PNPM_STORE_DIR: options.buildRoot },
  ]
  for (const settings of invalid) {
    await expect(runDesktopRuntimePnpm(['install'], { ...options,
      environment: { ...options.environment, ...settings } })).rejects.toThrow(/desktop runtime:.*(?:store|COLD_DOWNLOAD)/u)
  }
  expect(() => readFileSync(capture)).toThrow()
})

it('reports store resolution failures without exposing inherited configuration diagnostics', async () => {
  const { options } = fixture()
  writeFileSync(options.pnpm, "process.stderr.write('credential-sentinel'); process.exit(2)\n")
  await expect(runDesktopRuntimePnpm(['install'], options)).rejects.toThrow('cannot resolve public pnpm store')
})

it('refuses public stores inside directories that preparation resets or cleans', () => {
  const { options } = fixture()
  for (const root of [options.buildRoot, options.buildState, options.outputRoot]) {
    const store = join(root, 'store')
    mkdirSync(store, { recursive: true })
    const retained = join(store, 'retained')
    writeFileSync(retained, 'existing data')
    expect(() => createDesktopRuntimePnpmRunner({ ...options,
      environment: { DSH_DESKTOP_PNPM_STORE_DIR: store } })).toThrow('outside preparation cleanup directories')
    expect(readFileSync(retained, 'utf8')).toBe('existing data')
  }
})

it('rejects public-store aliases inside a cleanup root before creating missing store directories', () => {
  const { root, options } = fixture()
  const alias = join(root, 'alias')
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  try {
    expect(() => createDesktopRuntimePnpmRunner({ ...options,
      environment: { DSH_DESKTOP_PNPM_STORE_DIR: join(alias, 'output', 'missing-store') },
    })).toThrow('outside preparation cleanup directories')
  } finally { unlinkSync(alias) }
})
