// Demand-driven authored TEXT. The exposure of a door that already existed and was private:
// `ResourceInvocation.ordinaryWaiverCarriers` (`resource-host.ts`) has always handed the central waiver
// engine comment-aware text for an exact demanded path set. This is the same mechanism made declarable, for
// the policies whose subject IS prose — the citation registries, the doc corpus, the mirror texts.
//
// DEMAND-DRIVEN IS THE DESIGN, NOT AN OPTIMIZATION. An executable-config population is the whole authored
// transaction; reading every member of it costs seconds and answers nobody's question. So the door reads
// only what a policy names.
//
// IT IS PARASITIC BY CONSTRUCTION, AND THAT IS WHY IT DECLARES INTENT RATHER THAN POPULATION. The door
// serves a path only when that path was already acquired through some OTHER declared resource door
// (`status: "unacquired"` otherwise). It therefore owns no population of its own, and a
// `{ kind: "authored-text" }` declaration resolves to zero paths at planning time — which
// `resolveResourceDeclarations` would otherwise reject as an empty fact. The rule is named there rather
// than applied silently, and `policy-validation.ts` refuses a policy that declares `authored-text` without
// at least one path-bearing sibling, because such a policy can only ever receive refusals.
//
// THE PARTITION IS TOTAL over the demanded paths — one text or one refusal each, never neither. The private
// door predating this one dropped a path whose extension carried no waiver grammar, and that silent drop is
// exactly the shape that let a by-design symlink refusal reach the dispatcher as an unexplained absence
// (#1947). The public door keeps no such filter: format is REPORTED, never used to exclude.
import type { OrdinaryWaiverResourceFormat } from "./ordinary-waiver-source.ts";

export interface AuthoredTextFile {
  readonly path: string;
  readonly text: string;
  /** The path's comment grammar when it has one — the comment-aware half. `undefined` for a path whose
   *  extension carries no resource comment syntax; such a path is still SERVED, never dropped. */
  readonly format: OrdinaryWaiverResourceFormat | undefined;
}

/** `unacquired` is the host's own status: the path never came through a declared resource door. */
export interface AuthoredTextRefusal {
  readonly path: string;
  readonly status: "missing" | "empty" | "unresolved" | "malformed" | "unacquired";
  readonly reason: string;
}

export interface AuthoredTextCorpus {
  readonly files: readonly AuthoredTextFile[];
  readonly refusals: readonly AuthoredTextRefusal[];
}
