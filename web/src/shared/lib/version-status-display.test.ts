import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/features', () => ({
  isGovernanceEnabled: vi.fn(() => false),
}))

import { normalizeVersionStatusForDisplay, shouldShowSkillWorkflowStatus } from './version-status-display'

describe('version-status-display', () => {
  it('maps review workflow statuses to published when governance is disabled', () => {
    expect(normalizeVersionStatusForDisplay('PENDING_REVIEW')).toBe('PUBLISHED')
    expect(normalizeVersionStatusForDisplay('REJECTED')).toBe('PUBLISHED')
    expect(normalizeVersionStatusForDisplay('SCANNING')).toBe('SCANNING')
  })

  it('hides workflow-only UI when governance is disabled', () => {
    expect(shouldShowSkillWorkflowStatus()).toBe(false)
  })
})
