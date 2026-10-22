import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { decideExceptionFn, decideRequestFn, exceptionsFn, requestsFn } from '#/server/api'
import { ACTION_LABELS } from '#/lib/constants'
import { Badge, statusTone } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { REASON_LABELS, ROLE_LABELS, STATUS_LABELS, errMsg, km, money } from '#/lib/format'

export const Route = createFileRoute('/_app/approvals')({ component: Approvals })

function Approvals() {
  const { user } = Route.useRouteContext()
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => requestsFn() })
  const showExceptions = ['RSM', 'NSM', 'HR', 'ADMIN'].includes(user.role)
  const exceptions = useQuery({ queryKey: ['exceptions'], queryFn: () => exceptionsFn(), enabled: showExceptions })

  const todo =
    (requests.data?.filter((r) => r.canDecide).length ?? 0) + (exceptions.data?.filter((x) => x.canDecide).length ?? 0)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          {todo > 0 ? `${todo} waiting for you` : 'Nothing is waiting for you'}
        </p>
      </div>

      {showExceptions && (
        <Card>
          <CardHeader><CardTitle>Extra km requests</CardTitle></CardHeader>
          <CardContent>
            {exceptions.data?.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
            {!!exceptions.data?.length && (
              <Table>
                <Thead>
                  <Tr><Th>Employee</Th><Th>Date</Th><Th>Planned</Th><Th>Driven</Th><Th>Requested</Th><Th>Reason</Th><Th>Status</Th><Th /></Tr>
                </Thead>
                <Tbody>
                  {exceptions.data.map((x) => (
                    <Tr key={x.id}>
                      <Td className="font-medium">{x.employee}</Td>
                      <Td>{x.date}</Td>
                      <Td>{km(x.plannedKm)}</Td>
                      <Td>{km(x.actualKm)}</Td>
                      <Td>{km(x.requestedKm)}{x.approvedKm != null && x.status !== 'SUBMITTED' ? ` (${km(x.approvedKm)})` : ''}</Td>
                      <Td>{REASON_LABELS[x.reasonCode]}{x.note ? `: ${x.note}` : ''}</Td>
                      <Td><Badge tone={statusTone(x.status)}>{STATUS_LABELS[x.status]}</Badge></Td>
                      <Td>{x.canDecide && <ExceptionActions id={x.id} requestedKm={x.requestedKm} />}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Allowance requests</CardTitle></CardHeader>
        <CardContent>
          {requests.data?.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {!!requests.data?.length && (
            <Table>
              <Thead>
                <Tr><Th>Employee</Th><Th>Type</Th><Th>Vehicle</Th><Th>Baseline</Th><Th>From</Th><Th>Progress</Th><Th /></Tr>
              </Thead>
              <Tbody>
                {requests.data.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-medium">{r.employee}</div>
                      <div className="text-xs text-muted-foreground">{r.position}{r.replacementOf ? `, replaces ${r.replacementOf}` : ''}</div>
                    </Td>
                    <Td>{ACTION_LABELS[r.actionType]}<div className="max-w-56 truncate text-xs text-muted-foreground" title={r.reason}>{r.reason}</div></Td>
                    <Td>{r.vehicleClass === 'MOTOR' ? 'Motor' : 'Car'}, {money(r.vehicleAllowance)}</Td>
                    <Td>{km(r.baselineKmMonth)}/mo</Td>
                    <Td>{r.effectiveFrom}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        {r.steps.map((s, i) => (
                          <Badge key={i} tone={s.decision === 'APPROVED' ? 'good' : s.decision === 'REJECTED' ? 'bad' : r.waitingFor === s.role ? 'wait' : 'neutral'} title={s.comment ?? undefined}>
                            {s.role}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.status === 'SUBMITTED' && r.waitingFor ? `Waiting for ${ROLE_LABELS[r.waitingFor]}` : STATUS_LABELS[r.status]}
                      </div>
                    </Td>
                    <Td>{r.canDecide && <RequestActions id={r.id} />}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RequestActions({ id }: { id: string }) {
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [asking, setAsking] = useState(false)
  const m = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => decideRequestFn({ data: { id, decision, comment: comment || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
  return (
    <div className="grid min-w-44 gap-2">
      {asking && <Input aria-label="Reason" placeholder="Reason for rejecting" value={comment} onChange={(e) => setComment(e.target.value)} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate('APPROVED')}><Check /> Approve</Button>
        <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => (asking && comment ? m.mutate('REJECTED') : setAsking(true))}>
          <X /> Reject
        </Button>
      </div>
      {m.error && <p role="alert" className="text-xs text-destructive">{errMsg(m.error)}</p>}
    </div>
  )
}

function ExceptionActions({ id, requestedKm }: { id: string; requestedKm: number }) {
  const qc = useQueryClient()
  const [approved, setApproved] = useState(String(requestedKm))
  const [comment, setComment] = useState('')
  const m = useMutation({
    mutationFn: (approvedKm: number) => decideExceptionFn({ data: { id, approvedKm, comment: comment || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions'] }),
  })
  const reduced = Number(approved) < requestedKm
  return (
    <div className="grid min-w-48 gap-2">
      <Input aria-label="Km to approve" type="number" step="any" min="0" max={requestedKm} value={approved} onChange={(e) => setApproved(e.target.value)} />
      {reduced && <Input aria-label="Comment" placeholder="Why less?" value={comment} onChange={(e) => setComment(e.target.value)} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(Number(approved))}><Check /> {reduced ? 'Part approve' : 'Approve'}</Button>
        <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => { setApproved('0'); if (comment) m.mutate(0) }}>
          <X /> Reject
        </Button>
      </div>
      {m.error && <p role="alert" className="text-xs text-destructive">{errMsg(m.error)}</p>}
    </div>
  )
}
