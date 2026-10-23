import { prisma } from '#/db'
import type { SessionUser } from './auth'

/** All employees below a manager in the reporting line (direct and indirect). */
export async function teamIds(managerId: string): Promise<string[]> {
  const all = await prisma.employee.findMany({ select: { id: true, managerId: true } })
  const out: string[] = []
  let frontier = [managerId]
  while (frontier.length) {
    const next = all.filter((e) => e.managerId && frontier.includes(e.managerId)).map((e) => e.id)
    out.push(...next)
    frontier = next
  }
  return out
}

/** Roles that see everyone; RSM sees their team; others only themselves. */
export async function canSee(user: SessionUser, employeeId: string): Promise<boolean> {
  if (['HR', 'ADMIN', 'NSM', 'FIN'].includes(user.role)) return true
  if (user.id === employeeId) return true
  if (user.role === 'RSM') return (await teamIds(user.id)).includes(employeeId)
  return false
}
