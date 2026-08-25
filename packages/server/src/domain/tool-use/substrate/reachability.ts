// domain/tool-use/substrate/reachability — THE ONE "may this USER point at this tool by name" predicate.
//
// Two different questions get asked of this registry and conflating them is how a capability quietly widens:
//
//   • MAY IT RUN?  — asked at invocation, about a CALL the model emitted, answered by `substrate/capability.ts`
//     (the declarative `can()` ceiling) plus, for a contributor tool, the PL-C installer gate inside its own
//     `run` closure (`verbs/register-plugin-tool.ts`). That question always has an invocation in hand.
//   • MAY THIS USER NAME IT?  — asked BEFORE any invocation exists, about a user DIRECTLY driving a tool:
//     an automation `run_tool` arm the user authored, and the per-turn attach that puts a tool in front of
//     THEIR chat's model. This file answers only that one, and it is deliberately a separate, narrower gate:
//     the capability ceiling is about the acting principal, while this is about WHOSE CONTRIBUTOR it is.
//
// THE RULE, and why it is this strict (D146-c — names are namespaced by the host from an identity the
// contributor cannot forge, so the namespace is also the ownership answer): a user may direct-drive exactly
// the tools contributed by a plugin THEY installed. Not another user's plugin's tools — even in a room they
// share. The PL-C ceiling would let that through whenever the other user is a present member of the chat,
// because PL-C asks "may the INSTALLER read/write this room", never "did the CALLER's owner consent to this
// plugin running on their say-so". Consent to install is per-owner; a rule author who could name a room-mate's
// plugin tool would be spending that room-mate's grant, their credentials and their budget.
//
// FIRST-PARTY (`builtin`) TOOLS ARE NOT DIRECT-DRIVABLE, and that is a deliberate v1 narrowing rather than an
// oversight — the two receipts, so the next reader does not "fix" it:
//   • the rpg state tools are TURN-SCOPED registrants: they refuse off a turn already
//     (`domain/rpg/tools/index.ts` returns early when `exec.turnId === null`), so admitting them would buy an
//     act that can only ever fail — the exact rot class D146-d exists to prevent.
//   • imagery's builtin is the `generate_image` ACTION ARM's own act; admitting it would be two homes for one
//     concept, which the constitution merges rather than duplicates.
// Builtins reach a turn through their OWN domain's teaching contribution, which is the seam that owns them.
// THE SANCTIONED WIDENING DOOR IS THIS FILE: the day a first-party tool is genuinely drivable off-turn, it is
// one predicate here (plus the capability ceiling it already declares), not a new arm and not a new registry.

import type { UserId } from "@orb/kit/ids";
import type { RegisteredTool } from "../contract/results.ts";

/** May `userId` DIRECTLY drive `entry` — name it in a rule arm, or attach it to a turn they host?
 *
 *  Fail-CLOSED by shape: a `builtin` has `owner: null` and no user equals null, so the source check and the
 *  owner check are each independently sufficient. Both are written anyway — the source check states the
 *  first-party narrowing, the owner check states the per-installer partition, and a future third `ToolSource`
 *  must satisfy both to pass rather than inheriting an accident. */
export function isDirectDrivableBy(entry: RegisteredTool, userId: UserId): boolean {
  return entry.source === "plugin" && entry.owner === userId;
}
