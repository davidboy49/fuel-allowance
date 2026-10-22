# Fuel Allowance

Digital fuel allowance for sales reps: RSM-approved journey plans set a baseline distance, reps check in by GPS at each customer, the server calculates the day's km and splits it into within plan, within tolerance (auto-approved) and extra km (RSM approves, like overtime). Allowance changes go through one request form and replace the current allowance from an effective date.

Design and policy: see the proposal and build plan shared with the project.

## Stack

TanStack Start (Router, Query, Form, Table), Prisma 7 with SQLite, Tailwind 4 with shadcn-style components, Vitest, Playwright.

## Run

```bash
npm install
cp .env.example .env.local
npm run db:push     # create the SQLite database
npm run db:seed     # demo data, every password is demo1234
npm run dev
```

Demo logins: `sr001@demo.local` (rep), `rsm01@demo.local`, `nsm01@demo.local`, `hr01@demo.local`, `fin01@demo.local`, `adm01@demo.local`.

## Tests

```bash
npm test                 # allowance engine unit tests
npm run build && npm start   # then, in another shell, with a freshly seeded DB:
npm run test:e2e         # set CHROMIUM_PATH if Playwright cannot find its browser
```

## How it is organised

| Path | What |
| --- | --- |
| `src/lib/engine.ts` | Pure allowance rules: tolerance bands, rate by date, statements, geofence and check-in flags |
| `src/lib/constants.ts` | Roles, action types, approval chain per position (to be confirmed with HR) |
| `src/server/api.ts` | Server functions: requests and approvals, check-ins, extra km, statements |
| `src/server/auth.ts` | Password hashing, signed session cookie, role checks, audit log |
| `prisma/schema.prisma` | Data model with effective-dated allowance profiles |
| `src/routes/_app/` | Screens per role |

## Known limits of this first version

- Road distance is an estimate (straight line x 1.3) until OSRM or Google routing is connected (`RoadDistanceProvider` in `engine.ts`).
- A browser app cannot detect fake-GPS apps; check-ins are flagged for geofence, accuracy and clock skew, and RSMs spot check.
- Offline check-ins queue in localStorage; there is no service worker or install prompt yet.
- Journey plans are seeded; the plan editor and RSM plan approval screen are not built yet.
- Amounts are stored as floats in USD; switch to integer cents or Decimal before payroll integration.
- Approval chain per position and the 15% tolerance are suggestions, not signed-off policy.
