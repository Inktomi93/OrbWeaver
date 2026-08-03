// domain/tool-use/substrate/capability — declarative can() ceiling check: belt one (registry gate); the
// owning domain's verbs stay the authoritative gate underneath, belt two. can() throws
// DomainForbiddenError on deny — the caller (execute) catches and converts to errors-as-data.

import type { Can } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ToolCapability, ToolExecutionContext } from "../contract/params.ts";

/** null capability = the member floor — passes. A scope:"chat" ceiling with a null roster is a denial. */
export function checkToolCapability(capability: ToolCapability | null, exec: ToolExecutionContext, can: Can): void {
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
