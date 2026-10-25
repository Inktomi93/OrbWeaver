// RPG meters keep the value text as the datum and the rail decorative.
// Unset readings and ceilings stay null rather than becoming invented zeroes.

import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row, Stack } from "@orb/ui/layout";
import type { TrackColor } from "@orb/ui/meter";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { trackerFieldName } from "../../lib/tracker-names.ts";
import { UNSET_DATUM } from "../../lib/unset-datum.ts";
import { TrackerValue } from "./tracker-value.tsx";

interface MeterRowProps {
  readonly label: string;
  /** The reading — `null` when the story has never written one. NULLABLE ON PURPOSE: folding an unset tracker
   *  to `0` would announce "0/40" for a pool nobody touched and draw an empty bar as FACT (TEXT is the datum).
   *  Unset renders the em-dash arm: no numerator, an unfilled track, nothing to mistake for a measurement. */
  readonly value: number | null;
  /** The effective ceiling — `null` when the tracker has none (a poolless quantity; the `/max` half is then
   *  simply absent rather than a fabricated `0`). */
  readonly max: number | null;
  /** WHOSE meter this is, for the editable value/max accessible names (the `TrackerChip.subject` rule —
   *  two npc cards on one tab must not both offer a button called "Vitality value"). */
  readonly subject?: string;
  /** Which `--color-track-N` fills the bar (categorical, by definition order). @defaultValue 1 */
  readonly color?: TrackColor;
  /** A host-picked color LITERAL (the owner free-hex ruling) overriding the ramp — passed through
   *  to the decorative `TrackBar` (safe-color-gated there); the value text stays tokened. */
  readonly customColor?: string;
  /** An optional leading glyph before the label (aria-hidden decoration — the label text stays the datum;
   *  the tracker-shape glyph is the founding consumer). */
  readonly leading?: ReactNode;
  /** Danger threshold — the bar swaps to the destructive intent below it (never the sole signal). */
  readonly dangerBelow?: number;
  /** Commit a new numeric value — present ⇒ editable-in-place; absent ⇒ read-only. */
  readonly onEditValue?: (next: number) => void;
  /** Commit a new MAX — present ⇒ the `/max` is editable (the caller owns the value-drag tell). */
  readonly onEditMax?: (next: number) => void;
  /** What the MAX edit actually writes, when "Click to edit" understates it (per-carrier ceilings: the
   *  caller states this-character-vs-default semantics here; it rides the rest button's tooltip).
   *  Absent ⇒ the plain "Click to edit". */
  readonly maxEditTitle?: string;
  /** The host-authored HINT, opened on demand from a HintTrigger beside the label rather than as an inline
   *  microline (an owner ruling: the same hint echoed under every carrier's row is noise). */
  readonly labelHint?: string;
  /** A transient consequence microline under the row (clamp-and-tell — "Vitality 24 → 20, max
   *  lowered"). The caller owns its lifecycle (shows it after a drag, clears it). */
  readonly note?: ReactNode;
  /** Render the value TEXT in warning tone (an overfull `34/30` reads in warning, never hidden). */
  readonly valueWarning?: boolean;
}

/** The `/max` half of an editable meter row — static text, or its own click-to-edit field when the caller
 *  supplies `onEditMax` (whose `maxEditTitle` says what that edit actually writes). */
