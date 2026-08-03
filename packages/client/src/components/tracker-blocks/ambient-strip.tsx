// AMBIENT STRIP (tracker block #6 — extracted from tracker-blocks.tsx for the component-size cap):
// location · date · time-of-day · weather as ONE composed card of label·value pairs (panel-redesign
// DESIGN.md §4 "Scene" — the NOW-window ambient card, editable in place). Values are DISPLAY-AT-REST
// (§12.4.1 — static text; input on click via TrackerValue); Time AND Weather are closed vocabularies, so
// both are click-to-edit PICKERS (Tier-0 §12.3 — never free text, never a RESTING dropdown). Weather's
// picker edits the eight-state `weather.type`; the model's free flavor `label` is band text, not a field.

import { RPG_WEATHER_TYPES, TIME_OF_DAY } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, MapPin } from "@orb/ui/icons";
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
  /** Commit an ambient field — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditField?: (field: "location" | "date" | "timeOfDay" | "weather", next: string) => void;
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
  readonly onPick: (label: string) => void;
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
    <Row
      gap="field"
      align="center"
      className="flex-wrap"
      role="group"
      aria-label={groupLabel}
      onKeyDown={(e): void => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      {vocab.map((label) => (
        <Button
          key={label}
          type="button"
          intent={label === value ? "secondary" : "ghost"}
          size="inline"
          className="px-field"
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
  readonly onEditField: ((field: AmbientField, next: string) => void) | undefined;
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
