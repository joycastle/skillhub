/**
 * Feature flags for optional product surfaces.
 *
 * API tokens and governance workflows are disabled in the internal light deployment.
 */
export function isApiTokensEnabled(): boolean {
  return import.meta.env.VITE_SKILLHUB_API_TOKENS_ENABLED === 'true'
}

export function isGovernanceEnabled(): boolean {
  return import.meta.env.VITE_SKILLHUB_GOVERNANCE_ENABLED === 'true'
}
