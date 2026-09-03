// THE PIN FOR "WHICH LANE ACTUALLY VERDICTS A `.test-d.ts`" (#1270). A `.test-d.ts` carries no runtime
// assertions — its ENTIRE value is that some TS program compiles it — so "which program roots it" is not
// trivia, it is the test's only enforcement mechanism. That fact is a DATA FACT about a tsconfig's
// include/exclude, and nothing re-derives it when a tsconfig moves: the compiler cannot complain about a
// file it was never handed, `structure:full` reads source shapes rather than program membership, and the
// vitest `types` project reports a cheerful `✓ 3 tests` for a file its configured tsconfig excludes.
//
// MEASURED, 2026-09-02 (the founding receipt, both directions, one run):
//   • planted `export const x: number = "…"` in `tests/ui/primitives/input/index.test-d.ts` (a tests/ui
//     file, wholesale-excluded from `tsconfig.json` by #1243) → `pnpm test:types` printed
//     `✓ |types| TS tests/ui/primitives/input/index.test-d.ts (3 tests)`. The error was invisible.
//   • the SAME error planted in `tests/contracts/regex/index.test-d.ts` (still a root-program member) →
//     `FAIL |types| tests/contracts/regex/index.test-d.ts`. So the lane works; it just cannot see that tree.
//   • both files planted again under `pnpm typecheck:tests-dom` → exit 1, TS2322 at BOTH sites. The
//     coverage MOVED to `types:tests-dom`; it did not vanish. That is what this pin freezes.
//
// WHY THESE SUBJECTS ARE DURABLE (the #1270 lesson — a pin whose premise is graph membership must name a
// subject the graph reaches WITHOUT a test tree): every input here is a repo-ROOT config —
// `vitest.config.ts`, `tsconfig.json`, `tsconfig.tests-dom.json` — read through `git ls-files` and
// `ts7 --showConfig`. None of them depends on which test tree is in which program this month, which is
// exactly the dependency that silently killed `run.int.test.ts`'s rule-5 pin when #1243 landed.
//
// SCOPE FENCE — what this pin does NOT claim: `tsconfig-routing-parity` reconciles `staticPrograms`
// against real root membership for the 8 programs in its `CANDIDATE_TSCONFIGS`, which does NOT list
// `tsconfig.tests-dom.json`; the 312 files that program roots are therefore outside its universe
// entirely. This pin is about the `.test-d.ts` LANE question only and is not a substitute for that.
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import vitestConfig from "../../vitest.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const GRAPH = "tsconfig.json";
const TESTS_DOM = "tsconfig.tests-dom.json";
/** Below this the derivation stopped reading (a moved config, a broken spawn) — a bare zero would read
 *  exactly like "the invariant holds", which is the failure mode this whole file exists to name. */
const MIN_TESTD_FILES = 20;
const MIN_GRAPH_ROOTS = 1000;
const MIN_TESTS_DOM_ROOTS = 50;
const TS_SRC_RE = /\.(?:ts|tsx|mts|cts)$/u;
const D_TS_RE = /\.d\.ts$/u;
const SHOW_CONFIG_MAX_BUFFER = 268_435_456;

interface TypecheckShape {
  readonly include?: readonly string[];
  readonly tsconfig?: string;
}
interface ProjectShape {
  readonly test?: { readonly name?: string; readonly typecheck?: TypecheckShape };
}

/** The `types` project's OWN declaration of what it collects and which program it collects it under —
 *  read from `vitest.config.ts`, never restated here (a copy would rot into agreement with nothing). */
function typesProject(): { readonly include: readonly string[]; readonly tsconfig: string } {
  const projects = (vitestConfig.test?.projects ?? []) as readonly ProjectShape[];
  const found = projects.find((p) => p.test?.name === "types")?.test?.typecheck;
  if (found?.include === undefined || found.tsconfig === undefined) {
    throw new Error(
      "vitest.config.ts has no `types` project with a typecheck include + tsconfig — this pin could not measure, which is not the same as the invariant holding",
    );
  }
  return { include: found.include, tsconfig: found.tsconfig };
}

/** The repo-relative TS SOURCE files a program ROOTS (its resolved include/files), minus `.d.ts` — the
 *  same `--showConfig` reading `tsconfig-routing-parity` takes, so the two agree by construction. */
function programRoots(root: string, cfg: string): ReadonlySet<string> {
  const res = runNicedSync(process.execPath, [join(root, "scripts", "ts7.cjs"), "--showConfig", "-p", cfg], { cwd: root, maxBuffer: SHOW_CONFIG_MAX_BUFFER });
  if (res.status !== 0) {
    throw new Error(`ts7 --showConfig failed for ${cfg} (exit ${String(res.status)}) — a tool error, never a clean verdict`);
  }
  const parsed = JSON.parse(res.stdout) as { readonly files?: readonly string[] };
  const cfgDir = join(root, cfg, "..");
  const out = new Set<string>();
  for (const entry of parsed.files ?? []) {
    const abs = isAbsolute(entry) ? entry : join(cfgDir, entry);
    const rel = relative(root, abs);
    if (rel.startsWith("..") || rel.includes("node_modules/") || D_TS_RE.test(rel) || !TS_SRC_RE.test(rel)) {
      continue;
    }
    out.add(rel);
  }
  return out;
}

