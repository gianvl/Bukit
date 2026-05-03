import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { phoneNumber as phoneAuth, getSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
}

export const Route = createFileRoute('/signin')({
  component: SignInPage,
  validateSearch: (raw: Record<string, unknown>): AuthSearch => {
    const r = safeRedirect(raw.redirect)
    return r ? { redirect: r } : {}
  },
  beforeLoad: async ({ search }) => {
    // Already signed in → bounce away
    const { data } = await getSession()
    if (data) {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
})

const RESEND_COOLDOWN_S = 60

function SignInPage() {
  const { redirect: redirectTo } = Route.useSearch()
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
    const { error } = await phoneAuth.verify({
      phoneNumber: normalizedPhone,
      code: value,
    })
    setIsPending(false)
    if (error) {
      setError(error.message ?? 'Invalid or expired code')
      setCode('')
      return
    }
    if (redirectTo) {
      window.location.assign(redirectTo)
    } else {
      window.location.assign('/')
    }
  }

  async function onResend() {
    if (cooldown > 0 || !normalizedPhone) return
    await sendCode(normalizedPhone)
  }

  return (
    <section className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 'phone' ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <CardHeader>
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Phone className="size-3.5" />
                  Sign in with phone
                </div>
                <CardTitle className="font-display text-2xl mt-3">
                  {redirectTo ? 'Sign in to continue' : 'Welcome to Bukit'}
                </CardTitle>
                <CardDescription>
                  We'll text you a 6-digit code. No passwords needed.
                </CardDescription>
              </CardHeader>
              <form onSubmit={onSubmitPhone}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Mobile number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                        +63
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="917 123 4567"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        className="rounded-l-none"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PH mobile only. We accept 09xx or +63 9xx formats.
                    </p>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={isPending}>
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
                </CardFooter>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <CardHeader>
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <ShieldCheck className="size-3.5" />
                  Verify your number
                </div>
                <CardTitle className="font-display text-2xl mt-3">Enter the 6-digit code</CardTitle>
                <CardDescription>
                  Sent to{' '}
                  <span className="font-medium text-foreground">
                    {normalizedPhone ? formatPHMobile(normalizedPhone) : ''}
                  </span>
                </CardDescription>
              </CardHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  onSubmitCode()
                }}
              >
                <CardContent className="space-y-4">
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
                  {error && (
                    <p className="text-sm text-destructive text-center" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="text-center text-sm text-muted-foreground">
                    Didn't get it?{' '}
                    {cooldown > 0 ? (
                      <span>Resend in {cooldown}s</span>
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
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={isPending || code.length !== 6}>
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
                </CardFooter>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </section>
  )
}

