// The INVENTORY tab (panel-redesign DESIGN.md §4 "Inventory" — the PACK): the member-selector pill row
// (§12.1.3 — the ONE scope-selector primitive Sheet uses; self default) + the pinned currency line above
// the OSRS item grid. The pinned line is the PARTY TOTAL derivation (§12.2 — no purse entity exists; totals
// SUM per-actor wallets, "party total — N carried by <viewer>"), the Sheet chip and band coin being the
// other two zoom levels of the same number. Grid = `cols="cell"` (§5 — 5-up docked, 6-up mobile,
// container-driven). Cells: resolved glyph (#37 — the host-picked `item.icon` seal name wins, else the
// §12.5 keyword resolver; aria-hidden, the NAME is the datum on `title` + a visually-hidden line), qty in
// the corner, the item LOCATION as a micro line (#37a — display-only, the data was already stored),
// quest-bound = the ember dot, plus ONE dashed ghost socket (growth affordance — never a fake 28-slot
// pack; no encumbrance UI, not modeled).
//
// #37b — the COMPACT/LIST toggle: one view knob (grid default) on the Pack kicker row; the LIST view is a
// row per item (glyph · name · ×qty · location · description) for the read-it-all posture.
// #37c — the ICON PICKER (host): clicking a cell's glyph opens a popover of `ITEM_ICON_CHOICES`; the pick
// writes `item.icon` through `editSnapshot` (a hand-cosmetic write — the model can't touch `icon`, so no
// lock is stamped). The "last change" provenance line stays the client-side ephemeral diff (§12.2.8).

import type { RpgActorView, RpgInventoryItem, RpgTrackerView } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Coins, Icon, LayoutGrid, List } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useInventoryDiff } from "../hooks/use-inventory-diff";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import { ITEM_ICON_CHOICES, resolveItemIcon } from "../lib/glyphs";
import { actorStatePatch } from "../lib/volatile-patch";
import { Kicker } from "./rpg-kicker";
import { RpgSubjectSelect } from "./rpg-subject-select";

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

/** The #37c icon-picker popover body — the curated `ITEM_ICON_CHOICES` grid; picking writes the name. */
function ItemIconPicker({ itemName, onPick }: { readonly itemName: string; readonly onPick: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" className="max-w-control-col flex-wrap">
      {Object.entries(ITEM_ICON_CHOICES).map(([name, glyph]) => (
        <Button key={name} intent="ghost" size="sm" className="!size-8 !p-0" title={`${itemName}: use the ${name} icon`} onClick={(): void => onPick(name)}>
          <Icon icon={glyph} size="sm" />
        </Button>
      ))}
    </Row>
  );
}

/** The item GLYPH — a plain decoration for a viewer; for the HOST a popover trigger opening the #37c
 *  icon picker (the NAME text stays the datum either way). */
function ItemGlyph({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  const glyph = <Icon icon={resolveItemIcon(item.icon, item.name, item.type)} size="md" className="text-muted-foreground" />;
  if (onPickIcon === undefined) {
    return glyph;
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button intent="ghost" size="sm" className="!h-auto !p-0" aria-label={`${item.name} icon`} title="Pick an icon">
            {glyph}
          </Button>
        }
      />
      <PopoverPopup>
        <ItemIconPicker itemName={item.name} onPick={onPickIcon} />
      </PopoverPopup>
    </Popover>
  );
}

