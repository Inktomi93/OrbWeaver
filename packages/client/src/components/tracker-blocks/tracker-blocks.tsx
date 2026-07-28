// The tracker BLOCK KIT (Context-Panel-Program §3.2) — ONE shared component family, seven blocks,
// specced as shared from birth (the §3.1 rung table: the CP-3 Trackers tab and the CP-4 takeover both
// consume it). Client-shared composites over @orb/ui (the ConfirmDialog/LibraryRow homing precedent —
// NOT @orb/ui itself; ui stays parts-only). Every block:
//   • rides tokens only (composed from @orb/ui primitives + <Stack>/<Row>; no raw HTML, no raw values);
//   • carries a LABEL always (a bare number failed the CP-1 cold read — §3.2) and `tabular-nums`;
//   • treats bars/rings as decoration (aria-hidden in TrackBar/RingGauge) with the value TEXT as the
//     accessible datum (§4.9);
//   • is EDITABLE IN PLACE by default (the value is an inline field when an `onEdit*` is supplied) with
//     a READ-ONLY arm for the honest-arms doctrine (§4.4 — never a silent degrade). Display-only is the
//     named corruption-trainer failure (§3.2).
// The write path arrives with the D59 data wave (stint 2); THIS kit ships the interaction SHAPE — the
// callbacks — so the data wave wires verbs to already-built affordances.
//
// The two low-level geometry PARTS (TrackBar, RingGauge) live in @orb/ui (a raw <div>/<svg> with a
// token fill can only be painted at the kit tier — the client paint law); these blocks compose them.

import type { RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Gauge, Icon, MapPin } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { TrackColor } from "@orb/ui/meter";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { CastMood, CastRelationship } from "./cast-card-slots";
import { TrackerValue } from "./tracker-value";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1. METER ROW — pools / per-member meters: `label · value/max` text + a 6px decorative track bar.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface MeterRowProps {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** Which `--color-track-N` fills the bar (categorical, by definition order). @defaultValue 1 */
  readonly color?: TrackColor;
  /** A host-picked color LITERAL (panel-redesign free-hex ruling) overriding the ramp — passed through
   *  to the decorative `TrackBar` (safe-color-gated there); the value text stays tokened. */
  readonly customColor?: string;
  /** An optional leading glyph before the label (aria-hidden decoration — the label text stays the datum;
   *  the widget-type glyph is the founding consumer). */
  readonly leading?: ReactNode;
  /** Danger threshold — the bar swaps to the destructive intent below it (never the sole signal). */
  readonly dangerBelow?: number;
  /** Commit a new numeric value — present ⇒ editable-in-place; absent ⇒ read-only. */
  readonly onEditValue?: (next: number) => void;
}

