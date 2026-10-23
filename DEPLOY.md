# Hosting on your own server

You need a Linux server with Docker (and the compose plugin), a domain name pointing at the server, and ports 80 and 443 open. HTTPS is required: phones only share GPS location over HTTPS, and the login cookie is marked secure in production.

## First install

```sh
git clone https://github.com/davidboy49/fuel-allowance.git /opt/fuel-allowance
cd /opt/fuel-allowance
cat > .env <<ENV
DOMAIN=fuel.example.com
SESSION_SECRET=$(openssl rand -hex 32)
ENV
docker compose up -d --build
```

Caddy gets the HTTPS certificate by itself. Then create the first administrator (this never touches existing data):

```sh
docker compose exec -e ADMIN_EMAIL=you@company.com -e ADMIN_PASSWORD='a long password' app npm run bootstrap
```

Sign in at `https://fuel.example.com`, then add employees, rates and customers from the menu. Do not run `db:seed` in production: it wipes the database and loads demo users.

## Update

```sh
cd /opt/fuel-allowance && git pull && docker compose up -d --build
```

The database lives in the `fuel-data` Docker volume, so it survives updates. Schema changes are applied at startup.

## Backup

Run `deploy/backup.sh` daily from cron. It keeps 30 days of copies in `/var/backups/fuel-allowance`. Copy them off the server too.

## Without Docker

Node 22 and a reverse proxy with HTTPS are enough: `npm ci`, `npx prisma generate`, `npm run build`, then run `npx prisma db push` and `node .output/server/index.mjs` with `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production` and `PORT` set.

## Things to know

- One server process with SQLite is fine for a sales team of hundreds. Keep a single app instance.
- Maps load tiles from openstreetmap.org, so reps' phones need internet. Fonts load from Google Fonts.
- Change the 15% tolerance, approval chain and rates only after HR and Sales sign off.
