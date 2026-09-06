// The INVENTORY tab ("Inventory" — the PACK): the member-selector pill row
// (the ONE scope-selector primitive Sheet uses; self default) + the pinned currency line above
// the OSRS item grid. The pinned line is the PARTY TOTAL derivation (no purse entity exists; totals
// SUM per-actor wallets, "party total — N carried by <viewer>"), the Sheet chip and band coin being the
// other two zoom levels of the same number. Grid = `cols="cell"` (container-driven: 2-up at the 320px
// mobile column, 3-up in the 480px docked panel). Cells: resolved glyph (#37 — the host-picked `item.icon`
// seal name wins, else the keyword resolver; aria-hidden, the NAME is the datum), the NAME, the ×N
// read, and the item LOCATION (#37a — the data was already stored), and quest-bound = the accent dot. There
// is NO ghost socket and no fake 28-slot pack (side-eye 08-01 killed the dashed one: an empty box with no
// word and no click is not an affordance); the host's `AddRow` below the grid is the one growth home. No
// encumbrance UI — not modeled.
//
// #37b — the COMPACT/LIST toggle: one view knob (grid default) on the Pack kicker row; the LIST view is a
// row per item (glyph · name · ×qty · location · description) for the read-it-all posture.
// #37c — the ICON PICKER (host): clicking a cell's glyph opens a popover of `ITEM_ICON_CHOICES`; the pick
// writes `item.icon` through `editSnapshot` (a hand-cosmetic write — the model can't touch `icon`, so no
// lock is stamped). The "last change" provenance line stays the client-side ephemeral diff.
//
// RV-5 — HAND AUTHORING (host, `canEditShared`): the pack had no add/edit at all, and `location` (which the
// schema stores and the extraction guidance asks the model for) was display-only. The shared `AddRow` mints an
// item (a name is required — no "Item 3" orphans), and the LIST view is the EDIT view: name · quantity ·
// location · description are click-to-edit in place, with a confirmed delete. The GRID authors the SAME
// field set from a tile popover (owner dogfood, 2026-07-31 — the same components, the same `PackEdit`
// callbacks, so one plane still keeps one authoring home).
//
// #78 — THE PIN IS PER ITEM, AND IT IS VISIBLE. A hand write used to stamp the actor's whole `…inventory`
// plane, which fenced the model out of the ENTIRE pack from the first manual add: measured live, a perfect
// model update (the `location` of the very item the host had added) was folded away, so seeding your pack by
// hand permanently disabled inventory tracking for that actor. The server now pins the ITEM the hand touched,
// on the FIELDS it claimed (`…volatile.inventory.<id>.<field>`), and this panel is the other half of that
// ruling: each pinned item carries its own chip — the list lens's one-tap Release, the grid tile's "Pinned"
// tell plus the Release inside the tile editor it already opens — so the fence is legible and reversible
// where it was silent and permanent. The SECTION pin survives for LEGACY plane-wide locks only (stored
// `fieldLocks` are never rewritten), which is also the bug it hid: it was read at
// `actorState.<key>.inventory`, a path missing the `volatile` segment the server has always written, so it
// could never fire and the plane trap had no affordance at all.

import type { RpgActorOp, RpgActorView, RpgInventoryItem, RpgTrackerView } from "@orb/contracts/rpg";
import { rpgActorVolatileLockBase } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Coins, Icon, LayoutGrid, List, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { AddRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useInventoryDiff } from "../hooks/use-inventory-diff.ts";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useEditSnapshot, usePatchActor } from "../hooks/use-rpg-mutations.ts";
import { actorKey } from "../lib/actor-key.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";
import { Kicker } from "./rpg-kicker.tsx";
import type { PackEdit } from "./rpg-pack-rows.tsx";
import { PackBody } from "./rpg-pack-rows.tsx";
import { RpgSubjectSelect } from "./rpg-subject-select.tsx";

/** The viewer's own `user` actor, or the first roster actor as a fallback. */
function viewerActor(actors: readonly RpgActorView[], viewerUserId: string): RpgActorView | undefined {
  return actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
}

/** Party totals per currency name, summed across every PARTY actor's wallet (a purse is a SUM).
 *  Cast NPCs are excluded on purpose: `tracker.actors` carries them since R2 (which is how their pack finally
 *  became reachable at all), but an NPC's coin is hers, not the party's — summing it would make the pinned
 *  total lie the moment the story hands a stranger a bribe. */
function partyTotals(actors: RpgTrackerView["actors"]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const actor of actors) {
    if (actor.actorRef.kind === "npc") {
      continue;
    }
    for (const coin of actor.volatile?.wallet ?? []) {
      totals.set(coin.name, (totals.get(coin.name) ?? 0) + coin.amount);
    }
  }
  return totals;
}

export interface RpgInventoryTabProps {
  readonly state: RpgPanelState;
}

