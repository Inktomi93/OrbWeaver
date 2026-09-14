// The ONE answer to "is this member read taken off the real `process`?" — the family reader (family
// `process-member`) shared by `tooling-argv-front-door` (the reviewed argv-reader policy),
// `tooling-argv-front-door-health` (the blindness tripwire that counts cli.ts readers) and
// `tooling-process-exit-home` (the reviewed exit-home policy over the `exit` member), so what counts as a
// member read of the real process is one predicate in three policies.
//
// IDENTITY, NOT SPELLING. The legacy gate compared the receiver's text to `process`, which a local object
// named `process` false-reds and a re-bound one walks past. The subject is a member of the REAL `process`:
// either the AMBIENT global or the DEFAULT export of the `node:process` module, which is how every live
// reader on this tree spells it (`import process from "node:process"`). Both doors resolve through the
// shared origin readers; a member of a provably different declaration is not a subject; a receiver the
// readers cannot place at all — a written or cyclic binding still HOLDS the identity — answers `unreadable`,
// which the consuming policy reports rather than passes (#944's third answer).
//
// THE REFUSAL IS CLASSIFIED ON THE RECEIVER (#2058, fixed 2026-09-12). It was classified on the member
// READ, which is correct only for the dotted spelling: `classifyOriginRefusal`'s `leafIdentifier` takes a
// PropertyAccess's NAME node and passes anything else through unchanged, so an ElementAccess reached
// `Node.isIdentifier` as itself, failed, and took the fail-closed arm. Two real-tree errors in a
// reviewed-grant policy with no ordinary door — `snap/ops/run-report-index-assert.ts:97` (`value["argv"]`)
// and `verify/lib/ct-runner-lock.ts:69` (`(parsed as Record<string, unknown>)["argv"]`), both JSON bags
// unreachable from `process`. Same class as the #1950 D1 arm-F defect one family over: judging a member
// NAME where the law is about an IDENTITY. `mustPass[4]` on `tooling-argv-front-door` is the pin, red
// before this line and green after.
//
// THIS IS `sole-env-reader.ts#readsProcessEnv` GENERALIZED over the member name. That module keeps its own
// copy today because it sits outside the lane that minted this reader (#1950); it is the recorded MERGE
// CANDIDATE — two spellings of one concept — and re-homing it here is the follow-up, per guide §8.
//
// A pure reader over one delivered node: no walk, no Project, no filesystem, no cache.

import { readMemberReference, referenceResolutionServices, resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import type { ProcessMemberVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { originModuleSpecifier } from "./sealed-origin.ts";

export const PROCESS_GLOBAL = "process";
/** The two authored spellings of node's own process door; the canonical origin reports the one it entered. */
const PROCESS_DOORS: readonly string[] = ["node:process", "process"];

// The verdict TYPE is homed in `contract/origin-verdict.ts` (#2058): an exported type alias in `lib/` is a
// `no-inline-types` finding, and this one had nothing lib-specific to say — it is `OriginVerdict<"reads">`.

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
  // THE REFUSAL IS CLASSIFIED ON THE RECEIVER, NOT ON THE MEMBER READ (#2058). `classifyOriginRefusal`
  // asks `bindsProvenNonModuleDeclaration`, whose `leafIdentifier` takes a PropertyAccess's NAME node and
  // hands anything else straight through — so for `value["argv"]` it was handed the ElementAccess itself,
  // `Node.isIdentifier` said no, and a JSON bag became the fail-closed `unreadable`. Two real-tree errors,
  // in a reviewed-grant policy with no ordinary door: `run-report-index-assert.ts:97` and
  // `ct-runner-lock.ts:69`, neither of them reachable from `process`. The subject of this reader is the
  // RECEIVER's identity — the member NAME was already the prefilter at the top — so a receiver that
  // provably binds a parameter or a local is `other` in EITHER spelling. Fail-closure is untouched: the
  // ambiguous reasons (write/cycle/ambiguous) still short-circuit ahead of the binding test, which is what
  // keeps a re-bound `let process` on the UNREADABLE arm (`mustFlag[4]`), and an undeclared global still
  // binds no declaration at all (`mustFlag[3]`).
  return classifyOriginRefusal(module.reason, referenceResolutionServices.unwrapExpression(read.value.receiver));
}
