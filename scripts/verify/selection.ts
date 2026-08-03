// The ONE scope-selection resolver (UNIFIED-VERIFICATION-DESIGN.md §3.4) shared by every tier: a
// `verify --changed/--file/--package/--scope` selection derives, once, exactly which files each tool
// should see. The honest floor per tool: biome/eslint/docs = file; tsc = the owning package (file-scoped
// tsc is unsound); depcruise = file. A stage a scope can't honestly run is DEFERRED, never silently skipped.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

// ── the path-zone predicates + algebra (lifted verbatim from check/file.ts — kept in ONE place) ──
const TS_RE = /\.(?:ts|tsx|mts|cts)$/u;
// Mirrors the lint:eslint script's path list in package.json.
const ESLINT_RE = /^(?:packages\/(?:ui|client|server|kit|db|contracts)|tests\/ui|tests\/client)\/.*\.tsx?$/u;
const DEPCRUISE_RE = /^packages\/.*\.(?:ts|tsx|js|jsx|mts|cts)$/u;
const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;
// A changed ui/client src file → its test-layout mirror (packages/<pkg>/src/<path>.<ext> ↔ tests/<pkg>/
// <path>). Group 1 = pkg (ui|client), group 2 = the sub-path (sans extension). The suffix-swap is the
// same prefix-swap mirror the test-layout gate enforces (AGENTS.md §0.2).
const CT_MIRROR_SRC_RE = /^packages\/(ui|client)\/src\/(.+)\.(?:ts|tsx)$/u;
// A changed tests/**/*.ct.tsx selects ITSELF — but a `.suite.ct.tsx` (a cross-cutting property suite that
// mirrors no single module, Spine-Testing §1) is NOT mirror-selected; it rides sweeps only.
const CT_TEST_RE = /^tests\/(?:ui|client)\/.*\.ct\.tsx$/u;
const CT_SUITE_RE = /\.suite\.ct\.tsx$/u;
const DOCS_MD_RE = /^docs\/architecture\/.*\.md$/u;
const DOCS_PROPOSED_RE = /^docs\/architecture\/proposed\//u;
const SCOPE_GLOB_TAIL_RE = /\/\*\*$/u;
const TRAILING_SLASH_RE = /\/+$/u;

// ── the reach-back trees owned by NON-ancestor configs (the editor blind spot §2.1). These are the
// BROWSER tsx surfaces the root graph EXCLUDES by directory; each is claimed WITH dom by the ui/client
// config that reaches back into it (mirror of packages/{ui,client}/tsconfig.json `include`). ──
const GRAPH = "tsconfig.json";
const CLIENT_TSCONFIG = "packages/client/tsconfig.json";
const UI_TSCONFIG = "packages/ui/tsconfig.json";
// The root graph's `include: packages/*/src` sweeps EVERY package's src EXCEPT the two BROWSER packages it
// `exclude`s (ui + client are dom-typechecked by their own tsconfig — never in the DOM-less graph). So a
// NODE package's src IS a graph root; a browser package's is not. (Mirror of tsconfig.json include/exclude.)
const BROWSER_PACKAGES: ReadonlySet<string> = new Set(["ui", "client"]);
// The ONE client-owned CT file inside tests/support/ct (it import-pulls @orb/client — upward-cake, so it
// can NEVER be in ui's program). Every OTHER tsx under tests/support/ct is ui-owned (ct-providers.tsx).
const CT_CLIENT_OWNED = "tests/support/ct/ct-data-providers.tsx";
const TESTS_CLIENT_TSX_RE = /^tests\/client\/.*\.tsx$/u;
const TESTS_UI_TSX_RE = /^tests\/ui\/.*\.tsx$/u;
const CT_SUPPORT_TSX_RE = /^tests\/support\/ct\/.*\.tsx$/u;
const PLAYWRIGHT_TSX_DTS_RE = /^playwright\/.*\.(?:tsx|d\.ts)$/u;

/** Trees ONLY the root graph program sees as ROOTS (the whole-graph net the per-package lane + vitest
 *  miss). NOTE: this is the graph's ROOT membership (rule 4) — it does NOT capture the import-pull overlay
 *  (rule 5), which is a program fact resolved via {@link graphMembership}. */
