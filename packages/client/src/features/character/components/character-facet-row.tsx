// CharacterFacetRow — one row in the CONTENT facet master list. A domain composition of Row + a ghost
// Button (not ListRow — two-line button). Anatomy left→right: button that drills into the facet (line 1 =
// label; line 2 = a content preview when filled, else the subtitle) · a muted "Add…" invite on EMPTY rows
// only. ZERO ember: no primary action badge (P5/ember ration); the selected facet reads as a 2px left ember
// bar + a 10% primary tint (the chats-lane selection pattern), never a full accent border/fill.
//
// NO ICON TILE (2026-08-01 side-eye P2): the row used to lead with a filled `Badge` holding the facet
// glyph, `intent="info"` once filled — a stack of saturated cold-blue squares down the Voice/Extras/
// Advanced groups, in a hue this surface uses nowhere else, carrying no datum the label doesn't already
// say. The label + its gloss + "Add…" ARE the row's content; the glyph survives where it identifies a
// single thing, on the facet drill-in header (character-facet-editor.tsx).

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { CharacterCardFacet } from "../lib/character-card-facets.ts";

export interface CharacterFacetRowProps {
  readonly facet: CharacterCardFacet;
  /** This facet is the CONTENT-drilled / CONTEXT-inspected one (accent border + fill). */
  readonly selected: boolean;
  /** Whether the facet currently holds authored content (drives the preview vs "Add…" affordance). */
  readonly filled: boolean;
  /** A short preview of the authored content for a filled row, or `null` when empty (shows "Add…"). */
  readonly preview: string | null;
  /** Restore keyboard focus to this row's button on mount (set by the list for the facet Back just returned from). */
  readonly focusOnMount: boolean;
  readonly onSelect: (id: CharacterCardFacet["id"]) => void;
}

export function CharacterFacetRow({ facet, selected, filled, preview, focusOnMount, onSelect }: CharacterFacetRowProps): ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) {
      buttonRef.current?.focus();
    }
  }, [focusOnMount]);
  // Selection = a 2px left ember bar + a 10% primary tint (rides --color-primary so custom themes retint
  // it), matching the chats-lane list-row pattern; the constant left-border width keeps rows from shifting.
  const rowClass = selected
    ? "rounded-card border border-border border-l-2 border-l-primary bg-primary/10"
    : "rounded-card border border-border border-l-2 border-l-transparent";
  return (
    <Row gap="row" align="center" padding="row" data-selected={selected ? "" : undefined} data-filled={filled ? "" : undefined} className={rowClass}>
      <Button ref={buttonRef} intent="ghost" size="sm" className="min-w-0 flex-1 justify-start text-left" onClick={(): void => onSelect(facet.id)}>
        {/* The LABEL keeps its full width (shrink-0); only the preview/subtitle truncates — a filled
            row must never ellipsize "Personality" down to "P…" to fit its own preview. */}
        <Text size="body" weight="medium" className="shrink-0">
          {facet.label}
        </Text>
        <Text size="micro" tone="muted" className="truncate">
          {filled && preview !== null ? preview : facet.subtitle}
        </Text>
      </Button>

      {filled ? null : (
        <Text size="micro" tone="muted">
          Add…
        </Text>
      )}
    </Row>
  );
}
