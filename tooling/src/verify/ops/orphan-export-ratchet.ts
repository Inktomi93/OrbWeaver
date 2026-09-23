// The orphan-export RATCHET (push tier) — the export-rot lens turned into a standing verdict.
//
// WHY IT EXISTS. `pnpm ast orphans <pkg>` is the ONLY instrument that sees an export reached by nobody
// (prod or test) — and it is a lens a human has to remember to run. The 2026-08-03 export-rot sweep
// (2026-08-03) dispositioned 55 rows one by one; without a
// ratchet the next wave of rot accretes silently and the whole audit has to be re-run from zero. This
// stage pins the swept tree: the CURRENT orphan set is the checked-in baseline, and any NEW orphan (or a
// baseline row that is no longer one) is RED.
//
// WHY IT CANNOT LEAN ON KNIP (verified by probe twice, not assumed). (1) 2026-08-03: knip does NOT flag any
// of these exports — each package's `exports` map already makes the subpath public API in knip's eyes, so
// knip's `tags: ["-@public"]` exemption never even fires; stripping `@public` off four rows and re-running
// `npx knip --cache` reported NONE. (2) 2026-08-09 (the entry-exports pivot): flipping knip's
// `includeEntryExports` on to force it to judge the barrel surface was evaluated and REJECTED — it reports
// 146 "unused exports" in `contracts` alone (the entire INTERNAL same-package barrel surface, which is
// architecturally-normal composition, NOT rot), it STILL exempts every bare `@public` (re-opening the exact
// parking-permit vector), and its `tags` exemption is presence-only: it CANNOT verify the two-sided
// `@public-twin` claim (that the named value is cross-package PUBLIC) nor the stale transitions. knip is a
// reachability tool, not a policy engine. So THIS stage reads the `@public`-family markers itself and
// consults apisurface's PUBLIC/INTERNAL/UNUSED classification to adjudicate them.
//
// THE MARKER GRAMMAR (the 2026-08-09 two-marker split — the parking-permit close; grammar + rationale at the
// ONE home, tooling/src/ast/lib/public-markers.ts::publicMarkerOf). A bare `@public` ONLY ever lands on an UNUSED export
// (a consumed export is not an orphan candidate at all), so it was never certifying "cross-package API" — it
// certified "intended-but-unconsumed" behind a prose reason a barrels lane writes for genuine rot as easily
// as for a real future surface. The split forces the claim to name a target the gate can CHECK:
//   • `/** @public-twin: <ValueName> */` — the export is the type FACE of a value that IS cross-package
//     PUBLIC. Exempt from the orphan arm ONLY when apisurface classifies `<ValueName>` PUBLIC. A twin of an
//     INTERNAL (same-package-only) or UNUSED value is itself rot (an internal shape's type-face is not a
//     cross-boundary surface) → RED, remedy DELETE (the value schema/tuple stays).
//   • `/** @public-future: <named consumer/surface> */` — a deliberately-unconsumed export waiting for a
//     NAMED, not-yet-built consumer. Exempt from the orphan arm; the reason is REQUIRED (an unnamed marker
//     falls through to the bare arm and reds).
//   • a BARE `/** @public <reason> */` on an UNUSED export → RED — the parking permit. Remedy: migrate to a
//     named marker, or DELETE.
//   • the `ui` PACKAGE, whole — R2 of docs/law/ui-package-design.md: every `@orb/ui` export is
//     a sealed-surface handle that exists to be available, so "no consumer yet" is its designed state, not
//     rot. It is a named row in RATCHET_OPT_OUTS (below), never an omission.
//
// THE POPULATION IS OPT-OUT, NEVER OPT-IN (2026-09-20). It used to be a hand-kept opt-IN tuple
// (`kit/contracts/db/server/client`), which is a population that fails SILENTLY: `@orb/inference` landed with
// 113 source files entirely outside the ratchet and nothing announced it — an omission is indistinguishable
// from a decision. The roster is now DERIVED from the canonical workspace membership minus written
// exclusions, so a NEW package is judged the day it lands. See RATCHET_OPT_OUTS.
//
// EVERY EXEMPTION IS TWO-SIDED FROM BIRTH (owner requirement 2026-08-03; the house shape is
// `bus-coverage.ts`'s STALE arm). A marker that only ever ADDS permission is how "mark it and it falls off
// forever" rot starts, so the arms ratchet DOWN as hard as up:
//   • a BASELINE ROW whose export is no longer an unexempted orphan (consumed, marked, renamed, deleted)
//     is RED — the baseline must shrink in the same commit that cleans the row up;
//   • a `@public`-family marker on an export that HAS PROD CONSUMERS is RED (the `staleTags` arm) — the
//     claim "no consumer yet" is now false; a lingering marker would exempt it forever, including after its
//     consumer departs and it becomes REAL rot;
//   • a `@public-twin` whose named value is NO LONGER PUBLIC (dropped to INTERNAL, or deleted) is RED — the
//     twin's whole claim is "faces a cross-boundary value."
//
// STAR-SUPPRESSED candidates ARE judged here (the 2026-08-09 star arm; the report's "optional stronger arm").
// The historical skip feared "a namespace consumer of the re-exporting barrel we cannot name." But
// `buildLiveness` err-alives every namespace/dynamic import THROUGH `export *` chains
// (`markImportConsumption` → `exposedNames` resolves `getExportedDeclarations()`, which follows `export *`),
// so a candidate that SURVIVES to the orphan set is genuinely unreached even when its file is an `export *`
// target — apisurface confirmed the 5 refinery star-twins UNUSED under exactly that arm. Judging them closes
// the star blind spot the `@public-twin` markers now sit in.
//
// SCOPE / COST: whole-workspace, type-resolving (~30s; +apisurface's per-package consumption pass) — a
// PUSH-tier stage, never the commit bar.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { PackageName } from "@orb/tooling/_shared/project-worlds";
import { PACKAGE_NAMES } from "@orb/tooling/_shared/project-worlds";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { SourceCorpus } from "@orb/tooling/_shared/ts-workspace";
import { createSemanticWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { ApiSurfaceEntry } from "@orb/tooling/ast";
import { buildLiveness, collectApiSurface, isProdConsumed, isPublicTagged, ownExports, publicMarkerOf } from "@orb/tooling/ast";
import type { Node } from "ts-morph";

refuseDirectInvocation(import.meta.url, "pnpm check:orphan-ratchet");

/** The ledger's ONE home — exported so the debt walk (ops/debt.ts) enumerates the rows this ratchet
 *  admits instead of re-spelling the path (a rename would leave that walk silently reading nothing). */
export const BASELINE_REL = "tooling/src/verify/ops/orphan-export-ratchet.baseline.json";
/** The WHOLE-PACKAGE exemptions — the only way out of the ratchet, and each one carries its reason (header,
 *  "THE POPULATION IS OPT-OUT"). Two-sided like every other exemption here: the `PackageName` key type is a
 *  compile-time enforcer, so a row naming a package the workspace no longer has fails `tsc` instead of
 *  quietly exempting nothing. */
const RATCHET_OPT_OUTS = {
  ui: "the R2 sealed surface (docs/law/ui-package-design.md R2) — every `@orb/ui` export is a handle that exists to be AVAILABLE, so 'no consumer yet' is its designed state, not rot",
} as const satisfies Partial<Record<PackageName, string>>;

/** Every workspace package the ratchet judges — DERIVED from `PACKAGE_NAMES` (the canonical workspace
 *  membership, pinned to the native `packages/` inventory by tests/tooling/package-roster.test.ts), never
 *  hand-listed. A package added to the workspace is ratcheted on the day it lands. */
const RATCHETED_PACKAGES: readonly PackageName[] = PACKAGE_NAMES.filter((name) => !Object.hasOwn(RATCHET_OPT_OUTS, name));

/** The opt-outs rendered for the baseline's note, so the exemption is legible in the ledger, not implicit. */
const SEALED_PACKAGE_REASON = Object.entries(RATCHET_OPT_OUTS)
  .map(([name, reason]) => `packages/${name} — ${reason}`)
  .join(" · ");
// The `@public`-family READER (`publicMarkerOf`) + the PUBLIC/INTERNAL/UNUSED classifier (`collectApiSurface`)
// both live in tooling/src/ast (the @orb/tooling front door) beside the orphan substrate this stage shares, and are IMPORTED here —
// never re-spelled. `publicMarkerOf` is the same grammar the `chains` fixpoint reads to decide alive roots;
// two spellings would let the two disagree about what "deliberately unconsumed" means. Its footgun (a naive
// `/@public\s+\S/` is satisfied by the `*/` of a BARE `/** @public */`) is handled at that one home.
/** A test source file — never a prod export home (mirrors the lens's own rule). */
const TEST_FILE_RE = /\.(?:test|ct)\.tsx?$/u;

const REMEDY =
  "For an UNUSED export: CONSUME it (wire the consumer) · mark it `/** @public-twin: <ValueName> */` when it " +
  "is the type FACE of a value apisurface calls PUBLIC · mark it `/** @public-future: <named unbuilt consumer> */` " +
  "when a NAMED not-yet-built surface will import it · or DELETE it (declaration + every barrel re-export, one " +
  "commit). A bare `/** @public */` no longer exempts. Do NOT add a baseline row for new rot — the baseline is " +
  "the swept tree, not a permission slip.";

interface Baseline {
  readonly entries: Readonly<Record<string, string>>;
}

/** The ratchet key: `<repo-rel file>::<export name>` — stable under line moves, unlike a file:line. */
function keyOf(file: string, name: string): string {
  return `${file}::${name}`;
}

function repoRel(root: string, absolute: string): string {
  return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : absolute;
}

/** A flagged position: an export at its declaration, plus WHY it reds (the arm-specific remedy line). */
interface Orphan {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly why: string;
}
interface Scan {
  readonly orphans: readonly Orphan[];
  readonly staleTags: readonly Orphan[];
}

/** One position (an export at its declaration) in the report's vocabulary. */
function positionOf(root: string, name: string, decl: Node, why: string): Orphan {
  const sf = decl.getSourceFile();
  const file = repoRel(root, sf.getFilePath());
  return { key: keyOf(file, name), file, line: sf.getLineAndColumnAtPos(decl.getStart()).line, name, why };
}

const PLAIN_ORPHAN_WHY = "reached by nobody (prod or test) and unused in its own file";
const BARE_TAG_WHY =
  "bare `@public` on an UNUSED export — the parking-permit rot: migrate to `@public-twin: <PUBLIC value>` / `@public-future: <named consumer>`, or DELETE";
const STALE_TAG_WHY = "the export HAS prod consumers, so its @public-family marker claim (deliberately unconsumed) is now false";

/** Judge ONE UNUSED entry against its `@public`-family marker: `undefined` = legally exempt, else the flagged
 *  Orphan. twin → exempt ONLY when its named value is apisurface-PUBLIC (a twin of an INTERNAL/UNUSED value is
 *  itself rot); future → exempt (its reason names the unbuilt consumer); bare/absent → flagged. */
function judgeUnused(root: string, apiEntry: ApiSurfaceEntry, publicValues: ReadonlySet<string>): Orphan | undefined {
  const marker = publicMarkerOf(apiEntry.decl);
  if (marker?.kind === "twin") {
    if (publicValues.has(marker.value)) {
      return;
    }
    const why = `@public-twin names \`${marker.value}\`, which apisurface does NOT classify PUBLIC (INTERNAL/UNUSED/absent) — a twin of a non-cross-package value is rot: DELETE the alias (its schema/tuple value stays), or make that value real cross-package API`;
    return positionOf(root, apiEntry.name, apiEntry.decl, why);
  }
  if (marker?.kind === "future") {
    return;
  }
  return positionOf(root, apiEntry.name, apiEntry.decl, marker?.kind === "bare" ? BARE_TAG_WHY : PLAIN_ORPHAN_WHY);
}

/** The stale arm: exports carrying ANY `@public`-family marker that DO have a prod consumer — the claim
 *  "deliberately unconsumed" is false, so the marker must come off (a lingering marker would exempt it forever). */
function collectStaleTags(project: SourceCorpus, live: ReturnType<typeof buildLiveness>, root: string, inScope: (fp: string) => boolean): Orphan[] {
  const staleTags: Orphan[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (isPublicTagged(decl) && isProdConsumed(live, decl)) {
        staleTags.push(positionOf(root, name, decl, STALE_TAG_WHY));
      }
    }
  }
  return staleTags;
}

