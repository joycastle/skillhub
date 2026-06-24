import { describe, expect, it } from 'vitest'
import { normalizePublishPrefill } from './publish-prefill'

describe('normalizePublishPrefill', () => {
  it('keeps namespace and normalizes visibility for valid route search params', () => {
    expect(normalizePublishPrefill({
      namespace: 'team-ai',
      visibility: 'private',
    })).toEqual({
      namespace: 'team-ai',
      visibility: 'PRIVATE',
    })
  })

  it('falls back to WAREHOUSE when visibility is missing or invalid', () => {
    expect(normalizePublishPrefill({
      namespace: 'team-ai',
      visibility: 'internal',
    })).toEqual({
      namespace: 'team-ai',
      visibility: 'WAREHOUSE',
    })
  })

  it('maps legacy PUBLIC visibility to WAREHOUSE', () => {
    expect(normalizePublishPrefill({
      namespace: 'global',
      visibility: 'PUBLIC',
    })).toEqual({
      namespace: 'global',
      visibility: 'WAREHOUSE',
    })
  })

  it('trims namespace input from search params', () => {
    expect(normalizePublishPrefill({
      namespace: '  team-ml  ',
    })).toEqual({
      namespace: 'team-ml',
      visibility: 'WAREHOUSE',
    })
  })
})
