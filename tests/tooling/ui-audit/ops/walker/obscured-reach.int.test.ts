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
// docs/design/mocks/connections/editor.html --design-audit --viewport 1400x1000` exited 2 naming
// `span.fk centre=143,1000 rect=57,991..229,1009 hit-test-null`; the SAME file at `--viewport 1400x2400`
// exited 0 with `unaskable=0`. Nothing about the drawing changed — a taller viewport put a different
// element on the fold. Any page can draw that ticket, and a no-verdict nobody investigates is worse than
// a finding nobody reads.
//
// WHY THIS TIER. `elementFromPoint` is the compositor; there is no unit-testable surface for "the browser
// declines to answer at this coordinate", and the sub-pixel boundary is the whole mechanism.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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
