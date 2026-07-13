// CharacterFacetRow — one row in the CONTENT facet master list. A domain composition of Row + Badge + a
// ghost Button (not ListRow — glyph badge, two-line name/subtitle button, filled-state cue, ~token
// estimate). Anatomy left→right: glyph badge · label+subtitle button (drills into the facet) · a
// "filled"/"empty" cue · the ~token estimate. The selected facet gets accent border + fill.

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
  /** Restore keyboard focus to this row's button on mount (set by the list for the facet Back just returned from). */
  readonly focusOnMount: boolean;
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
  useEffect(() => {
    if (focusOnMount) {
      buttonRef.current?.focus();
    }
  }, [focusOnMount]);
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
