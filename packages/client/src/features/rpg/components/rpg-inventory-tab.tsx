// The INVENTORY tab (panel-redesign DESIGN.md §4 "Inventory" — the PACK): the member-selector pill row
// (§12.1.3 — the ONE scope-selector primitive Sheet uses; self default) + the pinned currency line above
// the OSRS item grid. The pinned line is the PARTY TOTAL derivation (§12.2 — no purse entity exists; totals
// SUM per-actor wallets, "party total — N carried by <viewer>"), the Sheet chip and band coin being the
// other two zoom levels of the same number. Grid = `cols="cell"` (§5 — 5-up docked, 6-up mobile,
// container-driven). Cells: resolved glyph (the §12.5 keyword resolver — aria-hidden; the NAME is the
// datum on `title` + a visually-hidden line), qty in the corner, quest-bound = the ember dot (keys off the
// model-written `type` matching /quest/ — §12.2; no quest link exists on items), plus ONE dashed ghost
// socket (growth affordance — never a fake 28-slot pack; no encumbrance UI, not modeled).
// The "last change" provenance line is DEFERRED (§12.2.8 — no per-item provenance datum exists; the honest
// arm is a client-side ephemeral snapshot diff, a follow-up seam).

import type { RpgActorView, RpgTrackerView } from "@orb/contracts/rpg";
import { Coins, Icon } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInventoryDiff } from "../hooks/use-inventory-diff";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { resolveItemGlyph } from "../lib/glyphs";

/** The stable selector key for an actor (the Sheet selector's own derivation — §12.1.3 one scope-selector
 *  semantics across tabs). */
function actorKey(actor: RpgActorView): string {
  return `${actor.actorRef.kind}:${actor.name}`;
}

/** The quest-bound tell — the model-written item `type` naming the quest taxonomy (§12.2). */
const QUEST_TYPE_RE = /quest/i;

/** The viewer's own `user` actor, or the first roster actor as a fallback. */
function viewerActor(actors: readonly RpgActorView[], viewerUserId: string): RpgActorView | undefined {
  return actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
}

/** Party totals per currency name, summed across every actor's wallet (§12.2 — a purse is a SUM). */
function partyTotals(actors: RpgTrackerView["actors"]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const actor of actors) {
    for (const coin of actor.volatile?.wallet ?? []) {
      totals.set(coin.name, (totals.get(coin.name) ?? 0) + coin.amount);
    }
  }
  return totals;
}

export interface RpgInventoryTabProps {
  readonly state: RpgPanelState;
}

/** The Inventory tab — the member-selector pill row (§12.1.3, self default) + the pinned party-purse
 *  line + the glyph item grid + one ghost socket. */
export function RpgInventoryTab({ state }: RpgInventoryTabProps): ReactElement {
  const fallback = viewerActor(state.tracker.actors, state.viewerUserId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const actor = state.tracker.actors.find((a) => actorKey(a) === selectedKey) ?? fallback;
  const volatile = actor?.volatile ?? null;
  const items = volatile?.inventory ?? [];
  const totals = partyTotals(state.tracker.actors);
  const carried = volatile?.wallet ?? [];
  // The ephemeral "last change" line (§12.2.8) — a client-side diff, no TurnRef, cleared on reload.
  const lastChange = useInventoryDiff(items);

  return (
    <Stack gap="section" data-slot="rpg-inventory-tab">
      {/* The shared member-selector pill row (§12.1.3 — the SAME mini-tab primitive Sheet scopes with;
          whose PACK is shown; self default). Omitted on a one-actor roster (nothing to scope). */}
      {state.tracker.actors.length > 1 && actor !== undefined ? (
        <ToggleGroup
          aria-label="Whose pack"
          value={[actorKey(actor)]}
          onValueChange={(next): void => {
            const picked = next[0];
            if (typeof picked === "string") {
              setSelectedKey(picked);
            }
          }}
        >
          {state.tracker.actors.map((a) => (
            <Toggle key={actorKey(a)} value={actorKey(a)}>
              {a.name}
            </Toggle>
          ))}
        </ToggleGroup>
      ) : null}
      {totals.size === 0 ? null : (
        <Row gap="field" align="center" className="flex-wrap rounded-card border border-border bg-card px-block py-row" data-slot="rpg-purse-line">
          <Icon icon={Coins} size="sm" label="Party purse" />
          {[...totals.entries()].map(([name, total]) => {
            const own = carried.find((c) => c.name === name)?.amount ?? 0;
            const carriedNote = actor !== undefined && own > 0 && own !== total ? ` — ${own} on ${actor.name}` : "";
            return (
              <Text key={name} as="span" size="label" className="tabular-nums">
                {total} {name}
                {carriedNote === "" ? null : (
                  <Text as="span" size="micro" tone="muted">
                    {carriedNote}
                  </Text>
                )}
              </Text>
            );
          })}
        </Row>
      )}

      {items.length === 0 ? (
        <Text tone="muted">Empty pack — the story fills it.</Text>
      ) : (
        <Stack gap="field">
          <Text size="label" tone="muted" transform="caps" className="tracking-micro">
            Pack — {items.length}
          </Text>
          <Grid cols="cell" gap="field">
            {items.map((item) => {
              const questBound = QUEST_TYPE_RE.test(item.type);
              return (
                <Stack
                  key={item.id}
                  gap="field"
                  align="center"
                  className="relative aspect-square justify-center rounded-card border border-border bg-card px-field py-field text-center"
                  data-slot="rpg-pack-cell"
                  title={item.description === "" ? item.name : `${item.name} — ${item.description}`}
                >
                  {item.quantity > 1 ? (
                    <Text as="span" size="micro" tone="muted" className="absolute right-field top-field tabular-nums">
                      {item.quantity}
                    </Text>
                  ) : null}
                  {questBound ? (
                    // The ember quest-bound dot (§3 voice: primary = the game's pulse); the `type` text on
                    // title carries the datum (never color-alone).
                    <Text as="span" aria-hidden={true} className="absolute left-field top-field text-primary" size="micro" title="quest item">
                      ●
                    </Text>
                  ) : null}
                  <Icon icon={resolveItemGlyph(item.name, item.type)} size="md" className="text-muted-foreground" />
                  {/* The mock's 5/6-up density carries the NAME on title/hover; the visually-hidden text
                      keeps it the accessible datum (the tracker-kit a11y model — glyphs stay decoration). */}
                  <Text as="span" size="micro" className="sr-only">
                    {item.name}
                  </Text>
                </Stack>
              );
            })}
            {/* ONE dashed ghost socket — the pack's growth affordance (never a fake capacity grid). */}
            <Stack
              aria-hidden={true}
              gap="field"
              align="center"
              className="aspect-square justify-center rounded-card border border-dashed border-border px-field py-field"
              data-slot="rpg-pack-ghost"
            />
          </Grid>
          {lastChange === null ? null : (
            <Text size="micro" tone="muted" data-slot="rpg-pack-last-change">
              last change — {lastChange}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
