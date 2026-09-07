// WHICH TS PROGRAM(S) OWN A FILE (UNIFIED-VERIFICATION-DESIGN.md §2.1-§2.2) — the algebra behind the
// scoped `types:packages` / `types:graph` decisions, plus the import-pull overlay that makes it honest.
// Split out of lib/selection.ts at the @orb/tooling P6 move (size cap §4.3); the rules are unchanged.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { BROWSER_PACKAGES } from "@orb/tooling/_shared/project-worlds";
import { GIT_READ_PREFIX, ROOT } from "./repo-paths.ts";

const TS_RE = /\.(?:ts|tsx|mts|cts)$/u;
const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;

// ── the WORLD partition of the test surface (type-worlds program, #1351). The root graph is the NODE world
// and EXCLUDES the browser trees by directory + suffix; tsconfig.tests-dom.json is the BROWSER-TESTS world and
// ROOTS exactly those trees. Nothing here names a file: the tests-dom side is read from that config's own
// `include` (rule 3d), and the two rules below are the only shapes it uses. ──
const GRAPH = "tsconfig.json";
const CLIENT_TSCONFIG = "packages/client/tsconfig.json";
const UI_TSCONFIG = "packages/ui/tsconfig.json";
const TESTS_DOM_TSCONFIG = "tsconfig.tests-dom.json";

// The root graph's `include: packages/*/src` sweeps EVERY package's src EXCEPT the BROWSER packages it
// `exclude`s (ui + client are dom-typechecked by their own tsconfig — never in the DOM-less graph). So a
// NODE package's src IS a graph root; a browser package's is not. The set is the world model's
// (`_shared/project-worlds.ts` PACKAGE_WORLDS); the selection algebra imports it from there too.

// Every `.tsx` under tests/ or playwright/ is React under playwright-ct, rooted by the browser-tests world
// (tsconfig.tests-dom.json `tests/**/*.tsx` + `playwright/**/*.tsx`); the CT mount's `.d.ts` rides with it.
const BROWSER_TSX_RE = /^(?:tests|playwright)\/.*\.tsx$/u;
const PLAYWRIGHT_DTS_RE = /^playwright\/.*\.d\.ts$/u;

/** Root-level config files JOINED the graph program 2026-08-03 (tsconfig.json `include` — they were
 *  typechecked by NO program, which let two dead Vitest-4 keys survive a major bump). Mirror of that
 *  include list; tsconfig-routing-parity reds if the two drift. playwright-ct.config.ts stays OUT on
 *  both sides (dual-vite type world — see tsconfig.json's comment). */
const ROOT_CONFIG_FILES: ReadonlySet<string> = new Set(["vitest.config.ts", "vitest.stryker.config.ts", "playwright.config.ts", "knip.ts"]);

/** The repo-root AMBIENT declaration pair — `reset.d.ts` (ts-reset) + `platform.d.ts` (the V8 14.6
 *  surfaces TS's libs lack; node-26 adoption program §1.2). Every program includes BOTH: the base's
 *  `${configDir}/../../<file>` covers kit/contracts/server, and the five configs that OVERRIDE the base
 *  include (tsconfig.json, tsconfig.tests-dom.json, `packages/{ui,client,db}`) list them explicitly. So
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
  "tooling/tsconfig.json",
  UI_TSCONFIG,
  CLIENT_TSCONFIG,
  TESTS_DOM_TSCONFIG,
];

// ── tsconfig.tests-dom.json membership — DERIVED from that config's own `include`, never hand-mirrored
// (#1274 — the router previously carried NO route for this program at all; a hand-copied second glob list
// here would be the exact rot class tsconfig-routing-parity exists to catch, so instead we read the config
// as ground truth and parse its own array). ──

/** A directory-glob `include` entry of the shape `<dir>/**​/*.ts` or `<dir>/**​/*.tsx` (the only glob shapes
 *  this config uses — see its own header). Captures `<dir>` and the extension. */
const TESTS_DOM_DIR_GLOB_RE = /^(.+)\/\*\*\/\*\.(tsx?)$/u;