/** One GRID pack cell — glyph · corner qty · quest ember · the #37a location micro line. */
function PackCell({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  const questBound = QUEST_TYPE_RE.test(item.type);
  return (
    <Stack
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
      <ItemGlyph item={item} {...(onPickIcon === undefined ? {} : { onPickIcon })} />
      {/* #37a — the item LOCATION (where it's kept/stashed), display-only; empty = nothing. */}
      {item.location === "" ? null : (
        <Text as="span" size="micro" tone="muted" className="max-w-full truncate">
          {item.location}
        </Text>
      )}
      {/* The mock's 5/6-up density carries the NAME on title/hover; the visually-hidden text
          keeps it the accessible datum (the tracker-kit a11y model — glyphs stay decoration). */}
      <Text as="span" size="micro" className="sr-only">
        {item.name}
      </Text>
    </Stack>
  );
}

/** One LIST row (#37b) — glyph · name · ×qty · location · description, the read-it-all posture. */
function PackListRow({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" align="center" className="rounded-card border border-border bg-card px-block py-row" data-slot="rpg-pack-row">
      <ItemGlyph item={item} {...(onPickIcon === undefined ? {} : { onPickIcon })} />
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="baseline" className="min-w-0">
          <Text as="span" size="label" weight="semibold" className="truncate">
            {item.name}
          </Text>
          {item.quantity > 1 ? (
            <Text as="span" size="micro" tone="muted" className="shrink-0 tabular-nums">
              ×{item.quantity}
            </Text>
          ) : null}
          {item.location === "" ? null : (
            <Text as="span" size="micro" tone="muted" className="shrink-0 truncate">
              · {item.location}
            </Text>
          )}
        </Row>
        {item.description === "" ? null : (
          <Text size="micro" tone="muted" className="truncate">
            {item.description}
          </Text>
        )}
      </Stack>
    </Row>
  );
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

  const pickIconFor = state.canEditShared && actor !== undefined ? buildPickIconFor(state, actor, editSnapshot) : undefined;
  const toggleLabel = view === "grid" ? "Show as a list" : "Show as a grid";

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

      {items.length === 0 ? (
        <Text tone="muted">Empty pack — the story fills it.</Text>
      ) : (
        <Stack gap="field">
          <Row gap="field" align="center" justify="between">
            <Kicker>Pack — {items.length}</Kicker>
            {/* #37b — the compact-grid / list view knob (a display preference, session-local). */}
            <Button
              intent="ghost"
              size="sm"
              className="!size-6 !p-0"
              aria-label={toggleLabel}
              title={toggleLabel}
              onClick={(): void => setView(view === "grid" ? "list" : "grid")}
            >
              <Icon icon={view === "grid" ? List : LayoutGrid} size="xs" />
            </Button>
          </Row>
          <PackBody view={view} items={items} {...(pickIconFor === undefined ? {} : { pickIconFor })} />
          <LastChangeLine lastChange={lastChange} />
        </Stack>
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
    <Text size="micro" tone="muted" data-slot="rpg-pack-last-change">
      last change — {lastChange}
    </Text>
  );
}

/** Build the #37c icon-pick writer — the host's pick writes `item.icon` via the whole-actorState
 *  overlay. No lock stamped (the model can't write `icon`, so there is nothing to pin — `lockPaths: []`
 *  skips the coarse default). */
function buildPickIconFor(
  state: RpgPanelState,
  actor: RpgActorView,
  editSnapshot: ReturnType<typeof useEditSnapshot>,
): (itemId: string) => (icon: string) => void {
  return (itemId) =>
    (icon): void =>
      editSnapshot.mutate({
        chatId: state.chatId,
        patch: actorStatePatch(state.tracker.actors, actor.actorRef, (v) => ({
          ...v,
          inventory: v.inventory.map((it) => (it.id === itemId ? { ...it, icon } : it)),
        })),
        lockPaths: [],
      });
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
    <Row gap="field" align="center" className="flex-wrap rounded-card border border-border bg-card px-block py-row" data-slot="rpg-purse-line">
      <Icon icon={Coins} size="sm" label="Party purse" />
      {[...totals.entries()].map(([name, total]) => {
        const own = carried.find((c) => c.name === name)?.amount ?? 0;
        const carriedNote = actorName !== undefined && own > 0 && own !== total ? ` — ${own} on ${actorName}` : "";
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
  );
}

/** The pack body — the OSRS grid (+ the one ghost socket) or the #37b list view. */
function PackBody({
  view,
  items,
  pickIconFor,
}: {
  readonly view: "grid" | "list";
  readonly items: readonly RpgInventoryItem[];
  readonly pickIconFor?: (itemId: string) => (icon: string) => void;
}): ReactElement {
  if (view === "grid") {
    return (
      <Grid cols="cell" gap="field">
        {items.map((item) => (
          <PackCell key={item.id} item={item} {...(pickIconFor === undefined ? {} : { onPickIcon: pickIconFor(item.id) })} />
        ))}
        {/* ONE dashed ghost socket — the pack's growth affordance (never a fake capacity grid). */}
        <Stack
          aria-hidden={true}
          gap="field"
          align="center"
          className="aspect-square justify-center rounded-card border border-dashed border-border px-field py-field"
          data-slot="rpg-pack-ghost"
        />
      </Grid>
    );
  }
  return (
    <Stack gap="field">
      {items.map((item) => (
        <PackListRow key={item.id} item={item} {...(pickIconFor === undefined ? {} : { onPickIcon: pickIconFor(item.id) })} />
      ))}
    </Stack>
  );
}
