# SubSlayer

Project Title: **SubSlayer (Bounty-Based Micro-Sub Manager)**

Node.js + PostgreSQL backend scaffold for:
- user authentication (Clerk or Firebase Auth),
- financial recurring-transaction detection (Plaid),
- email header analysis (Gmail/Outlook OAuth),
- subscription and bounty state tracking.

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

## Database Schema (Core)

- `Subscription`: normalized merchant, recurring cadence, amount, micro-subscription flags, status.
- `Bounty`: reward amount, payout status timeline, proof/evidence links, linked subscription.
- `SubscriptionDetection`: records detection source (`PLAID_RECURRING`, `EMAIL_HEADER`, `USER_CONFIRMED`) and confidence.
- `EmailSignal`: keyword-match artifacts from Gmail/Outlook header scans.

## Quick Start

1. Copy env file:
   - `cp .env.example .env`
2. Set `DATABASE_URL` to your PostgreSQL instance.
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Run migration:
   - `npm run prisma:migrate:dev`
5. Start API:
   - `npm run dev`

## Notes

- Auth, Plaid, and mailbox providers are scaffolded with clear integration points but not fully wired to external SDKs yet.
- This keeps the architecture and schema production-ready while allowing incremental integration.
