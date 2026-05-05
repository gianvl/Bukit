import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { formatCentavos } from '@/lib/format'
import {
  adminServicesQueryOptions,
  createService,
  createTier,
  deactivateService,
  deactivateTier,
  updateService,
  updateTier,
  type AdminService,
  type AdminTier,
} from '@/features/admin/api'

export const Route = createFileRoute('/admin/services')({
  component: AdminServicesPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(adminServicesQueryOptions),
})

function AdminServicesPage() {
  const { data: services, isPending } = useQuery(adminServicesQueryOptions)
  const [creatingService, setCreatingService] = useState(false)

  if (isPending) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The catalog customers see at booking. Each service has one or more priced tiers.
          </p>
        </div>
        <Button onClick={() => setCreatingService(true)} className="rounded-full">
          <Plus className="size-4" />
          New service
        </Button>
      </div>

      {creatingService && (
        <ServiceForm
          onCancel={() => setCreatingService(false)}
          onSaved={() => setCreatingService(false)}
        />
      )}

      <ul className="space-y-4">
        {services?.map((s) => <ServiceCard key={s.id} service={s} />)}
        {services?.length === 0 && !creatingService && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No services yet — add the first one above.
            </CardContent>
          </Card>
        )}
      </ul>
    </div>
  )
}

/* ─── Service card (collapsible, with nested tiers) ──────────────────── */

function ServiceCard({ service }: { service: AdminService }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <li>
      <Card className={service.isActive ? '' : 'opacity-60'}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left flex-1 min-w-0"
          >
            <div className="inline-flex items-center gap-2">
              <CardTitle className="text-lg truncate">{service.name}</CardTitle>
              {!service.isActive && <Badge variant="outline">Inactive</Badge>}
              <Badge variant="secondary" className="text-[10px]">
                {service.tiers.length} tier{service.tiers.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <CardDescription className="mt-1 line-clamp-1">
              {service.slug} · {service.description}
            </CardDescription>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" />
            </Button>
            <DeactivateServiceButton service={service} />
            <Button variant="ghost" size="icon" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {editing && (
          <CardContent>
            <ServiceForm
              service={service}
              onCancel={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
          </CardContent>
        )}

        {expanded && <TierList service={service} />}
      </Card>
    </li>
  )
}

function DeactivateServiceButton({ service }: { service: AdminService }) {
  const queryClient = useQueryClient()
  const mutate = useMutation({
    mutationFn: () => deactivateService(service.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminServicesQueryOptions.queryKey }),
  })
  if (!service.isActive) {
    // Re-activate path: just toggle isActive back on with a PATCH.
    return (
      <ToggleActiveButton
        active={false}
        onToggle={async () => {
          await updateService(service.id, { isActive: true })
          await queryClient.invalidateQueries({ queryKey: adminServicesQueryOptions.queryKey })
        }}
      />
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Power className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {service.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Customers won't see this service anymore. Existing bookings under its tiers
            are unaffected. You can re-activate it any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutate.mutate()} disabled={mutate.isPending}>
            {mutate.isPending ? 'Deactivating…' : 'Deactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ToggleActiveButton({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        try {
          await onToggle()
        } finally {
          setPending(false)
        }
      }}
      title={active ? 'Deactivate' : 'Reactivate'}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
    </Button>
  )
}

/* ─── Service form (create + edit) ───────────────────────────────────── */

function ServiceForm({
  service,
  onCancel,
  onSaved,
}: {
  service?: AdminService
  onCancel: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState(service?.slug ?? '')
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [iconKey, setIconKey] = useState(service?.iconKey ?? 'sparkles')
  const [sortOrder, setSortOrder] = useState(String(service?.sortOrder ?? 0))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        iconKey: iconKey.trim() || 'sparkles',
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
      }
      return service ? updateService(service.id, payload) : createService(payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminServicesQueryOptions.queryKey })
      onSaved()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  })

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">
          {service ? `Edit ${service.name}` : 'New service'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint="lowercase, dash-separated. Used in URLs.">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="cleaning"
            />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cleaning" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Vetted home cleaners for residential units across Metro Manila."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Icon key" hint="Lucide icon name (sparkles, shirt, wind, …).">
            <Input
              value={iconKey}
              onChange={(e) => setIconKey(e.target.value)}
              placeholder="sparkles"
            />
          </Field>
          <Field label="Sort order" hint="Lower numbers appear first.">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !slug}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── Tier list (nested under a service) ─────────────────────────────── */

function TierList({ service }: { service: AdminService }) {
  const [adding, setAdding] = useState(false)
  return (
    <CardContent className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tiers</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Add tier
        </Button>
      </div>
      {adding && (
        <TierForm
          serviceId={service.id}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}
      <ul className="space-y-2">
        {service.tiers.map((t) => (
          <TierRow key={t.id} tier={t} />
        ))}
        {service.tiers.length === 0 && !adding && (
          <li className="text-sm text-muted-foreground">No tiers yet.</li>
        )}
      </ul>
    </CardContent>
  )
}

function TierRow({ tier }: { tier: AdminTier }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const toggle = useMutation({
    mutationFn: () =>
      tier.isActive ? deactivateTier(tier.id) : updateTier(tier.id, { isActive: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminServicesQueryOptions.queryKey }),
  })

  if (editing) {
    return (
      <li>
        <TierForm
          serviceId=""
          tier={tier}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border bg-background px-3 py-2 ${tier.isActive ? '' : 'opacity-60'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{tier.name}</span>
          {!tier.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-1">{tier.description}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-sm tabular-nums">
          {formatCentavos(tier.basePriceCentavos)}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          ~{tier.estimatedMinutes} min
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
        >
          {toggle.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : tier.isActive ? (
            <Trash2 className="size-4" />
          ) : (
            <Power className="size-4" />
          )}
        </Button>
      </div>
    </li>
  )
}

function TierForm({
  serviceId,
  tier,
  onCancel,
  onSaved,
}: {
  serviceId: string
  tier?: AdminTier
  onCancel: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState(tier?.slug ?? '')
  const [name, setName] = useState(tier?.name ?? '')
  const [description, setDescription] = useState(tier?.description ?? '')
  const [priceText, setPriceText] = useState(
    tier ? String(tier.basePriceCentavos / 100) : '',
  )
  const [minutes, setMinutes] = useState(String(tier?.estimatedMinutes ?? 60))
  const [sortOrder, setSortOrder] = useState(String(tier?.sortOrder ?? 0))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const peso = Number.parseFloat(priceText)
      const payload = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        basePriceCentavos: Math.round((Number.isFinite(peso) ? peso : 0) * 100),
        estimatedMinutes: Number.parseInt(minutes, 10) || 60,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
      }
      return tier ? updateTier(tier.id, payload) : createTier(serviceId, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminServicesQueryOptions.queryKey })
      onSaved()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  })

  return (
    <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug" hint="Globally unique. Used in booking URLs.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="cleaning-1br" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1-Bedroom" />
        </Field>
      </div>
      <Field label="Description">
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Price (₱)">
          <Input
            type="number"
            step="0.01"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            placeholder="700"
          />
        </Field>
        <Field label="Estimated minutes">
          <Input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </Field>
        <Field label="Sort order">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !slug}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save tier
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
          <X className="size-4" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
