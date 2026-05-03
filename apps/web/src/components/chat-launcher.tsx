import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Lock, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { chatQueryOptions, type ChatMessage, type ChatThread } from '@/features/chat/api'
import { meQueryOptions } from '@/features/me/api'
import { getSocket } from '@/lib/socket'

/**
 * Small clickable card that opens the full-page chat at /bookings/$id/chat.
 * Shows the latest message preview, the chat's open/closed state, and an
 * unread count badge when the other party has sent messages past the viewer's
 * last read cursor.
 */
export function ChatLauncher({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient()
  const queryKey = chatQueryOptions(bookingId).queryKey
  const { data, isPending } = useQuery(chatQueryOptions(bookingId))
  const { data: me } = useQuery(meQueryOptions)

  // Mirror the chat page's live append so the preview + unread count stay current.
  useEffect(() => {
    const socket = getSocket()
    const onMessage = (payload: { bookingId: string; message: ChatMessage }) => {
      if (payload.bookingId !== bookingId) return
      queryClient.setQueryData<ChatThread>(queryKey, (prev) =>
        prev ? appendUnique(prev, payload.message) : prev,
      )
    }
    const onRead = (payload: { bookingId: string; readerUserId: string; readAt: string }) => {
      if (payload.bookingId !== bookingId) return
      queryClient.setQueryData<ChatThread>(queryKey, (prev) => {
        if (!prev) return prev
        if (payload.readerUserId === me?.id) return { ...prev, myReadAt: payload.readAt }
        return { ...prev, otherReadAt: payload.readAt }
      })
    }
    socket.on('chat:message', onMessage)
    socket.on('chat:read', onRead)
    return () => {
      socket.off('chat:message', onMessage)
      socket.off('chat:read', onRead)
    }
  }, [bookingId, queryClient, queryKey, me?.id])

  if (isPending || !data) return null

  const last = data.messages.at(-1)
  const preview = last
    ? buildPreview(last, me?.id)
    : data.isOpen
      ? 'No messages yet — say hi 👋'
      : 'No messages.'

  const unread = countUnread(data, me?.id)

  return (
    <Link
      to="/bookings/$id/chat"
      params={{ id: bookingId }}
      className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="relative shrink-0">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="size-4" />
            </span>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums ring-2 ring-card">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
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
            <p
              className={
                'mt-0.5 text-xs truncate ' +
                (unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')
              }
            >
              {preview}
            </p>
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

function countUnread(thread: ChatThread, myId: string | undefined): number {
  if (!myId) return 0
  const cutoff = thread.myReadAt ? new Date(thread.myReadAt).getTime() : 0
  return thread.messages.filter(
    (m) => m.senderId !== myId && new Date(m.createdAt).getTime() > cutoff,
  ).length
}

function appendUnique(thread: ChatThread, message: ChatMessage): ChatThread {
  if (thread.messages.some((m) => m.id === message.id)) return thread
  return { ...thread, messages: [...thread.messages, message] }
}
