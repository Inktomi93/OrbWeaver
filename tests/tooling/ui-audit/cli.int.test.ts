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
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("ui-audit", ["--definitely-not-a-flag"]);
  expect(res).toExitWith(3);
});
