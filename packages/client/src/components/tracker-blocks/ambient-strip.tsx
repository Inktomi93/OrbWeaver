// AMBIENT STRIP (tracker block #6 — extracted from tracker-blocks.tsx for the component-size cap):
// location · date · time-of-day · weather as ONE composed card of label·value pairs (panel-redesign
// DESIGN.md §4 "Scene" — the NOW-window ambient card, editable in place). Values are DISPLAY-AT-REST
// (§12.4.1 — static text; input on click via TrackerValue); Time AND Weather are closed vocabularies, so
// both are click-to-edit PICKERS (Tier-0 §12.3 — never free text, never a RESTING dropdown). Weather's
// picker edits the eight-state `weather.type`; the model's free flavor `label` is band text, not a field.
//
// A CLOSED VOCAB STILL NEEDS A CLEAR (2026-08-07). The two free-text fields could always be emptied — a
// picker could only ever swap one member for another, so a sky or an hour the story stopped having was
// UNSETTABLE by hand while `location`/`date` were not. The clear is NOT a vocabulary member: `none`/`unset`
// inside `RPG_WEATHER_TYPES` would teach the model (which writes this axis, and whose extraction prompt
// enumerates the tuple verbatim) to emit it as a weather. It is the FIELD that is nullable — the snapshot
// stores `weather`/`clock` born-null and the hand door already accepts the clear ("`clock`/`calendarDate`/
// `weather`/`plot` clear to null", domain/rpg/verbs/edit-snapshot) — so the strip speaks the store's own
// [merge-clear] vocabulary: `onEditField(field, null)` is the clear, a string is a set.
//
// The Clear control renders OUTSIDE the `role="group"` vocabulary row on purpose: that group is the closed
// set, and a pin that derives its arity from the tuple (the weather CT counts `RPG_WEATHER_TYPES.length`
// buttons in the group) must keep counting the vocabulary, not the vocabulary plus a verb.

import { RPG_WEATHER_TYPES, TIME_OF_DAY } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, MapPin, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { TrackerValue } from "./tracker-value.tsx";

export interface AmbientStripProps {
  readonly location?: string;
  readonly date?: string;
  readonly timeOfDay?: string;
  readonly weather?: string;
  /** Commit an ambient field — present ⇒ editable; absent ⇒ read-only. `null` is the CLEAR (the store's own
   *  [merge-clear] vocabulary), which is how a closed-vocab field is unset without minting a vocabulary
   *  member for "nothing"; a string is a set. */
  readonly onEditField?: (field: "location" | "date" | "timeOfDay" | "weather", next: string | null) => void;
  /** Optional per-field lock indicator (§12.3 the-lock-consequence-is-visible) — the feature supplies a
   *  render (the pin + Release) for a field whose hand-edit auto-stamped a lock; `undefined` ⇒ no pin. The
   *  field→lock-path mapping is domain knowledge, so it lives in the caller (this shared block is agnostic). */
  readonly lockSlot?: (field: "location" | "date" | "timeOfDay" | "weather") => ReactNode;
}

const AMBIENT_FIELDS = [
  { key: "location", label: "Location" },
  { key: "date", label: "Date" },
  { key: "timeOfDay", label: "Time" },
  { key: "weather", label: "Weather" },
] as const;

/** The strip's field keys, DERIVED from the row list (never re-spelled). */
type AmbientField = (typeof AMBIENT_FIELDS)[number]["key"];

/** Which fields are CLOSED vocabularies (⇒ a picker) and which are free text (⇒ an input) — a TOTAL map, so a
 *  new ambient field has to declare which kind of editor it gets rather than silently defaulting to free text. */
const AMBIENT_VOCAB: Readonly<Record<AmbientField, { readonly vocab: readonly string[]; readonly groupLabel: string } | null>> = {
  location: null,
  date: null,
  timeOfDay: { vocab: TIME_OF_DAY, groupLabel: "Time of day" },
  weather: { vocab: RPG_WEATHER_TYPES, groupLabel: "Weather" },
};

