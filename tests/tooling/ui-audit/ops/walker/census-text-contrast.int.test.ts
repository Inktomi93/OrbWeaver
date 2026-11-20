// The text census's contrast inputs, through the whole instrument (ops/walker/census-text.ts into lib/checks-color.ts):
// the opacity a glyph is judged at, and the pixel ring that settles a backdrop the walker could not resolve.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

async function audit(scratch: string, runSnap: ToolFixtures["runSnap"], name: string, body: string): Promise<string> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return res.stdout;
}

// #595959 on #ffffff is 7.00:1. Composited at 0.3 opacity over white the ink is #cdcdcd, which reads 1.59:1.
const DIM_FRAME = "@keyframes cb-dim { from, to { opacity: 0.3 } }";
const BRIGHT_FRAME = "@keyframes cb-bright { from, to { opacity: 1 } }";

function inkOnWhite(style: string): string {
  return `<style>${DIM_FRAME} ${BRIGHT_FRAME}</style><div style="background:#ffffff;padding:16px;width:240px"><span style="display:inline-block;color:#595959;font-size:16px;${style}">Responding</span></div>`;
}

test("a looping opacity animation is judged at rest: 7.00:1 at opacity 1, never the 1.59:1 its 0.3 frames show", async ({ runSnap, scratch }) => {
  const stdout = await audit(scratch, runSnap, "pulse-at-rest", inkOnWhite("animation:cb-dim 2s linear infinite"));
  expect(stdout).toMatch(/POPULATION\s+contrast candidates=1 judged=1 affected=0 /u);
  expect(stdout).not.toMatch(/^P\d\s+contrast\s/mu);
});

test("a statically dimmed text at opacity 0.3 still fails at 1.59:1", async ({ runSnap, scratch }) => {
  const stdout = await audit(scratch, runSnap, "static-dim", inkOnWhite("opacity:0.3"));
  expect(stdout).toMatch(/POPULATION\s+contrast candidates=1 judged=1 affected=1 /u);
  expect(stdout).toMatch(/^P1\s+contrast\s.*1\.59:1/mu);
});

test("a text resting at opacity 0.3 still fails at 1.59:1 while its loop paints it at opacity 1", async ({ runSnap, scratch }) => {
  const stdout = await audit(scratch, runSnap, "pulse-from-dim", inkOnWhite("opacity:0.3;animation:cb-bright 2s linear infinite"));
  expect(stdout).toMatch(/POPULATION\s+contrast candidates=1 judged=1 affected=1 /u);
  expect(stdout).toMatch(/^P1\s+contrast\s.*1\.59:1/mu);
});

/** A menu row as the Character Look tab's theme menu renders it: a swatch strip, then a label that fills its own box,
 *  on a popup whose translucent scroll-shadow gradient sends the label to the pixel pass. #ede4da on #2a2420 is 12.4:1. */
function themeRow(lead: string): string {
  const popup =
    "background-color:#2a2420;background-image:linear-gradient(to bottom,#2a2420 60%,transparent),linear-gradient(to top,#2a2420 60%,transparent);padding:4px;width:220px";
  const label = `<span style="min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#ede4da;font-size:14px;line-height:20px">Light</span>`;
  return `<div role="menu" style="${popup}"><div role="menuitem" style="position:relative;display:flex;align-items:center;gap:8px;padding:6px 8px;isolation:isolate">${lead}${label}</div></div>`;
}
const LIGHT_SWATCH =
  '<span style="display:flex;flex-shrink:0;overflow:hidden;border:1px solid #555;border-radius:3px;height:16px"><span style="width:16px;height:16px;background:#faf7f2"></span><span style="width:16px;height:16px;background:#ffffff"></span><span style="width:16px;height:16px;background:#b5562a"></span></span>';

test("a label that fills its box is judged from the ground beside it, with the swatch next to it left out of the ring", async ({ runSnap, scratch }) => {
  const stdout = await audit(scratch, runSnap, "label-beside-swatch", themeRow(LIGHT_SWATCH));
  expect(stdout).toMatch(/POPULATION\s+contrast candidates=1 judged=1 affected=0 /u);
});

test("a label over striped art that reaches under its box stays withheld", async ({ runSnap, scratch }) => {
  // The isolated row paints the z-index -1 stripes over its own ground and under the label.
  const stripes =
    '<span style="position:absolute;left:64px;right:0;top:2px;bottom:2px;z-index:-1;background-image:repeating-linear-gradient(90deg,#ffffff 0 3px,#000000 3px 6px)"></span>';
  const stdout = await audit(scratch, runSnap, "label-over-art", themeRow(LIGHT_SWATCH + stripes));
  expect(stdout).toMatch(/POPULATION\s+contrast candidates=1 judged=0 affected=0 .*withheld\(unresolvedBackdrop=1\)/u);
});
