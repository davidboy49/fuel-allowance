import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'
import { prisma } from '#/db'
import type { Role } from '#/lib/constants'

const COOKIE = 'fa_session'
const MAX_AGE = 60 * 60 * 24 * 14

function secret() {
  const value = process.env.SESSION_SECRET
  if (value) return value
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production')
  return 'dev-only-secret-change-me'
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = scryptSync(password, salt, 32)
  const real = Buffer.from(hash, 'hex')
  return real.length === test.length && timingSafeEqual(real, test)
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex')
}

export function startSession(employeeId: string) {
  const exp = Date.now() + MAX_AGE * 1000
  const body = `${employeeId}.${exp}`
  setCookie(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function endSession() {
  deleteCookie(COOKIE, { path: '/' })
}

export interface SessionUser {
  id: string
  code: string
  name: string
  position: string
  role: Role
  managerId: string | null
}

export async function currentUser(): Promise<SessionUser | null> {
  const raw = getCookie(COOKIE)
  if (!raw) return null
  const [id, exp, sig] = raw.split('.')
  if (!id || !exp || !sig) return null
  const expected = sign(`${id}.${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Number(exp) < Date.now()) return null
  const e = await prisma.employee.findUnique({ where: { id } })
  if (!e || !e.active) return null
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    position: e.position,
    role: e.role as Role,
    managerId: e.managerId,
  }
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser()
  if (!u) throw new Error('Not signed in')
  if (roles && !roles.includes(u.role)) throw new Error('Not allowed')
  return u
}

export async function audit(actorId: string, entity: string, entityId: string, action: string, detail?: unknown) {
  await prisma.auditLog.create({
    data: { actorId, entity, entityId, action, detail: detail ? JSON.stringify(detail) : null },
  })
}
