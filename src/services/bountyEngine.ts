import type { BountyType, Subscription } from "@prisma/client";
import { db } from "../db.js";

type BountyRuleInput = {
  userId: string;
  subscription: Subscription;
};

function shouldTriggerShieldFee(subscription: Subscription, now: Date): boolean {
  if (subscription.source !== "FREE_TRIAL" || !subscription.trialExpiresAt) {
    return false;
  }

  const msUntilTrialExpiry = subscription.trialExpiresAt.getTime() - now.getTime();
  const hoursUntilTrialExpiry = msUntilTrialExpiry / (1000 * 60 * 60);
  return hoursUntilTrialExpiry <= 24;
}

export async function applyBountyRulesOnSlain(input: BountyRuleInput) {
  const { subscription, userId } = input;
  const now = new Date();

  let rewardUsd = 0;
  let type: BountyType | null = null;
  let title = "";
  let description = "";

  if (subscription.source === "ACTIVE_REQUEST") {
    rewardUsd = 3;
    type = "BOUNTY";
    title = "Slain subscription bounty";
    description = "Subscription canceled from an active user request.";
  } else if (shouldTriggerShieldFee(subscription, now)) {
    rewardUsd = 2;
    type = "SHIELD";
    title = "Free-trial shield fee";
    description = "Trial canceled within 24 hours of expiry.";
  }

  if (!type) {
    return null;
  }

  const existing = await db.bounty.findFirst({
    where: {
      userId,
      subscriptionId: subscription.id,
      type,
      status: { in: ["OPEN", "IN_PROGRESS", "CLAIMED", "PAID"] }
    }
  });

  if (existing) {
    return existing;
  }

  return db.bounty.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      title,
      description,
      type,
      rewardUsd
    }
  });
}
