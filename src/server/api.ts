import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from '#/db'
import {
  ACTION_TYPES,
  REASON_CODES,
  approvalChain,
  requestInput,
  type ActionType,
  type Role,
} from '#/lib/constants'
import { buildStatement, checkinFlags, dayOfCycle, insideGeofence, ratePerKm } from '#/lib/engine'
import {
  audit,
  currentUser,
  endSession,
  requireUser,
  startSession,
  verifyPassword,
} from './auth'
import { activeProfile, dayBounds, localDate, recomputeDay } from './distance'

// ---------- session ----------

export const meFn = createServerFn({ method: 'GET' }).handler(async () => currentUser())

export const loginFn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const e = await prisma.employee.findUnique({ where: { email: data.email.trim().toLowerCase() } })
    if (!e || !e.active || !verifyPassword(data.password, e.passwordHash)) {
      throw new Error('Wrong username or password')
    }
    startSession(e.id)
    return { ok: true }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  endSession()
  return { ok: true }
})

// ---------- master data ----------

const OFFICE: Role[] = ['HR', 'ADMIN', 'NSM', 'RSM', 'FIN']

export const employeesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser(OFFICE)
  const list = await prisma.employee.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
  const now = new Date()
  const out = []
  for (const e of list) {
    const p = await activeProfile(e.id, localDate(now))
    out.push({
      id: e.id,
      code: e.code,
      name: e.name,
      position: e.position,
      vehicleClass: p?.vehicleClass ?? null,
      vehicleAllowance: p?.vehicleAllowance ?? null,
      baselineKmMonth: p?.baselineKmMonth ?? null,
      tolerancePct: p?.tolerancePct ?? null,
      validFrom: p?.validFrom.toISOString().slice(0, 10) ?? null,
    })
  }
  return out
})

export const profileHistoryFn = createServerFn({ method: 'GET' })
  .validator(z.object({ employeeId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser(OFFICE)
    const rows = await prisma.allowanceProfile.findMany({
      where: { employeeId: data.employeeId },
      orderBy: { validFrom: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      vehicleClass: r.vehicleClass,
      vehicleAllowance: r.vehicleAllowance,
      baselineKmMonth: r.baselineKmMonth,
      validFrom: r.validFrom.toISOString().slice(0, 10),
      validTo: r.validTo?.toISOString().slice(0, 10) ?? null,
    }))
  })

export const ratesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser(OFFICE)
  const rows = await prisma.rate.findMany({ orderBy: [{ vehicleClass: 'asc' }, { validFrom: 'desc' }] })
  return rows.map((r) => ({ ...r, validFrom: r.validFrom.toISOString().slice(0, 10) }))
})

export const addRateFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      vehicleClass: z.enum(['MOTOR', 'CAR']),
      fuelPrice: z.number().positive(),
      kmPerLitre: z.number().positive(),
      validFrom: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser(['FIN', 'ADMIN'])
    const rate = await prisma.rate.create({
      data: {
        vehicleClass: data.vehicleClass,
        fuelPrice: data.fuelPrice,
        kmPerLitre: data.kmPerLitre,
        ratePerKm: ratePerKm(data.fuelPrice, data.kmPerLitre),
        validFrom: new Date(`${data.validFrom}T00:00:00Z`),
      },
    })
    await audit(u.id, 'Rate', rate.id, 'CREATE', data)
    return rate.id
  })

export const customersFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser(OFFICE)
  return prisma.customer.findMany({ orderBy: { code: 'asc' } })
})

// ---------- allowance requests ----------

