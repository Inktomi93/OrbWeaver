// @instrument-proof: plants a WCAG-failing low-contrast paragraph in a local mock and asserts the
// --contrast instrument REDs on it (exit 1, FAIL line) — with the readable twin as the negative control
// proving the instrument is not always-red. `--file` mode: no stack, a real headless chromium.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../support/tool-fixtures.ts";
import { isJudgeableMeasurement, labelRateLoad, scaledBudget } from "../_load-budget.ts";

const BAD_HTML = `<!doctype html><html><body style="background:#8a8a8a">
<p style="color:#7a7a7a;font-size:16px">barely there text</p>
</body></html>`;

const GOOD_HTML = `<!doctype html><html><body style="background:#ffffff">
<p style="color:#111111;font-size:16px">plainly readable text</p>
</body></html>`;

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
// THE ARGV-ONLY CASES SPAWN CHILDREN TOO (#1744). "refuses before any browser boots" means no Chromium —
// it does NOT mean no wall clock: each refusal is a whole snap CLI child (0.83-2.85s on this box at
// loadavg ~30, measured 2026-09-05), and two of the cases below spend a pair of them. Under the parallel
// lane's 5s default that is green alone and `Test timed out in 5000ms` the moment a snap sibling is
// co-scheduled — measured on a whole-directory `test:scoped tests/tooling/snap --maxWorkers=4`. A ceiling
// of their own, load-scaled like every other clock in this file.
const ARGV_TIMEOUT_MS = scaledBudget(30_000);

const DEAD_CSS_HTML = `<!doctype html><html data-app-ready="settled"><head><style>.defined { color: black }</style></head>
<body><p class="never-defined">dead selector plant</p></body></html>`;
const EMPTY_CSS_HTML = `<!doctype html><html data-app-ready="settled"><head><style>.empty-used { width: --not-a-value }</style></head>
<body><p class="empty-used">empty rule plant</p></body></html>`;
const CLEAN_CSS_HTML = `<!doctype html><html data-app-ready="settled"><head><style>.defined { color: black }</style></head>
<body><p class="defined">defined selector twin</p></body></html>`;

// @instrument-proof: dead/empty CSS are verdict members, not advisory report lines. The same CLI and
// browser walk a dead token, a used empty rule, and a clean defined twin so an always-red implementation
// cannot satisfy the fence.
test("dead and empty CSS findings RED ordinary Snap while the defined twin stays clean", { timeout: 3 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "dead.html": DEAD_CSS_HTML, "empty.html": EMPTY_CSS_HTML, "clean.html": CLEAN_CSS_HTML });
  const argv = ["--text", "--no-failure-evidence"];
  const dead = await runCli("snap", ["--file", `${root}/dead.html`, ...argv], { timeoutMs: BROWSER_TIMEOUT_MS });
  const empty = await runCli("snap", ["--file", `${root}/empty.html`, ...argv], { timeoutMs: BROWSER_TIMEOUT_MS });
  const clean = await runCli("snap", ["--file", `${root}/clean.html`, ...argv], { timeoutMs: BROWSER_TIMEOUT_MS });

  expect(dead.stdout).toContain("never-defined");
  expect(empty.stdout).toContain(".empty-used");
  await expect(dead).toExitWith(EXIT.violations);
  await expect(empty).toExitWith(EXIT.violations);
  await expect(clean).toExitWith(EXIT.clean);
});

test("dead CSS REDs the scenario aggregate and checkpoint summary", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "dead.html": DEAD_CSS_HTML, "clean.html": CLEAN_CSS_HTML });
  const scenario = (file: string, name: string): string =>
    JSON.stringify({ name, defaults: ["--text", "--scenario-summary"], checkpoints: [{ name: "css", args: ["--file", file] }] });
  const scenarios = await plantedTree({
    "dead-scenario.json": scenario(`${root}/dead.html`, "dead-css-scenario"),
    "clean-scenario.json": scenario(`${root}/clean.html`, "clean-css-scenario"),
  });
  const dead = await runCli("snap", ["--scenario", `${scenarios}/dead-scenario.json`, "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  const clean = await runCli("snap", ["--scenario", `${scenarios}/clean-scenario.json`, "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });

  expect(dead.stdout).toContain("CHECKPOINT css FAIL");
  expect(dead.stdout).toContain("deadcss-fails=1");
  await expect(dead).toExitWith(EXIT.violations);
  expect(clean.stdout).toContain("CHECKPOINT css PASS");
  await expect(clean).toExitWith(EXIT.clean);
});

