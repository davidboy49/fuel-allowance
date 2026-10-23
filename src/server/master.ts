import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from '#/db'
import { ELIGIBLE_POSITIONS, ROLES, approvalChain } from '#/lib/constants'
import { audit, hashPassword, requireUser } from './auth'
import { activeProfile, localDate } from './distance'

const MANAGE = ['RSM', 'HR', 'ADMIN', 'NSM'] as const

export const customerListFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser([...MANAGE, 'FIN'])
  const rows = await prisma.customer.findMany({ orderBy: { code: 'asc' } })
  return rows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    geofenceM: c.geofenceM,
    verified: !!c.verifiedAt,
  }))
})

export const saveCustomerFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().optional(),
      code: z.string().min(1),
      name: z.string().min(1),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      geofenceM: z.number().int().min(30).max(1000).default(150),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser([...MANAGE])
    const { id, ...fields } = data
    // A moved pin has to be verified again.
    const c = id
      ? await prisma.customer.update({ where: { id }, data: { ...fields, verifiedAt: null, verifiedBy: null } })
      : await prisma.customer.create({ data: fields })
    await audit(u.id, 'Customer', c.id, id ? 'UPDATE' : 'CREATE', fields)
    return c.id
  })

export const verifyCustomerFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUser(['RSM', 'NSM', 'ADMIN'])
    await prisma.customer.update({ where: { id: data.id }, data: { verifiedAt: new Date(), verifiedBy: u.id } })
    await audit(u.id, 'Customer', data.id, 'VERIFY_PIN')
    return { ok: true }
  })

export const managersFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser(['HR', 'ADMIN'])
  const rows = await prisma.employee.findMany({
    where: { active: true, position: { in: ['NSM', 'RSM', 'OM', 'ASM'] } },
    orderBy: { code: 'asc' },
  })
  return rows.map((e) => ({ id: e.id, name: e.name, position: e.position }))
})

export const createEmployeeFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      code: z.string().min(2),
      name: z.string().min(2),
      email: z.string().trim().min(3, 'Username needs at least 3 characters').regex(/^\S+$/, 'No spaces in the username'),
      position: z.enum(ROLES),
      managerId: z.string().optional().nullable(),
      password: z.string().min(8, 'Password needs at least 8 characters'),
      /** Copy: the person being replaced. Their current allowance goes to the new person as a request. */
      cloneFromId: z.string().optional().nullable(),
      /** With cloneFromId: also deactivate the old person and hand their team to the new one. */
      disableSource: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'ADMIN'])
    if (data.disableSource && !data.cloneFromId) throw new Error('Choose who to copy from')
    const source = data.cloneFromId ? await prisma.employee.findUnique({ where: { id: data.cloneFromId } }) : null
    if (data.cloneFromId && (!source || !source.active)) throw new Error('The person to copy from was not found or is already disabled')
    const today = localDate(new Date())
    const sourceProfile = source ? await activeProfile(source.id, today) : null
    const dup = await prisma.employee.findFirst({
      where: { OR: [{ code: data.code }, { email: data.email.trim().toLowerCase() }] },
    })
    if (dup) throw new Error('That code or username is already used')
    const email = data.email.trim().toLowerCase()
    let requestId: string | null = null
    const e = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          code: data.code,
          name: data.name,
          email,
          position: data.position,
          role: data.position,
          managerId: data.managerId || null,
          passwordHash: hashPassword(data.password),
        },
      })
      if (source && sourceProfile) {
        // Allowance changes still go through the normal approval chain; approval also ends the old person's allowance.
        const req = await tx.allowanceRequest.create({
          data: {
            employeeId: created.id,
            actionType: 'NEW',
            replacementOfId: source.id,
            clonedFromProfileId: sourceProfile.id,
            vehicleClass: sourceProfile.vehicleClass,
            vehicleAllowance: sourceProfile.vehicleAllowance,
            baselineKmMonth: sourceProfile.baselineKmMonth,
            tolerancePct: sourceProfile.tolerancePct,
            territoryId: sourceProfile.territoryId,
            startPointId: sourceProfile.startPointId,
            effectiveFrom: new Date(`${today}T00:00:00Z`),
            reason: `Replaces ${source.name} (${source.code}), same allowance`,
            status: 'SUBMITTED',
            createdById: u.id,
            approvals: {
              create: approvalChain(created.position).map((role, i) => ({
                subjectType: 'REQUEST',
                subjectId: 'pending',
                step: i,
                approverRole: role,
              })),
            },
          },
        })
        await tx.approval.updateMany({ where: { requestId: req.id }, data: { subjectId: req.id } })
        requestId = req.id
      }
      if (source && data.disableSource) {
        await tx.employee.updateMany({ where: { managerId: source.id, id: { not: created.id } }, data: { managerId: created.id } })
        await tx.employee.update({ where: { id: source.id }, data: { active: false } })
      }
      return created
    })
    // audit writes use the shared connection, so they run after the transaction has committed
    if (requestId) await audit(u.id, 'AllowanceRequest', requestId, 'SUBMIT', { clonedFrom: source?.code })
    if (source && data.disableSource) await audit(u.id, 'Employee', source.id, 'DISABLE', { replacedBy: data.code })
    await audit(u.id, 'Employee', e.id, 'CREATE', { code: data.code, position: data.position, clonedFrom: source?.code ?? null })
    return {
      id: e.id,
      eligible: (ELIGIBLE_POSITIONS as readonly string[]).includes(data.position),
      copiedAllowance: !!(source && sourceProfile),
      disabledOld: !!(source && data.disableSource),
    }
  })

export const resetPasswordFn = createServerFn({ method: 'POST' })
  .validator(z.object({ employeeId: z.string(), password: z.string().min(8, 'Password needs at least 8 characters') }))
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'ADMIN'])
    await prisma.employee.update({ where: { id: data.employeeId }, data: { passwordHash: hashPassword(data.password) } })
    await audit(u.id, 'Employee', data.employeeId, 'RESET_PASSWORD')
    return { ok: true }
  })
