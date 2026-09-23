// THE OBSCURED CENSUS'S REVEAL, both directions, through the real CLI (lane cb-audit-viewport, 2026-09-20).
//
// MIRRORS `ops/walker/census-collision.ts` — `askObscuredCentre` + `recenterObscuredCandidate`, whose
// headers carry the incident. What this file pins is the discrimination a reader depends on: an
// UNANSWERABLE-WHERE-IT-STANDS subject is revealed and measured; a genuinely unanswerable one still
// withholds.
//
// WHAT WAS BROKEN. The census re-centred a candidate whose centre was OUTSIDE the frame, but not one
// whose in-frame centre hit-tested NULL — and Chrome answers null from `innerHeight - 0.5` upward
// (measured: at a 1000px viewport, y=999.4 hits, y=999.5 is null) while `pointInFrame` admits anything
// below `innerHeight`. So a subject straddling the fold was counted unaskable, and because ANY withheld
// member withholds the whole tool verdict, one such subject turned the entire run into a NO VERDICT.
//
// IT WAS A LOTTERY, WHICH IS WHY IT HAD TO BE FIXED AND NOT DOCUMENTED. `snap --file
// <connections editor mock> --design-audit --viewport 1400x1000` exited 2 naming
// `span.fk centre=143,1000 rect=57,991..229,1009 hit-test-null`; the SAME file at `--viewport 1400x2400`
// exited 0 with `unaskable=0`. Nothing about the drawing changed — a taller viewport put a different
// element on the fold. Any page can draw that ticket, and a no-verdict nobody investigates is worse than
// a finding nobody reads.
//
// WHY THIS TIER. `elementFromPoint` is the compositor; there is no unit-testable surface for "the browser
// declines to answer at this coordinate", and the sub-pixel boundary is the whole mechanism.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

const VIEWPORT = "800x1000";

/** THE FOLD SUBJECT, placed by arithmetic rather than by luck: `top: 990px` + `height: 19px` puts its
 *  centre at y=999.5 in a 1000px viewport — inside `pointInFrame`, inside the null band. The page is
 *  3000px tall so the reveal has somewhere to scroll TO, and the fixture offers no interactive control,
 *  so nothing else in the walk moves the page before the obscured census reads it. */
const FOLD_SUBJECT = `<div style="height:3000px">
  <span id="fold" style="position:absolute;top:990px;left:40px;height:19px;background:#333">a label straddling the fold</span>
</div>`;

test("a subject on the viewport fold is revealed and MEASURED, not withheld", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "obscured-fold.html"), relationalDocument(FOLD_SUBJECT));
  const res = await runCli("snap", ["--file", join(scratch, "obscured-fold.html"), "--viewport", VIEWPORT, ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  // THE DEFECT PROOF. Before the repair this read `obscured-unaskable=1` and the run was a NO VERDICT.
  expect(res.stdout, "a fold subject is reachable by scrolling, so its verdict is owed").toContain("obscured-unaskable=0");
  expect(res.stdout, "and the run keeps its verdict, which is the whole cost of the defect").toContain("design-audit=measured");
  expect(res.stdout).not.toContain("produced no compositor verdict after re-centring");
});

/** THE CONTROL IN THE OTHER DIRECTION — a subject the reveal genuinely cannot make answerable.
 *  `position: fixed` is the discriminator doing the work: it is viewport-anchored, so `scrollIntoView`
 *  moves it nowhere, and it adds NO width to the document, so this fixture cannot accidentally trip the
 *  sibling viewport-frame refusal and let a second cause carry the assertion. Its centre-x sits at
 *  1500 in an 800px viewport and stays there. */
const UNREACHABLE_SUBJECT = `<span id="unreachable" style="position:fixed;left:0;top:200px;width:3000px;height:20px;background:#333">a label whose centre is off the frame wherever you scroll</span>`;

