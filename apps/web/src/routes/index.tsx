import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  Shirt,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Wallet,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCentavos } from '@/lib/format'
import { useSession } from '@/lib/auth-client'
import { meQueryOptions } from '@/features/me/api'
import {
  servicesQueryOptions,
  type ServiceWithTiers,
} from '@/features/service-tiers/queries'
import { UserHome } from '@/components/user-home'

export const Route = createFileRoute('/')({
  component: HomeRoute,
})

function HomeRoute() {
  const { data: session, isPending: sessionPending } = useSession()
  // Only fetch /me when signed in. The query options return null on 401/403 too.
  const { data: me } = useQuery({
    ...meQueryOptions,
    enabled: !!session?.user,
  })

  // While determining auth, render nothing — avoids a marketing flash for signed-in users.
  if (sessionPending) return null

  // Signed-in but not yet onboarded → onboarding flow handles redirects elsewhere; render nothing here.
  if (session?.user && me && !me.onboardedAt) return null

  if (session?.user && me?.onboardedAt) {
    return <UserHome />
  }

  return <LandingPage />
}

function LandingPage() {
  return (
    <div className="font-sans">
      <Hero />
      <HowItWorks />
      <Tiers />
      <TrustGrid />
      <ClosingCta />
      <SiteFooter />
    </div>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

const heroParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const heroChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <CreamWash />
      <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28 lg:py-32">
        <motion.div
          variants={heroParent}
          initial="hidden"
          animate="show"
          className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 items-center"
        >
          <div>
            <motion.div variants={heroChild} className="flex items-center gap-2 text-xs tracking-[0.18em] uppercase text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-primary" />
              Established 2026 · Metro Manila
            </motion.div>

            <motion.h1
              variants={heroChild}
              className="mt-6 font-display text-[clamp(3rem,7vw,5.75rem)] leading-[0.95] tracking-tight text-foreground"
            >
              Trusted home help,
              <br />
              <span className="italic font-light text-primary">on your terms.</span>
            </motion.h1>

            <motion.p
              variants={heroChild}
              className="mt-7 max-w-md text-base sm:text-lg text-muted-foreground leading-relaxed"
            >
              Book vetted home services across Metro Manila — cleaning, laundry,
              repairs, and more. Flat rates set upfront. Pay with GCash, Maya, or
              card. No surprises, ever.
            </motion.p>

            <motion.div variants={heroChild} className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full px-6 h-12 text-base">
                <Link to="/services">
                  Book a service
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="rounded-full px-5 h-12 text-base">
                <a href="#how-it-works" className="inline-flex items-center gap-2">
                  How Bukit works
                </a>
              </Button>
            </motion.div>

            <motion.dl
              variants={heroChild}
              className="mt-12 grid grid-cols-3 max-w-sm border-t border-border/60 pt-6 gap-4"
            >
              <Stat kpi="NCR" label="all of Metro Manila" />
              <Stat kpi="24h" label="KYC review" />
              <Stat kpi="₱100" label="from / booking" />
            </motion.dl>
          </div>

          <motion.div variants={heroChild} className="lg:justify-self-end w-full max-w-sm">
            <AvailabilityCard />
          </motion.div>
        </motion.div>
      </div>

      {/* Scrolling marquee strip */}
      <Marquee />
    </section>
  )
}

function Stat({ kpi, label }: { kpi: string; label: string }) {
  return (
    <div>
      <dt className="font-display text-3xl text-foreground tracking-tight">{kpi}</dt>
      <dd className="mt-1 text-xs text-muted-foreground">{label}</dd>
    </div>
  )
}

function CreamWash() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 80% at 12% 10%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(40% 60% at 95% 90%, rgba(251,191,36,0.10), transparent 60%), linear-gradient(180deg, #f9f7f1 0%, #fbfaf6 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* faint dotted grid */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-full -z-10 opacity-30 mask-[radial-gradient(ellipse_at_center,black_30%,transparent_70%)]"
        style={{
          backgroundImage:
            'radial-gradient(currentColor 0.6px, transparent 0.6px)',
          backgroundSize: '22px 22px',
          color: 'rgba(15,23,42,0.10)',
        }}
      />
    </>
  )
}

