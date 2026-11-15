// domain/regex/substrate/ephemeral-scope — the one rule for what a script keeps when its passes change: depth and an
// author scope apply only on the display or prompt pass, so a body whose passes leave neither drops both. Owner
// ruling: a when-saved choice is the script's choice, so the move clears them rather than refusing it. Every verb
// that rewrites a stored body's passes runs it before the write schema, or a stranded scope stays stored and comes
// back live when the script returns to an ephemeral pass.

import type { RegexScriptBehavior } from "@orb/contracts/regex";
import { EPHEMERAL_REGEX_PASSES } from "@orb/kit/regex";

/** `behavior` without a depth or author scope its passes cannot apply, and whether it held one. */
export function settleEphemeralScope(behavior: RegexScriptBehavior): { readonly behavior: RegexScriptBehavior; readonly cleared: boolean } {
  if (behavior.passes.some((pass) => (EPHEMERAL_REGEX_PASSES as readonly string[]).includes(pass))) {
    return { behavior, cleared: false };
  }
  const { depth, authors, ...rest } = behavior;
  return { behavior: rest, cleared: depth !== undefined || authors !== undefined };
}
