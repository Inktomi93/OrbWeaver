// The tracker BLOCK KIT (Context-Panel-Program §3.2) — ONE shared component family, seven blocks,
// specced as shared from birth (the §3.1 rung table: the CP-3 Trackers tab and the CP-4 takeover both
// consume it). Client-shared composites over @orb/ui (the ConfirmDialog/LibraryRow homing precedent —
// NOT @orb/ui itself; ui stays parts-only). Every block:
//   • rides tokens only (composed from @orb/ui primitives + <Stack>/<Row>; no raw HTML, no raw values);
//   • carries a LABEL always (a bare number failed the CP-1 cold read — §3.2) and `tabular-nums`;
//   • treats bars/rings as decoration (aria-hidden in TrackBar/RingGauge) with the value TEXT as the
//     accessible datum (§4.9);
//   • NEVER SYNTHESIZES A READING (side-eye 08-01): an unset value/ceiling is `null` all the way to the
//     render, where it draws the em-dash arm + an empty rail. A meter that folds unset to `0` publishes an
//     invention as a measurement — and because the text IS the datum, a screen reader reads it aloud;
//   • is EDITABLE IN PLACE by default (the value is an inline field when an `onEdit*` is supplied) with
//     a READ-ONLY arm for the honest-arms doctrine (§4.4 — never a silent degrade). Display-only is the
//     named corruption-trainer failure (§3.2).
// The write path arrives with the D59 data wave (stint 2); THIS kit ships the interaction SHAPE — the
// callbacks — so the data wave wires verbs to already-built affordances.
//
// The two low-level geometry PARTS (TrackBar, RingGauge) live in @orb/ui (a raw <div>/<svg> with a
// token fill can only be painted at the kit tier — the client paint law); these blocks compose them.

import { Badge } from "@orb/ui/badge";
import { Gauge, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { TrackerValue } from "./tracker-value.tsx";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1. METER ROW — extracted to ./meter-row.tsx (the component-size cap; the ambient-strip precedent). The
//    row is five coupled pieces (label · datum · value cell · `/max` · track) with no other consumer.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2. STAT CELL — attributes: a compact cell, big value over a small caps label; hint on `title`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface StatCellProps {
  /** The attribute short label ("STR"). */
  readonly label: string;
  /** The reading, or `null` when this actor's sheet carries NO value for the attribute. Null is not zero and
   *  not the profile floor — it renders the em-dash arm, per the block kit's never-synthesize-a-reading law
   *  above and the sheet contract's "a sheet read treats a MISSING key as absent". Printing the range floor
   *  for an unset attribute is what made a clobbered `20` read as a *revert* to `1` rather than as data loss. */
  readonly value: number | null;
  /** The profile hint — rides `title` (§3.2). */
  readonly hint?: string;
  /** Commit a new value — present ⇒ editable; absent ⇒ read-only. A `null` is the CLEAR (a blanked field),
   *  the same grammar the sheet's `Level` chip uses: the value's own editor is the only place to unset it. */
  readonly onEditValue?: (next: number | null) => void;
}

/** One attribute tile — `16` over `STR`, or `—` over `STR` for an unset attribute. Grid-tiled 2-up (lite) to
 *  3-up (wide) by the caller. */
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
        <Text as="span" size="title" tone={value === null ? "muted" : "default"} className="tabular-nums">
          {/* `??`, never `||` — a real reading of ZERO is a reading, and must not fall through to the em-dash. */}
          {value ?? "—"}
        </Text>
      ) : (
        <TrackerValue
          ariaLabel={`${label} value`}
          display={value === null ? "" : String(value)}
          // The rest state's em-dash for an unset-but-editable cell — TrackerValue renders `placeholder` muted
          // when the display is empty, which is the same "intentionally blank, not unfinished" arm every other
          // editable value uses. An editor typing over it sees an EMPTY field, not a floor value to delete.
          placeholder="—"
          kind="numeric"
          size="title"
          onEdit={(next): void => {
            const trimmed = next.trim();
            const n = Number.parseInt(trimmed, 10);
            // Blank (or unparseable) CLEARS the attribute — the `SheetLevel` grammar, and the only door that
            // un-references an attribute key so the host can still shrink the profile's vocabulary.
            onEditValue(trimmed === "" || Number.isNaN(n) ? null : n);
          }}
          // `text-title` keeps the revealed input at the SAME type size as the big rest value — no
          // font-size jump inside the fixed cell (the no-layout-shift bar). The REST state hugs its
          // number (no fixed width — `w-avatar-md` inside the padded button ellipsized a 2-digit value).
          className="w-avatar-md text-center text-title tabular-nums"
          restClassName="text-center text-title tabular-nums"
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
  /** WHOSE reading this is, for the editable value's accessible name (side-eye 08-01): a Scene tab with two
   *  cast cards offered two buttons both called "Trust value" and two called "Role value", so a
   *  name-navigating reader could not tell Sera's trust from Mara's. Absent ⇒ the bare label (a chip with no
   *  subject, e.g. a game-level reading). */
  readonly subject?: string;
  /** A persistent-guide chip — a leading gauge glyph distinguishes it from a condition (§3.2). */
  readonly guide?: boolean;
  /** Commit a new value — present ⇒ editable; absent ⇒ read-only. */
  readonly onEditValue?: (next: string) => void;
}

/** A `label — value` pill (the existing badge idiom, soft tone). Guide chips lead with a gauge glyph. */
export function TrackerChip({ label, value, subject, guide = false, onEditValue }: TrackerChipProps): ReactElement {
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
        <TrackerValue
          ariaLabel={subject === undefined ? `${label} value` : `${subject} ${label}`}
          display={value}
          onEdit={onEditValue}
          className="!w-auto min-w-0 max-w-full field-sizing-content"
          restClassName="min-w-0 max-w-full"
        />
      )}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 4. CAST CARD — extracted to ./cast-card-slots.tsx beside its three header slots (the component-size cap;
//    the ambient-strip precedent). The card and the slots it composes are ONE unit: CastRelationship,
//    CastMood and CastGuides have no other consumer, and the card is nothing but their arrangement.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 5. BEAT LINE — recentEvents: a timestamp-less muted one-liner. Newest-first ordering is the caller's.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface BeatLineProps {
  readonly children: ReactNode;
}

/** One muted recent-event BULLET line (read-only by nature — beats are a log, not an editable tracker).
 *  The leading em-dash is the mock's beat marker (aria-hidden decoration — the text stays the datum). */
export function BeatLine({ children }: BeatLineProps): ReactElement {
  return (
    <Text size="label" tone="muted" data-slot="beat-line" className="flex gap-field">
      <Text as="span" size="label" aria-hidden={true} className="shrink-0 opacity-50">
        —
      </Text>
      {/* min-w-0: the content is model-authored free text (journal beats, recent events) with no length
          contract — as a flex child it must be allowed to shrink so its inline content WRAPS; without it
          the line forces the tab wide (owner horizontal-scrollbar report, 08-01). */}
      <Text as="span" size="label" tone="muted" className="min-w-0 break-words">
        {children}
      </Text>
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 6. AMBIENT STRIP — extracted to ./ambient-strip.tsx (the component-size cap).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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
        <TrackerValue ariaLabel="Goal" display={text} onEdit={onEditText} className="w-full" />
      )}
      {clock === undefined ? null : (
        <Text as="span" size="label" tone="muted" className="tabular-nums">
          {clock.filled}/{clock.total}
        </Text>
      )}
    </Row>
  );
}
