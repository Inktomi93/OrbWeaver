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

// The sandbox is PERMISSIVE by owner ruling (2026-09-01, reverting a024cbe65 / 8b77f8ad9): the container +
// firewall are the boundary, and the point of the dev container is to run without prompts. These pins keep
// the bypass CONTAINER-ONLY — the launcher and the devcontainer's own config carry it; the committed project
// settings carry no mode at all, because a project-level pin overrides the owner's user-level `auto` in
// every host session (that pin was the whole pain of a024cbe65).
test("the sandbox launcher starts Claude permissive and passes extra args through", async ({ fakeBin, repoRoot, scratch }) => {
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

  const bare = run();
  expect(bare.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("<claude --dangerously-skip-permissions; exec zsh -l>");

  const passthrough = run("--", "--resume");
  expect(passthrough.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("<claude --dangerously-skip-permissions --resume; exec zsh -l>");

  const shell = run("--shell");
  expect(shell.status).toBe(0);
  expect(readFileSync(callsPath, "utf8")).toContain("<exec zsh -l>");
});

test("the devcontainer persists bypass in the container only, never in project settings", ({ repoRoot }) => {
  const config = readFileSync(join(repoRoot, ".devcontainer/devcontainer.json"), "utf8");
  const readme = readFileSync(join(repoRoot, ".devcontainer/README.md"), "utf8");
  const projectSettings = JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8")) as {
    permissions?: { defaultMode?: string };
  };

  // the extension inside the container boots permissive…
  expect(config).toContain('"claudeCode.allowDangerouslySkipPermissions": true');
  expect(config).toContain('"claudeCode.initialPermissionMode": "bypassPermissions"');
  // …and so does a bare `claude` in its terminal: the container's OWN settings volume is seeded.
  expect(config).toContain("defaultMode:'bypassPermissions'");
  expect(config).toContain("skipDangerousModePermissionPrompt=true");
  // the host is untouched: no mode pinned in the committed project file
  expect(projectSettings.permissions?.defaultMode).toBeUndefined();
  expect(readme).toContain("claude --dangerously-skip-permissions");
  expect(readme).not.toContain("--unsafe-bypass-permissions");
});
