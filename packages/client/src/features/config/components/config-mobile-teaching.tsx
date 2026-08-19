// The Configuration teaching frame ON A PHONE — a header over the LIST roster, mobile viewport only.
//
// WHY IT EXISTS AT ALL (side-eye 2026-08-19 P2, "the teaching frame never renders on a phone"): the
// welcome is CONTENT, and the mobile one-shell rule makes the LIST the whole screen until a member is
// selected — at which point CONTENT arrives already showing that member's editor. So there is no reachable
// path on a 430px screen that ever paints the welcome, and the app's best onboarding copy was structurally
// invisible to exactly the reader who most needs it: a cold one, on the device where three 40px group rows
// and a void are the entire first impression.
//
// IT IS THE COMPACT ARM, NOT THE WELCOME MOVED. The hearth is a two-column launcher split with a chip
// census — it needs the pane it was designed for, and re-rendering it above a roster would put every
// collection on the screen twice. What travels is the FRAME: the surface's one opening statement, the
// sentence under it, and one line per collection. Every string is `config-copy`'s or the contribution's
// own (`label` + `blurb`), so a fourth collection appears here from the same ONE door row that puts it in
// the welcome and the roster — this file names no collection.
//
// THE VIEWPORT REGIME IS READ FROM `#state`, NEVER FROM A CONTAINER QUERY. The roster's own root is a
// `<Container>`, so an `@md:`/`@max-md:` variant here would ask how wide the LIST PANE is — and the docked
// desktop pane is 272px, narrower than any phone, so the container arm would paint this header on the
// desktop workspace beside the welcome that already says it. `useMobileViewport` is the shell's published
// 48rem regime and is the same input `resolvePanelMode` uses to decide list-as-screen in the first place,
// which is precisely the condition this header is about.

import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useCollectionSelection, useMobileViewport } from "#state";
import { CONFIG_WELCOME } from "../lib/config-copy.ts";
import { orderCollections } from "../lib/order-collections.ts";

export interface ConfigMobileTeachingProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigMobileTeaching({ collections }: ConfigMobileTeachingProps): ReactElement | null {
  const isMobile = useMobileViewport();
  const selection = useCollectionSelection();
  // WITH A MEMBER OPEN THE LIST IS NOT THE SCREEN — the shell has pushed that member's editor over it, and
  // the reader who taps Back is returning to a list they have already been taught. Teaching copy that
  // survives every navigation is chrome; this is the cold-start frame, so it is scoped to the cold state.
  if (!isMobile || selection !== null) {
    return null;
  }
  return (
    <Stack data-slot="config-mobile-teaching" gap="row">
      <Stack gap="tight">
        {/* `level={2}`, the welcome's own rank: this is the same statement in a different pane, not a
            subordinate one. The masthead voice stays on the desktop hero — at 430px the display step over a
            roster is a banner, and the frame's job here is to be read once and scrolled past. */}
        <Heading level={2}>{CONFIG_WELCOME.title}</Heading>
        <Text voice="gloss">{CONFIG_WELCOME.teaching}</Text>
      </Stack>
      {/* One line per collection, in the SAME canonical `(order, id)` order the roster groups below it use,
          so the frame reads as a key to the list rather than as a second list. */}
      <Stack gap="tight">
        {orderCollections(collections).map((collection) => (
          <Text key={collection.id} voice="gloss">
            <Text as="span" voice="label">
              {collection.label}
            </Text>{" "}
            {collection.blurb}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}
