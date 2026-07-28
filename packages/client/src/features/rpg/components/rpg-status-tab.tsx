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
// EDIT-in-place (§3.2): a pool VALUE edits through `editSnapshot` (the volatile plane) — host-only in v1
// (`canEditShared`); the patch is a WHOLE-`actorState`-array overlay ([merge-clear] keyed-array grammar —
// the server correlates by `actorRefKey`). A pool MAX edits through `patchSheet` (the sheet `poolDefs`
// plane) — the SINGLE authoritative home for the max (`chat-ops/tracker-view.resolveVolatile` projects the
// displayed max FROM poolDefs), so a Status max-edit and a Sheet max-edit are the SAME write and never
// drift. The §12.3 lower-max-drags-value tell rides BOTH writes in one gesture: patchSheet lowers the def
// max, editSnapshot drags the volatile value down to it.
//
// PER-FIELD PINS (#10): every volatile hand edit stamps its FINE lock path (`actorState.<refKey>.status`,
// `…pools.<name>`, `…conditions`) via `lockPaths`, and the pin glyph renders ON the locked value (a pool
// row's leading slot, the status line, the condition row) — model-writable fields only; hand-only planes
// (poolDefs max/color, level, title) never lock, so they never pin. The legacy section-scoped `actorState`
// lock keeps its section pin + Release.

import type { RpgActorRef, RpgActorView, RpgTrackerView } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { MeterRow, RelationshipBadge, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchSheet } from "../hooks/use-rpg-mutations";
import { resolveConditionGlyph } from "../lib/glyphs";
import { resolvePoolColor, trackColorProps } from "../lib/track-color";
import { actorLockBase, actorStatePatch } from "../lib/volatile-patch";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgVeiledSection } from "./rpg-veiled-section";

type ActorVolatile = NonNullable<RpgActorView["volatile"]>;

/** The Status hand-edit callbacks for one card — all whole-`actorState` overlays (host only, D108: NOT
 *  gated by `trackersReadOnly`). Clamps values to `≥ 0` (§12.3 Tier-1; over-max is representable fiction).
 *  NOTE: no HP arm — in LITE health IS a pool (D86); the `hp` FIELD is a full-mode combat slot (born null
 *  in lite, never rendered). The health pool (VIT etc.) rides the pool arm like any other. */
interface StatusCardEdit {
  readonly onEditPool: (poolName: string, next: number) => void;
  /** Lower/raise a pool's MAX (§12.3 clamp-and-tell). Returns the consequence when lowering below the value
   *  (the value is DRAGGED to the new max in the SAME commit) so the caller can show the microline; `null`
   *  ⇒ no drag (max ≥ value, or raised). Enforces the `max ≥ 1` floor. */
  readonly onEditPoolMax: (poolName: string, nextMax: number) => { readonly draggedTo: number } | null;
  readonly onAddCondition: (name: string) => void;
  readonly onRemoveCondition: (name: string) => void;
  /** Edit the volatile status line (free text — "on edge"). */
  readonly onEditStatus: (next: string) => void;
  /** Is this actor's fine lock path pinned (#10)? `sub` appends to the actor's lock base. */
  readonly isLocked: (sub: string) => boolean;
  /** Release a fine lock path (`sub` as above) — "let the model write it again". */
  readonly onRelease: (sub: string) => void;
}

/** The scene-cast row this roster actor also stands in (the §12.2.3 relationship join) — or undefined.
 *  A `user` actor never joins (cast rows are NPCs), so its predicate matches nothing: no row, no badge. */
function castRowFor(actor: RpgActorView, cast: RpgTrackerView["cast"]): RpgTrackerView["cast"][number] | undefined {
  const ref = actor.actorRef;
  return cast.find((c) => (ref.kind === "character" ? c.characterId === ref.characterId : ref.kind === "cast" && c.key === ref.castKey));
}

type ActorPool = ActorVolatile["pools"][number];