/** "Replacement of": copy the departing person's current allowance into a draft. */
export const cloneFn = createServerFn({ method: 'GET' })
  .validator(z.object({ replacementOfId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser(['HR', 'ADMIN', 'NSM', 'RSM'])
    const p = await activeProfile(data.replacementOfId, localDate(new Date()))
    if (!p) return null
    return {
      vehicleClass: p.vehicleClass,
      vehicleAllowance: p.vehicleAllowance,
      baselineKmMonth: p.baselineKmMonth,
      tolerancePct: p.tolerancePct,
      profileId: p.id,
    }
  })

export const createRequestFn = createServerFn({ method: 'POST' })
  .validator(requestInput)
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'ADMIN', 'NSM', 'RSM'])
    const subject = await prisma.employee.findUnique({ where: { id: data.employeeId } })
    if (!subject) throw new Error('Employee not found')
    const chain = approvalChain(subject.position)
    const current = await activeProfile(subject.id, data.effectiveFrom)
    const req = await prisma.allowanceRequest.create({
      data: {
        employeeId: subject.id,
        actionType: data.actionType,
        replacementOfId: data.replacementOfId || null,
        clonedFromProfileId: current?.id ?? null,
        vehicleClass: data.vehicleClass,
        vehicleAllowance: data.vehicleAllowance,
        baselineKmMonth: data.baselineKmMonth,
        tolerancePct: data.tolerancePct,
        territoryId: current?.territoryId ?? null,
        startPointId: current?.startPointId ?? null,
        effectiveFrom: new Date(`${data.effectiveFrom}T00:00:00Z`),
        reason: data.reason,
        status: 'SUBMITTED',
        createdById: u.id,
        approvals: {
          create: chain.map((role, i) => ({
            subjectType: 'REQUEST',
            subjectId: 'pending',
            step: i,
            approverRole: role,
          })),
        },
      },
    })
    await prisma.approval.updateMany({
      where: { requestId: req.id },
      data: { subjectId: req.id },
    })
    await audit(u.id, 'AllowanceRequest', req.id, 'SUBMIT', data)
    return req.id
  })

export const requestsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const u = await requireUser()
  const all = ['HR', 'ADMIN', 'NSM'].includes(u.role)
  const rows = await prisma.allowanceRequest.findMany({
    where: all ? {} : { OR: [{ createdById: u.id }, { approvals: { some: { approverRole: u.role } } }] },
    orderBy: { createdAt: 'desc' },
    include: { employee: true, approvals: { orderBy: { step: 'asc' } } },
    take: 200,
  })
  const names = new Map((await prisma.employee.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]))
  return rows.map((r) => {
    const pending = r.approvals.find((a) => a.decision === null)
    return {
      id: r.id,
      employee: r.employee.name,
      position: r.employee.position,
      actionType: r.actionType as ActionType,
      replacementOf: r.replacementOfId ? (names.get(r.replacementOfId) ?? null) : null,
      vehicleClass: r.vehicleClass,
      vehicleAllowance: r.vehicleAllowance,
      baselineKmMonth: r.baselineKmMonth,
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      reason: r.reason,
      status: r.status,
      waitingFor: r.status === 'SUBMITTED' ? (pending?.approverRole ?? null) : null,
      canDecide: r.status === 'SUBMITTED' && pending?.approverRole === u.role,
      steps: r.approvals.map((a) => ({ role: a.approverRole, decision: a.decision, comment: a.comment })),
    }
  })
})

export const decideRequestFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string(),
      decision: z.enum(['APPROVED', 'REJECTED']),
      comment: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser()
    const req = await prisma.allowanceRequest.findUnique({
      where: { id: data.id },
      include: { approvals: { orderBy: { step: 'asc' } } },
    })
    if (!req || req.status !== 'SUBMITTED') throw new Error('Request is not waiting for approval')
    const step = req.approvals.find((a) => a.decision === null)
    if (!step || step.approverRole !== u.role) throw new Error('It is not your turn to decide this request')
    if (data.decision === 'REJECTED' && !data.comment?.trim()) throw new Error('A reason is required to reject')

    await prisma.approval.update({
      where: { id: step.id },
      data: { decision: data.decision, comment: data.comment, approverId: u.id, decidedAt: new Date() },
    })
    const last = req.approvals.filter((a) => a.decision === null).length === 1
    if (data.decision === 'REJECTED') {
      await prisma.allowanceRequest.update({ where: { id: req.id }, data: { status: 'REJECTED' } })
    } else if (last) {
      await applyRequest(req.id)
    } else {
      await prisma.allowanceRequest.update({ where: { id: req.id }, data: { currentStep: step.step + 1 } })
    }
    await audit(u.id, 'AllowanceRequest', req.id, data.decision, { step: step.step, comment: data.comment })
    return { ok: true }
  })

