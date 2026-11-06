// RPG relationship text is the datum; color and glyph are decorative.
// A neutral relationship is silent; custom labels remain readable on hover when truncated.

import type { RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import type { LucideIcon } from "@orb/ui/icons";
import { Heart, Icon, Star, Users, UserX } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";

type BadgeTone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

/** The per-kind badge decoration — the tone + the glyph. `custom` has none (a plain neutral label
 *  chip). Ordered lover→enemy along the warmth axis (§2.1). */
const RELATIONSHIP_DECOR: Readonly<Record<Exclude<RpgRelationshipKind, "custom">, { readonly tone: BadgeTone; readonly glyph: LucideIcon }>> = {
  lover: { tone: "primary", glyph: Heart },
  friend: { tone: "success", glyph: Star },
  ally: { tone: "info", glyph: Users },
  neutral: { tone: "neutral", glyph: Users },
  enemy: { tone: "destructive", glyph: UserX },
};

/** A npc's relationship badge (§2.1). The five known kinds get a color + icon; a `custom` kind
 *  renders its `label` as a neutral chip. A neutral default is silent (returns null — no badge to clutter). */
export function RelationshipBadge({ relationship }: { readonly relationship: RpgRelationship }): ReactElement | null {
  if (relationship.kind === "custom") {
    const label = relationship.label !== "" ? relationship.label : "custom";
    // A free-text custom label can be arbitrarily long ("disgraced former lieutenant of the crown"); left
    // unbounded it grew the badge to ~236px and starved the character NAME to 0px. Cap + truncate the label
    // so the badge yields width to the name (which is `shrink-0` in NpcCard); the Scene card's editor shows the
    // full text. `min-w-0` lets the truncating child actually shrink inside the flex badge.
    return (
      <Badge size="sm" data-slot="relationship-badge" className="max-inline-(--width-control-col) min-inline-0">
        <Text ink="inherit" as="span" truncate={true} voice="label">
          {label}
        </Text>
      </Badge>
    );
  }
  if (relationship.kind === "neutral") {
    return null;
  }
  const decor = RELATIONSHIP_DECOR[relationship.kind];
  return (
    <Badge size="sm" tone={decor.tone} data-slot="relationship-badge">
      <Icon icon={decor.glyph} size="xs" />
      <Text ink="inherit" as="span" voice="label">
        {relationship.kind}
      </Text>
    </Badge>
  );
}
