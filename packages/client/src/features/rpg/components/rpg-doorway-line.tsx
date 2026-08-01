// DoorwayLine — the ONE cross-reference primitive (panel-redesign DESIGN.md §12.1.5): a muted sentence +
// an optional action, used by every APPLICABILITY/authoring cross-reference ("Define attributes in Game →",
// the veiled-count doorway, the graduation pointer). One anatomy so a doorway always reads the same;
// feature-homed (every current consumer is rpg — hoists to the shared tier when a 2nd feature needs it,
// the §13.0 bar).

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgDoorwayLineProps {
  /** The muted teaching sentence ("Attributes are defined in the Game tab."). */
  readonly children: string;
  /** Optional doorway action — label + handler renders a quiet link-button after the sentence. */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

/** One quiet doorway: a muted sentence + an optional ghost action. */
export function RpgDoorwayLine({ children, actionLabel, onAction }: RpgDoorwayLineProps): ReactElement {
  return (
    <Row gap="field" align="baseline" className="flex-wrap" data-slot="rpg-doorway-line">
      <Text as="span" voice="gloss">
        {children}
      </Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <Button intent="ghost" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Row>
  );
}
