import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { meQueryOptions } from '@/features/me/api'
import { chatQueryOptions, sendMessage, type ChatMessage, type ChatThread } from '@/features/chat/api'
import { cn } from '@/lib/utils'

interface Props {
  bookingId: string
}

export function ChatPanel({ bookingId }: Props) {
  const queryClient = useQueryClient()
  const queryKey = chatQueryOptions(bookingId).queryKey
  const { data, isPending } = useQuery(chatQueryOptions(bookingId))
  const { data: me } = useQuery(meQueryOptions)

  const [draft, setDraft] = useState('')
  const [, forceTick] = useState(0)
  const send = useMutation({
    mutationFn: () => sendMessage(bookingId, draft.trim()),
    onSuccess: (msg) => {
      // Append directly to cache so the local user sees their message instantly,
      // even before the socket echo lands. Dedup is by id below.
      queryClient.setQueryData<ChatThread>(queryKey, (prev) => prev && appendUnique(prev, msg))
      setDraft('')
    },
  })

  // Live updates: append messages broadcast via the booking room.
  useEffect(() => {
    const socket = getSocket()
    const onMessage = (payload: { bookingId: string; message: ChatMessage }) => {
      if (payload.bookingId !== bookingId) return
      queryClient.setQueryData<ChatThread>(queryKey, (prev) =>
        prev ? appendUnique(prev, payload.message) : prev,
      )
    }
    socket.on('chat:message', onMessage)
    return () => {
      socket.off('chat:message', onMessage)
    }
  }, [bookingId, queryClient, queryKey])

  // Auto-scroll to bottom on new messages.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [data?.messages.length])

  // Tick once a minute so the closes-in countdown stays fresh.
  useEffect(() => {
    if (!data?.closesAt) return
    const t = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [data?.closesAt])

  if (isPending || !data) return null

  const errorMessage =
    send.error instanceof ApiError ? send.error.message : send.error ? 'Could not send' : null

  const closesInLabel = formatClosesIn(data.closesAt)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b">
        <div>
          <CardTitle className="text-base">Messages</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.isOpen
              ? closesInLabel
                ? `Chat closes in ${closesInLabel}`
                : 'Direct line with your counterparty.'
              : 'Chat is closed.'}
          </p>
        </div>
        {!data.isOpen && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Read-only
          </span>
        )}
      </CardHeader>

      <div
        ref={scrollerRef}
        className="h-72 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20"
      >
        {data.messages.length === 0 ? (
          <p className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hi 👋
          </p>
        ) : (
          data.messages.map((m) => (
            <MessageBubble key={m.id} message={m} mine={m.senderId === me?.id} />
          ))
        )}
      </div>

      <CardContent className="border-t p-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim().length === 0 || send.isPending || !data.isOpen) return
            send.mutate()
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={data.isOpen ? 'Type a message…' : 'Chat is closed.'}
            disabled={!data.isOpen || send.isPending}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={!data.isOpen || send.isPending || draft.trim().length === 0}
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
      </CardContent>
    </Card>
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
