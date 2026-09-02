// A LIBRARY'S GLANCE — its icon, its name and the blurb that says what it is FOR. The opening of the
// CONTENT pane whenever a collection is the reader's location and no member is open
// (`config-content-surface.tsx`'s `CollectionLanding`, both of whose arms draw it).
//
// IT USED TO CARRY THE PREVIEW WALL, and that is exactly what #1209 deleted (the owner ruling is stated in
// full on `CollectionInsight`): a ranked chip wall over the members the LIST is already showing, in the same
// order, with a "+N more" naming members reachable from nowhere. The glance now says only what the pane owes
// before its facts: which library you are in and what it is for. Everything it used to imply about CONTENTS
// is the LIST's job, and everything true of the LIBRARY is the contribution's `insights`.
//
// This file authors NO copy: `label`, `icon` and `description` are the group's own.

import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { CollectionGroupDefinition } from "#state";

export interface ConfigLibraryGlanceProps {
  readonly group: CollectionGroupDefinition;
  /** The name's rank in the HOST's document outline. `2` when the glance IS the pane, which is every case
   *  today — kept a prop because the rank is the host's fact about its own frame, never the library's. */
  readonly level: 2 | 3;
}

export function ConfigLibraryGlance({ group, level }: ConfigLibraryGlanceProps): ReactElement {
  return (
    <Stack gap="row">
      <Row align="center" gap="field">
        <Icon icon={group.icon} size="sm" />
        {/* The HEADLINE step and a real heading — the `focal` voice carries the type weight while the level
            carries the outline, which is why the two are declared separately. */}
        <Heading level={level} voice="focal">
          {group.label}
        </Heading>
      </Row>
      {/* CAPPED ON THE PARAGRAPH, AND READ AT THE PROSE STEP (side-eye 2026-08-19 P3, both passes). A measure
          belongs to the line, not to the pane; and a blurb is this surface's TEACHING sentence — what a
          library is for, read by someone who has not built it — so it is not set at the gloss voice's
          footnote step. `prose` lifts the step and relaxes the leading and changes nothing else. */}
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {group.description}
      </Text>
    </Stack>
  );
}