function AvailabilityCard() {
  const providers = [
    { initials: 'LR', name: 'Liza R.', tone: 'bg-emerald-100 text-emerald-900' },
    { initials: 'MJ', name: 'Marco J.', tone: 'bg-amber-100 text-amber-900' },
    { initials: 'JA', name: 'Joy A.', tone: 'bg-rose-100 text-rose-900' },
    { initials: 'AC', name: 'Andrei C.', tone: 'bg-sky-100 text-sky-900' },
  ]
  return (
    <div className="rounded-3xl border bg-card/90 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <PulseDot />
        Available now
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="font-display text-5xl leading-none">12</p>
          <p className="mt-1 text-sm text-muted-foreground">providers nearby</p>
        </div>
        <div className="flex -space-x-2">
          {providers.map((c) => (
            <span
              key={c.initials}
              className={
                'inline-flex size-9 items-center justify-center rounded-full ring-2 ring-card text-xs font-medium ' +
                c.tone
              }
              title={c.name}
            >
              {c.initials}
            </span>
          ))}
        </div>
      </div>
      <hr className="my-5 border-border/60" />
      <ul className="space-y-3 text-sm">
        <Slot time="10:30 AM" name="Liza R." rating="4.9" jobs="312 jobs" />
        <Slot time="1:00 PM" name="Marco J." rating="4.8" jobs="187 jobs" />
        <Slot time="3:30 PM" name="Joy A." rating="5.0" jobs="64 jobs" />
      </ul>
      <Button asChild className="mt-5 w-full rounded-full" variant="outline">
        <Link to="/services">
          Book the next slot
          <ArrowUpRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}

function PulseDot() {
  return (
    <span className="relative inline-flex">
      <span className="absolute inline-flex size-2 rounded-full bg-emerald-500 opacity-75 animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
    </span>
  )
}

function Slot({ time, name, rating, jobs }: { time: string; name: string; rating: string; jobs: string }) {
  return (
    <li className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-display text-base text-foreground tabular-nums">{time}</span>
        <span className="text-muted-foreground">{name}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        ★ {rating} · {jobs}
      </span>
    </li>
  )
}

function Marquee() {
  const items = [
    'Home services on demand',
    'Vetted via NBI clearance',
    'Flat rates upfront',
    'GCash · Maya · card',
    'All of Metro Manila',
    '24-hour KYC',
    'No subscriptions',
  ]
  return (
    <div className="border-t bg-background overflow-hidden">
      <div className="relative flex gap-12 py-4 whitespace-nowrap will-change-transform animate-[marquee_40s_linear_infinite]">
        {Array.from({ length: 2 }).map((_, copy) => (
          <ul key={copy} className="flex items-center gap-12 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {items.map((item, i) => (
              <li key={`${copy}-${i}`} className="inline-flex items-center gap-3">
                <Sparkles className="size-3 text-primary/70" />
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

/* ─── How it works ──────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Pick a service', body: 'Browse our menu — cleaning, laundry, repairs and more. Flat rates set upfront.' },
    { n: '02', title: 'Tell us when & where', body: 'Pick a time and address. Notes for your buzzer or pets.' },
    { n: '03', title: 'A vetted provider arrives', body: 'KYC-verified, rated, and matched to your area.' },
  ]
  return (
    <section id="how-it-works" className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader kicker="How it works" title="Three steps from booking to done." />
        <div className="mt-16 grid gap-px sm:grid-cols-3 bg-border/60 rounded-3xl overflow-hidden border">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="relative bg-background p-8 sm:p-10"
            >
              <span
                aria-hidden
                className="font-display absolute right-6 top-4 text-7xl font-light text-foreground/6"
              >
                {s.n}
              </span>
              <p className="text-xs tracking-[0.18em] uppercase text-primary/80">Step {s.n}</p>
              <h3 className="mt-3 font-display text-3xl leading-tight">{s.title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Featured services ─────────────────────────────────────────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  'spray-can': SprayCan,
  shirt: Shirt,
  wind: Wind,
  wrench: Wrench,
}

function iconFor(key: string): LucideIcon {
  return ICON_MAP[key] ?? Sparkles
}

function startingPrice(s: ServiceWithTiers): number | null {
  if (s.tiers.length === 0) return null
  return Math.min(...s.tiers.map((t) => t.basePriceCentavos))
}

/**
 * Live service tiles backed by the public catalog endpoint. Renders the
 * top 4 active services (already sorted by sortOrder by the API). The
 * landing only paints something if at least one service exists — for
 * the empty case we just hide the section so the page doesn't show a
 * "no services" empty state to first-time visitors.
 */
function Tiers() {
  const { data: services } = useQuery(servicesQueryOptions)
  const featured = services?.slice(0, 4) ?? []
  if (featured.length === 0) return null
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <SectionHeader kicker="Our menu" title="Flat rates. No surprises." inline />
          <Link
            to="/services"
            className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all"
          >
            All services <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((service, i) => {
            const Icon = iconFor(service.iconKey)
            const from = startingPrice(service)
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -4 }}
              >
                <Link
                  to="/services/$serviceSlug"
                  params={{ serviceSlug: service.slug }}
                  className="group block rounded-2xl border bg-background p-6 h-full transition-colors hover:border-primary/50"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="mt-4 font-display text-2xl">{service.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {service.description}
                  </p>
                  {from !== null && (
                    <>
                      <p className="mt-6 font-display text-4xl tracking-tight tabular-nums">
                        {formatCentavos(from)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">starting from</p>
                    </>
                  )}
                  <div className="mt-6 inline-flex items-center gap-1 text-sm text-primary">
                    View tiers
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Trust grid ────────────────────────────────────────────────────────── */

function TrustGrid() {
  const items = [
    {
      Icon: ShieldCheck,
      title: 'Manually vetted',
      body: 'Every provider passes ID + NBI clearance review before they take a single booking.',
    },
    {
      Icon: Wallet,
      title: 'Flat, upfront pricing',
      body: 'Pay what we quote. No hourly creep. Cancellation policy is shown before you confirm.',
    },
    {
      Icon: Wind,
      title: 'Built for Manila life',
      body: 'Condo buzzers, pets, awkward elevators. Notes go straight to your provider.',
    },
    {
      Icon: Sparkles,
      title: 'On-demand or scheduled',
      body: 'Book for now or up to a week ahead. We confirm the moment a provider accepts.',
    },
  ]
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader kicker="Why Bukit" title="Trust, made small enough to fit in a tap." />
        <div className="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            >
              <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-5 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Closing CTA ───────────────────────────────────────────────────────── */

function ClosingCta() {
  return (
    <section className="relative border-b overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(50% 60% at 50% 0%, rgba(16,185,129,0.10), transparent 70%), linear-gradient(180deg, #fbfaf6, #f5f3ec)',
        }}
      />
      <div className="mx-auto max-w-3xl px-6 py-28 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs tracking-[0.22em] uppercase text-muted-foreground"
        >
          Bukit
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 font-display text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.05] tracking-tight"
        >
          A clean home shouldn't be a&nbsp;
          <span className="italic font-light text-primary">luxury.</span>
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChild size="lg" className="rounded-full px-7 h-12 text-base">
            <Link to="/services">
              Start a booking
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="rounded-full px-5 h-12 text-base">
            <Link to="/provider">Earn with Bukit</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Bukit · Made in Manila
        </p>
        <div className="flex items-center gap-6 text-sm">
          <Link to="/services" className="text-muted-foreground hover:text-foreground transition-colors">
            Services
          </Link>
          <Link to="/provider" className="text-muted-foreground hover:text-foreground transition-colors">
            Become a provider
          </Link>
        </div>
      </div>
    </footer>
  )
}

/* ─── Shared ────────────────────────────────────────────────────────────── */

function SectionHeader({
  kicker,
  title,
  inline = false,
}: {
  kicker: string
  title: string
  inline?: boolean
}) {
  return (
    <div className={inline ? '' : 'max-w-2xl'}>
      <p className="text-xs tracking-[0.22em] uppercase text-muted-foreground">{kicker}</p>
      <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-tight">
        {title}
      </h2>
    </div>
  )
}
