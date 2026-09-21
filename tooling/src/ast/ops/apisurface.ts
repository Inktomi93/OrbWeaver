// apisurface: exports partitioned by package-boundary consumption.
import type { ImportDeclaration, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { ApiClass, ApiSurfaceEntry, Flags, Hit, Liveness } from "../contract/types.ts";
import { dynamicImportTargetOf } from "../lib/edges.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey, exposedNames } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { buildLiveness, dynamicImportMemberNames, isReferencedInOwnFile } from "../lib/liveness.ts";
import { resolveDynamicImportTarget } from "../lib/resolve.ts";
import { isTestPath, TEST_FILE_RE } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";
import { PACKAGES_PREFIX } from "./chains.ts";
import { collectOrphanCandidates } from "./orphans.ts";
import { byProdFirst, relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── apisurface: exports partitioned by PACKAGE-BOUNDARY consumption (PUBLIC / INTERNAL / UNUSED) ─────────
// The barrel-bloat class every liveness lens above is blind to. `orphans` is BINARY — any importer (prod or
// test) vs none — so an export imported all over its OWN package but by no other package reads exactly like a
// real cross-boundary API. The push-tier ratchet inherits that blindness: it can pin "reached by nobody", it
// cannot see "reached only from inside its own package", which is a barrel export that should be module-private.
// This verb asks the question the ratchet cannot: for each export, is it consumed ACROSS a workspace-package
// boundary (real public API), only WITHIN its own package (accidental public surface), or not at all (rot)?
//
// THE THREE CLASSES (plus one flagged arm of PUBLIC):
//   • PUBLIC — ≥1 PROD consumer in a DIFFERENT workspace package (or a script/tooling consumer outside
//     packages/). The real cross-boundary API. The consuming package(s) are printed. `(type-only)` is noted
//     when every cross-package consumer imported it as a TYPE (`import type` / `import { type X }`) — still
//     public API, but a shape not a runtime value.
//   • INTERNAL — consumed ONLY within its own package (an other-file import in the same package, or a use in
//     its own file). A candidate to un-export from the barrel / make module-private. A same-package consumer
//     is printed.
//   • UNUSED — reached by NOBODY, prod or test, and unused in its own file: the `orphans` set, re-surfaced
//     here with boundary context. Delegated to `collectOrphanCandidates` VERBATIM so the two lenses can never
//     disagree about what an orphan is (and star-suppressed candidates carry the same caveat orphans gives).
//   • TEST-ONLY — the `testonly` arm, flagged distinctly: no PROD consumer anywhere, but a test imports it.
//     Cross-boundary (tests live outside packages/ and import via `@orb/*`) but NOT prod API — never counted
//     as PUBLIC, so a PUBLIC count is a real prod-API count.
//
// WHY A DEDICATED PER-PACKAGE PASS, not `Liveness.consumers` (the declaration-granular edge map `chains`
// reads). Two reasons, both correctness: (1) that map only records an edge when the imported local binding is
// SPELLED in the importing file, so an imported-but-unused cross-package export shows ZERO consumer edges
// while `usedProd` (import-edge presence) says alive — which would desync the PUBLIC/INTERNAL split from the
// UNUSED split this verb takes from `orphans`; (2) it carries no type-only bit. So this pass mirrors
// `markImportConsumption`'s EXACT origin resolution (named specifiers through `getExportedDeclarations().get`,
// namespace + relative dynamic imports as whole-surface err-alive, and checker-resolved package-alias
// dynamic imports by their statically named members — the same arms `orphans` trusts) but buckets by the
// IMPORTING file's package instead of client/server/test, and records the type-only bit. It is the same
// parallel-arm shape the file already carries (`buildLiveness` vs `recordDeclarationEdges`).
//
// KEYED ON `declKey`, NEVER A NAME — same rule as every liveness lens: a renaming barrel hop resolves to the
// origin declaration through `getExportedDeclarations()`, so an alias cannot fork an export's identity.
//
// CANDIDATE lens, MANUAL tier — never a gate. The INTERNAL verdict is EVIDENCE for a policy call (un-export it),
// never proof: a same-package-only export may be a deliberate seam wired at a composition root, and a
// cross-package namespace consumer (`import * as ns`) promotes a whole module to PUBLIC exactly as `orphans`
// errs alive — VERIFY with `swallowed` before acting. The report this feeds drives an owner ruling, not a delete.
/** ONE workspace package's src prefix pattern — the seam that names the package a source file belongs to. */
const PKG_SRC_RE = /\/packages\/(?<pkg>[^/]+)\/src\//u;

/** The workspace package a source file belongs to (`server`, `contracts`, …), or undefined for a file outside
 *  any package src tree (a script, a package's own build config) — a "tooling" consumer. */
function packageOfSrcFile(fp: string): string | undefined {
  return PKG_SRC_RE.exec(fp)?.groups?.["pkg"];
}

/** The consumer label for a script/tooling file (outside any package src) — a real prod consumer that is not
 *  a workspace package, so it makes an export PUBLIC while naming that it is not a package boundary. */
const TOOLING_CONSUMER_LABEL = "scripts/tooling";

/** ONE origin's cross-workspace consumption, bucketed by the IMPORTING file's package. Built by mirroring
 *  `markImportConsumption`'s resolution — so an import EDGE is consumption, matching `usedProd` (and thus the
 *  UNUSED split taken from `orphans`), never the finer "was the binding spelled" question the edge map asks. */
interface ApiConsumption {
  /** consuming workspace package → the first prod import site (`file:line`) from it. May include the origin's own. */
  readonly prodPkgs: Map<string, string>;
  /** packages that consumed via at least one VALUE (non-`import type`) import — the type-only note's inverse. */
  readonly valuePkgs: Set<string>;
  /** first non-package, non-test prod consumer (a script / a package build config) — a tooling consumer. */
  toolingSite: string | undefined;
  /** first test-path consumer — the TEST-ONLY arm when no prod consumer exists. */
  testSite: string | undefined;
}

/** `<repo-rel file>:<line>` for a node's own start — the site form every hit prints. */
function nodeSite(node: Node): string {
  const sf = node.getSourceFile();
  return `${relPath(sf.getFilePath())}:${sf.getLineAndColumnAtPos(node.getStart()).line}`;
}

/** ONE consumer of an origin: the importing file, the import site, and whether the import was a VALUE (not
 *  type-only). Bundled so the record function stays inside the house 4-parameter budget. */
interface ApiConsumer {
  readonly fp: string;
  readonly site: string;
  readonly isValue: boolean;
}

/** Record that `consumer` reaches `originKey`. Buckets exactly as the liveness does: test path → testSite;
 *  a package src file → prodPkgs; anything else (scripts/config) → toolingSite. */
function recordApiConsumer(map: Map<string, ApiConsumption>, originKey: string, consumer: ApiConsumer): void {
  let rec = map.get(originKey);
  if (rec === undefined) {
    rec = { prodPkgs: new Map(), valuePkgs: new Set(), toolingSite: undefined, testSite: undefined };
    map.set(originKey, rec);
  }
  if (isTestPath(consumer.fp)) {
    rec.testSite ??= consumer.site;
    return;
  }
  const pkg = packageOfSrcFile(consumer.fp);
  if (pkg === undefined) {
    rec.toolingSite ??= consumer.site;
    return;
  }
  if (!rec.prodPkgs.has(pkg)) {
    rec.prodPkgs.set(pkg, consumer.site);
  }
  if (consumer.isValue) {
    rec.valuePkgs.add(pkg);
  }
}

/** ONE static import's per-package consumption: named specifiers + default resolve to origins (type-only bit
 *  per specifier / per `import type` clause); `import * as ns` marks the target's WHOLE surface (err alive,
 *  value unless `import type * as`). `export { X } from` is a re-export pass-through, never consumption —
 *  which is why only IMPORT declarations are walked, exactly as `markImportConsumption` does. */
function recordImportApiConsumption(imp: ImportDeclaration, consumerFp: string, map: Map<string, ApiConsumption>): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const site = nodeSite(imp);
  const typeOnlyImport = imp.isTypeOnly();
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    for (const key of exposedNames(target).keys()) {
      recordApiConsumer(map, key, { fp: consumerFp, site, isValue: !typeOnlyImport });
    }
    return;
  }
  const exported = target.getExportedDeclarations();
  for (const spec of imp.getNamedImports()) {
    const isValue = !(typeOnlyImport || spec.isTypeOnly());
    for (const decl of exported.get(spec.getName()) ?? []) {
      recordApiConsumer(map, declKey(decl), { fp: consumerFp, site, isValue });
    }
  }
  if (imp.getDefaultImport() !== undefined) {
    for (const decl of exported.get("default") ?? []) {
      recordApiConsumer(map, declKey(decl), { fp: consumerFp, site, isValue: !typeOnlyImport });
    }
  }
}

