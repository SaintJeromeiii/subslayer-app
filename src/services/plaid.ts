import type { DetectionSource } from "@prisma/client";
import type { TransactionsRecurringGetRequest } from "plaid";
import { decryptToken } from "./tokenVault.js";
import { getPlaidClient } from "./plaidClient.js";

export const MICRO_SUBSCRIPTION_MIN = 0.99;
export const MICRO_SUBSCRIPTION_MAX = 50;

export type RecurringTransactionCandidate = {
  merchantName: string;
  merchantId?: string;
  amountUsd: number;
  cadenceDays?: number;
  confidence: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export function isMicroSubscription(amountUsd: number): boolean {
  return amountUsd >= MICRO_SUBSCRIPTION_MIN && amountUsd <= MICRO_SUBSCRIPTION_MAX;
}

export function mapPlaidDetectionSource(): DetectionSource {
  return "PLAID_RECURRING";
}

function resolvePlaidAccessToken(accessToken: string): string {
  if (accessToken.startsWith("enc:v1:")) {
    return decryptToken(accessToken);
  }
  return accessToken;
}

export async function fetchRecurringCandidates(accessToken: string): Promise<RecurringTransactionCandidate[]> {
  const client = getPlaidClient();
  const resolvedAccessToken = resolvePlaidAccessToken(accessToken);

  const request: TransactionsRecurringGetRequest = {
    access_token: resolvedAccessToken
  };

  const recurring = await client.transactionsRecurringGet(request);
  const outflowStreams = recurring.data.outflow_streams ?? [];

  return outflowStreams
    .filter((stream) => stream.frequency === "MONTHLY")
    .map((stream) => ({
      merchantName: stream.merchant_name ?? stream.description,
      merchantId: stream.account_id,
      amountUsd: Number(stream.average_amount.amount ?? stream.last_amount.amount ?? 0),
      cadenceDays: 30,
      confidence: stream.status === "MATURE" ? 0.9 : 0.7,
      occurredAt: new Date(stream.last_date),
      payload: {
        streamId: stream.stream_id,
        category: stream.category,
        status: stream.status,
        predictedNextDate: stream.predicted_next_date,
        firstDate: stream.first_date,
        lastDate: stream.last_date,
        transactionIds: stream.transaction_ids
      }
    }))
    .filter((candidate) => isMicroSubscription(candidate.amountUsd));
}

export async function fetchRecurringMonthlyUnder50(accessToken: string): Promise<RecurringTransactionCandidate[]> {
  return fetchRecurringCandidates(accessToken);
}
