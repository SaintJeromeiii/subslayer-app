import type { DetectionSource } from "@prisma/client";
import { Configuration, PlaidApi, PlaidEnvironments, type TransactionsRecurringGetRequest } from "plaid";
import { env } from "../config/env.js";

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

function getPlaidClient(): PlaidApi {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
    throw new Error("Missing Plaid credentials. Set PLAID_CLIENT_ID and PLAID_SECRET.");
  }

  const environment = PlaidEnvironments[env.PLAID_ENV];
  const config = new Configuration({
    basePath: environment,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
        "PLAID-SECRET": env.PLAID_SECRET
      }
    }
  });

  return new PlaidApi(config);
}

export function isMicroSubscription(amountUsd: number): boolean {
  return amountUsd >= MICRO_SUBSCRIPTION_MIN && amountUsd <= MICRO_SUBSCRIPTION_MAX;
}

export function mapPlaidDetectionSource(): DetectionSource {
  return "PLAID_RECURRING";
}

export async function fetchRecurringCandidates(accessToken: string): Promise<RecurringTransactionCandidate[]> {
  const client = getPlaidClient();

  const request: TransactionsRecurringGetRequest = {
    access_token: accessToken
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
