// THE PIN FOR "WHICH LANE ACTUALLY VERDICTS A `.test-d.ts`" (#1270, split #1313). A `.test-d.ts` carries no
// runtime assertions — its ENTIRE value is that some TS program compiles it — so "which program roots it"
// is not trivia, it is the test's only enforcement mechanism. That fact is a DATA FACT about a tsconfig's
// include/exclude, and nothing re-derives it when a tsconfig moves: the compiler cannot complain about a
// file it was never handed, `structure:full` reads source shapes rather than program membership, and a
// vitest `types-*` project reports a cheerful `✓` for a file its configured tsconfig excludes.
//
// FOUNDING RECEIPT, 2026-09-02 (pre-#1313 shape — kept for the incident record): the single `types` project
// checked EVERY `.test-d.ts` under `tsconfig.json` and carried `ignoreSourceErrors: true`, so a planted
// `export const x: number = "…"` in a `tests/ui` file printed a cheerful `✓ 3 tests` while `pnpm
// typecheck:tests-dom` caught it (TS2322). #1313 REMOVED that mask by splitting the vitest lane into
// `types-node` (root graph, EXCLUDES the six DOM-touching subjects) and `types-browser` (exactly those six,
// under `tsconfig.tests-dom.json`) and dropping `ignoreSourceErrors` — there is no longer a wrong-lib
// program left to suppress. THIS FILE now pins the POST-SPLIT shape: every `.test-d.ts` file is collected by
// exactly one of the two vitest projects, and that project's tsconfig is the one that actually ROOTS it —
// so a vitest `✓` and a real static pass now agree everywhere, not just on the five it happened to.
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
  readonly exclude?: readonly string[];
  readonly tsconfig?: string;
}
interface ProjectShape {
  readonly test?: { readonly name?: string; readonly typecheck?: TypecheckShape };
}

/** One `types-*` project's OWN declaration of what it collects, excludes, and which program it collects it
 *  under — read from `vitest.config.ts`, never restated here (a copy would rot into agreement with
 *  nothing). */
