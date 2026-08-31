// CharacterFacetRow — one row in the CONTENT facet master list. A domain composition of Row + a ghost
// Button (not ListRow — two-line button). Anatomy left→right: button that drills into the facet (line 1 =
// label; line 2 = a content preview when filled, else the subtitle) · a muted "Empty" state word on EMPTY
// rows only (the house word for a value slot with nothing in it — #502; it used to be "Add…"). ZERO ember:
// no primary action badge (P5/ember ration); the selected facet reads as a 2px left ember bar + a 10%
// primary tint (the chats-lane selection pattern), never a full accent border/fill.
//
// NO ICON TILE (2026-08-01 side-eye P2): the row used to lead with a filled `Badge` holding the facet
// glyph, `intent="info"` once filled — a stack of saturated cold-blue squares down the Voice/Extras/
// Advanced groups, in a hue this surface uses nowhere else, carrying no datum the label doesn't already
// say. The label + its gloss + the state word ARE the row's content; the glyph survives where it identifies a
// single thing, on the facet drill-in header (character-facet-editor.tsx).

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import type { CharacterCardFacet } from "../lib/character-card-facets.ts";

export interface CharacterFacetRowProps {
  readonly facet: CharacterCardFacet;
  /** This facet is the CONTENT-drilled / CONTEXT-inspected one (accent border + fill). */
  readonly selected: boolean;
  /** Whether the facet currently holds authored content (drives the preview vs the "Empty" state word). */
  readonly filled: boolean;
  /** A short preview of the authored content for a filled row, or `null` when empty (shows "Empty"). */
  readonly preview: string | null;
  /** The TERSE fill state this row announces ("Empty" / "Filled, 1283 characters"), computed by the list.
   *  It exists because the visible fill cues are both out of the accessible tree — see the describedby
   *  comment below (#254). Never the body itself: a state, a count, or a field name. */
  readonly fillSummary: string;
  /** Restore keyboard focus to this row's button on mount (set by the list for the facet Back just returned from). */
  readonly focusOnMount: boolean;
  readonly onSelect: (id: CharacterCardFacet["id"]) => void;
}