test("the contrast instrument REDs on a planted WCAG failure (and stays green on the readable twin)", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "bad.html": BAD_HTML, "good.html": GOOD_HTML });
  const bad = await runCli("snap", ["--file", `${root}/bad.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(bad.stdout).toContain("FAIL");
  await expect(bad).toExitWith(EXIT.violations);
  const good = await runCli("snap", ["--file", `${root}/good.html`, "--contrast", "p", "--text", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(good.stdout).toContain("PASS");
  await expect(good).toExitWith(EXIT.clean);
});

// @instrument-absence-proof: the --contrast SELECTOR matches NOTHING (the measurement population is empty),
// which must report NOT FOUND and FAIL — never "0 contrast failures, PASS". snap was the ONE instrument the
// #409 sweep left without this proof: the refusal lives in ops/contrast.ts (`NOT FOUND`, failed: true) and
// nothing pinned it, so a selector that silently stopped matching after a rename would have read as clean.
test("a --contrast selector that matches NOTHING is a refusal, never a clean zero", { timeout: BROWSER_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "good.html": GOOD_HTML });
  const res = await runCli("snap", ["--file", `${root}/good.html`, "--contrast", "section.does-not-exist", "--text", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("NOT FOUND");
  expect(res.stdout).not.toContain("PASS");
  await expect(res).toExitWith(EXIT.violations);
});

test("CLI misuse refuses before any browser boots (exit 3 posture is the parse contract)", { timeout: ARGV_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("snap", ["--viewport", "banana", "--no-failure-evidence"]);
  expect(res.stdout).toContain("ARG ERROR");
  await expect(res).toExitWith(EXIT.misuse);
});

// ── --upload (#651) ──────────────────────────────────────────────────────────
// snap had NO file-input step, so every file-gated surface (the plugin install/consent screen,
// character/chat/preset import, avatar upload) was structurally invisible to the entire rendered-probe
// fleet — a side-eye lane had to hand-feed a live dropzone with an in-page DataTransfer via --eval to
// review it at all, and design-audit reported CLEAN on the surface it never actually rendered. Pinned
// with a real headless chromium (--file mode: no stack needed): a plain `<input type="file">`, a WRAPPED
// one (the real shape of every FileDropzone/FileTrigger/FolderPicker surface in this app — a decorative
// div covering the real input), the loud boundary refusal, and the loud not-found refusal (never a
// silent no-op).

const UPLOAD_HTML = `<!doctype html><html><body>
<input type="file" id="f" />
<div id="out">none</div>
<script>
document.getElementById('f').addEventListener('change', (e) => {
  var files = e.target.files;
  document.getElementById('out').textContent = files.length + ':' + (files[0] ? files[0].name : '');
});
</script>
</body></html>`;

// The real-DOM-shape trap this row exists to fix: a decorative wrapper (a stand-in for
// `data-slot="file-dropzone"`) covering a HIDDEN real file input — --upload must drill to it, not throw
// "not an HTMLInputElement" against the wrapper div.
const WRAPPED_UPLOAD_HTML = `<!doctype html><html><body>
<div id="wrap" data-slot="file-dropzone">
  <input type="file" id="f" hidden />
</div>
<div id="out">none</div>
<script>
document.getElementById('f').addEventListener('change', (e) => {
  var files = e.target.files;
  document.getElementById('out').textContent = files.length + ':' + (files[0] ? files[0].name : '');
});
</script>
</body></html>`;

test("--upload attaches a real file to a plain <input type=file>, with no --eval DataTransfer shim", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    [
      "--file",
      `${root}/page.html`,
      "--upload",
      `input#f=${root}/fixture.txt`,
      "--eval",
      "document.getElementById('out').textContent",
      "--no-shot",
      "--no-failure-evidence",
    ],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("1:fixture.txt");
  await expect(res).toExitWith(EXIT.clean);
});

