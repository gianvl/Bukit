import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, CheckCircle2, Info, RotateCcw, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { subscribe, type Notification, type NotificationKind } from '@/features/notifications/notify'
import { cn } from '@/lib/utils'

const ICON_FOR: Record<NotificationKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  cash: Banknote,
  cancel: XCircle,
  refund: RotateCcw,
  info: Info,
}

const TONE_FOR: Record<NotificationKind, string> = {
  success: 'bg-primary/10 text-primary',
  cash: 'bg-amber-100 text-amber-900',
  cancel: 'bg-destructive/10 text-destructive',
  refund: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
}

/**
 * Single mounted modal that shows whichever Notification was last `notify()`d.
 * Subsequent notifications replace the current one (no queue) — feels like
 * Grab's "Driver found!" overlay where the latest event wins.
 */
export function NotificationModal() {
  const [current, setCurrent] = useState<Notification | null>(null)

  useEffect(() => subscribe(setCurrent), [])

  const Icon = current ? ICON_FOR[current.kind] : Info

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && setCurrent(null)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="items-center text-center sm:text-center">
          {current && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className={cn(
                'mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-full',
                TONE_FOR[current.kind],
              )}
            >
              <Icon className="size-7" />
            </motion.div>
          )}
          <DialogTitle className="font-display text-2xl tracking-tight">
            {current?.title}
          </DialogTitle>
          {current?.description && (
            <DialogDescription className="text-base">{current.description}</DialogDescription>
          )}
        </DialogHeader>
        <Button
          size="lg"
          className="rounded-full w-full mt-2"
          onClick={() => setCurrent(null)}
        >
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  )
}
