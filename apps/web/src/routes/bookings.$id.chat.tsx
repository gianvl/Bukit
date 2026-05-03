import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { getSession } from '@/lib/auth-client'
import { meQueryOptions } from '@/features/me/api'
import {
  bookingDetailQueryOptions,
  type BookingDetail,
} from '@/features/bookings/queries'
import {
  chatQueryOptions,
  sendMessage,
  type ChatMessage,
  type ChatThread,
} from '@/features/chat/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/bookings/$id/chat')({
  component: BookingChatPage,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'customer' },
      })
    }
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(bookingDetailQueryOptions(params.id)),
      context.queryClient.ensureQueryData(chatQueryOptions(params.id)),
    ]),
})

function BookingChatPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const queryKey = chatQueryOptions(id).queryKey
  const { data: thread } = useQuery(chatQueryOptions(id))
  const { data: booking } = useQuery(bookingDetailQueryOptions(id))
  const { data: me } = useQuery(meQueryOptions)

  const [draft, setDraft] = useState('')
  const [, forceTick] = useState(0)
  const send = useMutation({
    mutationFn: () => sendMessage(id, draft.trim()),
    onSuccess: (msg) => {
      queryClient.setQueryData<ChatThread>(queryKey, (prev) => prev && appendUnique(prev, msg))
      setDraft('')
    },
  })

  // Live append + booking-room subscription is handled by the parent detail page
  // when open; here we add our own subscription so the chat works standalone too.
  useEffect(() => {
    const socket = getSocket()
    const onMessage = (payload: { bookingId: string; message: ChatMessage }) => {
      if (payload.bookingId !== id) return
      queryClient.setQueryData<ChatThread>(queryKey, (prev) =>
        prev ? appendUnique(prev, payload.message) : prev,
      )
    }
    const join = () => {
      socket.emit('booking:join', { bookingId: id })
    }
    socket.on('chat:message', onMessage)
    socket.on('connect', join)
    if (socket.connected) join()
    return () => {
      socket.off('chat:message', onMessage)
      socket.off('connect', join)
      socket.emit('booking:leave', { bookingId: id })
    }
  }, [id, queryClient, queryKey])

  // Auto-scroll on new message.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [thread?.messages.length])

  // Tick countdown.
  useEffect(() => {
    if (!thread?.closesAt) return
    const t = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [thread?.closesAt])

  if (!thread || !booking) return null

  const counterpartyName = counterpartyDisplayName(booking)
  const closesInLabel = formatClosesIn(thread.closesAt)
  const errorMessage =
    send.error instanceof ApiError ? send.error.message : send.error ? 'Could not send' : null

  return (
    // Subtract header height so the chat fills the remaining viewport.
    <section className="flex flex-col h-[calc(100dvh-3.5rem)]">
      {/* Sticky chat header */}
      <header className="border-b bg-background">
        <div className="mx-auto max-w-2xl px-6 h-14 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/bookings/$id" params={{ id }} aria-label="Back to booking">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {counterpartyName ?? 'Chat'}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {thread.isOpen
                ? closesInLabel
                  ? `Chat closes in ${closesInLabel}`
                  : booking.serviceTier.name
                : 'Chat is closed'}
            </p>
          </div>
          {!thread.isOpen && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              Read-only
            </span>
          )}
        </div>
      </header>

      {/* Scrollable thread */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-muted/20">
        <div className="mx-auto max-w-2xl px-6 py-6 space-y-3">
          {thread.messages.length === 0 ? (
            <p className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              No messages yet. Say hi 👋
            </p>
          ) : (
            thread.messages.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.senderId === me?.id} />
            ))
          )}
        </div>
      </div>

      {/* Sticky input */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-2xl px-6 py-3">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim().length === 0 || send.isPending || !thread.isOpen) return
              send.mutate()
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={thread.isOpen ? 'Type a message…' : 'Chat is closed.'}
              disabled={!thread.isOpen || send.isPending}
              autoFocus
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              disabled={!thread.isOpen || send.isPending || draft.trim().length === 0}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          </form>
          {errorMessage && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </footer>
    </section>
  )
}

function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {!mine && (
        <span className="text-[11px] text-muted-foreground px-1">{message.senderName}</span>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          mine
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card border rounded-bl-sm',
        )}
      >
        {message.body}
      </div>
      <span className="text-[10px] text-muted-foreground px-1 tabular-nums">
        {formatMessageTime(message.createdAt)}
      </span>
    </div>
  )
}

function counterpartyDisplayName(booking: BookingDetail): string | null {
  return booking.provider?.name ?? booking.customer?.name ?? null
}

function appendUnique(thread: ChatThread, message: ChatMessage): ChatThread {
  if (thread.messages.some((m) => m.id === message.id)) return thread
  return { ...thread, messages: [...thread.messages, message] }
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
  })
}

function formatClosesIn(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}
