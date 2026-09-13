// Shared core for the registry-liveness gates — biome-grant-liveness's siblings (#607). A
// registry (a lint/type config) that names a SPECIFIC FILE to grant a suppression, an override, an
// include/exclude, or a rule exemption has, per GATE-AUTHORING.md §4.4 mode (B), a row whose subject is
// never visited by anything — so when the file is deleted or moved the row goes SILENTLY dead: an
// over-grant nobody can see, and a future file recreated at that path inherits an exemption nobody
// re-approved (the loaded gun). Each sibling gate does its own registry-specific EXTRACTION and FAIL-LOUD
// (the configs are JSONC / JS / CJS, each read differently and each obliged to refuse rather than print a
// clean zero on a shape it cannot statically read); this module owns the parts that are IDENTICAL across
// them: the exact-vs-glob classifier, the DEAD-row arm, and the two-sided EXEMPT arms. It is a shared LIB,
// not a parallel framework: biome-grant-liveness is the reference implementation of the same shape.
//
// THE PATTERN HALF (#973). The four gates originally judged only file-EXACT rows and recorded every
// glob/pattern row as a declared skip — 298 grants (175 depcruise · 78 eslint · 23 tsconfig · 22 biome)
// that no liveness arm could see, i.e. permanent authority nobody reviews. A pattern's liveness IS
// decidable whenever its member source is FINITE and derivable from the tree: expand it against the
// TRACKED corpus (`git ls-files` — never an FS walk, which would make the verdict depend on whether
// node_modules/dist/reports happen to exist) and require at least ONE current member. Zero members means
// the pattern names nothing this repo carries — the same loaded-gun class as a dead file-exact row, one
// level up. Two member sources are offered because dependency-cruiser matches MODULE paths, not only repo
// paths: `repoPaths` and `dependencyModules` (every name declared in a tracked package.json, rendered as
// `node_modules/<name>/…` and as a bare specifier). A pattern matching NEITHER is dead.
// The MATCHER stays with the owning gate — biome/eslint/tsconfig speak globs (node's own
// `path.matchesGlob`), dep-cruiser speaks regex source, and tsconfig entries resolve against their own
// config's directory. This module never guesses a syntax and never expands against a root it was not
// handed: no universal DSL (#973 program shape 5).
import { existsSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { execNicedSync } from "@orb/tooling/_shared/proc";
import type { ExemptionTable, Finding } from "../contract/gate.ts";
import type { PackageDependencyFacts } from "../contract/resource-config.ts";

/** Glob metacharacters the include/override syntaxes understand. A path carrying none of these is
 *  FILE-EXACT (mirrors biome-grant-liveness's own classifier so the four gates agree on the boundary). */
const GLOB_META_RE = /[*?[\]{}]/u;

/** True iff `p` is a literal path (no glob metacharacters) — i.e. a grant on ONE named file. */
export function isFileExact(p: string): boolean {
  return !GLOB_META_RE.test(p);
}

/** A grant/exemption row a liveness gate deliberately does not fail on, but STILL polices two-sided
 *  (§4.4): a key the registry no longer carries is RED (a standing exemption for a gone row is a loaded
 *  gun), and a `cite` that stopped resolving is RED (the promise outlived its evidence). */
export interface GrantExemption {
  readonly why: string;
  /** The repo-relative producer/decision that justifies the exemption. Must resolve on the real tree. */
  readonly cite: string;
}

/** One classified file-exact row: the config FILE it was declared in (findings anchor there — a registry may
 *  span several config files, e.g. tsconfig.json + tsconfig.tests-dom.json), the literal path, and the
 *  1-based source line it sits on (0 when the line scan can't place it — the finding still stands, it just
 *  anchors file-level). */
export interface ExactRow {
  readonly file: string;
  readonly path: string;
  readonly line: number;
}

export interface LivenessMessages {
  /** DEAD file-exact grant (path resolves to nothing, not exempt). Carries the path as the finding token. */
  readonly dead: string;
  /** An EXEMPT row the registry no longer carries. */
  readonly staleExempt: string;
  /** An EXEMPT row whose cited producer no longer resolves. */
  readonly deadCite: string;
}

export interface LivenessInput {
  /** Disk root for the default `existsSync` check. Omit when `exists` is supplied — a resource-fed caller
   *  (GatePolicyContext carries no root/filesystem at all) has no disk root to hand back. */
  readonly root?: string;
  /** The path-existence oracle. Defaults to `existsSync(join(root, path))` for the pre-ResourceHost callers
   *  (`runner-config-path-liveness`, `tsconfig-entry-liveness`); a ResourceHost-backed caller supplies its
   *  own predicate over a resource fact (e.g. `trackedFiles()`'s `repoPaths`) instead. */
  readonly exists?: (path: string) => boolean;
  readonly exact: readonly ExactRow[];
  readonly exempt: ExemptionTable<GrantExemption>;
  /** Which config file the GLOBAL exemption-table findings anchor at (a registry can span several config
   *  files, but its exemption table is one home). Normally the primary config, e.g. `biome.json`/`tsconfig.json`. */
  readonly exemptAnchorFile: string;
  /** The §4.5 real-tree anchor: only when TRUE (a genuine full-config read, never a conformance
   *  mini-project) do the exemption-table arms run, so a synthetic proof can't red the gate's own self-test. */
  readonly anchorOk: boolean;
  readonly messages: LivenessMessages;
}

interface ExistenceInput {
  readonly root?: string;
  readonly exists?: (path: string) => boolean;
}

function existenceOracle(input: ExistenceInput): (path: string) => boolean {
  return input.exists ?? ((path): boolean => existsSync(join(input.root ?? "", path)));
}

interface DeadExactInput extends ExistenceInput {
  readonly exact: readonly ExactRow[];
  readonly message: string;
}

/** DEAD findings for already-extracted file-exact rows, with no exemption domain. */
export function deadExactFindings(input: DeadExactInput): Finding[] {
  const exists = existenceOracle(input);
  return input.exact.filter((row) => !exists(row.path)).map((row) => ({ file: row.file, line: row.line, column: 0, token: row.path, message: input.message }));
}

/** The two-sided EXEMPT arms — runs only when the caller's real-tree anchor holds (`input.anchorOk`). */
function exemptionArms(input: LivenessInput, exactPaths: ReadonlySet<string>): Finding[] {
  const { exemptAnchorFile, exempt, messages } = input;
  const exists = existenceOracle(input);
  const out: Finding[] = [];
  for (const [path, row] of Object.entries(exempt)) {
    if (!exactPaths.has(path)) {
      out.push({ file: exemptAnchorFile, line: 0, column: 0, token: path, message: messages.staleExempt });
      continue;
    }
    if (!exists(row.cite)) {
      out.push({ file: exemptAnchorFile, line: 0, column: 0, token: row.cite, message: messages.deadCite });
    }
  }
  return out;
}

/** DEAD-row + two-sided-EXEMPT findings for a set of already-extracted, already-classified file-exact rows.
 *  A row is dead when it is NOT exempt and its path resolves to nothing on the tree; the finding token is
 *  the dead path, anchored at its OWN config file + source line. The exemption table is judged GLOBALLY
 *  against the whole exact set (a row exact in ANY scanned config keeps its exemption live). */
export function livenessFindings(input: LivenessInput): Finding[] {
  const { exact, exempt, anchorOk, messages } = input;
  const exactPaths = new Set(exact.map((r) => r.path));
  const dead = deadExactFindings({
    ...(input.root === undefined ? {} : { root: input.root }),
    ...(input.exists === undefined ? {} : { exists: input.exists }),
    exact: exact.filter((row) => exempt[row.path] === undefined),
    message: messages.dead,
  });
  return [...dead, ...(anchorOk ? exemptionArms(input, exactPaths) : [])];
}

/** A path→1-based-line resolver over raw config text, advancing a per-path cursor so a path that appears in
 *  TWO places reports two distinct lines. 0 when the literal isn't found. Mirrors biome-grant-liveness's
 *  `lineFinder` so all four gates anchor findings the same way. */
export function lineFinder(text: string): (path: string) => number {
  const lines = text.split("\n");
  const cursor = new Map<string, number>();
  return (path) => {
    const quoted = `"${path}"`;
    const from = cursor.get(quoted) ?? 0;
    const at = lines.findIndex((line, index) => index >= from && line.includes(quoted));
    if (at < 0) {
      return 0;
    }
    cursor.set(quoted, at + 1);
    return at + 1;
  };
}

/** Index of the first glob metacharacter — the end of the pattern's literal head. */
function headLength(pattern: string): number {
  const at = pattern.search(/[*?[\]{}!]/u);
  return at === -1 ? pattern.length : at;
}

/** A GLOB matcher over repo-relative members, using node's OWN `path.matchesGlob` — never a hand-rolled
 *  translator (a bespoke glob DSL is the lying-proof class: it passes its own fixtures and silently
 *  mis-answers the corpus). The second arm covers a DIRECTORY entry: `packages/db/src/schema` names a tree
 *  node, and every file under it is a member. */
export function globMatcher(pattern: string): (member: string) => boolean {
  // `matchesGlob` recompiles the pattern on EVERY call, so a bare per-member call over the whole corpus is
  // the dominant cost (measured: +3.9s on eslint's 78 globs alone). The literal head — everything before the
  // first metacharacter — is a SOUND necessary condition: every one of these syntaxes matches that prefix
  // verbatim, and a pattern that starts with a metacharacter yields "" and filters nothing. It only ever
  // skips members that could not have matched.
  const head = pattern.slice(0, headLength(pattern));
  return (member) => member.startsWith(head) && (matchesGlob(member, pattern) || matchesGlob(member, `${pattern}/**`));
}

// ── the PATTERN half (#973) ────────────────────────────────────────────────────────────────────────────

/** One pattern row a gate could not judge as file-exact: where it is declared, its raw source, and the
 *  matcher the OWNING gate built for it (glob semantics vs regex source vs a config-dir-relative glob —
 *  this module never re-derives a syntax it was not handed). */
export interface PatternRow {
  /** The config file the finding anchors at. */
  readonly file: string;
  /** The raw pattern, as authored — the finding token, so the diagnostic names what the reader must fix. */
  readonly pattern: string;
  /** 1-based line, or 0 when the line scan could not place it (the finding still stands, file-level). */
  readonly line: number;
  /** True iff this repo-relative member path is inside the pattern's set. */
  readonly matches: (member: string) => boolean;
}

/** The two member sources a pattern may live against. Both are derived from TRACKED files only, so the
 *  verdict is identical on a clean checkout and on a machine that has built, installed, and run tests. */
export interface MemberSources {
  /** Every tracked repo path (`git ls-files`). */
  readonly repoPaths: readonly string[];
  /** Every declared dependency rendered as the module paths a registry writes: `node_modules/<name>/` and
   *  the bare specifier `<name>/`. Dep-cruiser's `path`/`pathNot` match module paths, not repo paths. */
  readonly dependencyModules: readonly string[];
}

export interface PatternLivenessMessages {
  /** A pattern with ZERO members in either source. Carries the pattern as the finding token. */
  readonly deadPattern: string;
  /** A RATIFIED row the config no longer carries. */
  readonly staleRatified: string;
  /** A RATIFIED row whose cited producer no longer resolves. */
  readonly deadCite: string;
  /** The irreducible BUDGET moved. `{actual}`/`{budget}` are substituted. */
  readonly budgetMoved: string;
}

export interface PatternLivenessInput {
  /** Disk root for the default `existsSync` cite check. Omit when `exists` is supplied. */
  readonly root?: string;
  /** The path-existence oracle for the RATIFIED cite check. Defaults to `existsSync(join(root, path))`;
   *  a ResourceHost-backed caller supplies its own predicate instead (no root/filesystem on that context). */
  readonly exists?: (path: string) => boolean;
  readonly rows: readonly PatternRow[];
  readonly sources: MemberSources;
  /** Patterns whose liveness is NOT decidable from the tree, each with its `why` + END CONDITION and a
   *  resolving `cite`. Two-sided exactly like the file-exact EXEMPT tables. */
  readonly ratified: ExemptionTable<GrantExemption>;
  /** Which config the ratified-table findings anchor at. */
  readonly ratifiedAnchorFile: string;
  /** The §4.5 real-tree anchor: only a genuine full-config read judges the ratified table. */
  readonly anchorOk: boolean;
  readonly messages: PatternLivenessMessages;
}

/** How a pattern row was disposed of, for the gate's `ctx.scan` declaration — the visible denominator that
 *  replaces an unread `skipReasons` counter (#973 Done). */
export interface PatternLivenessOutcome {
  readonly findings: readonly Finding[];
  /** Patterns with ≥1 current member — judged and live. */
  readonly live: number;
  /** Patterns a RATIFIED row forgives. */
  readonly ratified: number;
  /** Patterns with no member at all and no ratification — every one is a finding. */
  readonly dead: number;
}

/** Every tracked repo path, as repo-relative posix. TRACKED, never an FS walk: a gate that judged patterns
 *  against the filesystem would answer differently depending on whether node_modules/dist/reports exist
 *  (and `__g_` fixtures are materialised for milliseconds mid-run by check-gates.int). */
function trackedRepoPaths(root: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): NOT a swallow — an empty corpus is the
  // caller's LOUD blindness arm ("I could not measure", never "clean"), and every caller reds on it at
  // real-config scope. Throwing here would surface as an anonymous harness ToolError instead of the
  // diagnostic that names the config. Ends if a caller starts reading [] as "no members".
  try {
    return execNicedSync("git", ["ls-files", "-z"], { cwd: root })
      .split("\0")
      .filter((path) => path !== "");
  } catch {
    return [];
  }
}

