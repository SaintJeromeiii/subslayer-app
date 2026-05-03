import OpenAI from "openai";
import { env } from "../config/env.js";

type MerchantId = "netflix" | "disney_plus" | "spotify" | "new_york_times" | "generic";
type HardshipType = "FINANCIAL_HARDSHIP" | "TECHNICAL_DISSATISFACTION";

export type CancellationEmailInput = {
  merchant: MerchantId;
  userDisplayName: string;
  accountEmail: string;
  reason?: string;
};

export type HardshipLetterInput = {
  merchant: MerchantId;
  userDisplayName: string;
  accountEmail: string;
  hardshipType: HardshipType;
  tosExcerpt?: string;
};

const merchantTosHints: Record<MerchantId, string> = {
  netflix: "Focus on immediate cancellation, no-proration expectations, and confirmation email request.",
  disney_plus: "Include cancellation effective-date ask and request non-renewal confirmation.",
  spotify: "Ask for premium termination at next billing boundary and data-retention clarification.",
  new_york_times: "Request subscription stop date, renewal halt, and written cancellation proof.",
  generic: "Request immediate cancellation with written confirmation and no further recurring charges."
};

function fallbackCancellationEmail(input: CancellationEmailInput): string {
  return [
    `Subject: Cancellation Request - ${input.accountEmail}`,
    "",
    `Hello ${input.merchant},`,
    "",
    `I am requesting cancellation of my subscription tied to ${input.accountEmail}.`,
    input.reason ? `Reason: ${input.reason}` : "Reason: I no longer need this service.",
    "Please confirm cancellation in writing and ensure no future renewals are billed.",
    "",
    `Thank you,`,
    input.userDisplayName
  ].join("\n");
}

function fallbackHardshipLetter(input: HardshipLetterInput): string {
  const hardshipLine =
    input.hardshipType === "FINANCIAL_HARDSHIP"
      ? "I am currently experiencing financial hardship and cannot maintain this recurring charge."
      : "I have experienced repeated technical issues that make the service unusable for my needs.";

  return [
    `Subject: Request for Early Cancellation Consideration - ${input.accountEmail}`,
    "",
    `To ${input.merchant} Support,`,
    "",
    hardshipLine,
    "I am requesting an exception or immediate cancellation due to this circumstance.",
    input.tosExcerpt ? `Relevant policy context: ${input.tosExcerpt}` : "",
    "Please confirm the final billing date and account status in writing.",
    "",
    `Sincerely,`,
    input.userDisplayName
  ]
    .filter(Boolean)
    .join("\n");
}

async function callLlm(prompt: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: prompt
  });
  return response.output_text || null;
}

export async function generateCancellationRequestEmail(input: CancellationEmailInput): Promise<string> {
  const prompt = [
    "Write a concise professional cancellation request email.",
    "Return only the final email body with a subject line on first line.",
    `Merchant: ${input.merchant}`,
    `User display name: ${input.userDisplayName}`,
    `Account email: ${input.accountEmail}`,
    `Reason: ${input.reason ?? "No longer needed"}`,
    `Policy guidance: ${merchantTosHints[input.merchant]}`
  ].join("\n");

  const llmOutput = await callLlm(prompt);
  return llmOutput ?? fallbackCancellationEmail(input);
}

export async function generateHardshipLetter(input: HardshipLetterInput): Promise<string> {
  const prompt = [
    "Write a firm but respectful hardship-based cancellation appeal letter.",
    "Return only the final letter text with a subject line.",
    `Merchant: ${input.merchant}`,
    `User display name: ${input.userDisplayName}`,
    `Account email: ${input.accountEmail}`,
    `Hardship type: ${input.hardshipType}`,
    `Merchant TOS hint: ${merchantTosHints[input.merchant]}`,
    `Specific TOS excerpt: ${input.tosExcerpt ?? "None provided"}`
  ].join("\n");

  const llmOutput = await callLlm(prompt);
  return llmOutput ?? fallbackHardshipLetter(input);
}
