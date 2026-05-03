import { Router } from "express";
import { z } from "zod";
import { CountryCode, Products } from "plaid";
import { db } from "../db.js";
import { verifyAuthRequest } from "../services/auth.js";
import { getPlaidClient } from "../services/plaidClient.js";
import { encryptToken } from "../services/tokenVault.js";

export const plaidRouter = Router();

const linkTokenSchema = z.object({
  androidPackageName: z.string().optional(),
  redirectUri: z.string().optional()
});

plaidRouter.post("/link-token", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = linkTokenSchema.parse(req.body ?? {});

    const user = await db.user.upsert({
      where: { externalAuthId: auth.externalAuthId },
      update: { email: auth.email },
      create: {
        externalAuthId: auth.externalAuthId,
        email: auth.email,
        authProvider: auth.provider === "clerk" ? "CLERK" : "FIREBASE"
      }
    });

    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "SubSlayer",
      language: "en",
      country_codes: [CountryCode.Us],
      products: [Products.Transactions],
      android_package_name: payload.androidPackageName,
      redirect_uri: payload.redirectUri
    });

    res.json({ linkToken: response.data.link_token, expiration: response.data.expiration });
  } catch (error) {
    next(error);
  }
});

const exchangeSchema = z.object({
  publicToken: z.string().min(1),
  institutionName: z.string().optional()
});

plaidRouter.post("/item/exchange", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = exchangeSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { externalAuthId: auth.externalAuthId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const client = getPlaidClient();
    const exchange = await client.itemPublicTokenExchange({
      public_token: payload.publicToken
    });

    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const encryptedAccessToken = encryptToken(accessToken);

    const plaidItem = await db.plaidItem.upsert({
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

    res.json({
      plaidItemRecordId: plaidItem.id,
      itemId
    });
  } catch (error) {
    next(error);
  }
});
