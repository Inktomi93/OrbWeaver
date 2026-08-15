// METER ROW — the tracker kit's block 1: `label · value/max` text over a 6px
// decorative rail, editable in place. Its own module under the component-size cap (the cast-card-slots /
// ambient-strip precedent): the row is five coupled pieces — the label cluster, the read-only datum, the
// editable value cell, its `/max` half, and the track — and nothing outside this file composes any of them.
// The kit's shared doctrine (tokens only · a label always · bars are decoration and the TEXT is the datum ·
// honest read-only arm) lives in `tracker-blocks.tsx`'s header and applies here unchanged.
//
// THE ONE RULE THIS BLOCK OWNS: it never synthesizes a reading (side-eye 08-01). An unset value or ceiling
// is `null` all the way to the render, where it draws the em-dash arm over an empty rail. A meter that folds
// unset to `0` publishes an invention as a measurement — and because the text IS the datum, a screen reader
// reads that invention aloud.

import { Row, Stack } from "@orb/ui/layout";
import type { TrackColor } from "@orb/ui/meter";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { TrackerValue } from "./tracker-value.tsx";

/** The UNSET datum (side-eye 08-01, the panel's lying-meter class): an em dash, never a synthesized `0`.
 *  It is the SAME mark the text/list tracker rows and the mood slot already use for "nothing written yet". */
const UNSET_DATUM = "—";

export interface MeterRowProps {
  readonly label: string;
  /** The reading — `null` when the story has never written one. NULLABLE ON PURPOSE (side-eye 08-01): every
   *  caller used to fold an unset tracker to `0`, so a pool nobody had touched announced "0/40" and drew an
   *  empty bar as FACT — and the screen reader read the invention out loud (TEXT is the datum). Unset now
   *  renders the em-dash arm: no numerator, an unfilled track, nothing to mistake for a measurement. */
  readonly value: number | null;
  /** The effective ceiling — `null` when the tracker has none (a poolless quantity; the `/max` half is then
   *  simply absent rather than a fabricated `0`). */
  readonly max: number | null;
  /** WHOSE meter this is, for the editable value/max accessible names (the `TrackerChip.subject` rule —
   *  two cast cards on one tab must not both offer a button called "Vitality value"). */
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
   *  caller states this-character-vs-default semantics here; it rides the rest button's `title`).
   *  Absent ⇒ the plain "Click to edit". */
  readonly maxEditTitle?: string;
  /** The label's hover `title` — the host-authored HINT rides here instead of an inline microline (owner
   *  ruling 08-01: the same hint echoed under every carrier's row is noise; hover reveals it on demand). */
  readonly labelTitle?: string;
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
      <Text as="span" size="label" tone="muted" className="tabular-nums">
        /{max}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center">
      <Text as="span" size="label" tone="muted">
        /
      </Text>
      <TrackerValue
        ariaLabel={`${label} max`}
        display={max === null ? "" : String(max)}
        placeholder={UNSET_DATUM}
        kind="numeric"
        {...(maxEditTitle === undefined ? {} : { editTitle: maxEditTitle })}
        onEdit={(next): void => {
          const n = Number.parseInt(next, 10);
          if (!Number.isNaN(n)) {
            onEditMax(n);
          }
        }}
        className="!w-avatar-lg px-field text-right tabular-nums"
        restClassName="tabular-nums"
      />
    </Row>
  );
}

/** The EDITABLE reading + its `/max` half (the read-only arm is one `<Text>` in MeterRow). Its own component
 *  for the complexity cap, the MaxCell precedent. The value field sizes to ITSELF (a fixed `w-avatar-lg`, not
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
    <Row gap="field" align="center" className="shrink-0">
      <TrackerValue
        ariaLabel={`${name} value`}
        // Unset ⇒ an EMPTY field wearing the em-dash placeholder, never a `0` the host has to notice is fake.
        display={value === null ? "" : String(value)}
        placeholder={UNSET_DATUM}
        kind="numeric"
        onEdit={(next): void => {
          const n = Number.parseInt(next, 10);
          if (!Number.isNaN(n)) {
            onEditValue(n);
          }
        }}
        className={warning ? "!w-avatar-lg px-field text-right tabular-nums text-warning" : "!w-avatar-lg px-field text-right tabular-nums"}
        // At rest the value hugs its text like the read-only "24/30" (no fixed input width).
        restClassName={warning ? "tabular-nums text-warning" : "tabular-nums"}
      />
      <MaxCell label={name} max={max} {...(onEditMax === undefined ? {} : { onEditMax })} {...(maxEditTitle === undefined ? {} : { maxEditTitle })} />
    </Row>
  );
}

/** The meter's label cluster — glyph + name, with the host hint riding the hover `title` (never an inline
 *  echo). Extracted from MeterRow for the complexity cap; deliberately takes `| undefined` props so the
 *  caller passes straight through without conditional spreads. */
function MeterLabel({
  label,
  leading,
  labelTitle,
}: {
  readonly label: string;
  readonly leading: ReactNode | undefined;
  readonly labelTitle: string | undefined;
}): ReactElement {
  return (
    <Row gap="field" align="center" className="min-w-0">
      {leading}
      <Text as="span" size="label" tone="muted" className="truncate" {...(labelTitle === undefined ? {} : { title: labelTitle })}>
        {label}
      </Text>
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
  labelTitle,
  note,
  valueWarning,
}: MeterRowProps): ReactElement {
  // The accessible name of every FIELD in this row — subject-qualified when the caller supplied one, so two
  // carriers' identically-named meters are distinguishable by name alone. The VISIBLE label never repeats
  // the subject (the card already says whose card it is).
  const named = subject === undefined ? label : `${subject} ${label}`;
  return (
    <Stack gap="field" data-slot="meter-row" data-unset={value === null}>
      {/* `center` (not `baseline`): the click-to-edit input's border-box baseline sits lower than the
          label's text baseline, so baseline alignment GROWS the row ~4px on reveal — center keeps the
          rest→edit swap pixel-stable (the no-layout-shift bar). */}
      <Row justify="between" align="center" gap="block">
        <MeterLabel label={label} leading={leading} labelTitle={labelTitle} />
        {onEditValue === undefined ? (
          <Text as="span" size="label" tone={valueWarning === true ? "warning" : undefined} className="tabular-nums">
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
        <Text size="micro" tone="muted">
          {note}
        </Text>
      )}
    </Stack>
  );
}
