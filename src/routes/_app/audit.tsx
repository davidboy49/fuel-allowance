import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { auditFn } from '#/server/api'
import { Card, CardContent } from '#/components/ui/card'
import { Table, Tbody, Td, Th, Thead, Tr } from '#/components/ui/table'

export const Route = createFileRoute('/_app/audit')({ component: Audit })

function Audit() {
  const log = useQuery({ queryKey: ['audit'], queryFn: () => auditFn() })
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every submission, decision and rate change, newest first.</p>
      </div>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <Thead><Tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Action</Th></Tr></Thead>
            <Tbody>
              {log.data?.map((r) => (
                <Tr key={r.id}>
                  <Td>{new Date(r.at).toLocaleString()}</Td>
                  <Td>{r.actor}</Td>
                  <Td>{r.entity}</Td>
                  <Td>{r.action}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