/** The collected corpus, derived by handing the project's OWN include globs to git as a pathspec — no
 *  hand-rolled glob matcher to disagree with vitest's. */
function collectedTestD(root: string, include: readonly string[]): readonly string[] {
  const res = runNicedSync("git", ["ls-files", "--", ...include], { cwd: root });
  if (res.status !== 0) {
    throw new Error(`git ls-files failed for ${include.join(" ")} — could not measure`);
  }
  return res.stdout.split("\n").filter((line) => line.trim() !== "");
}

/** The top-level test tree a repo-relative path sits in (`tests/ui/a/b.ts` → `tests/ui`). */
function tree(rel: string): string {
  return rel.split("/").slice(0, 2).join("/");
}

test("every `.test-d.ts` is rooted by exactly one type program, and the vitest `types` lane's blind half is the tests-dom half", ({ repoRoot }) => {
  const project = typesProject();
  expect(project.tsconfig).toBe(GRAPH);

  const files = collectedTestD(repoRoot, project.include);
  expect(files.length).toBeGreaterThan(MIN_TESTD_FILES);

  const graphRoots = programRoots(repoRoot, GRAPH);
  const domRoots = programRoots(repoRoot, TESTS_DOM);
  // Blindness tripwire: a near-empty root set means `--showConfig` stopped answering, and every
  // membership question below would then answer "not a member" for the wrong reason.
  expect(graphRoots.size).toBeGreaterThan(MIN_GRAPH_ROOTS);
  expect(domRoots.size).toBeGreaterThan(MIN_TESTS_DOM_ROOTS);

  // 1. TOTAL: no `.test-d.ts` is typechecked by nothing. (`types:tests-membership` guards the wider
  //    tests/** corpus; this arm is the same promise stated where a reader of THIS lane will look.)
  const orphans = files.filter((rel) => !(graphRoots.has(rel) || domRoots.has(rel)));
  expect(orphans).toEqual([]);

  // 2. DISJOINT: a file in both programs would be checked under two lib sets and could pass in one while
  //    failing in the other — the ambiguity this partition exists to forbid.
  const doubled = files.filter((rel) => graphRoots.has(rel) && domRoots.has(rel));
  expect(doubled).toEqual([]);

  // 3. THE PIN. The files the `types` project COLLECTS but its own tsconfig does not ROOT get a vacuous
  //    green from `pnpm test:types`; `types:tests-dom` is their real enforcer. That set is non-empty
  //    today (see the founding receipt above), so its emptying is a real event: it means those files
  //    rejoined the root program and every header below that names `types:tests-dom` has gone stale.
  const vacuous = files.filter((rel) => !graphRoots.has(rel));
  expect(vacuous.length).toBeGreaterThan(0);
  for (const rel of vacuous) {
    expect(domRoots.has(rel), `${rel} is collected by the vitest \`types\` lane, is NOT rooted by ${GRAPH}, and is not rooted by ${TESTS_DOM} either`).toBe(
      true,
    );
  }

  // 4. WHOLESALE, never per-file. Every vacuous file's exclusion must come from its whole tree being out
  //    of the root program, not from a per-file `exclude` row. The per-file escapee ledger is exactly the
  //    shape #1228/#1243 kept re-growing until both moves went wholesale-by-directory; a new per-file row
  //    under an otherwise-included tree reds here rather than rotting quietly.
  const graphTrees = new Set([...graphRoots].map(tree));
  for (const rel of vacuous) {
    expect(
      graphTrees.has(tree(rel)),
      `${rel} is excluded from ${GRAPH} while ${tree(rel)}/** is otherwise included — a per-file escapee row, not the ratified wholesale-by-directory shape`,
    ).toBe(false);
  }
});

test("the root tsconfig's own exclude list still names the trees this pin found blind (the config is the authority, not this file)", ({ repoRoot }) => {
  // The second opinion on arm 4: read the config TEXT rather than `--showConfig`'s resolution. If a tree
  // shows up blind above but is absent from the exclude list here, the two readings disagree and the
  // conclusion drawn from either is unsafe.
  const project = typesProject();
  const files = collectedTestD(repoRoot, project.include);
  const graphRoots = programRoots(repoRoot, GRAPH);
  const blindTrees = [...new Set(files.filter((rel) => !graphRoots.has(rel)).map(tree))].toSorted();
  expect(blindTrees.length).toBeGreaterThan(0);
  const configText = readFileSync(join(repoRoot, GRAPH), "utf8");
  for (const t of blindTrees) {
    expect(configText.includes(`"${t}"`), `${t}/** reads as blind via --showConfig but ${GRAPH} carries no \`"${t}"\` row — the two readings disagree`).toBe(
      true,
    );
  }
});
