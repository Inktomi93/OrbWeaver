// Native collection proves the application population without executing suites or starting the stack.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { classifyTestFilename, runtimeForTestFamily } from "@orb/tooling/_shared/test-kinds";
import { classifyCtListing } from "../../../tooling/src/verify/lib/ct-listing.ts";
import { readPolicyRepositoryInventory } from "../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const COLLECTION_TIMEOUT = scaledBudget(120_000);
const CONTAMINATED_ENV = Object.fromEntries([["ORB_APPLICATION_TESTS_ONLY", "1"]]);

test("native product Node collection includes every application runtime kind without tooling resource tests", { timeout: COLLECTION_TIMEOUT }, async ({
  repoRoot,
  scratch,
}) => {
  const output = join(scratch, "product-node.json");
  const result = await spawnNiced(
    process.execPath,
    [
      join(repoRoot, "node_modules/vitest/vitest.mjs"),
      "list",
      "--filesOnly",
      "--config=vitest.runtime.config.ts",
      "--exclude=tests/tooling/**",
      `--json=${output}`,
    ],
    {
      cwd: repoRoot,
      timeoutMs: COLLECTION_TIMEOUT,
    },
  );
  expect(result.code, result.stderr).toBe(0);
  const rows = JSON.parse(readFileSync(output, "utf8")) as readonly { readonly file: string; readonly projectName: string }[];
  const files = rows.map(({ file }) => relative(repoRoot, file).replaceAll("\\", "/")).toSorted();
  const expected = readPolicyRepositoryInventory(repoRoot)
    .trackedPaths.filter((path) => {
      const kind = classifyTestFilename(path)?.definition;
      return kind !== undefined && runtimeForTestFamily(kind.family) === "vitest" && !path.startsWith("tests/tooling/");
    })
    .toSorted();
  expect(files).toEqual(expected);
  expect(rows.some(({ projectName }) => projectName === "integration")).toBe(true);
  expect(rows.some(({ projectName }) => projectName === "unit")).toBe(true);
  expect(rows.some(({ projectName }) => projectName === "contract")).toBe(true);
});

test("native CT collection retains every application component test and excludes only tooling proofs", { timeout: COLLECTION_TIMEOUT }, async ({
  repoRoot,
}) => {
  const filesAt = async (config: string, env: Readonly<Record<string, string>>): Promise<readonly string[]> => {
    const result = await spawnNiced(
      process.execPath,
      [join(repoRoot, "node_modules/@playwright/test/cli.js"), "test", "-c", "playwright-ct.config.ts", `--config=${config}`, "--list", "--reporter=json"],
      {
        cwd: repoRoot,
        env,
        timeoutMs: COLLECTION_TIMEOUT,
      },
    );
    expect(result.code, result.stderr).toBe(0);
    const collection = classifyCtListing(repoRoot, { status: result.code, stdout: result.stdout, stderr: result.stderr });
    if ("error" in collection) {
      throw new Error(collection.error);
    }
    return collection.files.toSorted();
  };
  const whole = await filesAt("playwright-ct.config.ts", {});
  const contaminated = await filesAt("playwright-ct.config.ts", CONTAMINATED_ENV);
  const application = await filesAt("playwright-ct.product.config.ts", CONTAMINATED_ENV);
  const expected = readPolicyRepositoryInventory(repoRoot)
    .trackedPaths.filter((path) => classifyTestFilename(path)?.definition.family === "component")
    .toSorted();
  expect(whole).toEqual(expected);
  expect(contaminated).toEqual(whole);
  expect(application).toEqual(expected.filter((path) => !path.startsWith("tests/tooling/")));
  expect(whole.filter((path) => !application.includes(path))).toEqual(["tests/tooling/design-audit-walker.ct.tsx", "tests/tooling/snap/ops/overflow.ct.tsx"]);
});

test("native type-assertion collection retains all application worlds and excludes only tooling proofs", { timeout: COLLECTION_TIMEOUT }, async ({
  repoRoot,
  scratch,
}) => {
  const filesAt = async (config: string, env: Readonly<Record<string, string>>): Promise<readonly string[]> => {
    const output = join(scratch, `${config}.json`);
    const result = await spawnNiced(
      process.execPath,
      [join(repoRoot, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", "--project=types-*", `--config=${config}`, `--json=${output}`],
      {
        cwd: repoRoot,
        env,
        timeoutMs: COLLECTION_TIMEOUT,
      },
    );
    expect(result.code, result.stderr).toBe(0);
    const rows = JSON.parse(readFileSync(output, "utf8")) as readonly { readonly file: string; readonly projectName: string }[];
    return rows.map(({ file, projectName }) => `${relative(repoRoot, file).replaceAll("\\", "/")}:${projectName}`).toSorted();
  };
  const whole = await filesAt("vitest.config.ts", {});
  const contaminated = await filesAt("vitest.config.ts", CONTAMINATED_ENV);
  const application = await filesAt("vitest.product.config.ts", CONTAMINATED_ENV);
  const expected = readPolicyRepositoryInventory(repoRoot)
    .trackedPaths.flatMap((path) => {
      const kind = classifyTestFilename(path)?.definition;
      return kind?.family === "type" ? [`${path}:types-${kind.compilerWorld}`] : [];
    })
    .toSorted();
  expect(whole).toEqual(expected);
  expect(contaminated).toEqual(whole);
  expect(application).toEqual(expected.filter((path) => !path.startsWith("tests/tooling/")));
  expect(whole.filter((path) => !application.includes(path))).toEqual(expected.filter((path) => path.startsWith("tests/tooling/")));
  expect(application.some((path) => path.endsWith(":types-browser"))).toBe(true);
  expect(application.some((path) => path.endsWith(":types-node"))).toBe(true);
});
