import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  /** Set when the recipient's device acked delivery. */
  deliveredAt: string | null
}

export interface ChatThread {
  messages: ChatMessage[]
  /** Whether new messages can still be sent. */
  isOpen: boolean
  /** When the chat will auto-close (only set during the 3h post-completion wind-down). */
  closesAt: string | null
  /** When the calling viewer last read the thread. */
  myReadAt: string | null
  /** When the other party last read the thread (drives the "Read" indicator). */
  otherReadAt: string | null
}

export const chatQueryOptions = (bookingId: string) =>
  queryOptions({
    queryKey: ['bookings', bookingId, 'messages'] as const,
    queryFn: () => api.get<ChatThread>(`/bookings/${bookingId}/messages`),
    staleTime: 10_000,
  })

export function sendMessage(bookingId: string, body: string) {
  return api.post<ChatMessage>(`/bookings/${bookingId}/messages`, { body })
}

export function markChatRead(bookingId: string) {
  return api.post<{ readAt: string }>(`/bookings/${bookingId}/messages/read`)
}
