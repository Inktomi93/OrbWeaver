// The CastCard header slots (extracted from tracker-blocks.tsx for the component-size cap): the
// relationship slot (kind PICKER when editable — the closed 6-token vocab, Tier-0 §12.3; else the read
// badge, silent on neutral) and the mood slot (inline field when editable, else the read line). Both are
// editable-in-place by default per the kit doctrine (§3.2).

import type { RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { Row } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { RelationshipBadge } from "./relationship-badge";
import { TrackerValue } from "./tracker-value";

/** The relationship-kind picker options (the closed vocab — Tier-0, a PICKER never free text). */
const RELATIONSHIP_KIND_OPTIONS: readonly { readonly label: string; readonly value: RpgRelationshipKind }[] = [
  { label: "lover", value: "lover" },
  { label: "friend", value: "friend" },
  { label: "ally", value: "ally" },
  { label: "neutral", value: "neutral" },
  { label: "enemy", value: "enemy" },
  { label: "custom", value: "custom" },
];

export interface CastRelationshipProps {
  readonly name: string;
  readonly relationship?: RpgRelationship;
  readonly onEditRelationshipKind?: (next: RpgRelationshipKind) => void;
  /** An optional leading relationship glyph (aria-hidden) beside the picker in EDIT mode — the feature
   *  supplies it (the tier-2 kit can't reach a feature glyph lib). In read mode the badge carries its own. */
  readonly relationshipGlyph?: ReactNode;
}

/** The relationship slot — the kind PICKER when editable, else the read badge (a neutral default is silent). */
export function CastRelationship({ name, relationship, onEditRelationshipKind, relationshipGlyph }: CastRelationshipProps): ReactElement | null {
  if (onEditRelationshipKind !== undefined) {
    return (
      <Row gap="field" align="center" className="shrink-0">
        {relationshipGlyph}
        <Select<RpgRelationshipKind>
          aria-label={`${name} relationship`}
          items={RELATIONSHIP_KIND_OPTIONS}
          value={relationship?.kind ?? "neutral"}
          onValueChange={(next): void => {
            if (next !== null) {
              onEditRelationshipKind(next);
            }
          }}
          className="h-control-sm shrink-0"
        />
      </Row>
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

/** The mood slot — an inline field when editable, else the read line (omitted when absent). */
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
