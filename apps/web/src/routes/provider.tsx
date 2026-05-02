import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/provider')({
  component: ProviderPage,
})

function ProviderPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">For providers</h1>
      <p className="mt-2 text-muted-foreground">
        Provider onboarding ships in a later checkpoint.
      </p>
    </section>
  )
}
