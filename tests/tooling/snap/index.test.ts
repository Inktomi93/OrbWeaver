import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { CapturedRequest } from "@orb/tooling/_shared/browser-capture";
import { vi } from "vitest";
import type { SnapFailureSummary } from "../../../tooling/src/snap/index.ts";
import {
  capEvalText,
  hasSnapFailure,
  isSandboxTraceNoise,
  isViteDepChurn,
  NETWORK_PROFILES,
  NO_CPU_THROTTLE,
  parseNetworkProfile,
  parseScenarioSpec,
  parseSnapArgs,
  partitionFailedRequests,
  selectConsoleMessagesForReport,
  splitTrailingEvals,
  throttleResultValue,
} from "../../../tooling/src/snap/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../tooling/src/snap/cli.ts", import.meta.url));
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
  css: 0,
  deadCss: 0,
  emptyCss: 0,
  environment: 0,
  appearance: 0,
  lighthouse: 0,
};

// THREE OF THESE FORTY CASES SHELL THE REAL CLI (#1744) — 1.7-2.1s each on this box at loadavg ~30, and
// under the parallel lane's 5s default a co-scheduled snap sibling turns that into a timeout that reads
// like a parser defect. The other thirty-seven are pure and never approach this ceiling.
vi.setConfig({ testTimeout: scaledBudget(30_000) });

