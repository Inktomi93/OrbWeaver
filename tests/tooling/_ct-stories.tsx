// Story module for the tooling-tier CTs (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// These stages exist for design-audit-walker.ct.tsx, which runs the REAL in-page fact walker
// (scripts/probes/design-audit-walker.ts) over them: the walker is a raw JS string evaluated in a page,
// so a browser is the only tier that can prove its hit-area arithmetic at all.
// Imports go through the SAME `@orb/ui/*` aliases the CT providers use — a relative path into
// packages/ui would resolve a second module instance and mount blank.

import { Slider } from "@orb/ui/slider";
import type { ReactElement } from "react";

/** The composite stage: ONE control (a Base UI Slider) whose pointer target is the whole `h-control-sm`
 *  row, while the outward hit probe lands on `[data-slot=slider-indicator]` — a SIBLING of the thumb. The
 *  host is a fixed width so the row's geometry is the production one, not a content-sized shrink. */
export function WalkerSliderCompositeStory(): ReactElement {
  return (
    <div style={{ width: 320, padding: 24 }}>
      <Slider aria-label="Composite slider" defaultValue={50} />
    </div>
  );
}

/** The LOCATABILITY stage: two elements carrying the SAME `data-slot` — the shape every shadcn-style
 *  primitive produces (`data-slot` names a component KIND, not an identity, and a real surface renders
 *  dozens of `[data-slot=text]`). A finding that reports only the slot names all of them and locates none. */
export function WalkerDuplicateSlotStory(): ReactElement {
  return (
    <div data-testid="slot-stage" style={{ padding: 24, width: 320 }}>
      <section>
        <span data-slot="text">left copy</span>
      </section>
      <section>
        <span data-slot="text">right copy</span>
      </section>
    </div>
  );
}

/** The RATIFIED KICKER stage: the micro-caps section-label voice (tokens `text.micro` + `tracking.micro`
 *  0.08em + weight 600 + caps, density spec §2.3) authored two ways — `text-transform: uppercase`, and
 *  LITERAL uppercase characters, which render identically. Below them, the genuine defect the tracking rule
 *  exists for: sentence-case running text at the same 0.08em. */
export function WalkerCapsTrackingStory(): ReactElement {
  const kicker = { fontSize: 10.5, letterSpacing: "0.08em", fontWeight: 600 } as const;
  return (
    <div style={{ padding: 24, width: 480 }}>
      <span data-testid="kicker-transformed" style={{ ...kicker, textTransform: "uppercase" }}>
        Pick up where you left off
      </span>
      <span data-testid="kicker-literal" style={kicker}>
        PICK UP WHERE YOU LEFT OFF
      </span>
      <p data-testid="tracked-prose" style={{ fontSize: 15, letterSpacing: "0.08em" }}>
        This is ordinary running prose set with label tracking, which is exactly the defect the rule exists to catch.
      </p>
    </div>
  );
}

/** The DIMMED-TEXT stage: text whose own `color` clears WCAG comfortably against the stage backdrop, painted
 *  inside a group at `opacity: 0.6`. CSS opacity composites the whole subtree over what is behind it, so the
 *  pixels the eye reads are the blend — the live home surface's two "waiting on:" lines measured 3.68:1 that
 *  way while the audit reported nothing. Colors are authored in `rgb()` on purpose: this stage must isolate the
 *  OPACITY blind spot from the separate color-space one. The control line is the same color at full opacity. */
export function WalkerDimmedContrastStory(): ReactElement {
  return (
    <div style={{ backgroundColor: "rgb(16, 16, 20)", padding: 24, width: 480 }}>
      <div style={{ opacity: 0.6 }}>
        <p data-testid="dimmed-line" style={{ color: "rgb(180, 180, 185)", fontSize: 14 }}>
          waiting on: the reply that never comes
        </p>
      </div>
      <p data-testid="undimmed-line" style={{ color: "rgb(180, 180, 185)", fontSize: 14 }}>
        this line is painted at full opacity and reads exactly as its color says
      </p>
    </div>
  );
}

/** The TRANSLUCENT-TINT stage: the shape a selected chat list row wears — a low-alpha chromatic tint over an
 *  opaque dark base. Taking that tint's own rgb as the backdrop (alpha discarded) measures the text against a
 *  saturated orange nothing on screen is painted: the live chat room reported 1.14:1 plus a gray-on-color
 *  finding, both fiction. The text here is comfortably legible against the REAL composite, so any color finding
 *  on this line is a defect in the instrument. Authored in `rgba()` at 0.15 so the arithmetic is what is under
 *  test: it clears the old "alpha > 0.1 means opaque" gate the way the live oklab tint did. */
export function WalkerTranslucentTintStory(): ReactElement {
  return (
    <div style={{ backgroundColor: "rgb(18, 18, 22)", padding: 24, width: 480 }}>
      <div style={{ backgroundColor: "rgba(230, 120, 40, 0.15)", padding: 12 }}>
        <p data-testid="tinted-row-subtitle" style={{ color: "rgb(215, 215, 220)", fontSize: 14 }}>
          the last thing anyone said in this conversation
        </p>
      </div>
    </div>
  );
}

/** The ACCENT-BORDER stage: the live home resume card's shape — a rounded panel wearing one thick chromatic
 *  edge. The primary card authors that edge in `oklch()` (the only spelling this tokens-only codebase can
 *  produce), the twin authors the identical edge in `rgb()`; both must fire, and both tells (`side-tab` for the
 *  edge, `border-accent-on-rounded` for the edge fighting the radius) belong to each. The neutral card is the
 *  control: a hairline achromatic border on the same radius is the house elevation recipe, never a finding. */
