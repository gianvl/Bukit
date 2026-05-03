import { describe, expect, it } from 'vitest'
import { formatCentavos, formatDuration } from './format'

describe('formatCentavos', () => {
  it('formats a whole peso amount with no decimals', () => {
    expect(formatCentavos(50_000)).toBe('₱500')
  })

  it('renders zero as ₱0', () => {
    expect(formatCentavos(0)).toBe('₱0')
  })

  it('rounds half-pesos to the nearest integer (no fractional centavos in display)', () => {
    expect(formatCentavos(50_050)).toBe('₱501')
    expect(formatCentavos(50_049)).toBe('₱500')
  })

  it('handles large amounts', () => {
    expect(formatCentavos(140_000)).toBe('₱1,400')
  })
})

describe('formatDuration', () => {
  it('shows only minutes when under an hour', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('shows only hours when on the hour', () => {
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(60)).toBe('1h')
  })

  it('shows hours + minutes when both', () => {
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(305)).toBe('5h 5m')
  })

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0m')
  })
})
