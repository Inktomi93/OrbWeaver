// Enforces intended roots, exact ambient distribution and native declaration-library boundaries across
// every authored TypeScript source; --json retains every source identity and observation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { isTypeWorldSource, predictedProgram, requiresExclusiveRoot, worldOf } from "@orb/tooling/_shared/project-worlds";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { ambientRootsForProgram, ambientScopeOf, programWorldOf } from "@orb/tooling/_shared/type-config-intent";
import { SyntaxKind } from "ts-morph";
import type { PolicyProgramMembership } from "../contract/policy-scope.ts";
import type { ClosureLeak, MembershipOutcome, MembershipReport, MembershipRow, RoutingParityViolation } from "../contract/tests-type-membership.ts";
import { MEMBERSHIP_ENFORCEMENT, MEMBERSHIP_OUTCOMES } from "../contract/tests-type-membership.ts";
import { withApplicationPrograms } from "../lib/application-programs.ts";
import { forEachCommentRange, parseScratch } from "../lib/comment-spans.ts";
import { readAvailablePolicyPrograms } from "../lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";
import { nativeProgramRoots, programClosures } from "../lib/tests-type-native.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:type-ownership");

// The shared compiler graph includes declaration projects and reference-only solutions; abstract templates
// are excluded by discovery. Native `--listFilesOnly` independently supplies each import closure.

// The type-relevant test SOURCE roots + the file-extension surface. `.d.ts` is INCLUDED (it's type-bearing);
// non-TS (json/css/snap/sh) is excluded — those are in no TS program by design.
const TEST_ROOT_RE = /^(?:tests|playwright)\//u;

function nativeRootSets(root: string, programs: readonly PolicyProgramMembership[]): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  const roots = new Map<string, ReadonlySet<string>>();
  for (const program of programs) {
    const native = nativeProgramRoots(root, program);
    if (native === undefined) {
      return;
    }
    roots.set(program.config, native);
  }
  return roots;
}

/** Independent native/shared parser comparison. It judges reader parity only; ownership stays below. */
export function compareRoutingParity(
  programs: readonly PolicyProgramMembership[],
  nativeRoots: ReadonlyMap<string, ReadonlySet<string>>,
): readonly RoutingParityViolation[] {
  const violations: RoutingParityViolation[] = [];
  for (const program of programs) {
    const native = nativeRoots.get(program.config);
    if (native === undefined) {
      throw new Error(`native roots missing program observation: ${program.config}`);
    }
    const shared = new Set(program.files.filter(isTypeWorldSource));
    violations.push(
      ...[...shared].filter((file) => !native.has(file)).map((file) => ({ program: program.config, file, observedBy: "shared-parser" as const })),
      ...[...native].filter((file) => !shared.has(file)).map((file) => ({ program: program.config, file, observedBy: "native-ts7" as const })),
    );
  }
  return violations.toSorted((left, right) =>
    `${left.program}\0${left.file}\0${left.observedBy}`.localeCompare(`${right.program}\0${right.file}\0${right.observedBy}`),
  );
}

