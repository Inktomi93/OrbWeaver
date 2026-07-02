// verb: testClaudeAuth — the max-pro-sub HEALTH CHECK (neo `models.testClaudeAuth`; Tier-4-Transport.md
// maps it to this domain). Two steps, both through injected seams:
//   1. resolve the `max-pro-sub` credential — THE authorization step: the D17 owner gate lives inside
//      `credentials.resolve` (its mint site); a non-owner principal rejects THERE with the coded
//      forbidden error. Connection never re-checks it (connection.md §7.1: "the max-pro-sub owner gate
//      lives in credentials").
//   2. run the tiny SDK verify turn via the injected `verifyClaudeAuth` diagnostic (infra/providers'
//      agent-sdk `verifyAuth` — the SAME credential firewall a real turn uses).
// The probe model is the CHEAPEST curated tier (neo parity: "defaults to the cheapest tier") — the haiku
// entry of the connection-internal shortlist, resolved from the catalog subsystem, never a magic string.

import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { TestClaudeAuthParams } from "../contract/params";
import type { ConnectionContext, ConnectionService } from "../contract/service";
import { cheapestChatModelId } from "../substrate/probe-model";

export function createTestClaudeAuth(ctx: ConnectionContext): ConnectionService["testClaudeAuth"] {
  return async ({ principal }: TestClaudeAuthParams): Promise<VerifyAuthResult> => {
    // Owner gate (D17) runs inside credentials' max-pro-sub mint — rejects for a non-owner.
    const credential = await ctx.resolveCredential({ principal, source: "max-pro-sub" });
    return await ctx.verifyClaudeAuth({ credential, model: cheapestChatModelId() });
  };
}
