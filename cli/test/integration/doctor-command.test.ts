import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempHome } from '../helpers/temp-env'
import { runCli } from '../helpers/run-cli'

/**
 * Seed a single skill metadata file under the given scan root.
 * Doctor scans its cwd for `.<agent>/skills/<slug>/.skillhub/metadata.json`,
 * so we seed fixtures inside `scanRoot` (a temp dir) and pass that same dir
 * as the CLI's cwd — no writes into the repo working tree.
 */
async function seedSkill(scanRoot: string, options: {
  agentDir: string
  slug: string
  metadata: {
    registry: string
    namespace: string
    slug: string
    version: string
    agent: string
    installedAt: string
  }
}): Promise<void> {
  const metaDir = join(scanRoot, options.agentDir, 'skills', options.slug, '.skillhub')
  await mkdir(metaDir, { recursive: true })
  await writeFile(join(metaDir, 'metadata.json'), JSON.stringify(options.metadata))
}

describe('doctor command', () => {
  test('doctor --json empty home exits 0 and returns parseable JSON', async () => {
    const { home, cwd } = await createTempHome()

    const result = await runCli(['doctor', '--json'], {
      HOME: home,
      USERPROFILE: home
    }, { cwd })

    expect(result.exitCode).toBe(0)

    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(typeof json.inventoryPath).toBe('string')
    expect(json.inventoryPath).toContain('.skillhub')
    expect(json.inventoryPath).toContain('inventory.json')
    expect(json.backupPath).toBeNull()
    expect(json.itemsRestored).toBe(0)
    expect(json.targetsRestored).toBe(0)
    expect(Array.isArray(json.skipped)).toBe(true)
    expect(Array.isArray(json.conflicts)).toBe(true)
  })

  test('doctor human output empty home exits 0 and shows Inventory line', async () => {
    const { home, cwd } = await createTempHome()

    const result = await runCli(['doctor'], {
      HOME: home,
      USERPROFILE: home
    }, { cwd })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Inventory:')
    expect(result.stdout).toContain('.skillhub')
    expect(result.stdout).toContain('inventory.json')
    expect(result.stdout).toContain('Restored: 0 items, 0 targets')
    expect(result.stdout).not.toContain('Backup:')
  })

  test('doctor rebuilds inventory.json from seeded metadata files', async () => {
    const { home, cwd } = await createTempHome()

    await seedSkill(cwd, {
      agentDir: '.codex',
      slug: 'pdf-parser',
      metadata: {
        registry: 'https://skill.xfyun.cn',
        namespace: 'global',
        slug: 'pdf-parser',
        version: '1.2.0',
        agent: 'codex',
        installedAt: '2026-04-20T12:00:00Z'
      }
    })

    const result = await runCli(['doctor'], {
      HOME: home,
      USERPROFILE: home
    }, { cwd })

    expect(result.exitCode).toBe(0)

    const inventoryPath = join(home, '.skillhub', 'inventory.json')
    const raw = await readFile(inventoryPath, 'utf-8')
    const inventory = JSON.parse(raw) as { items: Array<{
      namespace: string
      slug: string
      version: string
      registry: string
    }> }

    expect(inventory.items).toHaveLength(1)
    expect(inventory.items[0]).toMatchObject({
      registry: 'https://skill.xfyun.cn',
      namespace: 'global',
      slug: 'pdf-parser',
      version: '1.2.0'
    })
  })

  test('doctor --json reflects rebuilt inventory items in output', async () => {
    const { home, cwd } = await createTempHome()

    await seedSkill(cwd, {
      agentDir: '.claude',
      slug: 'image-resizer',
      metadata: {
        registry: 'https://skill.xfyun.cn',
        namespace: 'global',
        slug: 'image-resizer',
        version: '2.0.0',
        agent: 'claude-code',
        installedAt: '2026-04-21T09:00:00Z'
      }
    })

    const result = await runCli(['doctor', '--json'], {
      HOME: home,
      USERPROFILE: home
    }, { cwd })

    expect(result.exitCode).toBe(0)

    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(json.itemsRestored).toBe(1)
    expect(json.targetsRestored).toBe(1)
    expect(json.backupPath).toBeNull()
    expect(Array.isArray(json.skipped)).toBe(true)
    expect(json.conflicts).toHaveLength(0)
    expect(typeof json.inventoryPath).toBe('string')
    expect(json.inventoryPath).toContain('inventory.json')
  })

  test('doctor backs up existing inventory.json and reports backupPath', async () => {
    const { home, cwd } = await createTempHome()

    const skillhubDir = join(home, '.skillhub')
    await mkdir(skillhubDir, { recursive: true })
    const inventoryPath = join(skillhubDir, 'inventory.json')
    const originalContent = JSON.stringify({ items: [{ registry: 'old', namespace: 'x', slug: 'y', version: '0.0.1', targets: [] }] })
    await writeFile(inventoryPath, originalContent)

    const result = await runCli(['doctor'], {
      HOME: home,
      USERPROFILE: home
    }, { cwd })

    expect(result.exitCode).toBe(0)

    const backupPath = `${inventoryPath}.bak`
    const backupContent = await readFile(backupPath, 'utf-8')
    expect(backupContent).toBe(originalContent)

    expect(result.stdout).toContain('Backup:')
    expect(result.stdout).toContain('inventory.json.bak')
  })
})
