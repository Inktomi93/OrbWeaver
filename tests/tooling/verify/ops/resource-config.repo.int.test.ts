// Native repository config checks run after isolated fixture suites through the registered repository resource.
import { Project } from "ts-morph";
import { loadPackageMetadata, loadStaticConfig } from "../../../../tooling/src/verify/ops/resource-config.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function parser(): (path: string, text: string) => import("ts-morph").SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  return (path, text) => project.createSourceFile(path, text, { overwrite: true });
}

test("the current root package produces typed facts", ({ repoRoot }) => {
  const reader = createResourceReader({ root: repoRoot });
  expect(loadPackageMetadata(reader, "root").status).toBe("ready");
});

test("the current showcase package produces typed facts", ({ repoRoot }) => {
  const reader = createResourceReader({ root: repoRoot });
  expect(loadPackageMetadata(reader, "showcase-plugins")).toMatchObject({ status: "ready", value: { name: "@orb/showcase-plugins" } });
});

for (const id of ["eslint", "depcruise", "vitest", "playwright", "ct"] as const) {
  test(`the current ${id} config produces nonempty typed facts`, { timeout: scaledBudget(10_000) }, ({ repoRoot }) => {
    const reader = createResourceReader({ root: repoRoot });
    const result =
      id === "eslint" || id === "depcruise" || id === "vitest"
        ? createResourceHost({ root: repoRoot }).host.nativeConfig(id)
        : loadStaticConfig(reader, id, parser());
    expect(result.status, id).toBe("ready");
    expect(result.members, id).toBeGreaterThan(0);
  });
}
