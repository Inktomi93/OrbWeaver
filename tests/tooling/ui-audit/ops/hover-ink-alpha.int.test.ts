// A hover rule that changes only the ink's alpha. The reader sees the blend of the ink with the backdrop, so the hover pair is
// judged at that blend, the same painted-ink rule the rest contrast check applies, and an alpha-only change is a hover change.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, auditReport, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import { expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

interface HoverInkReport {
  readonly findings: readonly { readonly rule: string; readonly value: string }[];
  readonly populationAccounting?: Readonly<
    Record<string, { readonly judged: number; readonly affected: number; readonly excluded: Readonly<Record<string, number>> }>
  >;
}

// Black ink at alpha 0.45 on white paints #8c8c8c, which reads 3.36:1, while its authored channels read 21:1.
function inkHover(restAlpha: string, hoverAlpha: string): string {
  return `<style>.alpha-label { color: rgb(0 0 0 / ${restAlpha}); } .alpha-label:hover { color: rgb(0 0 0 / ${hoverAlpha}); }</style>
<div style="background:#ffffff;padding:16px;width:240px"><span class="alpha-label" style="display:inline-block;font-size:16px">Muted on hover</span></div>`;
}

async function hoverReport(
  scratch: string,
  runSnap: (args: readonly string[], opts: { readonly timeoutMs: number }) => Promise<{ readonly stdout: string }>,
  name: string,
  body: string,
): Promise<HoverInkReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverInkReport;
}

test("a hover rule that fades the ink alpha is judged at the blend it paints", async ({ runSnap, scratch }) => {
  const report = await hoverReport(scratch, runSnap, "hover-alpha-fade", inkHover("0.9", "0.45"));
  expect(report.populationAccounting?.["hover-contrast"]).toMatchObject({ judged: 1, affected: 1 });
  expect(report.findings.find((finding) => finding.rule === "hover-contrast")?.value).toContain("3.36:1");
});

test("a hover rule that keeps the blend legible stays clean", async ({ runSnap, scratch }) => {
  const legible = await hoverReport(scratch, runSnap, "hover-alpha-legible", inkHover("0.9", "0.8"));
  expect(legible.populationAccounting?.["hover-contrast"]).toMatchObject({ judged: 1, affected: 0 });
  expect(legible.findings.filter((finding) => finding.rule === "hover-contrast")).toEqual([]);
});
