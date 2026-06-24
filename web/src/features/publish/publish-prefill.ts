const VALID_VISIBILITIES = new Set(['WAREHOUSE', 'PRIVATE'])

interface PublishPrefillSearch {
  namespace?: string
  visibility?: string
}

export interface PublishPrefillState {
  namespace: string
  visibility: string
}

function normalizeVisibility(rawVisibility: string): string {
  const normalized = rawVisibility.trim().toUpperCase()
  if (normalized === 'PUBLIC' || normalized === 'NAMESPACE_ONLY') {
    return 'WAREHOUSE'
  }
  return VALID_VISIBILITIES.has(normalized) ? normalized : 'WAREHOUSE'
}

export function normalizePublishPrefill(search: PublishPrefillSearch): PublishPrefillState {
  const namespace = typeof search.namespace === 'string' ? search.namespace.trim() : ''
  const normalizedVisibility = typeof search.visibility === 'string'
    ? normalizeVisibility(search.visibility)
    : 'WAREHOUSE'

  return {
    namespace,
    visibility: normalizedVisibility,
  }
}
