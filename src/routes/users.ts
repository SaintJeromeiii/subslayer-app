import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { verifyAuthRequest } from "../services/auth.js";
import { ensureStripeCustomer, preAuthorizeOnboardingCharge } from "../services/stripe.js";

export const usersRouter = Router();

export const LPOA_VERSION = "2026-05-01";
export const LPOA_TEXT = `LIMITED POWER OF ATTORNEY (CUSTOMER REPRESENTATIVE)

By accepting, you authorize SubSlayer and its automated agents to act solely as your representative to communicate with merchants and service providers you designate, strictly for the limited purpose of managing or canceling recurring subscriptions you explicitly instruct us to address.

This authorization is limited in scope, revocable, and does not grant the right to initiate new paid services, move funds without your instruction, or take actions outside subscription cancellation workflows you trigger in the product.

You confirm you are the account holder or have lawful authority over the accounts you connect.`;

usersRouter.get("/lpoa", (_req, res) => {
  res.json({ version: LPOA_VERSION, text: LPOA_TEXT });
});

const onboardSchema = z.object({
  paymentMethodId: z.string().min(1),
  acceptLpoa: z.literal(true),
  lpoaVersion: z.literal(LPOA_VERSION)
});

usersRouter.post("/onboard", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = onboardSchema.parse(req.body);

    const user = await db.user.upsert({
      where: { externalAuthId: auth.externalAuthId },
      update: {
        email: auth.email,
        lpoaVersion: payload.lpoaVersion,
        lpoaAcceptedAt: new Date(),
        lpoaUserAgent: req.header("user-agent") ?? null,
        lpoaAcceptanceIp: req.ip ?? null
      },
      create: {
        externalAuthId: auth.externalAuthId,
        email: auth.email,
        authProvider: auth.provider === "clerk" ? "CLERK" : "FIREBASE",
        lpoaVersion: payload.lpoaVersion,
        lpoaAcceptedAt: new Date(),
        lpoaUserAgent: req.header("user-agent") ?? null,
        lpoaAcceptanceIp: req.ip ?? null
      }
    });

    const stripeCustomerId = await ensureStripeCustomer(auth.email, user.stripeCustomerId ?? undefined);
    if (!user.stripeCustomerId) {
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId }
      });
    }

    const preAuthorization = await preAuthorizeOnboardingCharge(stripeCustomerId, payload.paymentMethodId);

    res.json({
      userId: user.id,
      stripeCustomerId,
      preAuthorizationId: preAuthorization.id,
      status: preAuthorization.status,
      amount: preAuthorization.amount
    });
  } catch (error) {
    next(error);
  }
});
