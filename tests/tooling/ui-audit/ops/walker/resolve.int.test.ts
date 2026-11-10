// The backdrop resolver's shared answers for the non-text callers (ops/walker/resolve.ts): the paint order of a
// layer, the scroller that clips it, and the read past a translucent gradient. Text samples have their own proofs.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

async function audit(scratch: string, runCli: ToolFixtures["runCli"], name: string, body: string): Promise<string> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return res.stdout;
}

/** A field whose #dddddd border reads about 1.3:1 on the white plate, so a judged sample is an affected one. */
function borderOverGradient(gradientAlpha: number): string {
  const tint = `rgba(0,0,0,${String(gradientAlpha)})`;
  return `<div style="background-color:#ffffff;background-image:linear-gradient(${tint},${tint});padding:24px;width:320px"><input aria-label="Name" style="border:1px solid #dddddd;background:transparent;width:200px;height:32px"></div>`;
}

test("border-contrast reads past a translucent gradient to the plate under it and judges the border", async ({ runCli, scratch }) => {
  const stdout = await audit(scratch, runCli, "border-translucent-gradient", borderOverGradient(0.04));
  expect(stdout).toMatch(/POPULATION\s+border-contrast candidates=1 judged=1 affected=1 /u);
  expect(stdout).toMatch(/^P\d\s+border-contrast\s/mu);
});

test("border-contrast still withholds over an opaque gradient, whose stops cannot say which band meets the border", async ({ runCli, scratch }) => {
  const stdout = await audit(scratch, runCli, "border-opaque-gradient", borderOverGradient(1));
  expect(stdout).toMatch(/POPULATION\s+border-contrast candidates=1 judged=0 affected=0 .*withheld\(gradient=1\)/u);
});

/** A self-hover label on a white plate, with a painted contentless chip across its left half. */
function hoverUnderChip(plateStyle: string, chipStyle: string): string {
  return `<style>
.plain-label { display: inline-block; color: #555555; }
.plain-label:hover { color: #111111; }
</style>
<div style="position:relative;background:#ffffff;padding:16px;width:240px;${plateStyle}"><span class="plain-label">self-driven label</span><span style="position:absolute;top:16px;left:16px;width:60px;height:20px;background:#888888;${chipStyle}"></span></div>`;
}

test("hover-contrast judges a label whose overlapping chip the browser paints above it", async ({ runCli, scratch }) => {
  const stdout = await audit(scratch, runCli, "hover-chip-above", hoverUnderChip("", ""));
  expect(stdout).toMatch(/POPULATION\s+hover-contrast candidates=1 judged=1 /u);
});

test("hover-contrast keeps the veto of a chip painted between the plate and the label", async ({ runCli, scratch }) => {
  // The isolated plate makes its own stacking context, so the z-index -1 chip paints over the plate and under the label.
  const stdout = await audit(scratch, runCli, "hover-chip-below", hoverUnderChip("isolation:isolate", "z-index:-1"));
  expect(stdout).toMatch(/POPULATION\s+hover-contrast candidates=1 judged=0 .*withheld\([^)]*unresolvedHoverBackdrop=1/u);
});