interface TestsDomInclude {
  /** Exact repo-relative `include` entries (literal `.ts`/`.tsx` files — never `.d.ts`; those are ambient
   *  and already routed by an earlier rule: rule 1 for package-src, rule 3b for the root ambient pair). */
  readonly literals: ReadonlySet<string>;
  /** Directory prefixes from a `<dir>/**​/*.ts` / `<dir>/**​/*.tsx` entry, each with the extension its glob
   *  names — matches any file of THAT extension (never `.d.ts`) under the directory tree, mirroring tsc's own
   *  glob semantics for this program. */
  readonly dirGlobs: readonly { readonly prefix: string; readonly ext: "ts" | "tsx" }[];
}

let testsDomIncludeMemo: TestsDomInclude | undefined;

/** Parse `tsconfig.tests-dom.json`'s own `include` array (JSONC — the file carries `//` line comments) into
 *  a membership predicate. Memoized: the config only changes with a commit, and this module is loaded once
 *  per process. */
function testsDomInclude(): TestsDomInclude {
  if (testsDomIncludeMemo !== undefined) {
    return testsDomIncludeMemo;
  }
  const raw = readFileSync(join(ROOT, TESTS_DOM_TSCONFIG), "utf8");
  const withoutComments = raw
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/u, ""))
    .join("\n");
  const parsed = JSON.parse(withoutComments) as { readonly include?: readonly string[] };
  const literals = new Set<string>();
  const dirGlobs: { readonly prefix: string; readonly ext: "ts" | "tsx" }[] = [];
  for (const entry of parsed.include ?? []) {
    const globMatch = TESTS_DOM_DIR_GLOB_RE.exec(entry);
    if (globMatch?.[1] !== undefined) {
      dirGlobs.push({ prefix: globMatch[1], ext: globMatch[2] === "tsx" ? "tsx" : "ts" });
    } else if (TS_RE.test(entry) && !entry.endsWith(".d.ts")) {
      literals.add(entry);
    }
    // else: an ambient `.d.ts` entry — already routed by rule 1 (package-src) or rule 3b (the root pair).
  }
  testsDomIncludeMemo = { literals, dirGlobs };
  return testsDomIncludeMemo;
}

/** Is `rel` a ROOT of `tsconfig.tests-dom.json` — a literal `include` entry, or a file of the glob's extension
 *  (never `.d.ts`) under one of its directory-glob prefixes? */
function isTestsDomRoot(rel: string): boolean {
  const { literals, dirGlobs } = testsDomInclude();
  if (literals.has(rel)) {
    return true;
  }
  if (rel.endsWith(".d.ts")) {
    return false;
  }
  return dirGlobs.some(({ prefix, ext }) => rel.endsWith(`.${ext}`) && rel.startsWith(`${prefix}/`));
}

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
  // 3. browser tsx anywhere under tests/ or playwright/ (+ the CT mount's .d.ts) → the browser-tests world.
  //    (Also derivable from tests-dom's own include via rule 3d; stated here so the suffix rule reads as law.)
  if (BROWSER_TSX_RE.test(rel) || PLAYWRIGHT_DTS_RE.test(rel)) {
    return [TESTS_DOM_TSCONFIG];
  }
  // 3b. the repo-root AMBIENT pair → EVERY program (see ROOT_AMBIENT_DTS: they are in every include, and
  //     a graph-only route lets the graph's @types/node mask per-package errors — a FALSE GREEN).
  if (ROOT_AMBIENT_DTS.has(rel)) {
    return [GRAPH, ...PACKAGE_TSCONFIGS];
  }
  // 3c. @orb/tooling src → its own package program AND the DOM-less graph (tsconfig.json includes
  //     `tooling/src` as roots — the same two-program shape as a node package's src, rule 1).
  if (rel.startsWith("tooling/src/")) {
    return ["tooling/tsconfig.json", GRAPH];
  }
  // 3d. the DOM-coupled test escapees tsconfig.tests-dom.json owns (#1274 — DERIVED from that config's own
  //     `include`, see testsDomInclude()). MUST run before rule 4: the root graph's `exclude` (mirrored by
  //     isGraphOnlyTree's blanket "tests/" prefix test below) excludes every one of these files, so without
  //     this rule they fell through to a GRAPH route the compiler does not actually honor — a route the
  //     tsconfig-routing-parity gate's MIRROR arm would red on (staticPrograms says GRAPH; tsgo disagrees).
  if (isTestsDomRoot(rel)) {
    return [TESTS_DOM_TSCONFIG];
  }
  // 4. the node graph roots (a .tsx never reaches this arm — rule 3 claims every one).
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
  if (PKG_SRC_RE.test(rel) && graphSrcMembers?.has(rel) === true && !base.includes(GRAPH)) {
    return [...base, GRAPH];
  }
  return base;
}

