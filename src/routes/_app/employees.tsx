import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { employeesFn, profileHistoryFn } from '#/server/api'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { km, money } from '#/lib/format'

export const Route = createFileRoute('/_app/employees')({ component: Employees })

function Employees() {
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
