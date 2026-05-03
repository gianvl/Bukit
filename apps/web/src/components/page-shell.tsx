import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Editorial design primitives shared across pages.
 * The aesthetic mirrors the landing: warm cream washes, dotted overlays,
 * Crimson Pro display headlines with italic accents, generous spacing.
 */

/* ─── Cream wash background ─────────────────────────────────────────── */

interface CreamBackgroundProps {
  /** Tone variation. 'warm' adds a subtle amber blob, 'cool' uses emerald only. */
  tone?: 'warm' | 'cool'
  /** Additional Tailwind classes. */
  className?: string
}

/**
 * Absolute-positioned cream + gradient + dotted-grid background.
 * Drop into any `relative overflow-hidden` parent.
 */
export function CreamBackground({ tone = 'warm', className }: CreamBackgroundProps) {
  const gradient =
    tone === 'warm'
      ? 'radial-gradient(60% 80% at 12% 10%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(40% 60% at 95% 90%, rgba(251,191,36,0.10), transparent 60%), linear-gradient(180deg, #f9f7f1 0%, #fbfaf6 100%)'
      : 'radial-gradient(60% 80% at 12% 10%, rgba(16,185,129,0.10), transparent 60%), linear-gradient(180deg, #f9f7f1 0%, #fbfaf6 100%)'

  return (
    <>
      <div
        aria-hidden
        className={cn('absolute inset-0 -z-10', className)}
        style={{ background: gradient }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-full -z-10 opacity-30 mask-[radial-gradient(ellipse_at_center,black_30%,transparent_70%)]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 0.6px, transparent 0.6px)',
          backgroundSize: '22px 22px',
          color: 'rgba(15,23,42,0.10)',
        }}
      />
    </>
  )
}

/* ─── Eyebrow ───────────────────────────────────────────────────────── */

interface PageEyebrowProps {
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}

/** `KICKER · STYLE` uppercase eyebrow with optional leading icon. */
export function PageEyebrow({ icon: Icon, children, className }: PageEyebrowProps) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground',
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5 text-primary" /> : <span className="inline-block size-1.5 rounded-full bg-primary" />}
      {children}
    </p>
  )
}

/* ─── Display title with italic accent ──────────────────────────────── */

interface PageTitleProps {
  /** Main text. */
  children: ReactNode
  /** Italic, primary-toned accent appended to the title (rendered after a soft break). */
  accent?: ReactNode
  /** Override the responsive size. */
  size?: 'lg' | 'xl'
  className?: string
}

export function PageTitle({ children, accent, size = 'lg', className }: PageTitleProps) {
  const scale =
    size === 'xl'
      ? 'text-[clamp(3rem,7vw,5.75rem)] leading-[0.95]'
      : 'text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.05]'
  return (
    <h1
      className={cn(
        'font-display tracking-tight text-foreground',
        scale,
        className,
      )}
    >
      {children}
      {accent && (
        <>
          {' '}
          <span className="italic font-light text-primary">{accent}</span>
        </>
      )}
    </h1>
  )
}

/* ─── Hero wrapper ──────────────────────────────────────────────────── */

interface PageHeroProps {
  children: ReactNode
  /** Max content width. Default: 'max-w-6xl'. */
  maxWidth?: string
  /** Background tone. */
  tone?: 'warm' | 'cool'
  className?: string
}

/**
 * Section that paints a cream wash and centers content. Drop a PageEyebrow,
 * PageTitle, paragraph, and optional CTA row inside.
 */
export function PageHero({
  children,
  maxWidth = 'max-w-6xl',
  tone = 'warm',
  className,
}: PageHeroProps) {
  return (
    <section className={cn('relative overflow-hidden border-b', className)}>
      <CreamBackground tone={tone} />
      <div className={cn('relative mx-auto px-6 py-14 sm:py-20', maxWidth)}>{children}</div>
    </section>
  )
}

/* ─── Stat strip ────────────────────────────────────────────────────── */

interface StatProps {
  kpi: ReactNode
  label: string
}

export function PageStat({ kpi, label }: StatProps) {
  return (
    <div>
      <div className="font-display text-3xl text-foreground tracking-tight tabular-nums">{kpi}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

interface PageStatsProps {
  children: ReactNode
  className?: string
}

/** `<PageStats>` lays children in a 3-col strip with a top border. */
export function PageStats({ children, className }: PageStatsProps) {
  return (
    <dl
      className={cn(
        'mt-10 grid grid-cols-3 max-w-md border-t border-border/60 pt-6 gap-6',
        className,
      )}
    >
      {children}
    </dl>
  )
}
