import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UploadZone } from '@/features/publish/upload-zone'
import {
  extractPrecheckWarnings,
  isFrontmatterFailureMessage,
  isPrecheckConfirmationMessage,
  isPrecheckFailureMessage,
  isVersionExistsMessage,
} from '@/features/publish/publish-error-utils'
import { normalizePublishPrefill } from '@/features/publish/publish-prefill'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  normalizeSelectValue,
} from '@/shared/ui/select'
import { Label } from '@/shared/ui/label'
import { Card } from '@/shared/ui/card'
import { usePublishSkill, usePublishSkillsBatch } from '@/shared/hooks/use-skill-queries'
import { useSkillRepositories } from '@/shared/hooks/use-skill-repositories'
import { resolveDefaultRepositorySlug } from '@/shared/lib/repository-display'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { toast } from '@/shared/lib/toast'
import { ApiError } from '@/api/client'
import type { BatchPublishItemResult } from '@/api/types'

const EMPTY_REPOSITORY_VALUE = '__select_repository__'
const MAX_BATCH_FILES = 20

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function mergeSelectedFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map(fileKey))
  const merged = [...existing]
  for (const file of incoming) {
    const key = fileKey(file)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(file)
  }
  return merged.slice(0, MAX_BATCH_FILES)
}

export function PublishPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useSearch({ from: '/dashboard/publish' })
  const prefill = normalizePublishPrefill(search)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [repositorySlug, setRepositorySlug] = useState<string>(prefill.namespace)
  const [visibility, setVisibility] = useState<string>(prefill.visibility)
  const [warningDialogOpen, setWarningDialogOpen] = useState(false)
  const [precheckWarnings, setPrecheckWarnings] = useState<string[]>([])
  const [batchResults, setBatchResults] = useState<BatchPublishItemResult[] | null>(null)

  const { data: repositories, isLoading: isLoadingRepositories } = useSkillRepositories()
  const publishMutation = usePublishSkill()
  const publishBatchMutation = usePublishSkillsBatch()
  const isPublishing = publishMutation.isPending || publishBatchMutation.isPending

  useEffect(() => {
    setRepositorySlug(prefill.namespace)
    setVisibility(prefill.visibility)
  }, [prefill.namespace, prefill.visibility])

  useEffect(() => {
    if (repositorySlug || !repositories?.length) {
      return
    }
    setRepositorySlug(resolveDefaultRepositorySlug(repositories))
  }, [repositories, repositorySlug])

  const pendingConfirmFiles = useMemo(
    () => (batchResults ?? []).filter((item) => item.needsConfirmation),
    [batchResults]
  )

  const handleClearSelectedFiles = () => {
    setSelectedFiles([])
    setPrecheckWarnings([])
    setWarningDialogOpen(false)
    setBatchResults(null)
  }

  const handleFilesSelect = (files: File[]) => {
    setSelectedFiles((current) => {
      const merged = mergeSelectedFiles(current, files)
      if (merged.length >= MAX_BATCH_FILES && current.length + files.length > MAX_BATCH_FILES) {
        toast.warning(t('publish.batchTooMany', { max: MAX_BATCH_FILES }))
      }
      return merged
    })
    setPrecheckWarnings([])
    setWarningDialogOpen(false)
    setBatchResults(null)
  }

  const handleRemoveFile = (target: File) => {
    setSelectedFiles((current) => current.filter((file) => fileKey(file) !== fileKey(target)))
    setBatchResults(null)
  }

  const publishSingle = async (file: File, confirmWarnings = false) => {
    if (!repositorySlug) {
      toast.error(t('publish.selectRequired'))
      return
    }

    try {
      const result = await publishMutation.mutateAsync({
        namespace: repositorySlug,
        file,
        visibility,
        confirmWarnings,
      })
      setPrecheckWarnings([])
      setWarningDialogOpen(false)
      const skillLabel = `${result.namespace}/${result.slug}@${result.version}`
      toast.success(
        t('publish.publishedTitle'),
        t('publish.publishedDescription', { skill: skillLabel })
      )
      navigate({ to: '/dashboard/skills' })
    } catch (error) {
      handlePublishError(error)
    }
  }

  const publishBatch = async (confirmWarnings = false) => {
    if (!repositorySlug || selectedFiles.length === 0) {
      toast.error(t('publish.selectRequired'))
      return
    }

    try {
      const result = await publishBatchMutation.mutateAsync({
        namespace: repositorySlug,
        files: selectedFiles,
        visibility,
        confirmWarnings,
      })

      setBatchResults(result.items)

      if (result.needsConfirmation > 0 && !confirmWarnings) {
        const warnings = result.items
          .filter((item) => item.needsConfirmation)
          .flatMap((item) => item.warnings ?? [])
        setPrecheckWarnings(warnings)
        setWarningDialogOpen(true)
        return
      }

      setPrecheckWarnings([])
      setWarningDialogOpen(false)

      if (result.failed === 0) {
        toast.success(
          t('publish.batchPublishedTitle'),
          t('publish.batchPublishedDescription', {
            succeeded: result.succeeded,
            failed: result.failed,
          })
        )
        navigate({ to: '/dashboard/skills' })
        return
      }

      if (result.succeeded > 0) {
        toast.warning(
          t('publish.batchPartialTitle'),
          t('publish.batchPublishedDescription', {
            succeeded: result.succeeded,
            failed: result.failed,
          })
        )
        return
      }

      toast.error(
        t('publish.batchAllFailedTitle'),
        t('publish.batchPublishedDescription', {
          succeeded: result.succeeded,
          failed: result.failed,
        })
      )
    } catch (error) {
      handlePublishError(error)
    }
  }

  const handlePublishError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 408) {
      toast.error(t('publish.timeoutTitle'), t('publish.timeoutDescription'))
      return
    }

    if (error instanceof ApiError && isVersionExistsMessage(error.serverMessage || error.message)) {
      toast.error(
        t('publish.versionExistsTitle'),
        t('publish.versionExistsDescription'),
      )
      return
    }

    if (error instanceof ApiError && isPrecheckConfirmationMessage(error.serverMessage || error.message)) {
      setPrecheckWarnings(extractPrecheckWarnings(error.serverMessage || error.message))
      setWarningDialogOpen(true)
      return
    }

    if (error instanceof ApiError && isPrecheckFailureMessage(error.serverMessage || error.message)) {
      toast.error(
        t('publish.precheckFailedTitle'),
        error.serverMessage || t('publish.precheckFailedDescription'),
      )
      return
    }

    if (error instanceof ApiError && isFrontmatterFailureMessage(error.serverMessage || error.message)) {
      toast.error(
        t('publish.frontmatterFailedTitle'),
        error.serverMessage || t('publish.frontmatterFailedDescription'),
      )
      return
    }

    toast.error(
      t('publish.error'),
      error instanceof ApiError ? (error.serverMessage || error.message) : (error instanceof Error ? error.message : '')
    )
  }

  const handlePublish = async () => {
    if (selectedFiles.length === 1) {
      await publishSingle(selectedFiles[0], false)
      return
    }
    await publishBatch(false)
  }

  const handleConfirmWarnings = async () => {
    if (selectedFiles.length === 1) {
      await publishSingle(selectedFiles[0], true)
      return
    }
    await publishBatch(true)
  }

  const confirmLabel = selectedFiles.length > 1
    ? t('publish.confirmBatch', { count: selectedFiles.length })
    : t('publish.confirm')

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-up">
      <DashboardPageHeader title={t('publish.title')} subtitle={t('publish.subtitle')} />

      <Card className="p-8 space-y-8">
        <div className="space-y-3">
          <Label htmlFor="repository" className="text-sm font-semibold font-heading">{t('publish.repository')}</Label>
          {isLoadingRepositories ? (
            <div className="h-11 animate-shimmer rounded-lg" />
          ) : (
            <Select
              value={normalizeSelectValue(repositorySlug) ?? EMPTY_REPOSITORY_VALUE}
              onValueChange={(value) => {
                setRepositorySlug(value === EMPTY_REPOSITORY_VALUE ? '' : value)
              }}
            >
              <SelectTrigger id="repository">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_REPOSITORY_VALUE}>{t('publish.selectRepository')}</SelectItem>
                {repositories?.map((repository) => (
                  <SelectItem key={repository.slug} value={repository.slug}>
                    {repository.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-3">
          <Label htmlFor="visibility" className="text-sm font-semibold font-heading">{t('publish.visibility')}</Label>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger id="visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WAREHOUSE">{t('publish.visibilityOptions.warehouse')}</SelectItem>
              <SelectItem value="PRIVATE">{t('publish.visibilityOptions.private')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-semibold font-heading">{t('publish.file')}</Label>
            {selectedFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('publish.filesSelected', { count: selectedFiles.length })}
              </span>
            )}
          </div>
          <UploadZone
            onFilesSelect={handleFilesSelect}
            disabled={isPublishing}
            multiple
            maxFiles={MAX_BATCH_FILES}
          />
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map((file) => (
                <div
                  key={fileKey(file)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3"
                >
                  <div className="min-w-0 text-sm text-muted-foreground flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="truncate">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveFile(file)}
                    disabled={isPublishing}
                  >
                    {t('publish.removeFile')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearSelectedFiles}
                disabled={isPublishing}
              >
                {t('publish.clearAllFiles')}
              </Button>
            </div>
          )}
        </div>

        {batchResults && batchResults.some((item) => !item.success) && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-4">
            {batchResults.map((item) => (
              <div key={item.filename} className="text-sm">
                <span className="font-medium">{item.filename}</span>
                {' — '}
                {item.success ? (
                  <span className="text-emerald-600">
                    {t('publish.batchResultSuccess')}
                    {item.publish ? `: ${item.publish.namespace}/${item.publish.slug}@${item.publish.version}` : ''}
                  </span>
                ) : item.needsConfirmation ? (
                  <span className="text-amber-600">{t('publish.batchResultNeedsConfirm')}</span>
                ) : (
                  <span className="text-destructive">
                    {t('publish.batchResultFailed')}
                    {item.errorMessage ? `: ${item.errorMessage}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <Button
          className="w-full text-primary-foreground disabled:text-primary-foreground"
          size="lg"
          onClick={handlePublish}
          disabled={selectedFiles.length === 0 || !repositorySlug || isPublishing}
        >
          {isPublishing ? t('publish.publishing') : confirmLabel}
        </Button>
      </Card>

      <ConfirmDialog
        open={warningDialogOpen}
        onOpenChange={setWarningDialogOpen}
        title={t('publish.warningConfirmTitle')}
        description={(
          <div className="space-y-3 text-left">
            <p>{t('publish.warningConfirmDescription')}</p>
            {pendingConfirmFiles.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {pendingConfirmFiles.map((item) => (
                  <li key={item.filename}>{item.filename}</li>
                ))}
              </ul>
            )}
            {precheckWarnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {precheckWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        confirmText={t('publish.warningConfirmContinue')}
        cancelText={t('publish.warningConfirmCancel')}
        onConfirm={handleConfirmWarnings}
      />
    </div>
  )
}
