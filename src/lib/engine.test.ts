import { describe, expect, it } from 'vitest'
import {
  buildStatement,
  checkinFlags,
  classifyDay,
  dayOfCycle,
  haversineKm,
  insideGeofence,
  planLegs,
  rateFor,
  ratePerKm,
  routeKm,
} from './engine'
import { approvalChain } from './constants'

describe('classifyDay', () => {
  it('pays actual km when under plan', () => {
    expect(classifyDay({ plannedKm: 40, actualKm: 30, tolerancePct: 15 })).toEqual({
      withinKm: 30,
      toleranceKm: 0,
      excessKm: 0,
    })
  })
  it('puts km above plan inside the tolerance band', () => {
    expect(classifyDay({ plannedKm: 40, actualKm: 44, tolerancePct: 15 })).toEqual({
      withinKm: 40,
      toleranceKm: 4,
      excessKm: 0,
    })
  })
  it('sends km above plan + tolerance to excess', () => {
    expect(classifyDay({ plannedKm: 40, actualKm: 55, tolerancePct: 15 })).toEqual({
      withinKm: 40,
      toleranceKm: 6,
      excessKm: 9,
    })
  })
  it('treats an unplanned day as all excess', () => {
    expect(classifyDay({ plannedKm: 0, actualKm: 12, tolerancePct: 15 })).toEqual({
      withinKm: 0,
      toleranceKm: 0,
      excessKm: 12,
    })
  })
})

describe('rates', () => {
  const rates = [
    { vehicleClass: 'MOTOR', ratePerKm: 0.05, validFrom: '2026-01-01' },
    { vehicleClass: 'MOTOR', ratePerKm: 0.06, validFrom: '2026-10-16' },
    { vehicleClass: 'CAR', ratePerKm: 0.12, validFrom: '2026-01-01' },
  ]
  it('picks the rate in force on the date', () => {
    expect(rateFor(rates, 'MOTOR', '2026-10-15')).toBe(0.05)
    expect(rateFor(rates, 'MOTOR', '2026-10-16')).toBe(0.06)
    expect(rateFor(rates, 'CAR', '2026-10-20')).toBe(0.12)
    expect(rateFor(rates, 'MOTOR', '2025-12-31')).toBeNull()
  })
  it('derives rate per km from fuel price and consumption', () => {
    expect(ratePerKm(1.2, 40)).toBe(0.03)
    expect(ratePerKm(1.2, 0)).toBe(0)
  })
  it('splits a month at a fuel price change', () => {
    const days = [
      { date: '2026-10-15', vehicleClass: 'MOTOR', withinKm: 100, toleranceKm: 0, approvedExcessKm: 0 },
      { date: '2026-10-16', vehicleClass: 'MOTOR', withinKm: 100, toleranceKm: 10, approvedExcessKm: 5 },
    ]
    const s = buildStatement(days, rates)
    expect(s.approvedKm).toBe(215)
    expect(s.petrolAmount).toBeCloseTo(11.9, 2)
    expect(s.missingRateDates).toEqual([])
  })
  it('reports days with no rate instead of paying zero silently', () => {
    const s = buildStatement(
      [{ date: '2025-01-01', vehicleClass: 'MOTOR', withinKm: 10, toleranceKm: 0, approvedExcessKm: 0 }],
      rates,
    )
    expect(s.missingRateDates).toEqual(['2025-01-01'])
  })
})

describe('geo', () => {
  const a = { lat: 11.5564, lng: 104.9282 }
  it('measures distance', () => {
    expect(haversineKm(a, { lat: 11.5564, lng: 105.9282 })).toBeGreaterThan(100)
    expect(haversineKm(a, a)).toBe(0)
  })
  it('checks geofence radius', () => {
    expect(insideGeofence({ lat: 11.5565, lng: 104.9283 }, a, 150)).toBe(true)
    expect(insideGeofence({ lat: 11.57, lng: 104.95 }, a, 150)).toBe(false)
  })
  it('sums road legs', async () => {
    const km = await routeKm([a, { lat: 11.5664, lng: 104.9282 }, a])
    expect(km).toBeGreaterThan(2)
  })
})

describe('plan cycle', () => {
  it('wraps days within the cycle', () => {
    expect(dayOfCycle('2026-10-05', '2026-10-05', 7)).toBe(1)
    expect(dayOfCycle('2026-10-11', '2026-10-05', 7)).toBe(7)
    expect(dayOfCycle('2026-10-12', '2026-10-05', 7)).toBe(1)
    expect(dayOfCycle('2026-10-19', '2026-10-05', 14)).toBe(1)
  })
})

describe('checkinFlags', () => {
  const now = new Date('2026-10-22T08:00:00Z')
  it('flags outside geofence, low accuracy and clock skew', () => {
    const flags = checkinFlags({
      withinGeofence: false,
      accuracyM: 250,
      gpsTime: new Date('2026-10-22T07:00:00Z'),
      serverTime: now,
    })
    expect(flags).toEqual(['OUTSIDE_GEOFENCE', 'LOW_ACCURACY', 'TIME_SKEW'])
  })
  it('allows late offline sync but not future GPS time', () => {
    expect(
      checkinFlags({ withinGeofence: true, gpsTime: new Date('2026-10-22T03:00:00Z'), serverTime: now, offline: true }),
    ).toEqual([])
    expect(
      checkinFlags({ withinGeofence: true, gpsTime: new Date('2026-10-22T09:00:00Z'), serverTime: now, offline: true }),
    ).toEqual(['TIME_SKEW'])
  })
})

describe('approvalChain', () => {
  it('ends with HR on every chain', () => {
    for (const p of ['SR', 'ASM', 'RSM', 'OM', 'NSM']) {
      expect(approvalChain(p).at(-1)).toBe('HR')
    }
    expect(approvalChain('SR')).toEqual(['RSM', 'NSM', 'HR'])
  })
})

describe('planLegs', () => {
  const depot = { lat: 11.5564, lng: 104.9282 }
  const stops = [
    { dayOfCycle: 1, customerId: 'a', lat: 11.5801, lng: 104.9101 },
    { dayOfCycle: 1, customerId: 'b', lat: 11.5935, lng: 104.9023 },
    { dayOfCycle: 2, customerId: 'a', lat: 11.5801, lng: 104.9101 },
  ]
  it('adds the return leg to the last stop of each day', async () => {
    const { legKm, dayKm } = await planLegs(depot, stops)
    expect(legKm[0]).toBeGreaterThan(0)
    expect(legKm[1]).toBeGreaterThan(legKm[0] / 4)
    expect(dayKm[1]).toBeCloseTo(legKm[0] + legKm[1], 1)
    expect(dayKm[2]).toBeCloseTo(legKm[2], 1)
    // out and back to one customer is about twice the one-way estimate
    expect(dayKm[2]).toBeCloseTo(2 * haversineKm(depot, stops[2]) * 1.3, 1)
  })
  it('handles an empty plan', async () => {
    expect(await planLegs(depot, [])).toEqual({ legKm: [], dayKm: {} })
  })
})
