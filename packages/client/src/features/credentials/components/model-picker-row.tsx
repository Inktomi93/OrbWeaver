// One ModelPicker row (ported): the model's name with its capability chips over the id, and the context and
// price on the right — the facts a user compares models by. Names and ids wrap to at most two lines with the
// full text in `title`, because a catalog id (`meta-llama/llama-3.1-405b-instruct:free`) is often wider than the
// dialog. The cap is a bare `line-clamp-2`, never the `lines` modifier: `lines` also RESERVES two lines, which
// is for cells that share a baseline, and in a list it doubled every one-line row. The right-hand facts and
// badges sit on the first line, beside the name they describe.

import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { PickerEntry } from "../lib/model-picker-model.ts";
import { formatContextLength, formatPromptPrice, hasTools, hasVision } from "../lib/model-picker-model.ts";

export function ModelPickerRow({ entry, picked, current }: { readonly entry: PickerEntry; readonly picked: boolean; readonly current: boolean }): ReactElement {
  const context = formatContextLength(entry.contextLength);
  const price = formatPromptPrice(entry.promptPrice);
  return (
    <Row align="start" className="min-w-0 flex-1" gap="row">
      <Stack className="min-w-0 flex-1" gap="field">
        <Row align="center" className="min-w-0" gap="field">
          <Text as="span" className="line-clamp-2 min-w-0 break-all" ink="inherit" title={entry.label}>
            {entry.label}
          </Text>
          {hasVision(entry) ? (
            <Badge intent="info" size="sm">
              vision
            </Badge>
          ) : null}
          {hasTools(entry) ? (
            <Badge intent="neutral" size="sm">
              tools
            </Badge>
          ) : null}
        </Row>
        {entry.label === entry.id ? null : (
          <Text as="span" className="line-clamp-2 break-all" title={entry.id} voice="datumMono">
            {entry.id}
          </Text>
        )}
      </Stack>
      {context !== null || price !== null ? (
        <Stack align="end" className="shrink-0" gap="field">
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
        </Stack>
      ) : null}
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
