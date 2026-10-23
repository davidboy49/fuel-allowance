import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { hashPassword } from '../src/server/auth.js'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' })
const prisma = new PrismaClient({ adapter })

const PASSWORD = 'demo1234'

async function main() {
  console.log('Seeding demo data (all passwords: demo1234)')
  for (const t of [
    'auditLog', 'approval', 'distanceException', 'dailyDistance', 'checkin', 'planStop', 'journeyPlan',
    'monthlyStatement', 'allowanceProfile', 'allowanceRequest', 'rate', 'customer', 'startPoint', 'territory', 'employee',
  ] as const) {
    await (prisma[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany()
  }

  const pw = hashPassword(PASSWORD)
  const mk = (code: string, name: string, position: string, managerId?: string) =>
    prisma.employee.create({
      data: { code, name, email: `${code.toLowerCase()}@demo.local`, passwordHash: pw, position, role: position, managerId },
    })

  const admin = await mk('ADM01', 'Admin User', 'ADMIN')
  await mk('HR01', 'Sophea (HR)', 'HR')
  await mk('FIN01', 'Dara (Finance)', 'FIN')
  const nsm = await mk('NSM01', 'Vannak (NSM)', 'NSM')
  const rsm = await mk('RSM01', 'Chantha (RSM)', 'RSM', nsm.id)
  const asm = await mk('ASM01', 'Rithy (ASM)', 'ASM', rsm.id)
  const sr1 = await mk('SR001', 'Sokha (SR)', 'SR', asm.id)
  const sr2 = await mk('SR002', 'Bopha (SR)', 'SR', asm.id)

  const hq = await prisma.startPoint.create({ data: { name: 'Phnom Penh depot', lat: 11.5564, lng: 104.9282 } })
  const north = await prisma.territory.create({ data: { name: 'Phnom Penh North' } })
  const south = await prisma.territory.create({ data: { name: 'Phnom Penh South' } })

  await prisma.rate.createMany({
    data: [
      { vehicleClass: 'MOTOR', fuelPrice: 1.1, kmPerLitre: 35, ratePerKm: 0.03, validFrom: new Date('2026-01-01') },
      { vehicleClass: 'CAR', fuelPrice: 1.1, kmPerLitre: 10, ratePerKm: 0.11, validFrom: new Date('2026-01-01') },
    ],
  })

  const customers = [
    ['C001', 'Sunrise Mart', 11.5801, 104.9101],
    ['C002', 'Angkor Hardware', 11.5935, 104.9023],
    ['C003', 'Riverside Home', 11.5632, 104.9319],
    ['C004', 'Bayon Supplies', 11.5478, 104.9224],
    ['C005', 'Kampuchea Build', 11.5367, 104.9156],
  ] as const
  const cs = []
  for (const [code, name, lat, lng] of customers) {
    cs.push(await prisma.customer.create({ data: { code, name, lat, lng, verifiedAt: new Date(), verifiedBy: rsm.id } }))
  }

  const profile = (employeeId: string, territoryId: string, vehicleClass: string, vehicleAllowance: number, baseline: number) =>
    prisma.allowanceProfile.create({
      data: {
        employeeId, territoryId, startPointId: hq.id, vehicleClass, vehicleAllowance,
        baselineKmMonth: baseline, tolerancePct: 15, validFrom: new Date('2026-01-01'),
      },
    })
  await profile(sr1.id, north.id, 'MOTOR', 30, 900)
  await profile(sr2.id, south.id, 'MOTOR', 30, 800)
  await profile(asm.id, north.id, 'MOTOR', 40, 700)
  await profile(rsm.id, north.id, 'CAR', 120, 1200)

  const plan = await prisma.journeyPlan.create({
    data: { employeeId: sr1.id, version: 1, cycleDays: 7, status: 'APPROVED', validFrom: new Date('2026-10-01') },
  })
  let seq = 0
  for (let day = 1; day <= 5; day++) {
    for (const c of cs.slice(0, 3)) {
      await prisma.planStop.create({
        data: { planId: plan.id, dayOfCycle: day, sequence: ++seq, customerId: c.id, plannedLegKm: 4 },
      })
    }
  }
  console.log(`Done. Admin: ${admin.email}`)
}

main()
  .catch((e) => {
    console.error('Seed failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
