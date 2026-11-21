// The merge behind `pnpm unwired coverage`: every input is an istanbul map keyed by absolute path; the Node suite's map
// is the universe of functions and branches, and a hit in any input marks the entry at the same start position executed.
// A hit that lands on no universe entry is counted as unmatched, never added, so a transform's extra nodes (the React
// Compiler's memo branches in a browser bundle) cannot report as code nothing ran.
import { readFileSync } from "node:fs";
import { basename, relative, sep } from "node:path";
import { z } from "zod";

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

const PRODUCTION_SOURCE = /^packages\/[^/]+\/src\/.+\.(?:ts|tsx|js|jsx)$/u;
const NOT_PRODUCTION = /\.d\.ts$|\.test-d\.ts$/u;
const GENERATED_NAME = /\.(?:gen|generated)\.[jt]sx?$/u;
// The house marker on a generated file's first line, as `packages/kit/src/handle-key/unicode-data.ts` carries it.
const GENERATED_HEADER = /^\/\/ GENERATED\b|@generated\b/mu;
const HEADER_BYTES = 512;

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
  if (!PRODUCTION_SOURCE.test(rel) || NOT_PRODUCTION.test(rel) || GENERATED_NAME.test(basename(rel))) {
    return false;
  }
  return !GENERATED_HEADER.test(readHead(rel).slice(0, HEADER_BYTES));
}

/** Reads a file's head from disk, for {@link isProductionSource}. */
const diskHead =
  (root: string) =>
  (rel: string): string =>
    readFileSync(`${root}/${rel}`, "utf8").slice(0, HEADER_BYTES);

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
  /** Named functions by name and declared line: the fallback when a transform moved even the name's column. */
  readonly named: Map<string, MergedFunction>;
  /** Anonymous functions by declared line: the fallback when exactly one sits on the line a transform's copy names. */
  readonly anonymous: Map<number, MergedFunction[]>;
  readonly branches: Map<string, MergedBranch>;
}

const at = (range: z.infer<typeof rangeSchema>): string => `${String(range.start.line)}:${String(range.start.column ?? 0)}`;
const branchKey = (type: string, range: z.infer<typeof rangeSchema>): string => `${type}@${at(range)}`;

// istanbul numbers an anonymous function by its order in the file, which a transform changes.
const ANONYMOUS = /^\(anonymous_\d+\)$/u;
const namedKey = (name: string, line: number): string => `${name}:${String(line)}`;

function seed(file: IstanbulFile): MergedFile {
  const functions = new Map<string, MergedFunction>();
  const named = new Map<string, MergedFunction>();
  const anonymous = new Map<number, MergedFunction[]>();
  for (const [id, fn] of Object.entries(file.fnMap)) {
    const entry = { name: fn.name, line: fn.decl.start.line, hit: (file.f[id] ?? 0) > 0 };
    functions.set(at(fn.decl), entry);
    if (ANONYMOUS.test(fn.name)) {
      anonymous.set(entry.line, [...(anonymous.get(entry.line) ?? []), entry]);
    } else {
      named.set(namedKey(fn.name, fn.decl.start.line), entry);
    }
  }
  const branches = new Map<string, MergedBranch>();
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const counts = file.b[id] ?? [];
    branches.set(branchKey(branch.type, branch.loc), {
      type: branch.type,
      line: branch.loc.start.line,
      arms: branch.locations.map((_, arm) => (counts[arm] ?? 0) > 0),
    });
  }
  return { functions, named, anonymous, branches };
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

function note(projection: Projection, kind: "unmatchedFunctions" | "unmatchedArms", entry: string): void {
  if (projection[kind] < SAMPLE_LIMIT) {
    projection.sample.push(entry);
  }
  projection[kind]++;
}

// Each projector marks the universe entries this input hit and tallies the hits that found none.
// The React Compiler re-emits a component and hoists its callbacks, so a browser copy keeps the line but can lose the
// column. A line with two anonymous functions is ambiguous, and its hit stays unmatched.
function movedFunction(into: MergedFile, fn: IstanbulFile["fnMap"][string]): MergedFunction | undefined {
  if (ANONYMOUS.test(fn.name)) {
    const onLine = into.anonymous.get(fn.decl.start.line) ?? [];
    return onLine.length === 1 ? onLine[0] : undefined;
  }
  return into.named.get(namedKey(fn.name, fn.decl.start.line)) ?? into.named.get(namedKey(fn.name, fn.loc.start.line));
}

function projectFunctions(into: MergedFile, file: IstanbulFile, rel: string, projection: Projection): void {
  for (const [id, fn] of Object.entries(file.fnMap)) {
    const target = into.functions.get(at(fn.decl)) ?? movedFunction(into, fn);
    if ((file.f[id] ?? 0) === 0) {
      continue;
    }
    if (target === undefined) {
      note(projection, "unmatchedFunctions", `${rel} function ${fn.name} at ${at(fn.decl)}`);
    } else {
      target.hit = true;
      projection.matchedFunctions++;
    }
  }
}

function projectBranches(into: MergedFile, file: IstanbulFile, rel: string, projection: Projection): void {
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const target = into.branches.get(branchKey(branch.type, branch.loc));
    for (const [arm, count] of (file.b[id] ?? []).entries()) {
      if (count > 0 && (target === undefined || arm >= target.arms.length)) {
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
  readonly unexecuted: readonly UnexecutedFile[];
  readonly totals: CoverageTotals;
  /** Per later suite, its hits that found the universe entry at the same start position, and those that found none. */
  readonly projections: Readonly<Partial<Record<CoverageSuite, Projection>>>;
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
  return { ...summarize(files), projections };
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
