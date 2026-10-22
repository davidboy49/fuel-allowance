import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Fuel } from 'lucide-react'
import { loginFn, meFn } from '#/server/api'
import { Button } from '#/components/ui/button'
import { Input, Label } from '#/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { errMsg } from '#/lib/format'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await meFn()) throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => loginFn({ data: { email, password } }),
    onSuccess: () => navigate({ to: '/' }),
  })

  return (
    <main className="grid min-h-dvh place-items-center bg-secondary/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Fuel className="size-6" />
          </div>
          <CardTitle className="text-xl">Fuel Allowance</CardTitle>
          <CardDescription>Sign in with your work email</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              login.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {login.error && <p role="alert" className="text-sm text-destructive">{errMsg(login.error)}</p>}
            <Button type="submit" size="lg" disabled={login.isPending}>
              {login.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo: sr001@demo.local, rsm01@demo.local, hr01@demo.local, fin01@demo.local (password demo1234)
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
