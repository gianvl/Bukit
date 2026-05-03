import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Tiny client-side pagination hook. For MVP scale (tens of items per user),
 * this is plenty; if a list grows past hundreds we'll move to server-side
 * pagination.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const [page, setPage] = useState(1)

  // Snap back to page 1 if the underlying list shrinks past our cursor.
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const start = (page - 1) * pageSize
  const visible = items.slice(start, start + pageSize)

  return { visible, page, totalPages, setPage }
}

interface PaginationBarProps {
  page: number
  totalPages: number
  onPage: (page: number) => void
  /** Right-aligned label; default "Page {page} of {totalPages}". */
  label?: string
}

/** Prev / Next pagination control. Renders nothing when there's only one page. */
export function PaginationBar({ page, totalPages, onPage, label }: PaginationBarProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground tabular-nums">
        {label ?? `Page ${page} of ${totalPages}`}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
