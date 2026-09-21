// orphans + testonly — resolution-based rot over the liveness substrate.
import type { Node, SourceFile } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, Liveness, OrphanCandidate, TestOnlyClass } from "../contract/types.ts";
import { dedupe, emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { buildLiveness, isReferencedInOwnFile } from "../lib/liveness.ts";
import { TEST_FILE_RE } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** Every orphan candidate whose DECLARING file satisfies `inScope` — exports reached by nobody (prod or
 *  test) and unused in their own file. Pure enumeration: no printing, no exemption policy (the ratchet
 *  owns `@public`; the verb owns the display). */
export function collectOrphanCandidates(project: SourceCorpus, live: Liveness, inScope: (filePath: string) => boolean): OrphanCandidate[] {
  const out: OrphanCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const key = declKey(decl);
      if (live.usedProd.has(key) || live.usedTest.has(key) || isReferencedInOwnFile(sf, name, decl)) {
        continue;
      }
      out.push({ name, decl, starSuppressed: live.starTargets.has(fp) });
    }
  }
  return out;
}

/** Is this ORIGIN declaration reached by a prod (non-test) consumer? The keying lives here, never at a
 *  caller: the ratchet's stale-`@public` arm asks this question and must not re-derive `declKey`. */
export function isProdConsumed(live: Liveness, decl: Node): boolean {
  return live.usedProd.has(declKey(decl));
}

// The `@public` marker plus the REST OF ITS LINE — the reason. Read per-line and stripped of the JSDoc
// terminator on purpose: a naive `/@public\s+\S/` is satisfied by the `*/` of a BARE `/** @public */`
// (space, then `*` — a non-space char), which silently turns the reason requirement off. Probe-caught at the

export function candidateHit(candidate: OrphanCandidate, kind: string): Hit {
  const h = hitOf(candidate.decl, kind);
  h.text = `${candidate.name}  —  ${h.text}`;
  return h;
}

/** THE ONE BUCKET PRINTER — a set of candidates a lens deliberately does NOT count as hits, NAMED (file:line
 *  + symbol) rather than reduced to a number. Used by every "recognized, not a finding" arm in this file
 *  (orphans star-suppression, the typeonly union-source idiom, testonly's declared test seams) so the three
 *  cannot drift apart. `headline` is a function of the deduped count + file count, because both are decided
 *  here. Capped by `--max` with an explicit elision line — the count is always exact. */
export function printNamedBucket(rows: readonly Hit[], flags: Flags, headline: (count: number, files: number) => string): void {
  if (rows.length === 0) {
    return;
  }
  const unique = dedupe([...rows], flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  if (unique.length === 0) {
    return;
  }
  narrate(flags, headline(unique.length, new Set(unique.map((h) => h.file)).size));
  for (const h of unique.slice(0, flags.max)) {
    narrate(flags, `  ~ ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  if (unique.length > flags.max) {
    narrate(flags, `  … and ${unique.length - flags.max} more (raise --max)`);
  }
}

/** Name every star-suppressed candidate: the 14 hidden contracts/rpg candidates are the ones a reader must
 *  actually go look at, and "8 files" told them nothing. */
function printSuppressed(suppressed: readonly Hit[], hitCount: number, flags: Flags): void {
  printNamedBucket(
    suppressed,
    flags,
    (count, files) =>
      `orphans: ${count} of ${hitCount + count} candidate(s) SUPPRESSED by star re-exports in ${files} file(s) — named below, NOT counted as hits (a namespace consumer of the re-exporting barrel may reach them):`,
  );
}

/** Exports of a scope never imported anywhere (prod OR test) and never used in their own file — the rot
 *  signal. Star-suppressed candidates are counted + named PER SYMBOL, never silently swallowed (the
 *  permanent-zero `orphans contracts` bug: 100%-barrel packages reported clean while blind). */
export function cmdOrphans(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "orphans");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const live = buildLiveness(project);
  const candidates = collectOrphanCandidates(project, live, inScope);
  const hits = candidates.filter((c) => !c.starSuppressed).map((c) => candidateHit(c, "orphan-export"));
  const suppressed = candidates.filter((c) => c.starSuppressed).map((c) => candidateHit(c, "star-suppressed"));
  printSuppressed(suppressed, dedupe(hits, flags).length, flags);
  emit(hits, flags, `orphans ${scope.label}`);
}

/** THE DECLARED-INTENT PREFIX (lens calibration, owner ruling 2026-08-13). `__resetTagFilter` /
 *  `__readComposerDraftsForTest` is the repo's TEST-SEAM CONVENTION (the executor doctrine's "a test-only
 *  export is self-identifying" rule): the author already declared, in the NAME, that a test is the only
 *  legitimate consumer. Reporting one as "alive only because a test imports it" restates its own name back at
 *  the reader — 21 of the 31 client rows in the calibration corpus were exactly that. The prefix IS the
 *  marker, so this class needs no comment tag; a seam is bucketed and named, never counted as a hit. */
const TEST_SEAM_PREFIX = "__";

export function testOnlyClassOf(sf: SourceFile, name: string, decl: Node, live: Liveness): TestOnlyClass {
  const key = declKey(decl);
  // Prod-reached (named import, namespace, dynamic import, or same-file production use) → alive.
  if (live.usedProd.has(key) || isReferencedInOwnFile(sf, name, decl) || !live.usedTest.has(key)) {
    return "alive";
  }
  return name.startsWith(TEST_SEAM_PREFIX) ? "seam" : "hit";
}

export function scanTestOnly(sf: SourceFile, live: Liveness, want: TestOnlyClass): Hit[] {
  const out: Hit[] = [];
  for (const { name, decl } of ownExports(sf)) {
    if (testOnlyClassOf(sf, name, decl, live) !== want) {
      continue;
    }
    const h = hitOf(decl, want === "seam" ? "declared-test-seam" : "test-only-export");
    h.text = `${name}  —  ${h.text}`;
    out.push(h);
  }
  return out;
}

/** Exports of `<scope>` reached ONLY from test paths — code alive solely because a test imports it. Exports
 *  whose NAME declares the intent (`__`-prefixed test seams) are bucketed and named, never counted. */
export function cmdTestOnly(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = resolveScope(project, arg, "testonly");
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  const seams: Hit[] = [];
  for (const sf of files) {
    hits.push(...scanTestOnly(sf, live, "hit"));
    seams.push(...scanTestOnly(sf, live, "seam"));
  }
  printTestSeamBucket(seams, flags);
  emit(hits, flags, `testonly ${scope.label}`);
}

/** Name every DECLARED TEST SEAM — same posture as the `orphans` star-suppression block: the reader still
 *  gets the list, it just is not a finding. */
function printTestSeamBucket(seams: readonly Hit[], flags: Flags): void {
  printNamedBucket(
    seams,
    flags,
    (count) =>
      `testonly: ${count} export(s) BUCKETED as DECLARED test seams (a \`${TEST_SEAM_PREFIX}\`-prefixed name — the repo's self-identifying test-seam convention, so "only a test reaches it" is the stated intent, not a finding). Named below, NOT counted as hits:`,
  );
}
