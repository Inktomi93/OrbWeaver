// The Configuration WELCOME — CONTENT with no member selected (config-rail-spec.md §2 C-8). Never null:
// a designed teaching frame plus one LAUNCHER CARD per registered collection, drawn from the same four
// contract fields the group band uses (`label` · `icon` · `useCount` · `create`) plus the card-only
// `blurb`, so a fourth collection appears in both places from ONE door row.
//
// ONE VOICE, NOT TWO (deviation from empty-states.html frame 2, stated here so it is not read as an
// oversight): the mock draws a second "Pick something to edit" voice for the populated case, switched on
// "are all counts zero". That switch needs every collection's count AT THE PARENT, and a count is an
// OWNER-supplied hook — reading N of them in a loop is exactly the rules-of-hooks violation the
// one-child-per-contribution shape (TrailWidget/HomeTile precedent) exists to avoid. The teaching voice is
// never wrong for either reader, and each card carries its own live count, which is what actually tells a
// populated user where they stand.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Package } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { orderCollections } from "../lib/order-collections";

export interface ConfigWelcomeProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigWelcome({ collections }: ConfigWelcomeProps): ReactElement {
  return (
    <Stack align="center" gap="block" className="mx-auto max-w-prose p-block" data-slot="config-welcome">
      <Icon icon={Package} size="lg" />
      <Heading level={2}>The parts every chat is built from</Heading>
      <Text prose={true}>
        Tags label your library. Regex scripts rewrite text on its way in or out. World books hold the lore your characters draw on. Nothing here is required —
        each one starts paying off the moment you make the first.
      </Text>
      <Grid cols="cell" gap="field">
        {orderCollections(collections).map((collection) => (
          <CollectionLauncher collection={collection} key={collection.id} />
        ))}
      </Grid>
    </Stack>
  );
}

/** One launcher card. Its own component so each collection's `useVisible`/`useCount` hooks are called
 *  unconditionally, once, in a fixed position (the `TrailWidget` shape). */
function CollectionLauncher({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const create = collection.create.useRun();
  if (!visible) {
    return null;
  }
  return (
    <Card data-slot="collection-launcher" data-collection={collection.id}>
      <Stack gap="tight">
        <Row align="center" gap="field">
          <Icon icon={collection.icon} size="sm" />
          <Text as="span" voice="kicker">
            {collection.label}
          </Text>
          {count === undefined ? null : (
            <Text as="span" voice="datum">
              {count}
            </Text>
          )}
        </Row>
        <Text voice="gloss">{collection.blurb}</Text>
        <Button intent="ghost" onClick={create} size="sm" type="button">
          {collection.create.label}
        </Button>
      </Stack>
    </Card>
  );
}