/** Root-level config files JOINED the graph program 2026-08-03 (tsconfig.json `include` — they were
 *  typechecked by NO program, which let two dead Vitest-4 keys survive a major bump). Mirror of that
 *  include list; tsconfig-routing-parity reds if the two drift. playwright-ct.config.ts stays OUT on
 *  both sides (dual-vite type world — see tsconfig.json's comment). */
const ROOT_CONFIG_FILES: ReadonlySet<string> = new Set(["vitest.config.ts", "vitest.stryker.config.ts", "playwright.config.ts", "knip.ts"]);

/** The repo-root AMBIENT declaration pair — `reset.d.ts` (ts-reset) + `platform.d.ts` (the V8 14.6
 *  surfaces TS's libs lack; node-26 adoption program §1.2). Every program includes BOTH: the base's
 *  `${configDir}/../../<file>` covers kit/contracts/server, and the five configs that OVERRIDE the base
 *  include (tsconfig.json, tsconfig.tests-dom.json, packages/{ui,client,db}) list them explicitly. So
 *  their honest route is EVERY program, not the graph alone — an ambient edit changes every program's
 *  world. Measured 2026-08-03: the graph program carries `@types/node`, which independently declares
 *  Disposable/getOrInsert/isError, so a graph-only route MASKED 5 of 6 real per-package errors — exactly
 *  the false-green the routing algebra exists to prevent. (`tsconfig-routing-parity` cannot catch this:
 *  it filters `.d.ts` out of its universe, so these two files are unreconciled by construction.) */
const ROOT_AMBIENT_DTS: ReadonlySet<string> = new Set(["reset.d.ts", "platform.d.ts"]);

/** Every package program (the base-include consumers + the three that override it) — the route for a
 *  root ambient `.d.ts`. Mirrors tsconfig-routing-parity's CANDIDATE_TSCONFIGS minus the graph. */
const PACKAGE_TSCONFIGS: readonly string[] = [
  "packages/kit/tsconfig.json",
  "packages/contracts/tsconfig.json",
  "packages/db/tsconfig.json",
  "packages/server/tsconfig.json",
  UI_TSCONFIG,
  CLIENT_TSCONFIG,
];

function isGraphOnlyTree(rel: string): boolean {
  return rel.startsWith("tests/") || rel.startsWith("scripts/") || ROOT_AMBIENT_DTS.has(rel) || ROOT_CONFIG_FILES.has(rel);
}

/** The SET of tsconfig programs that CONTAIN this file (§2.2 — a file can belong to TWO programs: its
 *  package config WITH dom AND the DOM-less root graph via import-pull). Rules 1–4 are string algebra (the
 *  mirror of the configs' disjoint-by-directory include sets); rule 5 (the import-pull overlay) is a
 *  PROGRAM fact and is folded in by {@link programsFor} via the graph-membership set — NOT here. ∅ ⇒ the
 *  file is in no TS program (md/css/sh/…). */
export function staticPrograms(rel: string): readonly string[] {
  if (!TS_RE.test(rel)) {
    return [];
  }
  // 1. package source → its own package config (WITH dom for ui/client). A NODE package's src is ALSO a
  //    root of the DOM-less graph (tsconfig.json `include: packages/*/src` sweeps them; only the BROWSER
  //    packages ui/client are graph-EXCLUDED). So kit/server/db/contracts src belong to TWO programs
  //    statically; ui/client src belong only to their own dom program here (some are pulled into the graph
  //    via import — that's rule 5, the dynamic overlay in programsFor, since it's not a static root fact).
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    const own = `packages/${pkg}/tsconfig.json`;
    return BROWSER_PACKAGES.has(pkg) ? [own] : [own, GRAPH];
  }
  // 2. package-level config files named in a package include (client's vite.config.ts; db's
  //    drizzle.config.ts joined 2026-08-03 — the drizzle-kit audit's no-program-hole close).
  if (rel === "packages/client/vite.config.ts") {
    return [CLIENT_TSCONFIG];
  }
  if (rel === "packages/db/drizzle.config.ts") {
    return ["packages/db/tsconfig.json"];
  }
  // 3. the browser reach-back trees (owned by NON-ancestor configs — the editor blind spot §2.1).
  if (TESTS_CLIENT_TSX_RE.test(rel) || rel === CT_CLIENT_OWNED) {
    return [CLIENT_TSCONFIG];
  }
  if (TESTS_UI_TSX_RE.test(rel) || (CT_SUPPORT_TSX_RE.test(rel) && rel !== CT_CLIENT_OWNED) || PLAYWRIGHT_TSX_DTS_RE.test(rel)) {
    return [UI_TSCONFIG];
  }
  // 3b. the repo-root AMBIENT pair → EVERY program (see ROOT_AMBIENT_DTS: they are in every include, and
  //     a graph-only route lets the graph's @types/node mask per-package errors — a FALSE GREEN).
  if (ROOT_AMBIENT_DTS.has(rel)) {
    return [GRAPH, ...PACKAGE_TSCONFIGS];
  }
  // 4. the node graph roots (a .tsx here is claimed by rule 3 above — today none reach this arm).
  return isGraphOnlyTree(rel) ? [GRAPH] : [];
}