function recordWholeDynamicTarget(target: SourceFile, consumer: ApiConsumer, map: Map<string, ApiConsumption>): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const decl of decls) {
      recordApiConsumer(map, declKey(decl), consumer);
    }
  }
}

function recordNamedDynamicTarget(target: SourceFile, names: ReadonlySet<string>, consumer: ApiConsumer, map: Map<string, ApiConsumption>): void {
  for (const name of names) {
    for (const decl of target.getExportedDeclarations().get(name) ?? []) {
      recordApiConsumer(map, declKey(decl), consumer);
    }
  }
}

/** ONE file's dynamic `import()` targets. Relative imports retain the conservative whole-module verdict;
 *  package aliases credit only members named by a recognized static access shape. */
function recordDynamicApiConsumption(sf: SourceFile, project: SourceCorpus, consumerFp: string, map: Map<string, ApiConsumption>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const specifier = call.getArguments()[0];
    if (specifier === undefined || specifier.getKind() !== SyntaxKind.StringLiteral) {
      continue;
    }
    const target = dynamicImportTargetOf(call, sf, project);
    const site = `${relPath(consumerFp)}:${call.getStartLineNumber()}`;
    const consumer = { fp: consumerFp, site, isValue: true } as const;
    if (target !== undefined) {
      recordWholeDynamicTarget(target, consumer, map);
      continue;
    }
    const aliasedTarget = resolveDynamicImportTarget(call);
    if (aliasedTarget === undefined) {
      continue;
    }
    recordNamedDynamicTarget(aliasedTarget, dynamicImportMemberNames(call, sf), consumer, map);
  }
}