const DEPENDENCY_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/** Every dependency NAME declared by a tracked package.json, rendered as the two module-path spellings a
 *  registry writes. This is the second finite source: `node_modules/echarts/` is live exactly while some
 *  package.json still declares `echarts`, which is a tracked fact, not an install artifact. */
function manifestDependencyNames(root: string, rel: string): readonly string[] {
  let parsed: Record<string, unknown>;
  // @orb-waive caught-failure-ownership(catch): a malformed package.json is the package
  // manager's red, not this gate's subject — it contributes no names rather than aborting the pass. Ends
  // if this gate ever becomes the manifest validator.
  try {
    parsed = JSON.parse(readFileSync(join(root, rel), "utf-8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  return DEPENDENCY_KEYS.flatMap((key) => {
    const block = parsed[key];
    return typeof block === "object" && block !== null ? Object.keys(block) : [];
  });
}

function declaredDependencyModules(root: string, repoPaths: readonly string[]): readonly string[] {
  const names = new Set<string>();
  for (const rel of repoPaths) {
    if (rel.endsWith("package.json") && !rel.includes("node_modules/")) {
      for (const name of manifestDependencyNames(root, rel)) {
        names.add(name);
      }
    }
  }
  return [...names].flatMap((name) => [`node_modules/${name}/index.js`, `${name}/index.js`]);
}

/** Derive BOTH member sources once per pass. */
export function memberSources(root: string): MemberSources {
  const repoPaths = trackedRepoPaths(root);
  return { repoPaths, dependencyModules: declaredDependencyModules(root, repoPaths) };
}

/** The dependency-module half of `MemberSources`, derived from already-acquired `PackageDependencyFacts`
 *  (a ResourceHost `packageMetadata` fact per package) instead of a disk walk — a GatePolicyContext carries
 *  no root/filesystem to walk `git ls-files` or `readFileSync` a manifest itself. Same rendering as
 *  `declaredDependencyModules`: every declared name as both `node_modules/<name>/…` and the bare specifier. */
export function dependencyModulesFromManifests(manifests: readonly PackageDependencyFacts[]): readonly string[] {
  const names = new Set<string>();
  for (const facts of manifests) {
    for (const block of [facts.runtime, facts.development, facts.peer, facts.optional]) {
      for (const name of Object.keys(block)) {
        names.add(name);
      }
    }
  }
  return [...names].flatMap((name) => [`node_modules/${name}/index.js`, `${name}/index.js`]);
}

/** `MemberSources` for a ResourceHost-backed caller: `repoPaths` from a `trackedFiles()` fact, dependency
 *  modules from already-acquired `packageMetadata()` facts. */
export function memberSourcesFromResources(repoPaths: readonly string[], manifests: readonly PackageDependencyFacts[]): MemberSources {
  return { repoPaths, dependencyModules: dependencyModulesFromManifests(manifests) };
}

/** The rows that still have NO member, after one sweep of `members`.
 *
 *  MEMBER-MAJOR, not pattern-major, and that is a measured decision: the naive shape (for each pattern,
 *  scan the whole corpus) recompiles the glob per call and costs patterns × corpus even when almost every
 *  pattern is satisfied by the first few files — 78 eslint globs over 8.4k tracked paths took ~12s. Sweeping
 *  members and RETIRING each pattern the moment it is satisfied leaves only the genuinely dead ones paying
 *  a full scan, and stops early once every pattern is live. */
function unsatisfied(rows: readonly PatternRow[], members: readonly string[]): readonly PatternRow[] {
  const pending = new Set(rows);
  for (const member of members) {
    if (pending.size === 0) {
      return [];
    }
    for (const row of pending) {
      if (row.matches(member)) {
        pending.delete(row);
      }
    }
  }
  return [...pending];
}

/** The two-sided RATIFIED arms — a row the config dropped, and a cite that stopped resolving. */
function ratifiedArms(input: PatternLivenessInput, carried: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  for (const [pattern, row] of Object.entries(input.ratified)) {
    if (!carried.has(pattern)) {
      out.push({ file: input.ratifiedAnchorFile, line: 0, column: 0, token: pattern, message: input.messages.staleRatified });
      continue;
    }
    const exists = input.exists ?? ((path: string): boolean => existsSync(join(input.root ?? "", path)));
    if (!exists(row.cite)) {
      out.push({ file: input.ratifiedAnchorFile, line: 0, column: 0, token: row.cite, message: input.messages.deadCite });
    }
  }
  return out;
}

/** Judge every pattern row: live (≥1 current member), ratified (a reviewed allowance), or DEAD. */
export function patternLivenessFindings(input: PatternLivenessInput): PatternLivenessOutcome {
  const carried = new Set(input.rows.map((row) => row.pattern));
  const judged = input.rows.filter((row) => input.ratified[row.pattern] === undefined);
  const ratified = input.rows.length - judged.length;
  // Repo paths first (the dominant source), then the declared-dependency module paths for whatever is left
  // — dep-cruiser patterns live on that second corpus and on nothing else.
  const dead = unsatisfied(unsatisfied(judged, input.sources.repoPaths), input.sources.dependencyModules);
  const findings: Finding[] = dead.map((row) => ({
    file: row.file,
    line: row.line,
    column: 0,
    token: row.pattern,
    message: input.messages.deadPattern,
  }));
  const live = judged.length - dead.length;
  return { findings: [...findings, ...(input.anchorOk ? ratifiedArms(input, carried) : [])], live, ratified, dead: dead.length };
}

/** The no-growth/stale arm for an IRREDUCIBLE family whose members cannot be enumerated at all (a
 *  dep-cruiser `$1` backreference, a `${configDir}` template): the count is budgeted, and BOTH directions
 *  are RED — growth adds unreviewed authority, and a shrink that was not committed leaves a budget nobody
 *  can trust. Never a silent counter. */
export function irreducibleBudgetFindings(file: string, actual: number, budget: number, message: string): readonly Finding[] {
  return actual === budget
    ? []
    : [
        {
          file,
          line: 0,
          column: 0,
          token: `${String(actual)} vs ${String(budget)}`,
          message: message.replace("{actual}", String(actual)).replace("{budget}", String(budget)),
        },
      ];
}
