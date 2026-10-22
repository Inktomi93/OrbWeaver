// Native collection is independent of the shared stack-boot/seed selector; no stack starts under --list.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { pageArray, pageObject, pageString } from "@orb/tooling/floor/browser/page-validate";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { selectedModeProjects } from "./modes.ts";

const SELECTORS = [
  ["--project", "single-user", "local"],
  ["--project=single-user", "--project", "local", "forward-header"],
  ["--project=single-user", "local"],
  ["--project", "SINGLE-*", "LOCAL", "--project=forward-*"],
  ["--", "--project", "local"],
] as const;
// Keep a real spec for each auth mode so an empty filtered project is not mistaken for an unselected one.
const SPEC_FILTERS = ["auth-smoke.local.spec.ts", "smoke.spec.ts", "auth-smoke.forward.spec.ts", "oidc-pending-join.oidc.spec.ts"];
const COLLECTION_ARGS = [...SPEC_FILTERS, "--list", "--reporter=json"];
// Linked .bin launchers can load another runner copy than the sandbox specs register against.
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve("@playwright/test/cli");
const CONFIG_PROBE = `
import config from "./playwright.config.ts";
console.log(JSON.stringify(config.webServer.map(server => server.env.AUTH_MODE)));
`;

function collect(selector: readonly string[], configFile = "playwright.config.ts"): ReturnType<typeof runNicedSync> {
  return runNicedSync(process.execPath, [PLAYWRIGHT_CLI, "test", "-c", configFile, ...COLLECTION_ARGS, ...selector]);
}

test("the corpus matrix forwards one selected phone cell without accumulating default projects", { tags: ["slow"] }, () => {
  const project = `corpus-phone-${THEME_CHAT_STYLES[0]}`;
  const result = runNicedSync("pnpm", ["--config.verify-deps-before-run=false", "e2e:corpus:matrix", "--list", `--project=${project}`]);
  const transcript = result.stdout + result.stderr;
  expect(result.status, transcript).toBe(0);
  expect(transcript.match(/^Corpus matrix cell: .+$/gmu)).toEqual([`Corpus matrix cell: ${project}`]);
  expect(transcript).toContain(`[${project}]`);
  expect(transcript).toContain("first send streams incrementally, second send works, and exact canon survives reload");
  expect(transcript).toContain("Backup exports a real library and imports the downloaded bundle");
  expect(transcript).toContain("Corpus matrix: 1 of 1 cells completed; failures=[]; missing=[]");
  expect(transcript).not.toContain("[corpus-desktop-");
  expect(transcript).not.toContain("[corpus-local-");
});

test("the corpus matrix composes its selected cell before a native terminator and file filter", { tags: ["slow"] }, () => {
  const project = `corpus-phone-${THEME_CHAT_STYLES[0]}`;
  const result = runNicedSync("pnpm", [
    "--config.verify-deps-before-run=false",
    "e2e:corpus:matrix",
    `--project=${project}`,
    "--list",
    "tests/e2e/smoke.spec.ts",
    "--",
  ]);
  const transcript = result.stdout + result.stderr;
  expect(result.status, transcript).toBe(0);
  const collected = transcript.split("\n").filter((line) => /^\s+\[corpus-/u.test(line));
  expect(collected.length).toBeGreaterThan(0);
  for (const line of collected) {
    expect(line).toContain(`[${project}] › smoke.spec.ts:`);
  }
  expect(transcript).toContain("tests in 1 file");
  expect(transcript).not.toContain("Backup exports a real library");
  expect(transcript).not.toContain("second send works");
  expect(transcript).toContain("Corpus matrix: 1 of 1 cells completed; failures=[]; missing=[]");
});

// The JSON reporter's stdout is an external observation, so the walk reads only the fields selection needs.
function arrayField(value: unknown, key: string): readonly unknown[] {
  const field = isPlainObject(value) ? value[key] : undefined;
  return Array.isArray(field) ? field : [];
}

function projectName(entry: unknown): string {
  return pageString(pageObject(entry, "collected test")["projectName"], "collected test projectName");
}

function collectedProjects(suites: readonly unknown[]): string[] {
  return suites.flatMap((suite) => [
    ...arrayField(suite, "specs").flatMap((spec) => arrayField(spec, "tests").map(projectName)),
    ...collectedProjects(arrayField(suite, "suites")),
  ]);
}

test("native repeated, variadic, equals and wildcard project selection agrees with boot configuration and the shared seed selector", { tags: ["slow"] }, () => {
  for (const selector of SELECTORS) {
    const argv = [...COLLECTION_ARGS, ...selector];
    const collection = collect(selector);
    expect(collection.status, collection.stdout + collection.stderr).toBe(0);
    const report: unknown = JSON.parse(collection.stdout);
    expect(report).toHaveProperty("errors", []);
    const native = [...new Set(collectedProjects(arrayField(report, "suites")))].sort();
    expect(native.length).toBeGreaterThan(0);
    const sharedSelection = selectedModeProjects(argv)
      .map((mode) => mode.name)
      .sort();
    const bootConfiguration: unknown = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", CONFIG_PROBE, "--", ...argv], { encoding: "utf8" }),
    );
    const bootModes = pageArray(bootConfiguration, "configuration probe auth modes").map((mode) => pageString(mode, "configuration probe auth mode"));
    expect(sharedSelection, JSON.stringify(selector)).toEqual(native);
    expect([...bootModes].sort(), JSON.stringify(selector)).toEqual(native);
  }
});

