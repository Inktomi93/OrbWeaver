// Story module for the tooling-tier CTs (Spine-Testing §7 — a CT mounts ONLY from a non-test module).
// These stages exist for design-audit-walker.ct.tsx, which runs the REAL in-page fact walker
// (tooling/src/ui-audit/ops/walker.ts) over them: the walker is a raw JS string evaluated in a page,
// so a browser is the only tier that can prove its hit-area arithmetic at all.
// Imports go through the SAME `@orb/ui/*` aliases the CT providers use — a relative path into
// packages/ui would resolve a second module instance and mount blank.

import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Slider } from "@orb/ui/slider";
import type { ReactElement } from "react";
import { useId } from "react";

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

/** The RATIFIED SELECTION-ACCENT stage (owner ruling 2026-08-22, issue #485). The `@orb/ui` ListRow paints
 *  its selected state as a 2px left ember bar on a rounded row — the textbook shape of BOTH §6 accent-border
 *  bans, and the selection idiom of every list in the app, so design-audit exempts it. The exemption's
 *  predicate is two-halved, and this stage is the shape that proves neither half can be dropped:
 *   - the two RATIFIED arms — the primitive's own carriers, selected: `list-row-body` (the default `rowTint`)
 *     and `list-row-root` (the whole-row arm) — must go quiet;
 *   - the UNSELECTED row, same slot, same hardcoded accent, must still fire: the ruling is about the
 *     SELECTION state, not about a licence for list rows to wear accent edges;
 *   - the SELECTED-but-not-a-ListRow box must still fire: `data-selected` alone is not the idiom;
 *   - and a plain rounded card with the same edge keeps firing, which is the rule's real target.
 *  The edge is authored in `oklch()` because that is the only spelling a tokens-only tree can produce. */
export function WalkerListRowSelectionStory(): ReactElement {
  const row = {
    backgroundColor: "rgb(24, 24, 28)",
    borderRadius: 8,
    borderLeft: "2px solid oklch(0.72 0.175 52)",
    color: "rgb(240, 240, 240)",
    marginBottom: 8,
    padding: 12,
    width: 320,
  } as const;
  return (
    <div style={{ padding: 24, width: 400 }}>
      <div data-selected="" data-slot="list-row-body" data-testid="ratified-selected-body" style={row}>
        the selected preset
      </div>
      <div data-selected="" data-slot="list-row-root" data-testid="ratified-selected-root" style={row}>
        the selected chat
      </div>
      <div data-slot="list-row-body" data-testid="unselected-row-accent" style={row}>
        an unselected row wearing a hardcoded accent
      </div>
      <div data-selected="" data-testid="selected-not-a-list-row" style={row}>
        a selected something-else
      </div>
      <div data-testid="plain-accent-card" style={row}>
        an ordinary rounded card with an accent edge
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

/** The BOX-CARRIED regression stage (#662/#665): a plain, undersized, non-pseudo button ALONE in a
 *  padded, STATIC wrapper — deliberately the shape the fix must close. It carries no touch-target
 *  ::after (no `after:` classes) and no min-height/min-width, so its floor is its own 16x16 border box.
 *  Before the fix, `ownsPoint`'s unconditional `hit.contains(el)` (and `sharedCompositeOwns`'s own
 *  static-wrapper credit) walked out to the wrapper at every probe radius and measured 44 regardless —
 *  structurally un-failable. The wrapper is deliberately huge (120px padding) and `position: static`
 *  (the default — no positioning context) so nothing but the plain-wrapper credit can rescue the number,
 *  and no sibling sits within the 22px probe band (an isolated control is exactly the #665 shape; a
 *  sibling nearby would make the OLD code fail too, masking the defect this fixture exists to prove).
 *  Inset from the left edge for the same reason the below-fold-extent stage is: `ownsPoint` refuses
 *  negative viewport coordinates, so a control flush against x=0 fails its own left probe at every radius
 *  regardless of the fix under test. */
export function WalkerBoxCarriedIsolatedControlStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <button data-testid="box-carried-isolated" style={{ display: "block", height: 16, marginInlineStart: 48, padding: 0, width: 16 }} type="button">
        x
      </button>
    </div>
  );
}

