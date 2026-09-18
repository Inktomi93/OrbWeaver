import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "../support/tool-fixtures.ts";

// ── the container surface's load-bearing shape (docker/README.md is the prose; these are the pins) ────
//
// The 2026-09-18 owner ruling retired the GPU all-in-one image + the vLLM sibling profile: ONE image, ONE
// compose service, engines are the deployer's own. What these pins hold is the part a careless edit would
// silently invert — the default port binding (loopback), the login-mode default (a credentialed mode, since
// single-user cannot work through a bridge-published port), and the `*_FILE` shim's allowlist line staying
// the ONE line the agent-sdk firewall test parses.

function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("the Dockerfile is a single app-only target: no corepack, no GPU stage, pnpm pinned from packageManager", ({ repoRoot }) => {
  const dockerfile = read(repoRoot, "Dockerfile");
  // node 26 ships without corepack — the line that broke the first real build (2026-09-18).
  expect(dockerfile).not.toMatch(/^RUN .*corepack/mu);
  expect(dockerfile).toContain("require('./package.json').packageManager");
  expect(dockerfile).not.toMatch(/nvidia\/cuda|runtime-gpu|gpu-base|vllm==|vllm\/vllm-openai/iu);
  // exactly one final target, named `runtime`, and compose builds that name
  expect(dockerfile.match(/^FROM .* AS runtime$/gmu)).toHaveLength(1);
  expect(read(repoRoot, "docker-compose.yaml")).toContain("target: runtime");
  // the runtime file set has ONE home and the Dockerfile delegates to it
  expect(dockerfile).toContain("docker/assemble-runtime.sh");
});

test("compose publishes on loopback by default, ships a credentialed login mode, and keeps secrets out of the tracked env file", ({ repoRoot }) => {
  const compose = read(repoRoot, "docker-compose.yaml");
  const env = read(repoRoot, "docker/orbweaver.env");
  // ONE service; loopback unless the deployer interpolates ORB_BIND; never a bare "8788:8788"
  expect(compose.match(/^ {2}[a-z][\w-]*:$/gmu)).toEqual(["  orbweaver:"]);
  expect(compose).toContain('"${ORB_BIND:-127.0.0.1}:${ORB_PORT:-8788}:8788"');
  expect(compose).not.toMatch(/^\s*- "8788:8788"/mu);
  // the tracked defaults: a credentialed mode (single-user 401s through a bridge port) + deny
  expect(env).toMatch(/^AUTH_MODE=local$/mu);
  expect(env).toMatch(/^AUTH_FALLBACK=deny$/mu);
  expect(env).toMatch(/^CREDENTIALS_KEY_AUTO=true$/mu);
  // no secret VALUE is assigned in the tracked file (commented examples are fine)
  for (const key of ["SESSION_SECRET", "LOCAL_INITIAL_PASSWORD", "OIDC_CLIENT_SECRET", "OPENROUTER_API_KEY", "CREDENTIALS_KEY", "DEBUG_TOKEN"]) {
    expect(env, `${key} must not be assigned in the tracked env file`).not.toMatch(new RegExp(`^${key}=`, "mu"));
  }
  // the deployer's file is read after the defaults and is gitignored
  expect(compose).toContain("./docker/orbweaver.local.env");
  expect(read(repoRoot, ".gitignore")).toMatch(/^docker\/orbweaver\.local\.env$/mu);
});

test("the entrypoint keeps its single *_FILE allowlist line (the agent-sdk firewall test parses it) and fills the two zero-config values", ({ repoRoot }) => {
  const shim = read(repoRoot, "docker/entrypoint.sh");
  expect(shim.match(/^for name in [^;]+; do$/gmu)).toHaveLength(1);
  // single-user's only credential is the owner fallback; the schema refuses the deny pairing
  expect(shim).toContain("export AUTH_FALLBACK=owner");
  // local mode: generated + kept, under the data volume, never printed on later boots
  expect(shim).toContain("keep_generated session_secret");
  expect(shim).toContain("keep_generated initial_password");
});

test("every compose shape resolves (base + the four overlays)", ({ repoRoot, scratch, skip }) => {
  const probe = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    // A LOUD skip, never a silent pass: without compose on the host these shapes were not validated here.
    skip("docker compose is not available on this host — the compose shapes were not validated here");
  }
  // The secrets overlay interpolates ORB_SECRETS_DIR and refuses a missing file, so the probe points it at a
  // scratch dir of empty files through compose's own --env-file (interpolation input, never the container env).
  const secretsDir = join(scratch, "secrets");
  mkdirSync(secretsDir, { recursive: true });
  for (const f of ["session_secret", "local_initial_password", "oidc_client_secret", "credentials_key", "openrouter_api_key"]) {
    writeFileSync(join(secretsDir, f), "");
  }
  const interpolation = join(scratch, "compose.env");
  writeFileSync(interpolation, `ORB_SECRETS_DIR=${secretsDir}\n`);
  const run = (...files: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync("docker", ["compose", "--env-file", interpolation, ...files.flatMap((f) => ["-f", f]), "config", "--quiet"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  for (const files of [
    ["docker-compose.yaml"],
    ["docker-compose.yaml", "docker/compose.host-network.yaml"],
    ["docker-compose.yaml", "docker/compose.single-user.yaml"],
    ["docker-compose.yaml", "docker/compose.secrets.yaml"],
    ["docker-compose.yaml", "docker/compose.dev.yaml"],
  ]) {
    const result = run(...files);
    expect(result.status, `${files.join(" + ")}: ${result.stderr}`).toBe(0);
  }
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
