import { describe, expect, it } from 'vitest'
import { formatPHMobile, isValidPHMobile, normalizePHMobile } from './phone'

describe('normalizePHMobile (web)', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePHMobile(input)).toBe(expected)
  })

  it.each(['', '08171234567', '+15551234567', '63917123456'])('rejects %s', (input) => {
    expect(normalizePHMobile(input)).toBeNull()
  })
})

describe('isValidPHMobile (web)', () => {
  it('returns true for valid', () => expect(isValidPHMobile('09171234567')).toBe(true))
  it('returns false for invalid', () => expect(isValidPHMobile('xx')).toBe(false))
})

describe('formatPHMobile', () => {
  it('formats E.164 with spaces', () => {
    expect(formatPHMobile('+639171234567')).toBe('+63 917 123 4567')
  })
  it('returns input unchanged when not E.164 PH', () => {
    expect(formatPHMobile('09171234567')).toBe('09171234567')
  })
})
