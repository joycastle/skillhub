import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ namespace: 'global' }),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@/features/skill/skill-card', () => ({
  SkillCard: () => null,
}))

vi.mock('@/shared/components/skeleton-loader', () => ({
  SkeletonList: () => null,
}))

vi.mock('@/shared/components/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('@/shared/components/pagination', () => ({
  Pagination: () => null,
}))

const useSkillRepositoriesMock = vi.fn()
vi.mock('@/shared/hooks/use-skill-repositories', () => ({
  useSkillRepositories: () => useSkillRepositoriesMock(),
}))

vi.mock('@/shared/hooks/use-skill-queries', () => ({
  useSearchSkills: () => ({
    data: {
      items: [
        {
          id: 1,
          displayName: 'Demo Skill',
          summary: 'summary',
          namespace: 'global',
          slug: 'demo',
          downloadCount: 1,
          starCount: 1,
          ratingCount: 0,
          updatedAt: '2026-03-20T00:00:00Z',
          canSubmitPromotion: false,
          publishedVersion: { id: 10, version: '1.0.0', status: 'PUBLISHED' },
        },
      ],
      total: 1,
      page: 0,
      size: 20,
    },
    isLoading: false,
  }),
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { NamespacePage } from './namespace'

describe('NamespacePage', () => {
  beforeEach(() => {
    useSkillRepositoriesMock.mockReturnValue({
      data: [{ slug: 'global', displayName: 'JoyHub公共库', defaultRepository: true }],
      isLoading: false,
    })
  })

  it('exports a named component function', () => {
    expect(typeof NamespacePage).toBe('function')
  })

  it('renders the not-found state when repository is missing from catalog', () => {
    useSkillRepositoriesMock.mockReturnValue({
      data: [{ slug: 'lab', displayName: 'Lab', defaultRepository: false }],
      isLoading: false,
    })

    const html = renderToStaticMarkup(<NamespacePage />)
    expect(html).toContain('repository.notFound')
  })

  it('renders repository skills when catalog contains the slug', () => {
    const html = renderToStaticMarkup(<NamespacePage />)
    expect(html).toContain('repository.skillList')
  })
})