/** The programs (a SET) that CONTAIN `rel`, INCLUDING the import-pull overlay (rule 5): a package-src
 *  file that the DOM-less root graph transitively imports belongs to the graph program too (the TS2584
 *  class). `graphSrcMembers` is the cached set of repo-relative package-src files in the graph (from
 *  {@link graphMembership}); when it is undefined (cache cold) the caller falls back to the conservative
 *  "any package-src touch runs the graph" rule so the overlay is never UNDER-run. */
export function programsFor(rel: string, graphSrcMembers?: ReadonlySet<string>): readonly string[] {
  const base = staticPrograms(rel);
  // rule 5 — the import-pull overlay. Only package-src files can be pulled into the graph (the graph's
  // own roots are already GRAPH via rule 4; browser tsx is directory-excluded from the graph).
  if (PKG_SRC_RE.test(rel) && graphSrcMembers?.has(rel) && !base.includes(GRAPH)) {
    return [...base, GRAPH];
  }
  return base;
}

/** The CT (Playwright component-test) view on a selection (§3.4). Scoped CT is deliberately UNDER-selecting:
 *  it runs the changed files' test-layout mirrors + a small table of DECLARED blast-radius sweeps — never
 *  the whole suite. This is honest because a scoped green is NEVER the coverage verdict; the push bar
 *  (`tests:node` composing the whole `pnpm test:ct --retries=2`) is. `mode`:
 *   - `"skip"` ⇒ no CT-relevant change → the stage is a no-op this run;
 *   - `"files"` ⇒ run exactly the mirror `.ct.tsx` files in `targets`;
 *   - `"sweep"` ⇒ a blast-radius trigger fired → run the sweep DIRS in `targets` (a dir arg = every
 *     `.ct.tsx` under it, incl. the `.suite.ct.tsx` cross-cutting suites). */
export type CtView = {
  readonly mode: "skip" | "files" | "sweep";
  /** Concrete `.ct.tsx` mirror files (mode "files") OR sweep directories (mode "sweep"), repo-relative posix. */
  readonly targets: readonly string[];
};

