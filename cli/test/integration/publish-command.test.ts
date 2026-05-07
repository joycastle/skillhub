import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'
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

async function login(env: { home: string }, registryUrl: string) {
  const result = await runCli(['login', '--registry', registryUrl, '--token', 'sk_ok'], {
    HOME: env.home,
    USERPROFILE: env.home
  })
  if (result.exitCode !== 0) {
    throw new Error(`login failed: ${result.stderr}`)
  }
}

async function makeTempDir(...files: Array<[string, string]>) {
  const dir = await mkdtemp(join(tmpdir(), 'skillhub-publish-dir-'))
  for (const [name, content] of files) {
    await writeFile(join(dir, name), content)
  }
  return dir
}

async function makeTempZip(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'skillhub-publish-zip-'))
  const zipPath = join(dir, name)
  const bytes = zipSync({ 'SKILL.md': new TextEncoder().encode('# Demo') })
  await writeFile(zipPath, bytes)
  return zipPath
}

async function makeTempTxt(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'skillhub-publish-txt-'))
  const txtPath = join(dir, name)
  await writeFile(txtPath, 'not a zip')
  return txtPath
}

// ---------------------------------------------------------------------------
// P0 — must-have
// ---------------------------------------------------------------------------

describe('publish command — P0', () => {
  test('unauthenticated publish is rejected with EXIT.auth', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })

    const dir = await makeTempDir(['SKILL.md', '# Demo'])
    const result = await runCli(['publish', dir, '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('authentication')
  })

  test('path not found returns filesystem error', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const result = await runCli(['publish', '/does/not/exist', '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('not found')
  })

  test('non-zip file is rejected', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const txtPath = await makeTempTxt('skill.txt')
    const result = await runCli(['publish', txtPath, '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('zip')
  })

  test('directory happy path: exit 0, default namespace=global, fileName ends in .zip, visibility=PUBLIC', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const dir = await makeTempDir(['SKILL.md', '# Demo'], ['index.js', 'console.log("hi")'])
    const result = await runCli(['publish', dir, '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(0)
    expect(registry.received.publish).not.toBeNull()
    expect(registry.received.publish!.namespace).toBe('global')
    expect(registry.received.publish!.fileName).toMatch(/\.zip$/)
    expect(registry.received.publish!.visibility).toBe('PUBLIC')
  })

  test('zip file happy path: exit 0, fileName matches passed file', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const zipPath = await makeTempZip('my-skill.zip')
    const result = await runCli(['publish', zipPath, '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(0)
    expect(registry.received.publish).not.toBeNull()
    expect(registry.received.publish!.fileName).toBe('my-skill.zip')
  })

  describe('visibility mapping', () => {
    test('--visibility public → PUBLIC', async () => {
      const env = await createTempHome()
      registry = await startFakeRegistry({ token: 'sk_ok' })
      await login(env, registry.url)

      const dir = await makeTempDir(['SKILL.md', '# Demo'])
      await runCli(['publish', dir, '--registry', registry.url, '--visibility', 'public'], {
        HOME: env.home,
        USERPROFILE: env.home
      })

      expect(registry.received.publish!.visibility).toBe('PUBLIC')
    })

    test('--visibility namespace-only → NAMESPACE_ONLY', async () => {
      const env = await createTempHome()
      registry = await startFakeRegistry({ token: 'sk_ok' })
      await login(env, registry.url)

      const dir = await makeTempDir(['SKILL.md', '# Demo'])
      await runCli(['publish', dir, '--registry', registry.url, '--visibility', 'namespace-only'], {
        HOME: env.home,
        USERPROFILE: env.home
      })

      expect(registry.received.publish!.visibility).toBe('NAMESPACE_ONLY')
    })

    test('--visibility private → PRIVATE', async () => {
      const env = await createTempHome()
      registry = await startFakeRegistry({ token: 'sk_ok' })
      await login(env, registry.url)

      const dir = await makeTempDir(['SKILL.md', '# Demo'])
      await runCli(['publish', dir, '--registry', registry.url, '--visibility', 'private'], {
        HOME: env.home,
        USERPROFILE: env.home
      })

      expect(registry.received.publish!.visibility).toBe('PRIVATE')
    })
  })
})

// ---------------------------------------------------------------------------
// P1 — should-have
// ---------------------------------------------------------------------------

describe('publish command — P1', () => {
  test('--namespace override is forwarded to server', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const dir = await makeTempDir(['SKILL.md', '# Demo'])
    const result = await runCli(['publish', dir, '--registry', registry.url, '--namespace', 'myteam'], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(0)
    expect(registry.received.publish!.namespace).toBe('myteam')
  })

  test('--json output has correct shape including detailUrl', async () => {
    const env = await createTempHome()
    registry = await startFakeRegistry({ token: 'sk_ok' })
    await login(env, registry.url)

    const dir = await makeTempDir(['SKILL.md', '# Demo'])
    const result = await runCli(['publish', dir, '--registry', registry.url, '--json'], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(json.namespace).toBe('global')
    expect(typeof json.slug).toBe('string')
    expect(typeof json.version).toBe('string')
    expect(typeof json.visibility).toBe('string')
    expect(json.detailUrl).toContain(registry.url)
    expect(json.detailUrl).toContain('global')
    expect(json.detailUrl).toContain(encodeURIComponent(json.slug))
  })

  test('server error during publish returns EXIT.network', async () => {
    const env = await createTempHome()
    // 'server_error' returns HTTP 500, which the client maps to EXIT.network.
    registry = await startFakeRegistry({ token: 'sk_ok', failures: { publish: 'server_error' } })
    await login(env, registry.url)

    const dir = await makeTempDir(['SKILL.md', '# Demo'])
    const result = await runCli(['publish', dir, '--registry', registry.url], {
      HOME: env.home,
      USERPROFILE: env.home
    })

    expect(result.exitCode).toBe(3)
    expect(result.stderr).toContain('registry')
  })
})