test("a subject the reveal cannot make answerable STILL withholds its verdict", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "obscured-unreachable.html"), relationalDocument(UNREACHABLE_SUBJECT));
  const res = await runCli("snap", ["--file", join(scratch, "obscured-unreachable.html"), "--viewport", VIEWPORT, ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  // #797 SURVIVES — ITS INPUT CHANGED. The repair stopped counting "we asked in the wrong place" as
  // "we asked and got nothing"; it did not weaken the refusal, and a fix that silenced this row would
  // have traded a false no-verdict for a false clean.
  expect(res.stdout, "a centre that is off the frame wherever you scroll is still unaskable").toContain("obscured-unaskable=1");
  expect(res.stdout).toContain("produced no compositor verdict after re-centring");
  expect(res.stdout, "and the subject is NAMED with its reason, never a bare count").toMatch(/#unreachable centre=.* centre-outside-frame/u);
  expect(res.stdout).toContain("design-audit=NO-VERDICT");
  await expect(res).toExitWith(2);
});

// ── THE CENSUS ITSELF (moved here with its subject at #2491, from census-collision.int.test.ts) ──
//
// The four arms below were authored against `ops/walker/census-collision.ts` while the obscured census
// still lived inside it. The census moved to `ops/walker/obscured-reach.ts`; these moved WITH it, because
// a spec whose name resolves to a file that is not its subject is exactly the lie `test-layout`'s own
// DECLARED CAPABILITY LIMIT (#2264) says that gate cannot catch.

test("obscured targets scan past the old cap and retain a later distinct collision decision", async ({ runCli, scratch }) => {
  const collision = (
    home: string,
    loser: string,
    winner: string,
    text: string,
  ): string => `<div data-slot="${home}" style="position:relative;width:180px;height:24px">
  <span data-slot="${loser}" style="position:absolute;left:0;top:0;width:48px;height:20px;background:#333">${text}</span>
  <button data-slot="${winner}" style="position:absolute;left:12px;top:0;width:80px;height:20px">Go</button>
</div>`;
  const repeated = Array.from({ length: 23 }, () => collision("cast-row", "rule-count", "start", "2 rules")).join("");
  const distinct = collision("archive-row", "archive-label", "delete", "Archive");
  await writeFile(join(scratch, "obscured-populations.html"), relationalDocument(`${repeated}${distinct}`));
  const auditRun = await runCli("snap", ["--file", join(scratch, "obscured-populations.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(auditRun.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.findings.filter(({ rule }) => rule === "obscured-target")).toHaveLength(2);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({
    affected: 24,
    populations: 2,
    emitted: 6,
    withheld: { cap: 18 },
  });
});

test("obscured withholding names the exact partially visible subject and centre", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-unaskable.html"),
    relationalDocument('<p data-slot="edge-copy" style="position:fixed;left:-80px;top:20px;width:100px;height:24px">Edge copy</p>'),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-unaskable.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(2);
  expect(report.obscuredUnaskable).toEqual([
    expect.objectContaining({
      selector: expect.stringContaining("data-slot=edge-copy"),
      reason: "centre-outside-frame",
      centre: expect.objectContaining({ x: -30 }),
    }),
  ]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 0, withheld: { unaskable: 1 } });
});

test("obscured census recentres a partially visible subject before judging its centre", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-recentred.html"),
    relationalDocument(
      '<div style="height:220px"></div><button data-slot="bottom-action" style="display:block;width:160px;height:80px">Bottom action</button>',
    ),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-recentred.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(0);
  expect(report.obscuredRecentred).toBe(1);
  expect(report.obscuredUnaskable).toEqual([]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 1, withheld: { unaskable: 0 } });
});

test("obscured census keeps a null compositor answer withheld after the centre is in frame", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-hit-test-null.html"),
    relationalDocument(`<span data-slot="null-hit" style="display:block;width:120px;height:40px">Null answer</span>
<script>Object.defineProperty(document, "elementFromPoint", { value: function () { return null; } });</script>`),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-hit-test-null.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(2);
  expect(report.obscuredUnaskable).toEqual([expect.objectContaining({ selector: expect.stringContaining("data-slot=null-hit"), reason: "hit-test-null" })]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 0, withheld: { unaskable: 1 } });
});