test("native collection rejects an unmatched project instead of falling back to other auth modes", () => {
  const selector = ["--project=unconfigured-auth-project"];
  const argv = [...COLLECTION_ARGS, ...selector];
  const collection = collect(selector);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stdout + collection.stderr).toContain('Project(s) "unconfigured-auth-project" not found');
  expect(selectedModeProjects(argv)).toEqual([]);
});

test("native collection rejects a missing project value instead of treating it as default selection", () => {
  const argv = [...COLLECTION_ARGS, "--project"];
  const collection = collect(["--project"]);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stderr).toContain("argument missing");
  expect(collection.stderr).toContain("--project");
  expect(selectedModeProjects(argv)).toEqual([]);
});

test("native collection refuses a missing explicit configuration instead of silently loading the default", () => {
  const configFile = join(import.meta.dirname, "missing-project-selection.config.ts");
  const collection = collect([], configFile);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stderr).toContain(`${configFile} does not exist`);
});

for (const missing of [false, true]) {
  test(`the public corpus smoke runner ${missing ? "propagates empty selection" : "selects the committed case"} and joins clone cleanup`, {
    tags: ["slow"],
  }, () => {
    const result = runNicedSync(
      "pnpm",
      ["--config.verify-deps-before-run=false", "e2e:corpus", "--list", ...(missing ? ["absent-corpus-selection.spec.ts"] : [])],
      {
        env: inheritedProcessEnv({
          ["E2E_CORPUS_FIXTURE"]: undefined,
          ["CORPUS_PUBLICATION_FIXTURE"]: undefined,
          ["CT_CORPUS_FIXTURE"]: undefined,
          ["E2E_ALLOW_DEV_TARGET"]: "0",
          ["E2E_LIVE"]: "0",
        }),
      },
    );
    const transcript = result.stdout + result.stderr;
    const clone = /^Corpus E2E clone: (.+)$/mu.exec(result.stdout)?.[1];
    expect(clone, transcript).toBeDefined();
    if (clone === undefined) {
      throw new Error("The corpus runner did not identify its owned clone");
    }
    expect(existsSync(clone)).toBe(false);
    expect(existsSync(dirname(clone))).toBe(false);
    expect(result.status, transcript).toBe(missing ? 1 : 0);
    const fragments = missing
      ? ["No tests found"]
      : [
          "the selected corpus clone serves the captured room identity, content and visible title",
          `Total: ${String(THEME_CHAT_STYLES.length * 2)} tests in 1 file`,
          ...THEME_CHAT_STYLES.flatMap((style) => [`[corpus-desktop-${style}]`, `[corpus-phone-${style}]`]),
        ];
    for (const fragment of fragments) {
      expect(transcript).toContain(fragment);
    }
  });
}
