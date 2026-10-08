// Native execution views retain canonical options and owners. Root projection happens before diagnostics;
// imports are never filtered, including an application import that reaches an instrument helper.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { authorProgramWorld, isTypeWorldSource, PACKAGE_NAMES, predictedProgram, requiresExclusiveRoot } from "@orb/tooling/_shared/project-worlds";
import { ambientRootsForProgram, ambientScopeOf } from "@orb/tooling/_shared/type-config-intent";
import type { ApplicationPopulation, ApplicationProgram, ApplicationSubjects } from "../contract/application.ts";
import type { CompilerProgram } from "../contract/policy-scope.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "../contract/population.ts";
import { applicationBuildRoots } from "./application-build-roots.ts";
import { applicationTestRoots } from "./application-test-roots.ts";
import { readCompilerProgramsFromInventory } from "./policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "./policy-repo-inventory.ts";
import { populationIncludes } from "./population-resolver.ts";

const LIST_FILES_MAX_BUFFER = 67_108_864;
const TS7_WRAPPER = fileURLToPath(new URL("../../../../scripts/ts7.ts", import.meta.url));

export function nativeApplicationClosure(root: string, program: ApplicationProgram): ReadonlySet<string> {
  const result = runNicedSync(process.execPath, [TS7_WRAPPER, "--noEmit", "--listFilesOnly", "-p", program.config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (result.status !== 0) {
    throw new Error(`application native closure failed for ${program.owner.id}: ${result.stdout}\n${result.stderr}`);
  }
  const files = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (files.length === 0 || files.some((file) => !isAbsolute(file))) {
    throw new Error(`application native closure is absent or malformed: ${program.owner.id}`);
  }
  const normalized = new Set(files.map((file) => file.replaceAll("\\", "/")));
  const missing = program.roots.filter((file) => !normalized.has(resolve(root, file)));
  if (missing.length > 0) {
    throw new Error(`application native closure omitted roots: ${missing.join(", ")}`);
  }
  return normalized;
}

function requiredApplicationAmbients(owner: CompilerProgram): readonly string[] {
  const ambients = ambientRootsForProgram(owner.id);
  if (ambients === undefined) {
    throw new Error(`application compiler owner has no world intent: ${owner.id}`);
  }
  const missingAmbients = ambients.filter((path) => !owner.files.includes(path));
  if (missingAmbients.length > 0) {
    throw new Error(`application compiler owner omitted required ambients: ${owner.id}: ${missingAmbients.join(", ")}`);
  }
  return ambients;
}

function assertApplicationOwners(paths: readonly string[], programs: readonly CompilerProgram[]): void {
  for (const path of paths) {
    if (ambientScopeOf(path) !== undefined) {
      continue;
    }
    const owner = predictedProgram(path);
    const rootedBy = programs.filter((program) => program.files.includes(path));
    if (requiresExclusiveRoot(path) && rootedBy.length !== 1) {
      throw new Error(`application source has ambiguous canonical ownership: ${path}: ${rootedBy.map(({ id }) => id).join(", ")}`);
    }
    if (owner === undefined || !programs.some((program) => program.id === owner && program.files.includes(path))) {
      throw new Error(`application root has no canonical primary owner: ${path} (${owner ?? "unclassified"})`);
    }
  }
}

function writeApplicationViews({
  root,
  directory,
  owners,
  selected,
  configs,
}: {
  readonly root: string;
  readonly directory: string;
  readonly owners: readonly CompilerProgram[];
  readonly selected: ReadonlySet<string>;
  readonly configs: Set<string>;
}): readonly ApplicationProgram[] {
  const programs: ApplicationProgram[] = [];
  for (const owner of owners) {
    const members = owner.files.filter((path) => selected.has(path) && ambientScopeOf(path) === undefined);
    if (members.length === 0) {
      continue;
    }
    const ambients = requiredApplicationAmbients(owner);
    const programRoots = [...new Set([...members, ...ambients])].toSorted();
    // Type directives use the owning config directory even when every source root is absolute.
    const config = join(dirname(resolve(root, owner.config)), `.${basename(directory)}-${encodeURIComponent(owner.id)}.json`);
    configs.add(config);
    writeFileSync(
      config,
      JSON.stringify({
        extends: resolve(root, owner.config),
        files: programRoots.map((path) => resolve(root, path)),
        include: [],
        exclude: [],
        references: owner.references.map((path) => ({ path: resolve(root, path) })),
      }),
    );
    programs.push({ owner, config, roots: programRoots });
  }
  return programs;
}

export async function withApplicationPrograms<T>(root: string, use: (population: ApplicationPopulation) => Promise<T> | T): Promise<T> {
  const inventory = readPolicyRepositoryInventory(root);
  const unclassifiedPackages = inventory.paths.flatMap((path) => {
    const name = /^packages\/([^/]+)\/package\.json$/u.exec(path)?.[1];
    return name !== undefined && !(PACKAGE_NAMES as readonly string[]).includes(name) ? [name] : [];
  });
  if (unclassifiedPackages.length > 0) {
    throw new Error(`application qualification has unclassified workspaces: ${unclassifiedPackages.join(", ")}`);
  }
  const canonicalPrograms = readCompilerProgramsFromInventory(inventory);
  const authorRoots = canonicalPrograms.filter(({ id }) => authorProgramWorld(id) !== undefined).flatMap(({ files }) => files);
  const roots = [
    ...new Set([
      ...inventory.paths.filter((path) => isTypeWorldSource(path) && populationIncludes("@product", path)),
      ...authorRoots,
      ...applicationBuildRoots(inventory),
      ...applicationTestRoots(root, inventory.paths),
    ]),
  ].toSorted();
  if (roots.length === 0) {
    throw new Error("application qualification resolved no roots");
  }
  assertApplicationOwners(roots, canonicalPrograms);
  const selected = new Set(roots);
  const directory = mkdtempSync(join(tmpdir(), "orb-application-types-"));
  const configs = new Set<string>();
  try {
    const authored = new Set(inventory.paths);
    let programs: readonly ApplicationProgram[] = [];
    let closures: ReadonlyMap<string, ReadonlySet<string>> = new Map();
    let files: readonly string[] = [];
    for (;;) {
      programs = writeApplicationViews({ root, directory, owners: canonicalPrograms, selected, configs });
      closures = new Map(programs.map((program) => [program.owner.id, nativeApplicationClosure(root, program)]));
      files = [
        ...new Set(
          [...closures.values()].flatMap((closure) =>
            [...closure].map((path) => relative(root, path).replaceAll("\\", "/")).filter((path) => authored.has(path)),
          ),
        ),
      ].toSorted();
      const typed = files.filter(isTypeWorldSource);
      assertApplicationOwners(typed, canonicalPrograms);
      const additions = typed.filter((path) => !selected.has(path) && ambientScopeOf(path) === undefined);
      if (additions.length === 0) {
        break;
      }
      for (const path of additions) {
        selected.add(path);
      }
    }
    const packagePrefixes = POPULATION_SETS["@product"].flatMap((ref) => POPULATION_ROOTS[ref].map((path) => path.replace(/src\/$/u, "")));
    const subjects = [
      ...new Set([...files, ...inventory.paths.filter((path) => !isTypeWorldSource(path) && packagePrefixes.some((prefix) => path.startsWith(prefix)))]),
    ].toSorted();
    return await use({ inventory, roots, files, subjects, programs, canonicalPrograms, closures });
  } finally {
    for (const config of configs) {
      rmSync(config, { force: true });
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Resource evaluators must not observe native execution views as newly authored configuration. */
export async function readApplicationSubjects(root: string): Promise<ApplicationSubjects> {
  return await withApplicationPrograms(root, ({ inventory, roots, files, subjects }) => ({ inventory, roots, files, subjects }));
}
