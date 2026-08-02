// The orphan-export RATCHET (push tier) — the export-rot lens turned into a standing verdict.
//
// WHY IT EXISTS. `pnpm ast orphans <pkg>` is the ONLY instrument that sees an export reached by nobody
// (prod or test) — and it is a lens a human has to remember to run. The 2026-08-03 export-rot sweep
// (docs/reviews/misc/2026-08-03-export-rot-dispositions.md) dispositioned 55 rows one by one; without a
// ratchet the next wave of rot accretes silently and the whole audit has to be re-run from zero. This
// stage pins the swept tree: the CURRENT orphan set is the checked-in baseline, and any NEW orphan (or a
// baseline row that is no longer one) is RED.
//
// WHY IT CANNOT LEAN ON KNIP (verified by probe, not assumed — dispositions doc, "Correction"). knip does
// NOT flag any of these exports: each package's `exports` map already makes the subpath public API in
// knip's eyes, so knip's `tags: ["-@public"]` exemption never even fires on them. Stripping `@public` off
// four rows across three package tiers and re-running `npx knip --cache` reported NONE of them. Therefore
// THIS stage reads the `@public <reason>` tag itself, off the declaration's leading comment ranges.
//
// THE EXEMPTIONS, both cited, both requiring a REASON:
//   • `/** @public <reason> */` on the declaration — the deliberate-orphan intent recorded AT the
//     declaration, where the next agent reads it. The reason is REQUIRED: a bare `@public` does NOT exempt
//     (the `isUnwiredExempt` discipline — a marker with no rationale is not a legal exemption).
//   • the `ui` PACKAGE, whole — R2 of docs/architecture/core/ui-package-design.md ("Expose the FULL native
//     part + prop surface … a seal may omit a part ONLY [with a stated reason]"): every `@orb/ui` export is
//     a sealed-surface handle that exists to be available, so "no consumer yet" is its designed state, not
//     rot. Tagging ~45 of them one by one would be ceremony with no reader.
//
// EVERY EXEMPTION HERE IS TWO-SIDED FROM BIRTH (owner requirement 2026-08-03; the house shape is
// `bus-coverage.ts`'s STALE arm and `dialog-via-composite.ts`'s stale-allowlist arm). A marker that only
// ever ADDS permission is how "mark it and it falls off forever" rot starts, so both exemptions ratchet
// DOWN as hard as they ratchet up:
//   • a BASELINE ROW whose export is no longer an unexempted orphan (consumed, tagged, renamed, deleted)
//     is RED — the baseline must shrink in the same commit that cleans the row up;
//   • a `@public`-tagged export that HAS PROD CONSUMERS is RED — the tag's whole claim is "no consumer yet,
//     deliberately"; once something imports it, the tag is a lie that would silently exempt the export from
//     the ratchet forever after (including when its consumer later departs and it becomes REAL rot).
//
// STAR-SUPPRESSED candidates are NOT judged here: reached only through an `export *` chain, they may have
// a namespace consumer the resolution lens cannot name. They are reported (per symbol, `pnpm ast orphans`)
// and counted, never ratcheted — a gate that reds on a maybe is a gate people delete.
//
// SCOPE / COST: whole-workspace, type-resolving (~30s) — a PUSH-tier stage, never the commit bar.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { buildLiveness, collectOrphanCandidates, isProdConsumed, ownExports } from "../codemods/ast.ts";
import { getWorkspace } from "../ts-workspace.ts";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

const BASELINE_REL = "scripts/verify/orphan-export-ratchet.baseline.json";
/** Every workspace package the ratchet judges. `ui` is absent BY LAW (ui-package-design.md R2) — see header. */
const RATCHETED_PACKAGES = ["kit", "contracts", "db", "server", "client"] as const;
/** The R2-sealed package, exempt as a whole; named here so the exemption is legible, not implicit. */
const SEALED_PACKAGE_REASON = "packages/ui — the R2 sealed surface (docs/architecture/core/ui-package-design.md R2): every export exists to be available";
// The `@public` marker plus the REST OF ITS LINE — the reason. Read per-line and stripped of the JSDoc
// terminator on purpose: a naive `/@public\s+\S/` is satisfied by the `*/` of a BARE `/** @public */`
// (space, then `*` — a non-space char), which silently turns the reason requirement off. Probe-caught.
const PUBLIC_TAG_RE = /@public(?<reason>[^\n]*)/u;
/** A test source file — never a prod export home (mirrors the lens's own rule). */
const TEST_FILE_RE = /\.(?:test|ct)\.tsx?$/u;
const JSDOC_TERMINATOR_RE = /\*\/\s*$/u;

