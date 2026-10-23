import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { employeesFn, profileHistoryFn } from '#/server/api'
import { createEmployeeFn, managersFn } from '#/server/master'
import { ROLES } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label, Select } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { ROLE_LABELS, errMsg, km, money } from '#/lib/format'

export const Route = createFileRoute('/_app/employees')({ component: Employees })

function Employees() {
  const { user } = Route.useRouteContext()
  const list = useQuery({ queryKey: ['employees'], queryFn: () => employeesFn() })
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const rows = list.data?.filter((e) => `${e.name} ${e.code} ${e.position}`.toLowerCase().includes(q.toLowerCase())) ?? []

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Employees and allowances</h1>
          <p className="text-sm text-muted-foreground">Current allowance profile for each person. Select a row to see its history.</p>
        </div>
        <Input aria-label="Search" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
      </div>
      {['HR', 'ADMIN'].includes(user.role) && <AddEmployee />}
      <Card>
        <CardContent className="pt-5">
          <Table>
            <Thead>
              <Tr><Th>Code</Th><Th>Name</Th><Th>Position</Th><Th>Vehicle</Th><Th>Allowance</Th><Th>Baseline</Th><Th>Tolerance</Th><Th>Since</Th></Tr>
            </Thead>
            <Tbody>
              {rows.map((e) => (
                <>
                  <Tr key={e.id} className="cursor-pointer" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <Td>{e.code}</Td>
                    <Td className="font-medium">{e.name}</Td>
                    <Td>{e.position}</Td>
                    <Td>{e.vehicleClass ? (e.vehicleClass === 'MOTOR' ? 'Motor' : 'Car') : '-'}</Td>
                    <Td>{money(e.vehicleAllowance)}</Td>
                    <Td>{e.baselineKmMonth != null ? `${km(e.baselineKmMonth)}/mo` : '-'}</Td>
                    <Td>{e.tolerancePct != null ? `${e.tolerancePct}%` : '-'}</Td>
                    <Td>{e.validFrom ?? '-'}</Td>
                  </Tr>
                  {open === e.id && (
                    <Tr key={`${e.id}-h`} className="bg-muted/40 hover:bg-muted/40">
                      <Td colSpan={8}><History employeeId={e.id} /></Td>
                    </Tr>
                  )}
                </>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function History({ employeeId }: { employeeId: string }) {
  const h = useQuery({ queryKey: ['history', employeeId], queryFn: () => profileHistoryFn({ data: { employeeId } }) })
  if (!h.data) return <span className="text-sm text-muted-foreground">Loading...</span>
  if (h.data.length === 0) return <span className="text-sm text-muted-foreground">No allowance on record.</span>
  return (
    <ul className="grid gap-1 text-sm">
      {h.data.map((p) => (
        <li key={p.id}>
          {p.validFrom} to {p.validTo ?? 'now'}: {p.vehicleClass === 'MOTOR' ? 'Motor' : 'Car'}, {money(p.vehicleAllowance)} vehicle, {km(p.baselineKmMonth)}/mo
        </li>
      ))}
    </ul>
  )
}

function AddEmployee() {
  const qc = useQueryClient()
  const managers = useQuery({ queryKey: ['managers'], queryFn: () => managersFn() })
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState<(typeof ROLES)[number]>('SR')
  const [managerId, setManagerId] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: () => createEmployeeFn({ data: { code, name, email, position, managerId: managerId || null, password } }),
    onSuccess: (r) => {
      setDone(r.eligible ? `Added ${name}. Create an allowance request to give them an allowance.` : `Added ${name}.`)
      setCode(''); setName(''); setEmail(''); setPassword('')
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['managers'] })
    },
  })
  return (
    <Card>
      <CardHeader><CardTitle>Add an employee</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setDone(null); create.mutate() }}>
          <div className="grid gap-1.5"><Label htmlFor="e-code">Code</Label><Input id="e-code" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="e-name">Name</Label><Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="e-email">Username or work email</Label><Input id="e-email" type="text" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-pos">Position</Label>
            <Select id="e-pos" value={position} onChange={(e) => setPosition(e.target.value as typeof position)}>
              {ROLES.map((r) => <option key={r} value={r}>{r} - {ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-mgr">Reports to</Label>
            <Select id="e-mgr" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">Nobody</option>
              {managers.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.position})</option>)}
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="e-pw">Starting password</Label><Input id="e-pw" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={create.isPending}>Add employee</Button>
            {create.error && <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(create.error)}</p>}
            {done && <p role="status" className="mt-3 text-sm text-success">{done}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
