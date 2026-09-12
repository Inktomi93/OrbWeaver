// The ONE answer to "does this `new` construct the browser's BroadcastChannel?" — the family reader shared by
// `session-channel-boundary` (the occurrence policy) and `session-channel-boundary-health` (the home
// tripwire), so the two halves of one law cannot drift on what a construction IS.
//
// IDENTITY, NOT SPELLING. The legacy gate compared the callee's text to `BroadcastChannel`, which a local
// polyfill or test-double class of that name false-reds and an immutable alias (`const BC = BroadcastChannel`)
// walks past. The subject is the AMBIENT GLOBAL: the callee must NAME `BroadcastChannel` (the shared
// prefilter, which follows import and immutable const-alias hops — fail-closure's mandatory companion, or every
// `new TRPCError(…)` the reader cannot place becomes an accusation) AND resolve through the shared global
// reader to that global with an empty member path. A callee that provably binds a project declaration is a
// different class and answers `other`; one the readers cannot place at all — a written `let BroadcastChannel`
// binding that still might hold the api — answers `unreadable`, which the occurrence policy REPORTS rather
// than passes (#944's third answer).
//
// A pure reader over one delivered node: no walk, no Project, no filesystem, no cache.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { BroadcastChannelVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal, referenceNamesExport } from "./origin-verdict.ts";
import { readsAmbientGlobalPath } from "./project-home-origin.ts";
import { resolveGlobalMemberOrigin } from "./reference-fact.ts";

/** The ONE sanctioned home (staleness-and-session-freshness.md §4.3). Scanned, never subtracted: the
 *  occurrence policy skips it by exact path and the health policy proves it still constructs. */
export const SESSION_CHANNEL_HOME = "packages/client/src/lib/session-channel.ts";
/** The real-tree anchor (§4.5) the health tripwire self-guards on: the lib barrel, present on every real
 *  run and loaded by no fixture that must keep the tripwire silent. */
export const SESSION_CHANNEL_ANCHOR = "packages/client/src/lib/index.ts";
export const BROADCAST_CHANNEL = "BroadcastChannel";
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
