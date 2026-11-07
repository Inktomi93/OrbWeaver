// A private value an operator hands snap still does its job in the page and reaches no file snap writes: run indexes,
// session rows and logs, failure traces and exported evidence, each read byte by byte through the real cli.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pid } from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { DEDICATED_BOX_ENV } from "@orb/tooling/floor/host/concurrency-profile";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/floor/host/host-slots";
import { unzipSync, zipSync } from "fflate";
import { vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(180_000, 4);
const CLI_BUDGET_MS = scaledBudget(90_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const PLANTS = {
  fill: "plant-fill-5e1c9",
  later: "plant-later-call-77ad",
  token: "plant-debug-token-a3f0",
  storage: "plant-storage-value-c41b",
  refused: "plant-refused-echo-90de",
} as const;
const FILL_ENV = "L4_PRIVATE_FILL";
const SESSION_HOME_KEY = "ORB_SNAP_SESSION_HOME";
const FIXTURE_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head>' +
  '<body><main id="m"><label>Field<input id="field" type="text"></label></main>' +
  "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>";
const READ_FIELD_LENGTH = 'document.querySelector("#field").value.length';
const EVAL_RE = /EVAL\[0\][^\n]*\n(\d+)/u;

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((entry) => join(root, entry))
    .filter((path) => statSync(path).isFile());
}

/** Every file under `roots` that holds a plant, a zip read entry by entry. Names the file and the plant, never its bytes. */
function disclosures(roots: readonly string[]): readonly string[] {
  const found: string[] = [];
  const judge = (label: string, bytes: Uint8Array): void => {
    const text = Buffer.from(bytes).toString("latin1");
    for (const [name, plant] of Object.entries(PLANTS)) {
      if (text.includes(plant)) {
        found.push(`${label} holds ${name}`);
      }
    }
  };
  for (const path of roots.flatMap(filesUnder)) {
    const bytes = readFileSync(path);
    judge(path, bytes);
    if (path.endsWith(".zip")) {
      for (const [entry, content] of Object.entries(unzipSync(bytes))) {
        judge(`${path}!${entry}`, content);
      }
    }
  }
  return found;
}

function slotOf(stdout: string): string {
  const index = /\bindex=(?<path>\/\S+)\/run\.json\b/u.exec(stdout)?.groups?.["path"];
  if (index === undefined) {
    throw new Error(`the run printed no index:\n${stdout}`);
  }
  return index;
}

/** The decoded action log of the one trace a red run kept. */
function keptTrace(slot: string): string {
  const [zip, ...others] = filesUnder(slot).filter((path) => path.endsWith(".zip"));
  if (zip === undefined || others.length > 0) {
    throw new Error(`a red run must keep exactly one trace under ${slot}`);
  }
  const entry = unzipSync(readFileSync(zip))["trace.trace"];
  if (entry === undefined) {
    throw new Error("the kept trace has no action log");
  }
  return Buffer.from(entry).toString("utf8");
}

test("the scan finds a plant in a plain file and inside a zip entry", ({ scratch }) => {
  const root = join(scratch, "scan-control");
  mkdirSync(root);
  writeFileSync(join(root, "plain.txt"), `before ${PLANTS.fill} after`);
  writeFileSync(join(root, "archive.zip"), zipSync({ "inner.json": Buffer.from(PLANTS.token) }));
  writeFileSync(join(root, "clean.txt"), "nothing here");
  expect(disclosures([root]).map((line) => line.replace(root, ""))).toEqual(["/archive.zip!inner.json holds token", "/plain.txt holds fill"]);
});

test("a red one-shot run types its value and seeds its token, and no file it keeps holds either", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli(
    "snap",
    [
      "--file",
      fixture,
      "--fill",
      `#field=${PLANTS.fill}`,
      "--debug-token",
      PLANTS.token,
      "--local-storage",
      `orb:plant=${PLANTS.storage}`,
      "--eval",
      READ_FIELD_LENGTH,
      "--expect-text",
      "#m=a string the page never shows",
      "--no-shot",
    ],
    { timeoutMs: CLI_BUDGET_MS },
  );
  expect(EVAL_RE.exec(run.stdout)?.[1]).toBe(String(PLANTS.fill.length));
  expect(run.code).not.toBe(0);
  const slot = slotOf(run.stdout);
  expect(disclosures([slot])).toEqual([]);
  expect(run.stdout).not.toContain(PLANTS.fill);
  expect(run.stdout).not.toContain(PLANTS.token);

  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as { readonly process: { readonly argv: readonly string[] } };
  expect(index.process.argv).toEqual(
    expect.arrayContaining(["--fill", "#field=<private>", "--debug-token", "<private>", "--local-storage", "orb:plant=<private>"]),
  );
  const trace = keptTrace(slot);
  expect(
    trace
      .split("\n")
      .filter((line) => line !== "")
      .every((line) => typeof JSON.parse(line) === "object"),
  ).toBe(true);
  expect(trace).toContain("<private>");
});

