// RELATIONSHIP BADGE — the five known kinds get a distinct token color + icon; `custom` = a neutral label
// chip. TEXT is the accessible datum (the tracker-kit a11y model): the badge carries
// a visible label, the color + icon are decoration. A NEUTRAL default renders nothing (no steering signal to
// badge). Extracted from tracker-blocks.tsx (component-size cap) — the badge sits ON the name line of BOTH
// the Scene cast card AND the Status roster card (the §6 relationship re-home — one anatomy, two homes).

import type { RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import type { LucideIcon } from "@orb/ui/icons";
import { Heart, Icon, Star, Users, UserX } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";

type BadgeIntent = NonNullable<ComponentProps<typeof Badge>["intent"]>;

/** The per-kind badge decoration — the intent color + the glyph. `custom` has none (a plain neutral label
 *  chip). Ordered lover→enemy along the warmth axis (§2.1). */
const RELATIONSHIP_DECOR: Readonly<Record<Exclude<RpgRelationshipKind, "custom">, { readonly intent: BadgeIntent; readonly glyph: LucideIcon }>> = {
  lover: { intent: "primary", glyph: Heart },
  friend: { intent: "success", glyph: Star },
  ally: { intent: "info", glyph: Users },
  neutral: { intent: "neutral", glyph: Users },
  enemy: { intent: "danger", glyph: UserX },
};

/** A cast member's relationship badge (§2.1). The five known kinds get a color + icon; a `custom` kind
 *  renders its `label` as a neutral chip. A neutral default is silent (returns null — no badge to clutter). */
export function RelationshipBadge({ relationship }: { readonly relationship: RpgRelationship }): ReactElement | null {
  if (relationship.kind === "custom") {
    const label = relationship.label !== "" ? relationship.label : "custom";
    // A free-text custom label can be arbitrarily long ("disgraced former lieutenant of the crown"); left
    // unbounded it grew the badge to ~236px and starved the character NAME to 0px. Cap + truncate the label
    // so the badge yields width to the name (which is `shrink-0` in CastCard), and carry the full text on
    // `title` for hover. `min-w-0` lets the truncating child actually shrink inside the flex badge.
    return (
      <Badge tone="soft" size="sm" intent="neutral" data-slot="relationship-badge" className="min-w-0 max-w-(--width-control-col)" title={label}>
        <Text as="span" size="micro" weight="medium" className="truncate">
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
    <Badge tone="soft" size="sm" intent={decor.intent} data-slot="relationship-badge">
      <Icon icon={decor.glyph} size="xs" />
      <Text as="span" size="micro" weight="medium">
        {relationship.kind}
      </Text>
    </Badge>
  );
}
