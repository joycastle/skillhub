import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/shared/lib/utils'

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
  maxFiles?: number
}

const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tgz', '.gz'] as const
const DEFAULT_MAX_FILES = 20

function isSupportedArchive(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return ARCHIVE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

/**
 * Dropzone for uploading one or many archive packages on the publish page.
 */
export function UploadZone({
  onFilesSelect,
  disabled,
  multiple = true,
  maxFiles = DEFAULT_MAX_FILES,
}: UploadZoneProps) {
  const { t } = useTranslation()
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelect(acceptedFiles)
      }
    },
    [onFilesSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-tar': ['.tar'],
      'application/gzip': ['.gz', '.tgz', '.tar.gz'],
      'application/x-gzip': ['.gz', '.tgz', '.tar.gz'],
    },
    validator: (file) => {
      if (!isSupportedArchive(file)) {
        return {
          code: 'file-invalid-type',
          message: t('upload.unsupportedFormat'),
        }
      }
      return null
    },
    multiple,
    maxFiles: multiple ? maxFiles : 1,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'upload-zone rounded-xl p-10 text-center cursor-pointer transition-all duration-300',
        isDragActive && 'border-primary bg-primary/5 scale-[1.01]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center">
          <svg
            className={cn(
              'w-7 h-7 upload-zone-icon transition-colors',
              isDragActive && 'text-primary'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        {isDragActive ? (
          <p className="text-sm text-primary font-medium">{t('upload.dropHint')}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              {multiple ? t('upload.dragHintMultiple') : t('upload.dragHint')}
            </p>
            <p className="text-xs text-muted-foreground">
              {multiple ? t('upload.formatHintMultiple', { max: maxFiles }) : t('upload.formatHint')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
