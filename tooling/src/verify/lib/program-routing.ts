// TypeScript's config parser owns root membership; the cold TS7 wrapper owns imported closures.
// Project-world intent chooses one primary only after the compiler proves that program roots the file.
// Primary plans are editor advisories. Affected plans are complete scoped-verification selections.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { runGit } from "@orb/tooling/_shared/git";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { isTypeWorldSource, predictedProgram, requiresExclusiveRoot } from "@orb/tooling/_shared/project-worlds";
import type { CompilerProgram, PolicyRepositoryInventory, PolicySemanticPath } from "../contract/policy-scope.ts";
import type { TypecheckPlan, TypecheckPlanMode, TypecheckPlanSubject } from "../contract/typecheck-plan.ts";
import { readCompilerProgramsFromInventory, resolvePolicyPathOwnership } from "./policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "./policy-repo-inventory.ts";
import { GIT_READ_PREFIX, gitLsFiles } from "./repo-paths.ts";

const TSCONFIG_RE = /(?:^|\/)tsconfig(?:[.-][^/]*)?\.json$/u;
const LIST_FILES_MAX_BUFFER = 67_108_864;

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted(compare);
}

function gitOutput(root: string, args: readonly string[]): string {
  const result = runGit(root, [...GIT_READ_PREFIX, ...args]);
  if (result.status !== 0) {
    throw new Error(`typecheck planning git ${args[0] ?? "read"} failed (exit ${String(result.status)}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Content identity for the native membership snapshot. Paths alone are insufficient: an import edit can
 * change closure membership without changing Git status. The key reads Git's path lists itself rather
 * than the validated inventory, whose per-file stat walk is most of a warm plan's cost. */
function snapshotKey(root: string): string {
  const headResult = runGit(root, [...GIT_READ_PREFIX, "rev-parse", "HEAD"]);
  const head = headResult.status === 0 ? headResult.stdout.trim() : "no-head";
  const dirty =
    headResult.status === 0
      ? gitOutput(root, ["diff", "--name-only", "-z", "HEAD"])
          .split("\0")
          .filter((path) => path !== "")
      : gitLsFiles(root, []);
  const paths = sortedUnique([...dirty, ...gitLsFiles(root, ["--others", "--exclude-standard"])]);
  const digest = createHash("sha1");
  for (const path of paths) {
    const absolute = join(root, path);
    digest.update(path);
    digest.update("\0");
    digest.update(existsSync(absolute) ? readFileSync(absolute) : "<deleted>");
    digest.update("\0");
  }
  return `${head}:${digest.digest("hex")}`;
}

interface PlanningSnapshot {
  readonly root: string;
  readonly key: string;
  readonly programs: readonly CompilerProgram[];
  readonly contained?: ReadonlyMap<string, readonly string[]>;
}

// The one process-wide snapshot. It holds only a snapshot whose key was read again, unchanged, after its
// membership was read, so a key always names the bytes its snapshot came from.
let planningMemo: PlanningSnapshot | undefined;

/** The memo when it already answers this key and mode. A hit reads nothing from the tree, so it owes no
 *  second key read. */
function warmSnapshot(root: string, key: string, needsClosures: boolean): PlanningSnapshot | undefined {
  const memo = planningMemo;
  return memo?.root === root && memo.key === key && (!needsClosures || memo.contained !== undefined) ? memo : undefined;
}

/** Read membership for `key`, reusing the memo's programs when only its closures are missing. The caller
 *  commits the result only after the key reads the same again. */
function readSnapshot(root: string, key: string, inventory: PolicyRepositoryInventory, needsClosures: boolean): PlanningSnapshot {
  const reusable = planningMemo?.root === root && planningMemo.key === key ? planningMemo : undefined;
  const programs = reusable?.programs ?? readCompilerProgramsFromInventory(inventory);
  const contained = needsClosures ? closuresByFile(root, programs) : reusable?.contained;
  return { root, key, programs, ...(contained === undefined ? {} : { contained }) };
}

function repoRelative(root: string, file: string, config: string): string | undefined {
  const absolute = isAbsolute(file) ? file : resolve(root, file);
  let canonical: string;
  try {
    canonical = realpathSync(absolute);
  } catch (error) {
    throw new Error(`compiler closure member from ${config} cannot be resolved: ${file}`, { cause: error });
  }
  const rel = relative(root, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return;
  }
  return rel.split(sep).join("/");
}

/** One native program's authored import closure. Cold by construction: incremental state is never read. */
function readProgramClosure(root: string, program: CompilerProgram): ReadonlySet<string> {
  const wrapper = join(root, "scripts", "ts7.ts");
  const result = runNicedSync("pnpm", ["exec", "node", wrapper, "--noEmit", "--pretty", "false", "--listFilesOnly", "-p", program.config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (result.status !== 0) {
    const detail = [result.stderr.trim(), result.stdout.trim()].filter((part) => part !== "").join("\n");
    throw new Error(
      `typecheck planning could not read the native closure for ${program.config} (exit ${String(result.status)})${detail === "" ? "" : `:\n${detail}`}`,
    );
  }
  const members = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const value = line.trim();
    if (value === "" || value.includes(`${sep}node_modules${sep}`) || value.includes("/node_modules/")) {
      continue;
    }
    const rel = repoRelative(root, value, program.config);
    if (rel !== undefined) {
      members.add(rel);
    }
  }
  const missingRoots = program.files.filter((file) => !members.has(file));
  if (missingRoots.length > 0) {
    throw new Error(`native closure for ${program.config} omitted ${String(missingRoots.length)} parsed root(s), including ${missingRoots[0]}`);
  }
  return members;
}

function rootsByFile(programs: readonly CompilerProgram[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const program of programs) {
    for (const file of program.files) {
      const owners = result.get(file) ?? [];
      owners.push(program.id);
      result.set(file, owners);
    }
  }
  return new Map([...result].map(([file, owners]) => [file, sortedUnique(owners)]));
}

function closuresByFile(root: string, programs: readonly CompilerProgram[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const program of programs) {
    for (const file of readProgramClosure(root, program)) {
      const owners = result.get(file) ?? [];
      owners.push(program.id);
      result.set(file, owners);
    }
  }
  return new Map([...result].map(([file, owners]) => [file, sortedUnique(owners)]));
}

function primaryPrograms(path: PolicySemanticPath, rootedBy: readonly string[], everyProgram: readonly string[]): readonly string[] {
  if (path.status === "deleted") {
    return everyProgram;
  }
  const predicted = predictedProgram(path.path);
  if (predicted !== undefined) {
    if (!rootedBy.includes(predicted)) {
      throw new Error(`typecheck primary for ${path.path} is ${predicted}, but the native compiler roots are {${rootedBy.join(", ") || "none"}}`);
    }
    if (requiresExclusiveRoot(path.path) && rootedBy.length !== 1) {
      throw new Error(`typecheck primary for ${path.path} must be exclusive, but the native compiler roots are {${rootedBy.join(", ")}}`);
    }
    return [predicted];
  }
  if (rootedBy.length === 1) {
    return rootedBy;
  }
  if (rootedBy.length > 1 && path.path.endsWith(".d.ts")) {
    return rootedBy;
  }
  if (rootedBy.length > 1) {
    throw new Error(`typecheck primary for ${path.path} is ambiguous across native roots {${rootedBy.join(", ")}}`);
  }
  throw new Error(`typecheck primary for ${path.path} has no native compiler root`);
}

interface SubjectSelection {
  readonly rootedBy: readonly string[];
  readonly containedBy: readonly string[];
  readonly selectedPrograms: readonly string[];
  readonly reason: TypecheckPlanSubject["reason"];
}

function selectedSubject(path: PolicySemanticPath, selection: SubjectSelection): TypecheckPlanSubject {
  return { ...path, disposition: "selected", ...selection };
}

interface SubjectContext {
  readonly programs: readonly CompilerProgram[];
  readonly everyProgram: readonly string[];
  readonly rooted: ReadonlyMap<string, readonly string[]>;
  readonly contained: ReadonlyMap<string, readonly string[]>;
  readonly mode: TypecheckPlanMode;
}

/** `configs` is the path's compiler ownership, resolved for every subject in one pass by the caller. */
function planSubject(context: SubjectContext, path: PolicySemanticPath, configs: readonly string[]): TypecheckPlanSubject {
  const rootedBy = context.rooted.get(path.path) ?? [];
  const containedBy = context.contained.get(path.path) ?? [];
  if (path.status === "deleted") {
    return selectedSubject(path, { rootedBy, containedBy, selectedPrograms: context.everyProgram, reason: "deleted-conservative" });
  }
  if (configs.length > 0 && context.programs.some((program) => program.configPaths.includes(path.path))) {
    return selectedSubject(path, { rootedBy, containedBy, selectedPrograms: configs, reason: "compiler-config-input" });
  }
  if (!isTypeWorldSource(path.path)) {
    return {
      ...path,
      disposition: "not-applicable",
      rootedBy,
      containedBy,
      selectedPrograms: [],
      reason: TSCONFIG_RE.test(path.path) ? "abstract-config" : "not-type-input",
    };
  }
  if (context.mode === "primary") {
    return selectedSubject(path, {
      rootedBy,
      containedBy,
      selectedPrograms: primaryPrograms(path, rootedBy, context.everyProgram),
      reason: "primary-root",
    });
  }
  if (containedBy.length === 0) {
    throw new Error(`typecheck affected plan for ${path.path} found no native compiler closure`);
  }
  return selectedSubject(path, { rootedBy, containedBy, selectedPrograms: containedBy, reason: "affected-closure" });
}

/** Plan the native programs that can judge the selected semantic paths.
 *
 * `primary` runs the authored root's intended primary program and every program affected by config or
 * ambient input. It is intentionally an editor advisory. `affected` expands authored files through each
 * compiler's native import closure and is the complete selection used by scoped verification.
 *
 * One plan reads the inventory once and the key once. A cold plan reads the key a second time after its
 * membership read, and keeps the snapshot only if the key is unchanged. The key is read before the
 * inventory, so the second read spans every tree read the snapshot depends on. */
function planStableSnapshot(root: string, paths: readonly PolicySemanticPath[], mode: TypecheckPlanMode, retries: number): TypecheckPlan {
  const key = snapshotKey(root);
  const inventory = readPolicyRepositoryInventory(root);
  const authored = new Set(inventory.paths);
  for (const path of paths) {
    if (path.status !== "deleted" && !authored.has(path.path)) {
      throw new Error(`typecheck plan subject is not an authored file: ${path.path}`);
    }
  }
  const needsClosures = mode === "affected" && paths.some((path) => path.status !== "deleted" && isTypeWorldSource(path.path));
  let snapshot = warmSnapshot(root, key, needsClosures);
  if (snapshot === undefined) {
    const read = readSnapshot(root, key, inventory, needsClosures);
    if (snapshotKey(root) !== key) {
      if (retries > 0) {
        return planStableSnapshot(root, paths, mode, retries - 1);
      }
      throw new Error("typecheck planning inputs changed while compiler membership was being read; no stable plan is available");
    }
    planningMemo = read;
    snapshot = read;
  }
  const programs = snapshot.programs;
  const everyProgram = programs.map((program) => program.id).toSorted(compare);
  const rooted = rootsByFile(programs);
  const contained = snapshot.contained ?? new Map<string, readonly string[]>();
  const context: SubjectContext = { programs, everyProgram, rooted, contained, mode };
  const subjects = resolvePolicyPathOwnership(programs, paths).map(({ path, status, previousPath, programIds }) =>
    planSubject(context, { path, status, previousPath }, programIds),
  );

  return {
    mode,
    coverage: mode === "primary" ? "advisory-primary-programs" : "complete-affected-programs",
    programs: sortedUnique(subjects.flatMap((subject) => subject.selectedPrograms)),
    subjects,
  };
}

export function planTypecheckPrograms(rootInput: string, paths: readonly PolicySemanticPath[], mode: TypecheckPlanMode): TypecheckPlan {
  return planStableSnapshot(realpathSync(rootInput), paths, mode, 1);
}
