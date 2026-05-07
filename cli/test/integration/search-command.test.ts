import { afterEach, describe, expect, test } from 'bun:test'
import { startFakeRegistry } from '../helpers/fake-registry'
import { runCli } from '../helpers/run-cli'

let registry: Awaited<ReturnType<typeof startFakeRegistry>> | undefined

afterEach(() => {
  registry?.stop()
  registry = undefined
})

describe('search command', () => {
  test('prints compact search table', async () => {
    registry = await startFakeRegistry({
      searchItems: [{ namespace: 'global', slug: 'pdf-parser', latestVersion: '1.2.0', summary: 'Parse PDFs' }]
    })

    const result = await runCli(['search', 'pdf', '--registry', registry.url])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/pdf-parser')
    expect(result.stdout).toContain('1.2.0')
  })

  test('search json output', async () => {
    registry = await startFakeRegistry({
      searchItems: [{ namespace: 'global', slug: 'pdf-parser', latestVersion: '1.2.0', summary: 'Parse PDFs' }]
    })

    const result = await runCli(['search', 'pdf', '--registry', registry.url, '--json'])

    expect(result.exitCode).toBe(0)
    const json = JSON.parse(result.stdout)
    expect(json.ok).toBe(true)
    expect(json.items).toHaveLength(1)
    expect(json.items[0].slug).toBe('pdf-parser')
  })

  test('search without query returns full result set', async () => {
    registry = await startFakeRegistry({
      searchItems: [
        { namespace: 'global', slug: 'pdf-parser', latestVersion: '1.2.0', summary: 'Parse PDFs' },
        { namespace: 'global', slug: 'doc-parser', latestVersion: '2.0.0', summary: 'Parse docs' }
      ]
    })

    const result = await runCli(['search', '--registry', registry.url])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('global/pdf-parser')
    expect(result.stdout).toContain('global/doc-parser')
  })

  // P1: empty result set
  test('prints "No skills found." when registry returns empty list', async () => {
    registry = await startFakeRegistry({ searchItems: [] })

    const result = await runCli(['search', 'nonexistent', '--registry', registry.url])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('No skills found.')
  })

  // P1: --limit forwarding — unit-level assertion that limit=5 appears in URL
  test('--limit 5 sends limit=5 in the search URL', async () => {
    // Capture the raw request URL inside the fake server by extending it
    // minimally: we start a real Bun server that records the last search URL.
    let capturedUrl = ''
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/api/cli/v1/skills/search') {
          capturedUrl = req.url
          return Response.json({
            code: 0,
            data: { items: [], total: 0, limit: 5 }
          })
        }
        return Response.json({ code: 404, message: 'not found' }, { status: 404 })
      }
    })
    const registryUrl = `http://localhost:${server.port}`

    try {
      const result = await runCli(['search', 'pdf', '--limit', '5', '--registry', registryUrl])
      expect(result.exitCode).toBe(0)
      expect(capturedUrl).toContain('limit=5')
    } finally {
      server.stop()
    }
  })

  // P1: network failure → EXIT.network. The exit code is the contract; the
  // exact message can be "registry unreachable" (when fetch throws) or
  // "registry returned 5xx" (when Bun returns a 5xx Response on connection
  // refusal). Both indicate the same network-class failure.
  test('exits with network error code when registry is unreachable', async () => {
    registry = await startFakeRegistry({ failures: { search: 'network' } })

    const result = await runCli(['search', 'pdf', '--registry', registry.url])

    expect(result.exitCode).toBe(3) // EXIT.network
    expect(result.stderr).toMatch(/registry unreachable|registry returned 5\d\d/)
  })
})
