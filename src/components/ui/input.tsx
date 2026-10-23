import * as React from 'react'
import { cn } from '#/lib/utils'

const field =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring disabled:opacity-50 aria-invalid:border-destructive'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(field, 'h-10', className)} {...props} />
}
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(field, 'min-h-20', className)} {...props} />
}
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(field, 'h-10 pr-8', className)} {...props} />
}
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('text-sm font-medium leading-none', className)} {...props} />
}

export { Input, Textarea, Select, Label }