export function CharacterFacetRow({ facet, selected, filled, preview, fillSummary, focusOnMount, onSelect }: CharacterFacetRowProps): ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previewId = useId();
  const fillSummaryId = useId();
  // WHICH LINE-2 IS WORTH ANNOUNCING. An EMPTY row's line 2 is `facet.subtitle` — a real gloss ("Injected
  // after history, just before the reply.") that tells a screen-reader user what the facet DOES, so it is
  // the button's description. A FILLED row's line 2 is a CSS-truncated echo of the field body itself
  // (1283 characters on Description, ~2000 on Example messages): demoting that from the NAME to the
  // DESCRIPTION would only move the wall, so it drops out of the accessible tree entirely — `ListRow`'s
  // own `subtitleDecorative` rule for exactly this shape ("a truncated mono preview of a 600-character
  // template body"). The row announces "Personality, button, Filled, 44 characters" — the label, then the
  // `fillSummary` state line below; the prose itself is one activation away.
  const showsPreview = filled && preview !== null;
  useEffect(() => {
    if (focusOnMount) {
      buttonRef.current?.focus();
    }
  }, [focusOnMount]);
  // Selection = a 2px left ember bar + a 10% primary tint (rides --color-primary so custom themes retint
  // it), matching the chats-lane list-row pattern; the constant left-border width keeps rows from shifting.
  const rowClass = selected
    ? "rounded-control border border-border border-l-2 border-l-primary bg-primary/10"
    : "rounded-control border border-border border-l-2 border-l-transparent";
  return (
    <Row gap="row" align="center" padding="row" data-selected={selected ? "" : undefined} data-filled={filled ? "" : undefined} className={rowClass}>
      {/* THE NAME IS THE LABEL, THE BODY IS A DESCRIPTION (side-eye 2026-08-18 P1-2). Both spans used to be
          bare content of the button, so its accessible NAME was label + the whole preview — the Description
          row measured 1283 characters, Example messages ~2000, read out as the name of a control with
          nothing saying what activating it does (WCAG 2.4.6 / 4.1.2). This is the pattern the LIST rows one
          component over already ship (`aria-label` + `aria-describedby`; the Lighthouse
          label-content-name-mismatch flag on it is a false positive — retraction R2), and the visible label
          is the whole accessible name, so voice control still works (WCAG 2.5.3). */}
      <Button
        ref={buttonRef}
        aria-describedby={showsPreview ? fillSummaryId : `${fillSummaryId} ${previewId}`}
        aria-label={facet.label}
        intent="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-start text-left"
        onClick={(): void => onSelect(facet.id)}
      >
        {/* The LABEL keeps its full width (shrink-0); only the preview/subtitle truncates — a filled
            row must never ellipsize "Personality" down to "P…" to fit its own preview. `aria-hidden`
            because it IS the button's aria-label; repeating it as content would double the name. */}
        {/* `as="span"` on BOTH lines (#235): `<Text>` defaults to `<p>`, and a `<p>` inside a `<button>`
            is invalid nesting — `<button>` takes phrasing content only. React-DOM constructs the tree so
            nothing reparents at runtime, but an HTML PARSER (SSR/hydration, an ariaSnapshot round trip)
            closes the button at the `<p>` and re-parents the rest of the row. The spans keep the same
            typographic voice and the same accessible tree: line 1 is aria-hidden (it IS the aria-label),
            line 2 is the description on an empty row. */}
        {/* RATIFIED raw axes (#573): a facet row is a DIRECTORY entry, and `promoted` — the only voice at a
            name-of-an-item step — is explicitly the title step for the ONE item a surface promotes above
            its siblings. Taking it here would set every row of a flat list at 16px semibold and leave the
            surface with no focal at all. The body step at medium is one step under it, deliberately. */}
        <Text as="span" aria-hidden={true} size="body" weight="medium" className="shrink-0">
          {facet.label}
        </Text>
        {/* SENTENCE-LENGTH GLOSS INSIDE A BUTTON TAKES `prose` (#892, the readable-floor debt cb-bracket-fix
            surfaced closing #875 F6). `gloss` alone is the instrument-tier MICRO step (10.5px) — under the
            11px readable floor for text inside a clickable control, and both arms of this line qualify:
            the empty-row `facet.subtitle` ("Injected after history, just before the reply.") is a sentence,
            not a caption, so `interactiveKicker` (caps + tracked) is the wrong register for it; `prose`
            is the ratified lever for exactly this ("this text is sentences, not a label" — `variants.ts`),
            lifting the step to `label` (13px) while `gloss` keeps the family/weight/tracking/color. */}
        <Text as="span" aria-hidden={showsPreview ? true : undefined} id={previewId} voice="gloss" prose={true} className="truncate">
          {showsPreview ? preview : facet.subtitle}
        </Text>
      </Button>

      {/* THE FILL STATE, SPOKEN (#254). Both cues that tell a SIGHTED user filled from empty are out of the
          accessible tree: the filled row's preview line is `aria-hidden` (above — it is a 1283-character
          body, not a name), and the empty row's state word is inert `Text` beside the button. So the two states
          announced identically ("Description, button" either way) — the a11y half of the decorative-preview
          fix, not a regression of it. This span restores the DISTINCTION without restoring the wall: a
          terse state + a magnitude ("Empty" / "Filled, 44 characters"), never the body. It rides
          `aria-describedby` rather than the name so voice control still matches the visible label (WCAG
          2.5.3), and it leads the description so the state is heard before the empty row's gloss. */}
      {/* ONE NODE, TWO AUDIENCES (#502, side-eye 2026-08-22 rail-characters P3-1). The empty row used to
          print a muted "Add…" beside this span — an ACTION word standing in a VALUE slot, which reads as a
          truncated label until you measure it (the review's own retraction: `scrollWidth === clientWidth`,
          the ellipsis is literal), and the third of three words this one editor used for "nothing here"
          ("No tags" · "None" · "Add…", Nielsen #4). The state word is the vocabulary now, everywhere: the
          tags row says it, the CONTEXT card says it, and here the visible word IS the `fillSummary` a screen
          reader already heard — so the two audiences stop being told different things and the empty row
          stops carrying a duplicate node. A FILLED row's summary ("Filled, 44 characters") stays sr-only:
          its magnitude is a11y repair for an `aria-hidden` preview, never a second visible datum. */}
      <Text as="span" className={filled ? "sr-only" : "shrink-0"} id={fillSummaryId} voice="gloss">
        {fillSummary}
      </Text>
    </Row>
  );
}
