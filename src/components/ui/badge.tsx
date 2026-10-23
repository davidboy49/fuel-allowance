import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '#/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground border-transparent',
      good: 'bg-success/15 text-success border-transparent',
      wait: 'bg-warning/20 text-foreground border-transparent',
      bad: 'bg-destructive/15 text-destructive border-transparent',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** One colour language everywhere: green approved, amber waiting, red rejected, grey draft. */
export function statusTone(status: string): 'neutral' | 'good' | 'wait' | 'bad' {
  switch (status) {
    case 'APPROVED':
    case 'PAID':
    case 'RSM_APPROVED':
    case 'REP_CONFIRMED':
      return 'good'
    case 'SUBMITTED':
    case 'OPEN':
    case 'PARTIAL':
      return 'wait'
    case 'REJECTED':
    case 'DISPUTED':
      return 'bad'
    default:
      return 'neutral'
  }
}

export { Badge }
