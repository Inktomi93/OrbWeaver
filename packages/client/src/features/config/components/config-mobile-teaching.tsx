// The Configuration teaching frame ON A PHONE — a header over the LIST pane, mobile viewport only.
//
// WHY IT EXISTS AT ALL (side-eye 2026-08-19 P2, "the teaching frame never renders on a phone"): the
// welcome is CONTENT, and the mobile one-shell rule makes the LIST the whole screen until a member is
// selected — at which point CONTENT arrives already showing that member's editor. So there is no reachable
// path on a 430px screen that ever paints the welcome, and the app's best onboarding copy was structurally
// invisible to exactly the reader who most needs it: a cold one, on the device where three 40px group rows
// and a void are the entire first impression.
//
// IT IS THE COMPACT ARM, NOT THE WELCOME MOVED. The hearth is a two-column launcher split with a chip
// census — it needs the pane it was designed for, and re-rendering it above a list would put every
// collection on the screen twice. What travels is the FRAME: the surface's one opening statement, the
// sentence under it, and one line per collection. Every string is `config-copy`'s or the contribution's
// own (`label` + `blurb`), so a fourth collection appears here from the same ONE door row that puts it in
// the welcome and the LIST — this file names no collection (`collection` config groups only).
//
// THE VIEWPORT REGIME IS READ FROM `#state`, NEVER FROM A CONTAINER QUERY. The list's own root is a
// `<Container>`, so an `@md:`/`@max-md:` variant here would ask how wide the LIST PANE is — and the docked
// desktop pane is 272px, narrower than any phone, so the container arm would paint this header on the
// desktop workspace beside the welcome that already says it. `useMobileViewport` is the shell's published
// 48rem regime and is the same input `resolvePanelMode` uses to decide list-as-screen in the first place,
// which is precisely the condition this header is about.

import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ConfigGroupRegistry } from "#state";
import { useActiveConfigGroup, useCollectionSelection, useMobileViewport } from "#state";
import { CONFIG_WELCOME } from "../lib/config-copy.ts";
import { collectionGroups } from "../lib/order-groups.ts";

export interface ConfigMobileTeachingProps {
  readonly groups: ConfigGroupRegistry;
}

export function ConfigMobileTeaching({ groups }: ConfigMobileTeachingProps): ReactElement | null {
  const isMobile = useMobileViewport();
  const selection = useCollectionSelection();
  const activeGroup = useActiveConfigGroup();
  // WITH A MEMBER OPEN THE LIST IS NOT THE SCREEN — the shell has pushed that member's editor over it, and
  // the reader who taps Back is returning to a list they have already been taught. Teaching copy that
  // survives every navigation is chrome; this is the cold-start frame, so it is scoped to the cold state.
  if (!isMobile || selection !== null || activeGroup !== null) {
    return null;
  }
  return (
    <Stack data-slot="config-mobile-teaching" gap="row">
      <Stack gap="tight">
        {/* `level={2}`, the welcome's own rank: this is the same statement in a different pane, not a
            subordinate one. The masthead voice stays on the desktop hero — at 430px the display step over a
            list is a banner, and the frame's job here is to be read once and scrolled past. */}
        <Heading level={2}>{CONFIG_WELCOME.title}</Heading>
        <Text voice="gloss">{CONFIG_WELCOME.teaching}</Text>
      </Stack>
      {/* One line per collection, in the SAME canonical `(order, id)` order the list groups below it use,
          so the frame reads as a key to the list rather than as a second list. */}
      <Stack gap="tight">
        {collectionGroups(groups).map((group) => (
          <Text key={group.id} voice="gloss">
            <Text as="span" voice="label">
              {group.label}
            </Text>{" "}
            {group.description}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}