function typesProject(name: "types-node" | "types-browser"): {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly tsconfig: string;
} {
  const projects = (vitestConfig.test?.projects ?? []) as readonly ProjectShape[];
  const found = projects.find((p) => p.test?.name === name)?.test?.typecheck;
  if (found?.include === undefined || found.tsconfig === undefined) {
    throw new Error(
      `vitest.config.ts has no \`${name}\` project with a typecheck include + tsconfig — this pin could not measure, which is not the same as the invariant holding`,
    );
  }
  return { include: found.include, exclude: found.exclude ?? [], tsconfig: found.tsconfig };
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

/** The collected corpus, derived by handing a project's OWN include globs/paths to git as a pathspec —
 *  no hand-rolled glob matcher to disagree with vitest's. */
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

test("every `.test-d.ts` is claimed by exactly one `types-*` project, and each project's tsconfig is the program that actually roots its files", ({
  repoRoot,
}) => {
  const node = typesProject("types-node");
  const browser = typesProject("types-browser");
  expect(node.tsconfig).toBe(GRAPH);
  expect(browser.tsconfig).toBe(TESTS_DOM);

  // `types-node`'s glob collects the whole `.test-d.ts` census; its `exclude` is what hands the six
  // DOM-touching subjects to `types-browser` instead — the two field values are the ONE coupling site
  // (both ends say so in their own vitest.config.ts comment).
  const allTestD = collectedTestD(repoRoot, node.include);
  expect(allTestD.length).toBeGreaterThan(MIN_TESTD_FILES);

  const browserSet = new Set(node.exclude);
  expect(browserSet.size).toBeGreaterThan(0);
  const nodeSelected = allTestD.filter((rel) => !browserSet.has(rel));
  const browserSelected = collectedTestD(repoRoot, browser.include);

  const graphRoots = programRoots(repoRoot, GRAPH);
  const domRoots = programRoots(repoRoot, TESTS_DOM);
  // Blindness tripwire: a near-empty root set means `--showConfig` stopped answering, and every
  // membership question below would then answer "not a member" for the wrong reason.
  expect(graphRoots.size).toBeGreaterThan(MIN_GRAPH_ROOTS);
  expect(domRoots.size).toBeGreaterThan(MIN_TESTS_DOM_ROOTS);

  // 1. TOTAL + DISJOINT: every collected `.test-d.ts` lands in EXACTLY one of the two selected sets — no
  //    file is dropped by the exclude/include split, and none is claimed by both.
  const nodeSelectedSet = new Set(nodeSelected);
  const browserSelectedSet = new Set(browserSelected);
  const orphans = allTestD.filter((rel) => !(nodeSelectedSet.has(rel) || browserSelectedSet.has(rel)));
  expect(orphans).toEqual([]);
  const doubled = allTestD.filter((rel) => nodeSelectedSet.has(rel) && browserSelectedSet.has(rel));
  expect(doubled).toEqual([]);

  // 2. THE FIX ITSELF: `types-node` no longer collects a file its own tsconfig does not root — the class
  //    of "vacuous green" `ignoreSourceErrors` used to swallow is gone, not relocated. Every file
  //    `types-node` selects must be in `graphRoots`.
  for (const rel of nodeSelected) {
    expect(graphRoots.has(rel), `${rel} is selected by \`types-node\` but is NOT rooted by ${GRAPH} — the wrong-lib class #1313 removed has come back`).toBe(
      true,
    );
  }

  // 3. `types-browser`'s six files are real DOM-coupled escapees, not an arbitrary carve-out: none of them
  //    is rooted by the DOM-less graph (that is WHY they needed a second program), and all of them are
  //    rooted by `tsconfig.tests-dom.json` (that is what makes `types-browser` an honest check rather than
  //    a second vacuous one).
  expect(browserSelected.length).toBeGreaterThan(0);
  for (const rel of browserSelected) {
    expect(graphRoots.has(rel), `${rel} is checked by \`types-browser\` but ${GRAPH} ALSO roots it — the DOM split is unnecessary for this file`).toBe(false);
    expect(domRoots.has(rel), `${rel} is checked by \`types-browser\` but is NOT rooted by ${TESTS_DOM} — its own tsconfig does not own it`).toBe(true);
  }

  // 4. WHOLESALE, never per-file. `types-node`'s exclusions must come from the six-file `exclude` list
  //    landing files whose WHOLE tree is otherwise DOM-less-owned — not from `tsconfig.json` itself
  //    carving a per-file hole (the shape #1228/#1243 kept re-growing until both moves went wholesale).
  const graphTrees = new Set([...graphRoots].map(tree));
  for (const rel of browserSelected) {
    expect(
      graphTrees.has(tree(rel)),
      `${rel} is excluded from ${GRAPH} while ${tree(rel)}/** is otherwise included — a per-file escapee row, not the ratified wholesale-by-directory shape`,
    ).toBe(false);
  }
});

test("the root tsconfig's own exclude list still names the trees `types-browser` claims (the config is the authority, not this file)", ({ repoRoot }) => {
  // The second opinion on arm 4 above: read the config TEXT rather than `--showConfig`'s resolution. If a
  // tree is claimed by `types-browser` above but absent from the exclude list here, the two readings
  // disagree and the conclusion drawn from either is unsafe.
  const browser = typesProject("types-browser");
  const browserSelected = collectedTestD(repoRoot, browser.include);
  const browserTrees = [...new Set(browserSelected.map(tree))].toSorted();
  expect(browserTrees.length).toBeGreaterThan(0);
  const configText = readFileSync(join(repoRoot, GRAPH), "utf8");
  for (const t of browserTrees) {
    expect(
      configText.includes(`"${t}"`),
      `${t}/** is claimed by \`types-browser\` but ${GRAPH} carries no \`"${t}"\` exclude row — the two readings disagree`,
    ).toBe(true);
  }
});
