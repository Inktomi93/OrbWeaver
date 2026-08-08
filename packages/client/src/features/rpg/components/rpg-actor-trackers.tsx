// The PER-ACTOR volatile blocks — the rows Status's roster card and the character TAKEOVER both render
// (the tracked-field unification §3 IA repair: Status is the only list of people, and expanding an entry IS
// the sheet, so the two surfaces are two zoom levels of ONE anatomy, never two implementations). Meter rows,
// text/list readings, the status line, and the condition chips live here; both consumers pass the same
// `ActorEdit`.
//
// EDIT-in-place (§3.2): a tracker VALUE edits through `editSnapshot` (the volatile plane) — host-only in v1
// (`canEditShared`); the patch is a WHOLE-`actorState`-array overlay ([merge-clear] keyed-array grammar —
// the server correlates by `actorRefKey`). A tracker's MAX edited HERE is THIS carrier's ceiling (owner
// amendment 2026-07-31): the def's `max` is the DEFAULT, `value.max` is the per-carrier override, and two
// characters may legitimately have different Vitality ceilings (the d20 max-HP reality). So the gesture is the
// intuitive one — the number you edit on a card is that character's — and it rides the SAME `editSnapshot`
// write as the reading beside it, never `updateConfig`. Anti-drift: setting the ceiling back to the default
// CLEARS the override (`resolveTrackerMaxOverride`), so a stored override always means "different on purpose",
// and an overridden row says so (the "default: N" microline).
//
// PER-FIELD PINS (#10): every volatile hand edit stamps its FINE lock path (`actorState.<refKey>.status`,
// `…trackerValues.<key>`, `…conditions`) via `lockPaths`, and the pin glyph renders ON the locked value —
// model-writable fields only; hand-only planes (the def's max/color, level, title) never lock, so they never
// pin.

