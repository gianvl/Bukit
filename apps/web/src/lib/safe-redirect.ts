/**
 * Returns a path-only redirect target if `value` is a safe same-origin path,
 * otherwise null. Prevents open-redirect attacks via /signin?redirect=https://evil.com.
 *
 * Accepts: "/some/path", "/some/path?x=1#y"
 * Rejects: protocol-relative ("//evil.com"), absolute URLs, anything not starting with "/".
 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > 500) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.startsWith('/\\')) return null
  return value
}
