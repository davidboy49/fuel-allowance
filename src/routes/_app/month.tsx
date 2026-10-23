import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { generateStatementsFn, payrollCsvFn, statementActionFn, statementsFn } from '#/server/api'
import { Badge, statusTone } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { errMsg, km, money, thisMonth } from '#/lib/format'
import { useStatus, useT } from '#/lib/useT'

export const Route = createFileRoute('/_app/month')({ component: Month })

function Month() {
  const t = useT()
  const statusLabel = useStatus()
  const { user } = Route.useRouteContext()
  const qc = useQueryClient()
  const [month, setMonth] = useState(thisMonth())
  const list = useQuery({ queryKey: ['statements', month], queryFn: () => statementsFn({ data: { month } }) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['statements'] })
  const gen = useMutation({ mutationFn: () => generateStatementsFn({ data: { month } }), onSuccess: refresh })
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'confirm' | 'dispute' | 'approve' | 'pay' }) => statementActionFn({ data: v }),
    onSuccess: refresh,
  })
  const exportCsv = useMutation({
    mutationFn: () => payrollCsvFn({ data: { month } }),
    onSuccess: (r) => {
      const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = r.filename
      a.click()
      URL.revokeObjectURL(url)
    },
  })
  const canGenerate = ['HR', 'FIN', 'ADMIN'].includes(user.role)
  const total = list.data?.reduce((s, r) => s + r.total, 0) ?? 0

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('month.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('month.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          {canGenerate && <Button variant="outline" disabled={gen.isPending} onClick={() => gen.mutate()}>{t('month.calculate')}</Button>}
          {canGenerate && <Button variant="outline" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>{t('month.export')}</Button>}
        </div>
      </div>
      {(gen.error || act.error || exportCsv.error) && <p role="alert" className="text-sm text-destructive">{errMsg(gen.error ?? act.error ?? exportCsv.error)}</p>}
      {exportCsv.data && <p role="status" className="text-sm text-muted-foreground">{exportCsv.data.rows === 0 ? 'Nothing to export yet: only statements signed off by the RSM are included.' : `Exported ${exportCsv.data.rows} statement${exportCsv.data.rows > 1 ? 's' : ''}.`}</p>}
      <Card>
        <CardContent className="pt-5">
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('month.none', { month })}</p>}
          {!!list.data?.length && (
            <Table>
              <Thead>
                <Tr><Th>{t('month.employee')}</Th><Th>{t('month.approvedKm')}</Th><Th>{t('month.vehicle')}</Th><Th>{t('month.petrol')}</Th><Th>{t('month.total')}</Th><Th>{t('month.status')}</Th><Th /></Tr>
              </Thead>
              <Tbody>
                {list.data.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{s.employee}<div className="text-xs font-normal text-muted-foreground">{s.code}</div></Td>
                    <Td>{km(s.approvedKm)}</Td>
                    <Td>{money(s.vehicleAllowance)}</Td>
                    <Td>{money(s.petrolAmount)}</Td>
                    <Td className="font-semibold">{money(s.total)}</Td>
                    <Td><Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge></Td>
                    <Td>
                      <div className="flex gap-2">
                        {s.isMine && s.status === 'OPEN' && (
                          <>
                            <Button size="sm" onClick={() => act.mutate({ id: s.id, action: 'confirm' })}>{t('month.confirm')}</Button>
                            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: s.id, action: 'dispute' })}>{t('month.dispute')}</Button>
                          </>
                        )}
                        {user.role === 'RSM' && (s.status === 'REP_CONFIRMED' || s.status === 'DISPUTED') && (
                          <Button size="sm" onClick={() => act.mutate({ id: s.id, action: 'approve' })}>{t('month.signOff')}</Button>
                        )}
                        {user.role === 'FIN' && s.status === 'RSM_APPROVED' && (
                          <Button size="sm" onClick={() => act.mutate({ id: s.id, action: 'pay' })}>{t('month.markPaid')}</Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          {!!list.data?.length && user.role !== 'SR' && (
            <p className="mt-3 text-right text-sm text-muted-foreground">{t('month.totalFor', { month })} <span className="font-semibold text-foreground">{money(total)}</span></p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
