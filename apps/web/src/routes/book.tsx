import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/book')({
  component: BookPage,
})

function BookPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Book a service</h1>
      <p className="mt-2 text-muted-foreground">
        Booking flow comes online in a later checkpoint.
      </p>
    </section>
  )
}
