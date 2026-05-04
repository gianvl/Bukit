# Bukit

A Grab-style booking marketplace for vetted home cleaners in Metro Manila. Real-time provider matching, online or on-demand bookings, PayMongo escrow, in-app chat, and provider earnings — all from your phone number.

**Live demo:** [bukit-web.vercel.app](https://bukit-web.vercel.app)

> Use a real PH mobile number for the OTP — sign-in is phone-only via PhilSMS. Payments run on PayMongo's test mode (use card `4343 4343 4343 4345`, any future expiry, any CVV).

---

## What's inside

- **Customers** book a cleaning by tier (Studio → 3BR+), pin their address on the map, pay online (GCash / Maya / card via PayMongo Checkout), and watch the provider's live ETA on a map.
- **Providers** apply with a short bio, link a payout method (GCash or bank), and accept jobs from a 35 km radius around their current location. Earnings sit in escrow for 24 h, then become eligible for a weekly payout.
- **Both** sides chat for the duration of the job and for 3 hours after completion. Customers rate the provider 1–5 stars; the average shows on every booking detail page.

## Tech

| Layer | Stack |
|---|---|
| Frontend | Vite · React 19 · TypeScript · TanStack Router · TanStack Query · Tailwind v4 · shadcn/ui · framer-motion · Leaflet |
| Backend | Fastify 5 · TypeScript · Zod · Prisma 6 · Better-Auth (phone OTP) · Socket.IO 4 |
| Database | PostgreSQL 16 |
| Payments | PayMongo Checkout (internal escrow) |
| SMS | PhilSMS |
| Geocoding | Nominatim (OpenStreetMap) |
| Hosting | Vercel (web) · Railway (api + Postgres) |

Monorepo via `pnpm` workspaces. 93 vitest specs covering payout math, distance/cancellation policies, chat windows, phone normalization, and PayMongo signature verification.

## Local setup

```bash
git clone <this repo>
cd bukit
pnpm install

# Spin up Postgres
docker compose up -d        # uses ./docker-compose.yml

# Configure env (copy + fill in PayMongo + PhilSMS keys)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Apply schema + seed the four service tiers
pnpm --filter @bukit/api db:migrate
pnpm --filter @bukit/api db:seed

# Run both apps in parallel
pnpm dev                    # api on :3001, web on :5173
```

## Project layout

```
apps/
  api/      Fastify + Prisma + Socket.IO
  web/      Vite SPA
```

Key files:

- `apps/api/prisma/schema.prisma` — full domain model (User, Booking, Payment, Payout, Review, Message, ProviderProfile, ProviderPayoutMethod)
- `apps/api/src/lib/payouts.ts` — split math + 24 h cooldown + ₱500 minimum
- `apps/api/src/lib/distance.ts` — haversine + 35 km on-demand radius
- `apps/api/src/lib/socket-server.ts` — typed Socket.IO server with cookie-auth handshake
- `apps/web/src/components/page-shell.tsx` — editorial design primitives (cream wash, display serif, italic accents)
- `apps/web/src/components/location-picker.tsx` — Grab-style map + search + GPS picker

## Deployment

- **Frontend** → Vercel, root `apps/web`, env `VITE_API_URL=<railway-url>`.
- **Backend** → Railway, Dockerfile build at `apps/api/Dockerfile`, env per `apps/api/.env.example`. The container runs `prisma migrate deploy` on every cold start.
- **Database** → Railway Postgres add-on. Reference via `${{Postgres.DATABASE_URL}}`.

For cross-site cookies between Vercel ↔ Railway, the API sets `SameSite=None; Secure; Partitioned` in production (`apps/api/src/lib/auth.ts`).

## Tests

```bash
pnpm test                   # both packages
pnpm --filter @bukit/api test
pnpm --filter @bukit/web test
```

## License

Private — not for redistribution.
