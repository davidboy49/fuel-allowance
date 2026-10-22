import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from '#/db'
import { planLegs } from '#/lib/engine'
import { audit, requireUser } from './auth'
import { activeProfile, localDate } from './distance'
import { canSee, teamIds } from './team'

const EDITORS = ['RSM', 'HR', 'ADMIN', 'NSM'] as const

export const plansFn = createServerFn({ method: 'GET' }).handler(async () => {
  const u = await requireUser()
  const scope = ['HR', 'ADMIN', 'NSM', 'FIN'].includes(u.role)
    ? undefined
    : u.role === 'RSM'
      ? [u.id, ...(await teamIds(u.id))]
      : [u.id]
  const rows = await prisma.journeyPlan.findMany({
    where: scope ? { employeeId: { in: scope } } : {},
    orderBy: [{ employeeId: 'asc' }, { version: 'desc' }],
    include: { employee: true, stops: { include: { customer: true }, orderBy: [{ dayOfCycle: 'asc' }, { sequence: 'asc' }] } },
  })
  const approvals = await prisma.approval.findMany({
    where: { subjectType: 'PLAN', subjectId: { in: rows.map((r) => r.id) } },
  })
  return rows.map((p) => {
    const days = new Map<number, { km: number; stops: string[] }>()
    for (const s of p.stops) {
      const d = days.get(s.dayOfCycle) ?? { km: 0, stops: [] }
      d.km += s.plannedLegKm
      d.stops.push(s.customer.name)
      days.set(s.dayOfCycle, d)
    }
    const step = approvals.find((a) => a.subjectId === p.id && a.decision === null)
    const mine = u.role === 'RSM' ? (scope ?? []).includes(p.employeeId) && p.employeeId !== u.id : ['NSM', 'ADMIN'].includes(u.role)
    return {
      id: p.id,
      employeeId: p.employeeId,
      employee: p.employee.name,
      version: p.version,
      cycleDays: p.cycleDays,
      status: p.status,
      validFrom: p.validFrom.toISOString().slice(0, 10),
      weeklyKm: Math.round([...days.values()].reduce((s, d) => s + d.km, 0) * 10) / 10,
      days: [...days.entries()].map(([day, d]) => ({ day, km: Math.round(d.km * 10) / 10, stops: d.stops })),
      canDecide: p.status === 'SUBMITTED' && !!step && mine,
    }
  })
})

const savePlan = z.object({
  employeeId: z.string(),
  cycleDays: z.union([z.literal(7), z.literal(14)]),
  validFrom: z.string().min(8),
  stops: z
    .array(z.object({ dayOfCycle: z.number().int().min(1).max(14), customerId: z.string() }))
    .min(1, 'Add at least one customer'),
})

