import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env.js";

const PREFIX = "enc:v1:";
const SALT = "subslayer-token-vault-salt";

function getKey(): Buffer {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set. Generate a 32-byte key (base64) and add it to your environment.");
  }
  const keyMaterial = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
  if (keyMaterial.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes (AES-256).");
  }
  return scryptSync(keyMaterial, SALT, 32);
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  if (!payload.startsWith(PREFIX)) {
    return payload;
  }
  const raw = payload.slice(PREFIX.length);
  const [ivB64, cipherB64, tagB64] = raw.split(":");
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
