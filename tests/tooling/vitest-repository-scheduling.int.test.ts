// Native proof for the repository-resource execution group. `groupOrder` is the cross-group barrier;
// `fileParallelism:false` is the separate within-group lock. Tags or names alone provide neither.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { VITEST_RUNTIME_ONLY_GROUP_FILTER, vitestTypecheckGroupName } from "@orb/tooling/_shared/test-kinds";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const RUN_BUDGET_MS = scaledBudget(30_000);

interface NativeProject {
  readonly name: string;
  readonly include: readonly string[];
  readonly groupOrder?: number;
  readonly fileParallelism?: boolean;
  readonly typecheck?: {
    readonly enabled: boolean;
    readonly only: boolean;
    readonly include: readonly string[];
  };
}

function source(events: string, label: string, waitFor?: string): string {
  const marker = join(dirname(events), `${label}.started`);
  const wait =
    waitFor === undefined
      ? "await new Promise((resolve) => setTimeout(resolve, 250));"
      : `for (let i = 0; i < 200 && !existsSync(${JSON.stringify(waitFor)}); i += 1) { await new Promise((resolve) => setTimeout(resolve, 10)); }
  if (!existsSync(${JSON.stringify(waitFor)})) throw new Error("paired execution group did not start");`;
  return `import { appendFileSync, existsSync, writeFileSync } from "node:fs";
test(${JSON.stringify(label)}, async () => {
  appendFileSync(${JSON.stringify(events)}, ${JSON.stringify(`${label}:start\n`)});
  writeFileSync(${JSON.stringify(marker)}, "started");
  ${wait}
  appendFileSync(${JSON.stringify(events)}, ${JSON.stringify(`${label}:end\n`)});
});
`;
}

function config(root: string, projects: readonly NativeProject[]): string {
  return `export default ${JSON.stringify({
    root,
    test: {
      globals: true,
      pool: "forks",
      maxWorkers: 2,
      passWithNoTests: false,
      projects: projects.map((project) => ({
        extends: true,
        test: {
          name: project.name,
          include: project.include,
          ...(project.groupOrder === undefined ? {} : { sequence: { groupOrder: project.groupOrder } }),
          ...(project.fileParallelism === undefined ? {} : { fileParallelism: project.fileParallelism }),
          ...(project.typecheck === undefined ? {} : { typecheck: project.typecheck }),
        },
      })),
    },
  })};\n`;
}

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function runNative(root: string, projects: readonly NativeProject[], args: readonly string[] = []): Promise<readonly string[]> {
  const events = join(root, "events.log");
  const configPath = join(root, "vitest.config.mjs");
  writeFileSync(configPath, config(root, projects));
  const result = await spawnNiced("pnpm", ["exec", "vitest", "run", ...args, "--config", configPath, "--reporter=dot"], {
    cwd: process.cwd(),
    timeoutMs: RUN_BUDGET_MS,
  });
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return readFileSync(events, "utf8").trim().split("\n");
}

function typeOnlySource(events: string): string {
  return `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(events)}, "type-only:executed\\n");
export type TypeOnlyControl = string;
`;
}

function assertRepositoryBarrier(events: readonly string[]): void {
  const firstRepository = events.findIndex((event) => event.startsWith("repository-"));
  const lastNormal = events.findLastIndex((event) => event.startsWith("normal-") && event.endsWith(":end"));
  if (firstRepository < 0 || lastNormal < 0 || firstRepository <= lastNormal) {
    throw new Error(`repository execution group overlapped the normal group: ${events.join(", ")}`);
  }
}

function repositoryConcurrency(events: readonly string[]): { readonly starts: number; readonly maxActive: number; readonly finalActive: number } {
  let active = 0;
  let starts = 0;
  let maxActive = 0;
  for (const event of events.filter((entry) => entry.startsWith("repository-"))) {
    if (event.endsWith(":start")) {
      active += 1;
      starts += 1;
      maxActive = Math.max(maxActive, active);
    } else {
      active -= 1;
    }
  }
  return { starts, maxActive, finalActive: active };
}

