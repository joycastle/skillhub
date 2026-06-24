import { useQuery } from '@tanstack/react-query'
import { repositoryApi } from '@/api/client'

export function useSkillRepositories() {
  return useQuery({
    queryKey: ['repositories'],
    queryFn: () => repositoryApi.list(),
    staleTime: 5 * 60 * 1000,
  })
}