function runSnap(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SNAP_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: scaledBudget(10_000),
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

test("--cascade preserves selector/property pairs and page targets, and refuses unsupported contexts", () => {
  const args = parseSnapArgs(["/", "--pages", "2", "--cascade", "#layered=color", "--cascade@1", "[data-card]=--color-surface"]);

  expect(args.errors).toEqual([]);
  expect(args.cascade).toEqual([
    { selector: "#layered", property: "color", page: 0 },
    { selector: "[data-card]", property: "--color-surface", page: 1 },
  ]);
  expect(parseSnapArgs(["/", "--cascade", "broken"]).errors).toContain('--cascade expects selector=css-property, got "broken"');
  expect(parseSnapArgs(["/", "--contexts", "2", "--cascade", "main=color"]).errors).toContain(
    "--cascade does not combine with --contexts/--as (one ephemeral debugging profile owns one context)",
  );
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
  // The final click used to read `--click "D20 adventure"` — itself an instance of #550's lie (a CSS
  // type-selector chain for tags that cannot exist), so it is spelled with the text engine it meant.
  const args = parseSnapArgs(["/", "--goto", "modal:newChat", "--click", "[data-create]", "--context-tab", "rpg.game", "--click", "text=D20 adventure"]);

  expect(args.errors).toEqual([]);
  expect(args.actions).toEqual([
    { type: "nav", action: { kind: "goto", target: "modal:newChat", page: 0 } },
    { type: "step", action: { kind: "click", selector: "[data-create]", page: 0 } },
    { type: "nav", action: { kind: "context-tab", target: "rpg.game", page: 0 } },
    { type: "step", action: { kind: "click", selector: "text=D20 adventure", page: 0 } },
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

// The stateful-session family (#1231): the flags parse, a
// positional route is REMEMBERED as given (a session call with none drives the live page), and the
// combinations that cannot mean anything refuse by name.
test("session flags parse, the admin modes stand alone, and a bad TTL or name refuses before any browser boots", () => {
  const driving = parseSnapArgs(["--session", "p-home-perf", "--session-ttl", "0.5", "--eval", "1"]);
  expect(driving.errors).toEqual([]);
  expect(driving.session).toBe("p-home-perf");
  expect(driving.sessionTtlMin).toBe(0.5);
  expect(driving.routeGiven).toBe(false);
  expect(driving.route).toBe("/");
  expect(parseSnapArgs(["--session", "p-x", "/chat"]).routeGiven).toBe(true);

  const status = parseSnapArgs(["--session-status", "p-x"]);
  expect(status.errors).toEqual([]);
  expect(status.sessionStatus).toBe(true);
  expect(status.sessionStatusName).toBe("p-x");
  expect(parseSnapArgs(["--session-status"]).sessionStatusName).toBeNull();
  expect(parseSnapArgs(["--session-status", "--json"]).sessionStatusName).toBeNull();

  expect(parseSnapArgs(["--session-close", "p-x", "--session-sweep"]).errors).toContain(
    "--session-status, --session-close, --session-sweep and --session-export are mutually exclusive",
  );
  expect(parseSnapArgs(["--session", "p-x", "--session-status"]).errors).toContainEqual(expect.stringContaining("stand alone"));
  expect(parseSnapArgs(["--session-ttl", "5", "/"]).errors).toContain("--session-ttl <min> is a boot property of --session <name>");
  expect(parseSnapArgs(["--session", "p-x", "--session-ttl", "0"]).errors).toContainEqual(
    expect.stringContaining("--session-ttl expects a positive number of minutes"),
  );
  expect(parseSnapArgs(["--session", "p-x", "--matrix", "--isolated"]).errors).toEqual([]);
  expect(parseSnapArgs(["--session", "p-x", "--stage-status"]).errors).toContainEqual(expect.stringContaining("do not combine with --stage-status"));
  expect(parseSnapArgs(["--session", "P-Bad Name"]).errors).toContainEqual(expect.stringContaining("must match"));
  expect(parseSnapArgs(["--session"]).errors).toContain("--session requires a value");
});

test("snap rejects missing and malformed flag values", () => {
  const args = parseSnapArgs(["--click", "--no-shot", "--pages", "0", "--viewport", "wide", "--fill", "input", "--local-storage", "broken", "--crop", "100x"]);

  expect(args.errors).toEqual(
    expect.arrayContaining([
      "--click requires a value",
      '--pages expects an integer >= 1, got "0"',
      '--viewport expects positive WxH, got "wide"',
      '--fill expects sel=value with a non-empty selector, got "input"',
      '--local-storage expects key=value with a non-empty key, got "broken"',
      '--crop expects WxH or WxH+X+Y, got "100x"',
    ]),
  );
  expect(parseSnapArgs(["--viewport", "1e3x768"]).errors).toContain('--viewport expects positive WxH, got "1e3x768"');
});

// #686: --fill splits on the FIRST '=' — its value is a JS literal that routinely contains '=' itself
// (`--fill '[data-composer]=const a = 1;'`). Splitting on the LAST '=' instead misparses the selector
// (swallowing the value's own '=' into it) and falsely refuses with "not an element name". Two-direction
// pin: a value containing '=' parses correctly, and a genuinely missing '=' still refuses.
test("snap --fill splits on the first '=', so a JS-literal value containing '=' parses correctly", () => {
  const args = parseSnapArgs(["/", "--fill", "[data-composer]=const a = 1;"]);

  expect(args.errors).toEqual([]);
  const fillAction = args.actions.find((a) => a.type === "step" && a.action.kind === "fill");
  expect(fillAction).toMatchObject({ type: "step", action: { kind: "fill", selector: "[data-composer]", value: "const a = 1;" } });
});

// #816: THE #686 RULING SURVIVES — ITS INPUT CHANGED. First-'=' splitting assumed a selector never
// carries one; an ATTRIBUTE selector does, so `[data-testid=x]=v` filled `[data-testid` and every
// attribute selector was unusable (a live review had to tag its input via --eval first —
// 2026-08-29 §9). The split is bracket/quote aware now, which
// keeps BOTH: the arm above (a JS-literal value with its own '=') and the two below.
test("snap --fill splits AFTER an attribute selector, not inside it", () => {
  const args = parseSnapArgs(["/", "--fill", '[data-testid="new-cast-name"]=Spire Trio']);

  expect(args.errors).toEqual([]);
  const fillAction = args.actions.find((a) => a.type === "step" && a.action.kind === "fill");
  expect(fillAction).toMatchObject({ type: "step", action: { kind: "fill", selector: '[data-testid="new-cast-name"]', value: "Spire Trio" } });
});

test("snap --fill keeps both halves at once: an attribute selector AND a value carrying its own '='", () => {
  const args = parseSnapArgs(["/", "--fill", "[data-slot=composer-input]=const a = 1;"]);

  expect(args.errors).toEqual([]);
  const fillAction = args.actions.find((a) => a.type === "step" && a.action.kind === "fill");
  expect(fillAction).toMatchObject({ type: "step", action: { kind: "fill", selector: "[data-slot=composer-input]", value: "const a = 1;" } });
});

// #826: THE SAME RULING, ITS INPUT CHANGED AGAIN. A Playwright ENGINE prefix carries its own '=' inside
// the selector, so the depth-0 split cut `role=textbox[name="Content"]=hello` at `role` and refused with
// `--fill selector "role" can never match` — the flag could not target ANY role/text selector, and a live
// review had to fall back to `:nth-match(textarea, 2)=value` (2026-08-30 CLS review §9-I4). The engine set
// is CLOSED: `input=hello` must still split at the first '=' or this fix becomes the mirror of the bug.
test("snap --fill takes a role= engine selector — the engine's own '=' is part of the selector", () => {
  const args = parseSnapArgs(["/", "--fill", 'role=textbox[name="Content"]=a line of prose']);

  expect(args.errors).toEqual([]);
  const fillAction = args.actions.find((a) => a.type === "step" && a.action.kind === "fill");
  expect(fillAction).toMatchObject({ type: "step", action: { kind: "fill", selector: 'role=textbox[name="Content"]', value: "a line of prose" } });
});

test("a >> chain keeps its per-part engines, and a plain CSS pair still splits at the first '='", () => {
  const chained = parseSnapArgs(["/", "--fill", "role=textbox >> nth=1=second"]);
  expect(chained.errors).toEqual([]);
  expect(chained.actions.find((a) => a.type === "step")).toMatchObject({ action: { selector: "role=textbox >> nth=1", value: "second" } });

  // The mirror-image regression this closes the door on: `input` is engine-SHAPED but is not an engine.
  const plain = parseSnapArgs(["/", "--fill", "input=hello"]);
  expect(plain.errors).toEqual([]);
  expect(plain.actions.find((a) => a.type === "step")).toMatchObject({ action: { selector: "input", value: "hello" } });
});

test("snap --fill with no '=' at all still refuses, naming the expected sel=value shape", () => {
  const args = parseSnapArgs(["/", "--fill", "input"]);

  expect(args.errors).toContain('--fill expects sel=value with a non-empty selector, got "input"');
});

// #550: the refusal reaches EVERY selector-bearing flag class, not just the --wait-for that exposed it —
// the required-value flags, the `selector=…` head flags, and the optional inline selector (which does not
// pass through validateFlagValue at all and needs its own call site).
test("snap refuses a prose selector on every selector-bearing flag class, and only on selectors", () => {
  const args = parseSnapArgs([
    "/",
    "--wait-for",
    "choose who speaks next",
    "--expect-text",
    "Save changes=done",
    "--map",
    "the roster panel",
    "--goto",
    "modal:newChat",
    "--expect-url",
    "/chats",
    "--eval",
    "document.title",
    "--key",
    "Tab",
    "--click",
    '[data-testid="composer-guided-response"]',
  ]);

  expect(args.errors).toHaveLength(3);
  expect(args.errors[0]).toContain('--wait-for "text=choose who speaks next"');
  expect(args.errors[1]).toContain('--expect-text "text=Save changes"');
  expect(args.errors[2]).toContain('--map "text=the roster panel"');
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

test("--out is silent on the cheap-ladder rungs the lost-capture incident never named", () => {
  // #1347's half of the fork above: `--out` on an eval/map/contrast/assert run names the run's artifacts,
  // and warning about a PNG nobody asked for cost five false ARG lines in one review.
  for (const ladder of [["--eval", "1"], ["--map"], ["--contrast", "main"], ["--expect-visible", "main"], ["--cascade", "main=color"]]) {
    expect(parseSnapArgs(["/", "--out", "x", "--no-shot", ...ladder]).warnings, ladder.join(" ")).toEqual([]);
  }
  // …and the incident's own argv still warns: `--text`/`--aria` keep it.
  expect(parseSnapArgs(["/", "--out", "x", "--text"]).warnings).toHaveLength(1);
  // `--aria` alone still SHOOTS (only `--text` drops the PNG), so its warning needs --no-shot to be about
  // a suppressed image at all.
  expect(parseSnapArgs(["/", "--out", "x", "--no-shot", "--aria", "main"]).warnings).toHaveLength(1);
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
  // the unrelated flag error, and the caller STILL learns the --out did nothing.
  // The refusing flag is `--contrast-pixel` (was `--eval@1`): since #1347 an `--eval` run's `--out` names
  // the run's artifacts rather than a lost image, so it no longer warns — see lib/parse-warnings.ts for
  // which rungs of the cheap ladder still do. The PROPERTY under test is unchanged.
  const result = runSnap(["--out", "lost-capture", "--text", "--contrast-pixel"]);

  expect(result.status).toBe(3);
  expect(result.stdout).toContain("ARG WARNING  ");
  expect(result.stdout).toContain("NO IMAGE WILL BE WRITTEN");
});

test("every requested evidence failure participates in the final verdict", () => {
  expect(hasSnapFailure(CLEAN_FAILURES)).toBe(false);
  for (const field of ["aria", "map", "eval", "watch", "diff", "assertions", "consoleErrors", "consoleWarnings", "deadCss", "emptyCss"] as const) {
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
    "--strict-console",
  ]);

  expect(args.errors).toEqual([]);
  expect(args.json).toBe(true);
  expect(args.summary).toBe(false);
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

// @instrument-proof: #953 must preserve the pre-rated-matrix composition: a behavioral JSON scenario
// runs under every derived environment/Appearance cell. The parser used to reject this pair even though
// matrix.ts retained the scenario execution branch, turning shipped capability into dead code.
test("the rated matrix composes with a scenario instead of refusing the old capability", () => {
  const args = parseSnapArgs(["--matrix", "--scenario", "walk.json", "--isolated"]);

  expect(args.errors).toEqual([]);
  expect(args.matrix).toBe(true);
  expect(args.scenario).toBe("walk.json");
});

// @instrument-proof: #1127 I4 - THE STAGE REFUSAL MUST SAY WHY NO SUBSET ESCAPES IT, AND WHERE TO LOOK.
// A lane whose sibling held the single band read the old one-liner ("rated custom themes and
// density-preview drafts are stage-scoped") as an invitation to pick the cells that do not need the
// stage, and had no way to learn there are none: ops/matrix-contract.ts pins custom-light/custom-dark as
// REQUIRED theme-axis values (representativeMatrixThemes refuses outright without a rated custom theme
// carrying custom CSS) and riskTwins pins the density-preview pair, so every planned cell is stage-scoped.
// The refusal therefore has to carry two facts: EVERY cell needs it, and --stage-status names the holder.
test("#1127 the --matrix stage refusal states that every cell is stage-scoped and names the holder probe", () => {
  const refusal = parseSnapArgs(["/", "--matrix"]).errors.find((error) => error.startsWith("--matrix requires"));

  expect(refusal).toBeDefined();
  expect(refusal).toContain("EVERY cell is stage-scoped, not just some");
  expect(refusal).toContain("--stage-status");
  // ...and the two REQUIREMENT families are named, so a reader can check the claim against the plan
  // rather than taking the refusal's word for it.
  expect(refusal).toContain("custom-light/custom-dark");
  expect(refusal).toContain("density-preview");
});

// THE PLANTED CONTROL: the refusal is about the STAGE, not about --matrix, so the sanctioned spelling
// still parses clean. Without this, "the refusal exists" would also pass on a tree that refused always.
test("#1127 CONTROL: --matrix with a stage arm raises no stage refusal at all", () => {
  for (const stageArm of ["--isolated", "--dirty"]) {
    expect(parseSnapArgs(["/", "--matrix", stageArm]).errors.filter((error) => error.startsWith("--matrix requires"))).toEqual([]);
  }
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

// ── load emulation: --cpu-throttle / --network (#826) ───────────────────────────────────────────────
// The arm that decided #819 (does a click-adjacent settle cross the 500ms hadRecentInput cliff under
// load) was unreachable from snap and cost 14 chrome-devtools MCP calls. Parse-side pins: the values
// reach Args, a bad value REFUSES (a silently-ignored throttle flag would report a load arm that never
// ran), the DevTools numbers are the DevTools numbers, and the RESULT line publishes the arm.

test("snap parses the load-emulation arms into Args, defaulting to no throttle and the real link", () => {
  const off = parseSnapArgs(["/"]);
  expect(off.cpuThrottle).toBe(NO_CPU_THROTTLE);
  expect(off.network).toBeNull();

  const loaded = parseSnapArgs(["/", "--cpu-throttle", "4", "--network", "Slow 4G"]);
  expect(loaded.errors).toEqual([]);
  expect(loaded.cpuThrottle).toBe(4);
  expect(loaded.network).toBe("slow-4g");
});

test("a bad throttle value REFUSES before a browser boots — never a silent fall back to 1x", () => {
  expect(parseSnapArgs(["/", "--cpu-throttle", "banana"]).errors).toContain(
    '--cpu-throttle expects a rate >= 1 (1 = off, 4 = the standard load arm), got "banana"',
  );
  expect(parseSnapArgs(["/", "--cpu-throttle", "0"]).errors.join(" ")).toContain("--cpu-throttle expects a rate >= 1");
  expect(parseSnapArgs(["/", "--network", "3g"]).errors.join(" ")).toContain("--network expects one of");
});

test("the --network vocabulary is DevTools' own, case/separator-insensitive, with Fast 3G as the alias it is", () => {
  // DevTools renamed "Fast 3G" to "Slow 4G"; both spellings must land on ONE condition, never a fifth.
  expect(parseNetworkProfile("Fast 3G")).toBe("slow-4g");
  expect(parseNetworkProfile("slow_4g")).toBe("slow-4g");
  expect(parseNetworkProfile("OFFLINE")).toBe("offline");
  expect(parseNetworkProfile("edge")).toBeNull();

  // Verbatim from front_end/core/sdk/NetworkManager.ts: 1.6 Mbps × 0.9 ÷ 8, 750 Kbps × 0.9 ÷ 8, 150 × 3.75.
  expect(NETWORK_PROFILES["slow-4g"]).toEqual({ offline: false, downloadThroughput: 180_000, uploadThroughput: 84_375, latency: 562.5 });
  expect(NETWORK_PROFILES.offline.offline).toBe(true);
});

test("the RESULT line publishes the arm every number in the run was measured under", () => {
  expect(throttleResultValue(NO_CPU_THROTTLE, null)).toBe("cpu:1x/net:live");
  expect(throttleResultValue(4, "slow-4g")).toBe("cpu:4x/net:slow-4g");
});

// ── Cold-stage vite churn is not a failure (issue #148 item 3) ──────────────────────────────────────
// On a COLD vite server the first page load discovers deps, re-bundles, and aborts the in-flight
// /node_modules/.vite/deps/*.js requests it had already started. The browser re-requests every one and the
// page loads; nothing is broken. It red-exited the first `--isolated --fresh` snap every time — which is
// exactly the call a lane makes when it has nothing else to trust.
function request(over: Partial<CapturedRequest>): CapturedRequest {
  return { method: "GET", url: "http://localhost:5273/x.js", status: null, failed: null, type: "script", ...over };
}

test("a vite dep-optimizer abort is reported but never counted against the run", () => {
  const churn = request({ url: "http://localhost:5273/node_modules/.vite/deps/react-dom_client.js?v=abc", failed: "net::ERR_ABORTED" });
  const realAbort = request({ url: "http://localhost:5273/api/chat/stream", failed: "net::ERR_ABORTED", type: "fetch" });
  const depNotFound = request({ url: "http://localhost:5273/node_modules/.vite/deps/missing.js", status: 404 });
  const clean = request({ status: 200 });

  expect(isViteDepChurn(churn)).toBe(true);
  // A real abort elsewhere, and a 404 ON the dep path, are genuine failures — the exemption is narrow by
  // construction (an ABORT, and only on the optimizer's own path).
  expect(isViteDepChurn(realAbort)).toBe(false);
  expect(isViteDepChurn(depNotFound)).toBe(false);

  const partitioned = partitionFailedRequests([churn, realAbort, depNotFound, clean]);
  expect(partitioned.viteChurn).toEqual([churn]);
  expect(partitioned.failed).toEqual([realAbort, depNotFound]);
});

test("snap help exits cleanly without starting Chromium", () => {
  const result = runSnap(["--help"]);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("snap — one browser run, many pieces of UI evidence");
  expect(result.stdout).toContain("--contexts <N>");
  expect(result.stdout).toContain("--watch <totalMs>");
  expect(result.stdout).toContain("--open-chat <id|title|latest|current>");
  expect(result.stdout).toContain("appearance-shell-config");
  expect(result.stdout).toContain("appearance-chat");
});

test("snap CLI exits 2 for misuse before starting Chromium", () => {
  const result = runSnap(["--eval@1", "document.title"]);

  expect(result.status).toBe(3);
  expect(result.stdout).toContain("ARG ERROR    page target @1 is out of range for pages=1");
  expect(result.stdout).toContain("pnpm snap --help");
});
