import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { verifyAuthHeader } from "../services/auth.js";
import { fetchRecurringMonthlyUnder50, isMicroSubscription, mapPlaidDetectionSource } from "../services/plaid.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/", async (req, res, next) => {
  try {
    const auth = await verifyAuthHeader(req.header("authorization"));
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
    const auth = await verifyAuthHeader(req.header("authorization"));
    const accessToken = String(req.body?.accessToken ?? "");
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken is required" });
    }

    const user = await db.user.upsert({
      where: { externalAuthId: auth.externalAuthId },
      update: { email: auth.email },
      create: {
        externalAuthId: auth.externalAuthId,
        email: auth.email,
        authProvider: auth.provider === "clerk" ? "CLERK" : "FIREBASE"
      }
    });

    const recurringMonthlyUnder50 = await fetchRecurringMonthlyUnder50(accessToken);
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
                merchantNormalizedName: candidate.merchantName,
                merchantId: candidate.merchantId,
                amountUsd: candidate.amountUsd,
                billingCadenceDays: candidate.cadenceDays ?? 30,
                lastDetectedAt: candidate.occurredAt,
                nextExpectedChargeAt: new Date(candidate.occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000),
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
      subscriptions: persisted
    });
  } catch (error) {
    next(error);
  }
});
