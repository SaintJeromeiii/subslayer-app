# SubSlayer

Project Title: **SubSlayer (Bounty-Based Micro-Sub Manager)**

Node.js + PostgreSQL backend scaffold for:
- user authentication (Clerk or Firebase Auth),
- financial recurring-transaction detection (Plaid),
- email header analysis (Gmail/Outlook OAuth),
- subscription and bounty state tracking with Stripe-backed bounty logic.

## Architecture

- **API Layer**: Express service in `src/` with routes for subscriptions and bounties.
- **Auth Layer**: `src/services/auth.ts` provides a provider-agnostic verification contract.
- **Financial Data Layer**: `src/services/plaid.ts` defines recurring candidate ingestion and micro-subscription classification.
- **Email Analysis Layer**: `src/services/emailAnalysis.ts` scans headers for:
  - `Receipt`
  - `Subscription`
  - `Trial`
  - `Invoice`
  - `Renewal`
- **Data Layer**: Prisma + PostgreSQL schema in `prisma/schema.prisma`.

## Micro-Subscription Rule

Transactions are flagged as micro-subscriptions when they are recurring and amount is between **$0.99 and $50.00** inclusive.

## Bounty Logic Engine

- State machine per subscription: `DETECTED`, `SLAYING`, `SLAIN`, `SHIELDED`
- `SLAIN` + `ACTIVE_REQUEST` source: creates a `$3.00` `BOUNTY`
- `SLAIN` + `FREE_TRIAL` source and canceled <=24h before `trialExpiresAt`: creates a `$2.00` `SHIELD`
- Stripe onboarding pre-authorization endpoint: `POST /users/onboard` creates a manual-capture `$10.00` hold
- Stripe webhook endpoint: `POST /webhooks/stripe` marks bounties as `PAID` on successful Stripe settlement events when `metadata.bountyId` is supplied

## AI Mercenary (Agentic Workflow)

- LLM cancellation request drafting: `POST /mercenary/generate-cancellation-email`
- LLM hardship letter drafting (financial hardship / technical dissatisfaction): `POST /mercenary/generate-hardship-letter`
- Merchant cancel-flow automation (Playwright, dry-run safe by default): `POST /mercenary/automate-cancel`
- Top-tier merchant support scaffolded for: Netflix, Disney+, Spotify, New York Times
- Selector registry + screenshot audit trail written to `artifacts/cancellation-runs/<runId>/`

## UI/UX Endpoints and Dashboard

- Leakage metrics API: `GET /dashboard/metrics`
- Real-time terminal log stream (SSE): `GET /mercenary/logs/stream`
- One-click slay API: `POST /mercenary/slay/:subscriptionId`
- Local UI dashboard served at `/` via `public/index.html`

## Database Schema (Core)

- `Subscription`: normalized merchant, recurring cadence, amount, micro-subscription flags, status.
- `Bounty`: reward amount, payout status timeline, proof/evidence links, linked subscription.
- `SubscriptionDetection`: records detection source (`PLAID_RECURRING`, `EMAIL_HEADER`, `USER_CONFIRMED`) and confidence.
- `EmailSignal`: keyword-match artifacts from Gmail/Outlook header scans.

## Quick Start

1. Copy env file:
   - `cp .env.example .env`
2. Set `DATABASE_URL` to your PostgreSQL instance.
3. Generate a 32-byte AES key (base64) for token encryption:
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Put it in `.env` as `TOKEN_ENCRYPTION_KEY`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Run migration:
   - `npm run prisma:migrate:dev`
6. Start API:
   - `npm run dev`

## Security & Compliance

- **Token encryption**: store third-party tokens using `encryptToken()` from `src/services/tokenVault.ts` (AES-256-GCM). Set `TOKEN_ENCRYPTION_KEY`.
- **Limited Power of Attorney**: onboarding requires acceptance via `/users/onboard` (`acceptLpoa: true` + matching `lpoaVersion`). Public text is available at `GET /users/lpoa`.

### Where encryption is enforced in API flows

- `POST /plaid/link-token` creates a Plaid Link `link_token` (server-side).
- `POST /plaid/item/exchange` exchanges a Link `public_token` for an `access_token`, encrypts it into `PlaidItem.accessTokenCipher`, and returns `plaidItemRecordId`.
- `POST /subscriptions/plaid/recurring-monthly/sync` pulls recurring subscriptions using either:
  - `plaidItemRecordId` (recommended; uses encrypted token from DB), or
  - `publicToken` (one-time exchange; still avoids storing long-lived access tokens in the browser)
- `POST /email/connections` encrypts mailbox `refreshToken` into `EmailConnection.refreshTokenCipher`.

## Notes

- Auth, Plaid, and mailbox providers are scaffolded with clear integration points but not fully wired to external SDKs yet.
- This keeps the architecture and schema production-ready while allowing incremental integration.
