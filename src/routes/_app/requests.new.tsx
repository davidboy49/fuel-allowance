import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { cloneFn, createRequestFn, employeesFn } from '#/server/api'
import { ACTION_LABELS, ACTION_TYPES, approvalChain, type ActionType, type VehicleClass } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label, Select, Textarea } from '#/components/ui/input'
import { errMsg, todayStr } from '#/lib/format'

export const Route = createFileRoute('/_app/requests/new')({ component: NewRequest })

function NewRequest() {
  const navigate = useNavigate()
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => employeesFn() })
  const [employeeId, setEmployeeId] = useState('')
  const [actionType, setActionType] = useState<ActionType>('NEW')
  const [replacementOfId, setReplacementOfId] = useState('')
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('MOTOR')
  const [vehicleAllowance, setVehicleAllowance] = useState('0')
  const [baseline, setBaseline] = useState('0')
  const [tolerance, setTolerance] = useState('15')
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr())
  const [reason, setReason] = useState('')
  const [cloned, setCloned] = useState<string | null>(null)

  const subject = employees.data?.find((e) => e.id === employeeId)
  const chain = subject ? approvalChain(subject.position) : []

  const clone = useMutation({
    mutationFn: (id: string) => cloneFn({ data: { replacementOfId: id } }),
    onSuccess: (p) => {
      if (!p) return setCloned('No active allowance to copy.')
      setVehicleClass(p.vehicleClass as VehicleClass)
      setVehicleAllowance(String(p.vehicleAllowance))
      setBaseline(String(p.baselineKmMonth))
      setTolerance(String(p.tolerancePct))
      setCloned('Copied from the person being replaced. Edit only what differs.')
    },
  })

  const create = useMutation({
    mutationFn: () =>
      createRequestFn({
        data: {
          employeeId,
          actionType,
          replacementOfId: replacementOfId || null,
          vehicleClass,
          vehicleAllowance: Number(vehicleAllowance),
          baselineKmMonth: Number(baseline),
          tolerancePct: Number(tolerance),
          effectiveFrom,
          reason,
        },
      }),
    onSuccess: () => navigate({ to: '/approvals' }),
  })

  const setType = (t: ActionType) => {
    setActionType(t)
    if (t === 'TO_MOTOR') setVehicleClass('MOTOR')
    if (t === 'TO_CAR') setVehicleClass('CAR')
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New allowance request</h1>
        <p className="text-sm text-muted-foreground">An approved request replaces the current allowance from the effective date.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
          <CardDescription>Fill in what the allowance should be after the change.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="n-emp">Employee</Label>
                <Select id="n-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  <option value="">Choose...</option>
                  {employees.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="n-type">Action type</Label>
                <Select id="n-type" value={actionType} onChange={(e) => setType(e.target.value as ActionType)}>
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5 rounded-lg border border-dashed p-3">
              <Label htmlFor="n-repl">Replacement of (optional)</Label>
              <div className="flex gap-2">
                <Select id="n-repl" value={replacementOfId} onChange={(e) => { setReplacementOfId(e.target.value); setCloned(null) }}>
                  <option value="">Not replacing anyone</option>
                  {employees.data?.filter((e) => e.id !== employeeId).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
                </Select>
                <Button type="button" variant="outline" disabled={!replacementOfId || clone.isPending} onClick={() => clone.mutate(replacementOfId)}>
                  <Copy /> Copy
                </Button>
              </div>
              {cloned && <p role="status" className="text-xs text-muted-foreground">{cloned}</p>}
              <p className="text-xs text-muted-foreground">The old person's allowance ends the day before the effective date, in the same approval.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="n-veh">Vehicle</Label>
                <Select id="n-veh" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}>
                  <option value="MOTOR">Motorbike</option>
                  <option value="CAR">Car</option>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="n-va">Vehicle allowance per month (USD)</Label>
                <Input id="n-va" type="number" min="0" step="0.01" value={vehicleAllowance} onChange={(e) => setVehicleAllowance(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="n-base">Baseline km per month</Label>
                <Input id="n-base" type="number" min="0" step="1" value={baseline} onChange={(e) => setBaseline(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="n-tol">Tolerance %</Label>
                <Input id="n-tol" type="number" min="0" max="100" step="1" value={tolerance} onChange={(e) => setTolerance(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="n-from">Effective from</Label>
                <Input id="n-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="n-reason">Reason</Label>
              <Textarea id="n-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this change needed?" required />
            </div>
            {chain.length > 0 && (
              <p className="text-sm text-muted-foreground">Approval order: {chain.join(' then ')}</p>
            )}
            {create.error && <p role="alert" className="text-sm text-destructive">{errMsg(create.error)}</p>}
            <Button type="submit" size="lg" disabled={create.isPending || !employeeId}>Submit for approval</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
