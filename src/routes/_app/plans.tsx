import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react'
import { decidePlanFn, planEditorDataFn, plansFn, savePlanFn } from '#/server/plans'
import { Badge, statusTone } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label, Select } from '#/components/ui/input'
import { STATUS_LABELS, errMsg, km, todayStr } from '#/lib/format'

export const Route = createFileRoute('/_app/plans')({ component: Plans })

const DAY_NAMES = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']

function Plans() {
  const { user } = Route.useRouteContext()
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => plansFn() })
  const canEdit = ['RSM', 'HR', 'ADMIN', 'NSM'].includes(user.role)
  const [editing, setEditing] = useState(false)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Journey plans</h1>
          <p className="text-sm text-muted-foreground">
            The approved plan sets each rep's planned km per day. Km is calculated from the customer pins, not typed.
          </p>
        </div>
        {canEdit && !editing && (
          <Button onClick={() => setEditing(true)}><Plus /> New plan version</Button>
        )}
      </div>

      {editing && <Editor onDone={() => setEditing(false)} />}

      {plans.data?.length === 0 && <p className="text-sm text-muted-foreground">No plans yet.</p>}
      {plans.data?.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
    </div>
  )
}

type PlanRow = NonNullable<ReturnType<typeof usePlansType>['data']>[number]
function usePlansType() {
  return useQuery({ queryKey: ['plans'], queryFn: () => plansFn() })
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [asking, setAsking] = useState(false)
  const m = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      decidePlanFn({ data: { id: plan.id, decision, comment: comment || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{plan.employee}, version {plan.version}</CardTitle>
          <CardDescription>
            From {plan.validFrom}, {plan.cycleDays}-day cycle, {km(plan.weeklyKm)} per cycle
          </CardDescription>
        </div>
        <Badge tone={statusTone(plan.status === 'RETIRED' ? 'DRAFT' : plan.status)}>
          {plan.status === 'RETIRED' ? 'Replaced' : STATUS_LABELS[plan.status]}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.days.map((d) => (
            <div key={d.day} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex justify-between font-medium">
                <span>{DAY_NAMES[d.day - 1] ?? `Day ${d.day}`}</span>
                <span className="text-muted-foreground">{km(d.km)}</span>
              </div>
              <ol className="list-inside list-decimal text-muted-foreground">
                {d.stops.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
        {plan.canDecide && (
          <div className="flex flex-wrap items-center gap-2">
            {asking && (
              <Input aria-label="Reason" className="max-w-64" placeholder="Reason for rejecting" value={comment} onChange={(e) => setComment(e.target.value)} />
            )}
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate('APPROVED')}><Check /> Approve plan</Button>
            <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => (asking && comment ? m.mutate('REJECTED') : setAsking(true))}>
              <X /> Reject
            </Button>
          </div>
        )}
        {m.error && <p role="alert" className="text-sm text-destructive">{errMsg(m.error)}</p>}
      </CardContent>
    </Card>
  )
}

interface Stop {
  dayOfCycle: number
  customerId: string
}

function Editor({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const data = useQuery({ queryKey: ['plan-editor'], queryFn: () => planEditorDataFn() })
  const [employeeId, setEmployeeId] = useState('')
  const [cycleDays, setCycleDays] = useState<7 | 14>(7)
  const [validFrom, setValidFrom] = useState(todayStr())
  const [stops, setStops] = useState<Stop[]>([])

  const save = useMutation({
    mutationFn: () => savePlanFn({ data: { employeeId, cycleDays, validFrom, stops } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] })
      onDone()
    },
  })

  const name = (id: string) => data.data?.customers.find((c) => c.id === id)?.name ?? id
  const days = Array.from({ length: cycleDays }, (_, i) => i + 1)
  const move = (idx: number, dir: -1 | 1) =>
    setStops((s) => {
      const j = idx + dir
      if (j < 0 || j >= s.length || s[j].dayOfCycle !== s[idx].dayOfCycle) return s
      const copy = [...s]
      ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
      return copy
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>New plan version</CardTitle>
        <CardDescription>It goes to the RSM for approval and replaces the current plan from the start date.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-emp">Employee</Label>
              <Select id="p-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                <option value="">Choose...</option>
                {data.data?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-cycle">Cycle</Label>
              <Select id="p-cycle" value={cycleDays} onChange={(e) => { const v = Number(e.target.value) as 7 | 14; setCycleDays(v); setStops((s) => s.filter((x) => x.dayOfCycle <= v)) }}>
                <option value={7}>Weekly (7 days)</option>
                <option value={14}>Every 2 weeks (14 days)</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-from">Starts on</Label>
              <Input id="p-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {days.map((day) => {
              const mine = stops.map((s, i) => ({ s, i })).filter((x) => x.s.dayOfCycle === day)
              return (
                <div key={day} className="grid content-start gap-2 rounded-lg border p-3">
                  <div className="text-sm font-medium">Day {day}</div>
                  {mine.length === 0 && <p className="text-xs text-muted-foreground">Rest day</p>}
                  {mine.map(({ s, i }) => (
                    <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm">
                      <span className="flex-1 truncate">{name(s.customerId)}</span>
                      <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="p-1 text-muted-foreground hover:text-foreground"><ArrowUp className="size-3.5" /></button>
                      <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="p-1 text-muted-foreground hover:text-foreground"><ArrowDown className="size-3.5" /></button>
                      <button type="button" aria-label={`Remove ${name(s.customerId)}`} onClick={() => setStops((all) => all.filter((_, k) => k !== i))} className="p-1 text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
                    </div>
                  ))}
                  <Select
                    aria-label={`Add customer to day ${day}`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setStops((all) => [...all, { dayOfCycle: day, customerId: e.target.value }])
                    }}
                  >
                    <option value="">Add customer...</option>
                    {data.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.verified ? '' : ' (pin not verified)'}</option>)}
                  </Select>
                </div>
              )
            })}
          </div>

          {save.error && <p role="alert" className="text-sm text-destructive">{errMsg(save.error)}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !employeeId || stops.length === 0}>Submit for approval</Button>
            <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
