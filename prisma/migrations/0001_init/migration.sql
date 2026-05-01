-- Enums
CREATE TYPE "AuthProvider" AS ENUM ('CLERK', 'FIREBASE');
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'TRIAL', 'PAUSED');
CREATE TYPE "DetectionSource" AS ENUM ('PLAID_RECURRING', 'EMAIL_HEADER', 'USER_CONFIRMED');
CREATE TYPE "BountyStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLAIMED', 'PAID', 'EXPIRED', 'CANCELED');

-- Tables
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "authProvider" "AuthProvider" NOT NULL,
  "externalAuthId" TEXT NOT NULL UNIQUE,
  "email" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PlaidItem" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "plaidItemId" TEXT NOT NULL UNIQUE,
  "accessTokenCipher" TEXT NOT NULL,
  "institutionName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "EmailConnection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" "EmailProvider" NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "refreshTokenCipher" TEXT NOT NULL,
  "scope" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("provider", "externalAccountId")
);

CREATE TABLE "Subscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "plaidItemId" TEXT REFERENCES "PlaidItem"("id") ON DELETE SET NULL,
  "merchantNormalizedName" TEXT NOT NULL,
  "merchantId" TEXT,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "amountUsd" DECIMAL(10, 2) NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "billingCadenceDays" INTEGER,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL,
  "nextExpectedChargeAt" TIMESTAMP(3),
  "isMicroSubscription" BOOLEAN NOT NULL DEFAULT false,
  "microSubscriptionReason" TEXT,
  "canceledAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SubscriptionDetection" (
  "id" TEXT PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL REFERENCES "Subscription"("id") ON DELETE CASCADE,
  "source" "DetectionSource" NOT NULL,
  "confidenceScore" DECIMAL(5, 4) NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawPayload" JSONB NOT NULL
);

CREATE TABLE "EmailSignal" (
  "id" TEXT PRIMARY KEY,
  "emailConnectionId" TEXT NOT NULL REFERENCES "EmailConnection"("id") ON DELETE CASCADE,
  "providerMessageId" TEXT NOT NULL,
  "headerFrom" TEXT,
  "headerSubject" TEXT,
  "matchedKeywords" TEXT[] NOT NULL,
  "confidenceScore" DECIMAL(5, 4) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("emailConnectionId", "providerMessageId")
);

CREATE TABLE "Bounty" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "subscriptionId" TEXT NOT NULL REFERENCES "Subscription"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "BountyStatus" NOT NULL DEFAULT 'OPEN',
  "rewardUsd" DECIMAL(10, 2) NOT NULL,
  "eligibleFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "proofUrl" TEXT,
  "cancellationEvidenceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription" ("userId", "status");
CREATE INDEX "Subscription_merchantId_idx" ON "Subscription" ("merchantId");
CREATE INDEX "Subscription_isMicroSubscription_status_idx" ON "Subscription" ("isMicroSubscription", "status");
CREATE INDEX "SubscriptionDetection_subscriptionId_detectedAt_idx" ON "SubscriptionDetection" ("subscriptionId", "detectedAt");
CREATE INDEX "Bounty_userId_status_idx" ON "Bounty" ("userId", "status");
CREATE INDEX "Bounty_subscriptionId_status_idx" ON "Bounty" ("subscriptionId", "status");
