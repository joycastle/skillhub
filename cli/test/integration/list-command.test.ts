import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempHome } from '../helpers/temp-env'
import { runCli } from '../helpers/run-cli'

const FAKE_REGISTRY_A = 'http://registry-a.test'
const FAKE_REGISTRY_B = 'http://registry-b.test'
const INSTALLED_AT = '2024-01-15T10:00:00.000Z'

/** Write inventory.json into the temp home's .skillhub dir. */
async function seedInventory(home: string, items: object[]) {
  const skillhubDir = join(home, '.skillhub')
  await mkdir(skillhubDir, { recursive: true })
  await writeFile(
    join(skillhubDir, 'inventory.json'),
    JSON.stringify({ items }, null, 2)
  )
}

describe('list command', () => {
  // ---------------------------------------------------------------------------
  // P0-1: Happy path — human-readable output
  // ---------------------------------------------------------------------------
  test('human output shows namespace/slug/version, agent, installDir, status ok', async () => {
    const { home } = await createTempHome()
    const installDir = join(home, 'skills', 'my-agent', 'global', 'pdf-parser')
    await mkdir(installDir, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'pdf-parser',
        version: '1.2.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: join(home, 'skills', 'my-agent'),
            installDir,
            installedAt: INSTALLED_AT
          }
        ]
      }
    ])

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/pdf-parser@1.2.0')
    expect(result.stdout).toContain('claude-code')
    expect(result.stdout).toContain(installDir)
    expect(result.stdout).toContain('ok')
  })

  // ---------------------------------------------------------------------------
  // P0-2: --json output
  // ---------------------------------------------------------------------------
  test('--json output parses correctly with status ok', async () => {
    const { home } = await createTempHome()
    const installDir = join(home, 'skills', 'my-agent', 'global', 'pdf-parser')
    await mkdir(installDir, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'pdf-parser',
        version: '1.2.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: join(home, 'skills', 'my-agent'),
            installDir,
            installedAt: INSTALLED_AT
          }
        ]
      }
    ])

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A, '--json'], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(json.items).toHaveLength(1)
    expect(json.items[0]).toMatchObject({
      namespace: 'global',
      slug: 'pdf-parser',
      version: '1.2.0',
      agent: 'claude-code',
      installDir,
      installedAt: INSTALLED_AT,
      status: 'ok'
    })
  })

  // ---------------------------------------------------------------------------
  // P0-3: Empty inventory — no file present
  // ---------------------------------------------------------------------------
  test('empty inventory prints "No skills installed."', async () => {
    const { home } = await createTempHome()

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('No skills installed.')
  })

  // ---------------------------------------------------------------------------
  // P0-4: Empty inventory with --json
  // ---------------------------------------------------------------------------
  test('empty inventory with --json returns { ok: true, items: [] }', async () => {
    const { home } = await createTempHome()

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A, '--json'], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json).toEqual({ ok: true, items: [] })
  })

  // ---------------------------------------------------------------------------
  // P0-5: Registry filter — only shows items for the specified registry
  // ---------------------------------------------------------------------------
  test('registry filter excludes entries from other registries', async () => {
    const { home } = await createTempHome()
    const installDirA = join(home, 'skills', 'agent-a', 'global', 'skill-a')
    const installDirB = join(home, 'skills', 'agent-b', 'global', 'skill-b')
    await mkdir(installDirA, { recursive: true })
    await mkdir(installDirB, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'skill-a',
        version: '1.0.0',
        targets: [
          { agent: 'claude-code', rootDir: join(home, 'skills', 'agent-a'), installDir: installDirA, installedAt: INSTALLED_AT }
        ]
      },
      {
        registry: FAKE_REGISTRY_B,
        namespace: 'global',
        slug: 'skill-b',
        version: '2.0.0',
        targets: [
          { agent: 'cursor', rootDir: join(home, 'skills', 'agent-b'), installDir: installDirB, installedAt: INSTALLED_AT }
        ]
      }
    ])

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/skill-a@1.0.0')
    expect(result.stdout).not.toContain('global/skill-b')
  })

  // ---------------------------------------------------------------------------
  // P1-6: --agent filter
  // ---------------------------------------------------------------------------
  test('--agent filter shows only the matching agent target', async () => {
    const { home } = await createTempHome()
    const installDirClaude = join(home, 'skills', 'claude', 'global', 'my-skill')
    const installDirCursor = join(home, 'skills', 'cursor', 'global', 'my-skill')
    await mkdir(installDirClaude, { recursive: true })
    await mkdir(installDirCursor, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'my-skill',
        version: '1.0.0',
        targets: [
          { agent: 'claude-code', rootDir: join(home, 'skills', 'claude'), installDir: installDirClaude, installedAt: INSTALLED_AT },
          { agent: 'cursor', rootDir: join(home, 'skills', 'cursor'), installDir: installDirCursor, installedAt: INSTALLED_AT }
        ]
      }
    ])

    const result = await runCli(
      ['list', '--registry', FAKE_REGISTRY_A, '--agent', 'claude-code'],
      { HOME: home, USERPROFILE: home }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('claude-code')
    expect(result.stdout).toContain(installDirClaude)
    expect(result.stdout).not.toContain('cursor')
    expect(result.stdout).not.toContain(installDirCursor)
  })

  // ---------------------------------------------------------------------------
  // P1-7: --agent repeatable — both agents shown
  // ---------------------------------------------------------------------------
  test('--agent repeatable shows all specified agents', async () => {
    const { home } = await createTempHome()
    const installDirClaude = join(home, 'skills', 'claude', 'global', 'my-skill')
    const installDirCursor = join(home, 'skills', 'cursor', 'global', 'my-skill')
    const installDirOther = join(home, 'skills', 'other', 'global', 'my-skill')
    await mkdir(installDirClaude, { recursive: true })
    await mkdir(installDirCursor, { recursive: true })
    await mkdir(installDirOther, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'my-skill',
        version: '1.0.0',
        targets: [
          { agent: 'claude-code', rootDir: join(home, 'skills', 'claude'), installDir: installDirClaude, installedAt: INSTALLED_AT },
          { agent: 'cursor', rootDir: join(home, 'skills', 'cursor'), installDir: installDirCursor, installedAt: INSTALLED_AT },
          { agent: 'other-agent', rootDir: join(home, 'skills', 'other'), installDir: installDirOther, installedAt: INSTALLED_AT }
        ]
      }
    ])

    const result = await runCli(
      ['list', '--registry', FAKE_REGISTRY_A, '--agent', 'claude-code', '--agent', 'cursor'],
      { HOME: home, USERPROFILE: home }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('claude-code')
    expect(result.stdout).toContain('cursor')
    expect(result.stdout).not.toContain('other-agent')
  })

  // ---------------------------------------------------------------------------
  // P1-8: --dir prefix filter
  // ---------------------------------------------------------------------------
  test('--dir prefix filter shows only targets under the prefix', async () => {
    const { home } = await createTempHome()
    const prefixA = join(home, 'skills', 'prefix-a')
    const prefixB = join(home, 'skills', 'prefix-b')
    const installDirA = join(prefixA, 'global', 'skill-x')
    const installDirB = join(prefixB, 'global', 'skill-x')
    await mkdir(installDirA, { recursive: true })
    await mkdir(installDirB, { recursive: true })

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'skill-x',
        version: '1.0.0',
        targets: [
          { agent: 'agent-a', rootDir: prefixA, installDir: installDirA, installedAt: INSTALLED_AT },
          { agent: 'agent-b', rootDir: prefixB, installDir: installDirB, installedAt: INSTALLED_AT }
        ]
      }
    ])

    const result = await runCli(
      ['list', '--registry', FAKE_REGISTRY_A, '--dir', prefixA],
      { HOME: home, USERPROFILE: home }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(installDirA)
    expect(result.stdout).not.toContain(installDirB)
  })

  // ---------------------------------------------------------------------------
  // P0-9: status: missing when installDir does not exist
  // ---------------------------------------------------------------------------
  test('status is "missing" when installDir does not exist on disk', async () => {
    const { home } = await createTempHome()
    // Intentionally do NOT create this directory
    const installDir = join(home, 'skills', 'nonexistent', 'global', 'ghost-skill')

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'ghost-skill',
        version: '1.0.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: join(home, 'skills', 'nonexistent'),
            installDir,
            installedAt: INSTALLED_AT
          }
        ]
      }
    ])

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/ghost-skill@1.0.0')
    expect(result.stdout).toContain('missing')
    expect(result.stdout).not.toContain('ok')
  })

  // ---------------------------------------------------------------------------
  // P0-9b: status: missing with --json
  // ---------------------------------------------------------------------------
  test('--json status is "missing" when installDir does not exist', async () => {
    const { home } = await createTempHome()
    const installDir = join(home, 'skills', 'nonexistent', 'global', 'ghost-skill')

    await seedInventory(home, [
      {
        registry: FAKE_REGISTRY_A,
        namespace: 'global',
        slug: 'ghost-skill',
        version: '1.0.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: join(home, 'skills', 'nonexistent'),
            installDir,
            installedAt: INSTALLED_AT
          }
        ]
      }
    ])

    const result = await runCli(['list', '--registry', FAKE_REGISTRY_A, '--json'], {
      HOME: home,
      USERPROFILE: home
    })

    expect(result.exitCode).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(json.items).toHaveLength(1)
    expect(json.items[0].status).toBe('missing')
  })
})
