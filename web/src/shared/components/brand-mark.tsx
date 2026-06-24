type BrandMarkSize = 'sm' | 'md' | 'lg'

const sizeClasses: Record<BrandMarkSize, string> = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16 md:h-20',
}

type BrandMarkProps = {
  size?: BrandMarkSize
  className?: string
}

export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  return (
    <img
      src="/joycastle-logo.png"
      alt="Joycastle"
      className={`w-auto object-contain ${sizeClasses[size]} ${className}`.trim()}
    />
  )
}
