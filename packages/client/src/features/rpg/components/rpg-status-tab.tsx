// The STATUS tab (panel-redesign DESIGN.md §4 "Status" — the roster's GAME-STATE lens): portrait-led
// instrument cards — D44 portrait · name · relationship badge ON the name line (rendered ONLY when the
// roster character also stands in the scene cast, §12.2.3 — never a phantom "neutral") · the quiet
// volatile `status` line (free text; the word "mood" is reserved for Scene cast where the field exists) ·
// the actor's TRACKER meters (labeled `value/max` text is the datum; bars decorative) · lit condition chips
// with resolved glyphs. NO encounter banner in lite (full-only engine, §12.2). Tracker color rides the ONE
// `resolveTrackerColor` derivation (`def.color ?? trackColor(ordinal)`).
//
// VEILED (P3, §6) — the host-only standing-secrets ledger is a WIRED-WHEN-READY section shell
// (`RpgVeiledSection`): the deception plane is being built by its own lane; until entries arrive the
// shell renders NOTHING (the honest empty plane — no filler). The section + crown-gold grammar land here
// because secrets are game-state about the roster (the same lens this tab already is).
//
// EDIT-in-place (§3.2): a tracker VALUE edits through `editSnapshot` (the volatile plane) — host-only in v1
// (`canEditShared`); the patch is a WHOLE-`actorState`-array overlay ([merge-clear] keyed-array grammar —
// the server correlates by `actorRefKey`). A tracker's MAX is a DEF datum (`config.trackers` — the ONE def
// home since the tracked-field unification), so editing it here writes `updateConfig`: the SAME write the
// Game tab's Trackers section makes, against the same one list. That is what the merge bought — there is no
// second max to drift from (the old sheet-vs-snapshot max duplication is gone). The §12.3 lower-max-drags-
// value tell still rides both writes in one gesture: the def max drops, the volatile value follows.
//
// PER-FIELD PINS (#10): every volatile hand edit stamps its FINE lock path (`actorState.<refKey>.status`,
// `…trackerValues.<key>`, `…conditions`) via `lockPaths`, and the pin glyph renders ON the locked value (a
// meter row's leading slot, the status line, the condition row) — model-writable fields only; hand-only
// planes (the def's max/color, level, title) never lock, so they never pin. The legacy section-scoped
// `actorState` lock keeps its section pin + Release.

import type { RpgActorRef, RpgActorView, RpgTrackerDef, RpgTrackerValue, RpgTrackerView } from "@orb/contracts/rpg";
import { RPG_TRACKER_VALUE_EMPTY, trackerNumber } from "@orb/contracts/rpg";
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
import { useEditSnapshot, useUpdateConfig } from "../hooks/use-rpg-mutations";
import { resolveConditionGlyph } from "../lib/glyphs";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color";
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
  readonly onEditTracker: (key: string, next: number) => void;
  /** Lower/raise a tracker's MAX (§12.3 clamp-and-tell). The max lives on the DEF, so this writes the game's
   *  tracker list; returns the consequence when lowering below the value (the value is DRAGGED to the new max
   *  in the SAME commit) so the caller can show the microline; `null` ⇒ no drag. Enforces the `max ≥ 1` floor. */
  readonly onEditTrackerMax: (key: string, nextMax: number) => { readonly draggedTo: number } | null;
  /** Write a `text`/`list` tracker's reading (a list splits on commas — the same one input, one grammar). */
  readonly onEditTrackerText: (key: string, next: string) => void;
  readonly onAddCondition: (name: string) => void;
  readonly onRemoveCondition: (name: string) => void;
  /** Edit the volatile status line (free text — "on edge"). */
  readonly onEditStatus: (next: string) => void;
  /** Is this actor's fine lock path pinned (#10)? `sub` appends to the actor's lock base. */
  readonly isLocked: (sub: string) => boolean;
  /** Release a fine lock path (`sub` as above) — "let the model write it again". */
  readonly onRelease: (sub: string) => void;
}

/** Overlay ONE tracker's reading on an actor's volatile plane, keeping the value TOTAL (`{value,max,items}`
 *  always whole — the snapshot merge recurses into this object, so a partial write would strand the previous
 *  reading's siblings on the new one). */
function writeTrackerValue(v: ActorVolatile, key: string, patch: Partial<RpgTrackerValue>): ActorVolatile {
  return { ...v, trackerValues: { ...v.trackerValues, [key]: { ...RPG_TRACKER_VALUE_EMPTY, ...v.trackerValues[key], ...patch } } };
}

/** The scene-cast row this roster actor also stands in (the §12.2.3 relationship join) — or undefined.
 *  A `user` actor never joins (cast rows are NPCs), so its predicate matches nothing: no row, no badge. */
function castRowFor(actor: RpgActorView, cast: RpgTrackerView["cast"]): RpgTrackerView["cast"][number] | undefined {
  const ref = actor.actorRef;
  return cast.find((c) => (ref.kind === "character" ? c.characterId === ref.characterId : ref.kind === "cast" && c.key === ref.castKey));
}

/** One editable METER tracker with the §12.3 max-lowering value-drag TELL: lowering the max below the value
 *  drags the value down (in `onEditTrackerMax`'s one commit) and shows a transient microline ("Vitality 24 →
 *  20 — max lowered"); an overfull value (value above max) reads in warning tone. The note clears on the next
 *  server render (the value prop changes) — a purely local, ephemeral consequence line. A pinned tracker
 *  (`…trackerValues.<key>` locked, #10) leads with the pin glyph + its Release. */
