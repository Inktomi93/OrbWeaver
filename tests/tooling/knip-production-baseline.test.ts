import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import productionConfig from "../../knip.ts";
import { KNIP_BASELINE, KNIP_FINDINGS } from "../../knip-baseline.config.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KNIP = join(ROOT, "node_modules/knip/bin/knip.js");
const PREPROCESSOR = join(ROOT, "knip-baseline.config.ts");
const key = (type: string, file: string, symbol: string): string => JSON.stringify([type, file, "", symbol]);

function fixture(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "orb-knip-baseline-"));
  try {
    mkdirSync(join(root, "reports"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "baseline-control", type: "module", exports: "./main.ts" }));
    writeFileSync(join(root, "knip.json"), JSON.stringify({ entry: ["main.ts!"], project: ["*.ts!"], includeEntryExports: true }));
    writeFileSync(join(root, "main.ts"), 'import { used } from "./lib.ts";\nconsole.log(used());\n');
    writeFileSync(join(root, "lib.ts"), "export const used = () => 1;\nexport const unused = () => 2;\n");
    writeFileSync(join(root, KNIP_BASELINE), JSON.stringify([key("exports", "lib.ts", "unused")]));
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function check(root: string, baseline = true): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [KNIP, "--production", "--strict", "--no-progress", ...(baseline ? ["--preprocessor", PREPROCESSOR] : [])], {
    cwd: root,
    encoding: "utf8",
  });
}

test("the native CLI reports unused declared exports, admitting only recorded findings", () => {
  fixture((root) => {
    const red = check(root, false);
    expect(red.status, red.stderr).toBe(1);
    expect(red.stdout).toContain("unused");
    const green = check(root);
    expect(green.status, green.stderr).toBe(0);
    expect(readFileSync(join(root, KNIP_FINDINGS), "utf8")).toContain('"symbol": "unused"');
    writeFileSync(join(root, "lib.ts"), "export const used = () => 1;\nexport const unused = () => 2;\nexport const newDebt = () => 3;\n");
    const added = check(root);
    expect(added.status, added.stderr).toBe(1);
    expect(added.stdout).toContain("newDebt");
  });
});

test("a consumed export makes its baseline key stale and fails with a verdict, not a tool error", () => {
  fixture((root) => {
    writeFileSync(join(root, "main.ts"), 'import { used, unused } from "./lib.ts";\nconsole.log(used(), unused());\n');
    const stale = check(root);
    expect(stale.status, stale.stderr).toBe(1);
    expect(stale.stdout).toContain("STALE baseline key");
    writeFileSync(join(root, KNIP_BASELINE), "[]");
    const clean = check(root);
    expect(clean.status, clean.stderr).toBe(0);
  });
});

test("dependency and unresolved findings cannot be admitted by baseline entries", () => {
  fixture((root) => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "baseline-control", type: "module", exports: "./main.ts", dependencies: { "unused-dependency": "1.0.0" } }),
    );
    writeFileSync(join(root, "main.ts"), 'import "./missing.ts";\nimport { used } from "./lib.ts";\nconsole.log(used());\n');
    writeFileSync(
      join(root, KNIP_BASELINE),
      JSON.stringify([
        key("exports", "lib.ts", "unused"),
        key("dependencies", "package.json", "unused-dependency"),
        key("unresolved", "main.ts", "./missing.ts"),
      ]),
    );
    const result = check(root);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("unused-dependency");
    expect(result.stdout).toContain("missing.ts");
  });
});

test("production Knip enters the real server launch and media-check roots without exporting them", () => {
  fixture((root) => {
    mkdirSync(join(root, "packages/server/src/entry"), { recursive: true });
    writeFileSync(join(root, "packages/server/package.json"), JSON.stringify({ name: "@proof/server", type: "module", exports: "./src/index.ts" }));
    writeFileSync(join(root, "packages/server/src/index.ts"), "export {};\n");
    writeFileSync(join(root, "packages/server/src/entry/index.ts"), 'import "launch-only-unlisted";\n');
    writeFileSync(join(root, "packages/server/src/entry/check-media.ts"), 'import "media-only-unlisted";\n');
    const configured = productionConfig({ production: true, strict: true });
    writeFileSync(
      join(root, "knip.json"),
      JSON.stringify({
        workspaces: {
          ".": { entry: ["main.ts!"], project: ["*.ts!"] },
          "packages/server": configured.workspaces?.["packages/server"],
        },
        includeEntryExports: true,
      }),
    );
    const result = check(root);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("launch-only-unlisted");
    expect(result.stdout).toContain("media-only-unlisted");
  });
});
