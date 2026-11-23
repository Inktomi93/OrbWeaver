// The merge behind `pnpm unwired coverage`: every input is an istanbul map keyed by absolute path; the Node suite's map
// is the universe of functions and branches, and a hit in any input marks the entry at the same start position executed.
// A hit that lands on no universe entry is counted as unmatched, never added, so a transform's extra nodes cannot report
// as code nothing ran.
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { z } from "zod";
import { GENERATED_HEAD_CHARS, isGeneratedFile } from "../floor/paths/generated-file.ts";

const positionSchema = z.object({ line: z.number(), column: z.number().nullable() });
const rangeSchema = z.object({ start: positionSchema, end: positionSchema });

/** One file of an istanbul coverage map, the shape `coverage-final.json` and ast-v8-to-istanbul both write. */
const istanbulFileSchema = z.object({
  path: z.string(),
  // A function is keyed by its declared name's start: a transform moves the `function` keyword and the body (the React
  // Compiler rewrites a component's body) but maps the name token exactly.
  fnMap: z.record(z.string(), z.object({ name: z.string(), decl: rangeSchema, loc: rangeSchema })),
  f: z.record(z.string(), z.number()),
  // Only the arm count is read: an `if` with no `else` reports its implicit arm with an empty location.
  branchMap: z.record(z.string(), z.object({ type: z.string(), loc: rangeSchema, locations: z.array(z.object({})) })),
  b: z.record(z.string(), z.array(z.number())),
});
type IstanbulFile = z.infer<typeof istanbulFileSchema>;

/** An istanbul coverage map: file entries keyed by absolute path. */
export const istanbulMapSchema = z.record(z.string(), istanbulFileSchema);
export type IstanbulMap = z.infer<typeof istanbulMapSchema>;

/** The suites the command runs, in the order it runs them. */
export const COVERAGE_SUITES = ["node", "ct", "e2e"] as const;
export type CoverageSuite = (typeof COVERAGE_SUITES)[number];

/** One suite's converted coverage. */
export interface CoverageInput {
  readonly suite: CoverageSuite;
  readonly map: IstanbulMap;
}

/** The Node suite's coverage scope, handed to vitest so its report excludes nothing {@link isProductionSource} keeps. */
export const PRODUCTION_COVERAGE_SCOPE = { include: "packages/*/src/**/*.{ts,tsx}", exclude: ["**/*.d.ts", "**/*.test-d.ts"] } as const;
const PRODUCTION_SOURCE = /^packages\/[^/]+\/src\/.+\.tsx?$/u;
const NOT_PRODUCTION = /\.d\.ts$|\.test-d\.ts$/u;

/** The repository-relative path when `path` is inside `root`, with forward slashes; null outside it. */
function repoRelative(root: string, path: string): string | null {
  const rel = relative(root, path);
  return rel.startsWith("..") || rel === "" ? null : rel.split(sep).join("/");
}

/**
 * Whether a file is production source: under `packages/*\/src`, not a declaration, not generated.
 *
 * @param readHead - the file's opening text, read only for a path that passes the path rules.
 */
export function isProductionSource(rel: string, readHead: (rel: string) => string): boolean {
  if (!PRODUCTION_SOURCE.test(rel) || NOT_PRODUCTION.test(rel)) {
    return false;
  }
  return !isGeneratedFile(rel, () => readHead(rel));
}

/** Reads a file's head from disk, for {@link isProductionSource}. */
export const diskHead =
  (root: string) =>
  (rel: string): string =>
    readFileSync(`${root}/${rel}`, "utf8").slice(0, GENERATED_HEAD_CHARS);

/**
 * Whether a Node process dump comes from the harness rather than the product.
 *
 * @remarks Production code never imports `tooling/`, `tests/`, `scripts/` or a package's build config, so a process
 * that loaded any first-party module outside `packages/*\/src` (the stack supervisor, a vite build, a test worker)
 * is harness, and every hit in it is dropped: code only the harness loads must not count as executed.
 */
export function isHarnessProcess(root: string, scriptPaths: readonly string[]): boolean {
  return scriptPaths.some((path) => {
    const rel = repoRelative(root, path);
    return rel !== null && !rel.split("/").includes("node_modules") && !/^packages\/[^/]+\/src\//u.test(rel);
  });
}

interface MergedFunction {
  readonly name: string;
  readonly line: number;
  hit: boolean;
}

interface MergedBranch {
  readonly type: string;
  readonly line: number;
  readonly arms: boolean[];
}