/** Approved request replaces the current allowance from its effective date; nothing is edited in place. */
async function applyRequest(requestId: string) {
  const r = await prisma.allowanceRequest.findUniqueOrThrow({ where: { id: requestId } })
  const dayBefore = new Date(r.effectiveFrom.getTime() - 86_400_000)
  await prisma.$transaction(async (tx) => {
    await tx.allowanceProfile.updateMany({
      where: { employeeId: r.employeeId, validTo: null, validFrom: { lt: r.effectiveFrom } },
      data: { validTo: dayBefore },
    })
    if (r.replacementOfId && r.replacementOfId !== r.employeeId) {
      await tx.allowanceProfile.updateMany({
        where: { employeeId: r.replacementOfId, validTo: null, validFrom: { lt: r.effectiveFrom } },
        data: { validTo: dayBefore },
      })
    }
    await tx.allowanceProfile.create({
      data: {
        employeeId: r.employeeId,
        territoryId: r.territoryId,
        startPointId: r.startPointId,
        vehicleClass: r.vehicleClass,
        vehicleAllowance: r.vehicleAllowance,
        baselineKmMonth: r.baselineKmMonth,
        tolerancePct: r.tolerancePct,
        validFrom: r.effectiveFrom,
        requestId: r.id,
      },
    })
    await tx.allowanceRequest.update({ where: { id: r.id }, data: { status: 'APPROVED' } })
  })
}

export const actionTypesFn = createServerFn({ method: 'GET' }).handler(async () => [...ACTION_TYPES])

// ---------- rep app: today, check-ins, extra km ----------

export const todayFn = createServerFn({ method: 'GET' }).handler(async () => {
  const u = await requireUser()
  const date = localDate(new Date())
  const { from, to } = dayBounds(date)
  const checkins = await prisma.checkin.findMany({
    where: { employeeId: u.id, gpsTime: { gte: from, lt: to } },
    orderBy: { gpsTime: 'asc' },
    include: { customer: true },
  })
  const profile = await activeProfile(u.id, date)
  const plan = await prisma.journeyPlan.findFirst({
    where: { employeeId: u.id, status: 'APPROVED' },
    orderBy: { version: 'desc' },
    include: { stops: { include: { customer: true }, orderBy: [{ dayOfCycle: 'asc' }, { sequence: 'asc' }] } },
  })
  const d = plan ? dayOfCycle(date, plan.validFrom.toISOString().slice(0, 10), plan.cycleDays) : 0
  const daily = await recomputeDay(u.id, date)
  const exceptions = await prisma.distanceException.findMany({ where: { dailyId: daily.id } })
  return {
    date,
    started: checkins.some((c) => c.type === 'START'),
    ended: checkins.some((c) => c.type === 'END'),
    stops: (plan?.stops ?? [])
      .filter((s) => s.dayOfCycle === d)
      .map((s) => ({
        id: s.customer.id,
        name: s.customer.name,
        lat: s.customer.lat,
        lng: s.customer.lng,
        geofenceM: s.customer.geofenceM,
        visited: checkins.some((c) => c.type === 'VISIT' && c.customerId === s.customer.id),
      })),
    checkins: checkins.map((c) => ({
      id: c.id,
      type: c.type,
      customer: c.customer?.name ?? null,
      lat: c.lat,
      lng: c.lng,
      time: c.gpsTime.toISOString(),
      flags: c.flags ? (JSON.parse(c.flags) as string[]) : [],
    })),
    daily: {
      id: daily.id,
      plannedKm: daily.plannedKm,
      actualKm: daily.actualKm,
      withinKm: daily.withinKm,
      toleranceKm: daily.toleranceKm,
      excessKm: daily.excessKm,
    },
    exceptions: exceptions.map((x) => ({
      id: x.id,
      requestedKm: x.requestedKm,
      status: x.status,
      approvedKm: x.approvedKm,
    })),
    baselineKmMonth: profile?.baselineKmMonth ?? 0,
  }
})

