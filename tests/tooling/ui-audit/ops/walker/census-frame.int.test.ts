// THE VIEWPORT-FRAME REFUSAL, both directions, through the real CLI (lane cb-audit-viewport, 2026-09-20).
//
// MIRRORS `ops/walker/census-frame.ts` (the measurement) and `lib/evidence-viewport-frame.ts` (the
// refusal). Both of those carry the full incident; what this file pins is the behaviour a reader sees.
//
// WHAT WAS BROKEN. `snap --file <connections mock> --design-audit --mobile`
// emitted 24 P1 `text-overflow` rows and exited 1 — a confident verdict — while the identical document
// at `--viewport 1400x1000` emitted zero and exited 0. The page had been crushed: its boards declare
// `width: 870px` and rendered at 382px/469px because they are flex items. Nothing mismeasured; the rows
// were true of a layout the author never authored, and the transcript said nothing about it. Across one
// review of that mock set, 48 of 93 findings were retracted as drawing artifacts — and the cost of that
// is CALIBRATION, not noise: a reviewer who learns to discount this instrument's P1s discounts a real one.
//
// WHY THIS TIER. The measurement lives inside COLLECT_SAMPLES_JS — a hand-written JS string evaluated in
// a real browser — so nothing below the CLI can reach it, and the refusal's whole point is what the
// TRANSCRIPT says. The fixtures are therefore documents with a known frame either side of the tolerance.
//
// THE POSITIVE CONTROL IN THE OTHER DIRECTION IS THE LOAD-BEARING ONE (third test): a real overflow on a
// page that FITS must still be reported at full severity. A refusal that also swallowed genuine findings
// would have traded a false positive for a false clean, which is the trade this repair exists to refuse.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, RELATIONAL_CLI_TIMEOUT_MS } from "../../../../support/ui-audit-relational.ts";

/** The refusal's own headline, as `_shared/evidence.ts` renders an EvidenceGap. */
const FRAME_REFUSAL = "the page's frame against the viewport it was judged at is ABSENT — this run is not a verdict";

/** DELIBERATELY NOT `relationalDocument` — that helper wraps its body in a `<main>`, and a wrapper
 *  inherits its child's overflow, so it would become the outermost carrier and hide the box under test.
 *  Here the only ancestor is `<body>`, which census-frame.ts excludes by name (it restates the headline
 *  rather than locating it), which makes the authored box itself the carrier the refusal must print. */
function frameDocument(body: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>viewport frame</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui">${body}</body></html>`;
}

/** A box wider than any viewport this suite uses, declared in px so the crush is unambiguous, with a
 *  spilling descendant inside it. The descendant is what proves ONE CAUSE PER ROW: it reports the same
 *  overflow its parent does, and a naive worst-first list would spend the reader's attention on both. */
function wideBoard(widthPx: number): string {
  return `<div id="board" style="width:${String(widthPx)}px;background:#222;padding:8px">
    <span id="inner" style="display:block;width:${String(widthPx - 20)}px">a board the author declared ${String(widthPx)} pixels wide</span>
  </div>
  <p id="prose" style="width:400px;white-space:nowrap">a line of prose whose single unbreakable run is very much wider than the four hundred pixels its own box was given</p>`;
}

test("a document wider than its viewport refuses the run and NAMES the box that does not fit", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "frame-crushed.html"), frameDocument(wideBoard(1200)));
  const res = await runCli("snap", ["--file", join(scratch, "frame-crushed.html"), "--viewport", "600x800", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  expect(res.stdout, "the run must announce that it has no geometry verdict, at the head of the transcript").toContain(FRAME_REFUSAL);
  // THE NUMBERS, so a reader can tell a crushed frame from a 1px rounding without re-running.
  expect(res.stdout).toContain("the document lays out 1216px wide in a 600px viewport (616px over, tolerance 2px)");
  // AND THE CARRIER — the orchestrator's requirement on this arm (2026-09-20): "an exit 2 that says this
  // page overflows is a wall; one that says `p.lede` is 382 wide and 464 scroll is a finding someone can
  // act on in a minute". A refusal naming no element is the wall.
  // BOTH CARRIER SHAPES, because the repair differs: a box whose RECT is past the edge is re-sized or
  // re-flowed, a box whose CONTENT does not fit it wraps or truncates. One shape alone would leave half
  // the population unnamed, which is what makes this the difference between a finding and a wall.
  expect(res.stdout, "a box past the viewport edge must be located with its distance").toMatch(/#board — 616px past the viewport's right edge/u);
  expect(res.stdout, "a box whose own content does not fit it must be located with BOTH widths").toMatch(
    /#prose — clientWidth 400 vs scrollWidth \d{3,} \(\+\d+px\)/u,
  );
  // ONE CAUSE PER ROW. `#inner` spills exactly as its parent does and is NOT a second carrier: a reader
  // repairs the outermost box and the inner one goes with it, and a list spent on copies of one defect
  // is the wall this arm exists to avoid wearing a longer message.
  expect(res.stdout, "a descendant inheriting its parent's overflow is not an independent carrier").not.toContain("#inner —");
  // The remedy is computed from what was measured, not left to the reader to derive.
  expect(res.stdout).toContain("--viewport 1216x800");
  expect(res.stdout).toContain("design-audit=NO-VERDICT");
  await expect(res).toExitWith(2);
});

test("the same document at a viewport it fits is MEASURED — the refusal is a tripwire, not a tax", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "frame-fits.html"), frameDocument(wideBoard(1200)));
  const res = await runCli("snap", ["--file", join(scratch, "frame-fits.html"), "--viewport", "1400x800", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  // The negative control the doctrine owes: identical bytes, a viewport that holds them, no refusal.
  expect(res.stdout, "a page that fits its viewport must not be refused").not.toContain(FRAME_REFUSAL);
  expect(res.stdout).not.toContain("the document lays out");
  expect(res.stdout).toContain("design-audit=measured");
});

/** A REAL truncation with no affordance — `overflow: hidden` + `nowrap`, no ellipsis, no title/aria-label
 *  (either would be the recoverable truncation the walker silences by design, #825). It is CLIPPED, so it
 *  costs the document no width: the page fits its viewport and the overflow is entirely the box's own. */
const CLIPPED_SPILL = `<div id="spill" style="width:60px;overflow:hidden;white-space:nowrap">this label carries far more text than sixty pixels can ever show</div>`;

test("a real overflow on a page that FITS is still reported at full severity", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "frame-real-overflow.html"), frameDocument(CLIPPED_SPILL));
  const res = await runCli("snap", ["--file", join(scratch, "frame-real-overflow.html"), "--viewport", "1400x800", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  // The planted positive control: the defect this instrument exists to find is untouched by the repair.
  expect(res.stdout, "the frame arm must not swallow a genuine truncation").toMatch(/^P1\s+text-overflow\s+.*#spill/mu);
  expect(res.stdout, "and a page that fits owes no frame refusal, whatever its boxes do internally").not.toContain(FRAME_REFUSAL);
  expect(res.stdout).toContain("design-audit=measured");
  await expect(res).toExitWith(1);
});