/** The PSEUDO-CARRIED companion (#662/#665): the ancestor-credit clause's MINTED purpose must still
 *  pass after the fix. A glyph-sm Button's visible box is far under the floor (packages/ui/src/primitives
 *  /button/variants.ts glyphBox — `size-glyph-sm`), and the floor is carried entirely by its overflowing
 *  `::after` (`after:size-touch-target`, `after:absolute`) — no DOM node of its own, so the outward probe
 *  legitimately falls through to the wrapper at the pseudo's clipped edge. Isolated (no sibling in the
 *  probe band) and inset from x=0 for the same reasons as the box-carried stage above — this stage is the
 *  one shape that MUST still measure the full floor once ancestor-credit is scoped to pseudo-carried
 *  controls only. */
/** The #807 stage — the Settings→Plugins capability row, rebuilt from its measured ring.
 *
 *  Live at `--mobile`, the capability control's four-cardinal `elementFromPoint` ring reads
 *  `["self", "other:p.font-sans", "self", "ANCESTOR:div.relative"]`: its own outward pseudo answers SELF
 *  on two sides, and the third belongs to a PARAGRAPH. `sharedCompositeOwns` still handed it the whole
 *  44x44 (the control is the row's only offered control), so design-audit published a target the row does
 *  not toggle. Both arms are in one mount so the contrast is a single measurement, not two runs:
 *
 *   · ISOLATED — the same glyph with nothing beside it. Its pseudo is the only thing at those pixels, so
 *     it keeps its full extent. Removing the ancestor credit must NOT touch this (it is #662/#665's
 *     surviving half).
 *   · ROW-WRAPPED — the same glyph with a prose column painted over its outward ring, exactly as the
 *     capability row does. Nothing forwards: no label, no toggle. Its extent must now CAP at the pixels
 *     it genuinely owns. */
export function WalkerRowWrappedGlyphStory(): ReactElement {
  return (
    <div style={{ padding: 60, width: 460 }}>
      <div style={{ marginBlockEnd: 80, marginInlineStart: 48 }}>
        <Button aria-label="Regenerate" data-testid="glyph-alone" size="glyph-sm" />
      </div>
      {/* The prose is ABSOLUTELY placed at a known offset and raised, so "which element owns x=+22 from
          the control's centre" is a fixed fact of this story rather than a flex-gap accident. */}
      <div data-testid="capability-row" style={{ display: "flex", position: "relative", width: 360 }}>
        <Button aria-label="Grant file access" data-testid="glyph-in-row" size="glyph-sm" />
        <p
          data-testid="capability-prose"
          style={{ fontSize: 15, insetBlock: 0, insetInlineEnd: 0, insetInlineStart: 30, margin: 0, position: "absolute", zIndex: 1 }}
        >
          reads and writes your files
        </p>
      </div>
    </div>
  );
}

