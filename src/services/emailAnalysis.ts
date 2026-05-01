const KEYWORDS = ["receipt", "subscription", "trial", "invoice", "renewal"];

export type EmailHeaderSample = {
  from?: string;
  subject?: string;
  messageId: string;
  receivedAt?: Date;
};

export function matchSubscriptionKeywords(header: EmailHeaderSample): string[] {
  const haystack = `${header.from ?? ""} ${header.subject ?? ""}`.toLowerCase();
  return KEYWORDS.filter((keyword) => haystack.includes(keyword));
}

export function deriveConfidence(matchedKeywords: string[]): number {
  if (matchedKeywords.length === 0) {
    return 0;
  }
  return Math.min(0.99, 0.35 + matchedKeywords.length * 0.15);
}

export async function scanInboxHeaders(_providerAccessToken: string): Promise<EmailHeaderSample[]> {
  // Stub integration point:
  // - Gmail API users.messages.list + users.messages.get(format=metadata)
  // - Microsoft Graph /me/messages with $select=internetMessageHeaders,subject
  return [];
}