/** origin-key → per-package consumption, over the WHOLE workspace (imports + dynamic imports of every file). */
function buildApiConsumption(project: SourceCorpus, live: Liveness): Map<string, ApiConsumption> {
  const map = new Map<string, ApiConsumption>();
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    for (const imp of sf.getImportDeclarations()) {
      recordImportApiConsumption(imp, fp, map);
    }
    recordDynamicApiConsumption(sf, project, fp, map);
  }
  for (const fact of live.externalConsumptions) {
    recordApiConsumer(map, fact.targetKey, { fp: fact.consumerFile, site: fact.consumerSite, isValue: fact.kind === "value" });
  }
  return map;
}

/** The two workspace-wide maps `classifyApiExport` reads: the per-package consumption record, and the
 *  `orphans` set (its key → star-suppressed flag). Bundled so the classifier stays inside the 4-param budget. */
interface ApiScanCtx {
  readonly consumption: ReadonlyMap<string, ApiConsumption>;
  readonly orphanStar: ReadonlyMap<string, boolean>;
}

/** Classify ONE own-export. UNUSED is decided FIRST, off the `orphans` set (so the two lenses never disagree);
 *  otherwise the per-package consumption record splits PUBLIC (a cross-package/tooling prod consumer) from
 *  INTERNAL (own-package prod use or own-file use) from TEST-ONLY (only a test reaches it). `sf`/`ownPkg` are
 *  derived from the declaration, so the caller passes only the export and the scan context. */
