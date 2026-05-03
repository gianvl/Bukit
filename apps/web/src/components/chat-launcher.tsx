import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Lock, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { chatQueryOptions, type ChatMessage, type ChatThread } from '@/features/chat/api'
import { meQueryOptions } from '@/features/me/api'
import { getSocket } from '@/lib/socket'

/**
 * A small clickable card that opens the full-page chat at /bookings/$id/chat.
 * Shows the latest message as a single-line preview and the chat's open/closed
 * state so the user can decide whether to bother tapping in.
 *
 * Subscribes to chat:message updates so the preview stays live without the
 * user opening the chat page first.
 */
export function ChatLauncher({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient()
  const queryKey = chatQueryOptions(bookingId).queryKey
  const { data, isPending } = useQuery(chatQueryOptions(bookingId))
  const { data: me } = useQuery(meQueryOptions)

  // Mirror ChatPanel's live append so the preview updates even from this card.
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

  if (isPending || !data) return null

  const last = data.messages.at(-1)
  const preview = last
    ? buildPreview(last, me?.id)
    : data.isOpen
      ? 'No messages yet — say hi 👋'
      : 'No messages.'

  return (
    <Link
      to="/bookings/$id/chat"
      params={{ id: bookingId }}
      className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <MessageSquare className="size-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Messages</p>
              {!data.isOpen && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="size-3" />
                  Closed
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{preview}</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Card>
    </Link>
  )
}

function buildPreview(msg: ChatMessage, myId: string | undefined): string {
  const who = msg.senderId === myId ? 'You' : msg.senderName.split(' ')[0]
  return `${who}: ${msg.body}`
}

function appendUnique(thread: ChatThread, message: ChatMessage): ChatThread {
  if (thread.messages.some((m) => m.id === message.id)) return thread
  return { ...thread, messages: [...thread.messages, message] }
}
