/**
 * Tiny global notification bus.
 *
 * `notify(...)` enqueues a one-shot modal; `subscribe(fn)` listens.
 * Module-level pub-sub keeps the API trivial — no provider needed at the root.
 */

export type NotificationKind =
  | 'success' // green check (accepted, completed)
  | 'cash' // banknote tone (cash flow)
  | 'cancel' // destructive (cancellations)
  | 'refund' // refund processed
  | 'info' // generic info

export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  description?: string
  /** Optional CTA — when set, shows a secondary button that follows the link. */
  actionHref?: string
  actionLabel?: string
}

type Listener = (n: Notification) => void

const listeners = new Set<Listener>()

export function notify(n: Omit<Notification, 'id'>): void {
  const event: Notification = { ...n, id: cryptoRandomId() }
  for (const l of listeners) l(event)
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