/** ONE pass, TWO verdicts (the exemptions are two-sided — see the header):
 *   • `orphans` — UNUSED exports (star-suppressed included) whose `@public`-family marker does NOT legally
 *     exempt them: a bare/absent marker (the parking permit / plain orphan), or a `@public-twin` whose named
 *     value apisurface does NOT classify PUBLIC. The set the baseline pins.
 *   • `staleTags` — exports that carry a `@public`-family marker and DO have a prod consumer. */
function scanTree(root: string): Scan {
  const project = createSemanticWorkspace({ root }).sourceCorpus();
  const live = buildLiveness(project);
  const prefixes = RATCHETED_PACKAGES.map((p) => `/packages/${p}/src/`);
  const inScope = (fp: string): boolean => prefixes.some((prefix) => fp.includes(prefix));
  // apisurface classifies every in-scope own-export PUBLIC / INTERNAL / TEST-ONLY / UNUSED. Its UNUSED arm IS
  // `collectOrphanCandidates` verbatim (so the orphan set never forks), and its PUBLIC arm is what a
  // `@public-twin` claim is verified against. Built once, sharing this stage's liveness.
  const entries = collectApiSurface(project, inScope, live);
  const publicValues = new Set(entries.filter((e) => e.klass === "public").map((e) => e.name));
  const orphans: Orphan[] = [];
  for (const apiEntry of entries) {
    if (apiEntry.klass !== "unused") {
      continue;
    }
    const flagged = judgeUnused(root, apiEntry, publicValues);
    if (flagged !== undefined) {
      orphans.push(flagged);
    }
  }
  const staleTags = collectStaleTags(project, live, root, inScope);
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
    process.stdout.write(`  ✗ ${orphan.file}:${orphan.line}  \`${orphan.name}\` — ${orphan.why}\n`);
  }
  for (const key of stale) {
    process.stdout.write(
      `  ✗ ${BASELINE_REL}  STALE row \`${key}\` — that export is no longer an unexempted orphan (consumed, marked, or deleted): remove the row (ratchet down)\n`,
    );
  }
  for (const tag of staleTags) {
    process.stdout.write(
      `  ✗ ${tag.file}:${tag.line}  STALE @public marker on \`${tag.name}\` — ${tag.why}: delete the marker line (ratchet down; a lingering marker would exempt it from this stage forever, including after its consumer departs)\n`,
    );
  }
}

