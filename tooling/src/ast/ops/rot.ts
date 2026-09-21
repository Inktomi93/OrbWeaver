// rot: the five rot collectors over ONE package, ONE load + ONE liveness build.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, Liveness } from "../contract/types.ts";
import { emit, narrate } from "../lib/emit.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { buildLiveness } from "../lib/liveness.ts";
import { TEST_FILE_RE } from "../lib/root.ts";
import { resolveScope } from "../lib/scope.ts";
import { chainHit, collectChainAudit, PACKAGE_SRC_RE } from "./chains.ts";
import { candidateHit, collectOrphanCandidates, scanTestOnly } from "./orphans.ts";
import { collectSwallowedCandidates, isSwallowedExempt, swallowedHit } from "./swallowed.ts";
import { collectTypeOnlyCandidates, isTypeOnlyExempt, typeOnlyHit } from "./typeonly.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── rot: the five rot collectors over ONE package, ONE project load + ONE liveness build ────────────
// Auditing a package with orphans + testonly + chains + typeonly-alive + swallowed today costs FIVE
// separate ~40s project loads — each verb bootstraps its own typed workspace. This composite runs the
// resolution ONCE and calls the EXACT collector function the standalone verb calls for every section —
// never a re-derived copy — so behavior parity with the individual verbs is structural, not promised in
// prose. `buildLiveness({ edges: true })` is built ONCE and shared by all five: the edge flag changes
// nothing about the liveness SETS (pinned by "ast liveness edge map (parallel + opt-in)" in the self-test),
// only whether the `chains`-only `consumers` map gets populated — so building it on is free for the other
// four. Each verb's OWN bucketed/stale-marker narration (star-suppression, declared test seams, the
// union-source bucket, `@…-ok:` staleness) is that verb's business and is deliberately NOT reproduced
// here — run the verb directly for that detail; `rot` exists to answer "which sections need a look".
export function rotOrphanHits(project: SourceCorpus, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectOrphanCandidates(project, live, inScope)
    .filter((c) => !c.starSuppressed)
    .map((c) => candidateHit(c, "orphan-export"));
}

export function rotTestOnlyHits(project: SourceCorpus, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (inScope(fp) && !TEST_FILE_RE.test(fp)) {
      hits.push(...scanTestOnly(sf, live, "hit"));
    }
  }
  return hits;
}

export function rotChainHits(project: SourceCorpus, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectChainAudit(project, live, inScope).candidates.map(chainHit);
}

export function rotTypeOnlyHits(project: SourceCorpus, inScope: (fp: string) => boolean): Hit[] {
  return collectTypeOnlyCandidates(project, inScope)
    .filter((c) => !(isTypeOnlyExempt(c.decl) || c.unionSource))
    .map((c) => typeOnlyHit(c));
}

export function rotSwallowedHits(project: SourceCorpus, live: Liveness, inScope: (fp: string) => boolean): Hit[] {
  return collectSwallowedCandidates(project, live, inScope)
    .filter((c) => !isSwallowedExempt(c.decl))
    .map(swallowedHit);
}

/** One package's five sections, printed and emitted in turn — `emit`'s per-call `noteMatches` accumulates
 *  into the ONE combined epilogue `finishRun` prints at the end of `main`, so five sectioned RESULT lines
 *  still resolve to one audited scan count. */
export function cmdRot(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "rot");
  const inScope = corpusPredicate(
    scanCorpus(project, {
      scope: scope.prefix,
      label: `path:${scope.prefix}`,
      skip: [SKIP_TEST_FILES, { reason: "out-of-scope", test: (fp) => !PACKAGE_SRC_RE.test(fp) }],
    }),
  );
  const live = buildLiveness(project, { edges: true });
  narrate(
    flags,
    `rot ${scope.label}: ONE project load + ONE liveness build, five CANDIDATE-lens sections below — orphans / testonly / chains / typeonly-alive / swallowed (each section calls the SAME collector its standalone verb calls; run \`pnpm ast <verb> ${scope.label}\` for that section's exemption-marker grammar and bucketed narration). Trades five ~40s loads for one.`,
  );
  const sections: readonly (readonly [string, Hit[]])[] = [
    ["orphans", rotOrphanHits(project, live, inScope)],
    ["testonly", rotTestOnlyHits(project, live, inScope)],
    ["chains", rotChainHits(project, live, inScope)],
    ["typeonly-alive", rotTypeOnlyHits(project, inScope)],
    ["swallowed", rotSwallowedHits(project, live, inScope)],
  ];
  for (const [name, hits] of sections) {
    emit(hits, flags, `rot ${scope.label} :: ${name}`);
  }
}
