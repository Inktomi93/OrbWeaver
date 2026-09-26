#!/usr/bin/env node
// `pnpm deps:update`: move every catalog entry to its latest mature version, except TypeScript and the patched
// packages. It resolves with a stricter age than the workspace enforces, so a release wave whose packages pin
// each other exactly never leaves a parent resolved while its minutes-younger child still fails the install gate.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process, { env } from "node:process";
import { pnpmInvocation } from "@orb/tooling/_shared/platform";
import { parse } from "yaml";

const WORKSPACE_FILE = "pnpm-workspace.yaml";
// Longer than any one release wave, so a child published a few minutes after its parent is mature too.
const RESOLVE_MARGIN_MINUTES = 60;
const TYPESCRIPT = "typescript";
const PLAYWRIGHT_PAIR = ["@playwright/test", "@playwright/experimental-ct-react"] as const;

interface Workspace {
  readonly minimumReleaseAge: number;
  readonly catalog: Readonly<Record<string, string>>;
  readonly patchedDependencies?: Readonly<Record<string, string>>;
}

function readWorkspace(): Workspace {
  return parse(readFileSync(WORKSPACE_FILE, "utf8")) as Workspace;
}

/** `@scope/name@1.2.3` → `@scope/name`: the version starts at the last `@` that is not the scope's. */
function packageName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

/** Compares two `^x.y.z` or `x.y.z` specs by their version numbers. */
function compareVersions(a: string, b: string): number {
  const parts = (spec: string): number[] => spec.replace(/^\D*/u, "").split(".").map(Number);
  const [left, right] = [parts(a), parts(b)];
  const index = left.findIndex((part, i) => part !== right[i]);
  return index === -1 ? 0 : (left[index] ?? 0) - (right[index] ?? 0);
}

const workspace = readWorkspace();
// A patch is keyed to one exact version, so bumping a patched package would silently drop its patch.
const patched = Object.keys(workspace.patchedDependencies ?? {}).map(packageName);
// TypeScript also rides aliases (`ts7: npm:typescript@7.0.2`); those move with the TypeScript migration.
const typescriptAliases = Object.entries(workspace.catalog)
  .filter(([, spec]) => spec.startsWith(`npm:${TYPESCRIPT}@`))
  .map(([name]) => name);
const held = [TYPESCRIPT, ...typescriptAliases, ...patched];

const resolveAge = String(workspace.minimumReleaseAge + RESOLVE_MARGIN_MINUTES);
console.log(`holding: ${held.join(", ")}`);
console.log(`resolving only versions at least ${resolveAge} minutes old (the install gate is ${workspace.minimumReleaseAge})`);

/** The operator's own pnpm with `args`, however it was installed; exits when no pnpm can be named. */
function pnpmCommand(args: readonly string[]): { readonly command: string; readonly args: readonly string[] } {
  const pnpm = pnpmInvocation({ ambient: env, platform: process.platform, nodePath: process.execPath, args });
  if (pnpm.kind === "refused") {
    console.error(`${pnpm.reason} (pnpm deps:update)`);
    process.exit(1);
  }
  return pnpm;
}

const update = pnpmCommand(["update", "--recursive", "--latest", ...held.map((name) => `!${name}`)]);
// The environment variable: in a pnpm 12 probe it moved the cutoff, while neither `--config.minimumReleaseAge`
// nor `--minimum-release-age` resolved the same versions.
const result = spawnSync(update.command, [...update.args], { stdio: "inherit", env: { ...env, PNPM_CONFIG_MINIMUM_RELEASE_AGE: resolveAge } });
if (result.error !== undefined) {
  console.error(`failed to start pnpm: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// The component-testing package trails `@playwright/test`, and the two must stay on one version: both take
// the lower of the two, then one more install applies it.
const catalog = readWorkspace().catalog;
const testSpec = catalog[PLAYWRIGHT_PAIR[0]] ?? "";
const componentSpec = catalog[PLAYWRIGHT_PAIR[1]] ?? "";
if (testSpec !== componentSpec) {
  const lower = compareVersions(testSpec, componentSpec) <= 0 ? testSpec : componentSpec;
  let text = readFileSync(WORKSPACE_FILE, "utf8");
  for (const name of PLAYWRIGHT_PAIR) {
    text = text.replace(new RegExp(`^(  "${name}": ).*$`, "mu"), `$1${lower}`);
  }
  writeFileSync(WORKSPACE_FILE, text);
  console.log(`aligned ${PLAYWRIGHT_PAIR.join(" and ")} on ${lower}`);
  const install = pnpmCommand(["install"]);
  const installed = spawnSync(install.command, [...install.args], { stdio: "inherit" });
  process.exit(installed.status ?? 1);
}
