// PivotBand — the `chat_history` marker rendered as a full-width HORIZON band, a real sortable item in
// the rack. It is the conversation pivot: everything dragged above is `setup`, below is `post`. Duplicate
// pivots (a 2nd+ `chat_history`) render as an inert warning band instead — zones still derive from the
// first, so the duplicate is debris DISPLAY, never an affordance.
//
// NO ENABLE SWITCH (preset-surface-redesign.md §5.1 — the one functional correction to the landed rack):
// the pivot can be neither deleted, silenced, nor DISABLED. A disabled pivot is an assembly with nowhere
// to splice the conversation — the exact state the missing-pivot callout exists to prevent, reachable in
// one click from a switch that had no business existing. The band still speaks the row grammar (name
// selects · chevron drills) so its delivery cluster stays reachable.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { AlertTriangle, ChevronRight, Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface PivotBandProps {
  /** This is a DUPLICATE pivot (2nd+ `chat_history`) — render an inert warning band, no zone boundary. */
  readonly duplicate: boolean;
  /** SELECT this row — the readout echoes it, exactly as a section row's name click does. */
  readonly onSelect: () => void;
  /** DRILL into the pivot's own (delivery-only) editor. */
  readonly onDrill: () => void;
}

export function PivotBand({ duplicate, onSelect, onDrill }: PivotBandProps): ReactElement {
  if (duplicate) {
    return (
      <Row align="center" className="rounded-base border border-warning bg-warning/10 text-warning" gap="row" padding="row">
        <Icon icon={AlertTriangle} size="sm" />
        <Text className="flex-1" size="micro" tone="warning">
          Duplicate chat history — only the first one splits the conversation. Remove this one.
        </Text>
      </Row>
    );
  }

  return (
    <Stack className="rounded-base border border-input border-dashed bg-muted/40 p-row" gap="tight">
      <Row>
        <Badge intent="info" size="sm">
          setup · before the conversation
        </Badge>
      </Row>
      <Row align="center" gap="row">
        <Icon icon={MessagesSquare} size="sm" />
        <Button className="min-w-0 flex-1 justify-start text-left" intent="ghost" onClick={onSelect} size="sm" type="button">
          <Text size="body" transform="caps" weight="semibold">
            Chat history
          </Text>
          <Text size="micro" tone="muted">
            your conversation splices in here — always on, always placed
          </Text>
        </Button>
        <Button aria-label="Edit Chat history" intent="ghost" onClick={onDrill} size="icon" type="button">
          <Icon icon={ChevronRight} size="sm" />
        </Button>
      </Row>
      <Row>
        <Badge intent="warning" size="sm">
          post · after your last message
        </Badge>
      </Row>
    </Stack>
  );
}
