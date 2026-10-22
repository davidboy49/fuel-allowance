import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { customerListFn, saveCustomerFn, verifyCustomerFn } from '#/server/master'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { errMsg } from '#/lib/format'

export const Route = createFileRoute('/_app/customers')({ component: Customers })

function Customers() {
  const { user } = Route.useRouteContext()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['customers'], queryFn: () => customerListFn() })
  const refresh = () => qc.invalidateQueries({ queryKey: ['customers'] })
  const verify = useMutation({ mutationFn: (id: string) => verifyCustomerFn({ data: { id } }), onSuccess: refresh })
  const canEdit = ['RSM', 'HR', 'ADMIN', 'NSM'].includes(user.role)
  const canVerify = ['RSM', 'NSM', 'ADMIN'].includes(user.role)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('150')
  const save = useMutation({
    mutationFn: () => saveCustomerFn({ data: { code, name, lat: Number(lat), lng: Number(lng), geofenceM: Number(radius) } }),
    onSuccess: () => {
      setCode(''); setName(''); setLat(''); setLng('')
      refresh()
    },
  })

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Customers and GPS pins</h1>
        <p className="text-sm text-muted-foreground">
          Check-ins only count inside a customer's radius. A new or moved pin must be verified by the RSM before reps rely on it.
        </p>
      </div>

      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add a customer</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-6 sm:items-end" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
              <div className="grid gap-1.5"><Label htmlFor="c-code">Code</Label><Input id="c-code" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="grid gap-1.5"><Label htmlFor="c-lat">Latitude</Label><Input id="c-lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} required /></div>
              <div className="grid gap-1.5"><Label htmlFor="c-lng">Longitude</Label><Input id="c-lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} required /></div>
              <div className="grid gap-1.5"><Label htmlFor="c-r">Radius (m)</Label><Input id="c-r" type="number" min="30" max="1000" value={radius} onChange={(e) => setRadius(e.target.value)} required /></div>
              <div className="sm:col-span-6"><Button type="submit" disabled={save.isPending}>Add customer</Button></div>
            </form>
            {save.error && <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(save.error)}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <Table>
            <Thead><Tr><Th>Code</Th><Th>Name</Th><Th>Latitude</Th><Th>Longitude</Th><Th>Radius</Th><Th>Pin</Th><Th /></Tr></Thead>
            <Tbody>
              {list.data?.map((c) => (
                <Tr key={c.id}>
                  <Td>{c.code}</Td>
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.lat?.toFixed(5) ?? '-'}</Td>
                  <Td>{c.lng?.toFixed(5) ?? '-'}</Td>
                  <Td>{c.geofenceM} m</Td>
                  <Td><Badge tone={c.verified ? 'good' : 'wait'}>{c.verified ? 'Verified' : 'Not verified'}</Badge></Td>
                  <Td>{canVerify && !c.verified && <Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate(c.id)}><BadgeCheck /> Verify</Button>}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {verify.error && <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(verify.error)}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
