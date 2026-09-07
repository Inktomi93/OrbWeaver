// A CONFIG PANE'S GLANCE — its icon, its name and the blurb that says what it is FOR. The opening
// statement of the CONTENT pane, drawn by BOTH pane kinds.
//
// IT USED TO BE A LIBRARY'S ALONE, AND THAT WAS THE TYPE DEFECT (#1839 · side-eye 2026-09-06 F24). A
// collection library opened on a real 20px/600 subject step while a settings pane opened on nothing at
// all — its tallest ink was a 16px incidental — so the surface had TWO opening registers and the
// inconsistency, not the flatness, was the finding: 'nothing tells your eye where the pane starts'. The
// fix is one component for one register rather than a second heading spelled at a second step, which is
// why this widened to `ConfigGroupBase` (label · icon · description — everything it reads, declared by
// every group) and why it is no longer named for one of its two callers.
//
// IT USED TO CARRY THE PREVIEW WALL, and that is exactly what #1209 deleted (the owner ruling is stated in
// full on `CollectionInsight`): a ranked chip wall over the members the LIST is already showing, in the same
// order, with a "+N more" naming members reachable from nowhere. The glance now says only what the pane owes
// before its facts: which library you are in and what it is for. Everything it used to imply about CONTENTS
// is the LIST's job, and everything true of the LIBRARY is the contribution's `insights`.
//
// THE BLURB IS OPT-IN, AND THE ASYMMETRY IS ABOUT WHO AUTHORED THE STRING. `ConfigGroupBase.description`
// is one field with three declared jobs (its own docstring): a COLLECTION's launcher/landing blurb, a
// planned group's placeholder body, and a search keyword for every group. For the nine settings-shaped
// groups only the third is true, so painting it as pane prose would promote a search term to a teaching
// sentence — and the CONTENT surface's own arm-discriminator reads its absence as proof that the sections
// arm, not the placeholder arm, rendered. The NAME is what both pane kinds owe and what #1839 is about;
// the blurb stays the library's.
//
// This file authors NO copy: `label`, `icon` and `description` are the group's own.

import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ConfigGroupBase } from "#state";

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
      {blurb ? (
        <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
          {group.description}
        </Text>
      ) : null}
    </Stack>
  );
}
