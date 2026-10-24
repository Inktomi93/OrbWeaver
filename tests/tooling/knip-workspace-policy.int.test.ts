import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import knipConfig from "../../knip.ts";

test("production Knip counts tooling as a consumer and plain tests as none, while the default view judges tooling", ({ repoRoot, scratch }) => {
  const kit = "packages/kit";
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "knip-workspace-control", private: true, workspaces: ["packages/*", "tooling"] }));
  writeFileSync(join(scratch, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "tooling"\n');
  mkdirSync(join(scratch, kit, "src/door"), { recursive: true });
  writeFileSync(
    join(scratch, kit, "package.json"),
    JSON.stringify({ name: "@control/kit", private: true, exports: { "./door": "./src/door/index.ts" }, dependencies: { "unused-app-dependency": "1.0.0" } }),
  );
  writeFileSync(join(scratch, kit, "src/door/index.ts"), "export const kitToolUsed = 1;\nexport const kitTestOnly = 2;\nexport const kitOrphan = 3;\n");
  mkdirSync(join(scratch, "tooling/src/probe"), { recursive: true });
  writeFileSync(
    join(scratch, "tooling/package.json"),
    JSON.stringify({ name: "@control/tooling", private: true, dependencies: { "unused-tool-dependency": "1.0.0" } }),
  );
  writeFileSync(
    join(scratch, "tooling/src/probe/index.ts"),
    'import { kitToolUsed } from "../../../packages/kit/src/door/index.ts";\nconsole.log(kitToolUsed);\n',
  );
  mkdirSync(join(scratch, "tests"), { recursive: true });
  writeFileSync(join(scratch, "tests/door.test.ts"), 'import { kitTestOnly } from "../packages/kit/src/door/index.ts";\nconsole.log(kitTestOnly);\n');
  const run = (mode: Parameters<typeof knipConfig>[0], flags: readonly string[]): ReturnType<typeof runNicedSync> => {
    const { workspaces = {}, ...rest } = knipConfig(mode);
    const root = { entry: ["tests/**/*.test.ts"], project: ["tests/**/*.ts"] };
    writeFileSync(join(scratch, "knip.json"), JSON.stringify({ ...rest, workspaces: { ".": root, [kit]: workspaces[kit], tooling: workspaces["tooling"] } }));
    return runNicedSync("pnpm", ["exec", "knip", "--directory", scratch, "--reporter", "json", ...flags], { cwd: repoRoot });
  };

  const normal = run({}, []);
  expect(normal.status, `${normal.stdout}\n${normal.stderr}`).toBe(1);
  expect(normal.stdout).toContain("unused-tool-dependency");
  expect(normal.stdout).toContain("unused-app-dependency");
  expect(normal.stdout).toContain("kitOrphan");
  expect(normal.stdout).not.toContain("kitTestOnly");

  const production = run({ production: true, strict: true }, ["--production", "--strict"]);
  expect(production.status, `${production.stdout}\n${production.stderr}`).toBe(1);
  expect(production.stdout).not.toContain("unused-tool-dependency");
  expect(production.stdout).toContain("unused-app-dependency");
  expect(production.stdout).toContain("kitTestOnly");
  expect(production.stdout).toContain("kitOrphan");
  expect(production.stdout).not.toContain("kitToolUsed");
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
