import { prisma } from '#/db'
import { classifyDay, dayOfCycle, routeKm } from '#/lib/engine'

const TZ_OFFSET_H = 7 // Cambodia (UTC+7), fixed offset

export function localDate(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_H * 3_600_000).toISOString().slice(0, 10)
}

export function dayBounds(date: string): { from: Date; to: Date } {
  const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - TZ_OFFSET_H * 3_600_000)
  return { from, to: new Date(from.getTime() + 86_400_000) }
}

export async function activeProfile(employeeId: string, date: string) {
  const at = new Date(`${date}T00:00:00Z`)
  return prisma.allowanceProfile.findFirst({
    where: { employeeId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
    orderBy: { validFrom: 'desc' },
  })
}

export async function plannedKmFor(employeeId: string, date: string): Promise<number> {
  const at = new Date(`${date}T00:00:00Z`)
  const plan = await prisma.journeyPlan.findFirst({
    where: {
      employeeId,
      status: 'APPROVED',
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: at } }],
    },
    orderBy: { version: 'desc' },
    include: { stops: true },
  })
  if (!plan) return 0
  const d = dayOfCycle(date, plan.validFrom.toISOString().slice(0, 10), plan.cycleDays)
  return plan.stops.filter((s) => s.dayOfCycle === d).reduce((sum, s) => sum + s.plannedLegKm, 0)
}

/** Rebuilds the DailyDistance row for one rep and day from check-ins. */
export async function recomputeDay(employeeId: string, date: string) {
  const { from, to } = dayBounds(date)
  const checkins = await prisma.checkin.findMany({
    where: { employeeId, gpsTime: { gte: from, lt: to } },
    orderBy: { gpsTime: 'asc' },
  })
  const actualKm = await routeKm(checkins.map((c) => ({ lat: c.lat, lng: c.lng })))
  const plannedKm = await plannedKmFor(employeeId, date)
  const profile = await activeProfile(employeeId, date)
  const split = classifyDay({ plannedKm, actualKm, tolerancePct: profile?.tolerancePct ?? 15 })
  return prisma.dailyDistance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, plannedKm, actualKm, ...split },
    update: { plannedKm, actualKm, ...split },
  })
}
