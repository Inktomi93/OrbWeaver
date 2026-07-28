// The CastCard header slots (extracted from tracker-blocks.tsx for the component-size cap): the
// relationship slot (a display-at-rest badge whose CLICK opens the closed 6-token kind PICKER — Tier-0
// §12.3, but never a RESTING dropdown per DESIGN §12.4.1) and the mood slot (display-at-rest,
// input-on-click via TrackerValue). Both are editable-in-place by default per the kit doctrine (§3.2).

import type { RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { RPG_RELATIONSHIP_KINDS } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { RelationshipBadge } from "./relationship-badge";
import { TrackerValue } from "./tracker-value";

export interface CastRelationshipProps {
  readonly name: string;
  readonly relationship?: RpgRelationship;
  readonly onEditRelationshipKind?: (next: RpgRelationshipKind) => void;
  /** An optional leading relationship glyph (aria-hidden) beside the trigger in EDIT mode — the feature
   *  supplies it (the tier-2 kit can't reach a feature glyph lib). In read mode the badge carries its own. */
  readonly relationshipGlyph?: ReactNode;
}

/** The relationship slot — display-at-rest: the read badge (or a quiet "+ relationship" seed affordance
 *  when neutral) opens the 6-kind PICKER popover on click. Read-only (no callback): the badge alone,
 *  silent on neutral. Off-vocab kinds are unconstructable (Tier-0). */
export function CastRelationship({ name, relationship, onEditRelationshipKind, relationshipGlyph }: CastRelationshipProps): ReactElement | null {
  const kind = relationship?.kind ?? "neutral";
  // Controlled so a PICK closes the popover in the same gesture (commit-and-close, §12.4.1).
  const [open, setOpen] = useState(false);
  if (onEditRelationshipKind !== undefined) {
    const badge = relationship !== undefined && kind !== "neutral" ? <RelationshipBadge relationship={relationship} /> : null;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              intent="ghost"
              size="sm"
              aria-label={`${name} relationship`}
              title="Click to edit"
              className="!h-auto min-h-0 gap-field !px-field !py-0 font-normal"
            >
              {relationshipGlyph}
              {badge ?? (
                <Text as="span" size="micro" tone="muted">
                  + relationship
                </Text>
              )}
            </Button>
          }
        />
        <PopoverPopup>
          <Stack gap="field" role="group" aria-label={`${name} relationship kind`}>
            {RPG_RELATIONSHIP_KINDS.map((option) => (
              <Button
                key={option}
                type="button"
                intent={option === kind ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={(): void => {
                  if (option !== kind) {
                    onEditRelationshipKind(option);
                  }
                  setOpen(false);
                }}
              >
                {option}
              </Button>
            ))}
          </Stack>
        </PopoverPopup>
      </Popover>
    );
  }
  if (relationship === undefined) {
    return null;
  }
  return <RelationshipBadge relationship={relationship} />;
}

export interface CastMoodProps {
  readonly name: string;
  readonly mood?: string;
  readonly onEditMood?: (next: string) => void;
}

/** The mood slot — display-at-rest with the inline editor on click (TrackerValue owns the grammar);
 *  read-only shows the plain line (omitted when absent). */
export function CastMood({ name, mood, onEditMood }: CastMoodProps): ReactElement | null {
  if (onEditMood !== undefined) {
    return (
      <Row gap="field" align="baseline" className="shrink-0">
        <Text as="span" size="micro" tone="muted">
          mood
        </Text>
        <TrackerValue
          ariaLabel={`${name} mood`}
          display={mood ?? ""}
          placeholder="—"
          onEdit={onEditMood}
          className="h-control-sm !w-auto min-w-0 max-w-full field-sizing-content"
        />
      </Row>
    );
  }
  if (mood === undefined) {
    return null;
  }
  return (
    <Text as="span" size="label" tone="muted">
      mood — {mood}
    </Text>
  );
}
