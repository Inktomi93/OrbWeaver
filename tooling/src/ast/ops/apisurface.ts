// apisurface: exports partitioned by package-boundary consumption.
import type { Node } from "ts-morph";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { buildLiveness, isReferencedInOwnFile, livenessConsumerClass } from "../../floor/code-facts/liveness.ts";
import type { Liveness, LivenessConsumerClass } from "../../floor/code-facts/liveness-contract.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { ApiClass, ApiSurfaceEntry, Flags, Hit } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { TEST_FILE_RE } from "../lib/root.ts";
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
// The split reads the shared consumption facts (`Liveness.consumptions`), not the declaration edge map: an
// imported-but-unspelled export has no edge yet is alive, and only the facts carry the type-only bit.
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

/** ONE origin's cross-workspace consumption, bucketed by the consuming file's package. An import is
 *  consumption, matching `usedProd` and so the UNUSED split taken from `orphans`. */
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

/** ONE consumer of an origin: its consumer class, its package for application source, the site, and whether
 *  the import was a VALUE (not type-only). */
interface ApiConsumer {
  readonly consumer: LivenessConsumerClass;
  readonly pkg: string | undefined;
  readonly site: string;
  readonly isValue: boolean;
}

/** Record that `consumer` reaches `originKey`, bucketed by the liveness consumer class: a test → testSite;
 *  application source → prodPkgs; a tool, a script or a checked witness → toolingSite. */
function recordApiConsumer(map: Map<string, ApiConsumption>, originKey: string, consumer: ApiConsumer): void {
  let rec = map.get(originKey);
  if (rec === undefined) {
    rec = { prodPkgs: new Map(), valuePkgs: new Set(), toolingSite: undefined, testSite: undefined };
    map.set(originKey, rec);
  }
  if (consumer.consumer === "test") {
    rec.testSite ??= consumer.site;
    return;
  }
  const pkg = consumer.consumer === "tooling" || consumer.consumer === "scripts" ? undefined : consumer.pkg;
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

/** origin-key → per-package consumption, from the shared consumption facts plus checked external consumers. */
function buildApiConsumption(live: Liveness): Map<string, ApiConsumption> {
  const map = new Map<string, ApiConsumption>();
  for (const consumption of live.consumptions) {
    const fp = consumption.consumer.getFilePath();
    recordApiConsumer(map, consumption.originKey, {
      consumer: livenessConsumerClass(fp),
      pkg: packageOfSrcFile(fp),
      site: nodeSite(consumption.site),
      isValue: !consumption.typeOnly,
    });
  }
  for (const fact of live.legacyConsumptions) {
    recordApiConsumer(map, fact.originKey, { consumer: "test", pkg: undefined, site: `${relPath(fact.file)}:${String(fact.line)}`, isValue: true });
  }
  for (const fact of live.externalConsumptions) {
    recordApiConsumer(map, fact.targetKey, { consumer: fact.consumerClass, pkg: undefined, site: fact.consumerSite, isValue: fact.kind === "value" });
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
  if (ownPkgSite !== undefined || isReferencedInOwnFile(sf, decl)) {
    return { ...base, klass: "internal", consumers: [ownPkg], evidence: ownPkgSite ?? `own-file use — ${nodeSite(decl)}` };
  }
  return { ...base, klass: "test-only", evidence: rec?.testSite ?? "a test import" };
}

/** Every own-export whose declaring file is `inScope` (non-test), classified by package-boundary consumption.
 *  Pure enumeration — no printing, no scope policy (the verb owns both) — so the self-test drives the exact
 *  function the CLI does. The UNUSED arm is `collectOrphanCandidates` verbatim; the rest reads the shared
 *  consumption facts. `prebuilt` lets a caller that already built liveness skip a second whole-corpus pass. */
export function collectApiSurface(project: SourceCorpus, inScope: (filePath: string) => boolean, prebuilt?: Liveness): ApiSurfaceEntry[] {
  const live = prebuilt ?? buildLiveness(project);
  const orphanStar = new Map(collectOrphanCandidates(project, live, inScope).map((candidate) => [declKey(candidate.decl), candidate.starSuppressed]));
  const ctx: ApiScanCtx = { consumption: buildApiConsumption(live), orphanStar };
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
