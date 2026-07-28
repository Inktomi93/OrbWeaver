// The STATUS tab (panel-redesign DESIGN.md §4 "Status" — the roster's GAME-STATE lens): portrait-led
// instrument cards — D44 portrait · name · relationship badge ON the name line (rendered ONLY when the
// roster character also stands in the scene cast, §12.2.3 — never a phantom "neutral") · the quiet
// volatile `status` line (free text; the word "mood" is reserved for Scene cast where the field exists) ·
// HP + pool meters (labeled `value/max` text is the datum; bars decorative) · lit condition chips with
// resolved glyphs. NO encounter banner in lite (full-only engine, §12.2). Pool color rides the ONE
// `resolvePoolColor` derivation (`def.color ?? trackColor(ordinal)`).
//
// VEILED (P3, §6) — the host-only standing-secrets ledger is a WIRED-WHEN-READY section shell
// (`RpgVeiledSection`): the deception plane is being built by its own lane; until entries arrive the
// shell renders NOTHING (the honest empty plane — no filler). The section + crown-gold grammar land here
// because secrets are game-state about the roster (the same lens this tab already is).
//
// EDIT-in-place (§3.2): a pool value edits through `editSnapshot` — host-only in v1 (`canEditShared`).
// The patch is a WHOLE-`actorState`-array overlay ([merge-clear]: an array leaf replaces wholesale).

import type { RpgActorView, RpgSnapshotState, RpgTrackerView } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { MeterRow, RelationshipBadge, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot } from "../hooks/use-rpg-mutations";
import { resolveConditionGlyph } from "../lib/glyphs";
import { resolvePoolColor, trackColorProps } from "../lib/track-color";
import { RpgVeiledSection } from "./rpg-veiled-section";

type ActorVolatile = NonNullable<RpgActorView["volatile"]>;

/** Build the whole `actorState` overlay for `editSnapshot` with ONE actor's volatile mutated. Every actor
 *  with volatile is re-sent (the array is a full replace under [merge-clear]); the target actor's volatile
 *  runs through `mutate`, everything else rides forward unchanged. One home for every Status hand-edit
 *  (pool value, HP, conditions). */
function actorStatePatch(
  actors: readonly RpgActorView[],
  actorKey: string,
  mutate: (v: ActorVolatile) => ActorVolatile,
): { readonly actorState: RpgSnapshotState["actorState"] } {
  const actorState = actors
    .filter((a): a is RpgActorView & { volatile: ActorVolatile } => a.volatile !== null)
    .map((a) => (`${a.actorRef.kind}:${a.name}` === actorKey ? mutate(a.volatile) : a.volatile));
  return { actorState };
}

/** The Status hand-edit callbacks for one card — all whole-`actorState` overlays (host only, D108: NOT
 *  gated by `trackersReadOnly`). Clamps values to `≥ 0` (§12.3 Tier-1; over-max is representable fiction).
 *  NOTE: no HP arm — in LITE health IS a pool (D86); the `hp` FIELD is a full-mode combat slot (born null
 *  in lite, never rendered). The health pool (VIT etc.) rides the pool arm like any other. */
interface StatusCardEdit {
  readonly onEditPool: (poolName: string, next: number) => void;
  readonly onAddCondition: (name: string) => void;
  readonly onRemoveCondition: (name: string) => void;
}

/** The scene-cast row this roster actor also stands in (the §12.2.3 relationship join) — or undefined.
 *  A `user` actor never joins (cast rows are NPCs), so its predicate matches nothing: no row, no badge. */
function castRowFor(actor: RpgActorView, cast: RpgTrackerView["cast"]): RpgTrackerView["cast"][number] | undefined {
  const ref = actor.actorRef;
  return cast.find((c) => (ref.kind === "character" ? c.characterId === ref.characterId : ref.kind === "cast" && c.key === ref.castKey));
}

/** The card's meter stack: the actor's pools on their resolved colors (lite health is one of these pools —
 *  D86; there is no separate HP field in lite). Pools are hand-editable when `edit` is supplied (host). */
function actorMeters(actor: RpgActorView, edit?: StatusCardEdit): readonly ReactNode[] {
  const volatile = actor.volatile;
  if (volatile === null) {
    return [];
  }
  return volatile.pools.map((pool, i) => {
    const def = actor.sheet.poolDefs.find((d) => d.name === pool.name);
    return (
      <MeterRow
        key={pool.name}
        label={pool.name}
        value={pool.value}
        max={pool.max}
        {...trackColorProps(resolvePoolColor(def?.color ?? null, i))}
        {...(edit === undefined ? {} : { onEditValue: (next: number): void => edit.onEditPool(pool.name, next) })}
      />
    );
  });
}

export interface RpgStatusTabProps {
  readonly state: RpgPanelState;
}

