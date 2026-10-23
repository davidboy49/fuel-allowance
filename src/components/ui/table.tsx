import * as React from 'react'
import { cn } from '#/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
const Thead = (p: React.ComponentProps<'thead'>) => <thead className="[&_tr]:border-b" {...p} />
const Tbody = (p: React.ComponentProps<'tbody'>) => <tbody className="[&_tr:last-child]:border-0" {...p} />
const Tr = ({ className, ...p }: React.ComponentProps<'tr'>) => (
  <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...p} />
)
const Th = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap', className)} {...p} />
)
const Td = ({ className, ...p }: React.ComponentProps<'td'>) => (
  <td className={cn('px-3 py-3 align-middle', className)} {...p} />
)

export { Table, Thead, Tbody, Tr, Th, Td }
