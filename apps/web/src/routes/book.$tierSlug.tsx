import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { serviceTiersQueryOptions } from '@/features/service-tiers/queries'
import {
  createBooking,
  startCheckout,
  type BookingMode,
  type PaymentMethod,
} from '@/features/bookings/api'
import { getSession } from '@/lib/auth-client'
import { formatCentavos, formatDuration } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/book/$tierSlug')({
  component: BookingFlow,
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceTiersQueryOptions),
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'customer' },
      })
    }
  },
})

const STEPS = ['When & how', 'Address', 'Review'] as const
type Step = (typeof STEPS)[number]

interface FormState {
  bookingMode: BookingMode
  paymentMethod: PaymentMethod
  scheduledAt: string
  line1: string
  line2: string
  barangay: string
  city: string
  notes: string
  latitude?: number
  longitude?: number
}

const initialForm: FormState = {
  bookingMode: 'SCHEDULED',
  paymentMethod: 'ONLINE',
  scheduledAt: '',
  line1: '',
  line2: '',
  barangay: '',
  city: 'Taguig',
  notes: '',
}

function BookingFlow() {
  const { tierSlug } = Route.useParams()
  const navigate = useNavigate()
  const { data: tiers, isPending } = useQuery(serviceTiersQueryOptions)
  const tier = tiers?.find((t) => t.slug === tierSlug)

  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<FormState>(initialForm)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'captured' | 'denied'>('idle')

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const minScheduledAt = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setSeconds(0, 0)
    return toLocalInputValue(d)
  }, [])

  // When mode flips to ON_DEMAND, auto-grab GPS without making the user click.
  useEffect(() => {
    if (form.bookingMode === 'ON_DEMAND' && geoState === 'idle') {
      requestGeolocation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bookingMode])

  function requestGeolocation() {
    if (!('geolocation' in navigator)) {
      setGeoState('denied')
      return
    }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }))
        setGeoState('captured')
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const canAdvance = (() => {
    if (stepIndex === 0) {
      if (form.bookingMode === 'SCHEDULED') {
        if (!form.scheduledAt) return false
        return new Date(form.scheduledAt).getTime() > Date.now()
      }
      return true // ON_DEMAND has no datetime to validate
    }
    if (stepIndex === 1) return form.line1.trim().length > 0 && form.city.trim().length > 0
    return true
  })()

  const submit = useMutation({
    mutationFn: async () => {
      if (!tier) throw new Error('Service tier not loaded')

      const scheduledAt =
        form.bookingMode === 'ON_DEMAND'
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min from now
          : new Date(form.scheduledAt).toISOString()

      const booking = await createBooking({
        serviceTierId: tier.id,
        bookingMode: form.bookingMode,
        paymentMethod: form.paymentMethod,
        scheduledAt,
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          barangay: form.barangay.trim() || undefined,
          city: form.city.trim(),
          latitude: form.latitude,
          longitude: form.longitude,
        },
        notes: form.notes.trim() || undefined,
      })

      // CASH bookings skip the checkout redirect — go straight to the booking page.
      if (form.paymentMethod === 'CASH') {
        return { booking, redirectTo: `/bookings/${booking.id}` as const }
      }

      const checkout = await startCheckout(booking.id)
      return { booking, redirectTo: checkout.checkoutUrl }
    },
    onSuccess: ({ redirectTo }) => {
      window.location.href = redirectTo
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : 'Something went wrong')
    },
  })

  if (isPending) return <FlowSkeleton />
  if (!tier) {
    return (
      <section className="mx-auto max-w-md px-6 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Service not found</h1>
        <Button onClick={() => navigate({ to: '/services' })}>Back to services</Button>
      </section>
    )
  }

  const step: Step = STEPS[stepIndex] ?? 'When & how'

  return (
    <section className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Booking · {tier.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{step}</h1>
        <Stepper current={stepIndex} />
      </header>

      <Card>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {step === 'When & how' && (
              <>
                <CardHeader>
                  <CardTitle>When and how to pay</CardTitle>
                  <CardDescription>
                    Book on-demand for now or schedule for later. Pay online or with cash.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <RadioGrid
                    label="When?"
                    value={form.bookingMode}
                    onChange={(v) => update('bookingMode', v)}
                    options={[
                      {
                        value: 'ON_DEMAND',
                        label: 'Now',
                        description: 'Match me with a nearby provider.',
                        Icon: Zap,
                      },
                      {
                        value: 'SCHEDULED',
                        label: 'Later',
                        description: 'Pick a specific date and time.',
                        Icon: CalendarClock,
                      },
                    ]}
                  />

                  {form.bookingMode === 'SCHEDULED' && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">Date and time</Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        min={minScheduledAt}
                        value={form.scheduledAt}
                        onChange={(e) => update('scheduledAt', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        At least an hour from now.
                      </p>
                    </div>
                  )}

                  <RadioGrid
                    label="How to pay?"
                    value={form.paymentMethod}
                    onChange={(v) => update('paymentMethod', v)}
                    options={[
                      {
                        value: 'ONLINE',
                        label: 'Online',
                        description: 'Card, GCash, Maya, QR Ph. Held until the job is done.',
                        Icon: CreditCard,
                      },
                      {
                        value: 'CASH',
                        label: 'Cash',
                        description: 'Pay the provider directly when they arrive.',
                        Icon: Banknote,
                      },
                    ]}
                  />

                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                    <Clock className="size-4" />
                    Estimated {formatDuration(tier.estimatedMinutes)}
                  </div>
                </CardContent>
              </>
            )}

            {step === 'Address' && (
              <>
                <CardHeader>
                  <CardTitle>Where are we cleaning?</CardTitle>
                  <CardDescription>
                    Provide an accurate address so providers can find you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {geoState === 'captured'
                        ? 'Your location is attached to this booking.'
                        : 'Sharing your location helps providers find you faster.'}
                    </p>
                    <Button
                      type="button"
                      variant={geoState === 'captured' ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={requestGeolocation}
                      disabled={geoState === 'loading'}
                    >
                      {geoState === 'loading' ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Locating…
                        </>
                      ) : geoState === 'captured' ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-primary" />
                          Location set
                        </>
                      ) : (
                        <>
                          <MapPin className="size-3.5" />
                          Use my location
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="line1">Street address</Label>
                    <Input
                      id="line1"
                      autoComplete="address-line1"
                      placeholder="5 Forbes Park Drive"
                      value={form.line1}
                      onChange={(e) => update('line1', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line2">Unit / floor (optional)</Label>
                    <Input
                      id="line2"
                      autoComplete="address-line2"
                      placeholder="Unit 1204"
                      value={form.line2}
                      onChange={(e) => update('line2', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="barangay">Barangay</Label>
                      <Input
                        id="barangay"
                        placeholder="Fort Bonifacio"
                        value={form.barangay}
                        onChange={(e) => update('barangay', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        autoComplete="address-level2"
                        value={form.city}
                        onChange={(e) => update('city', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes for the provider (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Buzzer broken, please call when you arrive."
                      value={form.notes}
                      onChange={(e) => update('notes', e.target.value)}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </>
            )}

            {step === 'Review' && (
              <>
                <CardHeader>
                  <CardTitle>Confirm your booking</CardTitle>
                  <CardDescription>
                    {form.paymentMethod === 'ONLINE'
                      ? "We'll redirect you to PayMongo to complete payment."
                      : "You'll pay the provider directly when they arrive."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <Row label="Service" value={tier.name} />
                  <Row
                    label="When"
                    value={
                      form.bookingMode === 'ON_DEMAND'
                        ? 'On-demand · we match you now'
                        : formatScheduled(form.scheduledAt)
                    }
                  />
                  <Row
                    label="Payment"
                    value={form.paymentMethod === 'ONLINE' ? 'Online (held in escrow)' : 'Cash on arrival'}
                  />
                  <Row
                    label="Address"
                    value={
                      <span className="text-right">
                        {form.line1}
                        {form.line2 && <>, {form.line2}</>}
                        <br />
                        {[form.barangay, form.city].filter(Boolean).join(', ')}
                        {form.latitude !== undefined && (
                          <span className="block text-xs text-primary mt-0.5">
                            📍 Location attached
                          </span>
                        )}
                      </span>
                    }
                  />
                  {form.notes && <Row label="Notes" value={form.notes} />}
                  <hr />
                  <Row
                    label={<span className="font-medium text-foreground">Total</span>}
                    value={
                      <span className="text-lg font-semibold">
                        {formatCentavos(tier.basePriceCentavos)}
                      </span>
                    }
                  />
                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}
                </CardContent>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <CardFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => (stepIndex === 0 ? navigate({ to: '/services' }) : setStepIndex(stepIndex - 1))}
            disabled={submit.isPending}
          >
            <ArrowLeft className="size-4" />
            {stepIndex === 0 ? 'Back to services' : 'Back'}
          </Button>
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={() => setStepIndex(stepIndex + 1)} disabled={!canAdvance}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {form.paymentMethod === 'ONLINE' ? 'Redirecting…' : 'Confirming…'}
                </>
              ) : form.paymentMethod === 'ONLINE' ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Pay {formatCentavos(tier.basePriceCentavos)}
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Confirm booking
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  )
}

interface RadioOption<V extends string> {
  value: V
  label: string
  description: string
  Icon: typeof Zap
}

function RadioGrid<V extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: V
  onChange: (v: V) => void
  options: RadioOption<V>[]
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        {options.map(({ value: v, label, description, Icon }) => {
          const active = v === value
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between">
                <Icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
                {active && <span className="size-2 rounded-full bg-primary" aria-hidden />}
              </div>
              <div className="mt-3 text-sm font-medium">{label}</div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mt-4 flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full border',
              i === current
                ? 'bg-primary text-primary-foreground border-primary'
                : i < current
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className={i === current ? 'font-medium' : 'text-muted-foreground'}>{s}</span>
          {i < STEPS.length - 1 && <span className="w-6 h-px bg-border ml-2" />}
        </li>
      ))}
    </ol>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  )
}

function FlowSkeleton() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-9 w-full" />
        </CardFooter>
      </Card>
    </section>
  )
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatScheduled(value: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