/** The closed-vocab click-to-edit (§12.3 Tier-0 — a closed vocab is a PICKER, never free text, and never a
 *  RESTING dropdown): static value at rest; click reveals the vocabulary; a pick commits + closes, Escape
 *  closes without commit. An off-vocab value is unconstructable here — which is the whole point for both
 *  axes that use it (`TIME_OF_DAY`, `RPG_WEATHER_TYPES`). */
function AmbientVocabPicker({
  value,
  vocab,
  groupLabel,
  fieldLabel,
  onPick,
}: {
  readonly value: string;
  readonly vocab: readonly string[];
  readonly groupLabel: string;
  readonly fieldLabel: string;
  /** `null` = the host cleared the field (see the module header); a member = the pick. */
  readonly onPick: (label: string | null) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  if (!open) {
    const empty = value === "";
    const restText = empty ? "—" : value;
    return (
      <Button
        type="button"
        intent="ghost"
        size="inline"
        data-slot="tracker-value-rest"
        aria-label={`${fieldLabel} value`}
        title="Click to edit"
        onClick={(): void => setOpen(true)}
        className="gap-0 border border-transparent px-field text-left"
      >
        <Text as="span" size="label" tone={empty ? "muted" : "default"}>
          {restText}
        </Text>
      </Button>
    );
  }
  return (
    // Escape rides the OUTER row so it still closes from the Clear control, which sits outside the closed
    // vocabulary group (see the module header — the group's arity is a pinned datum).
    <Row
      gap="field"
      align="center"
      className="flex-wrap"
      onKeyDown={(e): void => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <Row gap="field" align="center" className="flex-wrap" role="group" aria-label={groupLabel}>
        {vocab.map((label) => (
          <Button
            key={label}
            type="button"
            intent={label === value ? "secondary" : "ghost"}
            // A CONTROL SIZE, not `inline` (side-eye 2026-08-07 P2 + the hit-geometry probe that finding
            // provoked). `inline` is the DISPLAY-AT-REST arm — a datum standing in for prose — and it wears
            // no control box, carrying its touch floor in an OVERFLOWING `::after` instead. In a WRAPPING
            // grid that pseudo is actively harmful: measured at the 320px context column, each chip's box
            // was 13px tall while its hit area was 28px, so on a ~18px row pitch the areas OVERLAPPED and
            // the row BELOW won hit-testing — `elementFromPoint` 10px under `clear`'s centre returned
            // `snow`, under `storm` returned `indoors`, and under five others returned "Clear weather".
            // Aiming at one sky and committing a different one is a destructive write to SHARED game state
            // with no visible undo, which is worse than the small target that was reported. A control size
            // fixes both: the box IS the target (≥32px fine / 44px coarse, over WCAG 2.5.8's 24px) and
            // nothing overflows to collide. The height must come from the size axis — it is the sole owner
            // of the box, and a call-site height is both a `ui-size-via-variant` violation and unresolvable
            // against the sealed control token.
            size="sm"
            // The SELECTED member, announced and not merely drawn (side-eye P3): selection was a border
            // only, so a screen reader could not tell which sky is the current one. `aria-pressed` over
            // `radio` semantics because these are buttons that COMMIT on activation and close the picker —
            // a radiogroup would promise arrow-key roving selection that does not exist here.
            aria-pressed={label === value}
            onClick={(): void => {
              if (label !== value) {
                onPick(label);
              }
              setOpen(false);
            }}
          >
            <Text as="span" size="micro">
              {label}
            </Text>
          </Button>
        ))}
      </Row>
      {/* Offered only when there IS something to clear — an already-empty field showing a clear is a control
          that can do nothing, which is the affordance-lying class this whole strip is written against.
          The label NAMES ITS FIELD, visibly and not just to a screen reader, for two reasons: both pickers
          can be open at once (two buttons called "Clear" is the duplicate-accessible-name defect side-eye
          X-1 found), and the weather vocabulary CONTAINS the member `clear` — a bare "Clear" verb sitting on
          the same row as the `clear` sky would be a reading a user cannot disambiguate.
          `basis-full` puts it on its OWN line at every width rather than in line with the members: a verb
          rendered as the tenth chip of a nine-member closed set is the set's arity misread, and a separator
          that only works when the row does not wrap is no separator at the 320px context column.
          THE RULE + THE GLYPH are the cold reading (side-eye 2026-08-07, its only taste note here): the
          structure already says "not a member", but the control was styled identically to the chips and
          landed directly under a wrapped `indoors`, so the EYE still grouped it as a tenth one. A hairline
          above it closes the set visually, and the ✕ makes it read as a verb before the words are read. */}
      {value === "" ? null : (
        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="mt-field basis-full justify-start border-border border-t pt-field"
          aria-label={`Clear ${fieldLabel.toLowerCase()}`}
          onClick={(): void => {
            onPick(null);
            setOpen(false);
          }}
        >
          <Icon icon={X} size="xs" />
          <Text as="span" size="micro" tone="muted">
            {`Clear ${fieldLabel.toLowerCase()}`}
          </Text>
        </Button>
      )}
    </Row>
  );
}

/** One field's editor: the closed-vocab picker, the free-text input, or (read-only) static text. */
function AmbientFieldControl({
  fieldKey,
  label,
  value,
  onEditField,
}: {
  readonly fieldKey: AmbientField;
  readonly label: string;
  readonly value: string | undefined;
  readonly onEditField: ((field: AmbientField, next: string | null) => void) | undefined;
}): ReactElement {
  if (onEditField === undefined) {
    return (
      <Text as="span" size="label" className="truncate tabular-nums">
        {value}
      </Text>
    );
  }
  const closed = AMBIENT_VOCAB[fieldKey];
  if (closed !== null) {
    // Tier-0 (§12.3): a closed vocab (the six `TIME_OF_DAY` labels · the eight weather states) is a
    // click-to-edit PICKER, never a free-text field and never a resting dropdown.
    return (
      <AmbientVocabPicker
        value={value ?? ""}
        vocab={closed.vocab}
        groupLabel={closed.groupLabel}
        fieldLabel={label}
        onPick={(picked): void => onEditField(fieldKey, picked)}
      />
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${label} value`}
      display={value ?? ""}
      placeholder="—"
      onEdit={(next): void => onEditField(fieldKey, next)}
      // Content-sized, capped: `!w-auto` beats FIELD_CONTROL's `w-full` so a short value ("the ford") is a
      // compact input and pairs pack 2+ per row (the mock's compact ambient card); `max-w-full` + `min-w-0`
      // keep a long location from overflowing the wrapping card (owner density ruling).
      className="!w-auto min-w-0 max-w-full field-sizing-content"
    />
  );
}

/** The scene's where/when strip (mode-agnostic scene DATA — §3.2). Hand-editable; empty fields omit. */
export function AmbientStrip({ location, date, timeOfDay, weather, onEditField, lockSlot }: AmbientStripProps): ReactElement {
  const values: Readonly<Record<AmbientField, string | undefined>> = { location, date, timeOfDay, weather };
  return (
    <Row gap="block" align="center" className="flex-wrap rounded-card border border-border bg-card px-block py-row" data-slot="ambient-strip">
      <Icon icon={MapPin} size="sm" label="Scene" />
      {AMBIENT_FIELDS.map(({ key, label }) => {
        const value = values[key];
        if (value === undefined && onEditField === undefined) {
          return null;
        }
        return (
          // Each pair packs inline (the mock's `flex-wrap; align:baseline` compact card): a label + a
          // content-sized value/input, so 2+ pairs share a row rather than one-per-line (the owner
          // density ruling 2026-07-28). `min-w-0` lets a long location value truncate/shrink instead of
          // forcing a full-width row.
          <Row key={key} gap="field" align="baseline" className="min-w-0">
            <Text as="span" size="label" tone="muted" className="shrink-0">
              {label}
            </Text>
            <AmbientFieldControl fieldKey={key} label={label} value={value} onEditField={onEditField} />
            {lockSlot?.(key)}
          </Row>
        );
      })}
    </Row>
  );
}
