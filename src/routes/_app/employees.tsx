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

type Mode = 'NEW' | 'COPY' | 'COPY_DISABLE'

const MODE_LABELS: Record<Mode, string> = {
  NEW: 'Create brand new',
  COPY: 'Copy / clone (keep the old user)',
  COPY_DISABLE: 'Copy and disable the old user',
}

function AddEmployee() {
  const qc = useQueryClient()
  const managers = useQuery({ queryKey: ['managers'], queryFn: () => managersFn() })
  const people = useQuery({ queryKey: ['employees'], queryFn: () => employeesFn() })
  const [mode, setMode] = useState<Mode>('NEW')
  const [sourceId, setSourceId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState<(typeof ROLES)[number]>('SR')
  const [managerId, setManagerId] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const source = people.data?.find((p) => p.id === sourceId)
  const copying = mode !== 'NEW'

  const pickSource = (id: string) => {
    setSourceId(id)
    const p = people.data?.find((x) => x.id === id)
    if (p) {
      setPosition(p.position as typeof position)
      setManagerId(p.managerId ?? '')
    }
  }
  const create = useMutation({
    mutationFn: () =>
      createEmployeeFn({
        data: {
          code, name, email, position, managerId: managerId || null, password,
          cloneFromId: copying ? sourceId : null,
          disableSource: mode === 'COPY_DISABLE',
        },
      }),
    onSuccess: (r) => {
      const parts = [`Added ${name}.`]
      if (r.copiedAllowance) parts.push(`The allowance of ${source?.name} was sent for approval in their name.`)
      else if (copying) parts.push(`${source?.name} has no current allowance to copy.`)
      else if (r.eligible) parts.push('Create an allowance request to give them an allowance.')
      if (r.disabledOld) parts.push(`${source?.name} is disabled and their team now reports to ${name}.`)
      setDone(parts.join(' '))
      setCode(''); setName(''); setEmail(''); setPassword(''); setSourceId(''); setMode('NEW')
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['managers'] })
    },
  })
  return (
    <Card>
      <CardHeader><CardTitle>Add an employee</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setDone(null); create.mutate() }}>
          <div className="grid gap-1.5">
            <Label htmlFor="e-mode">How</Label>
            <Select id="e-mode" value={mode} onChange={(e) => { setMode(e.target.value as Mode); if (e.target.value === 'NEW') setSourceId('') }}>
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </Select>
          </div>
          {copying && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="e-src">Copy from</Label>
              <Select id="e-src" value={sourceId} onChange={(e) => pickSource(e.target.value)} required>
                <option value="">Choose a person</option>
                {people.data?.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name} ({p.position})</option>)}
              </Select>
              {source && (
                <p className="text-xs text-muted-foreground">
                  {source.vehicleClass
                    ? `Copies ${source.vehicleClass === 'MOTOR' ? 'motor' : 'car'}, ${money(source.vehicleAllowance)} vehicle allowance, ${km(source.baselineKmMonth ?? 0)}/mo baseline, ${source.tolerancePct}% tolerance, territory and start point, position and manager. The allowance goes through approval as a replacement request.`
                    : 'Copies position and manager. This person has no current allowance.'}
                  {mode === 'COPY_DISABLE' && ' The old user is disabled now and their direct reports move to the new person.'}
                </p>
              )}
            </div>
          )}
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
            <Button type="submit" disabled={create.isPending || (copying && !sourceId)}>
              {mode === 'COPY_DISABLE' ? 'Add employee and disable old user' : copying ? 'Add copy' : 'Add employee'}
            </Button>
            {create.error && <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(create.error)}</p>}
            {done && <p role="status" className="mt-3 text-sm text-success">{done}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
