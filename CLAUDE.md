# Fuel Allowance

Digital replacement for the paper gasoline allowance of Hanuman Estate sales reps (Cambodia). Positions: NSM, RSM, OM, ASM, SR, plus HR, FIN and ADMIN back-office roles.

## How it works
- An approved journey plan sets the planned km per day. Reps check in with GPS at each customer. Driven km is Haversine x 1.3 road factor (`src/lib/engine.ts`).
- Within the plan counts automatically, up to a 15% tolerance counts automatically, anything above needs RSM approval (extra km request).
- Allowances are effective-dated. An approved request ends the current allowance the day before and starts the new one. A "replacement of" request clones the previous holder's allowance.
- Month end: statements = approved km x the rate in force each day + vehicle allowance. Rep confirms, RSM signs off, FIN marks paid. Payroll CSV export.
- The approval chain per position and the 15% tolerance are suggestions waiting for HR and Sales sign-off. Do not present them as final policy.

## Stack
TanStack Start (React, Router, Query), Prisma 7 with SQLite (`@prisma/adapter-better-sqlite3`), Tailwind 4 with hand-written shadcn-style components in `src/components/ui`, Leaflet maps, Vitest and Playwright.

## Layout
- `prisma/schema.prisma`: data model. `prisma/seed.ts` loads demo data and WIPES the database (never in production). `prisma/bootstrap.ts` creates the first admin safely.
- `src/lib/engine.ts`: pure allowance rules, unit tested. `src/lib/i18n.ts`: English and Khmer strings (Khmer needs native review).
- `src/server/*.ts`: server functions (`api.ts` main, `plans.ts`, `master.ts`, `team.ts`, `auth.ts`, `lang.ts`). Auth is a signed cookie with scrypt passwords.
- `src/routes/`: file-based routes; `_app/` holds the signed-in screens. `public/sw.js` and the manifest make it installable and offline-capable for check-ins.
- `e2e/`: Playwright flows against a production build (they reseed the DB).

## Deploying
See `DEPLOY.md`: Docker Compose with Caddy for HTTPS (phones need HTTPS for GPS). SQLite lives in the `fuel-data` volume; keep a single app instance. Production needs `SESSION_SECRET`.

## Known limits
Road distance is an estimate, no fake-GPS detection, money stored as floats, no employee edit or deactivate screen yet, back-office screens are English only.
