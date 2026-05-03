import { describe, expect, it } from 'vitest'
import { normalizePHMobile, isValidPHMobile } from './phone.js'

describe('normalizePHMobile', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['(0917) 123-4567', '+639171234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePHMobile(input)).toBe(expected)
  })

  it.each([
    '',
    '12345',
    '08171234567', // wrong national prefix (0+8 instead of 0+9)
    '081234567890', // landline, not mobile
    '+1 555 123 4567', // not PH
    '6391712345678', // too long
    '63917123456', // too short
  ])('rejects %s', (input) => {
    expect(normalizePHMobile(input)).toBeNull()
  })

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime safety
    expect(normalizePHMobile(undefined)).toBeNull()
    // @ts-expect-error testing runtime safety
    expect(normalizePHMobile(917)).toBeNull()
  })
})

describe('isValidPHMobile', () => {
  it('returns true for valid numbers', () => {
    expect(isValidPHMobile('09171234567')).toBe(true)
  })
  it('returns false for invalid', () => {
    expect(isValidPHMobile('not a phone')).toBe(false)
  })
})
