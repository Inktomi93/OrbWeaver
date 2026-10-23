import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import knipConfig, { config } from "../../knip.ts";

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

test("native Knip checks shipped and author-time symbols without baseline suppression", ({ repoRoot, scratch }) => {
  const ui = "packages/ui";
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "knip-symbol-owner-control", private: true, workspaces: ["packages/*"] }));
  writeFileSync(join(scratch, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
  mkdirSync(join(scratch, ui, "src"), { recursive: true });
  writeFileSync(
    join(scratch, ui, "package.json"),
    JSON.stringify({
      name: "@control/ui",
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      scripts: { "tokens:build": "node tokens.build.ts" },
    }),
  );
  writeFileSync(join(scratch, ui, "src/index.ts"), 'import { shippedUsed } from "./lib.ts";\nexport const door = shippedUsed;\n');
  writeFileSync(join(scratch, ui, "src/lib.ts"), "export const shippedUsed = 1;\nexport const shippedTestOnly = 2;\n");
  writeFileSync(join(scratch, ui, "tokens.build.ts"), 'import { buildUsed } from "./token-contract.ts";\nconsole.log(buildUsed);\n');
  writeFileSync(join(scratch, ui, "token-contract.ts"), "export const buildUsed = 1;\nexport const buildOrphan = 2;\n");
  const run = (mode: Parameters<typeof knipConfig>[0], flags: readonly string[]): ReturnType<typeof runNicedSync> => {
    const workspace = knipConfig(mode).workspaces?.[ui];
    writeFileSync(join(scratch, "knip.json"), JSON.stringify({ workspaces: { ".": { entry: [], project: [] }, [ui]: workspace } }));
    return runNicedSync("pnpm", ["exec", "knip", "--directory", scratch, "--reporter", "json", ...flags], { cwd: repoRoot });
  };

  const normal = run({}, []);
  expect(normal.status, `${normal.stdout}\n${normal.stderr}`).toBe(1);
  expect(normal.stdout).toContain("buildOrphan");
  expect(normal.stdout).toContain("shippedTestOnly");

  const production = run({ production: true, strict: true }, ["--production", "--strict"]);
  expect(production.status, `${production.stdout}\n${production.stderr}`).toBe(1);
  expect(production.stdout).toContain("shippedTestOnly");
});