export const checkinFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().min(8), // generated on the phone, so retries do not duplicate
      type: z.enum(['START', 'VISIT', 'END']),
      customerId: z.string().optional().nullable(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().optional().nullable(),
      gpsTime: z.string(),
      offline: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser(['SR', 'ASM', 'OM', 'RSM', 'NSM'])
    const existing = await prisma.checkin.findUnique({ where: { id: data.id } })
    if (existing) return { ok: true, duplicate: true }

    const gpsTime = new Date(data.gpsTime)
    let within: boolean | null = null
    if (data.type === 'VISIT' && data.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: data.customerId } })
      if (c?.lat != null && c.lng != null) {
        within = insideGeofence({ lat: data.lat, lng: data.lng }, { lat: c.lat, lng: c.lng }, c.geofenceM)
      }
    } else if (data.type !== 'VISIT') {
      const profile = await activeProfile(u.id, localDate(gpsTime))
      const sp = profile?.startPointId ? await prisma.startPoint.findUnique({ where: { id: profile.startPointId } }) : null
      if (sp) within = insideGeofence({ lat: data.lat, lng: data.lng }, sp, 300)
    }
    const flags = checkinFlags({
      withinGeofence: within,
      accuracyM: data.accuracyM,
      gpsTime,
      serverTime: new Date(),
      offline: data.offline,
    })
    await prisma.checkin.create({
      data: {
        id: data.id,
        employeeId: u.id,
        type: data.type,
        customerId: data.customerId || null,
        lat: data.lat,
        lng: data.lng,
        accuracyM: data.accuracyM ?? null,
        gpsTime,
        flags: flags.length ? JSON.stringify(flags) : null,
      },
    })
    await recomputeDay(u.id, localDate(gpsTime))
    return { ok: true, duplicate: false, flags }
  })

export const requestExtraKmFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      dailyId: z.string(),
      requestedKm: z.number().positive(),
      reasonCode: z.enum(REASON_CODES),
      note: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser()
    const daily = await prisma.dailyDistance.findUnique({ where: { id: data.dailyId } })
    if (!daily || daily.employeeId !== u.id) throw new Error('Not your day')
    if (data.requestedKm > daily.excessKm + 0.01) throw new Error(`Only ${daily.excessKm} km are above tolerance`)
    const ex = await prisma.distanceException.create({
      data: {
        dailyId: daily.id,
        requestedKm: data.requestedKm,
        reasonCode: data.reasonCode,
        note: data.note,
        status: 'SUBMITTED',
        approvals: { create: [{ subjectType: 'EXCEPTION', subjectId: 'pending', step: 0, approverRole: 'RSM' }] },
      },
    })
    await prisma.approval.updateMany({ where: { exceptionId: ex.id }, data: { subjectId: ex.id } })
    await audit(u.id, 'DistanceException', ex.id, 'SUBMIT', data)
    return ex.id
  })

