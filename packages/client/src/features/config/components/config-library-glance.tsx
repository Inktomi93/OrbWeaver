// A LIBRARY'S GLANCE — its icon and name, the blurb that says what it is FOR, and the ranked preview wall
// that says what is actually IN it. ONE anatomy, TWO hosts (#925): the welcome's launcher slot draws it for
// every collection, and the CONTENT pane draws it for the ACTIVE collection that has no member open — the
// landing the species contract owes a populated library (`config-content-surface.tsx`'s `CollectionLanding`).
//
// IT IS A SEPARATE FILE BECAUSE IT HAS TWO CALLERS, not because the welcome grew: the two hosts differ only
// in what they put AROUND the glance (the launcher adds a door to the library; the landing is already there,
// so it adds the create verb instead), and a second spelling of the wall is exactly the drift the preview
// contract's own header argues against. Everything the wall knows is the CONTRIBUTION's (`preview.label`,
// each entry's `label`/`detail`) or the group's (`label`, `icon`, `description`) — this file authors no copy.
//
// THE HOST DECIDES THE PER-CHIP DETAIL, NOT THE CONTRIBUTION (side-eye 2026-08-19 P2-2, re-homed verbatim
// with its wall): a detail that is identical on every chip is not a datum — the regex library ranks by
// recency, so a library authored in one sitting printed twelve chips all reading "yesterday", which reads as
// a rendering bug rather than as information. It is a property of the RENDERED WALL (how much the values it
// drew actually differ), which no owner can know from inside its own ranking. ">1 CHIP" is part of the rule:
// with a single chip there is no repetition to be about and its datum is that member's own fact.

import { Badge } from "@orb/ui/badge";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { CollectionPreviewEntry } from "#lib";
import type { CollectionGroupDefinition } from "#state";

export interface ConfigLibraryGlanceProps {
  readonly group: CollectionGroupDefinition;
  /** The library's member count — the wall's "+N more" remainder is derived from it, never from a second
   *  query, which is what keeps the wall honestly a glance: it says how much of the library it is not
   *  showing. */
  readonly count: number;
  /** The contribution's ranked top-N, already sliced. Empty = it declared no preview, or the read has not
   *  landed: either way the glance is name + blurb, and no wall is promised. */
  readonly entries: readonly CollectionPreviewEntry[];
  /** The name's rank in the HOST's document outline: `3` under the welcome's masthead, `2` when the glance
   *  IS the pane (a landing that left `main` headingless dead-ends heading navigation). */
  readonly level: 2 | 3;
}

export function ConfigLibraryGlance({ group, count, entries, level }: ConfigLibraryGlanceProps): ReactElement {
  const collection = group.body.collection;
  const remainder = count - entries.length;
  const details = new Set(entries.map((entry) => entry.detail));
  const showDetail = entries.length <= 1 || details.size > 1;
  return (
    <Stack gap="row">
      <Row align="center" gap="field">
        <Icon icon={group.icon} size="sm" />
        {/* The HEADLINE step and a real heading — the `focal` voice carries the type half of CD3 while the
            level carries the outline, which is why the two are declared separately. */}
        <Heading level={level} voice="focal">
          {group.label}
        </Heading>
      </Row>
      {/* CAPPED ON THE PARAGRAPH, AND READ AT THE PROSE STEP (side-eye 2026-08-19 P3, both passes). A measure
          belongs to the line, not to the pane; and a blurb is this surface's TEACHING sentence — what a
          library is for, read by someone who has not built it — so it is not set at the gloss voice's 10.5px
          footnote step. `prose` lifts the step and relaxes the leading and changes nothing else. */}
      <Text className="max-w-(--reading-measure)" prose={true} voice="gloss">
        {group.description}
      </Text>
      {entries.length === 0 ? null : (
        <Stack gap="field">
          {/* THE RANK IS THE CONTRIBUTION'S WORD, not the host's: regex ranks by recency, world-info by
              attachment, tags by use — a hardcoded "Most used" was true of exactly one library. */}
          <Text as="span" voice="kicker">
            {collection.preview?.label}
          </Text>
          <Row className="flex-wrap" gap="tight">
            {/* KEYED ON THE MEMBER'S OWN ID (side-eye 2026-08-19 P1-1): the owner's corpus has two books with
                the same name, and a name is not an identity. */}
            {entries.map((entry) => (
              <Badge intent="neutral" key={entry.id} tone="soft">
                {entry.label}
                {showDetail ? (
                  <Text as="span" voice="datum">
                    {entry.detail}
                  </Text>
                ) : null}
              </Badge>
            ))}
            {remainder > 0 ? (
              <Badge intent="neutral" tone="ghost">
                +{remainder} more
              </Badge>
            ) : null}
          </Row>
        </Stack>
      )}
    </Stack>
  );
}
