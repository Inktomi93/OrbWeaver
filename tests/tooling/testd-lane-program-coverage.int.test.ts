// A `.test-d.ts` has value only when one Vitest type project selects it under the one TS program that
// roots it. This pin compares Vitest's native listing, TS7's native config roots, and Git's authored
// test census so a glob, tsconfig, or checker change cannot silently drop, double-own, or vacuously pass it.
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { vitestTypecheckGroupName } from "@orb/tooling/_shared/test-kinds";
import vitestConfig from "../../vitest.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const TYPE_PROGRAMS = [
  { project: vitestTypecheckGroupName("node"), tsconfig: "tsconfig.json" },
  { project: vitestTypecheckGroupName("browser"), tsconfig: "tsconfig.tests-dom.json" },
] as const;
const TYPE_CHECKER = "scripts/ts7.ts";
const SHOW_CONFIG_MAX_BUFFER = 268_435_456;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

interface TypecheckShape {
  readonly checker?: string;
  readonly enabled?: boolean;
  readonly only?: boolean;
  readonly tsconfig?: string;
}

interface ProjectShape {
  readonly test?: { readonly name?: string; readonly typecheck?: TypecheckShape };
}

interface NativeListEntry {
  readonly file: string;
  readonly projectName: string;
}

function repoRelative(root: string, file: string, source: string): string {
  const rel = relative(root, isAbsolute(file) ? file : join(root, file));
  if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`${source} returned a file outside the repository: ${file}`);
  }
  return rel;
}

function configuredTypeProjects(): ReadonlyMap<string, TypecheckShape> {
  const projects = (vitestConfig.test?.projects ?? []) as readonly ProjectShape[];
  const configured = new Map<string, TypecheckShape>();
  for (const project of projects) {
    const { name, typecheck } = project.test ?? {};
    if (typecheck?.enabled !== true) {
      continue;
    }
    if (name === undefined || configured.has(name)) {
      throw new Error(`Vitest has an unnamed or duplicate enabled type project: ${String(name)}`);
    }
    configured.set(name, typecheck);
  }
  if (configured.size === 0) {
    throw new Error("Vitest exposes no enabled type projects; this witness could not measure lane ownership");
  }
  return configured;
}

function authoredTypeTests(root: string): readonly string[] {
  const res = runNicedSync("git", ["ls-files", "--", "tests"], { cwd: root });
  if (res.status !== 0) {
    throw new Error(`git ls-files failed (exit ${String(res.status)}); the authored type-test census is unknown`);
  }
  const files = res.stdout.split("\n").filter((line) => line.endsWith(".test-d.ts"));
  if (files.length === 0) {
    throw new Error("Git reports no authored `.test-d.ts` files; an empty census is not a clean verdict");
  }
  return files;
}