// ── the import-pull overlay cache (rule 5) — the graph program's package-src membership (§2.2) ──────────
// `ts7 -p tsconfig.json --listFilesOnly` lists the graph's TRUE membership; we keep only the
// repo-relative packages/*/src files (the overlay set — everything else is a graph ROOT or node_modules).
// Cached under node_modules/.cache (gitignored, per-worktree — the tsbuildinfo convention), keyed on the
// git HEAD + a digest of the working tree's DELTA FROM IT — every dirty path AND THE BYTES AT THAT PATH
// (see {@link graphMembershipKey}), so the cache refreshes exactly when the compiler's input could have
// moved. Cache MISS or a ts7 failure ⇒ undefined ⇒ touchesGraph falls back to the conservative "any
// package-src runs the graph" rule (never under-runs the overlay). The heavy ts7 spawn happens ONCE per
// key, not per file.
const GRAPH_MEMBERSHIP_CACHE = "node_modules/.cache/graph-membership.json";
const PKG_SRC_ABS_RE = /\/(packages\/[^/]+\/src\/.*\.(?:ts|tsx|mts|cts))$/u;

interface MembershipCache {
  readonly key: string;
  readonly members: readonly string[];
}

/** The two halves of "which paths can differ from HEAD's tree". `diff --name-only HEAD` covers the
 *  TRACKED side (modifications, staged adds, deletions, and both sides of a rename); `ls-files --others`
 *  covers the UNTRACKED side and lists FILES — `status --porcelain` collapses an all-untracked directory
 *  to one `??` entry, and a directory has no bytes to digest. */
// `--no-optional-locks` on both (#1583): `git diff HEAD` opportunistically refreshes the index's stat
// cache and takes `.git/index.lock` to do it, so a checker that only READS was holding the operator's
// index for the length of a stage. The flag is git's own reader posture and changes no output; the one
// home of the prefix + the full receipt is `lib/repo-paths.ts`.
const WORKING_TREE_DELTA_COMMANDS: readonly (readonly string[])[] = [
  [...GIT_READ_PREFIX, "diff", "--name-only", "HEAD"],
  [...GIT_READ_PREFIX, "ls-files", "--others", "--exclude-standard"],
];

interface WorkingTreeDelta {
  /** Repo-relative paths whose content can differ from HEAD's tree, sorted (digest order must be stable). */
  readonly paths: readonly string[];
  /** The commands that FAILED. Folded into the key so a broken git can never mint a clean-tree key. */
  readonly failures: readonly string[];
}

function workingTreeDelta(root: string): WorkingTreeDelta {
  const paths = new Set<string>();
  const failures: string[] = [];
  for (const args of WORKING_TREE_DELTA_COMMANDS) {
    const res = runNicedSync("git", args, { cwd: root });
    if (res.status !== 0) {
      failures.push(args.join(" "));
      continue;
    }
    for (const line of res.stdout.split("\n")) {
      const rel = line.trim();
      if (rel !== "") {
        paths.add(rel);
      }
    }
  }
  return { paths: [...paths].sort(), failures };
}

/** A stable key for the graph's import closure: the HEAD commit + a digest of the working tree's DELTA
 *  from it — each dirty path AND THE SHA1 OF ITS CURRENT BYTES.
 *
 *  Hashing the BYTES is load-bearing, not belt-and-braces (#1264). Until 2026-09-02 the second half was a
 *  digest of `git status --porcelain`, which is a list of PATHS AND STATUS CODES: two different working
 *  trees with the same dirty path set mint the SAME key, so the cache served a membership set computed
 *  from DIFFERENT bytes. On a clean tree that never bit — the digest is constant and HEAD alone
 *  invalidates it on every commit — but a lane worktree keeps roughly one dirty path set for a whole
 *  session, so the FIRST compute froze and every later edit rode a stale set. Measured on the unmodified
 *  source: adding `import "@orb/ui/button"` to an already-dirty `tests/` file moved the graph from 7 to 34
 *  ui src files (ts7 `--listFilesOnly`) while the key did not move at all, so `touchesGraph` answered
 *  FALSE for a file the graph now contains — an UNDER-run of the overlay, the exact failure the cold-cache
 *  fallback exists to prevent, and `types:graph` would have been skipped at a scoped tier.
 *
 *  `root` is a parameter (not just {@link ROOT}) so the key's content-sensitivity is provable against a
 *  temp git repo instead of by mutating the checkout under test. */
