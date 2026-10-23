/**
 * Allowance engine: pure functions, no database access, so every rule can be
 * unit-tested. The server owns these rules; phones only send evidence (check-ins).
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

/** Road distance used until a routing service (OSRM or Google) is connected. */
export const ROAD_FACTOR = 1.3

export interface RoadDistanceProvider {
  legKm(from: LatLng, to: LatLng): Promise<number>
}

export const estimatedRoadDistance: RoadDistanceProvider = {
  legKm: async (from, to) => haversineKm(from, to) * ROAD_FACTOR,
}

export function insideGeofence(point: LatLng, center: LatLng, radiusM: number): boolean {
  return haversineKm(point, center) * 1000 <= radiusM
}

export const round2 = (n: number) => Math.round(n * 100) / 100

export interface DayClassification {
  withinKm: number
  toleranceKm: number
  excessKm: number
}

/**
 * Splits actual km for a day into the three buckets from the proposal:
 * within plan (auto), tolerance band (auto), excess (needs RSM approval).
 * Paying less than plan is paid as actual: skipped visits are not rewarded.
 */
export function classifyDay(input: {
  plannedKm: number
  actualKm: number
  tolerancePct: number
}): DayClassification {
  const planned = Math.max(0, input.plannedKm)
  const actual = Math.max(0, input.actualKm)
  const withinKm = Math.min(actual, planned)
  const over = Math.max(0, actual - planned)
  const toleranceKm = Math.min(over, (planned * input.tolerancePct) / 100)
  const excessKm = over - toleranceKm
  return {
    withinKm: round2(withinKm),
    toleranceKm: round2(toleranceKm),
    excessKm: round2(excessKm),
  }
}

export interface RateRow {
  vehicleClass: string
  ratePerKm: number
  validFrom: Date | string
}

/** Latest rate whose validFrom is on or before the date (YYYY-MM-DD). */
export function rateFor(
  rates: RateRow[],
  vehicleClass: string,
  date: string,
): number | null {
  const day = new Date(`${date}T00:00:00Z`).getTime()
  let best: RateRow | null = null
  for (const r of rates) {
    if (r.vehicleClass !== vehicleClass) continue
    const from = new Date(r.validFrom).getTime()
    if (from > day) continue
    if (!best || from > new Date(best.validFrom).getTime()) best = r
  }
  return best ? best.ratePerKm : null
}

export interface StatementDay {
  date: string
  vehicleClass: string
  withinKm: number
  toleranceKm: number
  approvedExcessKm: number
}

export interface Statement {
  approvedKm: number
  petrolAmount: number
  missingRateDates: string[]
}

/**
 * Petrol amount = sum of each day's approved km x the rate in force that day,
 * so a fuel price change mid-month splits the month automatically.
 */
export function buildStatement(days: StatementDay[], rates: RateRow[]): Statement {
  let approvedKm = 0
  let petrol = 0
  const missing: string[] = []
  for (const d of days) {
    const km = d.withinKm + d.toleranceKm + d.approvedExcessKm
    approvedKm += km
    const rate = rateFor(rates, d.vehicleClass, d.date)
    if (rate === null) {
      if (km > 0) missing.push(d.date)
      continue
    }
    petrol += km * rate
  }
  return {
    approvedKm: round2(approvedKm),
    petrolAmount: round2(petrol),
    missingRateDates: missing,
  }
}

export function ratePerKm(fuelPrice: number, kmPerLitre: number): number {
  return kmPerLitre > 0 ? round2(fuelPrice / kmPerLitre) : 0
}

/** Day within a plan cycle (1..cycleDays) for a date, counted from the plan's start. */
export function dayOfCycle(date: string, planStart: string, cycleDays: number): number {
  const ms = new Date(`${date}T00:00:00Z`).getTime() - new Date(`${planStart}T00:00:00Z`).getTime()
  const diff = Math.floor(ms / 86_400_000)
  return ((diff % cycleDays) + cycleDays) % cycleDays + 1
}

export type CheckinFlag = 'OUTSIDE_GEOFENCE' | 'LOW_ACCURACY' | 'TIME_SKEW'

export const MAX_ACCURACY_M = 100
export const MAX_SKEW_MS = 10 * 60 * 1000

export function checkinFlags(input: {
  withinGeofence: boolean | null
  accuracyM?: number | null
  gpsTime: Date
  serverTime: Date
  offline?: boolean
}): CheckinFlag[] {
  const flags: CheckinFlag[] = []
  if (input.withinGeofence === false) flags.push('OUTSIDE_GEOFENCE')
  if (input.accuracyM != null && input.accuracyM > MAX_ACCURACY_M) flags.push('LOW_ACCURACY')
  // Offline check-ins arrive late on purpose; only future GPS times are suspicious then.
  const skew = input.serverTime.getTime() - input.gpsTime.getTime()
  if (input.offline ? skew < -MAX_SKEW_MS : Math.abs(skew) > MAX_SKEW_MS) flags.push('TIME_SKEW')
  return flags
}

/** Total road km for an ordered list of check-in points. */
export async function routeKm(
  points: LatLng[],
  provider: RoadDistanceProvider = estimatedRoadDistance,
): Promise<number> {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += await provider.legKm(points[i - 1], points[i])
  }
  return round2(total)
}

export interface PlanStopInput {
  dayOfCycle: number
  customerId: string
  lat: number
  lng: number
}

/**
 * Planned km per stop for a journey plan: start point to the first customer, between
 * customers in order, and the return leg to the start point added to the last stop of each day.
 * Planned km is calculated from the customer pins, never typed.
 */
export async function planLegs(
  start: LatLng,
  stops: PlanStopInput[],
  provider: RoadDistanceProvider = estimatedRoadDistance,
): Promise<{ legKm: number[]; dayKm: Record<number, number> }> {
  const legKm = new Array<number>(stops.length).fill(0)
  const dayKm: Record<number, number> = {}
  const days = [...new Set(stops.map((s) => s.dayOfCycle))].sort((a, b) => a - b)
  for (const day of days) {
    const idx = stops.map((s, i) => (s.dayOfCycle === day ? i : -1)).filter((i) => i >= 0)
    let prev: LatLng = start
    for (const i of idx) {
      legKm[i] = round2(await provider.legKm(prev, stops[i]))
      prev = stops[i]
    }
    const last = idx[idx.length - 1]
    legKm[last] = round2(legKm[last] + (await provider.legKm(prev, start)))
    dayKm[day] = round2(idx.reduce((sum, i) => sum + legKm[i], 0))
  }
  return { legKm, dayKm }
}
