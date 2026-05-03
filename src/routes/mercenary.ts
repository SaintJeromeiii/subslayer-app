import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { applyBountyRulesOnSlain } from "../services/bountyEngine.js";
import { getAgentLogHistory, pushAgentLog, subscribeToAgentLogs } from "../services/agentLogStream.js";
import { runCancellationAutomation } from "../services/cancelAutomation.js";
import { generateCancellationRequestEmail, generateHardshipLetter } from "../services/aiMercenary.js";
import { verifyAuthRequest } from "../services/auth.js";

export const mercenaryRouter = Router();

const cancellationEmailSchema = z.object({
  merchant: z.enum(["netflix", "disney_plus", "spotify", "new_york_times", "generic"]),
  userDisplayName: z.string().min(1),
  accountEmail: z.string().email(),
  reason: z.string().optional()
});

const hardshipSchema = z.object({
  merchant: z.enum(["netflix", "disney_plus", "spotify", "new_york_times", "generic"]),
  userDisplayName: z.string().min(1),
  accountEmail: z.string().email(),
  hardshipType: z.enum(["FINANCIAL_HARDSHIP", "TECHNICAL_DISSATISFACTION"]),
  tosExcerpt: z.string().optional()
});

const automationSchema = z.object({
  merchant: z.enum(["netflix", "disney_plus", "spotify", "new_york_times"]),
  username: z.string().min(1),
  password: z.string().min(1),
  dryRun: z.boolean().optional()
});

const slaySchema = z.object({
  merchant: z.enum(["netflix", "disney_plus", "spotify", "new_york_times"]),
  username: z.string().min(1),
  password: z.string().min(1),
  source: z.enum(["ACTIVE_REQUEST", "FREE_TRIAL", "AUTOMATED_DETECTION"]).default("ACTIVE_REQUEST"),
  trialExpiresAt: z.string().datetime().optional(),
  dryRun: z.boolean().optional()
});

mercenaryRouter.post("/generate-cancellation-email", async (req, res, next) => {
  try {
    const payload = cancellationEmailSchema.parse(req.body);
    const emailDraft = await generateCancellationRequestEmail(payload);
    res.json({ emailDraft });
  } catch (error) {
    next(error);
  }
});

mercenaryRouter.post("/generate-hardship-letter", async (req, res, next) => {
  try {
    const payload = hardshipSchema.parse(req.body);
    const letterDraft = await generateHardshipLetter(payload);
    res.json({ letterDraft });
  } catch (error) {
    next(error);
  }
});

mercenaryRouter.post("/automate-cancel", async (req, res, next) => {
  try {
    const payload = automationSchema.parse(req.body);
    const result = await runCancellationAutomation(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

mercenaryRouter.get("/logs", (_req, res) => {
  res.json({ logs: getAgentLogHistory() });
});

mercenaryRouter.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  getAgentLogHistory().slice(-25).forEach(send);
  const unsubscribe = subscribeToAgentLogs(send);

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

mercenaryRouter.post("/slay/:subscriptionId", async (req, res, next) => {
  try {
    const auth = await verifyAuthRequest(req);
    const payload = slaySchema.parse(req.body);
    const user = await db.user.findUnique({ where: { externalAuthId: auth.externalAuthId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await db.subscription.findFirst({
      where: { id: req.params.subscriptionId, userId: user.id }
    });
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const runId = `${subscription.id}-${Date.now()}`;
    pushAgentLog({ level: "info", message: `Starting slay run for ${subscription.merchantNormalizedName}.`, context: { runId } });

    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        state: "SLAYING",
        source: payload.source,
        trialExpiresAt: payload.trialExpiresAt ? new Date(payload.trialExpiresAt) : subscription.trialExpiresAt
      }
    });

    const automation = await runCancellationAutomation({
      merchant: payload.merchant,
      username: payload.username,
      password: payload.password,
      dryRun: payload.dryRun,
      runId,
      onLog: (message, level = "info") => {
        pushAgentLog({
          level,
          message,
          context: { runId, subscriptionId: subscription.id, merchant: payload.merchant }
        });
      }
    });

    const finalState = payload.dryRun ?? true ? "SLAYING" : "SLAIN";
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        state: finalState,
        status: finalState === "SLAIN" ? "CANCELED" : subscription.status,
        canceledAt: finalState === "SLAIN" ? new Date() : subscription.canceledAt
      }
    });

    let bounty = null;
    if (updated.state === "SLAIN") {
      bounty = await applyBountyRulesOnSlain({ userId: user.id, subscription: updated });
      pushAgentLog({
        level: "success",
        message: `Cancellation confirmed for ${updated.merchantNormalizedName}.`,
        context: { runId, bountyId: bounty?.id ?? null }
      });
    } else {
      pushAgentLog({
        level: "warn",
        message: `Dry run completed for ${updated.merchantNormalizedName}; no final cancellation submitted.`,
        context: { runId }
      });
    }

    res.json({ runId, automation, subscription: updated, bountyTriggered: bounty });
  } catch (error) {
    next(error);
  }
});
