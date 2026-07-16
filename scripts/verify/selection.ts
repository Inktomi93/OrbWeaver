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
function isGraphOnlyTree(rel: string): boolean {
  return rel.startsWith("tests/") || rel.startsWith("scripts/") || rel === "reset.d.ts";
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
  // 2. package-level config files named in a package include (only client's vite.config.ts today).
  if (rel === "packages/client/vite.config.ts") {
    return [CLIENT_TSCONFIG];
  }
  // 3. the browser reach-back trees (owned by NON-ancestor configs — the editor blind spot §2.1).
  if (TESTS_CLIENT_TSX_RE.test(rel) || rel === CT_CLIENT_OWNED) {
    return [CLIENT_TSCONFIG];
  }
  if (TESTS_UI_TSX_RE.test(rel) || (CT_SUPPORT_TSX_RE.test(rel) && rel !== CT_CLIENT_OWNED) || PLAYWRIGHT_TSX_DTS_RE.test(rel)) {
    return [UI_TSCONFIG];
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

/** The resolved selection — the superset every stage's `scopedArgv` reads from (§3.4). */
export type Selection = {
  /** The kind of scope this run covers, for the summary header + the artifact. */
  readonly kind: "changed" | "file" | "package" | "scope" | "whole";
  readonly label: string;
  /** Every selected repo-relative posix path (deletions KEPT — mirror-expansion needs them, §3.4). */
  readonly paths: readonly string[];
  /** paths ∩ the eslint surface. */
  readonly eslintPaths: readonly string[];
  /** paths ∩ packages/ TS/JS (depcruise's guard). */
  readonly depcruisePaths: readonly string[];
  /** paths ∩ docs/architecture/**.md (excluding proposed/). */
  readonly docsPaths: readonly string[];
  /** The distinct OWNING tsconfigs the selection touches (the honest per-package tsc floor). */
  readonly tsconfigs: readonly string[];
  /** Does the selection touch tests/ · scripts/ · reset.d.ts (the graph-only trees)? */
  readonly touchesGraphOnlyTrees: boolean;
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
// `tsgo -p tsconfig.json --listFilesOnly` (0.46s) lists the graph's TRUE membership; we keep only the
// repo-relative packages/*/src files (the overlay set — everything else is a graph ROOT or node_modules).
// Cached under node_modules/.cache (gitignored, per-worktree — the tsbuildinfo convention), keyed on the
// git HEAD + a hash of the dirty working set: a src edit changes the dirty key, a commit changes HEAD, so
// the cache refreshes exactly when the import graph could have moved. Cache MISS or a tsgo failure ⇒
// undefined ⇒ programsFor falls back to the conservative "any package-src runs the graph" rule (never
// under-runs the overlay). The heavy tsgo spawn happens ONCE per key, not per file.
const GRAPH_MEMBERSHIP_CACHE = "node_modules/.cache/graph-membership.json";
const PKG_SRC_ABS_RE = /\/(packages\/[^/]+\/src\/.*\.(?:ts|tsx|mts|cts))$/u;

type MembershipCache = { readonly key: string; readonly members: readonly string[] };

/** A stable key for the graph's import closure: HEAD commit + a digest of `git status --porcelain` (the
 *  dirty working set). Cheap; recomputed each run, but the tsgo spawn only fires on a key change. */
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

// tsgo's --listFilesOnly on the whole graph is ~5,400 absolute paths (~0.5MB); 64MiB is generous headroom.
const LIST_FILES_MAX_BUFFER = 67_108_864;

/** Compute the graph's package-src membership via tsgo `--listFilesOnly`, or undefined on any failure. */
function computeMembership(): readonly string[] | undefined {
  const tsgo = join(ROOT, "node_modules", ".bin", "tsgo");
  const res = spawnSync(tsgo, ["--noEmit", "--listFilesOnly", "-p", "tsconfig.json"], {
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

/** Build the derived views (eslint/depcruise/docs/tsconfigs/graph flag) from a repo-relative path set. */
function deriveViews(paths: readonly string[]): {
  readonly eslintPaths: readonly string[];
  readonly depcruisePaths: readonly string[];
  readonly docsPaths: readonly string[];
  readonly tsconfigs: readonly string[];
  readonly touchesGraphOnlyTrees: boolean;
} {
  const graphSrc = graphMembership();
  return {
    eslintPaths: filterPaths(paths, (p) => ESLINT_RE.test(p)),
    depcruisePaths: filterPaths(paths, (p) => DEPCRUISE_RE.test(p)),
    docsPaths: filterPaths(paths, (p) => DOCS_MD_RE.test(p) && !DOCS_PROPOSED_RE.test(p)),
    tsconfigs: distinctTsconfigs(paths, graphSrc),
    // `touchesGraphOnlyTrees` KEEPS its field name (downstream registry contract) but now means "puts any
    // file in the GRAPH program" — graph roots (tests/scripts/reset.d.ts) OR the import-pull overlay.
    touchesGraphOnlyTrees: touchesGraph(paths, graphSrc),
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