/** One editable pool meter with the §12.3 max-lowering value-drag TELL: lowering the max below the value
 *  drags the value down (in `onEditPoolMax`'s one commit) and shows a transient microline ("Vitality 24 →
 *  20 — max lowered"); an overfull value (value above max) reads in warning tone. The note clears on the next
 *  server render (the pool prop changes) — a purely local, ephemeral consequence line. A pinned pool
 *  (`…pools.<name>` locked, #10) leads with the pin glyph + its Release. */
function StatusPoolMeter({
  pool,
  ordinal,
  color,
  edit,
}: {
  readonly pool: ActorPool;
  readonly ordinal: number;
  readonly color: string | null;
  readonly edit?: StatusCardEdit;
}): ReactElement {
  const [note, setNote] = useState<string | null>(null);
  // Clear a stale note when the server value/max changes under us (a fresh render = the drag landed).
  const [seen, setSeen] = useState(`${pool.value}/${pool.max}`);
  const key = `${pool.value}/${pool.max}`;
  if (key !== seen) {
    setSeen(key);
    setNote(null);
  }
  const lockSub = `.pools.${pool.name}`;
  const release = edit === undefined || !edit.isLocked(lockSub) ? undefined : (): void => edit.onRelease(lockSub);
  return (
    <MeterRow
      label={pool.name}
      value={pool.value}
      max={pool.max}
      valueWarning={pool.value > pool.max}
      {...trackColorProps(resolvePoolColor(color, ordinal))}
      {...(release === undefined ? {} : { leading: <RpgFieldLock onRelease={release} /> })}
      {...(edit === undefined
        ? {}
        : {
            onEditValue: (next: number): void => edit.onEditPool(pool.name, next),
            onEditMax: (next: number): void => {
              const result = edit.onEditPoolMax(pool.name, next);
              setNote(result === null ? null : `${pool.name} ${pool.value} → ${result.draggedTo} — max lowered`);
            },
          })}
      {...(note === null ? {} : { note })}
    />
  );
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
    return <StatusPoolMeter key={pool.name} pool={pool} ordinal={i} color={def?.color ?? null} {...(edit === undefined ? {} : { edit })} />;
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
  const patchSheet = usePatchSheet({ trpc, invalidation });

  if (tracker.actors.length === 0) {
    return <Text tone="muted">No one on the roster yet — add characters in Members.</Text>;
  }

  // One patch-and-mutate for a target actor's volatile (whole-array overlay, keyed server-side by
  // `actorRefKey`). Every write stamps its FINE lock path (#10 — `lockSub` appends to the actor's base).
  const patch = (ref: RpgActorRef, lockSub: string, mutate: (v: ActorVolatile) => ActorVolatile): void =>
    editSnapshot.mutate({ chatId, patch: actorStatePatch(tracker.actors, ref, mutate), lockPaths: [`${actorLockBase(ref)}${lockSub}`] });

  const editFor = (actor: RpgActorView): StatusCardEdit | undefined => {
    if (!canEditShared) {
      return;
    }
    const ref = actor.actorRef;
    const base = actorLockBase(ref);
    return {
      onEditPool: (poolName, next): void =>
        patch(ref, `.pools.${poolName}`, (v) => ({ ...v, pools: v.pools.map((p) => (p.name === poolName ? { ...p, value: Math.max(0, next) } : p)) })),
      onEditPoolMax: (poolName, nextMax): { readonly draggedTo: number } | null => {
        const clampedMax = Math.max(1, nextMax); // the real `max ≥ 1` floor (§12.3 Tier-1)
        const pool = actor.volatile?.pools.find((p) => p.name === poolName);
        // The MAX is a SHEET datum (poolDefs — the single source): write it via patchSheet, not the volatile.
        // The def is upserted (a Status-minted volatile pool the host never defined gets its def created here,
        // so the max has a durable home from the first edit). Whole-`poolDefs` replace (the wire shape).
        const defs = actor.sheet.poolDefs;
        const hasDef = defs.some((d) => d.name === poolName);
        const nextDefs = hasDef
          ? defs.map((d) => (d.name === poolName ? { ...d, max: clampedMax } : d))
          : [...defs, { name: poolName, max: clampedMax, color: null }];
        patchSheet.mutate({ chatId, actorRef: ref, patch: { poolDefs: nextDefs } });
        // Lowering below the value drags the volatile VALUE down in the SAME gesture (never a silent truncate);
        // the read-side clamp (`resolveVolatile`) also enforces this, but writing it keeps the durable value honest.
        const drag = pool !== undefined && pool.value > clampedMax;
        if (drag) {
          patch(ref, `.pools.${poolName}`, (v) => ({ ...v, pools: v.pools.map((p) => (p.name === poolName ? { ...p, value: clampedMax } : p)) }));
        }
        return drag ? { draggedTo: clampedMax } : null;
      },
      onAddCondition: (name): void =>
        patch(ref, ".conditions", (v) =>
          v.conditions.some((c) => c.name === name) ? v : { ...v, conditions: [...v.conditions, { name, stat: null, modifier: 0, turnsLeft: null }] },
        ),
      onRemoveCondition: (name): void => patch(ref, ".conditions", (v) => ({ ...v, conditions: v.conditions.filter((c) => c.name !== name) })),
      onEditStatus: (next): void => patch(ref, ".status", (v) => ({ ...v, status: next.trim() })),
      isLocked: (sub): boolean => tracker.lockedPaths.includes(`${base}${sub}`),
      onRelease: (sub): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${base}${sub}`] }),
    };
  };

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      {/* The section-scoped hand-lock pin (§12.3): a Status hand edit stamps the TOP-LEVEL `actorState`
          path (the whole-array overlay), so one lock ⇒ one pin ⇒ one Release, on the section label. */}
      <Kicker
        trailing={
          canEditShared && tracker.lockedPaths.includes("actorState") ? (
            <RpgFieldLock onRelease={(): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: ["actorState"] })} />
          ) : null
        }
      >
        Roster — {tracker.actors.length}
      </Kicker>
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
            <StatusLine status={volatile?.status ?? ""} {...(edit === undefined ? {} : { edit })} />
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
        {...(edit === undefined ? {} : { onAdd: edit.onAddCondition, onRemove: edit.onRemoveCondition, edit })}
      />
    </Stack>
  );
}

/** The quiet volatile STATUS line (free text — "on edge"). Editable-in-place for the host (#2); a pinned
 *  status (`…status` locked, #10) carries the pin + Release beside the value. Read-only + empty ⇒ nothing. */
function StatusLine({ status, edit }: { readonly status: string; readonly edit?: StatusCardEdit }): ReactElement | null {
  if (edit === undefined) {
    if (status === "") {
      return null;
    }
    return (
      <Text as="span" size="micro" tone="muted" className="truncate">
        {status}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center" className="min-w-0">
      <TrackerValue
        ariaLabel="Status line"
        display={status}
        placeholder="status…"
        tone="muted"
        size="micro"
        onEdit={edit.onEditStatus}
        className="!w-auto min-w-0 max-w-full field-sizing-content"
      />
      {edit.isLocked(".status") ? <RpgFieldLock onRelease={(): void => edit.onRelease(".status")} /> : null}
    </Row>
  );
}

/** Condition chips: lit danger badges (glyph + name). Editable ⇒ each chip removes on click (× affordance)
 *  and an "add condition" input appends (§12.3 Tier-2: an empty/duplicate name never sends). A pinned
 *  conditions plane (`…conditions` locked, #10) leads with the pin + Release. */
function ConditionChips({
  conditions,
  onAdd,
  onRemove,
  edit,
}: {
  readonly conditions: ActorVolatile["conditions"];
  readonly onAdd?: (name: string) => void;
  readonly onRemove?: (name: string) => void;
  readonly edit?: StatusCardEdit;
}): ReactElement | null {
  if (conditions.length === 0 && onAdd === undefined) {
    return null;
  }
  return (
    <Row gap="field" className="flex-wrap" data-slot="rpg-conditions">
      {edit === undefined || !edit.isLocked(".conditions") ? null : <RpgFieldLock onRelease={(): void => edit.onRelease(".conditions")} />}
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
          className="w-control-col"
        />
      )}
    </Row>
  );
}
