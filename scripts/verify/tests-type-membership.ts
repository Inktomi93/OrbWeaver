// The type-membership reconciliation stage (UNIFIED-VERIFICATION-DESIGN.md §3): every type-relevant
// SOURCE file under tests/** + playwright/** must appear in ≥1 type program's import closure — else it is
// checked by NOTHING. Runs `tsgo --listFilesOnly` (module resolution only, no typecheck) for each program,
// unions the closures, and asserts the enumerated test files are a subset. Speaks the repo's own 0/1/2/3
// exit scheme: 0 clean · 1 violations (escapees) · 2 tool error (a tsgo listing broke).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

// The TYPE programs whose import closures collectively must cover every test file. Each is a real tsgo
// `-p <config>` program; `--listFilesOnly` gives its full resolved file set. (The vitest `types` project's
// `.test-d.ts` files are graph-program members already — the root graph `include: ["tests"]` sweeps them —
// so the graph closure covers them; there is no separate tsgo config to list for that lane.)
const PROGRAMS: readonly string[] = [
  "tsconfig.json", // the DOM-less root graph (node tests/**, scripts/**)
  "packages/client/tsconfig.json", // @orb/client + its tests/client/**/*.tsx reach-back
  "packages/ui/tsconfig.json", // @orb/ui + its tests/ui/**/*.tsx + playwright/** reach-back
  "tsconfig.tests-dom.json", // the DOM-coupled NON-.tsx test escapees
];

// The type-relevant test SOURCE roots + the file-extension surface. `.d.ts` is INCLUDED (it's type-bearing);
// non-TS (json/css/snap/sh) is excluded — those are in no TS program by design.
const TEST_ROOTS: readonly string[] = ["tests", "playwright"];
const TS_FILE_RE = /\.(?:ts|tsx|mts|cts)$/u;
// The reserved throwaway-fixture sentinel the check-gates self-test materializes for milliseconds (mirrored
// in every tsconfig `exclude`). It is not a real test file — never an escapee.
const SENTINEL_RE = /(?:^|\/)__g_/u;

// tsgo's --listFilesOnly on the widest program is ~5,400 absolute paths (~0.5MB); 64MiB is generous headroom.
const LIST_FILES_MAX_BUFFER = 67_108_864;

/** The absolute-path import closure of one tsgo program (module resolution only — no typecheck). Returns
 *  undefined on any failure (the caller maps that to a TOOL ERROR — a broken listing is not a verdict). */
function programClosure(root: string, config: string): readonly string[] | undefined {
  const tsgo = join(root, "node_modules", ".bin", "tsgo");
  const res = spawnSync(tsgo, ["--noEmit", "--listFilesOnly", "-p", config], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") {
    process.stderr.write(`tests-type-membership: \`tsgo --listFilesOnly -p ${config}\` failed (status ${String(res.status)})\n${res.stderr ?? ""}`);
    return;
  }
  return res.stdout.split("\n").map((l) => l.trim());
}

/** The union of every program's closure, as a Set of ABSOLUTE posix paths. undefined ⇒ a listing broke. */
function unionClosure(root: string): ReadonlySet<string> | undefined {
  const members = new Set<string>();
  for (const config of PROGRAMS) {
    const closure = programClosure(root, config);
    if (closure === undefined) {
      return; // a broken listing → the whole reconciliation is a tool error, not a false "clean"
    }
    for (const abs of closure) {
      if (abs.length > 0) {
        members.add(abs);
      }
    }
  }
  return members;
}

/** Every type-relevant test SOURCE file under the test roots, as repo-relative posix paths (sorted). */
function enumerateTestFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") {
          walk(rel);
        }
      } else if (TS_FILE_RE.test(entry.name) && !SENTINEL_RE.test(rel)) {
        out.push(rel);
      }
    }
  };
  for (const testRoot of TEST_ROOTS) {
    walk(testRoot);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

const FIX_HINT =
  "add each to tsconfig.tests-dom.json `include` (a DOM-coupled non-`.tsx` test), or to the owning " +
  "package tsconfig / the root graph include if it belongs there. Every file under tests/** + " +
  "playwright/** MUST be in ≥1 type program's closure — else it is checked by NOTHING.";

/** The reconciliation core (exported for a proof test): the test files that appear in NO program closure. */
export function findEscapees(testFiles: readonly string[], closureAbs: ReadonlySet<string>, root: string): readonly string[] {
  const prefix = `${root}/`;
  return testFiles.filter((rel) => !closureAbs.has(`${prefix}${rel}`));
}

function main(): void {
  const root = process.cwd();
  const closure = unionClosure(root);
  if (closure === undefined) {
    process.exit(EXIT_TOOL_ERROR); // a tsgo listing broke — the checker is broken, not the tree
  }
  const testFiles = enumerateTestFiles(root);
  const escapees = findEscapees(testFiles, closure, root);

  process.stdout.write(`tests-type-membership — ${testFiles.length} test file(s) across ${PROGRAMS.length} type program(s)\n`);
  if (escapees.length === 0) {
    process.stdout.write("  ✓ every tests/** + playwright/** TS file is in ≥1 type program's closure\n");
    process.exitCode = EXIT_CLEAN;
    return;
  }
  process.stdout.write(`  ✗ ${escapees.length} file(s) in ZERO type programs — checked by NO static stage:\n`);
  for (const rel of escapees) {
    process.stdout.write(`      · ${rel}\n`);
  }
  process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  process.exit(EXIT_VIOLATIONS);
}

// Direct-run guard (the run.ts/report.ts idiom): `tsx scripts/verify/tests-type-membership.ts` runs main();
// an import (a proof test) gets only the exported `findEscapees` core — importing must NOT execute a run.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
