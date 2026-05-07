import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { zipSync, strToU8 } from 'fflate'
import { createTempHome } from '../helpers/temp-env'
import { startFakeRegistry } from '../helpers/fake-registry'
import { runCli } from '../helpers/run-cli'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid zip containing a SKILL.md file. */
function makeSkillZip(extra: Record<string, string> = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'SKILL.md': strToU8('# test skill'),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)]))
  }
  return zipSync(entries)
}

let registry: Awaited<ReturnType<typeof startFakeRegistry>> | undefined

afterEach(() => {
  registry?.stop()
  registry = undefined
})

// ---------------------------------------------------------------------------
// P0 — Happy-path install: metadata.json + inventory.json
// ---------------------------------------------------------------------------

describe('install command — P0', () => {
  test('happy-path: exit 0, writes metadata.json and inventory.json', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [
        {
          namespace: 'global',
          slug: 'pdf-parser',
          version: '1.0.0',
          versionId: 1,
          fingerprint: 'abc123',
          zipBytes: makeSkillZip()
        }
      ]
    })

    // Login first so credentials are stored
    const loginResult = await runCli(
      ['login', '--registry', registry.url, '--token', 'sk_ok'],
      { HOME: env.home, USERPROFILE: env.home }
    )
    expect(loginResult.exitCode).toBe(0)

    // The claude-code profile installs into <cwd>/.claude/skills
    // We use --dir to pin the install directory to a known temp path so we
    // can assert on it without depending on agent detection.
    const installDir = join(env.cwd, 'skills')
    await mkdir(installDir, { recursive: true })

    const result = await runCli(
      ['install', 'pdf-parser', '--dir', installDir, '--registry', registry.url, '--token', 'sk_ok'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)

    // --- metadata.json ---
    const metaPath = join(installDir, 'pdf-parser', '.skillhub', 'metadata.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'))
    expect(meta).toMatchObject({
      registry: registry.url,
      namespace: 'global',
      slug: 'pdf-parser',
      version: '1.0.0'
    })
    expect(typeof meta.installedAt).toBe('string')

    // --- inventory.json ---
    const inventoryPath = join(env.home, '.skillhub', 'inventory.json')
    const inventory = JSON.parse(await readFile(inventoryPath, 'utf-8'))
    expect(inventory.items).toBeArray()
    const item = inventory.items.find(
      (i: { namespace: string; slug: string }) => i.namespace === 'global' && i.slug === 'pdf-parser'
    )
    expect(item).toBeDefined()
    expect(item.targets.length).toBeGreaterThan(0)
    const target = item.targets.find(
      (t: { installDir: string }) => t.installDir === join(installDir, 'pdf-parser')
    )
    expect(target).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // P0 — --json output shape
  // -------------------------------------------------------------------------

  test('--json output matches { ok, namespace, slug, installed }', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [
        {
          namespace: 'global',
          slug: 'pdf-parser',
          version: '1.0.0',
          zipBytes: makeSkillZip()
        }
      ]
    })

    await runCli(
      ['login', '--registry', registry.url, '--token', 'sk_ok'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    const installDir = join(env.cwd, 'skills-json')
    await mkdir(installDir, { recursive: true })

    const result = await runCli(
      ['install', 'pdf-parser', '--dir', installDir, '--registry', registry.url, '--token', 'sk_ok', '--json'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      ok: true,
      namespace: 'global',
      slug: 'pdf-parser'
    })
    expect(Array.isArray(parsed.installed)).toBe(true)
    expect(parsed.installed.length).toBeGreaterThan(0)
    expect(parsed.installed[0]).toHaveProperty('agent')
    expect(parsed.installed[0]).toHaveProperty('dir')
  })
})

// ---------------------------------------------------------------------------
// P1 — --version forwarding
// ---------------------------------------------------------------------------

describe('install command — P1', () => {
  test('--version forwards to resolve and installs the requested version', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [
        {
          namespace: 'global',
          slug: 'pdf-parser',
          // fake-registry returns this as the resolved version regardless of
          // the ?version= query param; we just verify the metadata records it.
          version: '1.0.0',
          zipBytes: makeSkillZip()
        }
      ]
    })

    await runCli(
      ['login', '--registry', registry.url, '--token', 'sk_ok'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    const installDir = join(env.cwd, 'skills-ver')
    await mkdir(installDir, { recursive: true })

    const result = await runCli(
      [
        'install', 'pdf-parser',
        '--version', '1.0.0',
        '--dir', installDir,
        '--registry', registry.url,
        '--token', 'sk_ok'
      ],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)
    expect(registry.received.resolve?.version).toBe('1.0.0')

    const metaPath = join(installDir, 'pdf-parser', '.skillhub', 'metadata.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'))
    expect(meta.version).toBe('1.0.0')
  })

  // -------------------------------------------------------------------------
  // P1 — 401 on resolve → EXIT.auth (exit code 2)
  // -------------------------------------------------------------------------

  test('401 on resolve returns auth exit code and stderr message', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      failures: { resolve: 'auth' }
    })

    const installDir = join(env.cwd, 'skills-auth')
    await mkdir(installDir, { recursive: true })

    const result = await runCli(
      [
        'install', 'pdf-parser',
        '--dir', installDir,
        '--registry', registry.url,
        '--token', 'sk_bad'
      ],
      { HOME: env.home, USERPROFILE: env.home }
    )

    // EXIT.auth = 2
    expect(result.exitCode).toBe(2)
    expect(result.stderr.toLowerCase()).toMatch(/auth|unauthorized|401/)
  })

  // -------------------------------------------------------------------------
  // P1 — --namespace override
  // -------------------------------------------------------------------------

  test('--namespace override installs under the specified namespace', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({
      token: 'sk_ok',
      user: { handle: 'u1', displayName: 'User One' },
      skills: [
        {
          namespace: 'myteam',
          slug: 'mything',
          version: '2.0.0',
          zipBytes: makeSkillZip()
        }
      ]
    })

    await runCli(
      ['login', '--registry', registry.url, '--token', 'sk_ok'],
      { HOME: env.home, USERPROFILE: env.home }
    )

    const installDir = join(env.cwd, 'skills-ns')
    await mkdir(installDir, { recursive: true })

    const result = await runCli(
      [
        'install', 'mything',
        '--namespace', 'myteam',
        '--dir', installDir,
        '--registry', registry.url,
        '--token', 'sk_ok'
      ],
      { HOME: env.home, USERPROFILE: env.home }
    )

    expect(result.exitCode).toBe(0)

    const metaPath = join(installDir, 'mything', '.skillhub', 'metadata.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'))
    expect(meta.namespace).toBe('myteam')
    expect(meta.slug).toBe('mything')
    expect(meta.version).toBe('2.0.0')
  })

  // -------------------------------------------------------------------------
  // NOTE: multi-target interactive selection (TTY branch) is not tested here
  // because Bun.spawn does not support PTY allocation. The interactive path
  // in resolveInstallTargets() is covered by the unit tests in
  // test/unit/agents/resolver.test.ts.
  // -------------------------------------------------------------------------
})
