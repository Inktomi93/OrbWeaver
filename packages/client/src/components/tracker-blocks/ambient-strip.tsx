// AMBIENT STRIP (tracker block #6 — extracted from tracker-blocks.tsx for the component-size cap):
// location · date · time-of-day · weather as ONE composed card of label·value pairs (panel-redesign
// DESIGN.md §4 "Scene" — the NOW-window ambient card, editable in place). Values are DISPLAY-AT-REST
// (§12.4.1 — static text; input on click via TrackerValue); the Time field is the closed 6-label
// click-to-edit picker (Tier-0 §12.3 — never free text, never a RESTING dropdown).

import { TIME_OF_DAY } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, MapPin } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { TrackerValue } from "./tracker-value";

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

/** The Time field's 6-label click-to-edit (§12.3 Tier-0 — a closed vocab is a PICKER, never free text, and
 *  never a RESTING dropdown): static value at rest; click reveals the six `TIME_OF_DAY` labels; a pick
 *  commits + closes, Escape closes without commit. Off-vocab time is unconstructable here. */
function AmbientTimePicker({ value, onPick }: { readonly value: string; readonly onPick: (label: string) => void }): ReactElement {
  const [open, setOpen] = useState(false);
  if (!open) {
    const empty = value === "";
    const restText = empty ? "—" : value;
    return (
      <Button
        type="button"
        intent="ghost"
        size="sm"
        data-slot="tracker-value-rest"
        aria-label="Time value"
        title="Click to edit"
        onClick={(): void => setOpen(true)}
        className="!h-auto min-h-0 justify-start gap-0 border border-transparent !px-field !py-0 text-left font-normal"
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
      aria-label="Time of day"
      onKeyDown={(e): void => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      {TIME_OF_DAY.map((label) => (
        <Button
          key={label}
          type="button"
          intent={label === value ? "secondary" : "ghost"}
          size="sm"
          className="!h-auto min-h-0 !px-field !py-0 font-normal"
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

/** The scene's where/when strip (mode-agnostic scene DATA — §3.2). Hand-editable; empty fields omit. */
export function AmbientStrip({ location, date, timeOfDay, weather, onEditField, lockSlot }: AmbientStripProps): ReactElement {
  const values: Record<string, string | undefined> = { location, date, timeOfDay, weather };
  return (
    <Row gap="block" align="center" className="flex-wrap rounded-card border border-border bg-card px-block py-row" data-slot="ambient-strip">
      <Icon icon={MapPin} size="sm" label="Scene" />
      {AMBIENT_FIELDS.map(({ key, label }) => {
        const value = values[key];
        if (value === undefined && onEditField === undefined) {
          return null;
        }
        let control: ReactNode;
        if (onEditField === undefined) {
          control = (
            <Text as="span" size="label" className="truncate tabular-nums">
              {value}
            </Text>
          );
        } else if (key === "timeOfDay") {
          // Tier-0 (§12.3): time-of-day is the closed 6-label vocab — a click-to-edit PICKER, never a
          // free-text field and never a resting dropdown.
          control = <AmbientTimePicker value={value ?? ""} onPick={(picked): void => onEditField(key, picked)} />;
        } else {
          control = (
            <TrackerValue
              ariaLabel={`${label} value`}
              display={value ?? ""}
              placeholder="—"
              onEdit={(next): void => onEditField(key, next)}
              // Content-sized, capped: `!w-auto` beats FIELD_CONTROL's `w-full` so a short value ("rain")
              // is a compact input and pairs pack 2+ per row (the mock's compact ambient card); `max-w-full`
              // + `min-w-0` keep a long location from overflowing the wrapping card (owner density ruling).
              className="!w-auto min-w-0 max-w-full field-sizing-content"
            />
          );
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
            {control}
            {lockSlot?.(key)}
          </Row>
        );
      })}
    </Row>
  );
}
