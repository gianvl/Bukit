# Bukit — Engineering Handoff

This document hands the Bukit codebase from the original developer (Gian) to a new team. It covers what Bukit is, what's live, what's still pending, where the bodies are buried, and the operational tasks the new team will own.

For day-to-day reference (setup, scripts, file pointers) read [`README.md`](./README.md) first — this doc is the gap-filler.

---

## 1. Quick state

- **Production demo:** [bukit-web.vercel.app](https://bukit-web.vercel.app)
- **Stage of life:** working MVP demo. Real payments via PayMongo test mode, real OTP via PhilSMS, real Vercel Blob storage. **Not ready for paying customers** — see [§9 Open work](#9-open-work--known-gaps).
- **Hosts:**
  - Frontend: **Vercel** (project `bukit-web`)
  - Backend + Postgres: **Railway** (project `bountiful-forgiveness`, region `Singapore`)
  - File uploads: **Vercel Blob** (private store, region `Singapore`)
- **CI:** GitHub Actions on every PR to `main` runs lint + typecheck + tests. See [§6.1](#61-ci).
- **Sole admin (Gian):** has the only `role = 'ADMIN'` row in production. New team needs at least one promoted before launch — see [§8 Ops runbook](#8-operations-runbook).

---

## 2. What Bukit does

Two-sided marketplace for vetted home services in Metro Manila — cleaning, laundry, repairs, etc. Customers book a service tier, pay online or by cash, get matched to a provider in real time, chat through the job, rate when done. Providers accept jobs, get earnings into their GCash/bank, get reviewed.

Service catalog and KYC are **admin-managed** — there's a built-in admin console at `/admin/*`.

### Roles

| Role | What they do |
|---|---|
| `USER` (customer) | Browses services, books, pays, rates |
| `PROVIDER` | Same `User` row with role flipped + a `ProviderProfile`. Accepts jobs, gets paid out. |
| `ADMIN` | Manages the service catalog and approves KYC submissions. |

A user can hold both customer and provider hats (they upgrade via `/provider`).

---

## 3. Architecture

```
┌──────────────────────────┐        ┌────────────────────────┐
│   Vercel (apps/web)      │        │  Railway (apps/api)    │
│   bukit-web.vercel.app   │        │  bukit-production-     │
│                          │        │  2a44.up.railway.app   │
│   - Vite + React 19      │        │                        │
│   - TanStack Router      │  ─────▶│  - Fastify 5           │
│   - TanStack Query       │  /api/*│  - Prisma 6 + Postgres │
│   - Tailwind v4          │  rewrite  - Better-Auth (phone OTP)
│   - shadcn/ui            │  to     │  - Socket.IO 4         │
│   - framer-motion        │ Railway │  - PayMongo Checkout   │
│   - Leaflet (maps)       │        │  - PhilSMS (OTP)       │
│                          │ ───── ▶ │  - Vercel Blob (KYC)   │
│   Direct WebSocket  ─────┼─Socket.IO│                        │
└──────────────────────────┘        └────────┬───────────────┘
                                             │
                                    ┌────────▼───────────────┐
                                    │  Railway Postgres 16   │
                                    └────────────────────────┘
```

### Why this split

Vercel rewrites are how the app sidesteps mobile-Safari third-party cookie blocking. The browser only sees `bukit-web.vercel.app` — `/api/*` is rewritten to Railway server-side, so the auth cookie is first-party. **Socket.IO bypasses the rewrite** (rewrites don't proxy WebSockets reliably) and connects direct to Railway via `VITE_SOCKET_URL`.

### Monorepo

```
bukit/
  apps/
    api/         Fastify backend
    web/         Vite SPA
  README.md
  HANDOFF.md   ← you are here
```

pnpm workspaces, Node ≥ 20. Single lockfile at root.

---

## 4. Domain model (key entities)

Full schema: [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma).

```
User ─┬─ ProviderProfile ──── ProviderPayoutMethod (1:1)
      │       └── Payout[] (per booking, signed netCentavos)
      │       └── Booking[] (as provider)
      │
      ├── Booking[] (as customer)
      │     ├── ServiceTier ── Service (parent)
      │     ├── Payment (PayMongo refs)
      │     ├── Payout (provider payout)
      │     ├── Review (1:1, customer rates)
      │     ├── BookingEvent[] (audit log)
      │     └── Message[] (chat thread)
      │
      └── KycSubmission (1:1, gov ID + selfie URLs)
```

### Money

All amounts stored as **integer centavos** (PHP × 100). Never use floats. `formatCentavos()` in `apps/web/src/lib/format.ts` is the single conversion point for display.

### IDs

cuid2 via `@default(cuid(2))`. Don't use auto-increment integers.

---

## 5. Critical flows

### 5.1 Booking lifecycle

States: `PENDING_PAYMENT → IN_ESCROW → PROVIDER_ASSIGNED → EN_ROUTE → IN_PROGRESS → PENDING_CASH_CONFIRM (cash only) → COMPLETED`

Plus `CANCELLED_BY_USER`, `CANCELLED_BY_PROVIDER`, `REFUNDED`.

| Step | Code path |
|---|---|
| Customer books | `POST /bookings` in `apps/api/src/routes/bookings.ts` — KYC gate, address pin, create row |
| Online payment | PayMongo Checkout → webhook flips status to `IN_ESCROW` (`apps/api/src/routes/webhooks.ts`) |
| Cash booking | Skips checkout, status starts `CONFIRMED` |
| Provider accepts | `POST /bookings/:id/accept` — race-safe `updateMany` + transaction, gates on KYC + payout method |
| Provider transitions | `/start`, `/customer-complete`, `/confirm-cash` (cash only) |
| Payout created | On `COMPLETED`: `Payout(PENDING)` row, `eligibleAt = now + 24h` cooldown |
| Customer rates | `POST /bookings/:id/review` — 1-time, recomputes `ProviderProfile.ratingAvg/Count` in same tx |

### 5.2 Provider matching

- **SCHEDULED** bookings: any active provider in `SCHEDULED_ONLY` or `FULL` mode (no city scoping — Metro Manila is one service area).
- **ON_DEMAND** bookings: requires the provider to have shared a recent location AND be within `ON_DEMAND_RADIUS_KM = 35` (covers all of NCR).

Code: `apps/api/src/routes/providers.ts` and `apps/api/src/lib/distance.ts`.

### 5.3 Real-time

Socket.IO mounted on Fastify's HTTP server with cookie auth handshake. Three room types:

| Room | Joined by | Used for |
|---|---|---|
| `booking:{id}` | Both parties on detail page | Status changes, chat, provider GPS pings |
| `provider:{userId}` | Provider on connect | Per-provider events without joining each booking |
| `area:metro-manila` | All providers on connect | New unassigned bookings + booking-taken events |

Code: `apps/api/src/lib/socket-server.ts`. Events typed as `ServerToClientEvents` / `ClientToServerEvents`.

### 5.4 Payments + payouts (the trickiest part)

- **Payment**: PayMongo Checkout Sessions. Webhook signature verified at `apps/api/src/routes/webhooks.ts` using HMAC-SHA256 over `${ts}.${rawBody}`. The webhook flips `Booking.status` to `IN_ESCROW` and creates the `Payment` row.
- **Take rate**: `ProviderProfile.takeRateBps` (default 500 = 5%). Snapshot per payout in `feeCentavos`.
- **Payout shape**: per-booking `Payout` rows with **signed `netCentavos`**:
  - Online completion → `+gross - fee`, eligible after 24h cooldown.
  - Cash completion → `-fee` (we owe ourselves); deducts from next online payout. Eligible immediately.
- **Disbursement is manual today**: `POST /me/payouts/request` only logs the request. Admin reads the list, sends GCash/bank manually, marks `Payout.status = PAID` with a reference. **TODO before launch:** wire PayMongo Disbursements API.

Math lives in `apps/api/src/lib/payouts.ts` — has unit tests in `payouts.test.ts`.

### 5.5 KYC (privacy-sensitive)

- Customers and providers must submit gov ID + selfie before they can book/accept.
- Files upload as multipart to `POST /kyc/upload?kind=gov-id|selfie` — server-side `put()` to a **private** Vercel Blob store with `access: 'private'`.
- Raw blob URLs are stored in DB but **never returned to clients**. Photos are served via auth-gated proxy `GET /kyc/photo/:submissionId/:kind`:
  - Owner can fetch their own.
  - Admin can fetch any.
  - Else 403.
- DTOs return `hasGovIdImage`/`hasSelfie` booleans (customer view) or `govIdProxyPath`/`selfieProxyPath` (admin view).
- `Cache-Control: private, no-store` on photo responses to keep them out of disk cache.

Code: `apps/api/src/routes/kyc.ts`. The proxy pattern is the only safe way given the SDK limitations — see [§10 Decision log](#10-decision-log).

### 5.6 Auth

- Phone OTP only (no email/password). Better-Auth `phoneNumber` plugin, OTP delivered via PhilSMS.
- Cross-site cookies for prod: `SameSite=None; Secure; Partitioned` (set conditionally on `NODE_ENV === 'production'` in `apps/api/src/lib/auth.ts`).
- Sessions stored in Postgres via Better-Auth's Prisma adapter.
- Mobile Safari cookie issues fixed by routing all HTTP through Vercel rewrites (first-party). Socket.IO connects direct (cookies still cross-site for the WS handshake but it works).

---

## 6. Local development

```bash
# 1. Clone + install
git clone <this repo>
cd bukit
pnpm install

# 2. Spin up Postgres
docker compose up -d

# 3. Configure env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Fill in PAYMONGO_SECRET_KEY, PHILSMS_API_KEY at minimum

# 4. Apply schema + seed cleaning tiers
pnpm --filter @bukit/api db:migrate
pnpm --filter @bukit/api db:seed

# 5. Run both apps
pnpm dev    # api on :3001, web on :5173
```

### Useful scripts

```bash
pnpm test                       # 93 vitest specs across both packages
pnpm lint                       # eslint api + web
pnpm typecheck                  # api typecheck (web typechecked via tsc -b)
pnpm format                     # prettier --write — reformat the whole tree
pnpm format:check               # check only (CI will not enforce — see §6.1)
pnpm --filter @bukit/api db:migrate     # prisma migrate dev (writes a new migration)
pnpm --filter @bukit/api db:deploy      # prisma migrate deploy (idempotent — for prod)
pnpm --filter @bukit/api db:studio      # browse local DB
DATABASE_URL='<railway-public-url>' pnpm --filter @bukit/api db:studio:prod  # browse prod DB
```

⚠️ **Be careful in prod Studio** — edits write live.

### 6.1 CI

GitHub Actions runs on every PR + push to main: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

Three jobs in one workflow:
1. **Lint** — `pnpm lint` runs eslint on both packages. Web has 9 pre-existing warnings (mostly React 19 strict-mode lints on patterns we use intentionally) but **0 errors**. CI fails on errors only.
2. **Typecheck** — `tsc --noEmit` on api, `tsc -b` on web (matches what Vercel runs). Both clean.
3. **Test** — `pnpm test` runs vitest across both packages (93 specs).

**Prettier is intentionally not enforced in CI.** A `.prettierrc.json` + `format`/`format:check` scripts are in place, but the codebase isn't yet reformatted. Running `pnpm format` will reformat everything in one big diff — ideally do that in a single dedicated commit so future `git blame` stays clean. Once done, the new team can add a `prettier --check` step to `ci.yml`.

### 6.2 Lint relaxations on web

Three React 19 hook rules are downgraded to warnings in [`apps/web/eslint.config.js`](./apps/web/eslint.config.js):
- `react-hooks/static-components` — flags Lucide icon factories (`iconFor()` returning a component)
- `react-hooks/set-state-in-effect` — used in pagination + provider geolocation
- `react-hooks/purity` + `react-hooks/immutability` — flag `Date.now()` and `window.location.href = …` patterns

These are mostly correct concerns but rewriting them all isn't worth the regression risk at handoff. Leave as warnings, address opportunistically.

---

## 7. Production setup

### Railway (api + Postgres)

- **Project:** `bountiful-forgiveness` (rename if you want — UI lets you).
- **Services:**
  - `Bukit` (the api): builds from `apps/api/Dockerfile`, healthcheck on `/health`.
  - `Postgres` (managed): plain Postgres add-on with the `${{Postgres.DATABASE_URL}}` reference variable.
- **Region:** Singapore for both (low PH latency).
- **Env vars** (api service → Variables):
  ```
  NODE_ENV                  = production
  DATABASE_URL              = ${{Postgres.DATABASE_URL}}    ← reference, not literal
  AUTH_SECRET               = <openssl rand -hex 32>
  COOKIE_SECRET             = <openssl rand -hex 32>  (different from AUTH_SECRET)
  API_PUBLIC_URL            = https://bukit-production-2a44.up.railway.app
  WEB_ORIGIN                = https://bukit-web.vercel.app  (comma-sep for multiple)
  PAYMONGO_SECRET_KEY       = sk_test_…  (or sk_live_… for real money)
  PAYMONGO_WEBHOOK_SECRET   = whsk_…  (from PayMongo dashboard webhook)
  PHILSMS_API_KEY           = …
  PHILSMS_SENDER_ID         = PhilSMS
  BLOB_READ_WRITE_TOKEN     = vercel_blob_rw_…  (from the Vercel Blob private store)
  ```
- **Build:** Dockerfile mode, path `apps/api/Dockerfile`, root directory `/`. Custom build/start commands left empty (the Dockerfile's CMD runs `prisma migrate deploy && node dist/server.js`).

### Vercel (web)

- **Project:** `bukit-web`.
- **Root directory:** `apps/web`.
- **Build command:** `pnpm --filter @bukit/web build` (Vite).
- **Env vars:**
  ```
  VITE_API_URL     = /api                                         (same-origin via rewrite)
  VITE_SOCKET_URL  = https://bukit-production-2a44.up.railway.app  (direct WS — rewrites don't carry WebSockets)
  ```
- **Rewrites** (in [`apps/web/vercel.json`](./apps/web/vercel.json)):
  ```json
  /api/auth/:path*  → https://<railway>/api/auth/:path*   (preserve Better-Auth path)
  /api/:path*       → https://<railway>/:path*            (strip /api/ for regular routes)
  /((?!api/|assets/).*) → /index.html                     (SPA fallback)
  ```

### Vercel Blob (KYC photos)

- Store name: `bukit-kyc`, region Singapore, **access = Private (Beta)**.
- Token (`BLOB_READ_WRITE_TOKEN`) is set on Railway, **not** Vercel — the API server reads/writes; the frontend never sees the token.
- Files live at `kyc/{userId}/{gov-id|selfie}/{filename}_<random>.jpg`.

### PayMongo

- Test mode for the demo. Switch to live mode by replacing `PAYMONGO_SECRET_KEY` with `sk_live_…` and updating the webhook URL on PayMongo's dashboard.
- Webhook URL: `https://bukit-production-2a44.up.railway.app/webhooks/paymongo`. Listens for `checkout_session.payment.paid`.
- Webhook secret: `PAYMONGO_WEBHOOK_SECRET` env. Signature verified manually using HMAC-SHA256 (see `apps/api/src/lib/paymongo.ts`).

### PhilSMS

- Account holds the daily quota. Test plan supports a few hundred OTPs/day.
- Sender ID is `PhilSMS` (or whitelist a custom one with their support).
- Production should rotate to a paid plan with a real sender ID for trust.

---

## 8. Operations runbook

### Promote a user to ADMIN

```sql
UPDATE "User" SET role = 'ADMIN' WHERE "phoneNumber" = '+639XXXXXXXXX';
```

Run via Railway → Postgres → Database tab. The user signs out + back in (or hard refresh) to pick up the new role; the "Admin" link then appears in the nav.

### Seed service tiers in prod (one-time)

After migrations land cleanly:

```bash
cd apps/api
DATABASE_URL='<DATABASE_PUBLIC_URL from Railway>' npx tsx prisma/seed.ts
```

This idempotently upserts the four default cleaning tiers under a "Cleaning" service. Admin-created services persist across re-seeds.

### Inspect a booking

Browse to `/admin` (admin console) — there's no booking inspector yet. **TODO**: build one. For now: Railway → Postgres → run SQL.

### Manual disbursement (current MVP flow)

1. Run a query for eligible payouts:
   ```sql
   SELECT p.id, p."providerId", p."netCentavos", pm."type", pm."holderName", pm."accountIdentifier"
   FROM "Payout" p
   JOIN "ProviderProfile" pp ON pp.id = p."providerId"
   JOIN "ProviderPayoutMethod" pm ON pm."providerProfileId" = pp.id
   WHERE p.status = 'PENDING' AND p."eligibleAt" <= NOW();
   ```
2. Send GCash/bank transfer to each row's `accountIdentifier`.
3. Mark paid:
   ```sql
   UPDATE "Payout" SET status = 'PAID', "paidAt" = NOW(), "referenceCode" = '<gcash-ref>' WHERE id = '<payout-id>';
   ```

This is fine for ~5–10 providers. Beyond that, build the admin Payouts page (placeholder route, not implemented).

### Approve a stuck KYC submission manually

```sql
UPDATE "User" SET "kycStatus" = 'APPROVED' WHERE id = '<userId>';
UPDATE "KycSubmission" SET status = 'APPROVED', "reviewedAt" = NOW() WHERE "userId" = '<userId>';
```

But normally use `/admin/kyc` UI.

---

## 9. Open work + known gaps

In rough priority order for going live:

### Must-fix before paying customers
- [ ] **Real PayMongo Disbursements integration**. Currently `POST /me/payouts/request` only logs. Manual GCash transfers don't scale.
- [ ] **Provider Payouts admin page**. There's a placeholder; admin currently uses raw SQL.
- [ ] **Stronger admin auth**. Admin uses the same phone-OTP flow as customers; consider a separate stronger path or 2FA.
- [ ] **Email/SMS notifications** outside the app. Current state changes only push via Socket.IO — if a provider isn't online they miss it.
- [ ] **Webhook idempotency**. PayMongo can replay webhooks; we don't currently dedupe. Each `POST /webhooks/paymongo` runs the captured-payment side effects unconditionally — so a retry could double-create a `Payment` row, double-flip a booking to `IN_ESCROW`, etc. The `Payment.bookingId @unique` constraint catches the worst (the second insert errors), but the side-effect logic should be made explicitly idempotent: either persist the PayMongo `event_id` and short-circuit on duplicates, or use `upsert` everywhere. **Important enough to do before live launch.**
- [ ] **Refund / cancellation** path for already-disbursed payouts. We mark Payouts `VOID` if cancelled before payout, but there's no "claw back" once paid.

### Polish / scaling
- [ ] **Image storage limits**. KYC photos are stored forever. Add a retention policy or compress on upload.
- [ ] **Booking history pagination**. Currently client-side from `usePagination`. Move to server-side once a customer has > 100 bookings.
- [ ] **Provider availability heatmap**. We track lat/lng but don't expose any analytics.
- [ ] **Customer support inbox**. There's chat per booking but no general support channel.
- [ ] **Localization**. App is English-only. Filipino consumers might appreciate Tagalog.

### Nice-to-have
- [ ] **Mobile app**. Web is responsive but providers especially would benefit from push notifications, which require a native app.
- [ ] **Dispute resolution flow**. Admin can void payouts manually; no formal dispute queue.

### Tech debt / things to know
- `routeTree.gen.ts` is gitignored and regenerated by `tsr generate` during build. Don't commit it; never edit by hand.
- Prisma client types lag behind schema in the IDE — `pnpm --filter @bukit/api exec prisma generate` + restart TS server to refresh.
- `tsc --noEmit` ≠ `tsc -b`. Vercel uses `-b`, which is stricter. Always run `pnpm --filter @bukit/web exec tsc -b` before pushing or you'll catch errors only on deploy.
- `crossSubDomainCookies` in Better-Auth is **disabled**; we rely on Vercel rewrites making the auth cookie first-party. If you move to a custom domain split (e.g. `app.bukit.ph` + `api.bukit.ph`), enable cross-subdomain cookies and drop the rewrite proxy.
- `@vercel/blob` v2.3.x typings only list `access: 'public'`; we cast to use `'private'`. Bumping to a future major might require revisiting.

---

## 9b. What's flexible (no-code / low-code knobs)

Things the team can change without (or with minimal) code changes:

### Admin-managed at runtime (no deploy needed)

| What | Where | How |
|---|---|---|
| **Service catalog** — add/rename/disable services | `/admin/services` | New top-level service with its own iconKey + sort order |
| **Pricing tiers** — per-service tier list | `/admin/services` (nested under each service) | Free-form: name, slug, description, price (₱), estimated minutes, sort order, isActive. Soft-delete via toggle. |
| **Service icons** | Admin form, `iconKey` field | Pick from `sparkles`, `spray-can`, `shirt`, `wind`, `wrench`. Adding new icons = small frontend change to `ICON_MAP` (`apps/web/src/routes/services.tsx`, `services.$serviceSlug.tsx`, `index.tsx`). |
| **KYC approvals/rejections** | `/admin/kyc` | Approve, reject with reason. Resubmissions are one-tap. |
| **Per-provider take rate** | DB only (no admin UI yet) | `UPDATE "ProviderProfile" SET "takeRateBps" = 800 WHERE id = '…'` to set a specific provider to 8% instead of the default 5%. |
| **Provider status (active/suspended)** | DB only | `UPDATE "ProviderProfile" SET status = 'SUSPENDED' WHERE id = '…'` |
| **Featured services on landing** | Sort order on services | Top 4 by `sortOrder` ASC are featured automatically. Change sort order to reshuffle. |

### Env-overridable knobs (no code change — set on Railway and redeploy)

These read from env at boot, with defaults baked into the code. Tune in
**Railway → api service → Variables** without touching source. All defined
in [`apps/api/src/env.ts`](./apps/api/src/env.ts) with Zod validation.

| Variable | Default | Effect |
|---|---|---|
| `ON_DEMAND_RADIUS_KM` | `35` km | Provider match radius for on-demand bookings. |
| `PAYOUT_COOLDOWN_HOURS` | `24` h | Time between job completion and payout becoming eligible. |
| `MIN_PAYOUT_CENTAVOS` | `50000` (₱500) | Minimum batch size for "Request payout". |
| `POST_COMPLETION_CHAT_MS` | `10800000` (3 h) | How long the chat thread stays open after COMPLETED. |
| `KYC_REQUIRED_FOR_BOOKING` | `true` | Toggle the KYC gate for booking — useful to set `false` in staging. |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed front-end origin(s); comma-separated for multi-domain. |

### Single-line code knobs (small change + redeploy)

| Knob | File | Default | Effect |
|---|---|---|---|
| **Default take rate** | `apps/api/prisma/schema.prisma` `ProviderProfile.takeRateBps @default(500)` | 5% | Per-provider override available via `UPDATE`. |
| **OTP length / expiry / attempts** | `apps/api/src/lib/auth.ts` (Better-Auth `phoneNumber` plugin config) | 6 digits / 10 min / 3 tries | Self-explanatory. |
| **Cancellation policy** | `apps/api/src/lib/cancellation-policy.ts` | tiered fees by hours-out | Has unit tests; change with care. |
| **Marketing copy** (hero, marquee, trust grid) | `apps/web/src/routes/index.tsx`, `signin.tsx`, `onboarding.tsx`, `provider.index.tsx` | — | Plain string edits. |

### Schema-level extensibility (designed-in)

The data model was built with these extensions in mind:

- **`Service.iconKey`** is just a string — adding a new icon means dropping the Lucide component into `ICON_MAP` on the frontend. No DB migration.
- **`ServiceTier.basePriceCentavos` / `estimatedMinutes`** are numbers, not enums — admin can set whatever values make sense per market.
- **`User.kycStatus`** is denormalized from `KycSubmission` so future work (annual re-verification, expiring approvals) only changes the submission lifecycle, not gates.
- **`Payout.netCentavos` is signed** — supports cash-fee debits today, refund clawbacks tomorrow without schema change.
- **`Booking.bookingMode = SCHEDULED | ON_DEMAND`** is an enum that gates two different matching strategies. A third mode (e.g. RECURRING) is one enum value + a routing branch in `providers.ts`.
- **WEB_ORIGIN is comma-separated** — supports multiple frontend origins (e.g. canonical Vercel URL + custom domain) without redeploying.
- **`takeRateBps` per provider** lets you negotiate fee structures without forking the codebase (e.g. 0% promo for first 10 bookings, 3% for high-volume providers).

### What's NOT flexible without significant rework

To set expectations:

- **Currency**: hardcoded PHP throughout. Multi-currency would need money objects + FX.
- **Country**: PH-only. Phone normalization, address province default, Nominatim `countrycodes=ph`, PayMongo. Going multi-country means rewiring all of these.
- **Provider categories**: a provider serves anyone right now. No skill-tagging — a "cleaning" provider can accept "AC repair" jobs. Add `ProviderProfile.serviceIds: string[]` if you need this.
- **Availability calendar**: providers have a binary `availabilityMode` (OFFLINE / SCHEDULED_ONLY / FULL). No per-day or per-hour availability. Building a real calendar is a meaningful refactor.
- **Multi-tenant / white-label**: schema assumes one Bukit deployment per business. Adding tenancy means adding a `Tenant` row and scoping every query.

---

## 10. Decision log

Things you might second-guess; here's why we did them.

| Decision | Why |
|---|---|
| **PayMongo over Stripe** | Stripe doesn't process PHP card payments natively; PayMongo is the de-facto PH gateway with GCash/Maya/QR-Ph support. |
| **Internal escrow (capture immediately, track Payout rows)** | PayMongo Checkout doesn't support manual capture. So we capture into our balance and reconcile per-booking via Payout rows. |
| **Phone OTP only (no email)** | Filipino consumers default to phone-first. Email auth would add friction with no upside. |
| **Vercel rewrites for `/api/*`** | Mobile Safari blocks 3rd-party cookies. Routing through the same origin as the SPA makes the auth cookie first-party. Simpler than wiring a custom domain split for a demo. |
| **Socket.IO direct to Railway, not via rewrite** | Vercel's rewrite layer doesn't carry WebSockets reliably. Cross-site WS handshake works (Better-Auth doesn't gate WS by SameSite). |
| **35 km on-demand radius** | Caloocan ↔ Las Piñas diagonal is ≈ 30 km. 35 covers all of NCR with slack but doesn't bleed into Cavite/Bulacan. |
| **5% take rate** | Picked by founder. `takeRateBps` is per-provider so you can override for partnerships. |
| **24-hour payout cooldown** | Protects against refunds/disputes. Industry standard. |
| **₱500 minimum payout** | Below that, GCash transfer fees eat into the provider's earnings. |
| **Multi-service catalog** | The app started cleaning-only but pivoted to a generic marketplace. Schema split: `Service` (parent) → `ServiceTier` (priced item). |
| **Server-side multipart upload to Vercel Blob (not client direct)** | Client SDK couldn't derive a stable upload URL behind Railway's proxy. Server-side puts are simpler and the photos are small (~2 MB). |
| **Private Vercel Blob + photo proxy** | KYC photos are sensitive PII. Private store + auth-gated proxy means even a leaked URL is unusable without our token. |
| **Manual disbursement for MVP** | Real PayMongo Disbursements requires extra KYC + a higher account tier. Manual is fine for ≤ 10 providers. Wire automated next. |

---

## 11. Secrets inventory

What needs to be transferred or rotated when handing over.

| Secret | Where | Action |
|---|---|---|
| `AUTH_SECRET`, `COOKIE_SECRET` | Railway api service env | **Rotate** — generate new ones with `openssl rand -hex 32`. All existing sessions will be invalidated; users sign in again. |
| `DATABASE_URL` | Auto-injected by Railway Postgres | No action. |
| `PAYMONGO_SECRET_KEY` | Railway env + PayMongo dashboard | Transfer the PayMongo account ownership (PayMongo support handles this). Rotate the secret key once new owner has access. |
| `PAYMONGO_WEBHOOK_SECRET` | Railway env + PayMongo dashboard | Will need re-creation after the webhook URL is reconfirmed. |
| `PHILSMS_API_KEY` | Railway env + PhilSMS dashboard | Transfer PhilSMS account or have new team set up their own. |
| `BLOB_READ_WRITE_TOKEN` | Railway env + Vercel Blob store | Transfer Vercel team membership (vercel.com/teams). The token is auto-issued per store. |
| Vercel project ownership | vercel.com | Add new team via Settings → Members. Transfer ownership when ready. |
| Railway project ownership | railway.app | Settings → Members → invite new team. Transfer ownership when comfortable. |
| GitHub repo | github.com | Transfer or invite collaborators. |
| Domain (if/when you buy one) | Whoever owns the registrar | Hand off DNS access. |

---

## 12. Where to ask questions

If something in this doc is unclear and the new team needs to ping the original developer:

- **Architecture / "why is X done this way"**: search the git log first — every commit message is descriptive (intentional). `git log --grep "<thing>"` usually finds the rationale.
- **Bug reports without obvious cause**: check Railway → Deploy Logs (real-time errors) and HTTP Logs (request status).
- **Payment problems**: PayMongo dashboard has its own event log; correlate with our `Booking`/`Payment`/`BookingEvent` rows.

---

Good luck. The app's small enough to fully understand in a couple of days. Read [README.md](./README.md) for the cliff notes, then poke at it locally with the steps in §6.