function nativeTypeSelections(root: string, outputFile: string): readonly NativeListEntry[] {
  const args = [
    join(root, "node_modules", "vitest", "vitest.mjs"),
    "list",
    "--filesOnly",
    `--json=${outputFile}`,
    ...TYPE_PROGRAMS.flatMap(({ project }) => ["--project", project]),
  ];
  const res = runNicedSync(process.execPath, args, { cwd: root, maxBuffer: SHOW_CONFIG_MAX_BUFFER });
  if (res.status !== 0) {
    throw new Error(`vitest list --filesOnly failed (exit ${String(res.status)}); type-lane selection is unknown\n${res.stderr}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch (error) {
    throw new Error(`vitest list produced no readable JSON listing: ${String(error)}`, { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("vitest list produced an empty or non-array type-test listing; this is not a clean verdict");
  }
  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof Reflect.get(entry, "file") !== "string" ||
      typeof Reflect.get(entry, "projectName") !== "string"
    ) {
      throw new Error(`vitest list returned an unknown entry shape: ${JSON.stringify(entry)}`);
    }
  }
  return parsed as NativeListEntry[];
}

function programRoots(root: string, tsconfig: string): ReadonlySet<string> {
  const res = runNicedSync(process.execPath, [join(root, "scripts", "ts7.ts"), "--showConfig", "-p", tsconfig], {
    cwd: root,
    maxBuffer: SHOW_CONFIG_MAX_BUFFER,
  });
  if (res.status !== 0) {
    throw new Error(`ts7 --showConfig failed for ${tsconfig} (exit ${String(res.status)}); program roots are unknown`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (error) {
    throw new Error(`ts7 --showConfig returned invalid JSON for ${tsconfig}: ${String(error)}`, { cause: error });
  }
  const files = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "files") : undefined;
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== "string")) {
    throw new Error(`ts7 --showConfig returned no usable file roots for ${tsconfig}`);
  }

  const roots = new Set<string>();
  for (const file of files as string[]) {
    const rel = relative(root, isAbsolute(file) ? file : join(root, tsconfig, "..", file));
    if (rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel) && !rel.includes("node_modules/")) {
      roots.add(rel);
    }
  }
  if (roots.size === 0) {
    throw new Error(`ts7 --showConfig resolved zero repository roots for ${tsconfig}`);
  }
  return roots;
}

test("every authored `.test-d.ts` has exactly one matching native Vitest lane and TS7 program", ({ repoRoot, scratch }) => {
  const configured = configuredTypeProjects();
  expect([...configured.keys()].toSorted(compareText)).toEqual(TYPE_PROGRAMS.map(({ project }) => project).toSorted(compareText));
  for (const { project, tsconfig } of TYPE_PROGRAMS) {
    expect(configured.get(project)).toMatchObject({ checker: TYPE_CHECKER, only: true, tsconfig });
  }

  const authored = authoredTypeTests(repoRoot);
  const authoredSet = new Set(authored);
  const listed = nativeTypeSelections(repoRoot, join(scratch, "vitest-type-files.json"));
  const knownProjects = new Set(TYPE_PROGRAMS.map(({ project }) => project));
  const selections = new Map<string, Set<string>>();
  const rows = new Set<string>();
  for (const entry of listed) {
    if (!knownProjects.has(entry.projectName as (typeof TYPE_PROGRAMS)[number]["project"])) {
      throw new Error(`vitest list returned the unknown type project ${entry.projectName}`);
    }
    const rel = repoRelative(repoRoot, entry.file, "vitest list");
    if (!rel.endsWith(".test-d.ts")) {
      throw new Error(`vitest type project ${entry.projectName} selected a non-type test: ${rel}`);
    }
    const row = `${entry.projectName}:${rel}`;
    if (rows.has(row)) {
      throw new Error(`vitest list returned the duplicate selection ${row}`);
    }
    rows.add(row);
    const projects = selections.get(rel) ?? new Set<string>();
    projects.add(entry.projectName);
    selections.set(rel, projects);
  }

  const selectedOutsideCensus = [...selections.keys()].filter((rel) => !authoredSet.has(rel)).toSorted(compareText);
  expect(selectedOutsideCensus, "Vitest selected type tests absent from Git's authored census").toEqual([]);
  for (const { project } of TYPE_PROGRAMS) {
    expect(
      listed.some((entry) => entry.projectName === project),
      `${project} selected zero files; an empty native lane is not a clean verdict`,
    ).toBe(true);
  }

  const roots = new Map(TYPE_PROGRAMS.map(({ project, tsconfig }) => [project, programRoots(repoRoot, tsconfig)]));
  for (const rel of authored) {
    const selectedBy = [...(selections.get(rel) ?? [])].toSorted(compareText);
    const rootedBy = TYPE_PROGRAMS.filter(({ project }) => roots.get(project)?.has(rel) === true)
      .map(({ project }) => project)
      .toSorted(compareText);
    expect(selectedBy, `${rel} must be selected by exactly one native Vitest type project`).toHaveLength(1);
    expect(rootedBy, `${rel} must be rooted by exactly one TS7 type-test program`).toHaveLength(1);
    expect(selectedBy, `${rel} is selected by ${selectedBy.join(", ")} but rooted by ${rootedBy.join(", ")}`).toEqual(rootedBy);
  }
});
