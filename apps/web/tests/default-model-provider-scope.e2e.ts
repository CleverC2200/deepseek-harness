import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, watchConsole, acknowledgeReloadConnectionLoss, compareOrRefreshGolden, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./default-model-provider-scope.overlay.yml', import.meta.url))

describe('web e2e: deployment provider visibility', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await scaffold.ctx.settings.update('llm-pi-ai', {
      providers: {
        'origin-gateway': {
          displayName: 'GEA personal model', api: 'openai-completions',
          baseURL: 'https://origin.example/v1', models: [{ id: 'origin-large', name: 'GEA model' }],
        },
        'acme-gateway': {
          displayName: 'Renamed provider', api: 'openai-completions',
          baseURL: 'https://acme.example/v1', models: [{ id: 'acme-large', name: 'Acme Large' }],
        },
      },
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      await scaffold?.close()
    }
  })

  it('filters both real menus, preserves a hidden default, and restores an explicit selection', async () => {
    const original = scaffold.ctx.agentDefaultModel.currentSelection()
    expect(original).toMatchObject({ provider: 'origin-gateway', model: 'origin-large' })
    expect((await scaffold.ctx.sessionController.modelCatalog()).groups.map(group => group.id))
      .toEqual(expect.arrayContaining(['origin-gateway', 'acme-gateway']))
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    const visibleMenus: string[] = []
    for (let pass = 0; pass < 2; pass++) {
      await trigger.click()
      await page.getByRole('menuitem', { name: /模型/ }).click()
      const menu = page.getByRole('menu', { name: '模型', exact: true })
      await expect.poll(() => menu.getByRole('menuitemradio').allTextContents()).toEqual(['Acme Large'])
      visibleMenus.push(`button: ${(await menu.getByRole('menuitemradio').allTextContents()).join(', ')}`)
      expect(scaffold.ctx.agentDefaultModel.currentSelection()).toEqual(original)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: '添加文件或调用指令', exact: true }).click()
      await page.getByRole('option', { name: /^模型/ }).click()
      const popup = page.locator('[aria-label="/model 选项"]')
      await expect.poll(() => popup.getByRole('option').allTextContents()).toEqual(['Acme Large'])
      visibleMenus.push(`command: ${(await popup.getByRole('option').allTextContents()).join(', ')}`)
      if (pass === 0) {
        await page.keyboard.press('Escape')
        await page.locator('[data-composer-input]').first().fill('')
        const warningStart = tripwire.warnings.length
        await page.reload({ waitUntil: 'load' })
        await trigger.waitFor()
        acknowledgeReloadConnectionLoss(tripwire, warningStart)
      } else {
        await popup.getByRole('option', { name: 'Acme Large', exact: true }).click()
      }
    }
    await expect.poll(() => scaffold.ctx.agentDefaultModel.currentSelection())
      .toMatchObject({ provider: 'acme-gateway', model: 'acme-large' })
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => trigger.textContent()).toContain('Acme Large')
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await compareOrRefreshGolden(
      fileURLToPath(new URL('./expected/default-model/provider-scope.expected.md', import.meta.url)),
      visibleMenus.join('\n'), webSnapshotMode(),
    )
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  })
})
