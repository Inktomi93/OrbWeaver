import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SnapFailureSummary } from "../../scripts/probes/snap.ts";
import {
  capEvalText,
  hasSnapFailure,
  isSandboxTraceNoise,
  parseScenarioSpec,
  parseSnapArgs,
  selectConsoleMessagesForReport,
  splitTrailingEvals,
} from "../../scripts/probes/snap.ts";
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
  // --eval is queued alongside the step AND kept in args.eval (the --watch series re-runs that list).
  expect(args.actions).toEqual([
    { type: "step", action: { kind: "click", selector: "[aria-label=Open]", page: 1 } },
    { type: "eval", action: { expr: "document.title", page: 0 } },
  ]);
  expect(args.eval).toEqual([{ expr: "document.title", page: 0 }]);
  expect(args.ariaSelector).toBe("main");
  expect(args.ariaPage).toBe(1);
});

test("--eval joins the ONE queue, so an eval written before a step observes the PRE-step state", () => {
  // The live defect this pins: evals ran in a phase AFTER every step, so `--eval A --click X --eval B`
  // reported A's POST-click state and a sequence walk cost one snap invocation per step.
  const args = parseSnapArgs(["/", "--eval", "before", "--click", "[data-x]", "--key", "Tab", "--eval", "after"]);

  expect(args.errors).toEqual([]);
  expect(args.actions.map((entry) => entry.type)).toEqual(["eval", "step", "step", "eval"]);

  // The split the capture phase runs on: everything up to the LAST drive action is driven in argv order;
  // only the trailing evals stay behind to observe the settled surface.
  const split = splitTrailingEvals(args.actions);
  expect(split.drive.map((entry) => entry.type)).toEqual(["eval", "step", "step"]);
  expect(split.trailingEvals).toEqual(["after"]);
});

test("a queue with no steps is ENTIRELY trailing — the plain `snap / --eval x` path is unchanged", () => {
  const args = parseSnapArgs(["/", "--eval", "a", "--eval", "b"]);

  const split = splitTrailingEvals(args.actions);
  expect(split.drive).toEqual([]);
  expect(split.trailingEvals).toEqual(["a", "b"]);
});

test("--key has two forms: a BARE key walks focus, selector=Key re-anchors on the selector", () => {
  // Five `--key 'sel=Tab'` presses are not a walk — each re-focuses `sel` first, which is why the
  // 2026-08-16 audit concluded Tab never advances focus. The bare form is the walk instrument.
  const args = parseSnapArgs(["/", "--key", "Tab", "--key", "[data-composer]=Enter", "--key", "input="]);

  expect(args.errors).toEqual([]);
  expect(args.actions.map((entry) => entry.action)).toEqual([
    { kind: "keyboard", key: "Tab", page: 0 },
    { kind: "key", selector: "[data-composer]", key: "Enter", page: 0 },
    // An empty tail still defaults to Enter — the long-standing pair-form behaviour.
    { kind: "key", selector: "input", key: "Enter", page: 0 },
  ]);
  // The pair form still owes a selector; the bare form is a key name, not a selector.
  expect(parseSnapArgs(["--key", "=Enter"]).errors).toContain('--key expects selector=Key with a non-empty selector (or a bare key name), got "=Enter"');
});

test("a capped --eval result keeps BOTH ends — a head-only cut ate the cls/worstShift tail", () => {
  const short = '{"a":1}';
  expect(capEvalText(short)).toBe(short);

  const big = `HEAD_MARKER${"x".repeat(60_000)}TAIL_MARKER`;
  const capped = capEvalText(big);

  expect(capped.startsWith("[TRUNCATED 20000/")).toBe(true);
  expect(capped).toContain("HEAD_MARKER");
  expect(capped).toContain("TAIL_MARKER");
  expect(capped).toContain("elided from the MIDDLE");
});

test("bridge navs and interaction steps land in ONE queue in TRUE argv order", () => {
  // The live failure this pins: with navs run as a CLASS before the steps, this chain asked the LANDING
  // page for the rpg.game tab (the room did not exist yet) and the final click then timed out.
  const args = parseSnapArgs(["/", "--goto", "modal:newChat", "--click", "[data-create]", "--context-tab", "rpg.game", "--click", "D20 adventure"]);

  expect(args.errors).toEqual([]);
  expect(args.actions).toEqual([
    { type: "nav", action: { kind: "goto", target: "modal:newChat", page: 0 } },
    { type: "step", action: { kind: "click", selector: "[data-create]", page: 0 } },
    { type: "nav", action: { kind: "context-tab", target: "rpg.game", page: 0 } },
    { type: "step", action: { kind: "click", selector: "D20 adventure", page: 0 } },
  ]);
});

