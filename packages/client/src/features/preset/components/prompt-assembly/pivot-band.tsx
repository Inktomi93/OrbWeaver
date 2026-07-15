// PivotBand — the `chat_history` marker rendered as a full-width horizon band, a real sortable item in
// the rack. It is the conversation pivot: everything dragged above is `setup`, below is `post`. Duplicate
// pivots (a 2nd+ `chat_history`) render as an inert warning band instead — zones still derive from the
// first.

import type { PromptConfig } from "@orb/contracts/preset";
import { AlertTriangle, Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";

type AssemblyForm = AppFormInstance<PromptConfig>;

export interface PivotBandProps {
  readonly form: AssemblyForm;
  readonly index: number;
  /** This is a DUPLICATE pivot (2nd+ `chat_history`) — render an inert warning band, no zone boundary. */
  readonly duplicate: boolean;
}

export function PivotBand({ form, index, duplicate }: PivotBandProps): ReactElement {
  if (duplicate) {
    return (
      <Row
        gap="row"
        align="center"
        padding="row"
        className="rounded-card border border-warning bg-warning/10"
      >
        <Icon icon={AlertTriangle} size="sm" />
        <Text size="micro" tone="warning" className="flex-1">
          Duplicate chat history — only the first one splits the conversation. Remove this one.
        </Text>
      </Row>
    );
  }

  return (
    <Stack gap="field" className="rounded-card border border-border bg-accent/40 p-row">
      <Text size="micro" tone="muted" transform="caps">
        setup · sent before the conversation
      </Text>
      <Row gap="row" align="center">
        <Icon icon={MessagesSquare} size="sm" />
        <Stack className="min-w-0 flex-1">
          <Text size="body" weight="semibold" transform="caps">
            Chat history
          </Text>
          <Text size="micro" tone="muted">
            your conversation splices in here
          </Text>
        </Stack>
        <form.AppField name={`sections[${index}].enabled`}>
          {(field): ReactElement => (
            <Switch
              aria-label="Chat history enabled"
              checked={field.state.value}
              onCheckedChange={(next): void => field.handleChange(next)}
            />
          )}
        </form.AppField>
      </Row>
      <Text size="micro" tone="muted" transform="caps">
        post · sent after your last message
      </Text>
    </Stack>
  );
}
