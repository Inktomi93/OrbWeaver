// The chats pane's MONTH BOUND — the native `input[type=month]` that sets `beforeRecencyAt`, plus the phone
// arm that folds it behind a disclosure. Split out of `chat-list-surface.tsx` (#1350): the surface sits on
// the 450-line component cap and this control now has two shapes.
//
// THE MONTH CONTROL SAYS WHAT IT DOES (#490). It read "Jump to month", and the verb was a promise the
// mechanism does not keep: `beforeRecencyAt` is an EXCLUSIVE UPPER BOUND, so picking a month RE-ROOTS the
// list at that month and pages OLDER from there — measured, nothing newer than the anchor is reachable by
// scrolling, and the ✕ is the only way back. "Jump" means move-within (a scroll target you can leave by
// scrolling); a BOUND is what the control actually is, and saying so makes the one-way behaviour the copy's
// own statement rather than a surprise. The BOUND is not the defect and does not move: it is what makes the
// keyset page cheap, and re-rooting a 896-row virtualized list is the only honest way to reach 2024.
//
// THAT RULING SURVIVES — ITS WORD DID NOT (#1348). #490 spelled the bound "Show chats from", and *from* is
// heard by every reader as on-or-AFTER, which is the opposite of what the predicate does. Measured on live
// main 2026-09-04: `2020-01` (a month BEFORE the whole library) → "Chats 0 of 6", `2030-01` → "6 of 6" —
// i.e. the control emptied the list exactly when a reader asked for their oldest chats, and the empty state
// then said "No chats found by January 2020" in the OTHER direction beside a label saying *from*. A user
// hunting "my chat from August" concludes it was deleted. Three surfaces, one direction now: the label is
// "Show chats up to" (the selected month is INCLUDED — the ceiling is exclusive of the month AFTER it), the
// empty sentences keep their "by <month>", and the predicate is untouched. The field's accessible name is
// this label in both arms, so the name moved with the words.
//
// THE MONTH CONTROL IS DELIBERATELY THE NATIVE PICKER (#500 item 2, side-eye 2026-08-22 rail-chats P3 —
// "polish, or accept-and-record in the component header"; this is the RECORD). `input[type=month]` renders
// its interior as UA chrome (`--------- ----` plus the browser's calendar glyph on an empty value), which
// reads unlike its two house-styled siblings in this column. Accepted, because every alternative is worse
// for the one job this control does: the native control already types (`2024-06` straight from the
// keyboard), already localizes its own display, already opens the OS wheel picker on a phone, is already
// correctly labelled and already passes contrast at 13.29:1. A house-built month picker would be a NEW
// @orb/ui primitive carrying its own popup, roving keyboard model and locale table, minted for a single
// secondary filter — and it would be the only date affordance in the app that is not the platform's. The
// `Input` primitive's box (border, radius, focus ring, instrument-tier font step) is applied, so the
// control's OUTSIDE is house voice; only its interior is the UA's.
//
// THE UNSET INTERIOR IS GLOSSED, NOT REPLACED (#522 — the follow-on the record above invited). Accepting the
// native control never meant accepting that an EMPTY one shouts: the UA prints `--------- ----` at full
// foreground, so the loudest text in this column was the field that had nothing to say. The `Input` primitive
// marks a date-family control with no value (`data-empty`) and `@orb/ui`'s globals tint
// `::-webkit-datetime-edit` to the muted tone — the same tone `placeholder:` already gives every text field,
// which is exactly what those dashes are. Colour only: no custom primitive, no overlay, no relabelling.
//
// AND ON A PHONE IT FOLDS (#1350, side-eye 2026-09-04). Measured at 430×740: the pane spent 299 of 740px —
// 40% of the viewport — on filter chrome before the first chat row, and the month bound is the secondary of
// the two filters (search is what a reader reaches for). So the phone arm is the character strip's own
// `+N More` posture: a disclosure whose TRIGGER carries the bound when one is set, so folding never hides
// state. It is APPLICABILITY, not a mobile mode ([[no-separate-reduced-modes]]): the desktop pane is a
// 300px column with vertical room to spare and nothing to buy back, so it renders the field outright.

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { setChatListMonth, useChatListMonth, useMobileViewport } from "#state";
import { formatMonthLabel } from "../lib/chat-list-scope.ts";
import { CLEAR_INSET_RESERVE, ClearFilterGlyph } from "./chat-list-filter-field.tsx";

/** The bound's own words — an ON-OR-BEFORE ceiling that INCLUDES the selected month (#1348). It is the
 *  field's accessible name in both arms: through `<Field>`'s label on the desktop arm, and spelled as the
 *  input's own `aria-label` on the phone arm, where the visible words are the disclosure trigger above it. */
const MONTH_LABEL = "Show chats up to";
const CLEAR_MONTH_LABEL = "Clear the month";

/** The month bound as the phone's folded arm presents it in its trigger: the words plus the bound in force,
 *  so a collapsed disclosure still says what it is doing to the list under it. */
function foldedTriggerLabel(monthLabel: string | null): string {
  return monthLabel === null ? MONTH_LABEL : `${MONTH_LABEL} ${monthLabel}`;
}

/** The bare control — the field, its inset ✕, and nothing that names it. Both arms compose this; only the
 *  NAME differs between them, which is the whole difference the two arms carry. */
function MonthInput({ month, named }: { readonly month: string; readonly named: boolean }): ReactElement {
  return (
    <Row align="center" className="relative">
      <Input
        {...(named ? { "aria-label": MONTH_LABEL } : {})}
        className={`min-w-0 flex-1 ${CLEAR_INSET_RESERVE}`}
        onValueChange={setChatListMonth}
        type="month"
        value={month}
      />
      {month === "" ? null : <ClearFilterGlyph label={CLEAR_MONTH_LABEL} onClick={(): void => setChatListMonth("")} />}
    </Row>
  );
}

/** The chats pane's month bound, in whichever shape this viewport regime asks for. */
export function ChatListMonthFilter(): ReactElement {
  const month = useChatListMonth();
  const isMobile = useMobileViewport();
  if (!isMobile) {
    return (
      <Field label={MONTH_LABEL}>
        <MonthInput month={month} named={false} />
      </Field>
    );
  }
  return (
    // `defaultOpen` on the bound already in force: arriving with a month set must not bury the reason the
    // list is short. It is UNCONTROLLED past that first commit on purpose — once the reader has folded it,
    // setting a month inside it does not re-open a panel they just closed, and the trigger says the bound.
    <Collapsible defaultOpen={month !== ""}>
      <CollapsibleTrigger>{foldedTriggerLabel(formatMonthLabel(month))}</CollapsibleTrigger>
      <CollapsiblePanel>
        <MonthInput month={month} named={true} />
      </CollapsiblePanel>
    </Collapsible>
  );
}