interface MergedFile {
  readonly functions: Map<string, MergedFunction>;
  /** Functions by the start of their whole range: an anonymous function's `decl` is a point a source map moves
   *  between transforms (vitest puts it on the line before), while its `loc` start maps the same in each. */
  readonly byLoc: Map<string, MergedFunction>;
  /** Named functions by name and declared line: the fallback when a transform moved even the name's column. */
  readonly named: Map<string, MergedFunction>;
  /** Anonymous functions per `loc` line, in column order: the fallback when a transform shifts columns on the line. */
  readonly anonymous: Map<string, MergedFunction[]>;
  readonly branches: Map<string, MergedBranch>;
  /** Branches per type and line, in column order, for the same fallback. */
  readonly branchLines: Map<string, MergedBranch[]>;
}

type Range = z.infer<typeof rangeSchema>;

const at = (range: Range): string => `${String(range.start.line)}:${String(range.start.column ?? 0)}`;
const branchKey = (type: string, range: Range): string => `${type}@${at(range)}`;
const branchLine = (type: string, range: Range): string => `${type}@${String(range.start.line)}`;
const anonymousLine = (range: Range): string => String(range.start.line);

// istanbul numbers an anonymous function by its order in the file, which a transform changes.
const ANONYMOUS = /^\(anonymous_\d+\)$/u;
const namedKey = (name: string, line: number): string => `${name}:${String(line)}`;

/** An entry's place among the entries that share its line group, in column order, and how many share it. */
interface LineOrdinal {
  readonly index: number;
  readonly size: number;
}

/**
 * Orders entries within each line group by column.
 *
 * @remarks Each transform moves columns its own way (vitest maps oxc and its module-runner rewrite back through a source
 * map, Node strips types in place, a browser chunk is bundled), but none reorders two functions or two branches on one
 * line. So the n-th entry of a group in one map is the n-th in another whenever both hold the same number.
 */
function lineOrdinals(entries: readonly { readonly id: string; readonly group: string; readonly column: number }[]): ReadonlyMap<string, LineOrdinal> {
  const groups = new Map<string, { readonly id: string; readonly column: number }[]>();
  for (const entry of entries) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }
  const out = new Map<string, LineOrdinal>();
  for (const members of groups.values()) {
    for (const [index, member] of members.toSorted((a, b) => a.column - b.column).entries()) {
      out.set(member.id, { index, size: members.length });
    }
  }
  return out;
}

function anonymousOrdinals(file: IstanbulFile): ReadonlyMap<string, LineOrdinal> {
  return lineOrdinals(
    Object.entries(file.fnMap)
      .filter(([, fn]) => ANONYMOUS.test(fn.name))
      .map(([id, fn]) => ({ id, group: anonymousLine(fn.loc), column: fn.loc.start.column ?? 0 })),
  );
}

function branchOrdinals(file: IstanbulFile): ReadonlyMap<string, LineOrdinal> {
  return lineOrdinals(
    Object.entries(file.branchMap).map(([id, branch]) => ({ id, group: branchLine(branch.type, branch.loc), column: branch.loc.start.column ?? 0 })),
  );
}

// Places each entry at its ordinal in its group's list.
function grouped<T>(entries: readonly (readonly [string, string, T])[], ordinals: ReadonlyMap<string, LineOrdinal>): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const [id, group, value] of entries) {
    const list = out.get(group) ?? [];
    list[ordinals.get(id)?.index ?? list.length] = value;
    out.set(group, list);
  }
  return out;
}

function seed(file: IstanbulFile): MergedFile {
  const functions = new Map<string, MergedFunction>();
  const byLoc = new Map<string, MergedFunction>();
  const named = new Map<string, MergedFunction>();
  const anonymousEntries: (readonly [string, string, MergedFunction])[] = [];
  for (const [id, fn] of Object.entries(file.fnMap)) {
    const entry = { name: fn.name, line: fn.decl.start.line, hit: (file.f[id] ?? 0) > 0 };
    functions.set(at(fn.decl), entry);
    byLoc.set(at(fn.loc), entry);
    if (ANONYMOUS.test(fn.name)) {
      anonymousEntries.push([id, anonymousLine(fn.loc), entry]);
    } else {
      named.set(namedKey(fn.name, fn.decl.start.line), entry);
    }
  }
  const branches = new Map<string, MergedBranch>();
  const branchEntries: (readonly [string, string, MergedBranch])[] = [];
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const counts = file.b[id] ?? [];
    const entry = { type: branch.type, line: branch.loc.start.line, arms: branch.locations.map((_, arm) => (counts[arm] ?? 0) > 0) };
    branches.set(branchKey(branch.type, branch.loc), entry);
    branchEntries.push([id, branchLine(branch.type, branch.loc), entry]);
  }
  return {
    functions,
    byLoc,
    named,
    anonymous: grouped(anonymousEntries, anonymousOrdinals(file)),
    branches,
    branchLines: grouped(branchEntries, branchOrdinals(file)),
  };
}

