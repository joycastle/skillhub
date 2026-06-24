import { useState, useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SkillCard } from '@/features/skill/skill-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { useSkillRepositories } from '@/shared/hooks/use-skill-repositories'
import { resolveRepositoryDisplayName } from '@/shared/lib/repository-display'

const PAGE_SIZE = 20

/**
 * Public repository page showing skills in a department catalog.
 */
export function NamespacePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { namespace } = useParams({ from: '/space/$namespace' })
  const [page, setPage] = useState(0)
  const { data: repositories, isLoading: isLoadingRepositories } = useSkillRepositories()
  const repositoryName = resolveRepositoryDisplayName(namespace, repositories)
  const repositoryExists = repositories?.some((item) => item.slug === namespace) ?? false

  useEffect(() => {
    setPage(0)
  }, [namespace])

  const { data: skillsData, isLoading: isLoadingSkills } = useSearchSkills({
    namespace,
    page,
    size: PAGE_SIZE,
  })

  const totalPages = skillsData ? Math.max(Math.ceil(skillsData.total / skillsData.size), 1) : 1

  const handleSkillClick = (slug: string) => {
    navigate({ to: `/space/${namespace}/${encodeURIComponent(slug)}` })
  }

  if (isLoadingRepositories) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="h-12 w-48 animate-shimmer rounded-lg" />
        <div className="h-6 w-96 animate-shimmer rounded-md" />
      </div>
    )
  }

  if (!repositoryExists) {
    return <EmptyState title={t('repository.notFound')} />
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold font-heading">{repositoryName}</h1>
        <p className="text-muted-foreground">{t('repository.skillListSubtitle')}</p>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold font-heading">{t('repository.skillList')}</h2>
        {isLoadingSkills ? (
          <SkeletonList count={6} />
        ) : skillsData && skillsData.items.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skillsData.items.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleSkillClick(skill.slug)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        ) : (
          <EmptyState
            title={t('repository.emptyTitle')}
            description={t('repository.emptyDescription')}
          />
        )}
      </div>
    </div>
  )
}
