import { Link, Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { ClipboardCheck, Fuel, History, LogOut, MapPin, PlusCircle, ReceiptText, Tag, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { logoutFn, meFn } from '#/server/api'
import { ROLE_LABELS } from '#/lib/format'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const user = await meFn()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: Shell,
})

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  roles: string[]
}

const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: MapPin, roles: ['SR', 'ASM', 'OM'] },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck, roles: ['RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/month', label: 'Month', icon: ReceiptText, roles: ['SR', 'ASM', 'OM', 'RSM', 'NSM', 'HR', 'FIN', 'ADMIN'] },
  { to: '/requests/new', label: 'New request', icon: PlusCircle, roles: ['RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['RSM', 'NSM', 'HR', 'ADMIN', 'FIN'] },
  { to: '/rates', label: 'Rates', icon: Tag, roles: ['HR', 'FIN', 'ADMIN', 'NSM', 'RSM'] },
  { to: '/audit', label: 'Audit log', icon: History, roles: ['HR', 'FIN', 'ADMIN'] },
]

function Shell() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: () => navigate({ to: '/login' }),
  })
  const items = NAV.filter((n) => n.roles.includes(user.role))
  const field = ['SR', 'ASM', 'OM'].includes(user.role)

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden border-r bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-4 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Fuel className="size-4" />
          </span>
          Fuel Allowance
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="mb-3 text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
          <button
            onClick={() => logout.mutate()}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <span className="flex items-center gap-2 font-semibold">
            <Fuel className="size-4 text-primary" /> Fuel Allowance
          </span>
          <button onClick={() => logout.mutate()} aria-label="Sign out" className="p-2 text-muted-foreground">
            <LogOut className="size-4" />
          </button>
        </header>
        <main className={cn('mx-auto w-full max-w-5xl flex-1 p-4 md:p-8', field && 'pb-24 md:pb-8')}>
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-10 grid auto-cols-fr grid-flow-col border-t bg-card md:hidden">
          {items.slice(0, 5).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
              activeProps={{ className: 'text-primary font-medium' }}
            >
              <n.icon className="size-5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