export function WalkerAccentBorderStory(): ReactElement {
  const card = {
    backgroundColor: "rgb(24, 24, 28)",
    borderRadius: 10,
    color: "rgb(240, 240, 240)",
    marginBottom: 12,
    padding: 16,
    width: 320,
  } as const;
  return (
    <div style={{ padding: 24, width: 400 }}>
      <div data-testid="accent-card-oklch" style={{ ...card, border: "1px solid rgb(40, 40, 46)", borderLeft: "3px solid oklch(0.72 0.175 52)" }}>
        resume where you left off
      </div>
      <div data-testid="accent-card-rgb" style={{ ...card, border: "1px solid rgb(40, 40, 46)", borderLeft: "3px solid rgb(226, 122, 40)" }}>
        resume where you left off
      </div>
      <div data-testid="neutral-card" style={{ ...card, border: "1px solid rgb(40, 40, 46)" }}>
        an ordinary elevated panel
      </div>
    </div>
  );
}

/** The SCREEN-READER-ONLY stage: the app-wide `sr-only` posture the shell skip link wears, measured off the
 *  live surface (snap --eval, 2026-08-18) — `position:absolute; overflow:hidden; clip-path:inset(50%);
 *  white-space:nowrap`, where the 1px width loses to the control's own padding, so the box is 26x32 with
 *  clientWidth 24 and a nowrap scrollWidth of 70. That reads as a 46px text spill and a 26px tap target, and
 *  both minted P1 on EVERY surface (the shell renders the skip link everywhere), which is what made
 *  `--fail-on P1` unusable. Three arms carry the discriminator:
 *   - the two canonical hidden spellings, modern `clip-path` and legacy `clip`, which must go quiet;
 *   - the REVEALED arm (`focus-visible:not-sr-only` — clip-path:none, overflow:visible), which is an
 *     ordinary button and must still be judged;
 *   - visible controls with the same overflow and the same small box, which must still fire — the skip is a
 *     state test, not an exemption.
 *  The nameless hidden button is the fourth: a screen-reader-only control lives or dies by its name, so the
 *  a11y lens must keep seeing what the paint and geometry lenses drop.
 *
 *  ONE DELIBERATE DIVERGENCE FROM THE LIVE MEASUREMENT: the stubs carry 6px of horizontal padding, not the
 *  live control's 12px, so the box is 12x32 rather than 26x32. The live tap-target P1 was minted against the
 *  COARSE floor (32px) on a mobile-emulated audit; a CT page is a fine pointer, where the floor is 24px and a
 *  26px box clears it — so the faithful width would make the tap-target arm a fence that cannot fail, which
 *  is not a proof. The width is the only thing narrowed; the hidden STATE under test is byte-identical. */
export function WalkerScreenReaderOnlyStory(): ReactElement {
  const srOnly = {
    boxSizing: "border-box",
    height: 32,
    overflow: "hidden",
    padding: "0 6px",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  } as const;
  return (
    <div style={{ padding: 24, position: "relative", width: 400 }}>
      <button data-testid="sr-skip-modern" style={{ ...srOnly, clipPath: "inset(50%)", top: 0 }} type="button">
        Skip to content
      </button>
      <button data-testid="sr-skip-legacy" style={{ ...srOnly, clip: "rect(0px, 0px, 0px, 0px)", top: 40 }} type="button">
        Skip to content
      </button>
      <button data-testid="sr-nameless" style={{ ...srOnly, clipPath: "inset(50%)", top: 80 }} type="button" />
      <div data-testid="sr-live-region" style={{ clipPath: "inset(50%)", height: 20, overflow: "hidden", position: "absolute", top: 120, width: 1 }}>
        <div data-testid="sr-nested-line" style={{ whiteSpace: "nowrap" }}>
          saved three minutes ago
        </div>
      </div>
      {/* The shell shape: the skip link's box sits UNDER the surface's own painted content, so a pointer at
          its centre reaches that content, never the link. Without a cover the walker's composite probe
          credits a lone control with its wrapper's extent (its own declared limit) and the sub-target
          reading never appears — the stage would be a fence that cannot fail. */}
      <div style={{ backgroundColor: "rgb(18, 18, 22)", height: 150, insetInlineStart: 0, position: "absolute", top: 0, width: 400, zIndex: 1 }}>
        <button data-testid="visible-subtarget" style={{ height: 20, marginTop: 60, width: 20 }} type="button">
          x
        </button>
      </div>
      <button
        data-testid="revealed-skip"
        style={{
          boxSizing: "border-box",
          clipPath: "none",
          height: 32,
          overflow: "visible",
          padding: "0 12px",
          position: "absolute",
          top: 160,
          whiteSpace: "nowrap",
          width: 60,
        }}
        type="button"
      >
        Skip to content
      </button>
      <div data-testid="visible-overflow" style={{ marginTop: 200, overflow: "hidden", whiteSpace: "nowrap", width: 60 }}>
        the reply that never came
      </div>
    </div>
  );
}

/** The control stage: two GENUINE neighbours — separate small buttons sharing a row. The widened
 *  ownership rule must NOT credit either one with the other's space; both stay sub-target. */
export function WalkerNeighbourButtonsStory(): ReactElement {
  return (
    <div style={{ display: "flex", gap: 4, padding: 24, width: 320 }}>
      <button data-testid="neighbour-a" style={{ height: 20, width: 20 }} type="button">
        A
      </button>
      <button data-testid="neighbour-b" style={{ height: 20, width: 20 }} type="button">
        B
      </button>
    </div>
  );
}
