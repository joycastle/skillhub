import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createTempHome } from '../helpers/temp-env'
import { startFakeRegistry } from '../helpers/fake-registry'
import { runCli } from '../helpers/run-cli'

let registry: Awaited<ReturnType<typeof startFakeRegistry>> | undefined

afterEach(() => {
  registry?.stop()
  registry = undefined
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a minimal inventory.json under <home>/.skillhub/ */
async function seedInventory(home: string, items: object[]) {
  const dir = `${home}/.skillhub`
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/inventory.json`, JSON.stringify({ items }, null, 2))
}

/** Create the install directory on disk so the remove service finds it. */
async function createInstallDir(path: string) {
  await mkdir(path, { recursive: true })
}

/** Build a minimal inventory item with one target. */
function makeItem(opts: {
  registry: string
  namespace: string
  slug: string
  agent: string
  rootDir: string
  installDir: string
}) {
  return {
    registry: opts.registry,
    namespace: opts.namespace,
    slug: opts.slug,
    version: '1.0.0',
    targets: [
      {
        agent: opts.agent,
        rootDir: opts.rootDir,
        installDir: opts.installDir,
        installedAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// P0 — Mutually exclusive flag pairs
// ---------------------------------------------------------------------------

describe('remove command — flag validation (P0)', () => {
  test('--all + --agent are mutually exclusive', async () => {
    const env = await createTempHome()

    const result = await runCli(
      ['remove', 'my-skill', '--all', '--agent', 'claude-code'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(5) // EXIT.usage
    expect(result.stderr).toContain('--all cannot be used with --agent')
  })

  test('--remote + --agent are mutually exclusive', async () => {
    const env = await createTempHome()

    const result = await runCli(
      ['remove', 'my-skill', '--remote', '--agent', 'claude-code'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(5) // EXIT.usage
    expect(result.stderr).toContain('--remote cannot be used with --agent or --all')
  })

  test('--remote + --all are mutually exclusive', async () => {
    const env = await createTempHome()

    const result = await runCli(
      ['remove', 'my-skill', '--remote', '--all'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(5) // EXIT.usage
    expect(result.stderr).toContain('--remote cannot be used with --agent or --all')
  })

  test('--remote without --hard in non-interactive mode fails with usage error', async () => {
    const env = await createTempHome()
    // Bun.spawn with piped stdin is never a TTY — this exercises the non-interactive guard.
    const result = await runCli(
      ['remove', 'my-skill', '--remote'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(5) // EXIT.usage
    expect(result.stderr).toContain('non-interactive remote delete requires --hard')
  })

  test('--remote --hard calls deleteRemote and exits 0', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [{ namespace: 'global', slug: 'my-skill' }]
    })

    // Establish credentials first
    await runCli(['login', '--registry', registry.url, '--token', 'sk_ok'], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    const result = await runCli(
      ['remove', 'my-skill', '--remote', '--hard', '--registry', registry.url],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/my-skill')
    expect(result.stdout).toContain('remote-hard-delete')
    expect(registry.received.delete).toEqual({
      namespace: 'global',
      slug: 'my-skill',
      token: expect.any(String)
    })
  })
})

// ---------------------------------------------------------------------------
// P1 — Happy paths and edge cases
// ---------------------------------------------------------------------------

describe('remove command — local remove (P1)', () => {
  test('--json shape for local remove (happy path)', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })

    const rootDir = `${env.home}/agents/claude-code`
    const installDir = `${rootDir}/skills/my-skill`
    await createInstallDir(installDir)
    await seedInventory(env.home, [
      makeItem({
        registry: registry.url,
        namespace: 'global',
        slug: 'my-skill',
        agent: 'claude-code',
        rootDir,
        installDir
      })
    ])

    const result = await runCli(
      ['remove', 'my-skill', '--registry', registry.url, '--json'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({ ok: true, scope: 'local' })
    expect(Array.isArray(parsed.removed)).toBe(true)
  })

  test('--json shape for --remote --hard', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [{ namespace: 'global', slug: 'my-skill' }]
    })

    await runCli(['login', '--registry', registry.url, '--token', 'sk_ok'], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    const result = await runCli(
      ['remove', 'my-skill', '--remote', '--hard', '--registry', registry.url, '--json'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      ok: true,
      scope: 'remote',
      action: 'hard-delete',
      namespace: 'global',
      slug: 'my-skill'
    })
    expect(registry.received.delete).toEqual({
      namespace: 'global',
      slug: 'my-skill',
      token: expect.any(String)
    })
  })

  test('stale record branch (existed: false) shows distinct human copy', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })

    const rootDir = `${env.home}/agents/claude-code`
    // Intentionally do NOT create installDir — simulates stale record
    const installDir = `${rootDir}/skills/stale-skill`
    await mkdir(rootDir, { recursive: true })
    await seedInventory(env.home, [
      makeItem({
        registry: registry.url,
        namespace: 'global',
        slug: 'stale-skill',
        agent: 'claude-code',
        rootDir,
        installDir
      })
    ])

    const result = await runCli(
      ['remove', 'stale-skill', '--registry', registry.url],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('directory already missing')
  })

  test('--agent filter removes only matching agent target', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })

    const rootDir = `${env.home}/agents`
    const installDirClaude = `${rootDir}/claude-code/skills/shared-skill`
    const installDirCursor = `${rootDir}/cursor/skills/shared-skill`
    await createInstallDir(installDirClaude)
    await createInstallDir(installDirCursor)

    // Two targets for the same skill, different agents
    await seedInventory(env.home, [
      {
        registry: registry.url,
        namespace: 'global',
        slug: 'shared-skill',
        version: '1.0.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: `${rootDir}/claude-code`,
            installDir: installDirClaude,
            installedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            agent: 'cursor',
            rootDir: `${rootDir}/cursor`,
            installDir: installDirCursor,
            installedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      }
    ])

    const result = await runCli(
      ['remove', 'shared-skill', '--agent', 'claude-code', '--registry', registry.url, '--json'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.removed).toHaveLength(1)
    expect(parsed.removed[0].agent).toBe('claude-code')
  })

  test('--all removes all targets for the skill', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })

    const rootDir = `${env.home}/agents`
    const installDirA = `${rootDir}/claude-code/skills/multi-skill`
    const installDirB = `${rootDir}/cursor/skills/multi-skill`
    await createInstallDir(installDirA)
    await createInstallDir(installDirB)

    await seedInventory(env.home, [
      {
        registry: registry.url,
        namespace: 'global',
        slug: 'multi-skill',
        version: '1.0.0',
        targets: [
          {
            agent: 'claude-code',
            rootDir: `${rootDir}/claude-code`,
            installDir: installDirA,
            installedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            agent: 'cursor',
            rootDir: `${rootDir}/cursor`,
            installDir: installDirB,
            installedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      }
    ])

    const result = await runCli(
      ['remove', 'multi-skill', '--all', '--registry', registry.url, '--json'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.removed).toHaveLength(2)
    const agents = parsed.removed.map((r: { agent: string }) => r.agent).sort()
    expect(agents).toEqual(['claude-code', 'cursor'])
  })
})