/** How one suite's hits landed on the universe. */
interface Projection {
  matchedFunctions: number;
  unmatchedFunctions: number;
  matchedArms: number;
  unmatchedArms: number;
  /** The first unmatched hits of each kind, so a reader can judge whether a transform moved a start position. */
  readonly sample: string[];
}

const SAMPLE_LIMIT = 20;
const RATE_SCALE = 1000;

/** A suite's projection with the share of its hits of each kind that found a universe entry. */
interface SuiteProjection extends Readonly<Projection> {
  /** Null when the suite hit no function, or no branch arm, of a file the universe holds. */
  readonly functionMatchRate: number | null;
  readonly armMatchRate: number | null;
}

const matchRate = (matched: number, unmatched: number): number | null =>
  matched + unmatched === 0 ? null : Math.round((matched / (matched + unmatched)) * RATE_SCALE) / RATE_SCALE;

function withRates(projection: Projection): SuiteProjection {
  return {
    ...projection,
    functionMatchRate: matchRate(projection.matchedFunctions, projection.unmatchedFunctions),
    armMatchRate: matchRate(projection.matchedArms, projection.unmatchedArms),
  };
}

function note(projection: Projection, kind: "unmatchedFunctions" | "unmatchedArms", entry: string): void {
  if (projection[kind] < SAMPLE_LIMIT) {
    projection.sample.push(entry);
  }
  projection[kind]++;
}

// The entry at the same ordinal of the same line group, when both maps hold the same number on that line.
function atOrdinal<T>(list: readonly T[] | undefined, ordinal: LineOrdinal | undefined): T | undefined {
  return list !== undefined && ordinal !== undefined && list.length === ordinal.size ? list[ordinal.index] : undefined;
}

// The bundler renames a module-level function that another module of its chunk also declares by appending `$<n>`.
const BUNDLER_RENAME = /\$\d+$/u;

// The React Compiler re-emits a component, so a browser copy of a named function can start at the `function` keyword
// and carry the body's line in its `loc`; a name on its declared line or its `loc` line is still one function. A
// bundler-renamed copy keeps its declared point through the source map, so the name less its `$<n>` matches only
// there: a source may declare a name with a `$<n>` of its own, which its own name matches first.
function movedNamed(into: MergedFile, fn: IstanbulFile["fnMap"][string]): MergedFunction | undefined {
  const exact = into.functions.get(at(fn.decl));
  return (
    (exact?.name === fn.name ? exact : undefined) ??
    into.named.get(namedKey(fn.name, fn.decl.start.line)) ??
    into.named.get(namedKey(fn.name, fn.loc.start.line)) ??
    (exact?.name === fn.name.replace(BUNDLER_RENAME, "") ? exact : undefined)
  );
}

// The React Compiler can hand one arrow another's declared point, or a range start equal to another's, so neither key
// is safe alone: when both find a function and they differ, the hit is unmatched rather than put on the wrong one.
function movedAnonymous(into: MergedFile, fn: IstanbulFile["fnMap"][string], ordinal: LineOrdinal | undefined): MergedFunction | undefined {
  const byDecl = into.functions.get(at(fn.decl));
  const byLoc = into.byLoc.get(at(fn.loc));
  const exact = byDecl !== undefined && ANONYMOUS.test(byDecl.name) ? byDecl : undefined;
  if (exact !== undefined && byLoc !== undefined) {
    return exact === byLoc ? exact : undefined;
  }
  return exact ?? byLoc ?? atOrdinal(into.anonymous.get(anonymousLine(fn.loc)), ordinal);
}

// Each projector marks the universe entries this input hit and tallies the hits that found none.
function projectFunctions(into: MergedFile, file: IstanbulFile, rel: string, projection: Projection): void {
  const ordinals = anonymousOrdinals(file);
  for (const [id, fn] of Object.entries(file.fnMap)) {
    if ((file.f[id] ?? 0) === 0) {
      continue;
    }
    const target = ANONYMOUS.test(fn.name) ? movedAnonymous(into, fn, ordinals.get(id)) : movedNamed(into, fn);
    if (target === undefined) {
      note(projection, "unmatchedFunctions", `${rel} function ${fn.name} at ${at(fn.decl)}`);
    } else {
      target.hit = true;
      projection.matchedFunctions++;
    }
  }
}

