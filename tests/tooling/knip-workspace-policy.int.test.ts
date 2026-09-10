import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import config from "../../knip.ts";
import { expect, test } from "../support/tool-fixtures.ts";

test("native Knip checks tooling by default while production keeps the application-only dependency lens", ({ repoRoot, scratch }) => {
  const { ignoreWorkspaces = [] } = config;
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "knip-workspace-control", private: true, workspaces: ["packages/*", "tooling"] }));
  writeFileSync(join(scratch, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "tooling"\n');
  for (const [path, name, dependency] of [
    ["packages/kit", "@control/app", "unused-app-dependency"],
    ["tooling", "@control/tooling", "unused-tool-dependency"],
  ] as const) {
    mkdirSync(join(scratch, path, "src"), { recursive: true });
    writeFileSync(join(scratch, path, "package.json"), JSON.stringify({ name, private: true, dependencies: { [dependency]: "1.0.0" } }));
    writeFileSync(join(scratch, path, "src/index.ts"), "export {};\n");
  }
  writeFileSync(
    join(scratch, "knip.json"),
    JSON.stringify({
      ignoreWorkspaces,
      workspaces: {
        ".": { entry: [], project: [] },
        "packages/kit": { entry: ["src/index.ts!"], project: ["src/**/*.ts!"] },
        tooling: { entry: ["src/index.ts"], project: ["src/**/*.ts"] },
      },
    }),
  );

  const normal = runNicedSync("pnpm", ["exec", "knip", "--directory", scratch, "--reporter", "json"], { cwd: repoRoot });
  expect(normal.status, `${normal.stdout}\n${normal.stderr}`).toBe(1);
  expect(normal.stdout).toContain("unused-tool-dependency");
  expect(normal.stdout).toContain("unused-app-dependency");

  const production = runNicedSync("pnpm", ["exec", "knip", "--directory", scratch, "--production", "--strict", "--reporter", "json"], { cwd: repoRoot });
  expect(production.status, `${production.stdout}\n${production.stderr}`).toBe(1);
  expect(production.stdout).not.toContain("unused-tool-dependency");
  expect(production.stdout).toContain("unused-app-dependency");
});