/** The union of every program's closure. */
function unionClosure(closures: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> {
  const members = new Set<string>();
  for (const closure of closures.values()) {
    for (const abs of closure) {
      members.add(abs);
    }
  }
  return members;
}

function membershipOutcome(input: {
  readonly file: string;
  readonly predicted: string | null;
  readonly ambient: boolean;
  readonly rootedBy: readonly string[];
  readonly containedBy: readonly string[];
  readonly expectedPrograms: readonly string[];
}): MembershipOutcome {
  const { file, predicted, ambient, rootedBy, containedBy, expectedPrograms } = input;
  if (predicted === null && !ambient) {
    return "unclassified";
  }
  if (containedBy.length === 0) {
    return "unowned";
  }
  if (rootedBy.length === 0) {
    return "import-only";
  }
  if (ambient) {
    return samePrograms(rootedBy, expectedPrograms) && samePrograms(containedBy, expectedPrograms) ? "ambient" : "drift";
  }
  if (predicted === null) {
    return "unclassified";
  }
  return rootedBy.includes(predicted) && (!requiresExclusiveRoot(file) || rootedBy.length === 1) ? "predicted" : "drift";
}

function samePrograms(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((program) => expected.includes(program));
}

/** Compare intended primary ownership with actual roots and closures for every authored TS file. */
export function classifyMembership(
  root: string,
  files: readonly string[],
  rootsByProgram: ReadonlyMap<string, ReadonlySet<string>>,
  closuresByProgram: ReadonlyMap<string, ReadonlySet<string>>,
): readonly MembershipRow[] {
  const prefix = `${root.replaceAll("\\", "/")}/`;
  const concretePrograms = [...rootsByProgram].filter(([, roots]) => roots.size > 0).map(([config]) => config);
  return files.map((file) => {
    const predicted = predictedProgram(file) ?? null;
    const world = worldOf(file) ?? null;
    const ambientScope = ambientScopeOf(file) ?? null;
    const rootedBy = [...rootsByProgram].filter(([, roots]) => roots.has(file)).map(([cfg]) => cfg);
    const containedBy = [...closuresByProgram].filter(([, closure]) => closure.has(`${prefix}${file}`)).map(([cfg]) => cfg);
    const expectedPrograms = ambientScope === null ? [] : concretePrograms.filter((config) => ambientRootsForProgram(config)?.includes(file) === true);
    const outcome = membershipOutcome({ file, predicted, ambient: ambientScope !== null, rootedBy, containedBy, expectedPrograms });
    return { file, world, ambientScope, predicted, rootedBy, containedBy, expectedPrograms, outcome };
  });
}

const NODE_DECLARATION_RE = /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@types\/node\//u;
const BROWSER_LIBRARY_RE = /\/lib\.(?:dom|webworker)(?:[.-][^/]*)?\.d\.(?:ts|mts|cts)$/u;

function closureLeaks(closures: ReadonlyMap<string, ReadonlySet<string>>): readonly ClosureLeak[] {
  const leaks: ClosureLeak[] = [];
  for (const [program, files] of closures) {
    const world = programWorldOf(program);
    if (world === undefined || world === "browser") {
      continue;
    }
    const browserLibraries = [...files].filter((file) => BROWSER_LIBRARY_RE.test(file)).toSorted();
    if (browserLibraries.length > 0) {
      leaks.push({ program, world, kind: "browser-libraries", files: browserLibraries });
    }
    if (world === "iso") {
      const nodeDeclarations = [...files].filter((file) => NODE_DECLARATION_RE.test(file)).toSorted();
      if (nodeDeclarations.length > 0) {
        leaks.push({ program, world, kind: "node-declarations", files: nodeDeclarations });
      }
    }
  }
  return leaks;
}

const FIX_HINT =
  "correct the file's world placement and the owning config's directory/suffix roots. " +
  "Every authored tests/** + playwright/** TS file must belong to a compiler program.";

/** The reconciliation core (exported for a proof test): the test files that appear in NO program closure. */
export function findEscapees(testFiles: readonly string[], closureAbs: ReadonlySet<string>, root: string): readonly string[] {
  const prefix = `${root.replaceAll("\\", "/")}/`;
  return testFiles.filter((rel) => !closureAbs.has(`${prefix}${rel}`));
}

// A reference-lib directive widens its entire compiler program, including unrelated source files.
const TRIPLE_SLASH_LIB_RE = /^\s*\/{3}\s*<reference\s+lib\s*=/mu;
// Currently empty BY DESIGN — no live file needs this escape. A future genuine need adds a row here with
// a `why` (never just deletes the check); this is the door, not a standing exemption.
const LIB_LEAK_ALLOWLIST: ReadonlySet<string> = new Set();

/** The leak-scan core (exported for a proof test): files carrying a triple-slash `reference lib=`
 *  directive, minus the allowlist. */
export function findTripleSlashLibLeaks(root: string, files: readonly string[]): readonly string[] {
  return files.filter((rel) => {
    if (LIB_LEAK_ALLOWLIST.has(rel)) {
      return false;
    }
    const text = readFileSync(join(root, rel), "utf8");
    if (!TRIPLE_SLASH_LIB_RE.test(text)) {
      return false;
    }
    const directives: number[] = [];
    forEachCommentRange(parseScratch(text), (range) => {
      if (range.kind === SyntaxKind.SingleLineCommentTrivia && TRIPLE_SLASH_LIB_RE.test(text.slice(range.pos, range.end))) {
        directives.push(range.pos);
      }
    });
    return directives.length > 0;
  });
}

function jsonRequested(args: readonly string[]): boolean {
  if (args.length === 0) {
    return false;
  }
  if (args.length === 1 && args[0] === "--json") {
    return true;
  }
  throw new UsageError("tests-membership accepts only --json");
}

interface HumanReportInput {
  readonly fileCount: number;
  readonly testFileCount: number;
  readonly programCount: number;
  readonly rows: readonly MembershipRow[];
  readonly unknownPrograms: readonly string[];
  readonly libraryLeaks: readonly ClosureLeak[];
  readonly escapees: readonly string[];
  readonly leaks: readonly string[];
  readonly routingParityViolations: readonly RoutingParityViolation[];
}

function writeOwnershipFailures(rows: readonly MembershipRow[], unknownPrograms: readonly string[]): void {
  for (const row of rows.filter(({ outcome }) => outcome !== "predicted" && outcome !== "ambient")) {
    process.stdout.write(
      `      · ${row.outcome} ${row.file} [${row.world ?? row.ambientScope ?? "unclassified"}] — predicted ${row.predicted ?? "∅"}, rooted by {${row.rootedBy.join(", ")}}, in {${row.containedBy.join(", ")}}\n`,
    );
  }
  if (unknownPrograms.length > 0) {
    process.stdout.write(`  ✗ ${unknownPrograms.length} concrete compiler program(s) have no authored world intent: ${unknownPrograms.join(", ")}\n`);
  }
}

function writeClosureFailures(libraryLeaks: readonly ClosureLeak[], routingParityViolations: readonly RoutingParityViolation[]): void {
  for (const leak of libraryLeaks) {
    process.stdout.write(`  ✗ ${leak.program} [${leak.world}] acquired forbidden ${leak.kind}:\n`);
    for (const file of leak.files) {
      process.stdout.write(`      · ${file}\n`);
    }
  }
  for (const violation of routingParityViolations) {
    const observer = violation.observedBy === "native-ts7" ? "native TS7 roots" : "shared parser roots";
    process.stdout.write(`  ✗ ${violation.program}: ${violation.file} appears only in ${observer}\n`);
  }
}

function writeEscapees(escapees: readonly string[]): void {
  if (escapees.length === 0) {
    process.stdout.write("  ✓ every tests/** + playwright/** TS file is in ≥1 type program's closure\n");
    return;
  }
  process.stdout.write(`  ✗ ${escapees.length} file(s) in ZERO type programs — checked by NO static stage:\n`);
  for (const rel of escapees) {
    process.stdout.write(`      · ${rel}\n`);
  }
  process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
}

function writeReferenceLibLeaks(leaks: readonly string[]): void {
  if (leaks.length === 0) {
    process.stdout.write("  ✓ no triple-slash `reference lib=` directive on the type-relevant surface\n");
    return;
  }
  process.stdout.write(`  ✗ ${leaks.length} file(s) carry a PROGRAM-SCOPING triple-slash reference-lib directive:\n`);
  for (const rel of leaks) {
    process.stdout.write(`      · ${rel}\n`);
  }
  process.stdout.write(
    "\n  FIX: widen the file's owning tsconfig `lib` array instead (or home the file in a program that " +
      "already carries the lib it needs) — a triple-slash directive silently widens the WHOLE program, " +
      "not just this file (#1228).\n",
  );
}

function writeHumanReport(input: HumanReportInput): void {
  const { fileCount, testFileCount, programCount, rows, unknownPrograms, libraryLeaks, escapees, leaks, routingParityViolations } = input;
  const count = (outcome: MembershipOutcome): number => rows.filter((row) => row.outcome === outcome).length;
  process.stdout.write(`type-world membership — ${fileCount} authored TS file(s), ${testFileCount} test/harness file(s), ${programCount} program(s)\n`);
  process.stdout.write(`  report: ${MEMBERSHIP_OUTCOMES.map((outcome) => `${outcome}=${count(outcome)}`).join(" ")}\n`);
  process.stdout.write(`  enforcing ${MEMBERSHIP_ENFORCEMENT}\n`);
  writeOwnershipFailures(rows, unknownPrograms);
  writeClosureFailures(libraryLeaks, routingParityViolations);
  writeEscapees(escapees);
  writeReferenceLibLeaks(leaks);
}

/** Enforces all authored compiler membership and native declaration-closure boundaries. */
export function runTestsTypeMembership(root: string, args: readonly string[] = []): number {
  const json = jsonRequested(args);
  const inventory = readPolicyRepositoryInventory(root);
  // NO SENTINEL FILTER (#2176 Phase F, 2026-09-14). A `__g_` branch used to sit here beside the tsconfig
  // excludes, for the legacy self-test's transient plants; those planters are deleted and the namespace has
  // no producer. LEGITIMATE UNTRACKED TEST ADMISSION IS UNTOUCHED and does not depend on it: `inventory.paths`
  // is `git ls-files` ∪ `git ls-files --others --exclude-standard`, so an untracked spec is admitted by the
  // second read — and a `__g_` path was never in either list anyway, because `.gitignore` excludes it, which
  // is what made the filter redundant as well as dead.
  const files = inventory.paths.filter((file) => isTypeWorldSource(file));
  const memberships = readAvailablePolicyPrograms(inventory);
  const programs = memberships.map((program) => program.config);
  const closures = programClosures(root, memberships);
  if (closures === undefined) {
    return EXIT.toolError; // a tsgo listing broke — the checker is broken, not the tree
  }
  const nativeRoots = nativeRootSets(root, memberships);
  if (nativeRoots === undefined) {
    return EXIT.toolError;
  }
  const closure = unionClosure(closures);
  const testFiles = files.filter((file) => TEST_ROOT_RE.test(file));
  const escapees = findEscapees(testFiles, closure, root);
  const leaks = findTripleSlashLibLeaks(root, files);
  const rootsByProgram = new Map(memberships.map((program) => [program.config, new Set(program.files)] as const));
  const rows = classifyMembership(root, files, rootsByProgram, closures);
  const unknownPrograms = memberships
    .filter((program) => program.files.length > 0 && programWorldOf(program.config) === undefined)
    .map((program) => program.config);
  const libraryLeaks = closureLeaks(closures);
  const routingParityViolations = compareRoutingParity(memberships, nativeRoots);
  const ownershipClean = rows.every(({ outcome }) => outcome === "predicted" || outcome === "ambient");
  const exit =
    ownershipClean &&
    escapees.length === 0 &&
    leaks.length === 0 &&
    unknownPrograms.length === 0 &&
    libraryLeaks.length === 0 &&
    routingParityViolations.length === 0
      ? EXIT.clean
      : EXIT.violations;
  if (json) {
    const report: MembershipReport = {
      enforcement: MEMBERSHIP_ENFORCEMENT,
      programs,
      rows,
      testEscapees: escapees,
      libLeaks: leaks,
      unknownPrograms,
      closureLeaks: libraryLeaks,
      routingParityViolations,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return exit;
  }
  writeHumanReport({
    fileCount: files.length,
    testFileCount: testFiles.length,
    programCount: programs.length,
    rows,
    unknownPrograms,
    libraryLeaks,
    escapees,
    leaks,
    routingParityViolations,
  });
  return exit;
}

/** Application subjects retain canonical primary ownership while declaration-world checks use native
 * projected closures. A tool imported by an application test is still a subject, not an exclusion. */
export async function runApplicationTypeMembership(root: string, args: readonly string[]): Promise<number> {
  const json = jsonRequested(args);
  return await withApplicationPrograms(root, (population) => {
    const active = new Set(population.programs.map(({ owner }) => owner.id));
    const canonicalRoots = new Map(population.canonicalPrograms.map((program) => [program.id, new Set(program.files)]));
    const activeRoots = new Map([...canonicalRoots].filter(([id]) => active.has(id)));
    const files = population.files.filter(isTypeWorldSource);
    const rows = [
      ...classifyMembership(
        root,
        files.filter((file) => ambientScopeOf(file) === undefined),
        canonicalRoots,
        population.closures,
      ),
      ...classifyMembership(
        root,
        files.filter((file) => ambientScopeOf(file) !== undefined),
        activeRoots,
        population.closures,
      ),
    ].toSorted((left, right) => left.file.localeCompare(right.file));
    const observed = new Map<string, ReadonlySet<string>>();
    for (const program of population.programs) {
      const native = nativeProgramRoots(root, { ...program.owner, config: program.config });
      if (native === undefined) {
        return EXIT.toolError;
      }
      observed.set(program.owner.id, native);
    }
    const routingParityViolations = compareRoutingParity(
      population.programs.map(({ owner, roots }) => ({ ...owner, files: roots })),
      observed,
    );
    const unknownPrograms = population.programs.filter(({ owner }) => programWorldOf(owner.id) === undefined).map(({ owner }) => owner.id);
    const libraryLeaks = closureLeaks(population.closures);
    const leaks = findTripleSlashLibLeaks(root, files);
    const escapees = findEscapees(population.roots, unionClosure(population.closures), root);
    const report: MembershipReport = {
      enforcement: MEMBERSHIP_ENFORCEMENT,
      programs: [...active],
      rows,
      testEscapees: escapees,
      libLeaks: leaks,
      unknownPrograms,
      closureLeaks: libraryLeaks,
      routingParityViolations,
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write("application ");
      writeHumanReport({
        fileCount: files.length,
        testFileCount: files.filter((file) => TEST_ROOT_RE.test(file)).length,
        programCount: active.size,
        rows,
        unknownPrograms,
        libraryLeaks,
        escapees,
        leaks,
        routingParityViolations,
      });
    }
    return rows.every(({ outcome }) => outcome === "predicted" || outcome === "ambient") &&
      unknownPrograms.length + libraryLeaks.length + escapees.length + leaks.length + routingParityViolations.length === 0
      ? EXIT.clean
      : EXIT.violations;
  });
}