function classifyApiExport(name: string, decl: Node, ctx: ApiScanCtx): ApiSurfaceEntry {
  const sf = decl.getSourceFile();
  const ownPkg = packageOfSrcFile(sf.getFilePath()) ?? "(no-package)";
  const key = declKey(decl);
  const base = { name, decl, ownPkg, consumers: [] as string[], evidence: "", typeOnly: false, starSuppressed: false };
  if (ctx.orphanStar.has(key)) {
    return { ...base, klass: "unused", evidence: "reached by nobody (prod or test)", starSuppressed: ctx.orphanStar.get(key) === true };
  }
  const rec = ctx.consumption.get(key);
  const crossPkgs = rec === undefined ? [] : [...rec.prodPkgs.keys()].filter((pkg) => pkg !== ownPkg).sort(byProdFirst);
  const tooling = rec?.toolingSite !== undefined;
  if (crossPkgs.length > 0 || tooling) {
    const consumers = tooling ? [...crossPkgs, TOOLING_CONSUMER_LABEL] : crossPkgs;
    const typeOnly = !tooling && crossPkgs.length > 0 && crossPkgs.every((pkg) => !(rec?.valuePkgs.has(pkg) ?? false));
    const evidence = rec?.prodPkgs.get(crossPkgs[0] ?? "") ?? rec?.toolingSite ?? "";
    return { ...base, klass: "public", consumers, evidence, typeOnly };
  }
  const ownPkgSite = rec?.prodPkgs.get(ownPkg);
  if (ownPkgSite !== undefined || isReferencedInOwnFile(sf, name, decl)) {
    return { ...base, klass: "internal", consumers: [ownPkg], evidence: ownPkgSite ?? `own-file use — ${nodeSite(decl)}` };
  }
  return { ...base, klass: "test-only", evidence: rec?.testSite ?? "a test import" };
}

/** Every own-export whose declaring file is `inScope` (non-test), classified by package-boundary consumption.
 *  Pure enumeration — no printing, no scope policy (the verb owns both) — so the self-test drives the exact
 *  function the CLI does. The UNUSED arm is `collectOrphanCandidates` verbatim; the rest is the per-package pass.
 *  `prebuilt` lets a caller that ALREADY built liveness (the push-tier ratchet, which also needs `isProdConsumed`
 *  for its stale arm) pass it in rather than pay a second whole-workspace liveness pass. */
export function collectApiSurface(project: SourceCorpus, inScope: (filePath: string) => boolean, prebuilt?: Liveness): ApiSurfaceEntry[] {
  const live = prebuilt ?? buildLiveness(project);
  const orphanStar = new Map(collectOrphanCandidates(project, live, inScope).map((candidate) => [declKey(candidate.decl), candidate.starSuppressed]));
  const ctx: ApiScanCtx = { consumption: buildApiConsumption(project, live), orphanStar };
  const out: ApiSurfaceEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      out.push(classifyApiExport(name, decl, ctx));
    }
  }
  return out;
}

/** The four classes in report order — actionable rot first, healthy PUBLIC last. */
const API_CLASS_ORDER: readonly ApiClass[] = ["unused", "internal", "test-only", "public"];

/** Summary-table column widths: the package-name column and each right-aligned count column (wide enough for
 *  the longest header, `INTERNAL`/`TESTONLY`). */
const API_PKG_COL = 12;

const API_COUNT_COL = 10;

/** The per-package count table — the deliverable a reader wants above the hit list: how many exports of each
 *  package are PUBLIC / INTERNAL / TEST-ONLY / UNUSED, so a ZERO is legible as clean rather than as blindness. */
