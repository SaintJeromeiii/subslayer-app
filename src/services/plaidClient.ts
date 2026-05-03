import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { env } from "../config/env.js";

export function getPlaidClient(): PlaidApi {
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