/** The `orphan-ratchet` verb. ROOT arrives from the cli (the caller's cwd), never a depth-derived
 *  `import.meta.dirname` walk whose up-count silently changes at every move (playbook §9.1-4). */
export function runOrphanRatchet(root: string, argv: readonly string[]): number {
  // `--update` is the WHOLE grammar (#1117). A typo used to be dropped: `--updat` ran the CHECK and
  // reported drift, while the operator had asked to REWRITE the baseline — the two verdicts are opposite
  // and the run looks identical until you read the last line. Measured red-first on this tree: exit 1.
  const unknown = argv.find((token) => token !== "--update");
  if (unknown !== undefined) {
    throw new UsageError(`orphan-ratchet does not recognize ${JSON.stringify(unknown)} — usage: orphan-ratchet [--update]`);
  }
  const update = argv.includes("--update");
  let scan: Scan;
  let baseline: Baseline;
  // @orb-waive caught-failure-ownership(err): printed as TOOL ERROR and routed through EXIT.toolError, per the exit-contract §3.3 comment below. Ends if that exit code stops being surfaced.
  try {
    baseline = readBaseline(root);
    scan = scanTree(root);
  } catch (err) {
    // A lens/parse failure is a BROKEN CHECKER, never a verdict (exit-contract §3.3).
    process.stdout.write(`orphan-export-ratchet — TOOL ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT.toolError;
  }
  const { orphans, staleTags } = scan;
  if (update) {
    writeBaseline(root, orphans, baseline);
    process.stdout.write(`orphan-export-ratchet — baseline REWRITTEN from the live tree: ${orphans.length} row(s) in ${BASELINE_REL}\n`);
    return EXIT.clean;
  }
  const liveKeys = new Set(orphans.map((o) => o.key));
  const added = orphans.filter((o) => !(o.key in baseline.entries));
  const stale = Object.keys(baseline.entries).filter((key) => !liveKeys.has(key));
  process.stdout.write(
    `orphan-export-ratchet — ${orphans.length} unexempted orphan export(s) across ${RATCHETED_PACKAGES.join("/")} vs ${Object.keys(baseline.entries).length} baselined; ${staleTags.length} stale @public marker(s)\n`,
  );
  if (added.length === 0 && stale.length === 0 && staleTags.length === 0) {
    process.stdout.write("  ✓ the orphan-export surface matches the baseline, and every @public-family marker still names a live-checkable claim\n");
    return EXIT.clean;
  }
  report(added, stale, staleTags);
  process.stdout.write(`\n  FIX: ${REMEDY}\n`);
  return EXIT.violations;
}
