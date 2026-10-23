import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addRateFn, ratesFn } from '#/server/api'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input, Label, Select } from '#/components/ui/input'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'
import { errMsg, todayStr } from '#/lib/format'

export const Route = createFileRoute('/_app/rates')({ component: Rates })

function Rates() {
  const { user } = Route.useRouteContext()
  const qc = useQueryClient()
  const rates = useQuery({ queryKey: ['rates'], queryFn: () => ratesFn() })
  const [vehicleClass, setVehicleClass] = useState<'MOTOR' | 'CAR'>('MOTOR')
  const [fuelPrice, setFuelPrice] = useState('')
  const [kmPerLitre, setKmPerLitre] = useState('')
  const [validFrom, setValidFrom] = useState(todayStr())
  const add = useMutation({
    mutationFn: () => addRateFn({ data: { vehicleClass, fuelPrice: Number(fuelPrice), kmPerLitre: Number(kmPerLitre), validFrom } }),
    onSuccess: () => {
      setFuelPrice('')
      qc.invalidateQueries({ queryKey: ['rates'] })
    },
  })
  const canEdit = ['FIN', 'ADMIN'].includes(user.role)
  const preview = Number(fuelPrice) > 0 && Number(kmPerLitre) > 0 ? (Number(fuelPrice) / Number(kmPerLitre)).toFixed(2) : null

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Fuel price and rate per km</h1>
        <p className="text-sm text-muted-foreground">Petrol allowance uses the rate in force on each day, so a price change splits the month automatically.</p>
      </div>
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add a rate</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
              <div className="grid gap-1.5">
                <Label htmlFor="r-v">Vehicle</Label>
                <Select id="r-v" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as 'MOTOR' | 'CAR')}>
                  <option value="MOTOR">Motorbike</option>
                  <option value="CAR">Car</option>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-p">Fuel price per litre</Label>
                <Input id="r-p" type="number" step="0.01" min="0" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-k">Km per litre</Label>
                <Input id="r-k" type="number" step="0.1" min="0" value={kmPerLitre} onChange={(e) => setKmPerLitre(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-d">Effective from</Label>
                <Input id="r-d" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
              </div>
              <Button type="submit" disabled={add.isPending}>Add rate{preview ? ` ($${preview}/km)` : ''}</Button>
            </form>
            {add.error && <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(add.error)}</p>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-5">
          <Table>
            <Thead><Tr><Th>Vehicle</Th><Th>From</Th><Th>Fuel price</Th><Th>Km per litre</Th><Th>Rate per km</Th></Tr></Thead>
            <Tbody>
              {rates.data?.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.vehicleClass === 'MOTOR' ? 'Motorbike' : 'Car'}</Td>
                  <Td>{r.validFrom}</Td>
                  <Td>${r.fuelPrice.toFixed(2)}</Td>
                  <Td>{r.kmPerLitre}</Td>
                  <Td className="font-semibold">${r.ratePerKm.toFixed(2)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
