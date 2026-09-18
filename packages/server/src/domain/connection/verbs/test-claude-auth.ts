// verb: testClaudeAuth — the max-pro-sub HEALTH CHECK (neo `models.testClaudeAuth`; Tier-4-Transport.md
// maps it to this domain). Two steps, both through injected seams:
//   1. resolve the `max-pro-sub` credential — THE authorization step: the D17 owner gate lives inside
//      `credentials.resolve` (its mint site); a non-owner principal rejects THERE with the coded
//      forbidden error. Connection never re-checks it (the max-pro-sub owner gate lives in credentials).
//   2. run the tiny SDK verify turn via the injected `verifyClaudeAuth` diagnostic (infra/providers'
//      agent-sdk `verifyAuth` — the SAME credential firewall a real turn uses).
// The probe model is the CHEAPEST curated tier (neo parity: "defaults to the cheapest tier") — the haiku
// entry of the connection-internal shortlist, resolved from the catalog subsystem, never a magic string.

import type { HostClaudeAuthReport } from "@orb/contracts/providers";
import type { ConnectionContext } from "../context.ts";
import type { TestClaudeAuthParams } from "../contract/params.ts";
import type { ConnectionService } from "../contract/service.ts";
import { cheapestChatModelId } from "../substrate/probe-model.ts";

/** The two deployment states that have no probe to run (`foundation/env/host-claude.ts` decides which). */
const REPORT_OFF: HostClaudeAuthReport = { state: "off" };
const REPORT_NOT_SET_UP: HostClaudeAuthReport = { state: "not-set-up" };

export function createTestClaudeAuth(ctx: ConnectionContext): ConnectionService["testClaudeAuth"] {
  return async ({ principal }: TestClaudeAuthParams): Promise<HostClaudeAuthReport> => {
    // Owner gate (D17) runs inside credentials' max-pro-sub mint — rejects for a non-owner. It stays FIRST:
    // the deployment states below are facts about this box, and a non-owner is refused before learning any.
    const credential = await ctx.resolveCredential({ principal, source: "max-pro-sub" });
    // No backend, no probe. Reporting `ok:false` here would tell the owner their subscription was REJECTED
    // when nothing was ever asked — and asking is precisely what forks the bundled runtime that this state
    // exists to keep unforked (2026-09-18).
    if (!ctx.hostClaudeAvailable) {
      return ctx.claudeBackendPosture === "off" ? REPORT_OFF : REPORT_NOT_SET_UP;
    }
    const verify = await ctx.verifyClaudeAuth({ credential, model: cheapestChatModelId() });
    return { state: "ready", verify };
  };
}
