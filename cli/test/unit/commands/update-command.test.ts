import { describe, expect, test } from 'bun:test'
import { CLI_VERSION } from '../../../src/shared/constants'
import { CliError } from '../../../src/shared/errors'
import { updateCommand, type UpdateCommandDeps } from '../../../src/commands/update'
import type { InstallMode } from '../../../src/platform/package-manager'
import type { UpdaterRunResult } from '../../../src/platform/updater'

// Branch coverage for `updateCommand`. Integration tests hit the live npm
// registry and accept any output, so they don't verify the four output
// branches of the command wrapper. We drive each branch by injecting fake
// deps via the command's optional `deps` parameter — no process-global
// module mocks, so tests cannot leak across files.
//
// Branches under test (see cli/src/commands/update.ts):
//   1. !result.available       -> "already up to date"
//   2. result.updated          -> "Updated skillhub X -> Y"
//   3. result.error            -> throws CliError
//   4. available && !updated   -> "Update available" + optional next hint

interface FakeState {
  latest: string
  mode: InstallMode
  runResult: UpdaterRunResult
}

function buildDeps(state: FakeState): Required<UpdateCommandDeps> {
  return {
    latestVersion: async () => state.latest,
    detectInstallMode: () => state.mode,
    run: async () => state.runResult
  }
}

describe('updateCommand branches', () => {
  test('up-to-date branch (human)', async () => {
    const deps = buildDeps({ latest: CLI_VERSION, mode: 'npm-global', runResult: { success: true, output: '' } })
    const out = await updateCommand({}, deps)
    expect(out).toContain('Already up to date')
    expect(out).toContain(CLI_VERSION)
  })

  test('up-to-date branch (--json)', async () => {
    const deps = buildDeps({ latest: CLI_VERSION, mode: 'npm-global', runResult: { success: true, output: '' } })
    const out = await updateCommand({ json: true }, deps)
    expect(JSON.parse(out)).toEqual({ ok: true, upToDate: true, version: CLI_VERSION })
  })

  test('updated success branch — npm-global with run() success (human)', async () => {
    const deps = buildDeps({ latest: '99.0.0', mode: 'npm-global', runResult: { success: true, output: '' } })
    const out = await updateCommand({}, deps)
    expect(out).toContain(`Updated skillhub ${CLI_VERSION} -> 99.0.0`)
  })

  test('updated success branch — npm-global with run() success (--json)', async () => {
    const deps = buildDeps({ latest: '99.0.0', mode: 'npm-global', runResult: { success: true, output: '' } })
    const out = await updateCommand({ json: true }, deps)
    expect(JSON.parse(out)).toEqual({ ok: true, updated: true, from: CLI_VERSION, to: '99.0.0' })
  })

  test('available-not-updated branch — npx mode emits next hint (human)', async () => {
    const deps = buildDeps({ latest: '99.0.0', mode: 'npx', runResult: { success: true, output: '' } })
    const out = await updateCommand({}, deps)
    expect(out).toContain(`Update available: ${CLI_VERSION} -> 99.0.0`)
    expect(out).toContain('npx @astron-team/skillhub')
  })

  test('available-not-updated branch — npx mode (--json)', async () => {
    const deps = buildDeps({ latest: '99.0.0', mode: 'npx', runResult: { success: true, output: '' } })
    const out = await updateCommand({ json: true }, deps)
    const parsed = JSON.parse(out)
    expect(parsed.ok).toBe(true)
    expect(parsed.available).toBe(true)
    expect(parsed.from).toBe(CLI_VERSION)
    expect(parsed.to).toBe('99.0.0')
    expect(typeof parsed.next).toBe('string')
    expect(parsed.next).toContain('npx @astron-team/skillhub')
  })

  test('error branch — npm-global with run() failure throws CliError', async () => {
    const deps = buildDeps({
      latest: '99.0.0',
      mode: 'npm-global',
      runResult: { success: false, output: 'install command failed: permission denied' }
    })
    let caught: unknown
    try {
      await updateCommand({}, deps)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CliError)
    expect((caught as CliError).message).toContain('install command failed')
  })
})