function StatusTrackerMeter({
  def,
  value,
  ordinal,
  edit,
}: {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue;
  readonly ordinal: number;
  readonly edit?: StatusCardEdit;
}): ReactElement {
  const reading = trackerNumber(value) ?? 0;
  const max = def.max ?? Math.max(reading, 1);
  const [note, setNote] = useState<string | null>(null);
  // Clear a stale note when the server value/max changes under us (a fresh render = the drag landed).
  const [seen, setSeen] = useState(`${reading}/${max}`);
  const key = `${reading}/${max}`;
  if (key !== seen) {
    setSeen(key);
    setNote(null);
  }
  const lockSub = `.trackerValues.${def.key}`;
  const release = edit === undefined || !edit.isLocked(lockSub) ? undefined : (): void => edit.onRelease(lockSub);
  // The transient drag-tell wins; otherwise the standing HINT — the host-authored meaning that is also what
  // the model reads (one gloss, two audiences). Empty hint = no microline.
  const effectiveNote = note ?? (def.hint === "" ? null : def.hint);
  return (
    <MeterRow
      label={def.label}
      value={reading}
      max={max}
      valueWarning={reading > max}
      {...trackColorProps(resolveTrackerColor(def.color, ordinal))}
      {...(release === undefined ? {} : { leading: <RpgFieldLock onRelease={release} /> })}
      {...(edit === undefined
        ? {}
        : {
            onEditValue: (next: number): void => edit.onEditTracker(def.key, next),
            onEditMax: (next: number): void => {
              const result = edit.onEditTrackerMax(def.key, next);
              setNote(result === null ? null : `${def.label} ${reading} → ${result.draggedTo} — max lowered`);
            },
          })}
      {...(effectiveNote === null ? {} : { note: effectiveNote })}
    />
  );
}

/** One TEXT/LIST tracker's row — a labelled reading, editable in place. A meter is the bar above; these are
 *  the observations (the old text cast-fields), which have no bar to draw. */
function StatusTrackerText({
  def,
  value,
  edit,
}: {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue;
  readonly edit?: StatusCardEdit;
}): ReactElement {
  const display = def.shape === "list" ? (value.items ?? []).join(", ") : String(value.value ?? "");
  return (
    <Row gap="field" align="baseline" justify="between">
      <Text as="span" size="label" tone="muted" {...(def.hint === "" ? {} : { title: def.hint })}>
        {def.label}
      </Text>
      <TrackerValue
        ariaLabel={`${def.label} value`}
        display={display}
        placeholder="—"
        {...(edit === undefined ? {} : { onEdit: (next: string): void => edit.onEditTrackerText(def.key, next) })}
        className="min-w-0 flex-1 text-right"
      />
    </Row>
  );
}

/** The card's meter stack: the actor's METER trackers on their resolved colors (lite health is one of these —
 *  D86; there is no separate HP field in lite). The trackers an actor carries are resolved SERVER-side (the
 *  one carrier predicate), so this renders exactly what the model was allowed to write. */
function actorMeters(actor: RpgActorView, edit?: StatusCardEdit): readonly ReactNode[] {
  const values = actor.volatile?.trackerValues ?? {};
  return actor.trackers
    .filter((def) => def.shape === "meter")
    .map((def, i) => (
      <StatusTrackerMeter key={def.key} def={def} value={values[def.key] ?? RPG_TRACKER_VALUE_EMPTY} ordinal={i} {...(edit === undefined ? {} : { edit })} />
    ));
}

/** The card's non-meter tracker rows (text + list observations). */
function actorTrackerRows(actor: RpgActorView, edit?: StatusCardEdit): readonly ReactNode[] {
  const values = actor.volatile?.trackerValues ?? {};
  return actor.trackers
    .filter((def) => def.shape !== "meter")
    .map((def) => <StatusTrackerText key={def.key} def={def} value={values[def.key] ?? RPG_TRACKER_VALUE_EMPTY} {...(edit === undefined ? {} : { edit })} />);
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
  const updateConfig = useUpdateConfig({ trpc, invalidation });

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
      onEditTracker: (key, next): void => patch(ref, `.trackerValues.${key}`, (v) => writeTrackerValue(v, key, { value: Math.max(0, next) })),
      onEditTrackerText: (key, next): void => {
        const def = actor.trackers.find((d) => d.key === key);
        const trimmed = next.trim();
        patch(ref, `.trackerValues.${key}`, (v) =>
          writeTrackerValue(v, key, def?.shape === "list" ? { items: trimmed === "" ? [] : trimmed.split(",").map((x) => x.trim()) } : { value: trimmed }),
        );
      },
      onEditTrackerMax: (key, nextMax): { readonly draggedTo: number } | null => {
        const clampedMax = Math.max(1, nextMax); // the real `max ≥ 1` floor (§12.3 Tier-1)
        const reading = trackerNumber(actor.volatile?.trackerValues[key]);
        // The MAX is a DEF datum (`config.trackers` — the ONE def home): write the game's tracker list, the
        // SAME write the Game tab's Trackers section makes. Whole-list replace (the wire shape).
        updateConfig.mutate({ chatId, patch: { trackers: tracker.trackerDefs.map((d) => (d.key === key ? { ...d, max: clampedMax } : d)) } });
        // Lowering below the value drags the stored VALUE down in the SAME gesture (never a silent truncate).
        const drag = reading !== null && reading > clampedMax;
        if (drag) {
          patch(ref, `.trackerValues.${key}`, (v) => writeTrackerValue(v, key, { value: clampedMax }));
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
  const trackerRows = actorTrackerRows(actor, edit);

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
      {trackerRows.length === 0 ? null : <Stack gap="field">{trackerRows}</Stack>}

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
