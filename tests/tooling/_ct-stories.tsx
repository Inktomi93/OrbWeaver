// Story module for the tooling-tier CTs (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// These stages exist for design-audit-walker.ct.tsx, which runs the REAL in-page fact walker
// (tooling/src/ui-audit/ops/walker.ts) over them: the walker is a raw JS string evaluated in a page,
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

/** The list-row contract uses a bordered row wrapper around the one actionable child. The wrapper is
 * deliberately a visual affordance for that button, not a second nested panel; a real decorated panel in
 * the same outer card proves the nested-card lens remains live. */
export function WalkerListRowCardStory(): ReactElement {
  const panel = { backgroundColor: "rgb(24, 24, 28)", border: "1px solid rgb(58, 58, 66)", borderRadius: 10, padding: 12 } as const;
  return (
    <div data-testid="outer-card" style={{ ...panel, width: 360 }}>
      <div data-slot="list-row-root" data-testid="list-row-wrapper" style={panel}>
        <button type="button">Open the sanctioned row</button>
      </div>
      <div data-testid="real-nested-card" style={{ ...panel, marginTop: 12 }}>
        A genuinely decorative card inside another card
      </div>
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

/** The PAINT-LAYER stage (issue #218): the shape the live chat transcript wears. An opaque near-black base,
 *  a FIXED contentless wallpaper layer painting over it (invisible to a DOM ancestor walk — it is a sibling,
 *  not an ancestor), and a 0.65-alpha reading plate on top. Walking the plate down to the base composites a
 *  color no pixel on screen has: the live surface reported 3.16:1 on 28 nodes whose real composite over the
 *  photo is 4.94:1. The plate line here must therefore get NO contrast verdict from the DOM walk alone —
 *  only the runner's pixel sample may judge it.
 *
 *  The opaque card is the control: its own base contains no paint layer, so it is still an ordinary
 *  css-resolved backdrop and its (genuinely poor) contrast must still fire. Without it the fix would be
 *  indistinguishable from muting the rule. */
export function WalkerPaintLayerStory(): ReactElement {
  return (
    <div style={{ backgroundColor: "rgb(15, 12, 10)", minHeight: 400, padding: 24, position: "relative", width: 520 }}>
      <div
        aria-hidden="true"
        style={{ backgroundImage: "linear-gradient(rgb(232, 226, 214), rgb(198, 190, 176))", inset: 0, pointerEvents: "none", position: "fixed" }}
      />
      <div style={{ backgroundColor: "rgba(24, 20, 16, 0.65)", padding: 16, position: "relative" }}>
        <p data-testid="plate-line" style={{ color: "rgb(86, 75, 59)", fontSize: 15 }}>
          the reading plate is translucent, so this line is painted over the wallpaper — not over the base beneath it
        </p>
      </div>
      <div style={{ backgroundColor: "rgb(24, 24, 28)", marginTop: 16, padding: 16, position: "relative" }}>
        <p data-testid="card-line" style={{ color: "rgb(74, 74, 80)", fontSize: 14 }}>
          this line sits on an opaque card with nothing painting over it, and reads about 2:1
        </p>
      </div>
    </div>
  );
}

/** The GRADIENT-BACKDROP stage (issue #189): the same color-space blindness that killed the border/contrast
 *  family, one layer down. A tokens-only tree authors every gradient stop as `oklch(...)`, and the stop
 *  scanner matched rgb()/hex only — so an oklch gradient yielded ZERO stops, the backdrop walk fell through
 *  to `image-indeterminate`, and every glyph over it minted a false P1 `text-over-art` against a gradient
 *  whose colors are fully known. Three arms carry the discriminator:
 *   - LEGIBLE oklch gradient: near-white text over a dark ramp must mint nothing;
 *   - ILLEGIBLE oklch gradient: light text over a light ramp must fail as a WORST-STOP ratio (P0), which is
 *     only reachable once the stops parse — an unparsed gradient reports the indeterminate P1 instead;
 *   - the rgb-authored twin of the legible arm, the control that was never blind. */
export function WalkerGradientBackdropStory(): ReactElement {
  const panel = { marginBottom: 12, padding: 16, width: 340 } as const;
  return (
    <div style={{ backgroundColor: "rgb(12, 12, 14)", padding: 24, width: 400 }}>
      <div style={{ ...panel, backgroundImage: "linear-gradient(oklch(0.19 0.02 260), oklch(0.26 0.03 260))" }}>
        <p data-testid="oklch-gradient-line" style={{ color: "rgb(240, 240, 245)", fontSize: 15 }}>
          near-white copy over a dark oklch ramp — legible against every stop
        </p>
      </div>
      <div style={{ ...panel, backgroundImage: "linear-gradient(oklch(0.93 0.04 95), oklch(0.88 0.06 95))" }}>
        <p data-testid="oklch-gradient-bled" style={{ color: "rgb(232, 232, 236)", fontSize: 15 }}>
          near-white copy over a near-white oklch ramp — the bled-over-art defect itself
        </p>
      </div>
      <div style={{ ...panel, backgroundImage: "linear-gradient(rgb(24, 24, 34), rgb(38, 38, 52))" }}>
        <p data-testid="rgb-gradient-line" style={{ color: "rgb(240, 240, 245)", fontSize: 15 }}>
          the rgb-authored twin of the legible ramp — the arm that always worked
        </p>
      </div>
    </div>
  );
}

/** The ARIA-HIDDEN VISUAL stage (issue #253). Every judged element sits inside one `aria-hidden="true"`
 *  subtree, and each carries a defect of a purely VISUAL kind — pixels a sighted user reads whether or not
 *  a screen reader announces them. The walker used to `continue` past this whole subtree, so three live
 *  findings vanished from a scan the day #230 correctly marked a facet preview aria-hidden, with no pixel
 *  changing. The last row is the OTHER half of the split: an aria-hidden control must still be invisible to
 *  the tap-target/name census, where the attribute genuinely decides the verdict. */
export function WalkerAriaHiddenVisualStory(): ReactElement {
  return (
    <div style={{ backgroundColor: "rgb(16, 16, 20)", padding: 24, width: 480 }}>
      <div aria-hidden="true">
        <p data-testid="hidden-low-contrast" style={{ color: "rgb(56, 56, 62)", fontSize: 15 }}>
          decorative copy set two shades off its own surface — unreadable, and still painted
        </p>
        <p data-testid="hidden-below-ramp" style={{ color: "rgb(240, 240, 245)", fontSize: 9 }}>
          nine pixels
        </p>
        <p data-testid="hidden-tracked-prose" style={{ color: "rgb(240, 240, 245)", fontSize: 15, letterSpacing: "0.08em" }}>
          This is ordinary running prose set with label tracking, which is exactly the defect the rule exists to catch.
        </p>
        {/* 10.5px is `text.micro` exactly — ON the ramp, so the ramp arm passes it through and the
            INTERACTIVE floor is the arm that judges it. It is also the live size the facet preview
            renders at, which is the finding #253 watched disappear. */}
        <button data-testid="hidden-small-control" style={{ fontSize: 10.5 }} type="button">
          Apply
        </button>
      </div>
      <p data-testid="shown-legible-line" style={{ color: "rgb(240, 240, 245)", fontSize: 15 }}>
        an announced line at a legible size and contrast — the control that must stay clean
      </p>
    </div>
  );
}

/** The DUAL-HOME stage (issue #252, runtime half). Three arms:
 *   - the DEFECT: one action ("New chat") offered from three unrelated places on one plane — a hero CTA, a
 *     rail button, and a topbar glyph. All three are one verb behind one shared handler, which is exactly
 *     what makes the static call-site census blind to it;
 *   - the PER-DATUM control: a list whose every row offers its own "Open" — twelve rows are twelve chats,
 *     not twelve doors, and flagging them would make the lens a false-positive factory;
 *   - the DISAMBIGUATED control: two buttons that share a role but not a name. */
export function WalkerDuplicateDoorStory(): ReactElement {
  const rows = ["Rust lecture", "Harbour watch", "The long road"];
  return (
    <div style={{ backgroundColor: "rgb(16, 16, 20)", color: "rgb(240, 240, 245)", padding: 24, width: 520 }}>
      <section data-slot="hero">
        <button className="hero-cta" style={{ fontSize: 15, padding: 8 }} type="button">
          New chat
        </button>
      </section>
      <nav data-slot="rail" style={{ marginTop: 16 }}>
        <button className="rail-button" style={{ fontSize: 15, padding: 8 }} type="button">
          new chat
        </button>
      </nav>
      <header data-slot="topbar" style={{ marginTop: 16 }}>
        <button aria-label="New chat…" className="topbar-glyph" style={{ fontSize: 15, padding: 8 }} type="button">
          +
        </button>
        <button className="topbar-glyph" style={{ fontSize: 15, padding: 8 }} type="button">
          Import a card
        </button>
      </header>
      <ul data-slot="chat-list" style={{ marginTop: 16 }}>
        {rows.map((row) => (
          <li className="chat-row" key={row}>
            <span>{row}</span>
            <button className="row-open" style={{ fontSize: 15, padding: 8 }} type="button">
              Open
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The PROGRAMMATIC-FOCUS stage (issue #370). The nested generic wrappers are focus-management
 *  containers, not user actions: both carry tabindex=-1 and inherit the same descendant text. The two
 *  native buttons are the positive control — genuinely distinct homes for one named action must remain
 *  detectable when the wrappers leave only the action-door census. */
export function WalkerProgrammaticFocusDoorStory(): ReactElement {
  return (
    <div style={{ backgroundColor: "rgb(16, 16, 20)", color: "rgb(240, 240, 245)", padding: 24, width: 520 }}>
      <div data-testid="focus-wrapper-outer" tabIndex={-1}>
        <div data-testid="focus-wrapper-inner" tabIndex={-1}>
          Programmatic focus target
        </div>
      </div>
      <section data-slot="primary-actions" style={{ marginTop: 16 }}>
        <button data-testid="duplicate-action-primary" type="button">
          Duplicate action
        </button>
      </section>
      <footer data-slot="secondary-actions" style={{ marginTop: 16 }}>
        <button data-testid="duplicate-action-secondary" type="button">
          Duplicate action
        </button>
      </footer>
    </div>
  );
}

/** The READING-MEASURE stage (issue #464). The boxes are sized in `ch` — the CSS unit for one `0`
 *  advance — so the walker's measured character width can be checked against a ground truth the browser
 *  itself computes, in whatever font the harness resolves. `measure-75ch` is the house's ratified
 *  `--reading-measure: 75ch`: the line-length rule filed it as "~86 chars" while it divided by a guessed
 *  `fontSize × 0.5`, i.e. the instrument indicted the measure the design system ratified. */
export function WalkerReadingMeasureStory(): ReactElement {
  const prose =
    "The narrator leans in and keeps talking, because a line-length rule needs more than eighty characters of running text before it will judge the measure at all.";
  return (
    <div style={{ padding: 16, backgroundColor: "rgb(16, 16, 20)", color: "rgb(240, 240, 245)", fontSize: 15 }}>
      <p data-testid="measure-75ch" style={{ width: "75ch" }}>
        {prose}
      </p>
      <p data-testid="measure-110ch" style={{ width: "110ch" }}>
        {prose}
      </p>
    </div>
  );
}

/** The NEGATIVE-OVERFLOW stage (issue #444), a reconstruction of the #439 frame both overflow
 *  instruments were blind to. `clip-dialog` is an overflow-hidden box whose footer is a `nowrap`
 *  `justify-end` row wider than the content box, so the FIRST button is pushed past the container's
 *  LEFT edge and cut — a negative overflow, which grows `scrollWidth` by exactly nothing.
 *
 *  `clip-dialog` is deliberately `overflow: auto`, NOT `hidden` — that is what the live new-chat dialog
 *  computes to (measured on :5173: auto on both axes, scroll delta 0), and it is the second half of the
 *  blindness: judging per AXIS instead of per SIDE exempts every scrolling surface, so the arm that was
 *  meant to catch #439 would have declined the very surface #439 lives on. Scrolling sanctions content
 *  past the RIGHT edge; there is no negative scroll offset, so the left spill is still a cut.
 *
 *  `healthy-dialog` is the paired no-false-positive control (and keeps the `overflow: hidden` arm live),
 *  carrying the three shapes a naive sweep reports and shouldn't: a scroll pane whose content (including
 *  a control) legitimately extends past its box, an `sr-only` stub, and an absolutely-positioned badge
 *  sitting inside the padding. */
export function WalkerClippedInflowControlStory(): ReactElement {
  const dialog = {
    position: "relative",
    width: 366,
    overflow: "hidden",
    padding: 24,
    boxSizing: "border-box",
    backgroundColor: "rgb(27, 27, 32)",
    color: "rgb(240, 240, 245)",
  } as const;
  const row = { display: "flex", flexWrap: "nowrap", justifyContent: "flex-end", gap: 8 } as const;
  const button = { flex: "0 0 auto", whiteSpace: "nowrap", height: 36 } as const;
  const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" } as const;
  return (
    <div style={{ width: 520, padding: 20, backgroundColor: "rgb(16, 16, 20)" }}>
      <div data-testid="clip-dialog" style={{ ...dialog, height: 220, overflow: "auto" }}>
        <p>Pick a character to start.</p>
        <div style={row}>
          <button data-testid="clip-blank" type="button" style={{ ...button, width: 120 }}>
            Blank chat
          </button>
          <button type="button" style={{ ...button, width: 238 }}>
            Start chat with 3 characters
          </button>
        </div>
      </div>
      <div data-testid="healthy-dialog" style={{ ...dialog, height: 300, marginTop: 20 }}>
        <a data-testid="healthy-sr-link" href="#main" style={srOnly}>
          Skip to content
        </a>
        <span data-testid="healthy-badge" style={{ position: "absolute", top: 4, right: 4 }}>
          3
        </span>
        {/* overflow-x hidden + overflow-y auto: one box that CLIPS on one axis and SCROLLS on the
            other, so the per-side law has something to be wrong about (right is judged, bottom is not). */}
        <div data-testid="healthy-scroller" style={{ height: 80, overflowX: "hidden", overflowY: "auto" }}>
          <div style={{ height: 320 }}>
            A pane whose content legitimately extends past its box.
            <button data-testid="healthy-scrolled" type="button" style={button}>
              Scrolled out of view
            </button>
          </div>
        </div>
        <div style={{ ...row, flexWrap: "wrap", marginTop: 12 }}>
          <button data-testid="healthy-blank" type="button" style={{ ...button, width: 120 }}>
            Blank chat
          </button>
          <button type="button" style={{ ...button, width: 238 }}>
            Start chat with 3 characters
          </button>
        </div>
      </div>
    </div>
  );
}
