import { isGovernanceEnabled } from '@/shared/config/features'

/**
 * Maps workflow-only statuses to user-facing labels when governance is disabled.
 */
export function normalizeVersionStatusForDisplay(status?: string): string | undefined {
  if (!status || isGovernanceEnabled()) {
    return status
  }
  if (status === 'PENDING_REVIEW' || status === 'REJECTED') {
    return 'PUBLISHED'
  }
  return status
}

export function shouldShowSkillWorkflowStatus(): boolean {
  return isGovernanceEnabled()
}
