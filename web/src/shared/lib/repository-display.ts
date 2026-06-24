import type { SkillRepository } from '@/api/types'

export function resolveRepositoryDisplayName(
  slug: string,
  repositories?: SkillRepository[],
): string {
  const match = repositories?.find((repository) => repository.slug === slug)
  return match?.displayName ?? slug
}

export function resolveDefaultRepositorySlug(repositories?: SkillRepository[]): string {
  const defaultRepository = repositories?.find((repository) => repository.defaultRepository)
  return defaultRepository?.slug ?? repositories?.[0]?.slug ?? 'global'
}
