// Reports intended and actual ownership across authored TypeScript sources. During migration only test
// orphans and program-wide reference-lib leaks enforce; --json retains every row for inspection.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { isTypeWorldSource, predictedProgram, requiresExclusiveRoot, worldOf } from "@orb/tooling/_shared/project-worlds";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { MembershipOutcome, MembershipReport, MembershipRow } from "../contract/tests-type-membership.ts";
import { MEMBERSHIP_ENFORCEMENT, MEMBERSHIP_OUTCOMES } from "../contract/tests-type-membership.ts";
import { readAvailablePolicyPrograms } from "../lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:tests-membership");

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
function programClosure(root: string, config: string): readonly string[] | undefined {
  const ts7 = join(root, "scripts", "ts7.cjs");
  const res = runNicedSync(process.execPath, [ts7, "--noEmit", "--listFilesOnly", "-p", config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0) {
    process.stderr.write(`tests-type-membership: \`ts7 --listFilesOnly -p ${config}\` failed (status ${String(res.status)})\n${res.stderr}`);
    return;
  }
  return res.stdout.split("\n").map((l) => l.trim());
}

/** Every program's closure, keyed by config, as Sets of ABSOLUTE posix paths. undefined ⇒ a listing broke. */
function programClosures(root: string, programs: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  const out = new Map<string, ReadonlySet<string>>();
  for (const config of programs) {
    const closure = programClosure(root, config);
    if (closure === undefined) {
      return; // a broken listing → the whole reconciliation is a tool error, not a false "clean"
    }
    out.set(config, new Set(closure.filter((abs) => abs.length > 0)));
  }
  return out;
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

/** Compare intended primary ownership with actual roots and closures for every authored TS file. */
export function classifyMembership(
  root: string,
  files: readonly string[],
  rootsByProgram: ReadonlyMap<string, ReadonlySet<string>>,
  closuresByProgram: ReadonlyMap<string, ReadonlySet<string>>,
): readonly MembershipRow[] {
  const prefix = `${root}/`;
  return files.map((file) => {
    const predicted = predictedProgram(file) ?? null;
    const world = worldOf(file) ?? null;
    const rootedBy = [...rootsByProgram].filter(([, roots]) => roots.has(file)).map(([cfg]) => cfg);
    const containedBy = [...closuresByProgram].filter(([, closure]) => closure.has(`${prefix}${file}`)).map(([cfg]) => cfg);
    let outcome: MembershipOutcome;
    if (containedBy.length === 0) {
      outcome = "unowned";
    } else if (rootedBy.length === 0) {
      outcome = "import-only";
    } else if (predicted === null) {
      outcome = "unclassified";
    } else if (rootedBy.includes(predicted) && (!requiresExclusiveRoot(file) || rootedBy.length === 1)) {
      outcome = "predicted";
    } else {
      outcome = "drift";
    }
    return { file, world, predicted, rootedBy, containedBy, outcome };
  });
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

/** Reports all authored compiler membership while retaining the existing orphan/leak verdict. */
export function runTestsTypeMembership(root: string, args: readonly string[] = []): number {
  const json = jsonRequested(args);
  const inventory = readPolicyRepositoryInventory(root);
  const files = inventory.paths.filter((file) => isTypeWorldSource(file) && !SENTINEL_RE.test(file));
  const memberships = readAvailablePolicyPrograms(inventory);
  const programs = memberships.map((program) => program.config);
  const closures = programClosures(root, programs);
  if (closures === undefined) {
    return EXIT.toolError; // a tsgo listing broke — the checker is broken, not the tree
  }
  const closure = unionClosure(closures);
  const testFiles = files.filter((file) => TEST_ROOT_RE.test(file));
  const escapees = findEscapees(testFiles, closure, root);
  const leaks = findTripleSlashLibLeaks(root, files);
  const rootsByProgram = new Map(memberships.map((program) => [program.config, new Set(program.files)] as const));
  const rows = classifyMembership(root, files, rootsByProgram, closures);
  const exit = escapees.length === 0 && leaks.length === 0 ? EXIT.clean : EXIT.violations;
  if (json) {
    const report: MembershipReport = { enforcement: MEMBERSHIP_ENFORCEMENT, programs, rows, testEscapees: escapees, libLeaks: leaks };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return exit;
  }
  const count = (outcome: MembershipOutcome): number => rows.filter((row) => row.outcome === outcome).length;

  process.stdout.write(
    `type-world membership — ${files.length} authored TS file(s), ${testFiles.length} test/harness file(s), ${programs.length} program(s)\n`,
  );
  // Target drift stays informational until placement and config migrations have settled.
  process.stdout.write(`  report: ${MEMBERSHIP_OUTCOMES.map((outcome) => `${outcome}=${count(outcome)}`).join(" ")}\n`);
  process.stdout.write(`  target ownership is informational; enforcing ${MEMBERSHIP_ENFORCEMENT}\n`);
  for (const row of rows.filter(({ outcome }) => outcome !== "predicted")) {
    process.stdout.write(
      `      · ${row.outcome} ${row.file} [${row.world ?? "unclassified"}] — predicted ${row.predicted ?? "∅"}, rooted by {${row.rootedBy.join(", ")}}, in {${row.containedBy.join(", ")}}\n`,
    );
  }
  if (escapees.length === 0) {
    process.stdout.write("  ✓ every tests/** + playwright/** TS file is in ≥1 type program's closure\n");
  } else {
    process.stdout.write(`  ✗ ${escapees.length} file(s) in ZERO type programs — checked by NO static stage:\n`);
    for (const rel of escapees) {
      process.stdout.write(`      · ${rel}\n`);
    }
    process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  }

  if (leaks.length === 0) {
    process.stdout.write("  ✓ no triple-slash `reference lib=` directive on the type-relevant surface\n");
  } else {
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

  return exit;
}
