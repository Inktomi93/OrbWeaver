// Story module for touch-floor.ct.tsx (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// The stages exist to reproduce the defect classes of the CT kit ITSELF — an ancestor-credit clause that
// made a box-carried control alone in a padded wrapper structurally un-failable (#662), and the same
// clause granting credit on the mere EXISTENCE of a pseudo rather than its measured reach (#2300) — plus
// the pseudo-carried shapes that clause legitimately serves. Imports go through the SAME `@orb/ui/*`
// aliases the CT providers use — a relative path into packages/ui would resolve a second module instance
// and mount blank.
//
// EVERY BUTTON STAGE PINS ITS `intent` EXPLICITLY. The default is `primary`, which stamps `data-cta` and
// paints the CTA gradient ring — so a stage written without an intent was silently measuring the RINGED
// arm while its name and comments claimed to be measuring the plain one. That is exactly the pair #1843
// was about, and both arms are now stages of their own.

import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

/** The BOX-CARRIED regression stage (#662): a plain, undersized, non-pseudo button ALONE in a huge, STATIC
 *  padded wrapper — no `after:`/`before:` classes, no min-height/min-width, so its floor is its own
 *  16x16 border box. Before the fix, `hitExtent`'s unconditional ancestor credit walked out to the
 *  wrapper at every probed step and measured 80 steps (the sweep's own ceiling) no matter how small the
 *  button's real box was. Isolated deliberately: a sibling within the reach would make the OLD code fail
 *  too, masking the defect. Inset from the left edge because `elementFromPoint` never resolves a
 *  negative viewport coordinate, so a control flush against x=0 would fail its own left probe at every
 *  radius regardless of the fix under test. */
export function TouchFloorBoxCarriedIsolatedStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <button data-testid="box-carried-isolated" style={{ display: "block", height: 16, marginInlineStart: 48, padding: 0, width: 16 }} type="button">
        x
      </button>
    </div>
  );
}

/** The PSEUDO-CARRIED companion: the ancestor-credit clause's MINTED purpose must still pass after both
 *  fixes. A glyph-sm Button's visible box is far under the coarse floor, and the floor is carried entirely
 *  by its overflowing `::before` (`TOUCH_TARGET_PSEUDO` — `before:size-touch-target`, `before:absolute`,
 *  centred), which has no DOM node of its own. `intent="ghost"` is the RINGLESS arm: nothing else claims a
 *  pseudo on this button, so it is the cleanest statement of "the hit area reaches the floor". Isolated
 *  and inset from x=0 for the same reasons as the box-carried stage above. */
export function TouchFloorPseudoCarriedIsolatedStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <div style={{ marginInlineStart: 48 }}>
        <Button aria-label="Regenerate" data-testid="pseudo-carried-isolated" intent="ghost" size="glyph-sm" />
      </div>
    </div>
  );
}

/** The #1843 REGRESSION GUARD — the same glyph at `intent="primary"`, i.e. wearing the CTA gradient ring.
 *  The ring is `[data-slot="button"][data-cta]::after` (globals.css): UNLAYERED, `inset: 0`,
 *  `pointer-events: none`. Before #1843 the hit area was an `::after` too, so the ring replaced it and the
 *  button had NO tap target beyond its 25px box; now the hit area is a `::before` and the two coexist.
 *  This stage is what makes that a permanent claim rather than a one-off measurement — and it is the arm
 *  the kit could not previously state, because with existence-only credit the ringed and ringless buttons
 *  reported the identical fabricated number. */
export function TouchFloorCtaGlyphIsolatedStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <div style={{ marginInlineStart: 48 }}>
        <Button aria-label="Regenerate" data-testid="cta-glyph-isolated" intent="primary" size="glyph-sm" />
      </div>
    </div>
  );
}

/** The #2300 NEGATIVE CONTROL — the PRE-#1843 `data-cta` glyph, rebuilt from the cascade that produced it,
 *  in the same isolated 400px stage as the positive arms.
 *
 *  It is a reconstruction rather than the old component because the old component no longer exists; what
 *  is reproduced is the CASCADE, which is the whole mechanism. `glyphBox` at 183e49714 spelled the hit
 *  area `after:absolute after:top-1/2 after:left-1/2 after:size-touch-target after:-translate-x-1/2
 *  after:-translate-y-1/2`, and the CTA ring claims the same `::after` from an UNLAYERED rule — so the
 *  ring wins for every property it declares (`inset`, `pointer-events`, `border`, `background`) while the
 *  utilities' `width`/`height`/`translate` SURVIVE. The two rules below are in that order for that reason.
 *
 *  The surviving size is why this control is not merely "a button with a decoration": its pseudo still
 *  resolves to a rect that reaches PAST the border box, so a geometry-only eligibility test would credit
 *  it. What disqualifies it is `pointer-events: none` — a mark no tap can land on carries no target — and
 *  this stage is the only thing that holds that clause down. Pre-fix, the kit measured 161x161 here (the
 *  wrapper's whole padded extent) for a control whose real target is its 25px box. */
export function TouchFloorPreFixCtaGlyphStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      {/* Inline styles cannot express a pseudo-element, and the whole shape under test IS the pseudo. */}
      <style>
        {".cbxh-prefix{position:relative;display:inline-flex;width:var(--spacing-glyph-sm);height:var(--spacing-glyph-sm);padding:0;border:0;background:var(--color-primary)}" +
          ".cbxh-prefix::after{content:'';position:absolute;top:50%;left:50%;width:var(--spacing-touch-target);height:var(--spacing-touch-target);translate:-50% -50%}" +
          ".cbxh-prefix::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;border:1px solid transparent;border-radius:inherit;" +
          "background:linear-gradient(transparent,transparent) padding-box,linear-gradient(180deg,oklch(from var(--color-primary) l c h / 0.55),oklch(from var(--color-sheen) l c h / 0.04)) border-box}"}
      </style>
      <div style={{ marginInlineStart: 48 }}>
        <button aria-label="Regenerate" className="cbxh-prefix" data-testid="pre-fix-cta-glyph" type="button" />
      </div>
    </div>
  );
}

/** The `inline` arm at `intent="primary"` — the OTHER arm whose hit area moved at #1843, and the one the
 *  hit-test pins never covered (#2301). Its visible box is text-height, its floor rides a full-width
 *  `::before` sized on `--spacing-touch-target`, and at this intent the CTA ring sits on the `::after`
 *  directly over it. Isolated in a padded wrapper on purpose: this is simultaneously the positive control
 *  for the ring-overlap case AND a stage where a fabricated wrapper credit would be indistinguishable from
 *  a real hit area unless the credit is measured. */
export function TouchFloorInlinePrimaryStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <div style={{ marginInlineStart: 48 }}>
        <Button data-testid="inline-primary" intent="primary" size="inline">
          Bruised knuckles
        </Button>
      </div>
    </div>
  );
}
