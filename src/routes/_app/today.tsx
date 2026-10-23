import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, Flag, MapPin, Play, Square } from 'lucide-react'
import { MapView, type MapMarker } from '#/components/MapView'
import { checkinFn, requestExtraKmFn, todayFn } from '#/server/api'
import { REASON_CODES } from '#/lib/constants'
import { Button } from '#/components/ui/button'
import { Badge, statusTone } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label, Select } from '#/components/ui/input'
import { errMsg, km } from '#/lib/format'
import { useStatus, useT } from '#/lib/useT'
import type { MessageKey } from '#/lib/i18n'
import { enqueue, flushQueue, isNetworkError, newId, readQueue, type QueuedCheckin } from '#/lib/checkin-queue'

export const Route = createFileRoute('/_app/today')({ component: Today })

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This phone has no location support'))
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? 'Location permission is off. Turn it on to check in.' : 'Could not get your location. Try again outside.')), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

function Today() {
  const t = useT()
  const statusLabel = useStatus()
  const qc = useQueryClient()
  const today = useQuery({ queryKey: ['today'], queryFn: () => todayFn() })
  const [waiting, setWaiting] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const send = useCallback((c: QueuedCheckin) => checkinFn({ data: c }), [])
  const sync = useCallback(async () => {
    const n = await flushQueue(send)
    setWaiting(readQueue().length)
    if (n > 0) qc.invalidateQueries({ queryKey: ['today'] })
  }, [send, qc])

  useEffect(() => {
    setWaiting(readQueue().length)
    void sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])

  const checkin = useMutation({
    mutationFn: async (input: { type: 'START' | 'VISIT' | 'END'; customerId?: string }) => {
      const pos = await getPosition()
      const c: QueuedCheckin = {
        id: newId(),
        type: input.type,
        customerId: input.customerId ?? null,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        gpsTime: new Date(pos.timestamp).toISOString(),
      }
      try {
        return await send(c)
      } catch (e) {
        if (!isNetworkError(e)) throw e
        enqueue(c)
        setWaiting(readQueue().length)
        setNotice(t('today.offlineSaved'))
        return null
      }
    },
    onSuccess: (res) => {
      if (res && 'flags' in res && res.flags?.length) setNotice('Saved. Your manager may check this one: ' + res.flags.join(', ').toLowerCase().replaceAll('_', ' '))
      else if (res) setNotice(null)
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  const d = today.data
  if (today.isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (!d) return <p role="alert" className="text-destructive">{errMsg(today.error)}</p>

  const visited = d.stops.filter((s) => s.visited).length
  const stopMarkers: MapMarker[] = d.stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, i) => ({ id: s.id, lat: s.lat!, lng: s.lng!, label: s.name, number: i + 1, tone: s.visited ? 'good' : 'primary' }))
  const radii = Object.fromEntries(d.stops.map((s) => [s.id, s.geofenceM]))
  const over = d.daily.excessKm > 0

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('today.title')}</h1>
        <p className="text-sm text-muted-foreground">{d.date}</p>
      </div>

      {waiting > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/20 px-3 py-2 text-sm" role="status">
          <CloudOff className="size-4" /> {t('today.waiting', { n: waiting })}
          <Button size="sm" variant="outline" className="ml-auto" onClick={sync}>{t('today.sendNow')}</Button>
        </div>
      )}
      {notice && <p role="status" className="rounded-lg bg-accent px-3 py-2 text-sm">{notice}</p>}
      {checkin.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errMsg(checkin.error)}</p>}

      <Card>
        <CardContent className="grid grid-cols-3 gap-3 pt-5 text-center">
          <Stat label={t('today.planned')} value={km(d.daily.plannedKm)} />
          <Stat label={t('today.driven')} value={km(d.daily.actualKm)} />
          <Stat label={t('today.visits')} value={`${visited}/${d.stops.length}`} />
        </CardContent>
      </Card>

      {!d.started ? (
        <Button size="lg" className="h-14 text-base" disabled={checkin.isPending} onClick={() => checkin.mutate({ type: 'START' })}>
          <Play /> {t('today.start')}
        </Button>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>{t('today.customers')}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {d.stops.length === 0 && <p className="text-sm text-muted-foreground">{t('today.noPlan')}</p>}
              {d.stops.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="flex items-center gap-2 font-medium">
                    {s.visited ? <CheckCircle2 className="size-5 text-success" /> : <MapPin className="size-5 text-muted-foreground" />}
                    {s.name}
                  </span>
                  {s.visited ? (
                    <Badge tone="good">{t('today.visited')}</Badge>
                  ) : (
                    <Button size="lg" disabled={checkin.isPending || d.ended} onClick={() => checkin.mutate({ type: 'VISIT', customerId: s.id })}>
                      {t('today.checkIn')}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {!d.ended && (
            <Button size="lg" variant="outline" className="h-14 text-base" disabled={checkin.isPending} onClick={() => checkin.mutate({ type: 'END' })}>
              <Square /> {t('today.endDay')}
            </Button>
          )}
        </>
      )}

      {stopMarkers.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('today.map')}</CardTitle></CardHeader>
          <CardContent>
            <MapView label={t('today.customers')} markers={stopMarkers} radiusM={radii} height={220} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('today.counts')}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Row label={t('today.within')} value={km(d.daily.withinKm)} />
          <Row label={t('today.tolerance')} value={km(d.daily.toleranceKm)} />
          <Row label={t('today.above')} value={km(d.daily.excessKm)} tone={over ? 'wait' : undefined} />
        </CardContent>
      </Card>

      {over && d.exceptions.length === 0 && <ExtraKm dailyId={d.daily.id} maxKm={d.daily.excessKm} />}
      {d.exceptions.map((x) => (
        <div key={x.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
          <span>{t('today.extraRequest', { km: km(x.requestedKm) })}{x.approvedKm != null ? t('today.extraApproved', { km: km(x.approvedKm) }) : ''}</span>
          <Badge tone={statusTone(x.status)}>{statusLabel(x.status)}</Badge>
        </div>
      ))}

      {d.checkins.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('today.checkins')}</CardTitle></CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {d.checkins.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <span>{new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {c.type === 'VISIT' ? c.customer : c.type === 'START' ? 'Start' : 'End'}</span>
                {c.flags.length > 0 && <Badge tone="wait"><Flag className="mr-1 size-3" />{c.flags[0].toLowerCase().replaceAll('_', ' ')}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'wait' }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone ? 'font-semibold' : ''}>{value}</span>
    </div>
  )
}

function ExtraKm({ dailyId, maxKm }: { dailyId: string; maxKm: number }) {
  const t = useT()
  const qc = useQueryClient()
  const [requested, setRequested] = useState(String(maxKm))
  const [reason, setReason] = useState<(typeof REASON_CODES)[number]>('EXTRA_CUSTOMER')
  const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: () => requestExtraKmFn({ data: { dailyId, requestedKm: Number(requested), reasonCode: reason, note: note || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  })
  return (
    <Card>
      <CardHeader><CardTitle>{t('today.extraTitle')}</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
          <div className="grid gap-1.5">
            <Label htmlFor="req-km">{t('today.extraKm', { max: km(maxKm) })}</Label>
            <Input id="req-km" type="number" inputMode="decimal" step="any" min="0.1" max={maxKm} value={requested} onChange={(e) => setRequested(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="req-reason">{t('today.reason')}</Label>
            <Select id="req-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASON_CODES.map((r) => <option key={r} value={r}>{t(`reason.${r}` as MessageKey)}</option>)}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="req-note">{t('today.note')}</Label>
            <Input id="req-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('today.notePlaceholder')} />
          </div>
          {m.error && <p role="alert" className="text-sm text-destructive">{errMsg(m.error)}</p>}
          <Button type="submit" disabled={m.isPending}>{t('today.sendRsm')}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