function printApiSummary(entries: readonly ApiSurfaceEntry[], scannedFiles: number, label: string, flags: Flags): void {
  const byPkg = new Map<string, ApiSurfaceEntry[]>();
  for (const entry of entries) {
    byPkg.set(entry.ownPkg, [...(byPkg.get(entry.ownPkg) ?? []), entry]);
  }
  const cell = (s: string): string => s.padStart(API_COUNT_COL);
  narrate(flags, `apisurface ${label}: ${entries.length} own-export(s) across ${byPkg.size} package(s), scanned ${scannedFiles} source file(s)`);
  narrate(flags, `  ${"package".padEnd(API_PKG_COL)}${cell("PUBLIC")}${cell("INTERNAL")}${cell("TESTONLY")}${cell("UNUSED")}`);
  for (const [pkg, list] of [...byPkg.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = (klass: ApiClass): string => String(list.filter((entry) => entry.klass === klass).length);
    const unusedStar = list.filter((entry) => entry.klass === "unused" && entry.starSuppressed).length;
    const starNote = unusedStar === 0 ? "" : ` (${unusedStar} star-suppressed)`;
    narrate(flags, `  ${pkg.padEnd(API_PKG_COL)}${cell(n("public"))}${cell(n("internal"))}${cell(n("test-only"))}${cell(n("unused"))}${starNote}`);
  }
}

/** ONE classified export as a printable Hit — the class in the [kind], the deciding evidence in the text. */
function apiSurfaceHit(entry: ApiSurfaceEntry): Hit {
  const h = hitOf(entry.decl, `api-${entry.klass}`);
  const detail = ((): string => {
    if (entry.klass === "public") {
      return `PUBLIC — consumed by ${entry.consumers.join(", ")}${entry.typeOnly ? " (type-only)" : ""}  @ ${entry.evidence}`;
    }
    if (entry.klass === "internal") {
      return `INTERNAL to ${entry.ownPkg} (consumed only within its own package)  @ ${entry.evidence}`;
    }
    if (entry.klass === "test-only") {
      return `TEST-ONLY (no prod consumer; a test imports it — not prod API)  @ ${entry.evidence}`;
    }
    return `UNUSED (${entry.evidence})${entry.starSuppressed ? " [star-suppressed — may be reached via an export* namespace consumer]" : ""}`;
  })();
  h.text = `${entry.name}  —  ${detail}`;
  return h;
}

/** Exports partitioned by package-boundary consumption: PUBLIC (cross-package prod API) / INTERNAL (own-package
 *  only — barrel-bloat candidate) / TEST-ONLY (test-reached, not prod API) / UNUSED (the `orphans` set). Default
 *  emits the actionable arms (INTERNAL + TEST-ONLY + UNUSED); `--public` adds the PUBLIC rows. Optional scope
 *  (a package name / path); bare = every package. */
export function cmdApiSurface(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "apisurface");
  const files = scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] });
  const entries = collectApiSurface(project, corpusPredicate(files));
  // The summary's file count is the SCOPE's, not the whole project's — a scoped run used to print the
  // workspace total beside a package's exports, which reads as far more coverage than the run had.
  printApiSummary(entries, files.length, scope.label, flags);
  narrate(
    flags,
    "apisurface is a CANDIDATE lens — an INTERNAL verdict is EVIDENCE that an export could be made module-private, never proof (a same-package-only export may be a deliberate seam wired at a composition root). UNUSED is the `orphans` set verbatim; a namespace consumer (`import * as ns`) promotes a whole module to PUBLIC exactly as `orphans` errs alive — verify with `swallowed`. Default lists INTERNAL + TEST-ONLY + UNUSED (the actionable arms); pass `--public` to also list the cross-package PUBLIC rows.",
  );
  const shown = flags.public ? API_CLASS_ORDER : API_CLASS_ORDER.filter((klass) => klass !== "public");
  const hits = shown.flatMap((klass) => entries.filter((entry) => entry.klass === klass).map(apiSurfaceHit));
  emit(hits, flags, `apisurface ${scope.label}${flags.public ? "" : " (INTERNAL/TEST-ONLY/UNUSED — pass --public for PUBLIC)"}`);
}
