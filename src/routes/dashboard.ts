import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { verifyAuthRequest } from "../services/auth.js";

export const dashboardRouter = Router();

dashboardRouter.get("/metrics", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const user = await db.user.findUnique({ where: { externalAuthId: auth.externalAuthId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activeNotSlain = await db.subscription.findMany({
      where: { userId: user.id, status: "ACTIVE", state: { not: "SLAIN" } },
      select: { amountUsd: true }
    });
    const slainSubscriptions = await db.subscription.findMany({
      where: { userId: user.id, state: "SLAIN" },
      select: { amountUsd: true }
    });

    const monthlyWaste = activeNotSlain.reduce(
      (sum: number, sub: { amountUsd: Prisma.Decimal }) => sum + Number(sub.amountUsd),
      0
    );
    const moneyRetrieved = slainSubscriptions.reduce(
      (sum: number, sub: { amountUsd: Prisma.Decimal }) => sum + Number(sub.amountUsd),
      0
    );

    res.json({
      leakage: {
        monthlyWaste,
        moneyRetrieved
      }
    });
  } catch (error) {
    next(error);
  }
});