test("a fill that cannot find its field names the selector, and its failure text carries no value", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli("snap", ["--file", fixture, "--fill", `#absent=${PLANTS.fill}`, "--no-shot"], { timeoutMs: CLI_BUDGET_MS });
  expect(run.code).not.toBe(0);
  expect(run.stdout).toContain("#absent");
  expect(run.stdout).not.toContain(PLANTS.fill);
  expect(disclosures([slotOf(run.stdout)])).toEqual([]);
});

test("a measured fill labels its step by selector, so perf evidence holds no value", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli("snap", ["--file", fixture, "--fill", `#field=${PLANTS.fill}`, "--perf", "--no-shot"], { timeoutMs: CLI_BUDGET_MS });
  const slot = slotOf(run.stdout);
  const perf = filesUnder(slot).filter((path) => readFileSync(path, "latin1").includes("fill #field"));
  expect(perf.length).toBeGreaterThan(0);
  expect(disclosures([slot])).toEqual([]);
});

test("a value read from the environment reaches the field and no argument or file", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const run = await runCli(
    "snap",
    ["--file", fixture, "--fill-env", `#field=${FILL_ENV}`, "--eval", READ_FIELD_LENGTH, "--expect-text", "#m=a string the page never shows", "--no-shot"],
    { timeoutMs: CLI_BUDGET_MS, env: { [FILL_ENV]: PLANTS.fill } },
  );
  expect(EVAL_RE.exec(run.stdout)?.[1]).toBe(String(PLANTS.fill.length));
  const slot = slotOf(run.stdout);
  expect(disclosures([slot])).toEqual([]);
  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as { readonly process: { readonly argv: readonly string[] } };
  expect(index.process.argv).toEqual(expect.arrayContaining(["--fill-env", `#field=${FILL_ENV}`]));
  expect(keptTrace(slot)).toContain("<private>");

  const unset = await runCli("snap", ["--file", fixture, "--fill-env", "#field=L4_UNSET_VARIABLE"], { timeoutMs: CLI_BUDGET_MS });
  expect(unset.code).not.toBe(0);
  expect(unset.stdout).toContain("--fill-env names L4_UNSET_VARIABLE");
});

test("a session keeps boot and call values out of its row, log, slots and export", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "fixture.html");
  writeFileSync(fixture, FIXTURE_HTML);
  const home = join(scratch, "registry");
  mkdirSync(home);
  const env = { [SESSION_HOME_KEY]: home, [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots"), [DEDICATED_BOX_ENV]: "0" };
  const snap = (args: readonly string[]): ReturnType<typeof runCli> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const name = `typed-secret-${pid}`;
  const row = (): { readonly slotDir: string; readonly lastOp: string; readonly bootArgv: readonly string[] } =>
    JSON.parse(readFileSync(join(home, `${name}.json`), "utf8")) as { readonly slotDir: string; readonly lastOp: string; readonly bootArgv: readonly string[] };
  try {
    const boot = await snap(["--session", name, "--file", fixture, "--debug-token", PLANTS.token, "--fill", `#field=${PLANTS.fill}`, "--no-shot"]);
    expect(boot.code).toBe(0);
    expect(row().bootArgv).toEqual(expect.arrayContaining(["--debug-token", "<private>", "--fill", "#field=<private>"]));
    const call = await snap(["--session", name, "--fill", `#field=${PLANTS.later}`, "--eval", READ_FIELD_LENGTH, "--no-shot"]);
    expect(EVAL_RE.exec(call.stdout)?.[1]).toBe(String(PLANTS.later.length));
    expect(row().lastOp).toContain("--fill #field=<private>");
    const refused = await snap(["--session", name, "--fill", PLANTS.refused, "--no-shot"]);
    expect(refused.stdout).toContain("--fill expects sel=value");
    expect(refused.stdout).not.toContain(PLANTS.refused);
    const exported = join(scratch, "exported");
    await snap(["--session-export", name, "--out", exported]);
    expect(filesUnder(exported).some((path) => path.endsWith(".zip"))).toBe(true);
    expect(existsSync(join(home, `${name}.log`))).toBe(true);
    expect(disclosures([home, exported, slotOf(boot.stdout), slotOf(call.stdout), row().slotDir])).toEqual([]);
  } finally {
    await snap(["--session-close", name]);
    await snap(["--session-sweep"]);
  }
  expect(disclosures([home])).toEqual([]);
});
