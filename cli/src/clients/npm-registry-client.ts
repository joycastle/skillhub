import { EXIT, CLI_PACKAGE_NAME } from '../shared/constants'
import { CliError } from '../shared/errors'

export class NpmRegistryClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  async latestVersion(packageName = CLI_PACKAGE_NAME): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let response: Response
      try {
        response = await this.fetchImpl(`https://registry.npmjs.org/${packageName}/latest`, {
          signal: controller.signal
        })
      } catch {
        throw new CliError('npm registry unreachable', EXIT.network, {
          next: 'check network connectivity and retry'
        })
      }
      if (!response.ok) {
        throw new CliError(`npm registry returned ${response.status}`, EXIT.network)
      }
      const body = await response.json()
      if (typeof body.version !== 'string') {
        throw new CliError('npm registry response missing version', EXIT.network)
      }
      return body.version
    } finally {
      clearTimeout(timer)
    }
  }
}
