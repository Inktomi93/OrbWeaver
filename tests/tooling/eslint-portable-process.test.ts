import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const RULE = "no-restricted-syntax";
const COMMANDS = ["rm", "cp", "mkdir", "kill"] as const;

test.for(["tooling/src/dev/ops/probe.ts", "tooling/src/snap/ops/probe.tsx", "scripts/probe.ts"])(
  "portable tooling refuses literal shell filesystem work and shell command text at %s",
  { timeout: 120_000 },
  async (path, { repoRoot }) => {
    const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
    const linter = new Linter();
    const filename = join(repoRoot, path);
    const config = await eslint.calculateConfigForFile(filename);
    const native = {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    };
    for (const call of ["spawn", "spawnSync", "execFileSync", "runNicedSync", "spawnNiced", "spawnFullPriorityChild", "child.spawn", 'child["spawn"]']) {
      for (const command of COMMANDS) {
        const source = `\n${call}(${JSON.stringify(command)}, ["target"]);`;
        const found = linter.verify(source, native, { filename });
        expect(
          found.map(({ ruleId }) => ruleId),
          source,
        ).toEqual([RULE]);
        expect(found[0], source).toMatchObject({ line: 2, column: 1, severity: 2 });
        expect(found[0]?.message, source).toContain(command === "kill" ? "killPidGroup" : "node:fs");
      }
      for (const source of [
        `${call}("node", [], { shell: true });`,
        `${call}("node", [], { ["shell"]: true });`,
        `${call}("node", [], { shell: "/bin/bash" });`,
        `${call}("bash", ["-c", "echo ready"]);`,
        `${call}("sh", ["-ec", "echo ready"]);`,
      ]) {
        const found = linter.verify(source, native, { filename });
        expect(
          found.map(({ ruleId }) => ruleId),
          source,
        ).toEqual([RULE]);
        expect(found[0]?.message, source).toContain("argv");
      }
    }
    for (const source of [
      'rm("target", { recursive: true }); cp("source", "target"); mkdir("target");',
      'spawn("node", ["entry.ts"], { shell: false });',
      'runNicedSync("git", ["rm", "file"]);',
      'runNicedSync("bash", ["scripts/github-sync.sh"]);',
      'spawn("bash", ["scripts/task.sh", "-c", "config.json"]);',
      'spawn("bash", ["--", "scripts/task.sh", "-c", "config.json"]);',
      "const response = { shell: true };",
      'const url = new URL("https://example.com/tmp/file");',
      'const archiveMember = "folder/file"; const gitPath = "packages/kit/src/index.ts";',
    ]) {
      expect(linter.verify(source, native, { filename }), source).toEqual([]);
    }
  },
);

test("the platform and subprocess adapters retain their native shell capability", { timeout: 120_000 }, async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const linter = new Linter();
  for (const path of ["tooling/src/floor/host/platform.ts", "tooling/src/floor/host/platform-probes.ts", "tooling/src/floor/process/proc.ts"]) {
    const filename = join(repoRoot, path);
    const config = await eslint.calculateConfigForFile(filename);
    const native = {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    };
    expect(linter.verify('spawn("sh", ["-c", command], { shell: true });', native, { filename }), path).toEqual([]);
  }
});
