// CharacterFacetRow — ONE row in the CONTENT facet master list (character-editor redesign, from
// section-row.tsx). A DOMAIN COMPOSITION of Row + Badge + a ghost Button (NOT `@orb/ui/list-row`: the row
// carries a glyph badge, a two-line name/subtitle button, a filled-state cue, and a ~token estimate — the
// same anatomy reason section-row cites). No sortable grip, no enabled switch, no zone accent (a facet is a
// fixed field, not a reorderable section).
//
// Anatomy left→right: the facet glyph Badge · a ghost Button wrapping label + plain-language subtitle (click
// = drill CONTENT into the facet body + reveal the CONTEXT Field tab) · a "filled"/"empty" cue (only-when-
// authored) · the ~token estimate (mono; omitted for the non-prompt facets). The SELECTED facet gets the
// accent border + fill (mirrors section-row's `selected`).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { CharacterCardFacet } from "../lib/character-card-facets";

export interface CharacterFacetRowProps {
  readonly facet: CharacterCardFacet;
  /** This facet is the CONTENT-drilled / CONTEXT-inspected one (accent border + fill). */
  readonly selected: boolean;
  /** Whether the facet currently holds authored content (drives the "filled" cue). */
  readonly filled: boolean;
  /** The facet's live ~token estimate, or `null` for the non-prompt facets (creator notes / provenance). */
  readonly tokens: number | null;
  /** Restore keyboard focus to this row's button on mount — set by the list for the facet the drill-in ←
   *  Back just returned FROM, so activating a facet then backing out lands focus back on that row (not the
   *  `<body>` fallback the browser DOM-position heuristic gives). Fires exactly once, on mount. */
  readonly focusOnMount: boolean;
  /** Drill this facet → reveal the CONTEXT Field inspector (the route-built choreography). */
  readonly onSelect: (id: CharacterCardFacet["id"]) => void;
}

export function CharacterFacetRow({
  facet,
  selected,
  filled,
  tokens,
  focusOnMount,
  onSelect,
}: CharacterFacetRowProps): ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Focus restore: the facet list mounts this row FRESH on the drill-in→Back swap (list ⇄ editor are
  // conditionally rendered), so `focusOnMount` is computed at that fresh mount and never flips for a
  // mounted row — the effect fires exactly once, when the row (re)appears. `focusOnMount` is in the deps
  // (it's stable for the mount) so both linters are satisfied without a suppression.
  useEffect(() => {
    if (focusOnMount) {
      buttonRef.current?.focus();
    }
  }, [focusOnMount]);
  // Selected = accent border + fill (mirrors section-row); otherwise the neutral border.
  const rowClass = selected
    ? "rounded-card border border-primary bg-accent"
    : "rounded-card border border-border";
  return (
    <Row
      gap="row"
      align="center"
      padding="row"
      data-selected={selected ? "" : undefined}
      data-filled={filled ? "" : undefined}
      className={rowClass}
    >
      <Badge intent={filled ? "info" : "neutral"} size="sm">
        <Icon icon={facet.glyph} size="sm" />
      </Badge>

      {/* The label-button — ONE ghost Button wrapping label + subtitle (the single tab stop; a facet has no
          switch/grip to compete with, unlike a preset section row). */}
      <Button
        ref={buttonRef}
        intent="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-start text-left"
        onClick={(): void => onSelect(facet.id)}
      >
        <Text size="body" weight="medium" className="truncate">
          {facet.label}
        </Text>
        <Text size="micro" tone="muted" className="truncate">
          {facet.subtitle}
        </Text>
      </Button>

      {filled ? (
        <Badge intent="primary" size="sm">
          Set
        </Badge>
      ) : null}

      {tokens !== null ? (
        <Text size="code" tone="muted" className="tabular-nums">
          ~{tokens}
        </Text>
      ) : null}
    </Row>
  );
}
