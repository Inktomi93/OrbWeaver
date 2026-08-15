import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SnapFailureSummary } from "../../scripts/probes/snap.ts";
import { hasSnapFailure, parseScenarioSpec, parseSnapArgs, selectConsoleMessagesForReport } from "../../scripts/probes/snap.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../scripts/probes/snap.ts", import.meta.url));
const CLEAN_FAILURES: SnapFailureSummary = {
  navigation: 0,
  navActions: 0,
  pageErrors: 0,
  failedRequests: 0,
  steps: 0,
  contrast: 0,
  aria: 0,
  map: 0,
  eval: 0,
  watch: 0,
  diff: 0,
  assertions: 0,
  consoleErrors: 0,
  consoleWarnings: 0,
};

function runSnap(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SNAP_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("snap parses one multi-page evidence run without losing page targets", () => {
  const args = parseSnapArgs(["/chats", "--pages", "2", "--click@1", "[aria-label=Open]", "--eval@0", "document.title", "--aria@1", "main"]);

  expect(args.errors).toEqual([]);
  expect(args.route).toBe("/chats");
  expect(args.steps).toEqual([{ kind: "click", selector: "[aria-label=Open]", page: 1 }]);
  expect(args.eval).toEqual([{ expr: "document.title", page: 0 }]);
  expect(args.ariaSelector).toBe("main");
  expect(args.ariaPage).toBe(1);
});

test("snap rejects unknown flags and multiple routes instead of silently choosing a run", () => {
  const args = parseSnapArgs(["/one", "/two", "--bogus"]);

  expect(args.errors).toContain("unknown flag --bogus");
  expect(args.errors).toContain("expected at most one route, got 2");
});

test("snap rejects missing and malformed flag values", () => {
  const args = parseSnapArgs(["--click", "--no-shot", "--pages", "0", "--viewport", "wide", "--fill", "input", "--ls", "broken", "--crop", "100x"]);

  expect(args.errors).toEqual(
    expect.arrayContaining([
      "--click requires a value",
      '--pages expects an integer >= 1, got "0"',
      '--viewport expects positive WxH, got "wide"',
      '--fill expects selector=value with a non-empty selector, got "input"',
      '--ls expects key=value with a non-empty key, got "broken"',
      '--crop expects WxH or WxH+X+Y, got "100x"',
    ]),
  );
});

test("snap rejects page targets that cannot execute", () => {
  const args = parseSnapArgs(["--pages", "1", "--eval@1", "document.title"]);

  expect(args.errors).toContain("page target @1 is out of range for pages=1");
});

test("snap refuses conflicting and unsupported session modes before boot", () => {
  const args = parseSnapArgs(["--contexts", "2", "--isolated", "--watch", "1000", "--baseline", "--diff"]);

  expect(args.errors).toEqual(
    expect.arrayContaining([
      "--baseline and --diff are mutually exclusive",
      "--contexts/--as use the fixture stack and cannot be combined with --isolated/--dirty/--ref",
      "--contexts/--as do not support --watch, --baseline, or --diff",
    ]),
  );
});

test("snap refuses evidence flags whose requested artifacts cannot be produced", () => {
  const args = parseSnapArgs(["/ignored", "--file", "mock.html", "--no-shot", "--crop", "100x100", "--aria-depth", "2", "--contrast-pixel"]);

  expect(args.errors).toEqual(
    expect.arrayContaining([
      "--file and a positional route are mutually exclusive",
      "--crop requires a screenshot; drop --no-shot/--text or request --shot-of/baseline/diff",
      "--aria-depth/--aria-boxes require --aria or --text",
      "--contrast-pixel requires at least one --contrast selector",
    ]),
  );
});

test("every requested evidence failure participates in the final verdict", () => {
  expect(hasSnapFailure(CLEAN_FAILURES)).toBe(false);
  for (const field of ["aria", "map", "eval", "watch", "diff", "assertions", "consoleErrors", "consoleWarnings"] as const) {
    expect(hasSnapFailure({ ...CLEAN_FAILURES, [field]: 1 }), field).toBe(true);
  }
});

test("snap parses active-tree assertions, structured output, and strict console policy", () => {
  const args = parseSnapArgs([
    "/",
    "--expect-visible",
    "main",
    "--expect-text",
    "main=Hello",
    "--expect-count",
    "button=2",
    "--expect-no-overflow",
    "main",
    "--expect-focus",
    "input",
    "--expect-url",
    "/",
    "--json",
    "--summary",
    "--strict-console",
  ]);

  expect(args.errors).toEqual([]);
  expect(args.json).toBe(true);
  expect(args.summary).toBe(true);
  expect(args.strictConsole).toBe(true);
  expect(args.assertions).toHaveLength(6);
});

test("scenario schema is bounded to named checkpoints with argv arrays", () => {
  const scenario = parseScenarioSpec(
    JSON.stringify({ name: "chat flow", defaults: ["--no-shot"], checkpoints: [{ name: "home", args: ["/", "--expect-visible", "main"] }] }),
    "fallback",
  );

  expect(scenario.name).toBe("chat_flow");
  expect(scenario.checkpoints).toEqual([{ name: "home", args: ["/", "--expect-visible", "main"] }]);
  expect(() => parseScenarioSpec('{"checkpoints":[]}', "fallback")).toThrow("at least one checkpoint");
});

test("terminal console reports preserve failures before spending the remaining cap on recent noise", () => {
  const messages = Array.from({ length: 205 }, (_, index) => ({
    type: ["info", "error", "warning"][index] ?? "info",
    text: `message ${index}`,
    location: null,
    line: `[${index}]`,
  }));

  const selected = selectConsoleMessagesForReport(messages, 4);

  expect(selected.omitted).toBe(201);
  expect(selected.messages.map((message) => message.line)).toEqual(["[1]", "[2]", "[203]", "[204]"]);
});

test("snap help exits cleanly without starting Chromium", () => {
  const result = runSnap(["--help"]);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("snap — one browser run, many pieces of UI evidence");
  expect(result.stdout).toContain("--contexts <N>");
  expect(result.stdout).toContain("--watch <totalMs>");
  expect(result.stdout).toContain("--open-chat <id|title|latest>");
});

test("snap CLI exits 2 for misuse before starting Chromium", () => {
  const result = runSnap(["--eval@1", "document.title"]);

  expect(result.status).toBe(2);
  expect(result.stdout).toContain("ARG ERROR    page target @1 is out of range for pages=1");
  expect(result.stdout).toContain("pnpm snap --help");
});