// The universe branch at this branch's start, else at its ordinal on its line; only one with the same arm count.
function branchTarget(into: MergedFile, branch: IstanbulFile["branchMap"][string], ordinal: LineOrdinal | undefined): MergedBranch | undefined {
  const found = into.branches.get(branchKey(branch.type, branch.loc)) ?? atOrdinal(into.branchLines.get(branchLine(branch.type, branch.loc)), ordinal);
  return found !== undefined && found.arms.length === branch.locations.length ? found : undefined;
}

function projectBranches(into: MergedFile, file: IstanbulFile, rel: string, projection: Projection): void {
  const ordinals = branchOrdinals(file);
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const target = branchTarget(into, branch, ordinals.get(id));
    for (const [arm, count] of (file.b[id] ?? []).entries()) {
      if (count > 0 && target === undefined) {
        note(projection, "unmatchedArms", `${rel} ${branchKey(branch.type, branch.loc)} arm ${String(arm)}`);
      } else if (count > 0 && target !== undefined) {
        target.arms[arm] = true;
        projection.matchedArms++;
      }
    }
  }
}

/** One production file's entries no run executed. */
interface UnexecutedFile {
  readonly file: string;
  readonly functions: readonly { readonly name: string; readonly line: number }[];
  readonly branches: readonly { readonly type: string; readonly line: number; readonly arm: number }[];
}

interface CoverageTotals {
  readonly files: number;
  readonly functions: number;
  readonly functionsUnexecuted: number;
  readonly branchArms: number;
  readonly branchArmsUnexecuted: number;
}

export interface MergedCoverage {
  /** Every production file some input listed. */
  readonly seen: ReadonlySet<string>;
  readonly unexecuted: readonly UnexecutedFile[];
  readonly totals: CoverageTotals;
  /** Per later suite, its hits that found a universe entry, those that found none, and the matched share of each kind. */
  readonly projections: Readonly<Partial<Record<CoverageSuite, SuiteProjection>>>;
}

/**
 * Merges the inputs over the first input's universe, keeping production files only.
 *
 * @remarks A file the first input lacks is seeded from the first later input that has it, so a partial run still
 * lists what it reached. The first input is the Node suite whenever it runs, and a full Node run lists every included
 * file, tested or not.
 */
export function mergeCoverage(root: string, inputs: readonly CoverageInput[], readHead: (rel: string) => string = diskHead(root)): MergedCoverage {
  const files = new Map<string, MergedFile>();
  const projections: Partial<Record<CoverageSuite, Projection>> = {};
  for (const { suite, map } of inputs) {
    for (const entry of Object.values(map)) {
      const rel = repoRelative(root, entry.path);
      if (rel === null || !isProductionSource(rel, readHead)) {
        continue;
      }
      const held = files.get(rel);
      if (held === undefined) {
        files.set(rel, seed(entry));
      } else {
        projections[suite] ??= { matchedFunctions: 0, unmatchedFunctions: 0, matchedArms: 0, unmatchedArms: 0, sample: [] };
        projectFunctions(held, entry, rel, projections[suite]);
        projectBranches(held, entry, rel, projections[suite]);
      }
    }
  }
  const rated: Partial<Record<CoverageSuite, SuiteProjection>> = {};
  for (const suite of COVERAGE_SUITES) {
    const projection = projections[suite];
    if (projection !== undefined) {
      rated[suite] = withRates(projection);
    }
  }
  return { seen: new Set(files.keys()), ...summarize(files), projections: rated };
}

function summarize(files: ReadonlyMap<string, MergedFile>): Pick<MergedCoverage, "unexecuted" | "totals"> {
  const unexecuted: UnexecutedFile[] = [];
  const totals = { files: files.size, functions: 0, functionsUnexecuted: 0, branchArms: 0, branchArmsUnexecuted: 0 };
  for (const [file, merged] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const deadFunctions = [...merged.functions.values()].filter((fn) => !fn.hit).map(({ name, line }) => ({ name, line }));
    const deadArms = [...merged.branches.values()].flatMap(({ type, line, arms }) => arms.flatMap((hit, arm) => (hit ? [] : [{ type, line, arm }])));
    totals.functions += merged.functions.size;
    totals.functionsUnexecuted += deadFunctions.length;
    totals.branchArms += [...merged.branches.values()].reduce((sum, branch) => sum + branch.arms.length, 0);
    totals.branchArmsUnexecuted += deadArms.length;
    if (deadFunctions.length > 0 || deadArms.length > 0) {
      unexecuted.push({
        file,
        functions: deadFunctions.toSorted((a, b) => a.line - b.line),
        branches: deadArms.toSorted((a, b) => a.line - b.line || a.arm - b.arm),
      });
    }
  }
  return { unexecuted, totals };
}
