import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { phoneNumber as phoneAuth, getSession } from '@/lib/auth-client'
import { api } from '@/lib/api'
import type { Me } from '@/features/me/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { formatPHMobile, normalizePHMobile } from '@/lib/phone'
import { safeRedirect } from '@/lib/safe-redirect'

interface AuthSearch {
  redirect?: string
  /** Pre-fills the role on the onboarding step ("customer" → USER, "provider" → PROVIDER). */
  as?: 'customer' | 'provider'
}

export const Route = createFileRoute('/signin')({
  component: SignInPage,
  validateSearch: (raw: Record<string, unknown>): AuthSearch => {
    const out: AuthSearch = {}
    const r = safeRedirect(raw.redirect)
    if (r) out.redirect = r
    if (raw.as === 'customer' || raw.as === 'provider') out.as = raw.as
    return out
  },
  beforeLoad: async ({ search }) => {
    const { data } = await getSession()
    if (data) {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
})

const RESEND_COOLDOWN_S = 60

function SignInPage() {
  const { redirect: redirectTo, as } = Route.useSearch()
  const [phoneInput, setPhoneInput] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState<string | null>(null)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    },
    [],
  )

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && cooldownTimer.current) {
          clearInterval(cooldownTimer.current)
          cooldownTimer.current = null
        }
        return Math.max(0, c - 1)
      })
    }, 1000)
  }

  async function sendCode(phone: string) {
    setError(null)
    setIsPending(true)
    const { error } = await phoneAuth.sendOtp({ phoneNumber: phone })
    setIsPending(false)
    if (error) {
      setError(error.message ?? 'Could not send code')
      return false
    }
    startCooldown()
    return true
  }

  async function onSubmitPhone(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizePHMobile(phoneInput)
    if (!normalized) {
      setError('Enter a valid Philippine mobile number')
      return
    }
    setNormalizedPhone(normalized)
    const ok = await sendCode(normalized)
    if (ok) {
      setStep('code')
      setCode('')
    }
  }

  async function onSubmitCode(filled?: string) {
    if (!normalizedPhone) return
    const value = filled ?? code
    if (value.length !== 6) return
    setError(null)
    setIsPending(true)
    const { error } = await phoneAuth.verify({ phoneNumber: normalizedPhone, code: value })
    if (error) {
      setIsPending(false)
      setError(error.message ?? 'Invalid or expired code')
      setCode('')
      return
    }
    // Branch: new accounts (or anyone whose onboardedAt is null) go through
    // the onboarding flow; everyone else lands on their requested destination.
    let me: Me | null = null
    try {
      me = await api.get<Me>('/me')
    } catch {
      // /me failed for some reason — fall through to default redirect.
    }
    setIsPending(false)
    if (me && !me.onboardedAt) {
      const params = new URLSearchParams()
      if (as) params.set('as', as)
      if (redirectTo) params.set('redirect', redirectTo)
      const query = params.toString()
      window.location.assign(`/onboarding${query ? `?${query}` : ''}`)
      return
    }
    window.location.assign(redirectTo ?? '/')
  }

  async function onResend() {
    if (cooldown > 0 || !normalizedPhone) return
    await sendCode(normalizedPhone)
  }

  return (
    <section className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden">
      <CreamWash />
      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-20 grid lg:grid-cols-[1fr_auto] gap-12 items-center">
        {/* Side panel — desktop only */}
        <aside className="hidden lg:block max-w-md">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Trusted home services · Manila
          </div>
          <h1 className="mt-6 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-tight">
            Sign in with your
            <br />
            <span className="italic font-light text-primary">phone number.</span>
          </h1>
          <p className="mt-6 text-muted-foreground leading-relaxed">
            One tap, no passwords. We'll text you a 6-digit code to verify it's really you.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6 max-w-sm border-t border-border/60 pt-6">
            <Stat kpi="NCR" label="all of Metro Manila" />
            <Stat kpi="24h" label="KYC review" />
            <Stat kpi="₱500" label="from / cleaning" />
          </div>
        </aside>

        {/* Form card */}
        <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-[26rem]">
          <div className="rounded-2xl border bg-card/90 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] overflow-hidden">
            <AnimatePresence mode="wait">
              {step === 'phone' ? (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="p-7 sm:p-8"
                >
                  <Eyebrow icon={Phone}>Sign in with phone</Eyebrow>
                  <h2 className="mt-3 font-display text-3xl tracking-tight lg:hidden">
                    Welcome to Bukit
                  </h2>
                  <h2 className="mt-3 font-display text-2xl tracking-tight hidden lg:block">
                    Enter your number
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We'll text you a 6-digit code. No passwords needed.
                  </p>

                  <form onSubmit={onSubmitPhone} className="mt-6 space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Mobile number
                      </Label>
                      <div className="flex rounded-md ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                        <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted/60 px-3 text-sm text-muted-foreground font-display">
                          +63
                        </span>
                        <Input
                          id="phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          placeholder="917 123 4567"
                          required
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          className="rounded-l-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        PH mobile only. We accept 09xx or +63 9xx formats.
                      </p>
                    </div>

                    {error && <ErrorLine>{error}</ErrorLine>}

                    <Button type="submit" className="w-full h-11 rounded-full" disabled={isPending}>
                      {isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Sending code…
                        </>
                      ) : (
                        <>
                          Send code
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      By continuing you agree to Bukit's terms.
                    </p>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="p-7 sm:p-8"
                >
                  <Eyebrow icon={ShieldCheck}>Verify your number</Eyebrow>
                  <h2 className="mt-3 font-display text-2xl tracking-tight">
                    Enter the 6-digit code
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sent to{' '}
                    <span className="font-display text-foreground">
                      {normalizedPhone ? formatPHMobile(normalizedPhone) : ''}
                    </span>
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      onSubmitCode()
                    }}
                    className="mt-6 space-y-5"
                  >
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(v) => {
                          setCode(v)
                          setError(null)
                          if (v.length === 6) onSubmitCode(v)
                        }}
                        autoFocus
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    {error && <ErrorLine center>{error}</ErrorLine>}

                    <div className="text-center text-sm text-muted-foreground">
                      Didn't get it?{' '}
                      {cooldown > 0 ? (
                        <span className="tabular-nums">Resend in {cooldown}s</span>
                      ) : (
                        <button
                          type="button"
                          onClick={onResend}
                          className="text-primary underline-offset-4 hover:underline"
                          disabled={isPending}
                        >
                          Resend code
                        </button>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 rounded-full"
                      disabled={isPending || code.length !== 6}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Verifying…
                        </>
                      ) : (
                        'Verify and continue'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setStep('phone')
                        setCode('')
                        setError(null)
                      }}
                    >
                      <ArrowLeft className="size-4" />
                      Use a different number
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">
            Trusted home services across all of Metro Manila.
          </p>
        </div>
      </div>
    </section>
  )
}

function Eyebrow({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </div>
  )
}

function ErrorLine({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p
      role="alert"
      className={
        'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ' +
        (center ? 'text-center' : '')
      }
    >
      {children}
    </p>
  )
}

function Stat({ kpi, label }: { kpi: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-foreground tracking-tight">{kpi}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
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
