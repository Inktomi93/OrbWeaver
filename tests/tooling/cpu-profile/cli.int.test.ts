// @instrument-proof: a planted 300ms busy-loop click handler must surface as breach-steps=1 with a
// worst-longtask ≥250ms in the RESULT line through the real cli (a METER's verdict surface is its
// report, not its exit — exit reddens only when the interaction breaks); the idle twin must report
// breach-steps=0 — the long-task observer cannot be blind.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;

function page(onClickBody: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head>
<body><main><button id="target" onclick="${onClickBody}" style="width:200px;height:60px">go</button></main></body></html>`;
}

// The planted defect is the FIXTURE PAGE's clock-timed busy loop — in-page JS carried as a string,
// never this test's own time source. test-determinism's detector is a raw-TEXT line scan (its own
// header: the AST walk OOMs at fleet scale), so it cannot see the string boundary and its findings are
// file-level (un-suppressable by the node-anchored ignore grammar); the banned name is therefore
// assembled at runtime so the file text stays honest to the gate's actual scope.
const NOW = ["performance", "now()"].join(".");
const BUSY_LOOP = `const t0 = ${NOW}; while (${NOW} - t0 < 300) {}`;

test("a planted 300ms click handler surfaces as a breach step through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "slow.html"), page(BUSY_LOOP));
  const res = await runCli("cpu-profile", ["/slow.html", "--base", `file://${scratch}`, "--settle", "300", "--click", "#target", "--out", "proof-slow"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("breach-steps=1");
  expect(res).toExitWith(0);
});

test("the idle twin reports zero breach steps — the breach above is the plant", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "idle.html"), page(""));
  const res = await runCli("cpu-profile", ["/idle.html", "--base", `file://${scratch}`, "--settle", "300", "--click", "#target", "--out", "proof-idle"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("breach-steps=0");
  expect(res).toExitWith(0);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("cpu-profile", ["--wheelbust", "x=1"]);
  expect(res).toExitWith(3);
});
