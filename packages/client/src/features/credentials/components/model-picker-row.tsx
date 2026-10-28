// Model identity stays capped at two lines for both name and id. Metadata sits beside it at wide widths
// and wraps underneath when the row narrows, so facts never consume the distinguishing model label.

import { Badge } from "@orb/ui/badge";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { PickerEntry } from "../lib/model-picker-model.ts";
import { formatContextLength, formatPromptPrice, hasTools, hasVision } from "../lib/model-picker-model.ts";

export function ModelPickerRow({ entry, picked, current }: { readonly entry: PickerEntry; readonly picked: boolean; readonly current: boolean }): ReactElement {
  return (
    <Container className="flex-1 min-inline-0">
      <Row align="start" className="@max-cq-32:flex-col" gap="row">
        <Stack className="flex-1 min-inline-0 @max-cq-32:inline-full" gap="field">
          <Text as="span" className="line-clamp-2 wrap-break-word min-inline-0" ink="inherit">
            {entry.label}
          </Text>
          {entry.label === entry.id ? null : (
            <Text as="span" className="line-clamp-2 break-all" voice="datumMono">
              {entry.id}
            </Text>
          )}
          {entry.description === null ? null : (
            <Text as="span" voice="gloss">
              {entry.description}
            </Text>
          )}
        </Stack>
        <ModelMetadata entry={entry} current={current} picked={picked} />
      </Row>
    </Container>
  );
}

function ModelMetadata({ entry, picked, current }: Parameters<typeof ModelPickerRow>[0]): ReactElement | null {
  const context = formatContextLength(entry.contextLength);
  const price = formatPromptPrice(entry.promptPrice);
  const vision = hasVision(entry);
  const tools = hasTools(entry);
  if (!(vision || tools || context !== null || price !== null || current || picked)) {
    return null;
  }
  return (
    <Row align="center" className="flex-wrap min-inline-0 @max-cq-32:inline-full @cq-32:shrink-0" gap="field">
      {vision ? (
        <Badge intent="info" size="sm">
          vision
        </Badge>
      ) : null}
      {tools ? (
        <Badge intent="neutral" size="sm">
          tools
        </Badge>
      ) : null}
      {context === null ? null : (
        <Text as="span" voice="datumMono">
          {context}
        </Text>
      )}
      {price === null ? null : (
        <Text as="span" voice="datumMono">
          {price}
        </Text>
      )}
      {current ? (
        <Badge intent="neutral" size="sm" tone="soft">
          Already added
        </Badge>
      ) : null}
      {picked ? (
        <Badge intent="primary" size="sm" tone="soft">
          Selected
        </Badge>
      ) : null}
    </Row>
  );
}