test("--upload drills a WRAPPER selector down to the real <input type=file> it covers", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": WRAPPED_UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    [
      "--file",
      `${root}/page.html`,
      "--upload",
      `#wrap=${root}/fixture.txt`,
      "--eval",
      "document.getElementById('out').textContent",
      "--no-shot",
      "--no-failure-evidence",
    ],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("1:fixture.txt");
  await expect(res).toExitWith(EXIT.clean);
});

test("--upload refuses a path OUTSIDE the repo/scratchpad boundary — loudly, never a silent no-op", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("snap", ["--file", "/etc/hostname", "--upload", "input#f=/etc/hostname", "--no-shot", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("STEP FAILED");
  expect(res.stdout).toContain("boundary");
  await expect(res).toExitWith(EXIT.violations);
});

test("--upload against a selector that matches NOTHING is a loud step failure, never a silent no-op", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": UPLOAD_HTML, "fixture.txt": "hello upload" });
  const res = await runCli(
    "snap",
    ["--file", `${root}/page.html`, "--upload", `input#does-not-exist=${root}/fixture.txt`, "--no-shot", "--no-failure-evidence"],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  expect(res.stdout).toContain("STEP FAILED");
  await expect(res).toExitWith(EXIT.violations);
});

test("--upload misuse (no '=', or an empty path list) refuses before any browser boots", { timeout: ARGV_TIMEOUT_MS }, async ({ runCli }) => {
  const noEq = await runCli("snap", ["--upload", "input#f", "--no-failure-evidence"]);
  expect(noEq.stdout).toContain("ARG ERROR");
  await expect(noEq).toExitWith(EXIT.misuse);

  const emptyPaths = await runCli("snap", ["--upload", "input#f=", "--no-failure-evidence"]);
  expect(emptyPaths.stdout).toContain("ARG ERROR");
  await expect(emptyPaths).toExitWith(EXIT.misuse);
});

// ── load emulation: --cpu-throttle / --network (#826) ───────────────────────────────────────────────
// @instrument-proof: the throttle must actually REACH the page, not just parse. A flag that no-ops turns
// every "0.000 paid CLS" verdict taken under it into a false rest-state receipt — which is the exact
// class the #819 review was fighting (a settle inside the 500ms hadRecentInput window is free at rest and
// PAID under load). The probe is a fixed arithmetic loop run BETWEEN two animation frames, read from the
// rAF callback's own DOMHighResTimeStamp: the loop blocks the main thread, so the frame it sits in
// stretches by however long the CPU took. The assertion is on the DIFFERENCE (the ~16ms frame floor
// cancels) and its threshold is far below the nominal 8×, so the pin measures "the CPU is throttled at
// all", never the host's mood.
//
// WHY THE FRAME TIMESTAMP AND NOT `performance.now()`: the `test-determinism` gate bans every ambient
// clock spelling under tests/, and it CANNOT be suppressed — it reports through the Finding overload
// (file+line, no node), which lib/pass.ts's `@orb-gate-ignore` resolver never sees. Its two sanctioned
// live-clock tiers (tests/support/, tests/e2e/) are scanRoot exclusions, and this proof belongs with the
// tool it proves. rAF's timestamp argument is the frame clock, which is also the more honest instrument
// for "did the main thread get slower".

const CPU_LOOP_HTML = `<!doctype html><html data-app-ready="settled"><body style="background:#000">
<p style="color:#fff;font-size:16px">load arm</p></body></html>`;
/** Bare arrow — snap auto-invokes a function literal, and an ARROW IIFE double-invokes and throws. */
const CPU_LOOP_EVAL =
  "() => new Promise((resolve) => { requestAnimationFrame((t0) => { let x = 0; for (let i = 0; i < 12000000; i += 1) { x += Math.sqrt(i); } requestAnimationFrame((t1) => resolve(x > 0 ? Math.round(t1 - t0) : -1)); }); })";
const EVAL_MS_RE = /EVAL\[0\][^\n]*\n(\d+)/u;

function frameMs(stdout: string): number {
  const raw = EVAL_MS_RE.exec(stdout)?.[1];
  expect(raw, `the in-page loop must have reported a frame duration — got:\n${stdout}`).toBeDefined();
  return Number(raw);
}

// This measured-rate arm labels contention before judging its frame-stretch ratio. Structural peers
// remain parallel; a scaled completion deadline cannot make a noisy denominator valid.
test("--cpu-throttle REACHES the page: the same in-page loop stretches its frame at 8x", { timeout: 3 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
  task,
}) => {
  // MEASURE, LABEL, DON'T SKIP (#1616). The arm runs at any load: the throttle plumbing, the published
  // `throttle=` pairs and the exit code are facts load cannot change, and the two RATIO assertions — the
  // only load-destroyed half — stand down under the label instead of taking the whole arm with them.
  const rate = labelRateLoad({ task }, "snap's --cpu-throttle frame-stretch ratio");
  const root = await plantedTree({ "loop.html": CPU_LOOP_HTML });
  const argv = ["--file", `${root}/loop.html`, "--eval", CPU_LOOP_EVAL, "--no-shot", "--no-failure-evidence"];
  const rest = await runCli("snap", argv, { timeoutMs: BROWSER_TIMEOUT_MS });
  const loaded = await runCli("snap", [...argv, "--cpu-throttle", "8"], { timeoutMs: BROWSER_TIMEOUT_MS });

  const restMs = frameMs(rest.stdout);
  const loadedMs = frameMs(loaded.stdout);
  expect(restMs, "the unthrottled arm must have measured a frame at all").toBeGreaterThan(0);
  // THE THRESHOLD VERDICT, as a MEMBER rather than a conditional assertion (#1616): `unjudged` under the
  // label, `stretched`/`not-stretched` on a quiet box. One unconditional expect, so the arm still reds for
  // real on a quiet tree, and the measured numbers ride the message either way.
  const stretched = loadedMs - restMs > 60 && loadedMs / restMs > 1.8;
  const reading = `rest ${String(restMs)}ms vs loaded ${String(loadedMs)}ms (ratio ${(loadedMs / restMs).toFixed(2)})`;
  const judged = stretched ? "stretched" : "not-stretched";
  const verdict = isJudgeableMeasurement(rate) ? judged : "unjudged (load-suspect)";
  if (!isJudgeableMeasurement(rate)) {
    // The NUMBER lands where a reader can see it (#1616's "report its number") beside the reason — a
    // labelled arm that printed nothing would be a skip wearing a green tick.
    task.meta.orbLoadSuspect = `${rate.reason} · measured ${reading}`;
  }
  expect(verdict, `8x CPU throttling must stretch the frame, by a ratio and not just an absolute — ${reading}`).not.toBe("not-stretched");
  // …and the arm is published, so no reader has to re-derive it from the argv.
  expect(rest.stdout).toContain("throttle=cpu:1x/net:live");
  expect(loaded.stdout).toContain("throttle=cpu:8x/net:live");
  await expect(loaded).toExitWith(EXIT.clean);
});

