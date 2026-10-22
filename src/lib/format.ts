export const money = (n: number | null | undefined) =>
  n == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export const km = (n: number | null | undefined) =>
  n == null ? '-' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)} km`

export const ROLE_LABELS: Record<string, string> = {
  SR: 'Sales rep',
  ASM: 'Area sales manager',
  OM: 'Operations manager',
  RSM: 'Regional sales manager',
  NSM: 'National sales manager',
  HR: 'HR',
  FIN: 'Finance',
  ADMIN: 'Admin',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Waiting',
  APPROVED: 'Approved',
  PARTIAL: 'Part approved',
  REJECTED: 'Rejected',
  OPEN: 'Open',
  REP_CONFIRMED: 'Confirmed by employee',
  DISPUTED: 'Disputed',
  RSM_APPROVED: 'Signed off by RSM',
  PAID: 'Paid',
}

export const REASON_LABELS: Record<string, string> = {
  URGENT_DELIVERY: 'Urgent delivery',
  ROAD_CLOSURE: 'Road closure',
  EXTRA_CUSTOMER: 'Extra customer',
  OTHER: 'Other',
}

export const thisMonth = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7)
export const todayStr = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}
