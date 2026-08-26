import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "../support/tool-fixtures.ts";

const NODEJS_VERSION = "26.7.0-1nodesource1";
const NODEJS_AMD64_SHA256 = "3aeac1e8aa4b4dcd3aefec4425e6f683101b24ca349bfe2b491be41e10d0c721";
const NODEJS_ARM64_SHA256 = "1e62878536fc75982dd20b9d7d8760d4a6a7e72fbdc0461bffb22efcffad4a66";
const VLLM_VERSION = "0.22.1";
const SIBLING_IMAGE_PATTERN = /image: vllm\/vllm-openai:v([^@\s]+)@sha256:([a-f0-9]{64})/u;
const dockerVariable = (name: string): string => `\${${name}}`;

test("the GPU image consumes verified exact NodeSource and vLLM identities", ({ repoRoot }) => {
  const dockerfile = readFileSync(join(repoRoot, "Dockerfile"), "utf8");
  const compose = readFileSync(join(repoRoot, "docker-compose.yaml"), "utf8");

  expect(dockerfile).toContain(`ARG NODEJS_VERSION=${NODEJS_VERSION}`);
  expect(dockerfile).toContain(`ARG NODEJS_AMD64_SHA256=${NODEJS_AMD64_SHA256}`);
  expect(dockerfile).toContain(`ARG NODEJS_ARM64_SHA256=${NODEJS_ARM64_SHA256}`);
  expect(dockerfile).toContain(`nodejs_${dockerVariable("NODEJS_VERSION")}_${dockerVariable("arch")}.deb`);
  expect(dockerfile).toContain(`amd64) nodejs_sha256="${dockerVariable("NODEJS_AMD64_SHA256")}"`);
  expect(dockerfile).toContain(`arm64) nodejs_sha256="${dockerVariable("NODEJS_ARM64_SHA256")}"`);
  expect(dockerfile).toContain("sha256sum --check --strict");
  expect(dockerfile).not.toContain("setup_26.x");

  expect(dockerfile).toContain(`ARG VLLM_VERSION=${VLLM_VERSION}`);
  expect(dockerfile).toContain(`"vllm==${dockerVariable("VLLM_VERSION")}"`);
  expect(dockerfile).toContain(`echo "vllm==${dockerVariable("VLLM_VERSION")} @ cu130"`);
  expect(dockerfile).not.toContain("vllm>=0.22,<0.23");

  const siblingImage = compose.match(SIBLING_IMAGE_PATTERN);
  expect(siblingImage?.[1]).toBe(VLLM_VERSION);
  expect(siblingImage?.[2]).toHaveLength(64);
});

test("the sandbox launcher defaults to confirmations and visibly marks unsafe bypass", async ({ fakeBin, repoRoot, scratch }) => {
  const callsPath = join(scratch, "npx-calls");
  await fakeBin(
    "npx",
    `#!/usr/bin/env bash
printf '%s\\n' '--- call ---' >> '${callsPath}'
printf '<%s>\\n' "$@" >> '${callsPath}'
`,
  );

  const run = (...args: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync("bash", [join(repoRoot, "scripts/dev/sandbox.sh"), "--here", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });

  const safe = run();
  expect(safe.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("<claude --permission-mode default; exec zsh -l>");
  expect(readFileSync(callsPath, "utf8")).not.toContain("--dangerously-skip-permissions");

  const unsafe = run("--unsafe-bypass-permissions");
  expect(unsafe.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("claude --dangerously-skip-permissions");
  expect(unsafe.stderr).toContain("UNSAFE: Claude permission confirmations are disabled");

  const shell = run("--shell");
  expect(shell.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("<exec zsh -l>");
});

test("the sandbox launcher rejects raw dangerous-skip flags on both sides of --", async ({ fakeBin, repoRoot, scratch }) => {
  const callsPath = join(scratch, "npx-calls");
  await fakeBin(
    "npx",
    `#!/usr/bin/env bash
printf '%s\\n' '--- call ---' >> '${callsPath}'
printf '<%s>\\n' "$@" >> '${callsPath}'
`,
  );

  const run = (...args: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync("bash", [join(repoRoot, "scripts/dev/sandbox.sh"), "--here", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  const results = [run("--dangerously-skip-permissions"), run("--", "--dangerously-skip-permissions")];

  for (const result of results) {
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Use --unsafe-bypass-permissions");
  }
  expect(() => readFileSync(callsPath, "utf8")).toThrow();
});

test("the sandbox launcher rejects every supported raw bypass alias and equals form", async ({ fakeBin, repoRoot, scratch }) => {
  const callsPath = join(scratch, "npx-calls");
  await fakeBin(
    "npx",
    `#!/usr/bin/env bash
printf '%s\\n' '--- call ---' >> '${callsPath}'
printf '<%s>\\n' "$@" >> '${callsPath}'
`,
  );

  const run = (...args: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync("bash", [join(repoRoot, "scripts/dev/sandbox.sh"), "--here", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  const cases = [
    ["--permission-mode", "bypassPermissions"],
    ["--permission-mode=bypassPermissions"],
    ["--dangerously-skip-permissions=true"],
    ["--allow-dangerously-skip-permissions"],
    ["--", "--permission-mode", "bypassPermissions"],
    ["--", "--permission-mode=bypassPermissions"],
  ] as const;
  const results = cases.map((args) => run(...args));

  for (const result of results) {
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Use --unsafe-bypass-permissions");
  }
  expect(() => readFileSync(callsPath, "utf8")).toThrow();
});

test("the committed devcontainer does not persist a permission bypass", ({ repoRoot }) => {
  const config = readFileSync(join(repoRoot, ".devcontainer/devcontainer.json"), "utf8");
  const readme = readFileSync(join(repoRoot, ".devcontainer/README.md"), "utf8");
  const projectSettings = JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8")) as {
    permissions?: { defaultMode?: string };
  };

  expect(config).not.toContain("allowDangerouslySkipPermissions");
  expect(config).not.toContain("bypassPermissions");
  expect(config).not.toContain("defaultMode:'bypassPermissions'");
  expect(projectSettings.permissions?.defaultMode).toBe("default");
  expect(readme).toContain("pnpm sandbox --unsafe-bypass-permissions");
  expect(readme).not.toContain("permissive mode`) safely");
});
