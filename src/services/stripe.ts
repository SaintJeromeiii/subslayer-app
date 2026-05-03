import Stripe from "stripe";
import { env } from "../config/env.js";

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export function constructStripeEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.");
  }
  const client = getStripe();
  return client.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

export async function ensureStripeCustomer(email: string, existingCustomerId?: string): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const client = getStripe();
  const customer = await client.customers.create({ email });
  return customer.id;
}

export async function preAuthorizeOnboardingCharge(customerId: string, paymentMethodId: string) {
  const client = getStripe();
  return client.paymentIntents.create({
    amount: 1000,
    currency: "usd",
    customer: customerId,
    payment_method: paymentMethodId,
    capture_method: "manual",
    confirm: true,
    description: "SubSlayer onboarding pre-authorization hold"
  });
}
