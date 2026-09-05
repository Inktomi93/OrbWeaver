// AN ACTIVE COLLECTION'S LANDING — the CONTENT a library shows while it is the reader's location and no
// member is open, in all three arms (empty · populated · settling). Its own module since the CONTENT
// surface crossed the `component-size` cap: this is a whole surface for ONE species, and the host that
// mounts it (`surfaces/config-content-surface.tsx`) only decides WHICH group is landed.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryErrorState } from "#data";
import type { CollectionInsight } from "#lib";
import type { CollectionGroupDefinition } from "#state";
import { CONFIG_COLLECTION_LANDING } from "../lib/config-copy.ts";
import { ConfigLibraryGlance } from "./config-library-glance.tsx";

/**
 * AN ACTIVE COLLECTION'S LANDING — the CONTENT a library shows while it is the reader's location and no
 * member is open. The copy is the CONTRIBUTION's (`label`, `description`, `insights`, `emptyText`,
 * `create.label`) and the ONE host sentence about the host's own geometry (`CONFIG_COLLECTION_LANDING.hint`).
 *
 * ITS HOOKS ARE UNCONDITIONAL FOR ONE CONTRIBUTION'S FIBER, WHICH IS WHY THE MOUNT IS KEYED (#1203 P0 —
 * this clause used to say "its own component so `useCount` runs unconditionally in a fixed position", which
 * was FALSE the moment two contributions shared this component's fiber). `useCount?.()` and
 * `insights?.useInsights()` are optional-hook calls: their COUNT is fixed per contribution and varies
 * BETWEEN contributions, so the invariant holds only while each library gets its own
 * instance. A component is not a fiber — the `key` at the mount site above is what makes that true.
 *
 * ═══ THE SPECIES CONTRACT, LANDED (#925 owner rulings 2026-09-02) ═══════════════════════════════════
 *
 * A collection is a GENUINELY DISTINCT species from a settings group and that distinctness is legitimate —
 * what is not legitimate is a door that leads nowhere. A settings group's CONTENT is its own body; a
 * collection's CONTENT is a MEMBER, so "the collection is active and no member is open" is a state the
 * settings species does not have, and it is the state this component owes an honest answer for.
 *
 * IT USED TO ANSWER ONLY THE EMPTY HALF (#1099 F5, landed): at zero it drew the library's own empty state,
 * and a POPULATED collection fell through to the four-library launcher landing — so activating Tags painted
 * a pane that talked about Tags, Regex, World Info and Rosters, and (before the arrival default) could
 * equally paint whatever OTHER group was still active. Both readings are the capability lie the ruling
 * names. That landing is retired outright (#1210): this pane answers for its library at every population,
 * and the NOTHING-active arm is the section's two-line teaching frame.
 *
 * THE THREE ARMS:
 *  · zero — the library's own empty state, VERBATIM from F5 (icon · title · `emptyText` · the create verb).
 *  · populated — the library's GLANCE (its name and what it is for), its own FACTS (#1209 — what is true
 *    of the library, which the LIST structurally cannot say), the host's one line about where the members
 *    are, and the create verb. No door to itself: the reader is already here.
 *  · settling — the name, the blurb and the hint, with no action row: the arm is not yet known, and the
 *    band's own `+` is on screen throughout, so nothing is unreachable during that beat.
 *  · FAILED — the name, and the read's own error with a retry (#1546). The settling ruling above SURVIVES
 *    and its INPUT changed: it was minted when `useCount` answered `number | undefined`, so a failed census
 *    and a settling one were the same value and this pane fell through to the POPULATED layout — glance,
 *    facts, hint and create verb over a library it could not count, with nothing said and nothing to press.
 *    A failure is not a quiet beat you wait out, so it is the one arm that is neither of the other two.
 */
