import { Link, Outlet, createFileRoute, redirect, useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { ClipboardCheck, Fuel, History, LogOut, MapPin, PlusCircle, ReceiptText, Route as RouteIcon, Store, Tag, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { logoutFn, meFn } from '#/server/api'
import { ROLE_LABELS } from '#/lib/format'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/useT'
import type { MessageKey } from '#/lib/i18n'
import { LangSwitch } from '#/components/LangSwitch'

const ME_KEY = ['me']
const ME_TTL_MS = 60_000

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    // Re-check the session at most once a minute; otherwise every sidebar click waits for a server round trip.
    const cached = context.queryClient.getQueryData<Awaited<ReturnType<typeof meFn>>>(ME_KEY)
    const fresh = Date.now() - (context.queryClient.getQueryState(ME_KEY)?.dataUpdatedAt ?? 0) < ME_TTL_MS
    if (cached && fresh) return { user: cached }
    const user = await meFn()
    if (!user) {
      context.queryClient.removeQueries({ queryKey: ME_KEY })
      throw redirect({ to: '/login' })
    }
    context.queryClient.setQueryData(ME_KEY, user)
    return { user }
  },
  component: Shell,
})

interface NavItem {
  to: string
  label: MessageKey
  icon: ComponentType<{ className?: string }>
  roles: string[]
}

const NAV: NavItem[] = [
  { to: '/today', label: 'nav.today', icon: MapPin, roles: ['SR', 'ASM', 'OM'] },
  { to: '/approvals', label: 'nav.approvals', icon: ClipboardCheck, roles: ['RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/month', label: 'nav.month', icon: ReceiptText, roles: ['SR', 'ASM', 'OM', 'RSM', 'NSM', 'HR', 'FIN', 'ADMIN'] },
  { to: '/requests/new', label: 'nav.newRequest', icon: PlusCircle, roles: ['RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/plans', label: 'nav.plans', icon: RouteIcon, roles: ['SR', 'ASM', 'OM', 'RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/customers', label: 'nav.customers', icon: Store, roles: ['RSM', 'NSM', 'HR', 'ADMIN'] },
  { to: '/employees', label: 'nav.employees', icon: Users, roles: ['RSM', 'NSM', 'HR', 'ADMIN', 'FIN'] },
  { to: '/rates', label: 'nav.rates', icon: Tag, roles: ['HR', 'FIN', 'ADMIN', 'NSM', 'RSM'] },
  { to: '/audit', label: 'nav.audit', icon: History, roles: ['HR', 'FIN', 'ADMIN'] },
]

function Shell() {
  const { user } = Route.useRouteContext()
  const t = useT()
  const navigate = useNavigate()
  const { queryClient } = Route.useRouteContext()
  const loading = useRouterState({ select: (s) => s.isLoading || s.status === 'pending' })
  const logout = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ME_KEY })
      navigate({ to: '/login' })
    },
  })
  const items = NAV.filter((n) => n.roles.includes(user.role))
  const field = ['SR', 'ASM', 'OM'].includes(user.role)

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      {loading && <div role="progressbar" aria-label="Loading" className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-primary" />}
      <aside className="hidden border-r bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-4 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Fuel className="size-4" />
          </span>
          {t('app.name')}
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
              {t(n.label)}
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
            <LogOut className="size-3.5" /> {t('common.signOut')}
          </button>
          <LangSwitch className="mt-3" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <span className="flex items-center gap-2 font-semibold">
            <Fuel className="size-4 text-primary" /> {t('app.name')}
          </span>
          <span className="flex items-center gap-2">
            <LangSwitch />
            <button onClick={() => logout.mutate()} aria-label={t('common.signOut')} className="p-2 text-muted-foreground">
              <LogOut className="size-4" />
            </button>
          </span>
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
              {t(n.label)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
