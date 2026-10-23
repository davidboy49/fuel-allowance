import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from '#/db'
import { ELIGIBLE_POSITIONS, ROLES } from '#/lib/constants'
import { audit, hashPassword, requireUser } from './auth'

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
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'ADMIN'])
    const dup = await prisma.employee.findFirst({
      where: { OR: [{ code: data.code }, { email: data.email.trim().toLowerCase() }] },
    })
    if (dup) throw new Error('That code or username is already used')
    const e = await prisma.employee.create({
      data: {
        code: data.code,
        name: data.name,
        email: data.email.trim().toLowerCase(),
        position: data.position,
        role: data.position,
        managerId: data.managerId || null,
        passwordHash: hashPassword(data.password),
      },
    })
    await audit(u.id, 'Employee', e.id, 'CREATE', { code: data.code, position: data.position })
    return { id: e.id, eligible: (ELIGIBLE_POSITIONS as readonly string[]).includes(data.position) }
  })

export const resetPasswordFn = createServerFn({ method: 'POST' })
  .validator(z.object({ employeeId: z.string(), password: z.string().min(8, 'Password needs at least 8 characters') }))
  .handler(async ({ data }) => {
    const u = await requireUser(['HR', 'ADMIN'])
    await prisma.employee.update({ where: { id: data.employeeId }, data: { passwordHash: hashPassword(data.password) } })
    await audit(u.id, 'Employee', data.employeeId, 'RESET_PASSWORD')
    return { ok: true }
  })