/** A new version always starts as a submission; only an approved version counts for allowance. */
export const savePlanFn = createServerFn({ method: 'POST' })
  .validator(savePlan)
  .handler(async ({ data }) => {
    const u = await requireUser([...EDITORS])
    if (!(await canSee(u, data.employeeId))) throw new Error('Not your team')
    if (data.stops.some((s) => s.dayOfCycle > data.cycleDays)) throw new Error('A stop is outside the plan cycle')

    const customers = await prisma.customer.findMany({ where: { id: { in: data.stops.map((s) => s.customerId) } } })
    const byId = new Map(customers.map((c) => [c.id, c]))
    const missing = data.stops.filter((s) => byId.get(s.customerId)?.lat == null)
    if (missing.length) throw new Error('Every customer needs a GPS pin before it can go on a plan')

    const profile = await activeProfile(data.employeeId, data.validFrom)
    const start = profile?.startPointId ? await prisma.startPoint.findUnique({ where: { id: profile.startPointId } }) : null
    if (!start) throw new Error('This employee has no start point on their allowance profile')

    const ordered = data.stops.map((s, i) => ({ ...s, seq: i, c: byId.get(s.customerId)! }))
    const { legKm } = await planLegs(
      { lat: start.lat, lng: start.lng },
      ordered.map((o) => ({ dayOfCycle: o.dayOfCycle, customerId: o.customerId, lat: o.c.lat!, lng: o.c.lng! })),
    )

    const last = await prisma.journeyPlan.findFirst({ where: { employeeId: data.employeeId }, orderBy: { version: 'desc' } })
    const plan = await prisma.journeyPlan.create({
      data: {
        employeeId: data.employeeId,
        version: (last?.version ?? 0) + 1,
        cycleDays: data.cycleDays,
        status: 'SUBMITTED',
        validFrom: new Date(`${data.validFrom}T00:00:00Z`),
        stops: {
          create: ordered.map((o, i) => ({
            dayOfCycle: o.dayOfCycle,
            sequence: i + 1,
            customerId: o.customerId,
            plannedLegKm: legKm[i],
          })),
        },
      },
    })
    await prisma.approval.create({
      data: { subjectType: 'PLAN', subjectId: plan.id, step: 0, approverRole: 'RSM' },
    })
    await audit(u.id, 'JourneyPlan', plan.id, 'SUBMIT', { employeeId: data.employeeId, version: plan.version })
    return plan.id
  })

export const decidePlanFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), decision: z.enum(['APPROVED', 'REJECTED']), comment: z.string().optional() }))
  .handler(async ({ data }) => {
    const u = await requireUser(['RSM', 'NSM', 'ADMIN'])
    const plan = await prisma.journeyPlan.findUnique({ where: { id: data.id } })
    if (!plan || plan.status !== 'SUBMITTED') throw new Error('Plan is not waiting for approval')
    if (plan.employeeId === u.id) throw new Error('You cannot approve your own plan')
    if (!(await canSee(u, plan.employeeId))) throw new Error('Not your team')
    if (data.decision === 'REJECTED' && !data.comment?.trim()) throw new Error('A reason is required to reject')

    await prisma.$transaction(async (tx) => {
      await tx.approval.updateMany({
        where: { subjectType: 'PLAN', subjectId: plan.id, decision: null },
        data: { decision: data.decision, comment: data.comment, approverId: u.id, decidedAt: new Date() },
      })
      if (data.decision === 'REJECTED') {
        await tx.journeyPlan.update({ where: { id: plan.id }, data: { status: 'REJECTED' } })
        return
      }
      // The new version replaces the current approved one from its start date.
      await tx.journeyPlan.updateMany({
        where: { employeeId: plan.employeeId, status: 'APPROVED', id: { not: plan.id } },
        data: { status: 'RETIRED', validTo: new Date(plan.validFrom.getTime() - 86_400_000) },
      })
      await tx.journeyPlan.update({ where: { id: plan.id }, data: { status: 'APPROVED' } })
    })
    await audit(u.id, 'JourneyPlan', plan.id, data.decision, { comment: data.comment })
    return { ok: true }
  })

export const planEditorDataFn = createServerFn({ method: 'GET' }).handler(async () => {
  const u = await requireUser([...EDITORS])
  const scope = ['HR', 'ADMIN', 'NSM'].includes(u.role) ? undefined : [u.id, ...(await teamIds(u.id))]
  const today = localDate(new Date())
  const employees = await prisma.employee.findMany({
    where: { active: true, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: { code: 'asc' },
  })
  const withProfile = []
  for (const e of employees) {
    const p = await activeProfile(e.id, today)
    if (p?.startPointId) withProfile.push({ id: e.id, name: e.name, position: e.position })
  }
  const customers = await prisma.customer.findMany({ where: { lat: { not: null } }, orderBy: { name: 'asc' } })
  return {
    employees: withProfile,
    customers: customers.map((c) => ({ id: c.id, name: c.name, code: c.code, verified: !!c.verifiedAt })),
  }
})
