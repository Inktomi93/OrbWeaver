// The type-membership reconciliation stage: every type-relevant SOURCE file under tests/** +
// playwright/** must appear in ≥1 type program's import closure — else it is checked by NOTHING. Runs
// `ts7 --listFilesOnly` (module resolution only, no typecheck — via scripts/ts7.cjs, the same wrapper
// the typecheck scripts use) for each program, unions the closures, and asserts the enumerated test
// files are a subset. ALSO runs the #1228 triple-slash-lib-leak tripwire (below) — a second, narrower
// invariant of the same "type-program hygiene" concern, folded into this stage rather than a new one
// so both checks report through the one `tests-membership` verb. Speaks the repo's own 0/1/2/3 exit
// scheme: 0 clean · 1 violations (escapees / a leak) · 2 tool error (a listing broke).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";

refuseDirectInvocation(import.meta.url, "pnpm check:tests-membership");

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

// #1228: the triple-slash-lib-leak tripwire. A `/// <reference lib="…" />` directive is PROGRAM-scoped,
// not file-scoped (a `<reference lib="dom">` in ONE root-aggregator-swept script silently supplied
// lib.dom to the ENTIRE `tsconfig.json` program for months, masking every genuinely DOM-coupled escapee
// riding the leak — see scripts/probes/st-goldens/generate-goldens.ts's history). `tests-type-membership`
// otherwise only asks "is this file in SOME program's closure" — a leak makes that question answer YES
// for the wrong reason, so membership alone cannot catch this class; only a direct ban on the mechanism
// can. The sanctioned way to widen a program's lib set is its tsconfig's `lib` array; a triple-slash
// directive is never that, so this scans the whole type-relevant surface (wider than TEST_ROOTS above —
// scripts/ and tooling/src/ carry the mechanism too, and packages/*/src can leak into its OWN per-package
// program the same way) rather than reusing enumerateTestFiles.
const LIB_LEAK_ROOTS: readonly string[] = ["scripts", "tooling/src", "tests", "playwright"];
const TRIPLE_SLASH_LIB_RE = /^\/{3}\s*<reference\s+lib=/mu;
// Currently empty BY DESIGN — no live file needs this escape. A future genuine need adds a row here with
// a `why` (never just deletes the check); this is the door, not a standing exemption.
const LIB_LEAK_ALLOWLIST: ReadonlySet<string> = new Set();

/** Every `.ts`/`.tsx`/`.mts`/`.cts` file under the given repo-relative roots, plus every package's `src`
 *  dir (walked separately since it is not one static root), as repo-relative posix paths. */
function enumerateTypeRelevantFiles(root: string): readonly string[] {
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
  for (const leakRoot of LIB_LEAK_ROOTS) {
    walk(leakRoot);
  }
  for (const pkg of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (pkg.isDirectory()) {
      walk(`packages/${pkg.name}/src`);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** The leak-scan core (exported for a proof test): files carrying a triple-slash `reference lib=`
 *  directive, minus the allowlist. */
export function findTripleSlashLibLeaks(root: string, files: readonly string[]): readonly string[] {
  return files.filter((rel) => !LIB_LEAK_ALLOWLIST.has(rel) && TRIPLE_SLASH_LIB_RE.test(readFileSync(join(root, rel), "utf8")));
}

/** The `tests-membership` verb — BOTH the closure-membership reconciliation and the triple-slash-lib-leak
 *  tripwire; either finding is a violation. */
export function runTestsTypeMembership(root: string): number {
  const closure = unionClosure(root);
  if (closure === undefined) {
    return EXIT.toolError; // a tsgo listing broke — the checker is broken, not the tree
  }
  const testFiles = enumerateTestFiles(root);
  const escapees = findEscapees(testFiles, closure, root);
  const leaks = findTripleSlashLibLeaks(root, enumerateTypeRelevantFiles(root));

  process.stdout.write(`tests-type-membership — ${testFiles.length} test file(s) across ${PROGRAMS.length} type program(s)\n`);
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

  return escapees.length === 0 && leaks.length === 0 ? EXIT.clean : EXIT.violations;
}
