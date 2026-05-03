import { env } from "../config/env.js";
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { db } from "../db.js";

export type AuthContext = {
  externalAuthId: string;
  email: string;
  provider: "clerk" | "firebase";
};

const SESSION_COOKIE = "subslayer_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, item) => {
    const [key, ...rest] = item.trim().split("=");
    acc[key] = decodeURIComponent(rest.join("=") ?? "");
    return acc;
  }, {});
}

function authFromBearerToken(token: string): AuthContext {
  return {
    externalAuthId: `stub-${token.slice(0, 12)}`,
    email: "user@example.com",
    provider: env.AUTH_PROVIDER
  };
}

export async function createSession(context: AuthContext): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const user = await db.user.findUnique({
    where: { externalAuthId: context.externalAuthId },
    select: { id: true }
  });
  if (!user) {
    throw new Error("Cannot create session for missing user.");
  }

  await db.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });

  return token;
}

export async function clearSession(token: string) {
  await db.session.deleteMany({ where: { token } });
}

export function getSessionTokenFromRequest(req: Pick<Request, "header">): string | null {
  const cookies = parseCookieHeader(req.header("cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function buildExternalAuthIdFromEmail(email: string): string {
  const hash = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 20);
  return `local-${hash}`;
}

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

  return authFromBearerToken(token);
}

export async function verifyAuthRequest(req: Pick<Request, "header">): Promise<AuthContext> {
  const authorization = req.header("authorization");
  if (authorization) {
    return verifyAuthHeader(authorization);
  }

  const sessionToken = getSessionTokenFromRequest(req);
  if (sessionToken) {
    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true }
    });
    if (session) {
      if (session.expiresAt.getTime() < Date.now()) {
        await db.session.delete({ where: { token: sessionToken } }).catch(() => {});
      } else {
        return {
          externalAuthId: session.user.externalAuthId,
          email: session.user.email,
          provider: session.user.authProvider === "CLERK" ? "clerk" : "firebase"
        };
      }
    }
  }

  throw new Error("Missing auth session. Please login.");
}
