// Enforces intended roots, exact ambient distribution and native declaration-library boundaries across
// every authored TypeScript source; --json retains every source identity and observation.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { isTypeWorldSource, predictedProgram, requiresExclusiveRoot, worldOf } from "@orb/tooling/_shared/project-worlds";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { ambientRootsForProgram, ambientScopeOf, programWorldOf } from "@orb/tooling/_shared/type-config-intent";
import type { PolicyProgramMembership } from "../contract/policy-scope.ts";
import type { ClosureLeak, MembershipOutcome, MembershipReport, MembershipRow, RoutingParityViolation } from "../contract/tests-type-membership.ts";
import { MEMBERSHIP_ENFORCEMENT, MEMBERSHIP_OUTCOMES } from "../contract/tests-type-membership.ts";
import { readAvailablePolicyPrograms } from "../lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:type-ownership");

// The shared compiler graph includes declaration projects and reference-only solutions; abstract templates
// are excluded by discovery. Native `--listFilesOnly` independently supplies each import closure.

// The type-relevant test SOURCE roots + the file-extension surface. `.d.ts` is INCLUDED (it's type-bearing);
// non-TS (json/css/snap/sh) is excluded — those are in no TS program by design.
const TEST_ROOT_RE = /^(?:tests|playwright)\//u;
// The reserved throwaway-fixture sentinel the check-gates self-test materializes for milliseconds (mirrored
// in every tsconfig `exclude`). It is not a real test file — never an escapee.
const SENTINEL_RE = /(?:^|\/)__g_/u;

// tsgo's --listFilesOnly on the widest program is ~5,400 absolute paths (~0.5MB); 64MiB is generous headroom.
const LIST_FILES_MAX_BUFFER = 67_108_864;

/** The absolute-path import closure of one tsgo program (module resolution only — no typecheck). Returns
 *  undefined on any failure (the caller maps that to a TOOL ERROR — a broken listing is not a verdict). */
function programClosure(root: string, program: PolicyProgramMembership): readonly string[] | undefined {
  const { config } = program;
  const ts7 = join(root, "scripts", "ts7.cjs");
  const res = runNicedSync(process.execPath, [ts7, "--noEmit", "--listFilesOnly", "-p", config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0) {
    process.stderr.write(`tests-type-membership: \`ts7 --listFilesOnly -p ${config}\` failed (status ${String(res.status)})\n${res.stderr}`);
    return;
  }
  const files = res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if ((files.length === 0 && program.files.length > 0) || files.some((file) => !isAbsolute(file))) {
    process.stderr.write(
      `tests-type-membership: \`ts7 --listFilesOnly -p ${config}\` returned ${files.length === 0 ? "no files for a concrete program" : "a non-absolute file"}\n`,
    );
    return;
  }
  return files;
}

/** Every program's closure, keyed by config, as Sets of ABSOLUTE posix paths. undefined ⇒ a listing broke. */
function programClosures(root: string, programs: readonly PolicyProgramMembership[]): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  const out = new Map<string, ReadonlySet<string>>();
  for (const program of programs) {
    const closure = programClosure(root, program);
    if (closure === undefined) {
      return; // a broken listing → the whole reconciliation is a tool error, not a false "clean"
    }
    out.set(program.config, new Set(closure));
  }
  return out;
}

function nativeProgramRoots(root: string, program: PolicyProgramMembership): ReadonlySet<string> | undefined {
  const result = runNicedSync(process.execPath, [join(root, "scripts", "ts7.cjs"), "--showConfig", "-p", program.config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (result.status !== 0) {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig failed for ${program.config} (status ${String(result.status)})\n${result.stderr}`);
    return;
  }
  let parsed: unknown;
  // @orb-gate-ignore caught-failure-ownership(default:catch): nativeRootSets propagates this failed observation and runTestsTypeMembership returns tool-error exit 2. Ends if malformed native output can produce a membership verdict.
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig returned malformed JSON for ${program.config}\n`);
    return;
  }
  const files = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "files") : undefined;
  if (!(Array.isArray(files) && files.every((file) => typeof file === "string"))) {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig returned no files array for ${program.config}\n`);
    return;
  }
  const configDir = dirname(join(root, program.config));
  const roots = new Set<string>();
  for (const file of files) {
    const absolute = isAbsolute(file) ? file : join(configDir, file);
    const rel = relative(root, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || rel.includes(`${sep}node_modules${sep}`)) {
      continue;
    }
    const posix = rel.split(sep).join("/");
    if (isTypeWorldSource(posix)) {
      roots.add(posix);
    }
  }
  return roots;
}

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
  const prefix = `${root}/`;
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
  const prefix = `${root}/`;
  return testFiles.filter((rel) => !closureAbs.has(`${prefix}${rel}`));
}

// A reference-lib directive widens its entire compiler program, including unrelated source files.
const TRIPLE_SLASH_LIB_RE = /^\/{3}\s*<reference\s+lib=/mu;
// Currently empty BY DESIGN — no live file needs this escape. A future genuine need adds a row here with
// a `why` (never just deletes the check); this is the door, not a standing exemption.
const LIB_LEAK_ALLOWLIST: ReadonlySet<string> = new Set();

/** The leak-scan core (exported for a proof test): files carrying a triple-slash `reference lib=`
 *  directive, minus the allowlist. */
export function findTripleSlashLibLeaks(root: string, files: readonly string[]): readonly string[] {
  return files.filter((rel) => !LIB_LEAK_ALLOWLIST.has(rel) && TRIPLE_SLASH_LIB_RE.test(readFileSync(join(root, rel), "utf8")));
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
  const files = inventory.paths.filter((file) => isTypeWorldSource(file) && !SENTINEL_RE.test(file));
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
