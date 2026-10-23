import { describe, expect, it } from 'vitest'
import { MESSAGES, parseLang, translate } from './i18n'

describe('i18n', () => {
  it('has a Khmer string for every English key', () => {
    const missing = Object.keys(MESSAGES.en).filter((k) => !(k in MESSAGES.km) || !MESSAGES.km[k as keyof typeof MESSAGES.km])
    expect(missing).toEqual([])
  })
  it('keeps the same placeholders in both languages', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    for (const key of Object.keys(MESSAGES.en) as Array<keyof typeof MESSAGES.en>) {
      expect(holes(MESSAGES.km[key]), key).toBe(holes(MESSAGES.en[key]))
    }
  })
  it('fills variables and defaults to English', () => {
    expect(translate('en', 'today.waiting', { n: 2 })).toBe('2 check-in(s) waiting to send')
    expect(translate('km', 'month.none', { month: '2026-10' })).toContain('2026-10')
    expect(parseLang('km')).toBe('km')
    expect(parseLang('fr')).toBe('en')
    expect(parseLang(undefined)).toBe('en')
  })
})
