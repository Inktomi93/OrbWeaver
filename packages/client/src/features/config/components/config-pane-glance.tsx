// Group identity, never a contents preview or library facts; those belong to collection rows and insights.
// The phone shell paints its title; retain the accessible heading and blurb without duplicate chrome or an empty wrapper.
// Descriptions are opt-in: collection prose teaches, while settings descriptions serve search. All copy belongs to the group.

import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ConfigGroupBase } from "#state";
import { useMobileViewport } from "#state";

export interface ConfigPaneGlanceProps {
  /** Anything with a name, a glyph and a blurb — i.e. every config group, collection or not. */
  readonly group: ConfigGroupBase;
  /** The name's rank in the HOST's document outline. `2` when the glance IS the pane, which is every case
   *  today — kept a prop because the rank is the host's fact about its own frame, never the group's. */
  readonly level: 2 | 3;
  /** Draw the group's `description` under the name. TRUE for a collection library, whose description is
   *  authored as landing prose; FALSE for a settings pane, where the same field is a search keyword — see
   *  the header. Required, so a call site states which kind of copy it believes it has. */
  readonly blurb: boolean;
}

export function ConfigPaneGlance({ group, level, blurb }: ConfigPaneGlanceProps): ReactElement {
  const phone = useMobileViewport();
  const heading = (
    <Heading className={phone ? "sr-only" : undefined} level={level} voice="focal">
      {group.label}
    </Heading>
  );
  const description = blurb ? (
    <Text className="max-inline-(--reading-measure-prose)" prose={true} voice="gloss">
      {group.description}
    </Text>
  ) : null;
  if (phone) {
    return (
      <>
        {heading}
        {description}
      </>
    );
  }
  return (
    <Stack gap="row">
      <Row align="center" gap="field">
        <Icon icon={group.icon} size="sm" />
        {heading}
      </Row>
      {description}
    </Stack>
  );
}
