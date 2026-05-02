import { Link, createFileRoute } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <section className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Bukit · Service booking
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Vetted home cleaning, on demand.
        </h1>
        <p className="text-muted-foreground">
          Book a trusted cleaner in Makati, BGC, or Ortigas. Flat rates, paid
          securely via HelixPay.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/book">Book a cleaner</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/provider">Become a provider</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
