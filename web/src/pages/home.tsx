import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '@/features/search/search-bar'
import { SkillCard } from '@/features/skill/skill-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { normalizeSearchQuery } from '@/shared/lib/search-query'
import { Button } from '@/shared/ui/button'
import { BrandMark } from '@/shared/components/brand-mark'

const HERO_CTA_CLASS =
  'inline-flex min-w-[9.5rem] items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.35)] bg-white px-8 py-3 text-base font-medium text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--secondary))]'

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: popularSkills, isLoading: isLoadingPopular } = useSearchSkills({
    sort: 'downloads',
    size: 6,
  })

  const { data: latestSkills, isLoading: isLoadingLatest } = useSearchSkills({
    sort: 'newest',
    size: 6,
  })

  const handleSearch = (query: string) => {
    navigate({ to: '/search', search: { q: normalizeSearchQuery(query), sort: 'relevance', page: 0, starredOnly: false } })
  }

  const handleSkillClick = (namespace: string, slug: string) => {
    navigate({ to: `/space/${namespace}/${encodeURIComponent(slug)}` })
  }

  return (
    <div className="space-y-20">
      <div className="text-center space-y-8 py-16 animate-fade-up">
        <div className="space-y-4">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-brand-gradient leading-tight">
            {t('brand.name')}
          </h1>
          <p className="text-xl md:text-2xl max-w-2xl mx-auto" style={{ color: 'hsl(var(--text-secondary))' }}>
            {t('brand.tagline')}
          </p>
          <div className="flex justify-center pt-2">
            <BrandMark size="lg" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto animate-fade-up delay-1">
          <SearchBar onSearch={handleSearch} />
        </div>

        <div className="flex items-center justify-center gap-3 animate-fade-up delay-2">
          <button
            type="button"
            className={HERO_CTA_CLASS}
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'relevance', page: 0, starredOnly: false } })}
          >
            {t('home.browseSkills')}
          </button>
          <button
            type="button"
            className={HERO_CTA_CLASS}
            onClick={() => navigate({ to: '/dashboard/publish' })}
          >
            {t('home.publishSkill')}
          </button>
        </div>
      </div>

      <section className="space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2" style={{ color: 'hsl(var(--foreground))' }}>
              {t('home.popularTitle')}
            </h2>
            <p style={{ color: 'hsl(var(--text-secondary))' }}>{t('home.popularDescription')}</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'downloads', page: 0, starredOnly: false } })}
          >
            {t('home.viewAll')}
          </Button>
        </div>
        {isLoadingPopular ? (
          <SkeletonList count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {popularSkills?.items.map((skill, idx) => (
              <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                <SkillCard
                  skill={skill}
                  onClick={() => handleSkillClick(skill.namespace, skill.slug)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2" style={{ color: 'hsl(var(--foreground))' }}>
              {t('home.latestTitle')}
            </h2>
            <p style={{ color: 'hsl(var(--text-secondary))' }}>{t('home.latestDescription')}</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'newest', page: 0, starredOnly: false } })}
          >
            {t('home.viewAll')}
          </Button>
        </div>
        {isLoadingLatest ? (
          <SkeletonList count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {latestSkills?.items.map((skill, idx) => (
              <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                <SkillCard
                  skill={skill}
                  onClick={() => handleSkillClick(skill.namespace, skill.slug)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
