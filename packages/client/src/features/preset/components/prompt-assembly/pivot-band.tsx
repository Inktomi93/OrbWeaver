// PivotBand — the `chat_history` marker rendered as a full-width HORIZON band, a real sortable item in
// the rack. It is the conversation pivot: everything dragged above is `setup`, below is `post`. Duplicate
// pivots (a 2nd+ `chat_history`) render as an inert warning band instead — zones still derive from the
// first, so the duplicate is debris DISPLAY, never an affordance.
//
// NO ENABLE SWITCH (the one functional correction to the landed rack):
// the pivot can be neither deleted, silenced, nor DISABLED. A disabled pivot is an assembly with nowhere
// to splice the conversation — the exact state the missing-pivot callout exists to prevent, reachable in
// one click from a switch that had no business existing. The band still speaks the row grammar (name
// selects · chevron drills) so its delivery cluster stays reachable.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { ChevronRight, Icon, MessagesSquare, TriangleAlert } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { useFocusOnSwap } from "#lib";
import { PRESET_CHAT_HISTORY_LABEL, presetEditDrillName } from "#src/features/preset/lib/preset-names.ts";

export interface PivotBandProps {
  /** This is a DUPLICATE pivot (2nd+ `chat_history`) — render an inert warning band, no zone boundary. */
  readonly duplicate: boolean;
  readonly restoreFocus: boolean;
  /** SELECT this row — the readout echoes it, exactly as a section row's name click does. */
  readonly onSelect: () => void;
  /** DRILL into the pivot's own (delivery-only) editor. */
  readonly onDrill: () => void;
}

export function PivotBand({ duplicate, restoreFocus, onSelect, onDrill }: PivotBandProps): ReactElement {
  const chevronRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(chevronRef, restoreFocus && !duplicate);
  if (duplicate) {
    return (
      <Card tone="warning" variant="soft">
        <Row align="center" gap="row">
          <Icon icon={TriangleAlert} size="sm" tone="warning" />
          <Text grow={true} voice="label">
            Duplicate chat history: only the first one splits the conversation. Remove this one.
          </Text>
        </Row>
      </Card>
    );
  }

  // THE LEGENDS ARE KICKERS, NOT PILLS (side-eye F-18): filled Badges straddled the band's own border and
  // read as two controls bracketing the row. The mock draws hairline micro-caps INSIDE the band — a zone
  // legend is a label for the space above/below the horizon, which is exactly the `kicker` voice's job.
  return (
    <Card variant="soft" dashed={true}>
      <Stack gap="tight">
        <Text tone="info" voice="kicker">
          setup · before the conversation
        </Text>
        <Row align="center" gap="row">
          <Icon className="shrink-0" icon={MessagesSquare} size="sm" />
          {/* `min-w-0` on BOTH the button and its gloss: at ~530px the name collided with the chevron
            because nothing in the row could shrink (F-18). The NAME keeps its width, the gloss truncates. */}
          <Button stretch="row" variant="ghost" onClick={onSelect} size="sm" type="button">
            <Text ink="inherit" as="span" className="shrink-0" voice="label">
              {PRESET_CHAT_HISTORY_LABEL}
            </Text>
            <Text as="span" truncate={true} voice="gloss">
              your conversation splices in here: always on, always placed
            </Text>
          </Button>
          <Button
            aria-label={presetEditDrillName(PRESET_CHAT_HISTORY_LABEL)}
            className="shrink-0"
            variant="ghost"
            onClick={onDrill}
            ref={chevronRef}
            square={true}
            type="button"
          >
            <Icon icon={ChevronRight} size="sm" />
          </Button>
        </Row>
        <Text tone="warning" voice="kicker">
          post · after your last message
        </Text>
      </Stack>
    </Card>
  );
}