export const exceptionsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const u = await requireUser(['RSM', 'NSM', 'HR', 'ADMIN'])
  const team =
    u.role === 'RSM'
      ? await prisma.employee.findMany({
          where: { OR: [{ managerId: u.id }, { manager: { managerId: u.id } }] },
          select: { id: true },
        })
      : null
  const rows = await prisma.distanceException.findMany({
    where: team ? { daily: { employeeId: { in: team.map((t) => t.id) } } } : {},
    orderBy: { createdAt: 'desc' },
    include: { daily: { include: { employee: true } } },
    take: 200,
  })
  return rows.map((x) => ({
    id: x.id,
    employee: x.daily.employee.name,
    date: x.daily.date,
    plannedKm: x.daily.plannedKm,
    actualKm: x.daily.actualKm,
    excessKm: x.daily.excessKm,
    requestedKm: x.requestedKm,
    reasonCode: x.reasonCode,
    note: x.note,
    status: x.status,
    approvedKm: x.approvedKm,
    canDecide: u.role === 'RSM' && x.status === 'SUBMITTED',
  }))
})

export const decideExceptionFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string(),
      approvedKm: z.number().min(0),
      comment: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser(['RSM'])
    const ex = await prisma.distanceException.findUnique({ where: { id: data.id }, include: { daily: true } })
    if (!ex || ex.status !== 'SUBMITTED') throw new Error('Request is not waiting')
    if (data.approvedKm > ex.requestedKm) throw new Error('Cannot approve more than requested')
    const status = data.approvedKm === 0 ? 'REJECTED' : data.approvedKm < ex.requestedKm ? 'PARTIAL' : 'APPROVED'
    if (status !== 'APPROVED' && !data.comment?.trim()) throw new Error('A comment is required when you reduce or reject')
    await prisma.distanceException.update({ where: { id: ex.id }, data: { status, approvedKm: data.approvedKm } })
    await prisma.approval.updateMany({
      where: { exceptionId: ex.id },
      data: { decision: status === 'REJECTED' ? 'REJECTED' : status === 'PARTIAL' ? 'ADJUSTED' : 'APPROVED', comment: data.comment, approverId: u.id, decidedAt: new Date() },
    })
    await audit(u.id, 'DistanceException', ex.id, status, data)
    return { ok: true }
  })

// ---------- monthly statements ----------

export const generateStatementsFn = createServerFn({ method: 'POST' })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'FIN', 'ADMIN'])
    const rates = await prisma.rate.findMany()
    const days = await prisma.dailyDistance.findMany({
      where: { date: { startsWith: data.month } },
      include: { exceptions: true },
    })
    const byEmployee = new Map<string, typeof days>()
    for (const d of days) byEmployee.set(d.employeeId, [...(byEmployee.get(d.employeeId) ?? []), d])
    let count = 0
    for (const [employeeId, rows] of byEmployee) {
      const sd = []
      let vehicleAllowance = 0
      for (const r of rows) {
        const p = await activeProfile(employeeId, r.date)
        vehicleAllowance = Math.max(vehicleAllowance, p?.vehicleAllowance ?? 0)
        sd.push({
          date: r.date,
          vehicleClass: p?.vehicleClass ?? 'MOTOR',
          withinKm: r.withinKm,
          toleranceKm: r.toleranceKm,
          approvedExcessKm: r.exceptions.reduce((s, x) => s + (x.status === 'SUBMITTED' ? 0 : (x.approvedKm ?? 0)), 0),
        })
      }
      const st = buildStatement(sd, rates)
      const existing = await prisma.monthlyStatement.findUnique({ where: { employeeId_month: { employeeId, month: data.month } } })
      if (existing && existing.status !== 'OPEN') continue
      await prisma.monthlyStatement.upsert({
        where: { employeeId_month: { employeeId, month: data.month } },
        create: {
          employeeId, month: data.month, approvedKm: st.approvedKm, vehicleAllowance,
          petrolAmount: st.petrolAmount, total: Math.round((vehicleAllowance + st.petrolAmount) * 100) / 100, status: 'OPEN',
        },
        update: {
          approvedKm: st.approvedKm, vehicleAllowance, petrolAmount: st.petrolAmount,
          total: Math.round((vehicleAllowance + st.petrolAmount) * 100) / 100,
        },
      })
      count++
    }
    await audit(u.id, 'MonthlyStatement', data.month, 'GENERATE', { count })
    return { count }
  })

