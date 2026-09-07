// Story module for contained-within.ct.tsx (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
//
// MIRRORS THE REAL NESTING regex-tier-row.tsx uses (`Row className="min-w-0"` wrapping a
// `Text className="truncate"`), because the two toggles land on DIFFERENT elements there and stay
// independently governable regressions only in that shape — collapsing both onto one node would let one
// toggle silently paper over the other:
//
//   • the SUBJECT is a flex `min-width` row (`data-testid="containment-subject"`), matching the real
//     `Row.min-w-0`. Removing its `minWidth: 0` is the `min-w-0`-removed regression: the row's own box then
//     refuses to shrink below its child's content size and GROWS past the wrapper — caught via
//     `getBoundingClientRect().width`.
//   • its CHILD span carries the `truncate` triad (`overflow: hidden; text-overflow: ellipsis; white-space:
//     nowrap`). Removing it is the `truncate`-removed regression: the row's own box stays clamped (its
//     `min-width: 0` is untouched), but the un-clipped child now overflows the row's own box WITHOUT being
//     clipped — invisible to `getBoundingClientRect()` (the row's rendered box does not grow) and visible
//     only through `scrollWidth`, which reports the row's real "ink overflow" regardless of the `overflow`
//     property on the row itself.
//
// `white-space: nowrap` is held CONSTANT (not part of the `truncate` toggle) so the `truncate: false` arm
// isolates the ONE thing under test — `overflow`/`text-overflow` — from line-wrapping: the probe text
// contains HYPHENS, which are legitimate soft-wrap points under `white-space: normal` (proven live —
// toggling `whiteSpace` to `normal` wrapped this exact string across several ~190px lines instead of
// overflowing, which would have silently passed the `truncate: false` regression this fixture exists to
// fail). The real `truncate` utility bundles `white-space: nowrap` in with the clip/ellipsis pair; this
// fixture keeps nowrap fixed and toggles only the clip half, so a wrap can never stand in for an overflow.

import type { ReactElement } from "react";

/** Long enough to overflow every wrapper this fixture mounts at, at the CT harness's real font metrics
 *  (measured: ~475px rendered, comfortably past the 200px wrapper below). */
export const LONG_UNBREAKABLE_WORD = "Grimdark GM voice long context table rules v3 unbreakable probe text repeated twice over for width";

export interface ContainmentSubjectStoryProps {
  /** The `min-w-0` half — applied to the ROW, exactly where the real regex-tier-row label carries it. */
  readonly minW0?: boolean;
  /** The `truncate` half — applied to the row's TEXT CHILD, exactly where the real label carries it. */
  readonly truncate?: boolean;
}

/** A neutral outer shell around every fixture, so the `data-testid` anchors below are always DESCENDANTS
 *  of the mounted root — the mount root itself carries no testid, and `component.getByTestId(...)` reads
 *  its subtree, never the root element it was called on. */
function Shell({ children }: { readonly children: ReactElement }): ReactElement {
  return <div>{children}</div>;
}

/** A 200px flex wrapper (mirroring the outer `justify="between"` Row a regex-tier-row label nests inside)
 *  holding one flex-item SUBJECT row, itself wrapping the truncating text child. */
export function ContainmentSubjectStory({ minW0 = true, truncate = true }: ContainmentSubjectStoryProps): ReactElement {
  return (
    <Shell>
      <div data-testid="containment-wrapper" style={{ display: "flex", width: 200 }}>
        <div data-testid="containment-subject" style={{ display: "flex", minWidth: minW0 ? 0 : undefined }}>
          <span
            style={{
              overflow: truncate ? "hidden" : "visible",
              textOverflow: truncate ? "ellipsis" : "clip",
              whiteSpace: "nowrap",
            }}
          >
            {LONG_UNBREAKABLE_WORD}
          </span>
        </div>
      </div>
    </Shell>
  );
}

/** The wrapper and the subject are SIBLINGS, not ancestor/descendant — the wrong-anchor shape the helper
 *  must refuse rather than silently measure. */
export function ContainmentNonAncestorStory(): ReactElement {
  return (
    <Shell>
      <div>
        <div data-testid="containment-decoy-wrapper" style={{ width: 200 }} />
        <div data-testid="containment-subject" style={{ display: "flex", minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{LONG_UNBREAKABLE_WORD}</span>
        </div>
      </div>
    </Shell>
  );
}
