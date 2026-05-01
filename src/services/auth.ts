import { env } from "../config/env.js";

export type AuthContext = {
  externalAuthId: string;
  email: string;
  provider: "clerk" | "firebase";
};

export async function verifyAuthHeader(authorization?: string): Promise<AuthContext> {
  if (!authorization) {
    throw new Error("Missing Authorization header");
  }

  // Stub integration point:
  // - Clerk: verify JWT with CLERK_SECRET_KEY or Clerk SDK.
  // - Firebase Auth: verify ID token with Firebase Admin SDK.
  // This placeholder keeps the contract stable while integrations are wired.
  const token = authorization.replace("Bearer ", "");
  if (!token) {
    throw new Error("Invalid bearer token");
  }

  return {
    externalAuthId: `stub-${token.slice(0, 12)}`,
    email: "user@example.com",
    provider: env.AUTH_PROVIDER
  };
}