/** The Inventory tab — the member-selector pill row (self default) + the pinned party-purse
 *  line + the glyph item grid (or the #37b list view) + one ghost socket. */
export function RpgInventoryTab({ state }: RpgInventoryTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  const patchActor = usePatchActor({ trpc, invalidation });
  const fallback = viewerActor(state.tracker.actors, state.viewerUserId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const actor = state.tracker.actors.find((a) => actorKey(a) === selectedKey) ?? fallback;
  const volatile = actor?.volatile ?? null;
  const items = volatile?.inventory ?? [];
  const totals = partyTotals(state.tracker.actors);
  const carried = volatile?.wallet ?? [];
  // Is the SELECTED subject part of the party total? Cast NPCs are reachable subjects since R2 (that is how
  // their pack became visible at all) but their coin is theirs, not the party's — the same exclusion
  // `partyTotals` makes, read back at the note that would otherwise contradict it.
  const isPartyActor = actor !== undefined && actor.actorRef.kind !== "npc";
  // The ephemeral "last change" line — a client-side diff, no TurnRef, cleared on reload.
  const lastChange = useInventoryDiff(items);

  const edit = state.canEditShared && actor !== undefined ? buildPackEdit(state, actor, patchActor, editSnapshot) : undefined;
  // The LEGACY plane-wide pack pin. Nothing MINTS this coarse path any more (#78 — a hand edit pins the ITEM
  // it touched), but a snapshot written before that ruling carries one and stored `fieldLocks` are never
  // rewritten, so the READ side keeps honoring it exactly as written — and a pin with no Release is a trap,
  // so the section keeps the affordance that lets a host hand the whole pack back. The `volatile` segment is
  // a REAL path segment: the merge walks the stored JSON, so the path without it matched nothing at all and
  // this pin never rendered for anyone.
  const lockPath = actor === undefined ? null : `${rpgActorVolatileLockBase(actor.actorRef)}.inventory`;
  const release =
    edit === undefined || lockPath === null || !state.tracker.lockedPaths.includes(lockPath)
      ? undefined
      : (): void => editSnapshot.mutate({ chatId: state.chatId, patch: {}, releaseLocks: [lockPath] });

  return (
    <Stack gap="section" data-slot="rpg-inventory-tab">
      {/* The subject selector IS the identity line (owner ruling 2026-07-28 — no pill shelf): whose PACK
          is shown; clicking the name opens the member dropdown. Omitted on a one-actor roster. */}
      {state.tracker.actors.length > 1 && actor !== undefined ? (
        <Row gap="field" align="center">
          <RpgSubjectSelect actors={state.tracker.actors} value={actor} onChange={setSelectedKey} ariaLabel="Whose pack" />
        </Row>
      ) : null}
      {/* The carried NOTE is only meaningful for an actor whose coin is IN the total: `partyTotals` excludes
          npcs, so pairing an NPC's purse with the party total would read "N of the total is on her" about
          coin the total never counted. Her own purse still renders — on her Sheet chip, where it belongs. */}
      <PurseLine totals={totals} {...(isPartyActor ? { carried, actorName: actor.name } : {})} />

      <PackSection
        items={items}
        view={view}
        onToggleView={(): void => setView(view === "grid" ? "list" : "grid")}
        lastChange={lastChange}
        {...(edit === undefined ? {} : { edit })}
        {...(release === undefined ? {} : { onRelease: release })}
      />
    </Stack>
  );
}

/** The PACK section — kicker (+ the hand-lock pin when the plane is pinned) · the view knob · the grid/list
 *  body · the ephemeral last-change line · the host's add row. Split out of the tab so each piece stays under
 *  the complexity ceiling and the tab function reads as its own composition. */
function PackSection({
  items,
  view,
  onToggleView,
  lastChange,
  edit,
  onRelease,
}: {
  readonly items: readonly RpgInventoryItem[];
  readonly view: "grid" | "list";
  readonly onToggleView: () => void;
  readonly lastChange: string | null;
  readonly edit?: PackEdit;
  readonly onRelease?: () => void;
}): ReactElement {
  const toggleLabel = view === "grid" ? "Show as a list" : "Show as a grid";
  return (
    <Stack gap="field">
      <Row gap="field" align="center" justify="between">
        <Kicker trailing={onRelease === undefined ? null : <RpgFieldLock field="the pack" onRelease={onRelease} />}>Pack — {items.length}</Kicker>
        {/* #37b — the compact-grid / list view knob (a display preference, session-local). */}
        {items.length === 0 ? null : (
          <Button intent="ghost" size="glyph-md" aria-label={toggleLabel} title={toggleLabel} onClick={onToggleView}>
            <Icon icon={view === "grid" ? List : LayoutGrid} size="xs" />
          </Button>
        )}
      </Row>
      {items.length === 0 ? (
        // No dead end: an empty pack still offers the host the first item.
        <Text>Empty pack — {edit === undefined ? "the story fills it." : "the story fills it, or add the first thing below."}</Text>
      ) : (
        <PackBody view={view} items={items} {...(edit === undefined ? {} : { edit })} />
      )}
      <LastChangeLine lastChange={lastChange} />
      {edit === undefined ? null : (
        <AddRow
          ariaLabel="New item name"
          placeholder="name it first (e.g. Bone key)"
          actions={[{ key: "item", label: "Add item", icon: Plus, onAdd: edit.onAddItem }]}
        />
      )}
    </Stack>
  );
}

/** The ephemeral "last change" microline (client-side diff; null = nothing). */
function LastChangeLine({ lastChange }: { readonly lastChange: string | null }): ReactElement | null {
  if (lastChange === null) {
    return null;
  }
  return (
    <Text voice="gloss" data-slot="rpg-pack-last-change">
      last change — {lastChange}
    </Text>
  );
}

/** Build the host's pack writers (RV-5 + #37c) — every one is a `patchActor` OP on the actor's pack (R1: the
 *  panel names the gesture, the server applies it to the true head and derives the lock path). The ICON pick
 *  rides `autoLock:false` — the model cannot write `icon`, so there is no story write to stop and a pin there
 *  would only be one the host has to release; the DATA ops (add/patch/remove) stamp the ITEM's own claimed
 *  fields (#78), which is what the per-item chip + Release below reads back and hands away.
 *
 *  THE RELEASE RIDES `editSnapshot`, not a verb of its own: a lock is snapshot METADATA and `editSnapshot` is
 *  its ONE author (W1b), so an empty patch + `releaseLocks` is the whole gesture — the same call the ambient
 *  and tracker pins already make. */
function buildPackEdit(
  state: RpgPanelState,
  actor: RpgActorView,
  patchActor: ReturnType<typeof usePatchActor>,
  editSnapshot: ReturnType<typeof useEditSnapshot>,
): PackEdit {
  const write = (op: RpgActorOp, autoLock = true): void =>
    patchActor.mutate({ chatId: state.chatId, targetRef: actor.actorRef, ops: [op], ...(autoLock ? {} : { autoLock: false }) });
  // The item's pin PREFIX — its element path under the pack plane. Every stored lock at or below it belongs
  // to this item (`…inventory.<id>` itself, or a per-field `…<id>.<field>`), and Release hands back all of
  // them: a residue would be a pin no lens renders and no gesture can reach.
  const itemLocks = (itemId: string): readonly string[] => {
    const prefix = `${rpgActorVolatileLockBase(actor.actorRef)}.inventory.${itemId}`;
    return state.tracker.lockedPaths.filter((path) => path === prefix || path.startsWith(`${prefix}.`));
  };
  return {
    itemLocks,
    onReleaseItem: (itemId): void => editSnapshot.mutate({ chatId: state.chatId, patch: {}, releaseLocks: [...itemLocks(itemId)] }),
    onPickIcon: (id, icon): void => write({ op: "patchItem", id, patch: { icon } }, false),
    onPatchItem: (id, patch): void => write({ op: "patchItem", id, patch }),
    onRemoveItem: (id): void => write({ op: "removeItem", id }),
    // The item id is a blob-internal string the SERVER mints (the model applier's own `mintItemId` seam) — a
    // hand caller never names an item's identity.
    onAddItem: (name): void => write({ op: "addItem", item: { name } }),
  };
}

/** The pinned party-purse line — totals per currency + the "N on <actor>" carried note.
 *
 *  `carried`/`actorName` are OMITTED for a subject whose coin is not in the total (an npc — see the call
 *  site). The note's grammar is "N OF the total is on X"; pairing it with an excluded purse said the opposite
 *  of what `partyTotals` counted, and the reader has no way to tell which number lied. */
function PurseLine({
  totals,
  carried = [],
  actorName,
}: {
  readonly totals: ReadonlyMap<string, number>;
  readonly carried?: readonly { readonly name: string; readonly amount: number }[];
  readonly actorName?: string | undefined;
}): ReactElement | null {
  if (totals.size === 0) {
    return null;
  }
  return (
    <Row gap="field" align="center" className="flex-wrap rounded-base border border-border bg-card px-block py-row" data-slot="rpg-purse-line">
      <Icon icon={Coins} size="sm" label="Party purse" />
      {[...totals.entries()].map(([name, total]) => {
        const own = carried.find((c) => c.name === name)?.amount ?? 0;
        const carriedNote = actorName !== undefined && own > 0 && own !== total ? ` — ${own} on ${actorName}` : "";
        return (
          <Text key={name} as="span" voice="datum">
            {total} {name}
            {carriedNote === "" ? null : (
              <Text as="span" voice="gloss">
                {carriedNote}
              </Text>
            )}
          </Text>
        );
      })}
    </Row>
  );
}