export const statementsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ month: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUser()
    const mine = ['SR', 'ASM', 'OM'].includes(u.role)
    const rows = await prisma.monthlyStatement.findMany({
      where: { month: data.month, ...(mine ? { employeeId: u.id } : {}) },
      include: { employee: true },
      orderBy: { employee: { code: 'asc' } },
    })
    return rows.map((s) => ({
      id: s.id,
      employee: s.employee.name,
      code: s.employee.code,
      isMine: s.employeeId === u.id,
      approvedKm: s.approvedKm,
      vehicleAllowance: s.vehicleAllowance,
      petrolAmount: s.petrolAmount,
      adjustments: s.adjustments,
      total: s.total,
      status: s.status,
    }))
  })

const NEXT: Record<string, { from: string[]; roles: Role[]; to: string }> = {
  confirm: { from: ['OPEN'], roles: ['SR', 'ASM', 'OM', 'RSM', 'NSM'], to: 'REP_CONFIRMED' },
  dispute: { from: ['OPEN', 'REP_CONFIRMED'], roles: ['SR', 'ASM', 'OM', 'RSM', 'NSM'], to: 'DISPUTED' },
  approve: { from: ['REP_CONFIRMED', 'DISPUTED'], roles: ['RSM'], to: 'RSM_APPROVED' },
  pay: { from: ['RSM_APPROVED'], roles: ['FIN'], to: 'PAID' },
}

export const statementActionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), action: z.enum(['confirm', 'dispute', 'approve', 'pay']) }))
  .handler(async ({ data }) => {
    const u = await requireUser()
    const rule = NEXT[data.action]
    const s = await prisma.monthlyStatement.findUnique({ where: { id: data.id } })
    if (!s) throw new Error('Statement not found')
    if (!rule.roles.includes(u.role)) throw new Error('Not allowed')
    if (!rule.from.includes(s.status)) throw new Error(`Cannot ${data.action} a statement that is ${s.status}`)
    if ((data.action === 'confirm' || data.action === 'dispute') && s.employeeId !== u.id) {
      throw new Error('Only the employee can do this')
    }
    await prisma.monthlyStatement.update({ where: { id: s.id }, data: { status: rule.to } })
    await audit(u.id, 'MonthlyStatement', s.id, data.action.toUpperCase())
    return { ok: true }
  })

export const auditFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser(['HR', 'ADMIN', 'FIN'])
  const rows = await prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 200 })
  const names = new Map((await prisma.employee.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]))
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actor: names.get(r.actorId) ?? r.actorId, entity: r.entity, action: r.action }))
})

function csvCell(v: string | number) {
  const t = String(v)
  return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
}

/** Approved statements for a month as a CSV Finance can import into payroll. */
export const payrollCsvFn = createServerFn({ method: 'GET' })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async ({ data }) => {
    const u = await requireUser(['FIN', 'HR', 'ADMIN'])
    const rows = await prisma.monthlyStatement.findMany({
      where: { month: data.month, status: { in: ['RSM_APPROVED', 'PAID'] } },
      include: { employee: true },
      orderBy: { employee: { code: 'asc' } },
    })
    const head = ['employee_code', 'employee_name', 'month', 'approved_km', 'vehicle_allowance', 'petrol_amount', 'adjustments', 'total', 'status']
    const lines = rows.map((r) =>
      [r.employee.code, r.employee.name, r.month, r.approvedKm, r.vehicleAllowance, r.petrolAmount, r.adjustments, r.total, r.status]
        .map(csvCell)
        .join(','),
    )
    await audit(u.id, 'MonthlyStatement', data.month, 'EXPORT', { rows: rows.length })
    return { filename: `fuel-allowance-${data.month}.csv`, csv: [head.join(','), ...lines].join('\n'), rows: rows.length }
  })
