// The PER-ACTOR volatile blocks — the rows Status's participant card and the character TAKEOVER both render
// (the tracked-field unification §3 IA repair: Status is the only list of people, and expanding an entry IS
// the sheet, so the two surfaces are two zoom levels of ONE anatomy, never two implementations). Meter rows,
// text/list readings, the status line, and the condition chips live here; both consumers pass the same
// `ActorEdit`.
//
// EDIT-in-place (§3.2): a tracker VALUE edits through `editSnapshot` (the volatile plane) — host-only in v1
// (`canEditShared`); the patch is a WHOLE-`actorState`-array overlay ([merge-clear] keyed-array grammar —
// the server correlates by `actorRefKey`). A tracker's MAX edited HERE is THIS carrier's ceiling (an owner
// ruling): the def's `max` is the DEFAULT, `value.max` is the per-carrier override, and two
// characters may legitimately have different Vitality ceilings (the d20 max-HP reality). So the gesture is the
// intuitive one — the number you edit on a card is that character's — and it rides the SAME `editSnapshot`
// write as the reading beside it, never `updateConfig`. Anti-drift: setting the ceiling back to the default
// CLEARS the override (`resolveTrackerMaxOverride`), so a stored override always means "different on purpose",
// and an overridden row says so (the "default: N" microline).
//
// WHOSE SHEET IS THIS? — every block here takes an optional `subject` (the carrier's name) and
// runs its control names through the tracker kit's ONE qualification grammar (`trackerFieldName` /
// `trackerActionName`). The Status PARTICIPANT LIST passes it: without it, several cards on one region would
// publish repeated "Add condition", "Status line" and "HP value" names with no group boundary, so a
// screen-reader user editing a sheet could not tell whose sheet it was. The character TAKEOVER does not pass it — one carrier fills
// the whole panel, and a prefix on every control there would be noise.
//
// PER-FIELD PINS: every volatile hand edit stamps its FINE lock path (`actorState.<refKey>.status`,
// `…trackerValues.<key>`, `…conditions`) via `lockPaths`, and the pin glyph renders ON the locked value —
// model-writable fields only; hand-only planes (the def's max/color, level, title) never lock, so they never
// pin.