const REMEDY =
  "CONSUME it (wire the consumer the export exists for) · TAG it `/** @public <reason> */` at the " +
  "declaration (the reason is REQUIRED and must name the live sibling / the unbuilt surface it belongs to) · " +
  "or DELETE it (declaration + every barrel re-export, in one commit). Do NOT add a baseline row for new " +
  "rot — the baseline is the swept tree, not a permission slip.";

type Baseline = { readonly entries: Readonly<Record<string, string>> };

/** The ratchet key: `<repo-rel file>::<export name>` — stable under line moves, unlike a file:line. */
function keyOf(file: string, name: string): string {
  return `${file}::${name}`;
}

function repoRel(root: string, absolute: string): string {
  return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : absolute;
}

/** The node a leading comment actually attaches to. A `VariableDeclaration` (the origin node the liveness
 *  keys on) is NOT the comment host — the JSDoc sits above the enclosing `VariableStatement`, so reading
 *  the declaration's own ranges finds nothing and every tagged `const` would look untagged (measured: 5 of
 *  the 7 first-run rows were tagged rows read at the wrong node). A type alias / class / function
 *  declaration IS its own statement and is returned unchanged. */
function commentHost(decl: Node): Node {
  return decl.getFirstAncestorByKind(SyntaxKind.VariableStatement) ?? decl;
}

/** Does this declaration carry `/** @public <reason> *\/` in a LEADING comment, WITH a reason? (the
 *  `isUnwiredExempt` discipline: a bare marker is not a legal exemption.) The reason must sit on the
 *  marker's own line — every one of the tree's 33 tags is written that way. */
function isPublicTagged(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => {
      const reason = PUBLIC_TAG_RE.exec(range.getText())?.groups?.["reason"];
      return reason !== undefined && reason.replace(JSDOC_TERMINATOR_RE, "").trim().length > 0;
    });
}

type Orphan = { readonly key: string; readonly file: string; readonly line: number; readonly name: string };
type Scan = { readonly orphans: readonly Orphan[]; readonly staleTags: readonly Orphan[] };

/** One position (an export at its declaration) in the report's vocabulary. */
function positionOf(root: string, name: string, decl: Node): Orphan {
  const sf = decl.getSourceFile();
  const file = repoRel(root, sf.getFilePath());
  return { key: keyOf(file, name), file, line: sf.getLineAndColumnAtPos(decl.getStart()).line, name };
}

/** ONE pass, TWO verdicts (the exemptions are two-sided — see the header):
 *   • `orphans` — orphan candidates that are NOT star-suppressed, NOT in the sealed `ui` package, and NOT
 *     `@public`-tagged with a reason: the set the baseline pins;
 *   • `staleTags` — exports that ARE `@public`-tagged and DO have a prod consumer: the tag's claim
 *     ("deliberately unconsumed") is false, so it must come off. */
function scanTree(root: string): Scan {
  const project = getWorkspace({ root, types: true });
  const live = buildLiveness(project);
  const prefixes = RATCHETED_PACKAGES.map((p) => `/packages/${p}/src/`);
  const inScope = (fp: string): boolean => prefixes.some((prefix) => fp.includes(prefix));
  const orphans: Orphan[] = [];
  for (const candidate of collectOrphanCandidates(project, live, inScope)) {
    if (!(candidate.starSuppressed || isPublicTagged(candidate.decl))) {
      orphans.push(positionOf(root, candidate.name, candidate.decl));
    }
  }
  const staleTags: Orphan[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (isPublicTagged(decl) && isProdConsumed(live, decl)) {
        staleTags.push(positionOf(root, name, decl));
      }
    }
  }
  const byKey = (a: Orphan, b: Orphan): number => a.key.localeCompare(b.key);
  return { orphans: orphans.sort(byKey), staleTags: staleTags.sort(byKey) };
}

