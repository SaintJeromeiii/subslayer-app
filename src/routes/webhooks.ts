import { Router } from "express";
import type Stripe from "stripe";
import { db } from "../db.js";
import { constructStripeEvent } from "../services/stripe.js";

export const webhooksRouter = Router();

function extractBountyIdFromEvent(event: Stripe.Event): string | null {
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    return paymentIntent.metadata?.bountyId ?? null;
  }

  if (event.type === "charge.succeeded" || event.type === "charge.captured") {
    const charge = event.data.object as Stripe.Charge;
    return charge.metadata?.bountyId ?? null;
  }

  return null;
}

webhooksRouter.post("/stripe", async (req, res) => {
  try {
    const signature = req.header("stripe-signature");
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const event = constructStripeEvent(rawBody, signature);

    if (["payment_intent.succeeded", "charge.succeeded", "charge.captured"].includes(event.type)) {
      const bountyId = extractBountyIdFromEvent(event);
      if (bountyId) {
        await db.bounty.update({
          where: { id: bountyId },
          data: {
            status: "PAID",
            paidAt: new Date()
          }
        });
      }
    }

    return res.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return res.status(400).json({ error: message });
  }
});
