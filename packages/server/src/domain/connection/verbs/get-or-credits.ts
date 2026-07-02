// verb: getOrCredits — the caller's OpenRouter credit balance (neo `models.credits`; the account panel
// read). Two injected seams: resolve the caller's OWN `openrouter` credential (a missing/revoked key
// rejects in `credentials.resolve` with `DomainNoCredentialError` — the client-banner floor, never a
// fabricated zero balance), then read `/credits` through the providers diagnostic front door. Connection
// adds no reshaping — `AccountCredits` is the cross-boundary shape (@orb/contracts/providers).

import type { AccountCredits } from "@orb/contracts/providers";
import type { GetOrCreditsParams } from "../contract/params";
import type { ConnectionContext, ConnectionService } from "../contract/service";

export function createGetOrCredits(ctx: ConnectionContext): ConnectionService["getOrCredits"] {
  return async ({ principal, signal }: GetOrCreditsParams): Promise<AccountCredits> => {
    const credential = await ctx.resolveCredential({ principal, source: "openrouter" });
    return await ctx.accountCredits({ credential, signal });
  };
}
