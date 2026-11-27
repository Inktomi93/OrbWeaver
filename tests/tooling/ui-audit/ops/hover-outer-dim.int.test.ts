// A hover-painted label over art that only the held frame's pixels can settle, under an ancestor opacity group.
//
// The pixel ring is the framebuffer, so it already shows any ancestor group's dim over the backdrop it also holds. The pass
// cannot say which pieces of the backdrop sit inside the group, so such a pair has no sound composite: it is withheld by
// name, and a label with no ancestor dim or only its own dim keeps its verdict.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, auditReport, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import { expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

interface HoverDimReport {
  readonly populationAccounting?: Readonly<Record<string, { readonly judged: number; readonly withheld: Readonly<Record<string, number>> }>>;
}

/** A translucent scroll-shadow gradient over a ground sends the label's backdrop to the pixel pass. */
const ART_POPUP =
  "background-color:#2a2420;background-image:linear-gradient(to bottom,#2a2420 60%,transparent),linear-gradient(to top,#2a2420 60%,transparent);padding:4px;width:220px";

function hoverLabelOverArt({ ancestorStyle, labelStyle }: { readonly ancestorStyle: string; readonly labelStyle: string }): string {
  return `<style>.art-label { display: block; padding: 6px 8px; color: #8a8a8a; } .art-label:hover { color: #ffffff; }</style>
<div style="${ancestorStyle}"><div style="${ART_POPUP}"><span class="art-label" style="${labelStyle}">Light</span></div></div>`;
}

async function hoverContrastRow(
  scratch: string,
  runSnap: (args: readonly string[], opts: { readonly timeoutMs: number }) => Promise<{ readonly stdout: string }>,
  name: string,
  body: string,
): Promise<NonNullable<HoverDimReport["populationAccounting"]>[string]> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR: the hover");
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverDimReport;
  const row = report.populationAccounting?.["hover-contrast"];
  if (row === undefined) {
    throw new Error(`the hover-contrast population is missing from ${name}`);
  }
  return row;
}

test("a hover label over pixel-sampled art under an ancestor dim is withheld by name", async ({ runSnap, scratch }) => {
  const row = await hoverContrastRow(scratch, runSnap, "hover-ancestor-dim", hoverLabelOverArt({ ancestorStyle: "opacity:0.5", labelStyle: "" }));
  expect(row.judged).toBe(0);
  expect(row.withheld).toEqual({ outerDimOverPixels: 1 });
});

test("the same label with no ancestor dim, or only its own dim, keeps its verdict", async ({ runSnap, scratch }) => {
  const plain = await hoverContrastRow(scratch, runSnap, "hover-no-dim", hoverLabelOverArt({ ancestorStyle: "", labelStyle: "" }));
  expect(plain.judged).toBe(1);
  expect(plain.withheld).toEqual({});
  const own = await hoverContrastRow(scratch, runSnap, "hover-own-dim", hoverLabelOverArt({ ancestorStyle: "", labelStyle: "opacity:0.9" }));
  expect(own.judged).toBe(1);
  expect(own.withheld).toEqual({});
});
