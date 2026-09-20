// THE VIEWPORT-FRAME REFUSAL — design-audit's sixth partial-verdict channel (lane cb-audit-viewport,
// 2026-09-20). Its own module rather than a tenth arm in lib/evidence.ts because that file sits four
// lines under Core-Tooling-Law's hard cap; the ladder it joins, and the ladder's ORDER, are owned by
// snap/ops/design-audit-walk.ts exactly as every other channel's are.
//
// THE DEFECT IT CLOSES. `snap --file docs/design/mocks/connections/model-roles.html --design-audit
// --mobile` emitted 24 P1 `text-overflow` rows and exited 1; the identical document at `--viewport
// 1400x1000` emitted zero and exited 0. A reviewer reading the first run has no way to tell that the
// page was crushed: the mock's boards declare `width: 870px` and rendered at 382px/469px because they
// are flex items, so 22 of those rows described a layout the author never authored and the other 2 were
// the page's own prose carrying an unbreakable source path. Across one review of the same mock set, 48
// of 93 findings were retracted as drawing artifacts. THE DANGER IS NOT NOISE, IT IS CALIBRATION: a
// reviewer who learns to discount this instrument's P1s will discount a real one, and one of those 93
// was a genuine P0-shaped defect. The full measurement record is ops/walker/census-frame.ts's header.
//
// WHY A REFUSAL AND NOT A RULE REPAIR. Nothing was mismeasuring — every spill is a true read of the
// pixels that were on the screen. Softening the spill test would have DELETED a real narrow-viewport
// overflow to silence a crushed-frame artifact, which is the wrong trade in both directions. The honest
// claim is one the rules cannot make on their own: this document did not fit the width it was laid out
// at, so every geometry verdict below describes a compressed layout rather than the design.
//
// WHY THE FINDINGS STILL PRINT. This is a PARTIAL-verdict gap, the `censusCapGap` shape, not a terminal
// one: colour, type-face and name verdicts are untouched by compression, and a real overflow at a narrow
// viewport is a real finding. The run keeps its tables, loses its VERDICT (exit 2), and gains a named
// cause at the head of the transcript. That is what lets a reader discount THIS RUN instead of the
// instrument.
//
// PROVENANCE-BLIND BY RULING (orchestrator, 2026-09-20). The arm does not ask whether the subject is a
// `--file` mock or an app origin: a horizontally-overflowing app page makes every geometry verdict
// describe a compressed layout exactly as a mock does, and `snap --expect-no-overflow` already classes
// that state as a defect. Fencing to `file://` would give mocks honest refusals and the app confidently
// wrong answers — backwards, since the app is where a wrong verdict costs more.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { RawSamples } from "../contract/samples.ts";
import type { DocumentFrameCarrier } from "../contract/samples-evidence.ts";

/** One carrier as a reader repairs it: WHERE it is, how wide its box is, and how wide its content is.
 *  The orchestrator's requirement on this arm, in one line — "an exit 2 that says this page overflows is
 *  a wall; one that says `p.lede` is 382 wide and 464 scroll is a finding someone can act on in a
 *  minute". Both measures print because a carrier can be either shape and the repair differs: content
 *  that does not fit its box wraps or truncates, a box past the viewport edge is re-sized or re-flowed. */
function carrierLine(carrier: DocumentFrameCarrier): string {
  const spill =
    carrier.spillPx > 0 ? `clientWidth ${String(carrier.clientWidth)} vs scrollWidth ${String(carrier.scrollWidth)} (+${String(carrier.spillPx)}px)` : "";
  const past = carrier.pastViewportPx > 0 ? `${String(carrier.pastViewportPx)}px past the viewport's right edge` : "";
  return `${carrier.selector} — ${[spill, past].filter((part) => part !== "").join(", ")}`;
}

/** Null when the page fits the width it was judged at, which is every honest run — the refusal is a
 *  tripwire, not a tax. HORIZONTAL ONLY: pages scroll down by design, and a content-height test would
 *  make almost every audit a NO VERDICT and teach a reader to ignore the line (census-frame.ts's
 *  header carries that ruling and the separate fold defect the tall-page symptom actually belonged to). */
export function viewportFrameGap(samples: RawSamples): EvidenceGap | null {
  const frame = samples.documentFrame;
  const overflow = frame.contentWidth - frame.viewportWidth;
  if (overflow <= frame.tolerancePx) {
    return null;
  }
  const { total, worst } = frame.carriers;
  // A BOUNDED LIST MUST NEVER READ AS THE WHOLE POPULATION (#1038's discipline, one family down), and a
  // named-zero is its own statement: the document is wider than its viewport and no element owned it,
  // which is a fact about this walk rather than a clean answer the reader should infer.
  const located =
    worst.length === 0
      ? "no element owned the excess — the walk found no unscrollable box spilling its content or reaching past the edge, so the cause is the document's own layout"
      : `${worst.map(carrierLine).join("; ")}${total > worst.length ? `; … ${String(total - worst.length)} more carrier(s)` : ""}`;
  return {
    evidence: "the page's frame against the viewport it was judged at",
    detail: `the document lays out ${String(frame.contentWidth)}px wide in a ${String(frame.viewportWidth)}px viewport (${String(overflow)}px over, tolerance ${String(frame.tolerancePx)}px), so every geometry verdict below — text-overflow, clipped-overflow, truncated-to-nothing, tap-target, the placement-collision arms — describes a COMPRESSED layout rather than the design, and this run has NO VERDICT for them. The carriers, worst first: ${located}. Re-run at a viewport at least as wide as the page's own content (--viewport ${String(frame.contentWidth)}x${String(frame.viewportHeight)}) to judge the authored layout, or repair the carriers if the page is meant to fit this width`,
  };
}