export function ConfigCollectionLanding({ group }: { readonly group: CollectionGroupDefinition }): ReactNode {
  const collection = group.body.collection;
  const census = collection.useCount?.();
  const count = census?.count;
  const insights = collection.insights?.useInsights();
  const create = collection.create.useRun();
  // A census that FAILED and produced no number. A failed REFETCH over a warm cache still has a number, and
  // that arm keeps stating it — the pane says "couldn't load" only when it genuinely has nothing to say.
  if (census !== undefined && census.failed && count === undefined) {
    return (
      <Stack data-collection={group.id} data-slot="config-collection-landing" gap="section">
        {/* The library still NAMES itself while its census is broken: the reader navigated here on purpose,
            and a pane that answers a click with an error alone loses the one fact it never had to read. */}
        <ConfigLibraryGlance group={group} level={2} />
        <QueryErrorState label={group.label.toLowerCase()} onRetry={census.retry} />
      </Stack>
    );
  }
  if (count === 0) {
    return (
      <EmptyState
        action={
          <Button intent="primary" onClick={create} type="button">
            {collection.create.label}
          </Button>
        }
        // THE READER WITH NOTHING GETS THE MOST TEACHING, NOT THE LEAST (#1213). This arm passed `emptyText`
        // alone, so the one reader who has never seen the library — the first-timer the empty state exists
        // for — was the only one the surface declined to tell what it is FOR, while the settling arm below
        // and the LIST's own slot both showed the blurb. Two sentences, in the order a cold reader needs
        // them: what this library is, then that theirs is empty.
        description={
          <>
            {group.description} {collection.emptyText}
          </>
        }
        icon={<Icon icon={group.icon} size="lg" />}
        measure="wide"
        title={group.label}
        // The pane's ONLY content, so its title is the pane's heading — a landing that left `main` headingless
        // dead-ends heading navigation (the primitive's own `titleAs` note).
        titleAs="h2"
        titleStep="focal"
      />
    );
  }
  return (
    <Stack data-collection={group.id} data-slot="config-collection-landing" gap="section">
      {/* `level={2}`: this glance IS the pane, so its name is the pane's heading — the same rule the empty
          arm's `titleAs="h2"` follows one branch up. */}
      <ConfigLibraryGlance group={group} level={2} />
      {/* THE FACTS THE LIST CANNOT STATE (#1209). A settling read (`undefined`) draws no facts at all —
          the same "not a verdict" discipline the count arms follow — and a library that declares none
          simply lands on its glance, its hint and its create verb. */}
      {insights === undefined || insights.length === 0 ? null : <CollectionInsightList insights={insights} />}
      <Text className="max-w-(--reading-measure-prose)" voice="gloss">
        {CONFIG_COLLECTION_LANDING.hint}
      </Text>
      {count === undefined ? null : (
        <Row>
          <Button intent="secondary" onClick={create} size="sm" type="button">
            {collection.create.label}
          </Button>
        </Row>
      )}
    </Stack>
  );
}

/** The library's own facts, in ONE grammar for every collection: the statement (`label` · `value`) and, when
 *  the fact is about a single member, the door that opens it.
 *
 *  A ROW IS DATA UNLESS IT HAS A DOOR, which is the whole point of #1209: what this replaced was twelve
 *  chips that LOOKED like targets and were text, over members the LIST was already showing. So a fact with
 *  no `open` renders as a labelled value — no border, no hover, nothing that reads as pressable — and a fact
 *  WITH one renders a real `Button` whose accessible name is the contribution's own ("Open strip ooc"). The
 *  host never learns what a fact means; it draws `label · value · door` blind. */
function CollectionInsightList({ insights }: { readonly insights: readonly CollectionInsight[] }): ReactElement {
  return (
    <Stack data-slot="config-library-insights" gap="field">
      {insights.map((insight) => (
        <Row align="center" gap="field" key={insight.id}>
          <Text as="span" voice="kicker">
            {insight.label}
          </Text>
          <Text as="span" voice="datum">
            {insight.value}
          </Text>
          {insight.open === undefined ? null : (
            <Button className="ms-auto" intent="ghost" onClick={insight.open.run} size="sm" type="button">
              {insight.open.label}
            </Button>
          )}
        </Row>
      ))}
    </Stack>
  );
}
