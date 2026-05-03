import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { verifyAuthRequest } from "../services/auth.js";
import { encryptToken } from "../services/tokenVault.js";

export const emailRouter = Router();

const connectSchema = z.object({
  provider: z.enum(["GMAIL", "OUTLOOK"]),
  externalAccountId: z.string().min(1),
  refreshToken: z.string().min(1),
  scope: z.string().optional()
});

emailRouter.post("/connections", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = connectSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { externalAuthId: auth.externalAuthId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const encryptedRefresh = encryptToken(payload.refreshToken);

    const connection = await db.emailConnection.upsert({
      where: {
        provider_externalAccountId: {
          provider: payload.provider,
          externalAccountId: payload.externalAccountId
        }
      },
      update: {
        userId: user.id,
        refreshTokenCipher: encryptedRefresh,
        scope: payload.scope
      },
      create: {
        userId: user.id,
        provider: payload.provider,
        externalAccountId: payload.externalAccountId,
        refreshTokenCipher: encryptedRefresh,
        scope: payload.scope
      }
    });

    res.json({
      id: connection.id,
      provider: connection.provider,
      externalAccountId: connection.externalAccountId,
      scope: connection.scope
    });
  } catch (error) {
    next(error);
  }
});
