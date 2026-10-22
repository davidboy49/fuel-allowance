import { z } from 'zod'

export const ROLES = ['SR', 'ASM', 'OM', 'RSM', 'NSM', 'HR', 'FIN', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

export const ELIGIBLE_POSITIONS = ['NSM', 'RSM', 'OM', 'ASM', 'SR'] as const

export const ACTION_TYPES = ['NEW', 'INCREASE', 'DECREASE', 'TO_MOTOR', 'TO_CAR'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const ACTION_LABELS: Record<ActionType, string> = {
  NEW: 'New request',
  INCREASE: 'Adjustment: increase',
  DECREASE: 'Adjustment: decrease',
  TO_MOTOR: 'Change to motor',
  TO_CAR: 'Change to car',
}

export const VEHICLE_CLASSES = ['MOTOR', 'CAR'] as const
export type VehicleClass = (typeof VEHICLE_CLASSES)[number]

export const REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const

export const requestInput = z.object({
  employeeId: z.string().min(1),
  actionType: z.enum(ACTION_TYPES),
  replacementOfId: z.string().optional().nullable(),
  vehicleClass: z.enum(VEHICLE_CLASSES),
  vehicleAllowance: z.number().min(0),
  baselineKmMonth: z.number().min(0),
  tolerancePct: z.number().min(0).max(100).default(15),
  effectiveFrom: z.string().min(8),
  reason: z.string().min(3, 'Reason is required'),
})
export type RequestInput = z.infer<typeof requestInput>

/**
 * Suggested approval chain per position of the person the allowance is for.
 * To be confirmed with HR and Sales (see the open questions in the proposal).
 * The last step is always HR policy check.
 */
export function approvalChain(position: string): Role[] {
  switch (position) {
    case 'SR':
    case 'ASM':
      return ['RSM', 'NSM', 'HR']
    case 'RSM':
    case 'OM':
      return ['NSM', 'HR']
    case 'NSM':
      return ['ADMIN', 'HR']
    default:
      return ['HR']
  }
}

export const REASON_CODES = ['URGENT_DELIVERY', 'ROAD_CLOSURE', 'EXTRA_CUSTOMER', 'OTHER'] as const