/** A labeled magnitude meter. The `value/max` text is the datum; the bar underneath is decoration. */
export function MeterRow({ label, value, max, color = 1, customColor, leading, dangerBelow, onEditValue }: MeterRowProps): ReactElement {
  return (
    <Stack gap="field" data-slot="meter-row">
      <Row justify="between" align="baseline" gap="block">
        <Row gap="field" align="center" className="min-w-0">
          {leading}
          <Text as="span" size="label" tone="muted" className="truncate">
            {label}
          </Text>
        </Row>
        {onEditValue === undefined ? (
          <Text as="span" size="label" className="tabular-nums">
            {value}/{max}
          </Text>
        ) : (
          // The value field sizes to ITSELF (a fixed `w-avatar-lg`, not `w-full` inside a fixed box — that
          // collapsed the flex input to ~14px and clipped a 2-digit value's LEADING digit). `px-field` (over
          // FIELD_CONTROL's wider `px-block`) + `text-right` hug the `/max` suffix without clipping. `shrink-0`
          // on the whole cluster keeps the label from stealing its width (the W3c input-clip fix).
          <Row gap="field" align="baseline" className="shrink-0">
            <TrackerValue
              ariaLabel={`${label} value`}
              display={String(value)}
              kind="numeric"
              onEdit={(next): void => {
                const n = Number.parseInt(next, 10);
                if (!Number.isNaN(n)) {
                  onEditValue(n);
                }
              }}
              className="!w-avatar-lg px-field text-right tabular-nums"
            />
            <Text as="span" size="label" tone="muted" className="tabular-nums">
              /{max}
            </Text>
          </Row>
        )}
      </Row>
      <TrackBar
        value={value}
        max={max}
        color={color}
        {...(customColor === undefined ? {} : { customColor })}
        {...(dangerBelow === undefined ? {} : { dangerBelow })}
      />
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2. STAT CELL — attributes: a compact cell, big value over a small caps label; hint on `title`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface StatCellProps {
  /** The attribute short label ("STR"). */
  readonly label: string;
  readonly value: number;
  /** The profile hint — rides `title` (§3.2). */
  readonly hint?: string;
  /** Commit a new value — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditValue?: (next: number) => void;
}

/** One attribute tile — `16` over `STR`. Grid-tiled 2-up (lite) to 3-up (wide) by the caller. */
export function StatCell({ label, value, hint, onEditValue }: StatCellProps): ReactElement {
  return (
    <Stack
      gap="field"
      align="center"
      className="rounded-card border border-border bg-card px-block py-row"
      data-slot="stat-cell"
      {...(hint === undefined ? {} : { title: hint })}
    >
      {onEditValue === undefined ? (
        <Text as="span" size="title" className="tabular-nums">
          {value}
        </Text>
      ) : (
        <TrackerValue
          ariaLabel={`${label} value`}
          display={String(value)}
          kind="numeric"
          onEdit={(next): void => {
            const n = Number.parseInt(next, 10);
            if (!Number.isNaN(n)) {
              onEditValue(n);
            }
          }}
          className="w-avatar-md text-center"
        />
      )}
      <Text as="span" size="micro" tone="muted" transform="caps" className="tracking-micro">
        {label}
      </Text>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3. CHIP — text trackers / guides / conditions: a `label — value` pill. Guides get a gauge glyph.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface TrackerChipProps {
  readonly label: string;
  readonly value: string;
  /** A persistent-guide chip — a leading gauge glyph distinguishes it from a condition (§3.2). */
  readonly guide?: boolean;
  /** Commit a new value — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditValue?: (next: string) => void;
}

/** A `label — value` pill (the existing badge idiom, soft tone). Guide chips lead with a gauge glyph. */
export function TrackerChip({ label, value, guide = false, onEditValue }: TrackerChipProps): ReactElement {
  return (
    <Badge tone="soft" size="sm" data-slot={guide ? "guide-chip" : "tracker-chip"}>
      {guide ? <Icon icon={Gauge} size="sm" /> : null}
      <Text as="span" size="label" tone="muted">
        {label} —{" "}
      </Text>
      {onEditValue === undefined ? (
        <Text as="span" size="label">
          {value}
        </Text>
      ) : (
        <TrackerValue ariaLabel={`${label} value`} display={value} onEdit={onEditValue} className="h-control-sm w-avatar-lg" />
      )}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 4. CAST CARD — scene NPCs: name + mood line + customFields as chip rows.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface CastField {
  readonly name: string;
  readonly value: string;
}

export interface CastCardProps {
  readonly name: string;
  readonly mood?: string;
  readonly fields?: readonly CastField[];
  /** The cast member's relationship stance (§2.1) — badged in the header row; a neutral default shows nothing. */
  readonly relationship?: RpgRelationship;
  /** Meter blocks for numeric per-NPC trackers (rendered above the text-field chips). */
  readonly meters?: ReactNode;
  /** Commit a field value by field name — present ⇒ its chips are editable; absent ⇒ read-only. */
  readonly onEditField?: (fieldName: string, next: string) => void;
  /** Commit a new mood (free text) — present ⇒ the mood is editable-in-place (§3.2). */
  readonly onEditMood?: (next: string) => void;
  /** Commit a new relationship KIND (the closed 6-token vocab — a PICKER, Tier-0 §12.3; off-vocab is
   *  unconstructable). Present ⇒ the badge becomes a compact kind picker. */
  readonly onEditRelationshipKind?: (next: RpgRelationshipKind) => void;
  /** An optional leading relationship glyph (aria-hidden decoration) shown beside the picker in EDIT mode —
   *  the feature supplies it from its glyph resolver, since the tier-2 kit can't reach a feature lib. In
   *  read mode the badge carries its own glyph, so this is only used when the picker is shown. */
  readonly relationshipGlyph?: ReactNode;
}

/** A present-character card: name · relationship badge/picker · mood · numeric meters · text-field chips. */
export function CastCard({
  name,
  mood,
  fields,
  relationship,
  meters,
  onEditField,
  onEditMood,
  onEditRelationshipKind,
  relationshipGlyph,
}: CastCardProps): ReactElement {
  return (
    <Stack gap="block" className="rounded-card border border-border bg-card px-block py-row" data-slot="cast-card">
      <Row justify="between" align="baseline" gap="block">
        <Row gap="field" align="center" className="min-w-0">
          {/* `shrink-0` keeps the name from collapsing to 0px when a long custom relationship label is present —
              the badge yields width to the name (it truncates), never the reverse. */}
          <Text as="span" size="label" weight="semibold" className="shrink-0">
            {name}
          </Text>
          <CastRelationship
            name={name}
            {...(relationship === undefined ? {} : { relationship })}
            {...(onEditRelationshipKind === undefined ? {} : { onEditRelationshipKind })}
            {...(relationshipGlyph === undefined ? {} : { relationshipGlyph })}
          />
        </Row>
        <CastMood name={name} {...(mood === undefined ? {} : { mood })} {...(onEditMood === undefined ? {} : { onEditMood })} />
      </Row>
      {meters}
      {fields === undefined || fields.length === 0 ? null : (
        <Row gap="field" className="flex-wrap">
          {fields.map((field) => (
            <TrackerChip
              key={field.name}
              label={field.name}
              value={field.value}
              {...(onEditField === undefined ? {} : { onEditValue: (next: string): void => onEditField(field.name, next) })}
            />
          ))}
        </Row>
      )}
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 5. BEAT LINE — recentEvents: a timestamp-less muted one-liner. Newest-first ordering is the caller's.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface BeatLineProps {
  readonly children: ReactNode;
}

/** One muted recent-event line (read-only by nature — beats are a log, not an editable tracker). */
export function BeatLine({ children }: BeatLineProps): ReactElement {
  return (
    <Text size="label" tone="muted" data-slot="beat-line">
      {children}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 6. AMBIENT STRIP — location · date · time-of-day · weather: one compact chip row.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface AmbientStripProps {
  readonly location?: string;
  readonly date?: string;
  readonly timeOfDay?: string;
  readonly weather?: string;
  /** Commit an ambient field — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditField?: (field: "location" | "date" | "timeOfDay" | "weather", next: string) => void;
}

const AMBIENT_FIELDS = [
  { key: "location", label: "Location" },
  { key: "date", label: "Date" },
  { key: "timeOfDay", label: "Time" },
  { key: "weather", label: "Weather" },
] as const;

/** The scene's where/when strip (mode-agnostic scene DATA — §3.2). Hand-editable; empty fields omit. */
export function AmbientStrip({ location, date, timeOfDay, weather, onEditField }: AmbientStripProps): ReactElement {
  const values: Record<string, string | undefined> = { location, date, timeOfDay, weather };
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
            {onEditField === undefined ? (
              <Text as="span" size="label" className="truncate tabular-nums">
                {value}
              </Text>
            ) : (
              <TrackerValue
                ariaLabel={`${label} value`}
                display={value ?? ""}
                placeholder="—"
                onEdit={(next): void => onEditField(key, next)}
                // Content-sized, capped: `!w-auto` beats FIELD_CONTROL's `w-full` so a short value ("rain")
                // is a compact input and pairs pack 2+ per row (the mock's compact ambient card); `max-w-full`
                // + `min-w-0` keep a long location from overflowing the wrapping card (owner density ruling).
                className="h-control-sm !w-auto min-w-0 max-w-full field-sizing-content"
              />
            )}
          </Row>
        );
      })}
    </Row>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 7. GOAL LINE — objectives: free-text goal + optional `n/m` clock; done gets a strikethrough.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface GoalLineProps {
  readonly text: string;
  readonly done?: boolean;
  /** Optional clock segment — `filled`/`total` renders as `n/m`. */
  readonly clock?: { readonly filled: number; readonly total: number };
  /** Commit new goal text — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditText?: (next: string) => void;
}

/** A free-text objective with an optional `n/m` clock; done ⇒ struck through (§3.2). */
export function GoalLine({ text, done = false, clock, onEditText }: GoalLineProps): ReactElement {
  return (
    <Row justify="between" align="baseline" gap="block" data-slot="goal-line">
      {onEditText === undefined ? (
        <Text as="span" size="label" className={done ? "text-muted-foreground line-through" : undefined}>
          {text}
        </Text>
      ) : (
        <TrackerValue ariaLabel="Goal" display={text} onEdit={onEditText} className="h-control-sm w-full" />
      )}
      {clock === undefined ? null : (
        <Text as="span" size="label" tone="muted" className="tabular-nums">
          {clock.filled}/{clock.total}
        </Text>
      )}
    </Row>
  );
}
