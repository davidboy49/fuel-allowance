import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context }) => {
    const role = context.user.role
    if (['SR', 'ASM', 'OM'].includes(role)) throw redirect({ to: '/today' })
    if (role === 'FIN') throw redirect({ to: '/month' })
    throw redirect({ to: '/approvals' })
  },
})
