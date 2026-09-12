// The ONE answer to "is this member read taken off the real `process`?" — the family reader shared by
// `tooling-argv-front-door` (the reviewed argv-reader policy) and `tooling-argv-front-door-health` (the
// blindness tripwire that counts cli.ts readers), so what counts as a read of the operator's argv is one
// predicate in two policies.
//
// IDENTITY, NOT SPELLING. The legacy gate compared the receiver's text to `process`, which a local object
// named `process` false-reds and a re-bound one walks past. The subject is a member of the REAL `process`:
// either the AMBIENT global or the DEFAULT export of the `node:process` module, which is how every live
// reader on this tree spells it (`import process from "node:process"`). Both doors resolve through the
// shared origin readers; a member of a provably different declaration is not a subject; a receiver the
// readers cannot place at all — a written or cyclic binding still HOLDS the identity — answers `unreadable`,
// which the consuming policy reports rather than passes (#944's third answer).
//
// THIS IS `sole-env-reader.ts#readsProcessEnv` GENERALIZED over the member name. That module keeps its own
// copy today because it sits outside the lane that minted this reader (#1950); it is the recorded MERGE
// CANDIDATE — two spellings of one concept — and re-homing it here is the follow-up, per guide §8.3.
//
// A pure reader over one delivered node: no walk, no Project, no filesystem, no cache.
import type { Node as MorphNode } from "ts-morph";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { readMemberReference, resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "./reference-fact.ts";
import { originModuleSpecifier } from "./sealed-origin.ts";

export const PROCESS_GLOBAL = "process";
/** The two authored spellings of node's own process door; the canonical origin reports the one it entered. */
const PROCESS_DOORS: readonly string[] = ["node:process", "process"];

export type ProcessMemberVerdict = "reads" | "other" | "unreadable";

/** Judge one member-access node (dotted, optional or computed-literal): is it `process.<member>` off the real
 *  `process`? A node that is not a member read of that NAME answers `other` before any identity work — the
 *  name is the prefilter that keeps fail-closure honest. */
export function classifyProcessMemberRead(node: MorphNode, member: string): ProcessMemberVerdict {
  const read = readMemberReference(node);
  if (read.kind === "unresolved" || read.value.name !== member) {
    return "other";
  }
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    const path = global.value.memberPath;
    return global.value.globalName === PROCESS_GLOBAL && path.length === 1 && path[0] === member ? "reads" : "other";
  }
  const module = resolveModuleMemberOrigin(node);
  if (module.kind === "resolved") {
    const path = module.value.memberPath;
    return PROCESS_DOORS.includes(originModuleSpecifier(module.value)) && path.length === 1 && path[0] === member ? "reads" : "other";
  }
  return classifyOriginRefusal(module.reason, node);
}
