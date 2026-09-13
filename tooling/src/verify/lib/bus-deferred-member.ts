// The SHARED REGISTRY for the `bus-fact` family's owner-deferral question (owner ruling 2026-09-12,
// #2096 / §12.3): which bus members are owner-deferred, keyed by `(union, member)`.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `user-bus-deferred-member` reds when a deferred member GAINS a
// producer; `bus-producer-coverage` EXCLUDES that same member from its coverage denominator. One list, two
// opposite uses — the exact shape that must not be copied. `bus-producer-coverage` used to reach it by
// importing the `user-bus-deferred-member` gate module directly, which the owner banned on 2026-09-12:
// **a gate module NEVER imports another gate module; a shared predicate moves to `lib/<family>.ts`.**
// `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// WHY NOT `lib/bus-fact.ts`, THE FAMILY'S OTHER SHARED MODULE. That module MINTS `busProducerFact` — a
// shared FACT many policies declare and the runtime resolves once per invocation. This is policy DATA: a
// two-row exemption registry with an end condition. Folding an exemption table into the module that mints a
// corpus-wide fact would make every fact consumer a transitive reader of one family's carve-outs, and the
// fact's own population would start looking like it had something to do with deferrals. Family is the unit
// for a SHARED READER; the fact provider is a different kind of thing living at a different address.
//
// THE ATOMIC-DELETION PROPERTY SURVIVES THE MOVE — MEASURED, NOT REASONED, AND ONE ARM MOVED.
//
// The registry's old home claimed deleting `user-bus-deferred-member.ts` when #1822 lands is atomic,
// because the sibling imported the list FROM it and `tsc` refused any half of that removal. That is a claim
// about COMPILER BEHAVIOUR, and the shape underneath it changed, so it was re-driven rather than re-stated
// (the #2153/#2103 class: an inherited property restated in a new arrangement without re-measuring).
// Three arms, each deleting and running `pnpm typecheck --config tsconfig.json`, 2026-09-12:
//
//   1. DELETE THE GATE MODULE ALONE      → RED, but ONLY from `tests/tooling/verify/gates/bus-pair.test.ts`
//                                          (it imports the `gate`). `bus-producer-coverage` is CLEAN — it
//                                          reads this module now, not that one.
//   2. DELETE THIS MODULE ALONE          → RED from THREE sites: the family test, `bus-producer-coverage:59`
//                                          and `user-bus-deferred-member:45`. Both policies are held.
//   3. DELETE BOTH (the real #1822 move) → RED from `bus-producer-coverage:59` until its exclusion goes too.
//
// So the ATOMICITY IS INTACT and its CONDITION moved from the gate module to this one: arms 2 and 3 both
// force `bus-producer-coverage` to be edited in the same change, which is the whole point. **What genuinely
// weakened is arm 1**: deleting the GATE alone used to red a sibling POLICY directly and now reds only a
// TEST, one layer further out. Recorded rather than trimmed, because a reader planning #1822 needs to know
// the gate-alone half-removal is caught by the family test and not by the compiler through a policy.
import type { BusDeclarationIdentity, BusMemberDeferral } from "../contract/bus-fact.ts";

/** The one canonical identity for the UserBus union whose owner-deferred member this family carries. */
export const USER_BUS_UNION: BusDeclarationIdentity = Object.freeze({
  path: "packages/contracts/src/user-bus/index.ts",
  exportName: "UserBusEvent",
});

/** The ONE home for "which bus members are owner-deferred", keyed by `(union, member)`. The union half is
 *  load-bearing since the coverage policy became generic over every belted bus — a bare member NAME would
 *  defer a same-named member of any other bus with it. */
export const BUS_MEMBER_DEFERRALS: readonly BusMemberDeferral[] = Object.freeze([{ union: USER_BUS_UNION, member: "connectionsChanged" }]);

/** The deferred members of ONE bus — the only way either policy is allowed to read the list, so the union
 *  half of the key cannot be dropped in one reader and honoured in the other.
 *
 *  `rows` is injectable because the union filter is otherwise UNREACHABLE: the live list holds exactly one
 *  row today, so a reader that ignored the union entirely would behave identically and no proof could tell
 *  the two apart (measured — an unfiltered mutant left every bus spec green). A proof plants a second bus's
 *  row and the filter becomes observable. */
export function deferralsFor(union: BusDeclarationIdentity, rows: readonly BusMemberDeferral[] = BUS_MEMBER_DEFERRALS): readonly string[] {
  return rows.filter((row) => row.union.path === union.path && row.union.exportName === union.exportName).map(({ member }) => member);
}
