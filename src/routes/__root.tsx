import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { langFn } from '#/server/lang'
import { LangProvider } from '#/lib/useT'

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
  beforeLoad: async () => ({ lang: await langFn() }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  const { lang } = Route.useRouteContext()
  return (
    <LangProvider value={lang}>
      <div lang={lang}>
        <Outlet />
      </div>
    </LangProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
        <Scripts />
      </body>
    </html>
  )
}
