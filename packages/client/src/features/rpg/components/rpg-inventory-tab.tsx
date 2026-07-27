// The Inventory tab (Context-Panel-Program §4.4 lite trim, §4.3) — a currency line (wallet) pinned ABOVE a
// dense item grid (the OSRS inventory idiom: square cells, qty in the corner, item name on `title`). Wallet +
// inventory are first-class on EVERY actor (§2.6); this tab reads the viewer's own actor. No capacity /
// encumbrance UI (not modeled — do not invent). Items are display-only in W3b (the item-CRUD authoring door
// is the Game editor, deferred); the wallet is the reserved currency SLOT (§6 Q6), shown when present.

import type { RpgActorView } from "@orb/contracts/rpg";
import { Coins, Icon } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";

/** The viewer's own `user` actor, or the first roster actor as a fallback. */
function viewerActor(actors: readonly RpgActorView[], viewerUserId: string): RpgActorView | undefined {
  return actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
}

export interface RpgInventoryTabProps {
  readonly state: RpgPanelState;
}

/** The lite Inventory tab — the wallet currency line + the item grid. */
export function RpgInventoryTab({ state }: RpgInventoryTabProps): ReactElement {
  const actor = viewerActor(state.tracker.actors, state.viewerUserId);
  const volatile = actor?.volatile ?? null;
  const wallet = volatile?.wallet ?? [];
  const items = volatile?.inventory ?? [];

  return (
    <Stack gap="section" data-slot="rpg-inventory-tab">
      {wallet.length === 0 ? null : (
        <Row gap="field" align="center" className="flex-wrap rounded-card border border-border bg-card px-block py-row">
          <Icon icon={Coins} size="sm" label="Wallet" />
          {wallet.map((coin) => (
            <Text key={coin.name} as="span" size="label" className="tabular-nums">
              {coin.amount} {coin.name}
            </Text>
          ))}
        </Row>
      )}

      {items.length === 0 ? (
        <Text tone="muted">Empty pack — the story fills it.</Text>
      ) : (
        <Grid cols="tile" gap="field">
          {items.map((item) => (
            <Stack
              key={item.id}
              gap="field"
              align="center"
              className="relative aspect-square justify-center rounded-card border border-border bg-card px-field py-field text-center"
              title={item.description === "" ? item.name : `${item.name} — ${item.description}`}
            >
              {item.quantity > 1 ? (
                <Text as="span" size="micro" tone="muted" className="absolute right-field top-field tabular-nums">
                  {item.quantity}
                </Text>
              ) : null}
              <Text as="span" size="micro" className="line-clamp-2">
                {item.name}
              </Text>
            </Stack>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