/** The resolved selection — the superset every stage's `scopedArgv` reads from (§3.4). */
export type Selection = {
  /** The kind of scope this run covers, for the summary header + the artifact. */
  readonly kind: "changed" | "file" | "package" | "scope" | "whole";
  readonly label: string;
  /** Every selected repo-relative posix path (deletions KEPT — mirror-expansion needs them, §3.4). */
  readonly paths: readonly string[];
  /** paths ∩ the eslint surface ∩ EXISTING. A deleted path is dropped here: eslint takes concrete file
   *  args and hard-ERRORS ("No files matching the pattern") on a path that's gone — it stays in `paths`
   *  (the structure walk reasons about deletions) and still drives its owning tsconfig via `tsconfigs`. */
  readonly eslintPaths: readonly string[];
  /** paths ∩ packages/ TS/JS ∩ EXISTING (depcruise's guard; a deleted path is dropped — depcruise can't
   *  open it, same reasoning as eslintPaths). */
  readonly depcruisePaths: readonly string[];
  /** paths ∩ docs/architecture/**.md (excluding proposed/) ∩ EXISTING (a deleted .md can't be format-checked). */
  readonly docsPaths: readonly string[];
  /** The distinct OWNING tsconfigs the selection touches (the honest per-package tsc floor). */
  readonly tsconfigs: readonly string[];
  /** Does the selection touch tests/ · scripts/ · reset.d.ts (the graph-only trees)? */
  readonly touchesGraphOnlyTrees: boolean;
  /** The Playwright CT view: which `.ct.tsx` mirrors / sweep dirs this selection runs (§3.4). */
  readonly ct: CtView;
  /** The `tsx scripts/check/scoped.ts …` argv that scopes the structure gates' WALK to this selection. */
  readonly checkScopeArgv: readonly [string, ...string[]];
  /** For a git-derived selection: the ref vitest `--changed` / depcruise `--affected` compare against.
   *  undefined for an explicit-path selection (vitest --changed with no ref = staged+unstaged vs HEAD). */
  readonly gitRef: string | undefined;
};

export type SelectionRequest =
  | { readonly kind: "changed"; readonly paths: readonly string[] } // explicit paths, else git diff
  | { readonly kind: "file"; readonly paths: readonly string[] } // sugar for changed + explicit paths
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "scope"; readonly glob: string };

const ROOT = process.cwd();

/** The git-changed set: `git diff --name-only HEAD` (staged + unstaged vs HEAD), repo-relative posix. */
function gitChangedPaths(): readonly string[] {
  const res = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git diff failed: ${res.stderr?.trim() ?? "unknown error"}`);
  }
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Normalize a caller-supplied path (abs or cwd-relative) to a repo-relative posix path. A path outside
 *  the repo is dropped. Deletions are KEPT (a path that no longer exists on disk stays in the set). */
function toRepoRel(arg: string): string | undefined {
  const abs = isAbsolute(arg) ? arg : resolve(ROOT, arg);
  const rel = relative(ROOT, abs);
  return rel.startsWith("..") ? undefined : rel;
}

function packageDir(name: string): string {
  return name.startsWith("@orb/") ? name.slice("@orb/".length) : name;
}

// ── the import-pull overlay cache (rule 5) — the graph program's package-src membership (§2.2) ──────────
// `ts7 -p tsconfig.json --listFilesOnly` lists the graph's TRUE membership; we keep only the
// repo-relative packages/*/src files (the overlay set — everything else is a graph ROOT or node_modules).
// Cached under node_modules/.cache (gitignored, per-worktree — the tsbuildinfo convention), keyed on the
// git HEAD + a hash of the dirty working set: a src edit changes the dirty key, a commit changes HEAD, so
// the cache refreshes exactly when the import graph could have moved. Cache MISS or a ts7 failure ⇒
// undefined ⇒ programsFor falls back to the conservative "any package-src runs the graph" rule (never
// under-runs the overlay). The heavy ts7 spawn happens ONCE per key, not per file.
const GRAPH_MEMBERSHIP_CACHE = "node_modules/.cache/graph-membership.json";
const PKG_SRC_ABS_RE = /\/(packages\/[^/]+\/src\/.*\.(?:ts|tsx|mts|cts))$/u;

type MembershipCache = { readonly key: string; readonly members: readonly string[] };

/** A stable key for the graph's import closure: HEAD commit + a digest of `git status --porcelain` (the
 *  dirty working set). Cheap; recomputed each run, but the ts7 spawn only fires on a key change. */
function graphMembershipKey(): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  const headSha = head.status === 0 ? head.stdout.trim() : "no-head";
  const dirtyText = dirty.status === 0 ? dirty.stdout : "";
  const dirtyDigest = createHash("sha1").update(dirtyText).digest("hex");
  return `${headSha}:${dirtyDigest}`;
}

/** Read the cached overlay set iff its key matches the current one, else undefined (miss/stale/corrupt). */
function readMembershipCache(key: string): ReadonlySet<string> | undefined {
  const path = join(ROOT, GRAPH_MEMBERSHIP_CACHE);
  if (!existsSync(path)) {
    return;
  }
  let cache: MembershipCache | undefined;
  try {
    cache = JSON.parse(readFileSync(path, "utf8")) as MembershipCache;
  } catch {
    cache = undefined; // corrupt/unreadable cache → a miss.
  }
  return cache !== undefined && cache.key === key ? new Set(cache.members) : undefined;
}

// ts7's --listFilesOnly on the whole graph is ~5,400 absolute paths (~0.5MB); 64MiB is generous headroom.
const LIST_FILES_MAX_BUFFER = 67_108_864;

/** Compute the graph's package-src membership via ts7 `--listFilesOnly` (the same scripts/ts7.cjs wrapper
 *  the typecheck scripts use), or undefined on any failure. */
function computeMembership(): readonly string[] | undefined {
  const ts7 = join(ROOT, "scripts", "ts7.cjs");
  const res = spawnSync(process.execPath, [ts7, "--noEmit", "--listFilesOnly", "-p", "tsconfig.json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") {
    return;
  }
  const members: string[] = [];
  for (const line of res.stdout.split("\n")) {
    const rel = PKG_SRC_ABS_RE.exec(line.trim())?.[1];
    if (rel !== undefined && !line.includes("/node_modules/")) {
      members.push(rel);
    }
  }
  return members;
}

/** The graph program's package-src overlay set (rule 5), cached on HEAD+dirty. undefined ⇒ tsgo/cache
 *  unavailable ⇒ the conservative fallback applies. Memoized per process. */
let membershipMemo: { readonly key: string; readonly set: ReadonlySet<string> | undefined } | undefined;
function graphMembership(): ReadonlySet<string> | undefined {
  const key = graphMembershipKey();
  if (membershipMemo?.key === key) {
    return membershipMemo.set;
  }
  let set = readMembershipCache(key);
  if (set === undefined) {
    const members = computeMembership();
    if (members !== undefined) {
      const path = join(ROOT, GRAPH_MEMBERSHIP_CACHE);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify({ key, members } satisfies MembershipCache)}\n`);
      set = new Set(members);
    }
  }
  membershipMemo = { key, set };
  return set;
}

