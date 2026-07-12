// PivotBand — the `chat_history` marker rendered as a full-width horizon band, a REAL sortable item in
// the one rack SortableList (BUILD-SPEC §3.3). It is the conversation pivot: everything dragged above it
// is the `setup` zone, everything below is `post`. Anatomy: a wave glyph + "Chat history" + the enabled
// Switch, framed by two edge labels — up: "setup · sent before the conversation" / down: "post · sent
// after your last message". NO cache claim on the band (cache-stability is model-dependent — ruled).
//
// Duplicate pivots (a 2nd+ `chat_history`) render as an INERT warning band instead (the caller passes
// `duplicate`) — the zones still derive from the FIRST pivot (derive-zones), so a second one is a
// mistake the rack flags, not a second boundary.

import type { PromptConfig } from "@orb/contracts/preset";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
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