/** The Status tab — portrait instrument cards + the (wired-when-ready) veiled ledger. */
export function RpgStatusTab({ state }: RpgStatusTabProps): ReactElement {
  const { tracker, canEditShared, chatId, isHost } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });

  if (tracker.actors.length === 0) {
    return <Text tone="muted">No one on the roster yet — add characters in Members.</Text>;
  }

  // One patch-and-mutate for a target actor's volatile ([merge-clear] whole-array replace). Host only.
  const patch = (actorKey: string, mutate: (v: ActorVolatile) => ActorVolatile): void =>
    editSnapshot.mutate({ chatId, patch: actorStatePatch(tracker.actors, actorKey, mutate) });

  const editFor = (actor: RpgActorView): StatusCardEdit | undefined => {
    if (!canEditShared) {
      return;
    }
    const key = `${actor.actorRef.kind}:${actor.name}`;
    return {
      onEditPool: (poolName, next): void =>
        patch(key, (v) => ({ ...v, pools: v.pools.map((p) => (p.name === poolName ? { ...p, value: Math.max(0, next) } : p)) })),
      onAddCondition: (name): void =>
        patch(key, (v) =>
          v.conditions.some((c) => c.name === name) ? v : { ...v, conditions: [...v.conditions, { name, stat: null, modifier: 0, turnsLeft: null }] },
        ),
      onRemoveCondition: (name): void => patch(key, (v) => ({ ...v, conditions: v.conditions.filter((c) => c.name !== name) })),
    };
  };

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      <Text size="label" tone="muted" transform="caps" className="tracking-micro">
        Roster — {tracker.actors.length}
      </Text>
      {tracker.actors.map((actor) => {
        const edit = editFor(actor);
        return <RpgStatusCard key={`${actor.actorRef.kind}:${actor.name}`} actor={actor} cast={tracker.cast} {...(edit === undefined ? {} : { edit })} />;
      })}
      {/* The host-only Veiled ledger (P3) — LIVE off `rpg.revealHidden` (its own boundary; empty/error ⇒
          null). PERMISSION-omit: a member never mounts it, so member DOM carries zero veiled content. */}
      {isHost ? <RpgVeiledSection chatId={chatId} /> : null}
    </Stack>
  );
}

interface RpgStatusCardProps {
  readonly actor: RpgActorView;
  readonly cast: RpgTrackerView["cast"];
  readonly edit?: StatusCardEdit;
}

/** One roster instrument card: portrait · name+badge · class · status line · meters · condition chips. */
function RpgStatusCard({ actor, cast, edit }: RpgStatusCardProps): ReactElement {
  const volatile = actor.volatile;
  const castRow = castRowFor(actor, cast);
  const meters = actorMeters(actor, edit);

  return (
    <Stack gap="field" data-slot="rpg-status-card" className="rounded-card border border-border bg-card px-block py-row">
      <Row gap="block" align="center" justify="between">
        <Row gap="field" align="center" className="min-w-0">
          <Avatar size="md" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
            {actor.name.slice(0, 1).toUpperCase()}
          </Avatar>
          <Stack gap="field" className="min-w-0">
            <Row gap="field" align="center" className="min-w-0">
              <Text as="span" size="label" weight="semibold" className="truncate">
                {actor.name}
              </Text>
              {castRow === undefined ? null : <RelationshipBadge relationship={castRow.relationship} />}
            </Row>
            {volatile === null || volatile.status === "" ? null : (
              <Text as="span" size="micro" tone="muted" className="truncate">
                {volatile.status}
              </Text>
            )}
          </Stack>
        </Row>
        {actor.sheet.className === "" ? null : (
          <Text as="span" size="micro" tone="muted" className="shrink-0">
            {actor.sheet.className}
          </Text>
        )}
      </Row>

      {meters.length === 0 ? null : <Stack gap="field">{meters}</Stack>}

      <ConditionChips
        conditions={volatile?.conditions ?? []}
        {...(edit === undefined ? {} : { onAdd: edit.onAddCondition, onRemove: edit.onRemoveCondition })}
      />
    </Stack>
  );
}

/** Condition chips: lit danger badges (glyph + name). Editable ⇒ each chip removes on click (× affordance)
 *  and an "add condition" input appends (§12.3 Tier-2: an empty/duplicate name never sends). */
function ConditionChips({
  conditions,
  onAdd,
  onRemove,
}: {
  readonly conditions: ActorVolatile["conditions"];
  readonly onAdd?: (name: string) => void;
  readonly onRemove?: (name: string) => void;
}): ReactElement | null {
  if (conditions.length === 0 && onAdd === undefined) {
    return null;
  }
  return (
    <Row gap="field" className="flex-wrap" data-slot="rpg-conditions">
      {conditions.map((cond) => (
        <Badge key={cond.name} tone="soft" size="sm" intent="danger">
          <Icon icon={resolveConditionGlyph(cond.name)} size="xs" />
          {cond.name}
          {onRemove === undefined ? null : (
            <Button intent="ghost" size="sm" className="!size-4 !p-0" onClick={(): void => onRemove(cond.name)} title={`Remove ${cond.name}`}>
              <Icon icon={X} size="xs" />
            </Button>
          )}
        </Badge>
      ))}
      {onAdd === undefined ? null : (
        <TrackerValue
          ariaLabel="Add condition"
          display=""
          placeholder="+ condition"
          onEdit={(next): void => {
            const trimmed = next.trim();
            if (trimmed !== "") {
              onAdd(trimmed);
            }
          }}
          className="h-control-sm w-control-col"
        />
      )}
    </Row>
  );
}