test("the @page suffix stamps BOTH queue kinds, and an out-of-range nav target is still refused", () => {
  const args = parseSnapArgs(["/", "--pages", "2", "--open-chat@1", "current", "--click@0", "main", "--goto@1", "presets"]);

  expect(args.errors).toEqual([]);
  expect(args.actions.map((entry) => [entry.type, entry.action.page])).toEqual([
    ["nav", 1],
    ["step", 0],
    ["nav", 1],
  ]);
  expect(parseSnapArgs(["--open-chat@3", "current"]).errors).toContain("page target @3 is out of range for pages=1");
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

test("--out with a text-only run WARNS instead of silently writing nothing", () => {
  // The live cost: `--goto corpus --out corpus-cartographer-merged --text` printed `out=(none)`, wrote no
  // PNG and exited 0, and the caller lost the capture. `--out` is not refused here the way `--crop` is,
  // because it also names the trace/har/--json manifest — naming a text-only run's manifest is real use.
  const args = parseSnapArgs(["/", "--goto", "corpus", "--out", "corpus-cartographer-merged", "--text"]);

  expect(args.errors).toEqual([]);
  expect(args.warnings).toHaveLength(1);
  expect(args.warnings[0]).toContain('--out "corpus-cartographer-merged"');
  expect(args.warnings[0]).toContain("NO IMAGE WILL BE WRITTEN");
  // …and it says so louder when the name IS still carrying something.
  expect(parseSnapArgs(["/", "--out", "run", "--text", "--json"]).warnings[0]).toContain("--json manifest");
});

test("--out stays silent whenever the run actually produces pixels", () => {
  const producingRuns = [
    ["--out", "x"],
    // --shot-of is itself a shot, so it survives --no-shot.
    ["--out", "x", "--shot-of", "main", "--no-shot"],
    // --baseline needs pixels to compare and forces them back on over --text.
    ["--out", "x", "--text", "--baseline"],
  ];
  for (const producing of producingRuns) {
    expect(parseSnapArgs(["/", ...producing]).warnings, producing.join(" ")).toEqual([]);
  }
  // No --out at all: nothing was asked for, so there is nothing to warn about.
  expect(parseSnapArgs(["/", "--text"]).warnings).toEqual([]);
});

test("snap CLI prints the --out warning before booting chromium", () => {
  // Warnings print ahead of the error/help gates, so this never reaches a browser: the run is refused for
  // the unrelated page-target error, and the caller STILL learns the --out did nothing.
  const result = runSnap(["--out", "lost-capture", "--text", "--eval@1", "document.title"]);

  expect(result.status).toBe(2);
  expect(result.stdout).toContain("ARG WARNING  ");
  expect(result.stdout).toContain("NO IMAGE WILL BE WRITTEN");
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

test("sandbox-trace noise is excluded from the error verdict but never from the record", () => {
  const noise = {
    type: "error",
    text: "",
    location: null,
    line: "[error] Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.",
  };
  const realError = { type: "error", text: "", location: null, line: "[error] TypeError: boom" };
  const routedNoise = {
    type: "error",
    text: "",
    location: null,
    line: "Blocked script execution in 'http://localhost:5173/api/card-frame/abc123' because the document's frame is sandboxed and the 'allow-scripts' permission is not set. (…:18:0)",
  };

  expect(isSandboxTraceNoise(noise)).toBe(true);
  expect(isSandboxTraceNoise(routedNoise)).toBe(true);
  expect(isSandboxTraceNoise(realError)).toBe(false);
  // A WARNING with the same text is not the tracing signature — the type is part of the match.
  expect(isSandboxTraceNoise({ ...noise, type: "warning" })).toBe(false);
  // The lossless report path never drops them: the selector sees all three errors.
  const selected = selectConsoleMessagesForReport([noise, realError, routedNoise], 10);
  expect(selected.omitted).toBe(0);
  expect(selected.messages).toHaveLength(3);
});

test("snap help exits cleanly without starting Chromium", () => {
  const result = runSnap(["--help"]);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("snap — one browser run, many pieces of UI evidence");
  expect(result.stdout).toContain("--contexts <N>");
  expect(result.stdout).toContain("--watch <totalMs>");
  expect(result.stdout).toContain("--open-chat <id|title|latest|current>");
});

test("snap CLI exits 2 for misuse before starting Chromium", () => {
  const result = runSnap(["--eval@1", "document.title"]);

  expect(result.status).toBe(2);
  expect(result.stdout).toContain("ARG ERROR    page target @1 is out of range for pages=1");
  expect(result.stdout).toContain("pnpm snap --help");
});