test("a bad --cpu-throttle/--network value refuses before any browser boots", { timeout: ARGV_TIMEOUT_MS }, async ({ runCli }) => {
  const rate = await runCli("snap", ["--cpu-throttle", "0", "--no-failure-evidence"]);
  expect(rate.stdout).toContain("ARG ERROR");
  expect(rate.stdout).toContain("--cpu-throttle expects a rate >= 1");
  await expect(rate).toExitWith(EXIT.misuse);

  const profile = await runCli("snap", ["--network", "dial-up", "--no-failure-evidence"]);
  expect(profile.stdout).toContain("--network expects one of");
  await expect(profile).toExitWith(EXIT.misuse);
});

// The selector-DIALECT twin of the fix (#651's second, smaller gap): --contrast used to hand its
// selector straight to `document.querySelectorAll`, which cannot parse Playwright engine forms
// (`text=`) — the SAME dialect --wait-for requires. It now resolves through page.locator first.
test("--contrast now accepts the SAME text= dialect --wait-for requires", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": GOOD_HTML });
  const res = await runCli("snap", ["--file", `${root}/page.html`, "--contrast", "text=plainly readable text", "--no-shot", "--no-failure-evidence"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("PASS");
  expect(res.stdout).not.toContain("EVAL ERROR");
  await expect(res).toExitWith(EXIT.clean);
});
