// @instrument-proof: a planted black-on-black paragraph (a 1:1 contrast defect) driven through the REAL
// cli over a file:// base must exit 1 with a `contrast` finding; the white-on-black twin must exit 0 —
// the deterministic scan cannot be a green-that-cannot-fail, and a misuse typo must never scan at all.
//
// The fixtures declare `data-app-ready` on <html> themselves so the readiness wait resolves instantly
// (a file page never runs the app; without the attribute every case burns the full 10s ceiling), and
// carry a <main> landmark so the only P1-severity finding in play is the planted one.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;
/** The RESULT line's node-census total — the denominator every "clean" verdict here rests on (#409). */
const CENSUS_RE = /census=(\d+)/u;

function page(bodyStyle: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0"><main><p style="${bodyStyle};font-size:16px;margin:24px">the reading surface under audit</p></main></body></html>`;
}

test("a planted contrast defect REDs the audit through the real cli", async ({ runCli, scratch }) => {
  const file = join(scratch, "bad.html");
  await writeFile(file, page("background:#000;color:#000"));
  const res = await runCli("ui-audit", ["/bad.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("contrast");
  expect(res).toExitWith(1);
});

test("the passing twin exits clean — the red above is the plant, not the harness", async ({ runCli, scratch }) => {
  const file = join(scratch, "good.html");
  await writeFile(file, page("background:#000;color:#fff"));
  const res = await runCli("ui-audit", ["/good.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  // The twin proves the PLANTED CLASS is absent (no contrast finding, no P1) — a fixture page still
  // legitimately trips the P2 font census (its default face is off the token ramp), which the exit
  // verdict correctly ignores at the default --fail-on P1.
  expect(res.stdout).not.toContain("contrast");
  expect(res.stdout).toContain("p1=0");
  expect(res).toExitWith(0);
  // ZERO HYGIENE (#409): "no P1s" is only a verdict when the walk actually censused nodes.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── control silhouette (#430, from side-eye #420) ────────────────────────────

// @instrument-proof: a planted near-square `role="switch"` (48x44 — the exact pre-#420 coarse geometry,
// aspect 1.091) driven through the REAL cli must exit 1 with a `control-aspect` finding at --fail-on P2;
// the shipped 64x44 twin (aspect 1.455) must not carry the class at all. Before this rule the detector
// was structurally blind to a control collapsing toward square, and a green audit read as a verdict.
function switchPage(trackWidthPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000"><main><span role="switch" aria-checked="true" aria-label="Color quoted speech" tabindex="0" style="display:inline-block;width:${trackWidthPx}px;height:44px;border-radius:9999px;background:#f77f20"></span></main></body></html>`;
}

test("a planted near-square role=switch REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "crescent.html"), switchPage(48));
  const res = await runCli("ui-audit", ["/crescent.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("control-aspect");
  expect(res.stdout, "the finding must name the measured aspect, not just the rule").toContain("1.09");
  expect(res).toExitWith(1);
});

test("the shipped 64x44 twin carries no control-aspect finding — the red above is the plant", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pill.html"), switchPage(64));
  const res = await runCli("ui-audit", ["/pill.html", "--base", `file://${scratch}`, "--fail-on", "P2"], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("control-aspect");
  // The twin still legitimately trips the P2 font census (a bare fixture page's default face is off the
  // token ramp), so the exit code is not the discriminator here — the ABSENCE of the planted class is.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["--definitely-not-a-flag"]);
  expect(res).toExitWith(3);
});

// ── ZERO HYGIENE (#409): an empty node census is absent evidence, never "no findings — clean" ──

// @instrument-absence-proof: an EMPTY node census (a blank mount / swallowed error boundary) must report
// INSTRUMENT ERROR naming the census, never "no findings — clean".
test("a page the walk censused NOTHING on is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  // The defect class this stands for: a blank mount / swallowed error boundary renders an empty shell,
  // every check family receives an empty list, and the audit reports "no findings — clean".
  const file = join(scratch, "empty.html");
  await writeFile(file, `<!doctype html>\n<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main></main></body></html>`);
  const res = await runCli("ui-audit", ["/empty.html", "--base", `file://${scratch}`], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("census");
  expect(res).toExitWith(2);
});
