import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import { verifyAuthRequest } from "../services/auth.js";
import { applyBountyRulesOnSlain } from "../services/bountyEngine.js";
import { fetchRecurringMonthlyUnder50, isMicroSubscription, mapPlaidDetectionSource } from "../services/plaid.js";
import { getPlaidClient } from "../services/plaidClient.js";
import { encryptToken } from "../services/tokenVault.js";

export const subscriptionsRouter = Router();
const allowedTransitions: Record<string, string[]> = {
  DETECTED: ["SLAYING", "SHIELDED"],
  SLAYING: ["SLAIN", "SHIELDED"],
  SLAIN: ["SHIELDED"],
  SHIELDED: ["SLAYING", "SLAIN"]
};

subscriptionsRouter.get("/", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const user = await db.user.findUnique({
      where: { externalAuthId: auth.externalAuthId },
      include: { subscriptions: true }
    });

    res.json({ subscriptions: user?.subscriptions ?? [] });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/classify", async (req, res, next) => {
  try {
    const amount = Number(req.body?.amountUsd);
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ error: "amountUsd must be a number" });
    }

    res.json({
      amountUsd: amount,
      isMicroSubscription: isMicroSubscription(amount)
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/plaid/recurring-monthly", async (req, res, next) => {
  try {
    const accessToken = String(req.body?.accessToken ?? "");
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken is required" });
    }

    const recurringMonthlyUnder50 = await fetchRecurringMonthlyUnder50(accessToken);
    res.json({
      count: recurringMonthlyUnder50.length,
      recurringMonthlyUnder50
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/plaid/recurring-monthly/sync", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = z
      .object({
        plaidItemRecordId: z.string().min(1).optional(),
        publicToken: z.string().min(1).optional(),
        institutionName: z.string().optional()
      })
      .refine((value) => Boolean(value.plaidItemRecordId ?? value.publicToken), {
        message: "Provide either plaidItemRecordId (recommended) or publicToken (one-time exchange)."
      })
      .parse(req.body);

    const user = await db.user.upsert({
      where: { externalAuthId: auth.externalAuthId },
      update: { email: auth.email },
      create: {
        externalAuthId: auth.externalAuthId,
        email: auth.email,
        authProvider: auth.provider === "clerk" ? "CLERK" : "FIREBASE"
      }
    });

    let plaidItem = null as Awaited<ReturnType<typeof db.plaidItem.findFirst>> | null;
    let encryptedAccessToken = "";

    if (payload.plaidItemRecordId) {
      plaidItem = await db.plaidItem.findFirst({
        where: { id: payload.plaidItemRecordId, userId: user.id }
      });
      if (!plaidItem) {
        return res.status(404).json({ error: "PlaidItem not found for user" });
      }
      encryptedAccessToken = plaidItem.accessTokenCipher;
    } else if (payload.publicToken) {
      // One-time exchange path (still avoids storing long-lived access tokens client-side)
      const client = getPlaidClient();
      const exchange = await client.itemPublicTokenExchange({ public_token: payload.publicToken });
      const accessToken = exchange.data.access_token;
      const itemId = exchange.data.item_id;
      encryptedAccessToken = encryptToken(accessToken);
      plaidItem = await db.plaidItem.upsert({
        where: { plaidItemId: `${user.id}:${itemId}` },
        update: {
          accessTokenCipher: encryptedAccessToken,
          institutionName: payload.institutionName ?? undefined
        },
        create: {
          userId: user.id,
          plaidItemId: `${user.id}:${itemId}`,
          accessTokenCipher: encryptedAccessToken,
          institutionName: payload.institutionName
        }
      });
    }

    if (!plaidItem) {
      return res.status(400).json({ error: "Unable to resolve Plaid item" });
    }

    const recurringMonthlyUnder50 = await fetchRecurringMonthlyUnder50(encryptedAccessToken);
    const source = mapPlaidDetectionSource();

    const persisted = await Promise.all(
      recurringMonthlyUnder50.map(async (candidate) => {
        const existing = await db.subscription.findFirst({
          where: {
            userId: user.id,
            merchantNormalizedName: candidate.merchantName,
            amountUsd: candidate.amountUsd,
            status: "ACTIVE"
          }
        });

        const subscription = existing
          ? await db.subscription.update({
              where: { id: existing.id },
              data: {
                plaidItemId: plaidItem.id,
                merchantId: candidate.merchantId ?? existing.merchantId,
                billingCadenceDays: candidate.cadenceDays ?? existing.billingCadenceDays,
                lastDetectedAt: candidate.occurredAt,
                nextExpectedChargeAt: new Date(candidate.occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000),
                isMicroSubscription: true,
                microSubscriptionReason: "Plaid recurring monthly charge between $0.99 and $50.00"
              }
            })
          : await db.subscription.create({
              data: {
                userId: user.id,
                plaidItemId: plaidItem.id,
                merchantNormalizedName: candidate.merchantName,
                merchantId: candidate.merchantId,
                amountUsd: candidate.amountUsd,
                billingCadenceDays: candidate.cadenceDays ?? 30,
                lastDetectedAt: candidate.occurredAt,
                nextExpectedChargeAt: new Date(candidate.occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000),
                state: "DETECTED",
                source: "AUTOMATED_DETECTION",
                isMicroSubscription: true,
                microSubscriptionReason: "Plaid recurring monthly charge between $0.99 and $50.00"
              }
            });

        await db.subscriptionDetection.create({
          data: {
            subscriptionId: subscription.id,
            source,
            confidenceScore: candidate.confidence,
            rawPayload: candidate.payload as Prisma.InputJsonValue
          }
        });

        return subscription;
      })
    );

    res.json({
      syncedCount: persisted.length,
      plaidItemId: plaidItem.id,
      subscriptions: persisted
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post("/:subscriptionId/state", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const subscriptionId = req.params.subscriptionId;
    const nextState = String(req.body?.nextState ?? "").toUpperCase();
    const source = req.body?.source ? String(req.body.source).toUpperCase() : undefined;
    const trialExpiresAt = req.body?.trialExpiresAt ? new Date(String(req.body.trialExpiresAt)) : undefined;

    if (!["DETECTED", "SLAYING", "SLAIN", "SHIELDED"].includes(nextState)) {
      return res.status(400).json({ error: "nextState must be one of DETECTED, SLAYING, SLAIN, SHIELDED" });
    }

    if (source && !["ACTIVE_REQUEST", "FREE_TRIAL", "AUTOMATED_DETECTION"].includes(source)) {
      return res.status(400).json({ error: "source must be ACTIVE_REQUEST, FREE_TRIAL, or AUTOMATED_DETECTION" });
    }

    const user = await db.user.findUnique({
      where: { externalAuthId: auth.externalAuthId }
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await db.subscription.findFirst({
      where: { id: subscriptionId, userId: user.id }
    });
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const transitions = allowedTransitions[subscription.state] ?? [];
    if (subscription.state !== nextState && !transitions.includes(nextState)) {
      return res.status(409).json({
        error: `Invalid state transition from ${subscription.state} to ${nextState}`
      });
    }

    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        state: nextState as "DETECTED" | "SLAYING" | "SLAIN" | "SHIELDED",
        source: (source as "ACTIVE_REQUEST" | "FREE_TRIAL" | "AUTOMATED_DETECTION" | undefined) ?? subscription.source,
        trialExpiresAt,
        canceledAt: nextState === "SLAIN" ? new Date() : subscription.canceledAt,
        status: nextState === "SLAIN" ? "CANCELED" : subscription.status
      }
    });

    let bounty = null;
    if (updated.state === "SLAIN") {
      bounty = await applyBountyRulesOnSlain({
        userId: user.id,
        subscription: updated
      });
    }

    res.json({ subscription: updated, bountyTriggered: bounty });
  } catch (error) {
    next(error);
  }
});
