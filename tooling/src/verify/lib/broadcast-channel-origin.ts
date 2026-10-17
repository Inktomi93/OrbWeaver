// Ambient BroadcastChannel identity, including stable aliases and non-ambient receiver refusal.
import { resolveGlobalMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { BroadcastChannelVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal, referenceNamesExport } from "./origin-verdict.ts";
import { readsAmbientGlobalPath } from "./project-home-origin.ts";

export const SESSION_CHANNEL_HOME = "packages/client/src/lib/session-channel.ts";
const BROADCAST_CHANNEL = "BroadcastChannel";
/** The ambient roots a member spelling hangs the global off: `new globalThis.BroadcastChannel(…)` is the
 *  same construction as the bare one, and the legacy text check passed all three. Any OTHER receiver is a
 *  different object (an injected port, a namespace) and is `other`. */
const GLOBAL_RECEIVERS: ReadonlySet<string> = new Set(["globalThis", "self", "window"]);

// The verdict TYPE is homed in `contract/origin-verdict.ts` (#2058): an exported type alias in `lib/` is a
// `no-inline-types` finding, and this one had nothing lib-specific to say — it is `OriginVerdict<"constructs">`.

/** Judge one `NewExpression`. Anything that is not a `new` whose callee names the global answers `other`. */
export function classifyBroadcastChannelConstruction(node: MorphNode): BroadcastChannelVerdict {
  if (!Node.isNewExpression(node)) {
    return "other";
  }
  const callee = node.getExpression();
  if (!referenceNamesExport(callee, BROADCAST_CHANNEL)) {
    return "other";
  }
  if (Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)) {
    // A member spelling is the global only when its ROOT is an ambient receiver; off anything else the
    // member is a property of that object, not the api.
    return readsAmbientGlobalPath(callee, GLOBAL_RECEIVERS, [BROADCAST_CHANNEL]) ? "constructs" : "other";
  }
  const origin = resolveGlobalMemberOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee);
  }
  return origin.value.globalName === BROADCAST_CHANNEL && origin.value.memberPath.length === 0 ? "constructs" : "other";
}