export function WalkerPseudoCarriedIsolatedGlyphStory(): ReactElement {
  return (
    <div style={{ padding: 120, position: "static", width: 400 }}>
      <div style={{ marginInlineStart: 48 }}>
        <Button aria-label="Regenerate" data-testid="pseudo-carried-isolated" size="glyph-sm" />
      </div>
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

/** The VARIANT-ROW stage (issue #851) — the false-positive class the identical-path fingerprint could not
 *  see, reproduced from the live transcript at `--mobile`. Three message rows of ONE `<ol>`, each offering
 *  its own "More message actions"; two of them reach that button through `theme-scope` and one through
 *  `message-content-column`, exactly as the room does when one speaker carries a theme. The old rule read
 *  those two chains as two homes and minted a P3 on a plain per-row action — on desktop only the hovered
 *  row's cluster is offered, so it took a coarse pointer (where every row's cluster is permanent) to
 *  surface it, i.e. it was set to fire on every virtualized list at exactly the viewport where the
 *  duplicate-door and tap-target lenses matter most.
 *
 *  Two controls ride along so the exclusion cannot be a blanket:
 *   - ONE ACTION TWICE INSIDE ONE ROW: every row offers "Copy message" from both its header and its
 *     footer. Rows fold together; two homes INSIDE a row are still two homes, so this must still fire.
 *   - TWO GENUINE HOMES OUTSIDE THE LIST: a topbar and a footer "Pin this chat" — untouched by any list
 *     reasoning, and the proof that the fold did not simply disarm the rule. */
export function WalkerListRowDoorStory(): ReactElement {
  const rows = [
    { id: "vesper-1", speaker: "Vesper", themed: true },
    { id: "you-1", speaker: "You", themed: false },
    { id: "vesper-2", speaker: "Vesper", themed: true },
  ];
  return (
    <div style={{ backgroundColor: "rgb(16, 16, 20)", color: "rgb(240, 240, 245)", padding: 16, width: 430 }}>
      <header data-slot="topbar">
        <button className="topbar-glyph" style={{ fontSize: 15, padding: 6 }} type="button">
          Pin this chat
        </button>
      </header>
      <ol data-slot="message-list-viewport" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((row, index) => (
          <li data-index={index} data-slot="message-list-row" key={row.id}>
            <div data-slot={row.themed ? "theme-scope" : "message-content-column"}>
              <div data-slot="message-bubble">
                <div data-slot="message-name-row">
                  <span>{row.speaker}</span>
                  <div data-slot="message-actions-slot">
                    <div data-slot="message-actions-row">
                      <button className="row-copy" style={{ fontSize: 13, padding: 4 }} type="button">
                        Copy message
                      </button>
                      <button className="row-more" style={{ fontSize: 13, padding: 4 }} type="button">
                        More message actions
                      </button>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 15, margin: 0 }}>the row's prose</p>
                <div data-slot="message-footer-row">
                  <button className="row-copy-footer" style={{ fontSize: 13, padding: 4 }} type="button">
                    Copy message
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <footer data-slot="composer-tray" style={{ marginTop: 12 }}>
        <button className="tray-button" style={{ fontSize: 15, padding: 6 }} type="button">
          Pin this chat
        </button>
      </footer>
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
      {/* The boxes are sized in `ch`, so the BROWSER supplies the ground truth in whatever font resolves —
          and the two arms are the two ratified tokens: 47ch is `--reading-measure-prose`, 75ch is
          `--reading-measure` (the transcript's). The same 75ch box appears TWICE, once as teaching copy and
          once inside a message bubble, because after the #1145 split its verdict depends on which. */}
      <p data-testid="measure-47ch-prose" style={{ width: "47ch" }}>
        {prose}
      </p>
      <p data-testid="measure-75ch-prose" style={{ width: "75ch" }}>
        {prose}
      </p>
      <div data-slot="message-bubble" style={{ width: "75ch" }}>
        <p data-testid="measure-75ch-transcript">{prose}</p>
      </div>
      {/* The POPULATION half of #1183: a settings-row description is a `<Text as="span" voice="gloss">`,
          which is prose by the reading-surface law and invisible to a prose-TAG census. Its chrome twin
          (`voice="label"`, the name of a datum) is the control that the widening is not "everything". */}
      <span data-testid="measure-gloss-voice" data-voice="gloss" style={{ display: "block", width: "75ch" }}>
        {prose}
      </span>
      <span data-testid="measure-label-voice" data-voice="label" style={{ display: "block", width: "75ch" }}>
        {prose}
      </span>
    </div>
  );
}

/** THE PSEUDO-CARRIED PROMOTION stage (#1172). `promoted-layer-offset` walked ELEMENTS only, so when the
 *  shell panes moved their glass onto a `::before` fill layer (#1154) the whole cohort left the census
 *  silently — `candidates=1` became `candidates=0`, which reads exactly like a surface with nothing to
 *  judge. Three subjects, one per arm:
 *   - `pseudo-promoted` — an absolutely-positioned host on a HALF PIXEL whose `::before` carries the
 *     backdrop-filter. Its layer is real and its landing is derivable (host border box + the pseudo's own
 *     resolved inset), so it must be JUDGED and must fire.
 *   - `element-promoted` — the original arm, unchanged: the element carries the filter itself.
 *   - `pseudo-inflow` — a promotion on an IN-FLOW pseudo, whose box cannot be derived from the host's rect.
 *     It must be WITHHELD by name, never judged off the wrong box: a false measurement is the other half of
 *     the same lie the missing cohort was.
 *  Inline styles cannot express a pseudo-element, so the three rules ride a `<style>` tag (the
 *  `cb-hit-extent` precedent above). */
export function WalkerPseudoPromotionStory(): ReactElement {
  const css = [
    ".cbpp-host{position:absolute;top:10.5px;left:10.5px;width:200px;height:60px}",
    ".cbpp-host::before{content:'';position:absolute;inset:0;backdrop-filter:blur(4px)}",
    ".cbpp-inflow{position:relative;width:200px;height:40px}",
    ".cbpp-inflow::before{content:'x';display:block;backdrop-filter:blur(4px)}",
  ].join("");
  return (
    <div style={{ position: "relative", height: 260, backgroundColor: "rgb(16, 16, 20)", color: "rgb(240, 240, 245)" }}>
      <style>{css}</style>
      <div className="cbpp-host" data-testid="pseudo-promoted">
        carried by a pseudo
      </div>
      <div data-testid="element-promoted" style={{ position: "absolute", top: 120.5, left: 10.5, width: 200, height: 60, backdropFilter: "blur(4px)" }}>
        carried by the element
      </div>
      <div className="cbpp-inflow" data-testid="pseudo-inflow" style={{ marginTop: 200 }}>
        an in-flow pseudo
      </div>
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

/** The BELOW-THE-FOLD stage (issue #653) — the shape that made design-audit report a false clean.
 *
 *  Measured on the live surface that named the row (the chat "This chat" context tab at 430x932):
 *  `document.scrollingElement.scrollHeight === window.innerHeight` — there is NO document scroll — while
 *  the tab panel is an INNER scroller of clientHeight 515 over scrollHeight 2261, holding ~20 sized
 *  controls at top 1073..2374. Every one of them fell out of `tapTargets`, `actionDoors` AND
 *  `controlAspects` because the census required viewport intersection, and the run still printed
 *  `findings=0`. So the host here is an inner scroller, not a long document: a fix that drove
 *  `window.scrollTo` would pass a document-scroll stage and still be blind to the real one.
 *
 *  FOUR ARMS, and each one is load-bearing:
 *   - `below-fold-subtarget` — the DEFECT. 413x16 with no touch-target pseudo at all, the geometry of the
 *     rule row's "Recent activity" disclosure. It must FIRE now and could not have before.
 *   - `below-fold-healthy` — a 48x48 control at the same depth. It must stay SILENT while being present in
 *     the census, which is the difference between "looked at and fine" and "never looked at".
 *   - `below-fold-extent` — a 20x20 box whose hit area is a 52px `::after`. This one can ONLY pass if the
 *     control was genuinely IN THE VIEWPORT when `elementFromPoint` ran: the compositor probe is
 *     viewport-coordinate, so a fix that measured the box off-screen instead of scrolling to it would
 *     read 20px and mint a false sub-target. It is the fence against "recovering" the census by relaxing
 *     the PAINT-class rules.
 *   - `off-canvas-phantom` — a FIXED control parked past the right edge, which no scroll can reach (the
 *     2026-08-16 class: an off-canvas detail panel at x=431 on a 430px viewport supplied a whole census of
 *     failures nobody could touch). It must stay OUT of the census and be COUNTED as skipped, because a
 *     family that reports nothing owes its denominator.
 *
 *  The three in-scroller controls deliberately share ONE parent: `sharedCompositeOwns` credits a LONE
 *  control with its wrapper's extent, so a subtarget alone in a wrapper would be a fence that cannot fail. */
export function WalkerBelowTheFoldStory(): ReactElement {
  return (
    <div style={{ position: "relative", width: 460 }}>
      {/* A pointer-conditional touch-target pseudo, the shape @orb/ui Button's inline/glyph sizes carry
          (packages/ui/src/primitives/button/variants.ts). Inline styles cannot express `::after`, and the
          whole point of this arm is that the hit extent is NOT the border box. */}
      <style>{".cb-hit-extent{position:relative}.cb-hit-extent::after{content:'';position:absolute;inset:-16px}"}</style>
      {/* The host is nearly as tall as the CT viewport ON PURPOSE: the walker's viewport predicate does not
          model ancestor clipping, so a short host would put controls inside the viewport but outside the
          host's clip — a stage whose geometry is ambiguous proves nothing about the fix. */}
      <div data-testid="fold-scroll-host" style={{ height: 400, overflow: "auto", width: 460 }}>
        <div style={{ height: 1600 }}>
          <button data-testid="above-fold-control" style={{ height: 44, width: 120 }} type="button">
            In view already
          </button>
          <div style={{ paddingTop: 856 }}>
            {/* The bands are SIBLINGS, not the subtarget's own padding, and that is the whole stage: the hit
                probe credits a control with any point whose owner CONTAINS it, so a control floating in a
                padded/gapped wrapper is credited with the wrapper's pixels and measures 44 no matter how
                short it is. The live defect has the same shape — the 6px bands above and below the rule
                row's disclosure are not owned by it, which is why it really does fail the floor. */}
            <div data-testid="fold-band-above" style={{ height: 40, width: 413 }}>
              Nudge the pacing
            </div>
            <button data-testid="below-fold-subtarget" style={{ display: "block", height: 16, padding: 0, width: 413 }} type="button">
              Recent activity
            </button>
            <div data-testid="fold-band-below" style={{ height: 40, width: 413 }}>
              Runs on every message
            </div>
            <button data-testid="below-fold-healthy" style={{ display: "block", height: 48, width: 120 }} type="button">
              Run now
            </button>
            <div style={{ height: 24 }} />
            {/* Inset from the left edge deliberately: `ownsPoint` refuses NEGATIVE viewport coordinates, so a
                20px control flush against x=0 fails its own left probe at every radius and would measure 20
                whether or not the extent works — a fence that cannot fail. 48px clears the widest radius. */}
            <button
              className="cb-hit-extent"
              data-testid="below-fold-extent"
              style={{ display: "block", height: 20, marginInlineStart: 48, padding: 0, width: 20 }}
              type="button"
            >
              i
            </button>
          </div>
        </div>
      </div>
      {/* Fixed, so no ancestor scroll can bring it in: unreachable, not merely un-scrolled-to. */}
      <button data-testid="off-canvas-phantom" style={{ height: 20, insetInlineStart: "300vw", position: "fixed", top: 0, width: 20 }} type="button">
        p
      </button>
    </div>
  );
}

/** The VIEWPORT-EDGE stage (issue #797) — the phantom-P1 class that made design-audit's tap-target count
 *  untrustworthy for a whole UX review.
 *
 *  `document.elementFromPoint` is a VIEWPORT-COORDINATE api: off the edge of the screen it answers `null`,
 *  and the extent walk read null as "another element owns this pixel" rather than "I could not look". So a
 *  control straddling an edge lost every outward probe, collapsed to its bare border box, and minted a
 *  sub-target P1 — measured on Settings→Plugins, where the same page at `--viewport 1280x2200` produced
 *  p1=0 from an IDENTICAL element census and the ±21px four-cardinal ground truth showed the control
 *  owning a full 44×44.
 *
 *  Everything here is `position: fixed` on purpose: the CT page's own body margin and the mount root's
 *  offsets are not contractual, and a stage whose distance-to-the-edge is approximate proves nothing about
 *  an edge defect. Fixed coordinates are the viewport's own.
 *
 *  THREE ARMS:
 *   - `edge-recentrable` — an 18×18 box wearing a 44×44 pointer ring (`::after`, the @orb/ui glyph-button
 *     shape), parked at the BOTTOM edge of a scroll host the test scrolls it to. The host CAN scroll, so
 *     the fix must re-centre it and measure the real 44 — the arm that proves the fix measures rather than
 *     merely suppresses.
 *   - `edge-fixed-ring` — the same 44×44 ring on a FIXED control clipped by the bottom edge, where no
 *     scroll can produce a probe frame. It must never be reported as its 18×18 box; refusing is the only
 *     honest answer, and the refusal is counted (`censusReach.frameTruncated`).
 *   - `edge-real-subtarget` — a genuinely 18×18 control with no ring at all, mid-host with room to spare.
 *     It must still FIRE. Without it, "no phantom" and "the rule is dead" are the same receipt. */
export function WalkerViewportEdgeTargetStory(): ReactElement {
  return (
    <div>
      {/* A 58×58 pointer ring on an 18×18 box — comfortably past the 44px floor, and past the widest
          22px probe RADIUS with slack: an inset that puts the ring's edge exactly on the probe point is a
          hit-test boundary case, not a measurement. Inline styles cannot express `::after`, and the whole
          defect is that the hit area is NOT the border box. */}
      <style>{".cbtt-ring{position:relative}.cbtt-ring::after{content:'';position:absolute;inset:-20px}"}</style>
      {/* Fixed and exactly viewport-tall: the control's distance to the bottom edge is then a function of
          `scrollTop` alone, which the test sets. Inset from x=0 so only the VERTICAL edge is under test —
          `ownsPoint` refuses negative coordinates on both axes, and a stage failing for two reasons at
          once cannot attribute either. */}
      <div data-testid="cbtt-edge-host" style={{ height: "100vh", insetInlineStart: 60, overflow: "auto", position: "fixed", top: 0, width: 240 }}>
        <div style={{ height: 600 }} />
        {/* Inset 60px inside the host: `overflow: auto` CLIPS the ::after ring, so a control flush against
            the host's own left edge loses its left probe to the clip rather than to the viewport edge —
            two reasons to fail at once, and a stage that cannot attribute proves nothing. */}
        <button
          className="cbtt-ring"
          data-testid="edge-recentrable"
          style={{ display: "block", height: 18, marginInlineStart: 60, padding: 0, width: 18 }}
          type="button"
        >
          r
        </button>
        <div style={{ height: 300 }} />
        <button data-testid="edge-real-subtarget" style={{ display: "block", height: 18, padding: 0, width: 18 }} type="button">
          s
        </button>
        <div style={{ height: 600 }} />
      </div>
      {/* Clipped by the bottom edge and fixed, so scrollIntoView moves it nowhere: unmeasurable in this
          frame, and its 44×44 ring means the bare box would be a pure fabrication. */}
      <button
        className="cbtt-ring"
        data-testid="edge-fixed-ring"
        style={{ bottom: -6, height: 18, insetInlineStart: 400, padding: 0, position: "fixed", width: 18 }}
        type="button"
      >
        f
      </button>
    </div>
  );
}

/** The FORWARDING-LABEL stage (issue #797, the census's second lie). A `<label for=...>` ACTIVATES its
 *  control from anywhere in the label, so the label's box IS the control's target — that is what WCAG
 *  2.5.5/2.5.8 measure. The probe credited self / pseudo-element / composite hits only, so the
 *  checkbox-leading full-row consent pattern (a 16px native checkbox in a 44px+ forwarding row) read as a
 *  bare 16px box everywhere it is used.
 *
 *  FOUR ARMS — the credit, and the three ways it must not widen:
 *   - `forwarded-checkbox` — 16px inside a 48px forwarding label. Must read ≥44.
 *   - `unlabelled-checkbox` — 16px with no label at all. Must still FIRE (the rule stays alive).
 *   - `misdirected-checkbox` — 16px sitting INSIDE a label whose `for` names a different control. The DOM
 *     gives it an empty `.labels`, and crediting it would licence any checkbox in any label-shaped
 *     wrapper. Must still FIRE.
 *   - `shared-label-checkbox` — 16px in a forwarding label that ALSO contains its own button. The button's
 *     pixels belong to the button; the checkbox may only claim the rest, which is under the floor here.
 *     Must still FIRE.
 *  Padded away from the viewport edges so the ±22px probe ring exists for every arm (#797's other half). */
export function WalkerForwardingLabelStory(): ReactElement {
  const box = { height: 16, margin: 0, width: 16 } as const;
  const row = { alignItems: "center", display: "flex", gap: 12, height: 48, paddingInline: 20, width: 320 } as const;
  // Generated ids, per the house rule. They are also what `describe()` calls VOLATILE and climbs past, so
  // every selector below still anchors on its `data-testid` — which is what the assertions match on.
  const uid = useId();
  return (
    <div style={{ padding: 48, width: 460 }}>
      <label htmlFor={`${uid}-consent`} style={row}>
        <input data-testid="forwarded-checkbox" id={`${uid}-consent`} style={box} type="checkbox" />
        <span>Send me release notes</span>
      </label>
      <div style={{ ...row, paddingInline: 0 }}>
        <input data-testid="unlabelled-checkbox" style={box} type="checkbox" />
        <span>No label forwards to this one</span>
      </div>
      <label htmlFor={`${uid}-elsewhere`} style={row}>
        <input data-testid="misdirected-checkbox" style={box} type="checkbox" />
        <span>This label names another control</span>
      </label>
      <input id={`${uid}-elsewhere`} style={{ height: 48, width: 240 }} type="text" />
      {/* `gap: 0` deliberately: with a gap, the checkbox's 11px/16px/22px probes land in the GAP — which
          the label paints — and the checkbox would inherit the whole row after all. The button must abut
          it for the "another control owns these pixels" arm to be the thing under test. */}
      <label htmlFor={`${uid}-shared`} style={{ ...row, gap: 0 }}>
        <input data-testid="shared-label-checkbox" id={`${uid}-shared`} style={box} type="checkbox" />
        <button data-testid="shared-label-button" style={{ height: 44, width: 200 }} type="button">
          Manage
        </button>
      </label>
    </div>
  );
}

/** THE #816 STAGE — the saved-casts picker row at its real mobile mount (366px dialog / 316px row,
 *  docs/reviews/side-eye/2026-08-29-saved-casts-rules.md §3 P1-1), rebuilt from the two CSS mechanisms
 *  that produced the review's P1:
 *
 *   · the NAME is `flex-1 min-w-0` + truncate, so a shrink-0 cluster beside it takes the whole row and
 *     the name renders at 0px while its content is ~57px wide — present in the DOM, invisible on screen;
 *   · the BADGE cluster shrinks below its own content while its badges do not, so the badges paint
 *     OUTSIDE their wrapper and over the Start button. A press at the badge's own centre lands on the
 *     button — the mis-tap the review found by hand and every instrument passed.
 *
 *  `badges` is the whole knob: 2 is the measured defect (the B10 rules badge is what tipped it), 0 is the
 *  same row before the badge existed, which must stay clean. Nothing here is positioned or z-indexed —
 *  the collision has to be judged INSIDE one paint layer, or the rule would be a deliberate-stacking
 *  detector instead. */
export function WalkerCastRowStory({ badges }: { badges: number }): ReactElement {
  const dialog = { width: 366, padding: 25, boxSizing: "border-box", backgroundColor: "rgb(27, 27, 32)", color: "rgb(240, 240, 245)" } as const;
  const row = { display: "flex", alignItems: "center", gap: 8, width: "100%" } as const;
  const name = { flex: "1 1 0%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 16 } as const;
  const badgeWrap = { flex: "0 1 auto", minWidth: 0, display: "flex", gap: 4, overflow: "visible" } as const;
  const badge = { flex: "0 0 auto", width: 110, height: 24, fontSize: 13, backgroundColor: "rgb(52, 52, 60)" } as const;
  const start = { flex: "0 0 auto", width: 150, height: 28, fontSize: 14 } as const;
  return (
    <div data-testid="cast-dialog" style={dialog}>
      <div data-testid="cast-row" style={row}>
        <span data-testid="cast-name" style={name}>
          Spire Trio
        </span>
        <span data-testid="cast-badges" style={badgeWrap}>
          {["3 members", "2 rules"].slice(0, badges).map((label, i) => (
            <span data-testid={`cast-badge-${i}`} key={label} style={badge}>
              {label}
            </span>
          ))}
        </span>
        <button data-testid="cast-start" style={start} type="button">
          Start a chat
        </button>
      </div>
    </div>
  );
}

/** The truncation stage (#825). `text-overflow` used to fire on `scrollWidth > clientWidth` ALONE, which
 *  is the shape of every correctly truncating label in the app — it minted a P1 against the topbar chat
 *  title (`docs/reviews/side-eye/2026-08-30-this-chat-cls.md` §6 retraction 6). Each row here is one arm
 *  of the honest rule: an ellipsis silences, a `title` carrying the full value silences, a bare clip does
 *  not — and the ellipsis may live on the CLIPPING ANCESTOR while the spilling node is its inline child,
 *  which is the app's actual markup shape. The last row is #816's family: a label at 0px is
 *  `truncated-to-nothing`, never this rule. */
export function WalkerTruncationAffordanceStory(): ReactElement {
  const sentence = "the reply that never came";
  const clip = { width: 60, overflow: "hidden", whiteSpace: "nowrap", fontSize: 16 } as const;
  const row = { display: "flex", alignItems: "center", width: 220, fontSize: 16 } as const;
  return (
    <div style={{ padding: 24, width: 400 }}>
      <div data-testid="ellipsis-truncated" style={{ ...clip, textOverflow: "ellipsis" }}>
        {sentence}
      </div>
      <div data-testid="clipped-no-affordance" style={clip}>
        {sentence}
      </div>
      <div data-testid="titled-clip" style={clip} title={sentence}>
        {sentence}
      </div>
      <div style={{ ...clip, textOverflow: "ellipsis" }}>
        <span data-testid="inline-in-ellipsis-clip">{sentence}</span>
      </div>
      <div style={clip}>
        <span data-testid="inline-in-bare-clip">{sentence}</span>
      </div>
      <div style={row}>
        <span data-testid="erased-label" style={{ flex: "1 1 0%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          Spire Trio
        </span>
        <span style={{ flex: "0 0 auto", width: 220, height: 24, backgroundColor: "rgb(52, 52, 60)" }}>actions</span>
      </div>
    </div>
  );
}

/** The FINE-POINTER FLOOR stage (#1067) — the shape every selection control in this app wears, and the one
 *  the probe ladder could not measure.
 *
 *  `@orb/ui`'s Checkbox/Radio keep an 18px visible box at every pointer and lift the hit area onto a centred
 *  `::before size-touch-target` (packages/ui/src/lib/selection-control.ts): 44px at a coarse pointer, **28px**
 *  under the emitted `@media (pointer: fine)` override (packages/ui/src/styles/theme.css). 28 clears WCAG
 *  2.5.8's 24px AA floor, and the compositor agrees — measured on the character library's bulk row, the
 *  four-cardinal `elementFromPoint` ring answers `self` out to +/-13px.
 *
 *  The ladder was `[11, 16, 22]`: the widest radius it could confirm was 11 (22px) and the next rung it tried
 *  was 16 (32px), which this control legitimately fails. So every checkbox on every fine-pointer surface
 *  published exactly 22px against a 24px floor — a whole control family that could not pass a rule it already
 *  satisfied (10 of 10 rows on `design-audit --goto characters --click '[aria-label="Select multiple"]'`).
 *
 *  THE STAGE IS A LIST, NOT A LONE CONTROL, and that is the whole fidelity of it. A checkbox ALONE inside a
 *  padded wrapper is credited with the wrapper's extent (the #662/#665 declared limit — nothing else can
 *  answer at those pixels), so it measures 44 and hides the defect completely. In the character library the
 *  checkbox sits in a row with a label beside it and other rows above and below: every point at +/-16px is
 *  another element's PROSE, which forwards nothing (#807), so the extent caps at the widest rung the control
 *  owns by itself. That is the population the run measured.
 *
 *  BOTH ARMS ARE HERE ON PURPOSE. The negative control is a plain 22x22 button in the same list — genuinely
 *  under the floor, box-carried, so no ancestor may speak for it — and it must keep failing: a ladder rung
 *  that credited it would trade the false positive for a false clean. The stage is inset from the viewport
 *  edges so `probeFrameFits` never withholds a verdict. */
/** #1829 — THE COARSE TWIN OF THE STORY BELOW, and the rung it exercises is the LADDER'S TOP one.
 *
 *  `measureHitExtent` publishes `2 x radius` and sampled the ring AT the radius, so a target of extent
 *  exactly `2r` — which occupies `[c - r, c + r)` — was asked about the neighbour's first pixel and never
 *  its own last one. 44 is both the ladder's top rung and `TAP_COARSE_WARN_PX`, so EVERY control whose
 *  coarse floor is the shared `size-touch-target` pseudo published 32 and filed a `tap-target` P2 that no
 *  design change could clear. Measured live on the Backup & Restore pane at `--mobile --viewport 430x860`
 *  (side-eye 2026-09-06, #980 F13): `P2, 11 of 11, short side 32px`, on eleven checkboxes whose ring
 *  answers `self` on all four cardinals at +/-21.5px and answers a sibling row's label at +/-22px — and
 *  where a real `page.mouse.click` at 21.5px from centre TOGGLES the control.
 *
 *  THE 44px ROW PITCH IS THE FIDELITY, not a tidy number: it puts a text-bearing NON-ancestor exactly at
 *  the checkbox's +/-22px, which is the only geometry that can tell a boundary probe from an inset one. A
 *  roomier stage would leave the checkbox's own row answering at both offsets and the arm would pass
 *  before the fix — a fence, not a defect proof.
 *
 *  THE NEGATIVE CONTROL IS BOX-CARRIED AND 40px: comfortably over the 32px hard floor, comfortably under
 *  the 44px recommended one, and with no pseudo it may borrow no ancestor's extent (#662/#665). A half-pixel
 *  inset must not promote it — the inset recovers the last pixel a target owns, it does not hand out a rung. */
export function WalkerCoarseTouchFloorStory(): ReactElement {
  const row = { alignItems: "center", display: "flex", gap: 24, height: 44 } as const;
  return (
    <div style={{ padding: 120, position: "static", width: 520 }}>
      <div style={row}>
        <span>the row above, whose prose forwards nothing</span>
      </div>
      <div style={row}>
        <Checkbox aria-label="Include themes" />
        <span>Themes</span>
      </div>
      <div style={row}>
        <span>the row below, 22px from the checkbox&apos;s centre</span>
      </div>
      <div style={row}>
        <button data-testid="coarse-under-floor-box" style={{ display: "block", height: 40, padding: 0, width: 40 }} type="button">
          x
        </button>
        <span>a box-carried 40px control</span>
      </div>
      <div style={row}>
        <span>the last row of prose</span>
      </div>
    </div>
  );
}

export function WalkerFinePointerFloorStory(): ReactElement {
  const row = { alignItems: "center", display: "flex", gap: 24, height: 32 } as const;
  return (
    <div style={{ padding: 120, position: "static", width: 520 }}>
      <div style={row}>
        <span>a neighbouring row of prose</span>
      </div>
      <div style={row}>
        <Checkbox aria-label="Select the row" />
        <span>the selected row's label</span>
      </div>
      <div style={row}>
        <button data-testid="under-floor-box" style={{ display: "block", height: 22, padding: 0, width: 22 }} type="button">
          x
        </button>
        <span>the under-floor row's label</span>
      </div>
      <div style={row}>
        <span>another neighbouring row of prose</span>
      </div>
    </div>
  );
}