export function graphMembershipKey(root: string = ROOT): string {
  const head = runNicedSync("git", [...GIT_READ_PREFIX, "rev-parse", "HEAD"], { cwd: root });
  const headSha = head.status === 0 ? head.stdout.trim() : "no-head";
  const delta = workingTreeDelta(root);
  const digest = createHash("sha1");
  for (const failure of delta.failures) {
    digest.update(`!${failure}\n`);
  }
  for (const rel of delta.paths) {
    const abs = join(root, rel);
    // A path in the delta that is GONE (a deletion, or a rename's old side) has no bytes; its presence in
    // the path list is already the signal, so the marker keeps the entry without a read.
    const content = existsSync(abs) ? createHash("sha1").update(readFileSync(abs)).digest("hex") : "-";
    digest.update(`${rel}\0${content}\n`);
  }
  return `${headSha}:${digest.digest("hex")}`;
}

/** Read the cached overlay set iff its key matches the current one, else undefined (miss/stale/corrupt). */
function readMembershipCache(key: string): ReadonlySet<string> | undefined {
  const path = join(ROOT, GRAPH_MEMBERSHIP_CACHE);
  if (!existsSync(path)) {
    return;
  }
  let cache: MembershipCache | undefined;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): optional-read-as-absent — a corrupt/unreadable cache becomes a miss, which the caller recomputes from scratch via ts7 rather than trusting. Ends if the caller stops recomputing on a cache miss.
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
  const res = runNicedSync(process.execPath, [ts7, "--noEmit", "--listFilesOnly", "-p", "tsconfig.json"], {
    cwd: ROOT,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0) {
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
export function graphMembership(): ReadonlySet<string> | undefined {
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

const GRAPH_TSCONFIG = "tsconfig.json";

/** The distinct PACKAGE-level owning tsconfigs a selection touches (the honest per-package tsc floor). The
 *  root GRAPH program and `tsconfig.tests-dom.json` are EXCLUDED here — each is a separate stage
 *  (`types:graph` / `types:tests-dom`) driven by its own flag (`touchesGraphOnlyTrees` /
 *  `touchesTestsDom`), not a per-package `tsc -p`; folding either in here would run it TWICE, once under
 *  `types:packages`'s sole-owner fast path and once under its own stage. */
export function distinctTsconfigs(paths: readonly string[], graphSrc: ReadonlySet<string> | undefined): readonly string[] {
  const owners = new Set<string>();
  for (const p of paths) {
    for (const cfg of programsFor(p, graphSrc)) {
      if (cfg !== GRAPH_TSCONFIG && cfg !== TESTS_DOM_TSCONFIG) {
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
export function touchesGraph(paths: readonly string[], graphSrc: ReadonlySet<string> | undefined): boolean {
  return paths.some((p) => {
    if (programsFor(p, graphSrc).includes(GRAPH)) {
      return true;
    }
    // Cache-cold conservative fallback: a package-src file whose graph membership we couldn't compute.
    return graphSrc === undefined && PKG_SRC_RE.test(p);
  });
}

/** Does the selection put ANY file in `tsconfig.tests-dom.json` (rule 3d — the DOM-coupled test escapees)?
 *  Drives the `types:tests-dom` stage at a scoped tier (#1274 — previously this program had NO scoped
 *  route at all, so `verify --file`/`--changed` reported clean over a file it never typechecked). No
 *  import-pull overlay needed here — unlike the graph, this program is a small, explicit `include` list,
 *  never a transitive-closure target. */
export function touchesTestsDom(paths: readonly string[]): boolean {
  return paths.some((p) => staticPrograms(p).includes(TESTS_DOM_TSCONFIG));
}