function MaxCell({
  label,
  max,
  onEditMax,
  maxEditTitle,
}: {
  readonly label: string;
  readonly max: number | null;
  readonly onEditMax?: (next: number) => void;
  readonly maxEditTitle?: string;
}): ReactElement | null {
  if (onEditMax === undefined) {
    // No ceiling ⇒ no `/max` half at all. `/0` was the old fabrication.
    return max === null ? null : (
      <Text as="span" tone="muted" numeric={true} voice="label">
        /{max}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center">
      {/* PUNCTUATION, not a datum: in the editable arm the slash is its own text node between two NAMED
          fields, so an aria walk of a roster would read "17", "/", "20" as three peer readings. The
          read-only arm has no such node — its `/max` is part of the one datum string. */}
      <Text as="span" tone="muted" aria-hidden="true" voice="label">
        /
      </Text>
      <TrackerValue
        ariaLabel={`${label} max`}
        display={max === null ? "" : String(max)}
        placeholder={UNSET_DATUM}
        kind="numeric"
        {...(maxEditTitle === undefined ? {} : { editTitle: maxEditTitle })}
        onEdit={(next): void => {
          const trimmed = next.trim();
          const n = Number(trimmed);
          if (trimmed !== "" && Number.isInteger(n)) {
            onEditMax(n);
          }
        }}
        className="px-field text-end"
        numeric={true}
        width="avatar-lg"
        restClassName=""
      />
    </Row>
  );
}

/** The EDITABLE reading + its `/max` half (the read-only arm is one `<Text>` in MeterRow). Its own component
 *  for the complexity cap, the MaxCell precedent. The value field sizes to ITSELF (a fixed `w-(--size-avatar-lg)`, not
 *  `w-full` inside a fixed box — that collapsed the flex input to ~14px and clipped a 2-digit value's LEADING
 *  digit); `px-field` (over FIELD_CONTROL's wider `px-block`) + `text-right` hug the `/max` suffix without
 *  clipping; `shrink-0` on the cluster keeps the label from stealing its width (the W3c input-clip fix). */
function ValueCell({
  name,
  value,
  max,
  warning,
  onEditValue,
  onEditMax,
  maxEditTitle,
}: {
  readonly name: string;
  readonly value: number | null;
  readonly max: number | null;
  readonly warning: boolean;
  readonly onEditValue: (next: number) => void;
  readonly onEditMax?: (next: number) => void;
  readonly maxEditTitle?: string;
}): ReactElement {
  return (
    // The inline buttons' token-sized hit pseudos extend beyond their text boxes; reserve that edge inside the row.
    <Row gap="field" align="center" className="shrink-0 pe-block">
      <TrackerValue
        ariaLabel={`${name} value`}
        // Unset ⇒ an EMPTY field wearing the em-dash placeholder, never a `0` the host has to notice is fake.
        display={value === null ? "" : String(value)}
        placeholder={UNSET_DATUM}
        kind="numeric"
        onEdit={(next): void => {
          const trimmed = next.trim();
          const n = Number(trimmed);
          if (trimmed !== "" && Number.isInteger(n)) {
            onEditValue(n);
          }
        }}
        tone={warning ? "warning" : "default"}
        className="px-field text-end"
        numeric={true}
        width="avatar-lg"
        // At rest the value hugs its text like the read-only "24/30" (no fixed input width).
        restClassName=""
      />
      <MaxCell label={name} max={max} {...(onEditMax === undefined ? {} : { onEditMax })} {...(maxEditTitle === undefined ? {} : { maxEditTitle })} />
    </Row>
  );
}

/** The meter's label cluster — glyph + name, with the host hint behind a HintTrigger (never an inline
 *  echo). Extracted from MeterRow for the complexity cap; deliberately takes `| undefined` props so the
 *  caller passes straight through without conditional spreads. */
function MeterLabel({
  label,
  leading,
  labelHint,
  nameCarried,
}: {
  readonly label: string;
  readonly leading: ReactNode | undefined;
  readonly labelHint: string | undefined;
  readonly nameCarried: boolean;
}): ReactElement {
  return (
    <Row gap="field" align="center" className="min-inline-0">
      {leading}
      {/* THE LABEL IS PROGRAMMATICALLY ASSOCIATED, OR IT IS LOOSE TEXT. In the EDITABLE arm both fields carry
          this label verbatim inside their accessible names (`<subject> HP value` / `<subject> HP max`), so the
          visible text is a sighted-reader duplicate — announced again as an unassociated node, a roster would
          read "HP", "button 17", "/", "button 20" with nothing binding them. It stays in the DOM (it is the visual label) and leaves the a11y tree.
          The READ-ONLY arm keeps it: there the datum is plain text with no name of its own to carry it,
          so hiding the label would orphan the number. `leading` (the lock pin, a real button) is outside
          the hidden node on purpose. */}
      <Text as="span" tone="muted" className="truncate" {...(nameCarried ? { "aria-hidden": true } : {})} voice="label">
        {label}
      </Text>
      {labelHint === undefined ? null : <HintTrigger className="" hint={labelHint} subject={label} />}
    </Row>
  );
}

/** The row's read-only DATUM — `24/30`, `24` (no ceiling), `—/30` or `—` (nothing written yet). One
 *  spelling, so the read-only arm and the editable arm's placeholder cannot disagree about what "unset"
 *  looks like. */
function meterDatum(value: number | null, max: number | null): string {
  const head = value === null ? UNSET_DATUM : String(value);
  return max === null ? head : `${head}/${max}`;
}

/** The row's DECORATIVE rail. It is decoration over the datum above it, so an unset or ceiling-less reading
 *  draws the EMPTY track (`0` of a nominal `1`) instead of a fill computed from an invented number — and the
 *  danger threshold drops with it, because a red bar under an em dash would be a second invention. */
function MeterTrack({
  value,
  max,
  color,
  customColor,
  dangerBelow,
}: {
  readonly value: number | null;
  readonly max: number | null;
  readonly color: TrackColor;
  readonly customColor?: string;
  readonly dangerBelow?: number;
}): ReactElement {
  const unset = value === null || max === null;
  return (
    <TrackBar
      value={unset ? 0 : value}
      max={max ?? 1}
      color={color}
      {...(customColor === undefined ? {} : { customColor })}
      {...(dangerBelow === undefined || unset ? {} : { dangerBelow })}
    />
  );
}

/** A labeled magnitude meter. The `value/max` text is the datum; the bar underneath is decoration. */
export function MeterRow({
  label,
  value,
  max,
  subject,
  color = 1,
  customColor,
  leading,
  dangerBelow,
  onEditValue,
  onEditMax,
  maxEditTitle,
  labelHint,
  note,
  valueWarning,
}: MeterRowProps): ReactElement {
  // The accessible name of every FIELD in this row — subject-qualified when the caller supplied one, so two
  // carriers' identically-named meters are distinguishable by name alone. The VISIBLE label never repeats
  // the subject (the card already says whose card it is).
  const named = trackerFieldName(label, subject);
  return (
    // THE BLOCK CARRIES THE COARSE TOUCH FLOOR. Two meter rows stack their editable value cells closer than
    // the touch target, so each cell's hit `::after` would reach into the row BELOW, which is painted later and
    // takes the rest. Flooring the BLOCK (never the value — `tracker-value.tsx` states the
    // no-shift rule the rest→edit swap depends on) makes the pitch ≥44 so each cell's pseudo fits its own band.
    <Stack gap="field" touchFloor="block" data-slot="meter-row" data-unset={value === null}>
      {/* `center` (not `baseline`): the click-to-edit input's border-box baseline sits lower than the
          label's text baseline, so baseline alignment GROWS the row ~4px on reveal — center keeps the
          rest→edit swap pixel-stable (the no-layout-shift bar). */}
      <Row justify="between" align="center" gap="block">
        <MeterLabel label={label} leading={leading} labelHint={labelHint} nameCarried={onEditValue !== undefined} />
        {onEditValue === undefined ? (
          <Text as="span" tone={valueWarning === true ? "warning" : undefined} numeric={true} voice="label">
            {meterDatum(value, max)}
          </Text>
        ) : (
          <ValueCell
            name={named}
            value={value}
            max={max}
            warning={valueWarning === true}
            onEditValue={onEditValue}
            {...(onEditMax === undefined ? {} : { onEditMax })}
            {...(maxEditTitle === undefined ? {} : { maxEditTitle })}
          />
        )}
      </Row>
      <MeterTrack
        value={value}
        max={max}
        color={color}
        {...(customColor === undefined ? {} : { customColor })}
        {...(dangerBelow === undefined ? {} : { dangerBelow })}
      />
      {note === undefined || note === null ? null : (
        <Text tone="muted" voice="gloss">
          {note}
        </Text>
      )}
    </Stack>
  );
}