function readBaseline(root: string): Baseline {
  const raw = JSON.parse(readFileSync(join(root, BASELINE_REL), "utf8")) as Partial<Baseline>;
  return { entries: raw.entries ?? {} };
}

/** Rewrite the baseline from the live tree (`--update`), keeping every existing reason and stamping a
 *  placeholder for a row that has none. Deliberately an EXPLICIT flag: the ratchet must never self-heal. */
function writeBaseline(root: string, orphans: readonly Orphan[], previous: Baseline): void {
  const entries: Record<string, string> = {};
  for (const orphan of orphans) {
    entries[orphan.key] = previous.entries[orphan.key] ?? "TODO: state why this export has no consumer (or clear it — see the stage header's remedy)";
  }
  const body = { note: SEALED_PACKAGE_REASON, entries };
  writeFileSync(join(root, BASELINE_REL), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function report(added: readonly Orphan[], stale: readonly string[], staleTags: readonly Orphan[]): void {
  for (const orphan of added) {
    process.stdout.write(`  ✗ ${orphan.file}:${orphan.line}  NEW orphan export \`${orphan.name}\` — reached by nobody (prod or test) and unused in its own file\n`);
  }
  for (const key of stale) {
    process.stdout.write(`  ✗ ${BASELINE_REL}  STALE row \`${key}\` — that export is no longer an unexempted orphan (consumed, tagged, or deleted): remove the row (ratchet down)\n`);
  }
  for (const tag of staleTags) {
    process.stdout.write(
      `  ✗ ${tag.file}:${tag.line}  STALE @public tag on \`${tag.name}\` — the export HAS prod consumers, so the tag's claim ("deliberately unconsumed") is false: delete the \`@public\` line (ratchet down; a lingering tag would exempt it from this stage forever, including after its consumer departs)\n`,
    );
  }
}

function main(): void {
  const root = join(import.meta.dirname, "..", "..");
  const update = process.argv.includes("--update");
  let scan: Scan;
  let baseline: Baseline;
  try {
    baseline = readBaseline(root);
    scan = scanTree(root);
  } catch (err) {
    // A lens/parse failure is a BROKEN CHECKER, never a verdict (exit-contract §3.3).
    process.stdout.write(`orphan-export-ratchet — TOOL ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(EXIT_TOOL_ERROR);
  }
  const { orphans, staleTags } = scan;
  if (update) {
    writeBaseline(root, orphans, baseline);
    process.stdout.write(`orphan-export-ratchet — baseline REWRITTEN from the live tree: ${orphans.length} row(s) in ${BASELINE_REL}\n`);
    process.exitCode = EXIT_CLEAN;
    return;
  }
  const live = new Set(orphans.map((o) => o.key));
  const added = orphans.filter((o) => !(o.key in baseline.entries));
  const stale = Object.keys(baseline.entries).filter((key) => !live.has(key));
  process.stdout.write(
    `orphan-export-ratchet — ${orphans.length} unexempted orphan export(s) across ${RATCHETED_PACKAGES.join("/")} vs ${Object.keys(baseline.entries).length} baselined; ${staleTags.length} stale @public tag(s)\n`,
  );
  if (added.length === 0 && stale.length === 0 && staleTags.length === 0) {
    process.stdout.write("  ✓ the orphan-export surface matches the baseline, and every @public tag still names an unconsumed export\n");
    process.exitCode = EXIT_CLEAN;
    return;
  }
  report(added, stale, staleTags);
  process.stdout.write(`\n  FIX: ${REMEDY}\n`);
  process.exit(EXIT_VIOLATIONS);
}

// Direct-run guard (the db-baseline-parity idiom): running the file spawns main(); an import gets nothing.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