test("native groupOrder waits for normal groups, then repository files run one at a time", { timeout: RUN_BUDGET_MS }, async ({ scratch }) => {
  const events = join(scratch, "events.log");
  write(scratch, "normal/a.test.ts", source(events, "normal-a"));
  write(scratch, "normal/b.test.ts", source(events, "normal-b"));
  write(scratch, "repository/a.repo.int.test.ts", source(events, "repository-a"));
  write(scratch, "repository/b.repo.int.test.ts", source(events, "repository-b"));

  const result = await runNative(scratch, [
    { name: "normal", include: ["normal/*.test.ts"], groupOrder: 0 },
    { name: "repository", include: ["repository/*.repo.int.test.ts"], groupOrder: 1, fileParallelism: false },
  ]);

  assertRepositoryBarrier(result);
  expect(repositoryConcurrency(result), result.join(", ")).toEqual({ starts: 2, maxActive: 1, finalActive: 0 });
});

test("named execution groups overlap when the scheduling controls are removed", { timeout: RUN_BUDGET_MS }, async ({ scratch }) => {
  const events = join(scratch, "events.log");
  const normalMarker = join(scratch, "normal.started");
  const repositoryMarker = join(scratch, "repository.started");
  write(scratch, "normal/a.test.ts", source(events, "normal", repositoryMarker));
  write(scratch, "repository/a.repo.int.test.ts", source(events, "repository", normalMarker));

  const result = await runNative(scratch, [
    { name: "normal", include: ["normal/*.test.ts"], groupOrder: 0 },
    { name: "repository", include: ["repository/*.repo.int.test.ts"], groupOrder: 0 },
  ]);

  expect(() => assertRepositoryBarrier(result)).toThrow("overlapped the normal group");
});

test("native runtime realms execute product and tooling repository kinds in their own tier exactly once", { timeout: RUN_BUDGET_MS }, async ({ scratch }) => {
  const events = join(scratch, "events.log");
  write(scratch, "tests/product/a.test.ts", source(events, "product-normal"));
  write(scratch, "tests/product/a.repo.int.test.ts", source(events, "product-repository"));
  write(scratch, "tests/tooling/a.test.ts", source(events, "tooling-normal"));
  write(scratch, "tests/tooling/a.repo.int.test.ts", source(events, "tooling-repository"));
  write(scratch, "tests/product/type-only.test-d.ts", typeOnlySource(events));

  const projects: readonly NativeProject[] = [
    { name: "product", include: ["tests/**/*.test.ts", "!tests/**/*.repo.int.test.ts", "!tests/tooling/**"], groupOrder: 0 },
    { name: "tooling", include: ["tests/tooling/**/*.test.ts", "!tests/tooling/**/*.repo.int.test.ts"], groupOrder: 0 },
    { name: "repository", include: ["tests/**/*.repo.int.test.ts"], groupOrder: 1, fileParallelism: false },
    { name: vitestTypecheckGroupName("node"), include: [], typecheck: { enabled: true, only: true, include: ["tests/**/*.test-d.ts"] } },
  ];

  const product = await runNative(scratch, projects, ["--exclude", "tests/tooling/**", `--project=${VITEST_RUNTIME_ONLY_GROUP_FILTER}`]);
  expect(product.toSorted()).toEqual(["product-normal:start", "product-normal:end", "product-repository:start", "product-repository:end"].toSorted());
  expect(product).not.toContain("type-only:executed");

  writeFileSync(events, "");
  const tooling = await runNative(scratch, projects, ["tests/tooling", `--project=${VITEST_RUNTIME_ONLY_GROUP_FILTER}`]);
  expect(tooling.toSorted()).toEqual(["tooling-normal:start", "tooling-normal:end", "tooling-repository:start", "tooling-repository:end"].toSorted());
  expect(tooling).not.toContain("type-only:executed");
});

test("package runtime scripts use the proven native realms and quote shell globs", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { readonly scripts?: Record<string, string> };
  expect(packageJson.scripts?.["test:node"]).toContain("run --exclude 'tests/tooling/**' --runtime-only");
  expect(packageJson.scripts?.["test:tooling"]).toContain("run tests/tooling --runtime-only");
});