import type { RpgActorView, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { meterDisplayNumber, RPG_TRACKER_VALUE_EMPTY, trackerCeiling } from "@orb/contracts/rpg";
import { readOwnKey } from "@orb/kit/objects";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { Tip } from "#components";
import { resolveConditionGlyph } from "../lib/glyphs.ts";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";
import { UNSET_DATUM } from "../lib/unset-datum.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";
import { MeterRow, TrackerValue, trackerActionName, trackerFieldName } from "./tracker-blocks/index.ts";

type ActorVolatile = NonNullable<RpgActorView["volatile"]>;

/** The hand-edit callbacks for ONE actor's volatile plane — all whole-`actorState` overlays (host only,
 *  D108: NOT gated by `trackersReadOnly`). Clamps values to `≥ 0` (Tier-1; over-max is representable
 *  fiction). NOTE: no HP arm — in LITE health IS a tracker (D86); the `hp` FIELD is a full-mode combat slot
 *  (born null in lite, never rendered). */
export interface ActorEdit {
  readonly onEditTracker: (key: string, next: number) => void;
  /** Lower/raise THIS carrier's ceiling (clamp-and-tell). Writes the per-carrier `value.max` override —
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
  /** Is this actor's fine lock path pinned? `sub` appends to the actor's lock base. */
  readonly isLocked: (sub: string) => boolean;
  /** Release a fine lock path (`sub` as above) — "let the model write it again". */
  readonly onRelease: (sub: string) => void;
}

/** One editable METER tracker on its EFFECTIVE ceiling (`value.max ?? def.max` — the one resolver), with the
 *  max-lowering value-drag TELL: lowering the ceiling below the reading drags the reading down (in
 *  `onEditTrackerMax`'s one commit) and shows a transient microline ("Vitality 24 → 20 — ceiling lowered");
 *  an overfull value (value above the ceiling) reads in warning tone. An OVERRIDDEN ceiling states the default
 *  it departs from ("default: 30") so a divergence is visible and reversible — typing the default back clears
 *  the override. The note clears on the next server render (the value prop changes). A pinned tracker
 *  (`…trackerValues.<key>` locked) leads with the pin glyph + its Release. */
function ActorTrackerMeter({
  def,
  value,
  ordinal,
  subject,
  edit,
}: {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue;
  readonly ordinal: number;
  readonly subject?: string;
  readonly edit?: ActorEdit;
}): ReactElement {
  // NULLABLE ALL THE WAY DOWN (side-eye 08-01): a tracker the story has never written has no reading, and
  // `?? 0` published one — "0/40" beside an empty bar, announced as fact. The row draws the em-dash arm
  // instead. The CEILING stays whatever the resolver says (`value.max ?? def.max`), null included: a
  // poolless tracker has no `/max` half rather than a fabricated one. The one exception is the seeded HP meter,
  // whose contract is "unset counts as full".
  const reading = meterDisplayNumber(def, value);
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
  // A DEPARTURE, NOT A PRESENCE. The anti-drift rule says a stored `value.max` equal to the def's default is
  // cleared at WRITE time, but a story can still write a max equal to the default; treating "an override
  // exists" as "it differs" would print `HP ceiling 20 — default: 20` under every such bar. The write-side rule is the invariant; this is the READ refusing to depend on it. A value equal to the
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
      {...(def.hint === "" ? {} : { labelHint: def.hint })}
      {...trackColorProps(resolveTrackerColor(def.color, ordinal))}
      {...(subject === undefined ? {} : { subject })}
      {...(release === undefined ? {} : { leading: <RpgFieldLock field={trackerFieldName(def.label, subject)} onRelease={release} /> })}
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
 *  the observations, which have no bar to draw. */
function ActorTrackerText({
  def,
  value,
  subject,
  edit,
}: {
  readonly def: RpgTrackerDef;
  readonly value: RpgTrackerValue;
  readonly subject?: string;
  readonly edit?: ActorEdit;
}): ReactElement {
  const display = def.shape === "list" ? (value.items ?? []).join(", ") : String(value.value ?? "");
  return (
    <Row gap="field" align="baseline" justify="between">
      <Row gap="field" align="center">
        <Text as="span" voice="label">
          {def.label}
        </Text>
        {def.hint === "" ? null : <HintTrigger className="" hint={def.hint} subject={def.label} />}
      </Row>
      <TrackerValue
        ariaLabel={trackerFieldName(`${def.label} value`, subject)}
        display={display}
        placeholder={UNSET_DATUM}
        {...(edit === undefined ? {} : { onEdit: (next: string): void => edit.onEditTrackerText(def.key, next) })}
        className="flex-1 text-end min-inline-0"
      />
    </Row>
  );
}

/** The actor's METER trackers on their resolved colors (lite health is one of these — D86; there is no
 *  separate HP field in lite). The trackers an actor carries are resolved SERVER-side (the one carrier
 *  predicate), so this renders exactly what the model was allowed to write. Renders NOTHING when the actor
 *  carries no meters — the caller owns the honest empty state (it knows whether any tracker exists at all). */
export function ActorMeters({
  actor,
  subject,
  edit,
}: {
  readonly actor: RpgActorView;
  readonly subject?: string;
  readonly edit?: ActorEdit;
}): ReactElement | null {
  const values = actor.volatile?.trackerValues ?? {};
  const meters = actor.trackers.filter((def) => def.shape === "meter");
  if (meters.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      {meters.map((def, i) => (
        <ActorTrackerMeter
          key={def.key}
          def={def}
          value={readOwnKey(values, def.key) ?? RPG_TRACKER_VALUE_EMPTY}
          ordinal={i}
          {...(subject === undefined ? {} : { subject })}
          {...(edit === undefined ? {} : { edit })}
        />
      ))}
    </Stack>
  );
}

/** The actor's non-meter tracker rows (text + list observations); nothing when it carries none. */
export function ActorTrackerRows({
  actor,
  subject,
  edit,
}: {
  readonly actor: RpgActorView;
  readonly subject?: string;
  readonly edit?: ActorEdit;
}): ReactElement | null {
  const values = actor.volatile?.trackerValues ?? {};
  const rows = actor.trackers.filter((def) => def.shape !== "meter");
  if (rows.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      {rows.map((def) => (
        <ActorTrackerText
          key={def.key}
          def={def}
          value={readOwnKey(values, def.key) ?? RPG_TRACKER_VALUE_EMPTY}
          {...(subject === undefined ? {} : { subject })}
          {...(edit === undefined ? {} : { edit })}
        />
      ))}
    </Stack>
  );
}

/** The quiet volatile STATUS line (free text — "on edge"). Editable-in-place for the host; a pinned
 *  status (`…status` locked) carries the pin + Release beside the value. Read-only + empty ⇒ nothing. */
export function StatusLine({ status, subject, edit }: { readonly status: string; readonly subject?: string; readonly edit?: ActorEdit }): ReactElement | null {
  if (edit === undefined) {
    if (status === "") {
      return null;
    }
    return (
      <Text as="span" voice="gloss" className="truncate px-field">
        {status}
      </Text>
    );
  }
  return (
    // THE ROW CARRIES THE COARSE TOUCH FLOOR, not the value (the fragment's own header states why): a
    // text-height value's touch pseudo overflows into whatever is stacked near it, such as the `+ condition`
    // control one row down. Floored, each row's pseudo fits inside its own band.
    <Row gap="field" align="center" touchFloor="block" className="min-inline-0">
      <TrackerValue
        ariaLabel={trackerFieldName("Status line", subject)}
        display={status}
        placeholder="Add status"
        tone="muted"
        onEdit={edit.onEditStatus}
        className="field-sizing-content max-inline-full min-inline-0"
        width="auto"
        voice="label"
      />
      {edit.isLocked(".status") ? (
        <RpgFieldLock
          field={subject === undefined ? "the status line" : trackerFieldName("status line", subject)}
          onRelease={(): void => edit.onRelease(".status")}
        />
      ) : null}
    </Row>
  );
}

/** Condition chips: lit danger badges (glyph + name). Editable ⇒ each chip removes on click (× affordance)
 *  and an "add condition" input appends (Tier-2: an empty/duplicate name never sends). A pinned
 *  conditions plane (`…conditions` locked) leads with the pin + Release. */
export function ConditionChips({
  conditions,
  subject,
  onAdd,
  onRemove,
  edit,
}: {
  readonly conditions: ActorVolatile["conditions"];
  readonly subject?: string;
  readonly onAdd?: (name: string) => void;
  readonly onRemove?: (name: string) => void;
  readonly edit?: ActorEdit;
}): ReactElement | null {
  if (conditions.length === 0 && onAdd === undefined) {
    return null;
  }
  return (
    // The coarse floor again: with no chips yet this row is a bare text-height `+ condition`, whose touch
    // pseudo would swallow the status line ABOVE it. With chips it changes nothing — a chip already
    // carries `touchFloor="block"`, so the row is already ≥44 there.
    <Row gap="field" touchFloor="block" className="flex-wrap" data-slot="rpg-conditions">
      {edit === undefined || !edit.isLocked(".conditions") ? null : (
        <RpgFieldLock
          field={subject === undefined ? "the conditions" : trackerFieldName("conditions", subject)}
          onRelease={(): void => edit.onRelease(".conditions")}
        />
      )}
      {/* THE CHIP CARRIES THE TOUCH FLOOR AT COARSE (an owner ruling). The remove ✕ is `size="glyph-xs"` —
          FLOORLESS, so its coarse hit area rides an OVERFLOWING `::after` rather than its own box, and on a
          wrapped row of short chips that area falls under the vertical floor on a DESTRUCTIVE verb.
          Flooring the CHIP fixes the CAUSE — a touch-size hit area hanging off a shorter chip — instead of
          padding around it: at `min-h-touch-target` the pseudo fits INSIDE its own chip, so the visible chip
          and the live destructive zone are the same shape. FINE is untouched (a compact chip in a dense
          tracker row). */}
      {conditions.map((cond) => (
        <Badge key={cond.name} tone="soft" size="sm" intent="danger" touchFloor="block">
          <Icon icon={resolveConditionGlyph(cond.name)} size="xs" />
          {cond.name}
          {onRemove === undefined ? null : (
            <Tip text={trackerActionName(`Remove ${cond.name}`, "from", subject)}>
              <Button
                aria-label={trackerActionName(`Remove ${cond.name}`, "from", subject)}
                intent="ghost"
                // eslint-disable-next-line orb/no-floorless-control-in-wrap -- The chip carries touchFloor="block", so its remove target fits within the chip; ends when this geometry or floorless size changes.
                size="glyph-xs"
                onClick={(): void => onRemove(cond.name)}
              >
                <Icon icon={X} size="xs" />
              </Button>
            </Tip>
          )}
        </Badge>
      ))}
      {onAdd === undefined ? null : (
        <TrackerValue
          ariaLabel={trackerActionName("Add condition", "to", subject)}
          display=""
          placeholder="+ condition"
          onEdit={(next): void => {
            const trimmed = next.trim();
            if (trimmed !== "") {
              onAdd(trimmed);
            }
          }}
          className="inline-(--width-control-col)"
        />
      )}
    </Row>
  );
}
