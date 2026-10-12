// A type project's `typecheck.exclude` replaces Vitest's default exclusion, so each list must keep it. Once a
// workspace package under tests/ owns a node_modules, a dependency's `.test-d.ts` would otherwise join the type
// lanes and the application test population. Native `vitest list` over a planted tree, using the real lists.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type { TestProjectConfiguration } from "vitest/config";
import { vitestConfig } from "../../vitest.config.ts";
import { scaledBudget } from "./_load-budget.ts";

const AUTHORED = ["tests/kit/guards/index.test-d.ts", "tests/client/lib/registry.dom.test-d.ts"];
const DEPENDENCY = "tests/support/node_modules/@orb/server/node_modules/pino/test/types/pino.test-d.ts";

interface TypeProject {
  readonly name: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[] | undefined;
}

function typeProjects(projects: readonly TestProjectConfiguration[]): readonly TypeProject[] {
  return projects.flatMap((project) => {
    if (typeof project !== "object" || project instanceof Promise || !("test" in project)) {
      return [];
    }
    const { name, typecheck } = project.test ?? {};
    if (typecheck?.enabled !== true || typeof name !== "string") {
      return [];
    }
    return [{ name, include: typecheck.include ?? [], exclude: typecheck.exclude }];
  });
}

function listed(root: string, projects: readonly TypeProject[]): readonly string[] {
  const configPath = join(root, "vitest.config.mjs");
  const output = join(root, "list.json");
  const config = {
    root,
    test: {
      projects: projects.map(({ name, include, exclude }) => ({
        test: { name, include: [], typecheck: { enabled: true, only: true, include, ...(exclude === undefined ? {} : { exclude }) } },
      })),
    },
  };
  writeFileSync(configPath, `export default ${JSON.stringify(config)};\n`);
  const result = runNicedSync(
    process.execPath,
    [join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "list", "--filesOnly", `--json=${output}`, "--config", configPath],
    {
      cwd: process.cwd(),
      timeout: scaledBudget(30_000),
    },
  );
  expect(result.status, result.stderr).toBe(0);
  const entries: unknown = JSON.parse(readFileSync(output, "utf8"));
  if (!Array.isArray(entries)) {
    throw new Error("vitest list returned no array");
  }
  return entries
    .map((entry: unknown) => {
      const file = typeof entry === "object" && entry !== null ? Reflect.get(entry, "file") : undefined;
      if (typeof file !== "string") {
        throw new Error(`vitest list returned an unknown entry shape: ${JSON.stringify(entry)}`);
      }
      return relative(root, file);
    })
    .toSorted();
}

for (const [label, applicationOnly] of [
  ["repository", false],
  ["application", true],
] as const) {
  test(`the ${label} type projects list authored type tests and never a dependency's`, { timeout: scaledBudget(60_000) }, ({ scratch }) => {
    for (const path of [...AUTHORED, DEPENDENCY]) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), "export {};\n");
    }
    const projects = typeProjects(vitestConfig(false, applicationOnly).test?.projects ?? []);
    expect(projects.length).toBeGreaterThan(0);
    expect(listed(scratch, projects)).toEqual(AUTHORED.toSorted());
  });
}
