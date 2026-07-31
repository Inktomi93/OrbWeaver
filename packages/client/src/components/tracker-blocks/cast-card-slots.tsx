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
  /** An optional relationship glyph (aria-hidden) for the SEED state only ("+ relationship") — the feature
   *  supplies it (the tier-2 kit can't reach a feature glyph lib). Once a badge renders it carries its OWN
   *  glyph, so the seed glyph must not double up beside it (owner double-star report, 08-01). */
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
              // rounded-full + zero padding when a badge shows: the trigger's hover highlight must hug the
              // pill EXACTLY — padding around it reads as a mismatched halo (owner reports ×2, 08-01). The
              // seed state ("+ relationship") keeps its own padding for a clickable text target.
              className={
                badge === null ? "!h-auto min-h-0 gap-field rounded-full !px-field !py-0 font-normal" : "!h-auto min-h-0 rounded-full !p-0 font-normal"
              }
            >
              {badge ?? (
                <>
                  {relationshipGlyph}
                  <Text as="span" size="micro" tone="muted">
                    + relationship
                  </Text>
                </>
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
    // flex-1 (basis-0) + min-w-0: the mood is model-authored free text with no length contract — it takes
    // only the LEFTOVER header width and wraps inside it. A shrinkable auto-basis box instead put the
    // name+badge half under shrink pressure, collapsing the pill under the mood label (owner scene-jank
    // screenshot, 08-01). justify-end keeps the slot hugging the card's right edge like the mock.
    return (
      <Row gap="field" align="baseline" className="min-w-0 flex-1 justify-end">
        <Text as="span" size="micro" tone="muted" className="shrink-0">
          mood
        </Text>
        <TrackerValue
          ariaLabel={`${name} mood`}
          display={mood ?? ""}
          placeholder="—"
          onEdit={onEditMood}
          wrap={true}
          className="!w-auto min-w-0 max-w-full field-sizing-content"
        />
      </Row>
    );
  }
  if (mood === undefined) {
    return null;
  }
  return (
    <Text as="span" size="label" tone="muted" className="min-w-0 break-words">
      mood — {mood}
    </Text>
  );
}
