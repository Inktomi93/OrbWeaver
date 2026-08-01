// The INVENTORY tab (panel-redesign DESIGN.md §4 "Inventory" — the PACK): the member-selector pill row
// (§12.1.3 — the ONE scope-selector primitive Sheet uses; self default) + the pinned currency line above
// the OSRS item grid. The pinned line is the PARTY TOTAL derivation (§12.2 — no purse entity exists; totals
// SUM per-actor wallets, "party total — N carried by <viewer>"), the Sheet chip and band coin being the
// other two zoom levels of the same number. Grid = `cols="cell"` (§5 — container-driven: 2-up at the 320px
// mobile column, 3-up in the 480px docked panel). Cells: resolved glyph (#37 — the host-picked `item.icon`
// seal name wins, else the §12.5 keyword resolver; aria-hidden, the NAME is the datum), the NAME, the ×N
// read, and the item LOCATION (#37a — the data was already stored), and quest-bound = the accent dot. There
// is NO ghost socket and no fake 28-slot pack (side-eye 08-01 killed the dashed one: an empty box with no
// word and no click is not an affordance); the host's `AddRow` below the grid is the one growth home. No
// encumbrance UI — not modeled.
//
// #37b — the COMPACT/LIST toggle: one view knob (grid default) on the Pack kicker row; the LIST view is a
// row per item (glyph · name · ×qty · location · description) for the read-it-all posture.
// #37c — the ICON PICKER (host): clicking a cell's glyph opens a popover of `ITEM_ICON_CHOICES`; the pick
// writes `item.icon` through `editSnapshot` (a hand-cosmetic write — the model can't touch `icon`, so no
// lock is stamped). The "last change" provenance line stays the client-side ephemeral diff (§12.2.8).
//
// RV-5 — HAND AUTHORING (host, `canEditShared`): the pack had no add/edit at all, and `location` (which the
// schema stores and the extraction guidance asks the model for) was display-only. The shared `AddRow` mints an
// item (a name is required — no "Item 3" orphans), and the LIST view is the EDIT view: name · quantity ·
// location · description are click-to-edit in place, with a confirmed delete. The GRID authors the SAME
// field set from a tile popover (owner dogfood, 2026-07-31 — the same components, the same `PackEdit`
// callbacks, so one plane still keeps one authoring home). Every hand write stamps the actor's
// `…inventory` lock path (#10 — the same grammar the conditions plane uses: the model writes this plane, so a
// hand edit pins it, visibly, with a Release on the section).

import type { RpgActorOp, RpgActorView, RpgInventoryItem, RpgTrackerView } from "@orb/contracts/rpg";
import { rpgActorLockBase } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Coins, Icon, LayoutGrid, List, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { AddRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useInventoryDiff } from "../hooks/use-inventory-diff";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchActor } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import type { PackEdit } from "./rpg-pack-rows";
import { PackBody } from "./rpg-pack-rows";
import { RpgSubjectSelect } from "./rpg-subject-select";

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
  // The ephemeral "last change" line (§12.2.8) — a client-side diff, no TurnRef, cleared on reload.
  const lastChange = useInventoryDiff(items);

  const edit = state.canEditShared && actor !== undefined ? buildPackEdit(state, actor, patchActor) : undefined;
  // The #10 hand-lock pin for the pack plane: present only when the host pinned it by editing (the same
  // grammar the conditions plane uses — a hand edit stops the story writing here until it is released).
  const lockPath = actor === undefined ? null : `${rpgActorLockBase(actor.actorRef)}.inventory`;
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
      <PurseLine totals={totals} carried={carried} actorName={actor?.name} />

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
          <Button intent="ghost" size="sm" className="!size-6 !p-0" aria-label={toggleLabel} title={toggleLabel} onClick={onToggleView}>
            <Icon icon={view === "grid" ? List : LayoutGrid} size="xs" />
          </Button>
        )}
      </Row>
      {items.length === 0 ? (
        // No dead end (§4.3 rule 1): an empty pack still offers the host the first item.
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

/** The §12.2.8 ephemeral "last change" microline (client-side diff; null = nothing). */
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
 *  would only be one the host has to release; the DATA ops (add/patch/remove) stamp the actor's `…inventory`
 *  path, so the pin + Release on the Pack section says the story stopped owning this plane. */
function buildPackEdit(state: RpgPanelState, actor: RpgActorView, patchActor: ReturnType<typeof usePatchActor>): PackEdit {
  const write = (op: RpgActorOp, autoLock = true): void =>
    patchActor.mutate({ chatId: state.chatId, targetRef: actor.actorRef, ops: [op], ...(autoLock ? {} : { autoLock: false }) });
  return {
    onPickIcon: (id, icon): void => write({ op: "patchItem", id, patch: { icon } }, false),
    onPatchItem: (id, patch): void => write({ op: "patchItem", id, patch }),
    onRemoveItem: (id): void => write({ op: "removeItem", id }),
    // The item id is a blob-internal string the SERVER mints (the model applier's own `mintItemId` seam) — a
    // hand caller never names an item's identity.
    onAddItem: (name): void => write({ op: "addItem", item: { name } }),
  };
}

/** The pinned party-purse line — totals per currency + the "N on <actor>" carried note. */
function PurseLine({
  totals,
  carried,
  actorName,
}: {
  readonly totals: ReadonlyMap<string, number>;
  readonly carried: readonly { readonly name: string; readonly amount: number }[];
  readonly actorName: string | undefined;
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