import type { RpgActorView, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { RPG_TRACKER_VALUE_EMPTY, trackerCeiling, trackerNumber } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { MeterRow, TrackerValue } from "#components";
import { resolveConditionGlyph } from "../lib/glyphs.ts";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";

type ActorVolatile = NonNullable<RpgActorView["volatile"]>;

/** The hand-edit callbacks for ONE actor's volatile plane — all whole-`actorState` overlays (host only,
 *  D108: NOT gated by `trackersReadOnly`). Clamps values to `≥ 0` (§12.3 Tier-1; over-max is representable
 *  fiction). NOTE: no HP arm — in LITE health IS a tracker (D86); the `hp` FIELD is a full-mode combat slot
 *  (born null in lite, never rendered). */
export interface ActorEdit {
  readonly onEditTracker: (key: string, next: number) => void;
  /** Lower/raise THIS carrier's ceiling (§12.3 clamp-and-tell). Writes the per-carrier `value.max` override —
   *  cleared to absent when it equals the def's default (the anti-drift rule). Returns the consequence when
   *  lowering below the reading (the value is DRAGGED down in the SAME commit) so the caller can show the
   *  microline; `null` ⇒ no drag. Enforces the `max ≥ 1` floor. */
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

/** One editable METER tracker on its EFFECTIVE ceiling (`value.max ?? def.max` — the one resolver), with the
 *  §12.3 max-lowering value-drag TELL: lowering the ceiling below the reading drags the reading down (in
 *  `onEditTrackerMax`'s one commit) and shows a transient microline ("Vitality 24 → 20 — ceiling lowered");
 *  an overfull value (value above the ceiling) reads in warning tone. An OVERRIDDEN ceiling states the default
 *  it departs from ("default: 30") so a divergence is visible and reversible — typing the default back clears
 *  the override. The note clears on the next server render (the value prop changes). A pinned tracker
 *  (`…trackerValues.<key>` locked, #10) leads with the pin glyph + its Release. */
function ActorTrackerMeter({
  def,
  value,
  ordinal,
  edit,
}: {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue;
  readonly ordinal: number;
  readonly edit?: ActorEdit;
}): ReactElement {
  // NULLABLE ALL THE WAY DOWN (side-eye 08-01): a tracker the story has never written has no reading, and
  // `?? 0` published one — "0/40" beside an empty bar, announced as fact. The row draws the em-dash arm
  // instead. The CEILING stays whatever the resolver says (`value.max ?? def.max`), null included: a
  // poolless tracker has no `/max` half rather than a fabricated one.
  const reading = trackerNumber(value);
  const max = trackerCeiling(def, value);
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
  // An OVERRIDE states the default it DEPARTS FROM — a divergence you can see is a divergence you can undo.
  // (`?? null` because a wire row may simply omit the key; absent and null both mean "follow the default".)
  //
  // A DEPARTURE, NOT A PRESENCE (side-eye 2026-08-06 P3). The anti-drift rule says a stored `value.max`
  // equal to the def's default is cleared at WRITE time, so this read treated "an override exists" as "it
  // differs" — and every actor a story wrote a max onto without changing it printed `HP ceiling 20 —
  // default: 20` under its bar, once per meter per actor, which is a whole roster of lines saying nothing.
  // The write-side rule is the invariant; this is the READ refusing to depend on it. A value equal to the
  // default IS the default, however it got stored.
  const override = value.max ?? null;
  const overrideNote = override === null || def.max === null || override === def.max ? null : `${def.label} ceiling ${override} — default: ${def.max}`;
  // The transient drag-tell wins; then the override tell. The standing HINT moved to the label's hover
  // title (owner ruling 08-01) — echoed inline under every carrier's row it was a repeated line of noise;
  // the model still reads it in the reminder gloss (one hint, two audiences, different delivery).
  const effectiveNote = note ?? overrideNote;
  return (
    <MeterRow
      label={def.label}
      value={reading}
      max={max}
      valueWarning={reading !== null && max !== null && reading > max}
      {...(def.hint === "" ? {} : { labelTitle: def.hint })}
      {...trackColorProps(resolveTrackerColor(def.color, ordinal))}
      {...(release === undefined ? {} : { leading: <RpgFieldLock field={def.label} onRelease={release} /> })}
      {...(edit === undefined
        ? {}
        : {
            onEditValue: (next: number): void => edit.onEditTracker(def.key, next),
            // THIS character's ceiling — the def's max is the default it falls back to (§4 legibility).
            maxEditTitle:
              def.max === null
                ? `${def.label}'s ceiling for this character`
                : `${def.label}'s ceiling for this character — the game's default is ${def.max}; type it back to follow the default again.`,
            onEditMax: (next: number): void => {
              const result = edit.onEditTrackerMax(def.key, next);
              setNote(result === null ? null : `${def.label} ${reading} → ${result.draggedTo} — ceiling lowered`);
            },
          })}
      {...(effectiveNote === null ? {} : { note: effectiveNote })}
    />
  );
}

/** One TEXT/LIST tracker's row — a labelled reading, editable in place. A meter is the bar above; these are
 *  the observations (the old text cast-fields), which have no bar to draw. */
function ActorTrackerText({ def, value, edit }: { readonly def: RpgTrackerDef; readonly value: RpgTrackerValue; readonly edit?: ActorEdit }): ReactElement {
  const display = def.shape === "list" ? (value.items ?? []).join(", ") : String(value.value ?? "");
  return (
    <Row gap="field" align="baseline" justify="between">
      <Text as="span" voice="label" {...(def.hint === "" ? {} : { title: def.hint })}>
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

/** The actor's METER trackers on their resolved colors (lite health is one of these — D86; there is no
 *  separate HP field in lite). The trackers an actor carries are resolved SERVER-side (the one carrier
 *  predicate), so this renders exactly what the model was allowed to write. Renders NOTHING when the actor
 *  carries no meters — the caller owns the honest empty state (it knows whether any tracker exists at all). */
export function ActorMeters({ actor, edit }: { readonly actor: RpgActorView; readonly edit?: ActorEdit }): ReactElement | null {
  const values = actor.volatile?.trackerValues ?? {};
  const meters = actor.trackers.filter((def) => def.shape === "meter");
  if (meters.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      {meters.map((def, i) => (
        <ActorTrackerMeter key={def.key} def={def} value={values[def.key] ?? RPG_TRACKER_VALUE_EMPTY} ordinal={i} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}

/** The actor's non-meter tracker rows (text + list observations); nothing when it carries none. */
export function ActorTrackerRows({ actor, edit }: { readonly actor: RpgActorView; readonly edit?: ActorEdit }): ReactElement | null {
  const values = actor.volatile?.trackerValues ?? {};
  const rows = actor.trackers.filter((def) => def.shape !== "meter");
  if (rows.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      {rows.map((def) => (
        <ActorTrackerText key={def.key} def={def} value={values[def.key] ?? RPG_TRACKER_VALUE_EMPTY} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}

/** The quiet volatile STATUS line (free text — "on edge"). Editable-in-place for the host (#2); a pinned
 *  status (`…status` locked, #10) carries the pin + Release beside the value. Read-only + empty ⇒ nothing. */
export function StatusLine({ status, edit }: { readonly status: string; readonly edit?: ActorEdit }): ReactElement | null {
  if (edit === undefined) {
    if (status === "") {
      return null;
    }
    return (
      <Text as="span" voice="gloss" className="truncate">
        {status}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center" className="min-w-0">
      <TrackerValue
        ariaLabel="Status line"
        display={status}
        // No placeholder ⇒ TrackerValue's em dash (side-eye 08-01): the old "status…" sat in the datum slot
        // and read as a written reading ("the story says: status…"). An unwritten line is a dash, like every
        // other unset value on the card; the `title` ("Click to edit") carries the affordance.
        tone="muted"
        size="micro"
        onEdit={edit.onEditStatus}
        className="!w-auto min-w-0 max-w-full field-sizing-content"
      />
      {edit.isLocked(".status") ? <RpgFieldLock field="the status line" onRelease={(): void => edit.onRelease(".status")} /> : null}
    </Row>
  );
}

/** Condition chips: lit danger badges (glyph + name). Editable ⇒ each chip removes on click (× affordance)
 *  and an "add condition" input appends (§12.3 Tier-2: an empty/duplicate name never sends). A pinned
 *  conditions plane (`…conditions` locked, #10) leads with the pin + Release. */
export function ConditionChips({
  conditions,
  onAdd,
  onRemove,
  edit,
}: {
  readonly conditions: ActorVolatile["conditions"];
  readonly onAdd?: (name: string) => void;
  readonly onRemove?: (name: string) => void;
  readonly edit?: ActorEdit;
}): ReactElement | null {
  if (conditions.length === 0 && onAdd === undefined) {
    return null;
  }
  return (
    <Row gap="field" className="flex-wrap" data-slot="rpg-conditions">
      {edit === undefined || !edit.isLocked(".conditions") ? null : (
        <RpgFieldLock field="the conditions" onRelease={(): void => edit.onRelease(".conditions")} />
      )}
      {/* THE CHIP CARRIES THE TOUCH FLOOR AT COARSE (owner ruling 2026-08-07, on side-eye's measured
          tables). The remove ✕ is `size="glyph-xs"` — FLOORLESS, so its 44px coarse hit area rides an
          OVERFLOWING `::after` rather than its 16px box. MEASURED at 430 coarse with five live conditions:
          chip 30 tall, `gap-field` 6 ⇒ wrapped-row pitch 36, so the ✕'s effective hit box was **43×35** on
          every wrapped row — 9px under the vertical floor on a DESTRUCTIVE verb. (The
          `no-floorless-control-in-wrap` gate's stated harm — committing a NEIGHBOUR — was measured false
          here: a cross-chip sample lands in the 6px gap. The floor was the whole defect, and the chip's own
          label was never at risk.) Flooring the CHIP is the only one of the four priced options that fixes
          the CAUSE — a 44px hit area hanging off a 30px chip — instead of padding around it: at
          `min-h-touch-target` the pseudo fits INSIDE its own chip, so the visible chip and the live
          destructive zone are finally the same shape. FINE is untouched (a 30px chip in a dense tracker
          row). */}
      {conditions.map((cond) => (
        <Badge key={cond.name} tone="soft" size="sm" intent="danger" className="pointer-coarse:min-h-touch-target">
          <Icon icon={resolveConditionGlyph(cond.name)} size="xs" />
          {cond.name}
          {onRemove === undefined ? null : (
            <Button intent="ghost" size="glyph-xs" onClick={(): void => onRemove(cond.name)} title={`Remove ${cond.name}`}>
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
          className="w-(--width-control-col)"
        />
      )}
    </Row>
  );
}
