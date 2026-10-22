import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#1f6f6b' },
      { title: 'Fuel Allowance' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