/** Filter helpers over a repo-relative path set. */
function filterPaths(paths: readonly string[], pred: (p: string) => boolean): readonly string[] {
  return paths.filter(pred);
}

/** True iff a repo-relative path currently exists on disk. A git-changed set (`git diff --name-only HEAD`)
 *  KEEPS deletions; the per-tool file-list views (eslint/depcruise/docs — each hands CONCRETE file args to
 *  a child that errors on a nonexistent path) must drop them, while `paths` + `tsconfigs` keep them (the
 *  structure walk + the deleted file's OWNING per-package typecheck legitimately reason about a deletion). */
function existsRel(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const GRAPH_TSCONFIG = "tsconfig.json";

/** The distinct PACKAGE-level owning tsconfigs a selection touches (the honest per-package tsc floor). The
 *  root GRAPH program is EXCLUDED here — it is a separate stage (`types:graph`), driven by the graph flag,
 *  not a per-package `tsc -p`. */
function distinctTsconfigs(paths: readonly string[], graphSrc: ReadonlySet<string> | undefined): readonly string[] {
  const owners = new Set<string>();
  for (const p of paths) {
    for (const cfg of programsFor(p, graphSrc)) {
      if (cfg !== GRAPH_TSCONFIG) {
        owners.add(cfg);
      }
    }
  }
  return [...owners];
}

/** Does the selection put ANY file in the root GRAPH program — either as a graph ROOT (tests/scripts/
 *  reset.d.ts) or via the import-pull overlay (a package-src file the graph transitively imports)? Drives
 *  the `types:graph` stage at a scoped tier. Authoritative = `programsFor` includes GRAPH; the ONE
 *  exception is the cache-cold fallback: a package-src file the overlay can't confirm is conservatively
 *  treated as in-graph so `types:graph` is never UNDER-run. Browser tsx under tests/ is NOT in the graph
 *  (it's directory-excluded, routed to ui/client) — `programsFor` already reflects that. */
function touchesGraph(paths: readonly string[], graphSrc: ReadonlySet<string> | undefined): boolean {
  return paths.some((p) => {
    if (programsFor(p, graphSrc).includes(GRAPH)) {
      return true;
    }
    // Cache-cold conservative fallback: a package-src file whose graph membership we couldn't compute.
    return graphSrc === undefined && PKG_SRC_RE.test(p);
  });
}

// ── the CT (Playwright component-test) view — the ONE deliberately-open edge of the verification surface
// (UNIFIED-VERIFICATION-DESIGN.md §3.4, owner-ratified 2026-07-17). Scoped CT is UNDER-selecting BY DESIGN:
// the mirror map (base case) + a SMALL table of DECLARED blast-radius sweeps (the classes that make
// mirror-only a lying green). This is honest ONLY because a scoped green is never the coverage verdict —
// the push bar (`tests:node` running the WHOLE `pnpm test:ct --retries=2`) is. ───────────────────────────

/** A blast-radius sweep trigger: a changed path matching `test` escalates from mirror-selection to running
 *  every `.ct.tsx` under the `dirs` — because a change to this path class throws in tests the mirror map
 *  can't reach (a lying mirror-only green). Each row carries its incident class. Kept SMALL and honest. */
type SweepTrigger = { readonly test: (rel: string) => boolean; readonly dirs: readonly string[]; readonly why: string };

const PREFIX =
  (p: string) =>
  (rel: string): boolean =>
    rel.startsWith(p);

const CT_SWEEP_TRIGGERS: readonly SweepTrigger[] = [
  // ui skin/token/lib fragments surface in computed-style assertions EVERYWHERE (the light-dark()/31-assertion
  // incident class) — a token or shared-lib edit can flip a color/spacing assertion in any mounted component.
  {
    test: PREFIX("packages/ui/src/tokens/"),
    dirs: ["tests/ui", "tests/client"],
    why: "token change → computed-style assertions everywhere (light-dark()/31-assertion class)",
  },
  { test: PREFIX("packages/ui/src/styles/"), dirs: ["tests/ui", "tests/client"], why: "skin-fragment change → computed-style assertions everywhere" },
  { test: PREFIX("packages/ui/src/lib/"), dirs: ["tests/ui", "tests/client"], why: "shared ui lib change → any mounted component" },
  // a client registry/provider/factory throws in EVERY story (the section-registry incident class).
  { test: PREFIX("packages/client/src/state/"), dirs: ["tests/client"], why: "client state/registry/provider change → every story (section-registry class)" },
  { test: PREFIX("packages/client/src/data/"), dirs: ["tests/client"], why: "client data-layer change → every story" },
  { test: PREFIX("packages/client/src/forms/"), dirs: ["tests/client"], why: "client forms factory change → every story" },
  { test: PREFIX("packages/client/src/lib/"), dirs: ["tests/client"], why: "shared client lib change → every story" },
  // the CT harness itself (providers/route-stubs, the mount html/tsx, the config) → both trees.
  { test: PREFIX("tests/support/"), dirs: ["tests/ui", "tests/client"], why: "CT harness (providers/route-stubs) change → both trees" },
  { test: PREFIX("playwright/"), dirs: ["tests/ui", "tests/client"], why: "CT mount html/tsx change → both trees" },
  { test: (rel) => rel === "playwright-ct.config.ts", dirs: ["tests/ui", "tests/client"], why: "CT config change → both trees" },
  // SHARED GROUP CORES inside ui: a module consumed by N sibling primitives sweeps its group's mirror dir;
  // a self-contained primitive dir stays mirror-only. Derived from the packages/ui/src tree:
  //   • charts/chart/** — the frame/axis core every chart (bar-list/heatmap/histogram/…) consumes.
  //   • markdown/** internals (policy/shiki-plugin/math) — shared by the markdown seal's rendering.
  { test: PREFIX("packages/ui/src/charts/chart/"), dirs: ["tests/ui/charts"], why: "chart core consumed by every chart primitive → sweep the charts group" },
  { test: PREFIX("packages/ui/src/markdown/"), dirs: ["tests/ui/markdown"], why: "markdown internals shared by the markdown seal → sweep the markdown group" },
];

/** The mirror `.ct.tsx` a single changed path contributes, or undefined (no CT contribution). A changed
 *  `tests/<pkg>/…​.ct.tsx` selects ITSELF (never a `.suite.ct.tsx` — it mirrors no single module); a
 *  ui/client src file selects its test-layout mirror IFF that mirror exists on disk (no mirror, no
 *  contribution). */
function ctMirrorFor(rel: string): string | undefined {
  if (CT_TEST_RE.test(rel)) {
    return CT_SUITE_RE.test(rel) ? undefined : rel;
  }
  const m = CT_MIRROR_SRC_RE.exec(rel);
  if (m === null) {
    return;
  }
  const mirror = `tests/${m[1]}/${m[2]}.ct.tsx`;
  return existsRel(mirror) ? mirror : undefined;
}

/** The CT view for a changed set: the mirror files (base case) UNION the declared blast-radius sweeps. A
 *  sweep, if ANY trigger fires, SUPERSEDES the file list (a dir arg runs its whole subtree — a superset of
 *  the individual mirrors, and it also picks up the `.suite.ct.tsx` cross-cutting suites). */
function ctView(paths: readonly string[]): CtView {
  const sweepDirs = new Set<string>();
  const files = new Set<string>();
  for (const rel of paths) {
    for (const trig of CT_SWEEP_TRIGGERS) {
      if (trig.test(rel)) {
        for (const d of trig.dirs) {
          sweepDirs.add(d);
        }
      }
    }
    const mirror = ctMirrorFor(rel);
    if (mirror !== undefined) {
      files.add(mirror);
    }
  }
  if (sweepDirs.size > 0) {
    return { mode: "sweep", targets: [...sweepDirs] };
  }
  return files.size > 0 ? { mode: "files", targets: [...files] } : { mode: "skip", targets: [] };
}

/** Build the derived views (eslint/depcruise/docs/tsconfigs/graph flag) from a repo-relative path set. */
function deriveViews(paths: readonly string[]): {
  readonly eslintPaths: readonly string[];
  readonly depcruisePaths: readonly string[];
  readonly docsPaths: readonly string[];
  readonly tsconfigs: readonly string[];
  readonly touchesGraphOnlyTrees: boolean;
  readonly ct: CtView;
} {
  const graphSrc = graphMembership();
  return {
    // The three file-list views drop deletions (existsRel) — their child tools take concrete file args and
    // error on a path that's gone. tsconfigs/graph/paths below KEEP deletions (see existsRel's note).
    eslintPaths: filterPaths(paths, (p) => ESLINT_RE.test(p) && existsRel(p)),
    depcruisePaths: filterPaths(paths, (p) => DEPCRUISE_RE.test(p) && existsRel(p)),
    docsPaths: filterPaths(paths, (p) => DOCS_MD_RE.test(p) && !DOCS_PROPOSED_RE.test(p) && existsRel(p)),
    tsconfigs: distinctTsconfigs(paths, graphSrc),
    // `touchesGraphOnlyTrees` KEEPS its field name (downstream registry contract) but now means "puts any
    // file in the GRAPH program" — graph roots (tests/scripts/reset.d.ts) OR the import-pull overlay.
    touchesGraphOnlyTrees: touchesGraph(paths, graphSrc),
    ct: ctView(paths),
  };
}

/** Resolve a `changed`/`file` selection from explicit paths (or git when none given). */
function resolveChanged(kind: "changed" | "file", explicit: readonly string[]): Selection {
  const raw = explicit.length > 0 ? explicit : gitChangedPaths();
  const paths = [...new Set(raw.map(toRepoRel).filter((p): p is string => p !== undefined))];
  const gitRef = explicit.length > 0 ? undefined : "HEAD";
  const label = `${kind} (${paths.length} file${paths.length === 1 ? "" : "s"})`;
  return {
    kind,
    label,
    paths,
    ...deriveViews(paths),
    checkScopeArgv: paths.length > 0 ? ["tsx", "scripts/check/scoped.ts", "--changed", ...paths] : ["tsx", "scripts/check/scoped.ts", "--changed"],
    gitRef,
  };
}

/** Resolve a `--package <name>` selection. The check:scope side uses --package natively; the tool views
 *  use the package src prefix (a package run is whole-package, so no explicit file list is threaded to
 *  biome/eslint here — they run over the package via check:scope's fileset only for structure; biome/
 *  eslint/tsc take the package prefix as a folder arg). */
function resolvePackage(name: string): Selection {
  const dir = packageDir(name);
  const prefix = `packages/${dir}/`;
  // A package selection's "paths" is the prefix itself — biome/eslint accept a directory arg, tsc uses the
  // owning tsconfig, depcruise takes the prefix. The concrete file enumeration is left to each tool.
  const paths: readonly string[] = [prefix];
  return {
    kind: "package",
    label: `package ${dir}`,
    paths,
    eslintPaths: ESLINT_RE.test(`${prefix}x.ts`) ? [prefix] : [],
    depcruisePaths: [prefix],
    docsPaths: [],
    tsconfigs: [`packages/${dir}/tsconfig.json`],
    // A NODE package's src ARE graph roots → --package runs types:graph (the DOM-less lens catches what the
    // package's own dom-tsconfig can't — the TS2584 class). Browser packages (ui/client) are graph-EXCLUDED,
    // so graph honestly defers. This keeps --package consistent with --changed on the same package's files.
    touchesGraphOnlyTrees: !BROWSER_PACKAGES.has(dir),
    // A whole-package scope over a BROWSER package sweeps that package's whole mirror tree (the honest floor
    // for "everything in ui/client changed"); a node package contributes no CT. Prefix-based, so it doesn't
    // route through the per-file mirror map (paths here is a bare prefix, not a concrete .tsx file).
    ct: BROWSER_PACKAGES.has(dir) ? { mode: "sweep", targets: [`tests/${dir}`] } : { mode: "skip", targets: [] },
    checkScopeArgv: ["tsx", "scripts/check/scoped.ts", "--package", dir],
    gitRef: undefined,
  };
}

/** Resolve a `--scope <folder-glob>` selection. */
function resolveScope(glob: string): Selection {
  const prefix = glob.replace(SCOPE_GLOB_TAIL_RE, "").replace(TRAILING_SLASH_RE, "");
  const paths: readonly string[] = [prefix];
  return {
    kind: "scope",
    label: `scope ${glob}`,
    paths,
    eslintPaths: ESLINT_RE.test(`${prefix}/x.ts`) ? [prefix] : [],
    depcruisePaths: prefix.startsWith("packages/") ? [prefix] : [],
    docsPaths: prefix.startsWith("docs/architecture") ? [prefix] : [],
    // A folder scope: use the conservative fallback (undefined overlay) — a packages/*/src scope then also
    // runs the graph, the honest floor for a whole-folder run.
    tsconfigs: distinctTsconfigs([`${prefix}/x.ts`], undefined),
    touchesGraphOnlyTrees: touchesGraph([`${prefix}/x.ts`], undefined),
    // The sweep triggers are prefix-tests, so a folder scope under a declared blast-radius (e.g.
    // `--scope packages/ui/src/tokens`) escalates to the matching sweep; a scope with no trigger is skip
    // (the per-file mirror map needs a concrete .tsx path, which a folder glob is not).
    ct: ctView([prefix]),
    checkScopeArgv: ["tsx", "scripts/check/scoped.ts", "--scope", glob],
    gitRef: undefined,
  };
}

/** Resolve a scope request into the shared Selection every stage's scopedArgv reads. */
export function resolveSelection(req: SelectionRequest): Selection {
  switch (req.kind) {
    case "changed":
      return resolveChanged("changed", req.paths);
    case "file":
      return resolveChanged("file", req.paths);
    case "package":
      return resolvePackage(req.name);
    case "scope":
      return resolveScope(req.glob);
  }
}

/** A caller-facing existence check for `--file` paths (the check:file muscle memory refused bad paths). */
export function badPaths(paths: readonly string[]): readonly string[] {
  return paths.filter((p) => {
    const abs = isAbsolute(p) ? p : resolve(ROOT, p);
    const rel = relative(ROOT, abs);
    return rel.startsWith("..") || !existsSync(abs);
  });
}
