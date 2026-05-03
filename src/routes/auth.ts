import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  buildExternalAuthIdFromEmail,
  clearSession,
  createSession,
  getSessionCookieName,
  getSessionTokenFromRequest,
  verifyAuthRequest
} from "../services/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  provider: z.enum(["clerk", "firebase"]).default("clerk")
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const externalAuthId = buildExternalAuthIdFromEmail(payload.email);
    const context = {
      externalAuthId,
      email: payload.email,
      provider: payload.provider
    } as const;

    await db.user.upsert({
      where: { externalAuthId: context.externalAuthId },
      update: { email: context.email },
      create: {
        externalAuthId: context.externalAuthId,
        email: context.email,
        authProvider: context.provider === "clerk" ? "CLERK" : "FIREBASE"
      }
    });

    const token = await createSession(context);
    res.setHeader(
      "Set-Cookie",
      `${getSessionCookieName()}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
    );

    res.json({ ok: true, user: context });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    res.json({ authenticated: true, user: auth });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (token) {
    await clearSession(token);
  }
  res.setHeader("Set-Cookie", `${getSessionCookieName()}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
