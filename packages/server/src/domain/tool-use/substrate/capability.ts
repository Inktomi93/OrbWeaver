// domain/tool-use/substrate/capability — the declarative can() ceiling check (tool-use-design/01 §5
// step 3; belt ONE — the registry gate; the owning domain's verbs stay the authoritative gates
// underneath, belt two). `can` THROWS `DomainForbiddenError` on deny — the CALLER (execute) catches
// and converts to errors-as-data: a denial is a policy fact the model should learn ("stop calling
// that"), not a turn-fatal event; the gate HELD either way.

import type { Can } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ToolCapability, ToolExecutionContext } from "../contract/params";

/** Check one entry's ceiling. `null` capability = the member floor — passes (the caller already
 *  proved this principal may run the turn at all). A `scope:"chat"` ceiling with a null roster is a
 *  DENIAL (a chat-scoped tool cannot execute outside a chat) — thrown here, data-ified by execute. */
export function checkToolCapability(
  capability: ToolCapability | null,
  exec: ToolExecutionContext,
  can: Can,
): void {
  if (capability === null) {
    return;
  }
  if (capability.scope === "global") {
    can(exec.principal, capability.action, { kind: "global" });
    return;
  }
  if (exec.roster === null) {
    throw new DomainForbiddenError("chat-scoped tool executed outside a chat (no roster)");
  }
  can(exec.principal, capability.action, { kind: "chat", roster: exec.roster });
}
