// Creates the first administrator on an empty production database. Safe to run again: it never deletes anything.
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { hashPassword } from '../src/server/auth.js'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
if (!email || !password || password.length < 10) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters).')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' }) })

const existing = await prisma.employee.findUnique({ where: { email } })
if (existing) {
  console.log(`${email} already exists. Nothing changed.`)
} else {
  await prisma.employee.create({
    data: { code: 'ADM01', name: process.env.ADMIN_NAME || 'Administrator', email, passwordHash: hashPassword(password), position: 'ADMIN', role: 'ADMIN' },
  })
  console.log(`Created administrator ${email}. Sign in, then add employees, rates and customers.`)
}
await prisma.$disconnect()
