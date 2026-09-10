// Permanent native-population pin for eslint-grant-liveness. The old corpus-wide glob reader called a
// local ignore live when only unrelated files outside its parent config matched; these cases execute the
// config-snapshot boundary and assert the entry/field identity the operator receives.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx, GateScanDeclaration } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "eslint.config.js";
const GATE_SELF = "tooling/src/verify/gates/eslint-grant-liveness.ts";
const LIVE_SOURCE = "export const live = 1;\n";
const RATIFIED = '"**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", ".cache/**"';

interface Run {
  readonly findings: readonly Finding[];
  readonly declarations: readonly GateScanDeclaration[];
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function config(entries: string): string {
  return `export default [{ ignores: [${RATIFIED}] }, ${entries}];\n`;
}

function plantRepo(root: string, files: Readonly<Record<string, string>>): void {
  plant(root, "package.json", '{"type":"module"}\n');
  plant(root, GATE_SELF, LIVE_SOURCE);
  plant(root, ".gitignore", "node_modules/\ndist/\n");
  plant(root, "reports/README.md", "reports\n");
  plant(root, "tooling/src/verify/gates/GATE-AUTHORING.md", "fixture law\n");
  plant(root, "tooling/src/_shared/stryker-config.ts", LIVE_SOURCE);
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

function runGate(root: string): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  const findings: Finding[] = [];
  const declarations: GateScanDeclaration[] = [];
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: (counts) => declarations.push(counts),
  };
  gate.run?.(ctx);
  return { findings, declarations };
}

const tokens = (run: Run): readonly (string | undefined)[] => run.findings.map((finding) => finding.token);
const messages = (run: Run): string => run.findings.map((finding) => finding.message ?? "").join("\n");

describe("eslint-grant-liveness native populations", () => {
  test("finds a dead file selector by config-entry identity", ({ scratch }) => {
    plantRepo(scratch, { [CONFIG_REL]: config('{ files: ["packages/ui/src/gone.ts"] }') });
    expect(tokens(runGate(scratch))).toContain("config[1].files[0]");
  });

  test("accepts the same selector when its file exists", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: config('{ files: ["packages/ui/src/live.ts"] }'),
      "packages/ui/src/live.ts": LIVE_SOURCE,
    });
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("finds a local ignore with no members inside its parent files scope", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: config('{ files: ["packages/client/src/**/*.ts"], ignores: ["**/*.test.ts"] }'),
      "packages/client/src/live.ts": LIVE_SOURCE,
      "tests/client/outside.test.ts": LIVE_SOURCE,
    });
    expect(tokens(runGate(scratch))).toContain("config[1].ignores[0]");
  });

  test("accepts that local ignore once a member exists inside its parent scope", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: config('{ files: ["packages/client/src/**/*.ts"], ignores: ["**/*.test.ts"] }'),
      "packages/client/src/live.ts": LIVE_SOURCE,
      "packages/client/src/live.test.ts": LIVE_SOURCE,
    });
    expect(runGate(scratch).findings).toEqual([]);
  });

  test("refuses malformed executable config", ({ scratch }) => {
    plantRepo(scratch, { [CONFIG_REL]: "export default [{ files: [ ;;; (((( }];\n" });
    expect(messages(runGate(scratch))).toContain("could not be evaluated");
  });

  test("the real config has only the five ratified zero populations", ({ repoRoot }) => {
    const run = runGate(repoRoot);
    expect(run.findings).toEqual([]);
    expect(run.declarations[0]).toMatchObject({ unit: "ESLint selector", admitted: 5, admittedRatified: 5 });
    expect(run.declarations[0]?.candidates).toBeGreaterThan(90);
  }, 20_000);

  test("the sandbox allowance cannot survive removal of its native ignore selector", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: config('{ files: ["packages/ui/src/live.ts"] }').replace(', ".stryker-tmp/**"', ""),
      "packages/ui/src/live.ts": LIVE_SOURCE,
    });
    const result = runGate(scratch);
    expect(tokens(result)).toContain("config[0].ignores[4]");
    expect(messages(result)).toContain("no longer names the same zero-member selector");
  });

  test("the cache allowance cannot survive removal of its native ignore selector", ({ scratch }) => {
    plantRepo(scratch, {
      [CONFIG_REL]: config('{ files: ["packages/ui/src/live.ts"] }').replace(', ".cache/**"', ""),
      "packages/ui/src/live.ts": LIVE_SOURCE,
    });
    const result = runGate(scratch);
    expect(tokens(result)).toContain("config[0].ignores[5]");
    expect(messages(result)).toContain("no longer names the same zero-member selector");
  });
});
