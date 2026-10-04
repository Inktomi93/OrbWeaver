// The ACCEPT review (arm B, RULED — the accept-ergonomics mock), rebuilt to the WORKBENCH anatomy
// (program #102, mockup variant C): ONE OPEN FIELD at focal weight, and every other field one glance away
// in a compact queue that carries its own verb or its own decided state.
//
// WHY THE QUEUE. The review used to stack every block open at full height inside a single column, so a
// six-field round was a page of diffs and the decision you were making sat wherever you had scrolled to.
// Variant C's centre lane is the one elevated island on the canvas and the mock draws exactly one diff in
// it, with "FIELDS IN THIS REWRITE" underneath — the other fields readable, addressable, and not costing a
// screen each. Deciding the open field ADVANCES to the next undecided one (that is what "one glance away"
// buys); "reopen" walks back to a decided field.
//
// EVERY BELT SURVIVES THE RESHAPE, and each is load-bearing:
//   • Tri-state with UNDECIDED FAILING CLOSED (belt 10): a queued field with no verb pressed is not applied,
//     and the note below says so in words. There is still no bulk gesture.
//   • The DESTRUCTIVE-CONSENT copy rides the verb itself, in the queue too — a queued `Keep` on a cleared
//     field reads "Keep (empties field)", never a bare Keep. A verb that destroys must say so wherever it
//     is pressed, not only in the pane that happens to be open.
//   • Block dress still classifies off the ENTRY, not the pane: REPLACED (before/after pair), EMPTIED (the
//     cleared state panel), ADDED (no fabricated empty before pane), and — for a diverged field — the §21
//     three-pane BASE·LIVE·REWRITE conflict whose Keep carries `confirmDiverged`.
//   • FORK C: side-by-side pairs for prose-length texts, an inline word `DiffView` under ~200 chars.
//
// The open block never COLLAPSES on decision (`collapseDecided: false`): collapsing was the coarse-tax
// relief for a stack of open blocks, and the queue is that relief now — collapsing the focal too would
// blank the island for the frame between a press and the advance.

import type { RefinableField } from "@orb/contracts/refinery";
import { isAppendedRewrite, isClearedRewrite } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import type { CompareBlock, CompareDecision } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import { DiffView } from "@orb/ui/diff";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { testId } from "#lib";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { reviewTargetLabel } from "../lib/review-entries.ts";
import { RefineryChip } from "./refinery-chip.tsx";

export interface AcceptReviewProps {
  readonly entries: readonly ReviewEntry[];
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
}

const INLINE_DIFF_THRESHOLD = 200;

/** The consent copy: destruction is STATED per field kind, never inferred from a blank side. */
function clearNoteOf(field: RefinableField): string {
  if (field === "greetings") {
    return "This greeting slot will be removed — later greetings shift up.";
  }
  if (field === "depthPrompt") {
    return "The depth note and its placement directive are removed.";
  }
  return "This field will be emptied.";
}

function blockOf(review: ReviewEntry): CompareBlock {
  const { entry, live, original, diverged } = review;
  const label = reviewTargetLabel(entry);
  if (isAppendedRewrite(entry)) {
    // The ADDED arm: `after` alone, so the primitive renders its Added state panel in the before slot
    // instead of a fabricated empty pane. Nothing can have diverged — the slot has no history to move.
    return { label, after: entry.text, stateNote: "A new greeting is added at the end — no existing greeting is touched." };
  }
  if (isClearedRewrite(entry)) {
    return { label, before: live, stateNote: clearNoteOf(entry.field) };
  }
  const short = live.length <= INLINE_DIFF_THRESHOLD && entry.text.length <= INLINE_DIFF_THRESHOLD;
  if (diverged) {
    // The §21 conflict: three panes, words first — BASE (the pin) · LIVE (what changed under you) ·
    // REWRITE (what you kept). Keep on this block is the informed re-confirmation.
    return {
      label,
      body: (
        <Stack gap="tight">
          <Row align="center" gap="field">
            <RefineryChip tone="warn">changed since the session started</RefineryChip>
            <Text voice="gloss">re-confirm which version wins — Keep uses the rewrite, Discard keeps the live text</Text>
          </Row>
          <ConflictPane label="Base — the session pin" text={original} />
          <ConflictPane label="Live — changed under the session" text={live} />
          <ConflictPane label="Rewrite — what Keep applies" text={entry.text} />
        </Stack>
      ),
    };
  }
  if (short) {
    return { label, body: <DiffView after={entry.text} before={live} mode="words" /> };
  }
  return { label, before: live, after: entry.text };
}

function ConflictPane({ label, text }: { label: string; text: string }): ReactElement {
  return (
    <Stack gap="tight">
      <Text voice="kicker">{label}</Text>
      <Text prose={true}>{text.length > 0 ? text : "(empty)"}</Text>
    </Stack>
  );
}

/** The first field still awaiting a verb — where the island opens, and where it advances to after a press. */
function firstUndecidedOf(decided: readonly CompareDecision[], count: number): number | null {
  for (let i = 0; i < count; i += 1) {
    if ((decided[i] ?? null) === null) {
      return i;
    }
  }
  return null;
}

/** One queue row's state — exactly what the row is allowed to offer, derived from the decision sheet. It
 *  is also the rendered `data-queue-state` value, i.e. a real axis with two readers (the row's dispatch and
 *  every CT that scopes by it), so it is declared ONCE as an `as const` tuple with the union derived off it
 *  (Spine-TypeScript-and-Patterns §7.5) rather than re-spelled as an inline literal union. */
const QUEUE_STATES = ["open", "kept", "discarded", "undecided"] as const;
type QueueState = (typeof QUEUE_STATES)[number];

/** A queue row's REACT KEY — the entry's own address, never its ordinal. `targetLabel` alone collides on a
 *  round that appends two greetings (both read "greetings [new]"), so the append ordinal joins it; every
 *  other arm is already unique by field + greeting slot. */
function queueKeyOf(review: ReviewEntry): string {
  return `${reviewTargetLabel(review.entry)}#${review.appendIndex ?? ""}`;
}

function queueStateOf(index: number, openIndex: number | null, decision: CompareDecision): QueueState {
  if (index === openIndex) {
    return "open";
  }
  if (decision === true) {
    return "kept";
  }
  return decision === false ? "discarded" : "undecided";
}

/** One row of "fields in this rewrite": the field's name, and either what was decided (with the door back
 *  into it) or the verbs to decide it where it stands. The OPEN field shows neither — its verbs are in the
 *  island above, and offering them twice would put two controls with one accessible name on the surface.
 *
 *  EVERY NON-OPEN ROW HAS EXACTLY ONE OPENER, and the state decides which: a DECIDED row's is the mock's
 *  own "reopen" word, an UNDECIDED row's is the field NAME itself (a user has to be able to read a change
 *  before pressing a verb on it, and a second explicit control on a row that already carries two verbs is
 *  the chrome the queue exists to remove). Both spell the field in their accessible name — a bare "reopen"
 *  or a bare "description" tells assistive tech nothing about what activation does. */
function QueueRow({
  review,
  state,
  onOpen,
  onDecide,
}: {
  review: ReviewEntry;
  state: QueueState;
  onOpen: () => void;
  onDecide: (decision: CompareDecision) => void;
}): ReactElement {
  const label = reviewTargetLabel(review.entry);
  const cleared = isClearedRewrite(review.entry);
  return (
    <Row
      align="center"
      className="border-border border-t py-field first:border-t-0"
      data-queue-state={state}
      data-testid={testId("refineryQueueRow")}
      gap="field"
    >
      {state === "open" ? (
        // `px-block` matches the ghost button every OTHER row's name is (CONTROL_SIZE `sm`), so the field
        // names line up in one column instead of the open row sitting 12px left of its siblings.
        <Text className="min-w-0 flex-1 truncate px-block" voice="label">
          {label}
        </Text>
      ) : (
        <Button className="min-w-0 flex-1 justify-start" intent="ghost" onClick={onOpen} size="sm">
          <Text as="span" className="min-w-0 truncate" ink="inherit" voice="label">
            {label}
          </Text>
          <Text as="span" className="sr-only">
            {" "}
            — show this change
          </Text>
        </Button>
      )}
      {review.diverged && state !== "open" ? <RefineryChip tone="warn">changed since the session started</RefineryChip> : null}
      {state === "open" ? <RefineryChip tone="neutral">open — deciding</RefineryChip> : null}
      {state === "kept" || state === "discarded" ? (
        <>
          <RefineryChip tone={state === "kept" ? "good" : "bad"}>{state}</RefineryChip>
          <Button intent="ghost" onClick={onOpen} size="sm">
            reopen
            <Text as="span" className="sr-only">
              {" "}
              {label}
            </Text>
          </Button>
        </>
      ) : null}
      {state === "undecided" ? (
        <>
          <Button intent="secondary" onClick={(): void => onDecide(false)} size="sm">
            Discard
            <Text as="span" className="sr-only">
              {" "}
              {label}
            </Text>
          </Button>
          {/* The destructive-consent copy travels with the verb, not with the pane it was pressed in. */}
          <Button intent="secondary" onClick={(): void => onDecide(true)} size="sm">
            {cleared ? "Keep (empties field)" : "Keep"}
            <Text as="span" className="sr-only">
              {" "}
              {label}
            </Text>
          </Button>
        </>
      ) : null}
    </Row>
  );
}

export function AcceptReview({ entries, decided, onDecide }: AcceptReviewProps): ReactElement {
  // Which field the user walked to, if any. NULL is not "nothing open" — it is "wherever the work is",
  // which is the first undecided field, so a press that clears the pick advances the island by itself.
  const [walkedTo, setWalkedTo] = useState<number | null>(null);
  const kept = decided.filter((d) => d === true).length;
  const discarded = decided.filter((d) => d === false).length;
  const undecided = entries.length - kept - discarded;
  const openIndex = walkedTo !== null && walkedTo < entries.length ? walkedTo : firstUndecidedOf(decided, entries.length);
  const openEntry = openIndex === null ? null : entries[openIndex];
  const decide = (index: number, decision: CompareDecision): void => {
    onDecide(index, decision);
    setWalkedTo(null);
  };
  return (
    <Stack data-testid={testId("refineryAcceptReview")} gap="row">
      {openEntry === undefined || openEntry === null || openIndex === null ? (
        // LOAD-BEARING, never a collapse: every field has a verb on it, so the island states the terminal
        // condition and points at the act that finishes the session.
        <Stack gap="tight">
          <Text voice="label">Every field is decided</Text>
          <Text voice="gloss">Apply the {kept} kept below, or reopen a field to change your mind.</Text>
        </Stack>
      ) : (
        <CompareBlocks
          blocks={[blockOf(openEntry)]}
          review={{
            decided: [decided[openIndex] ?? null],
            onDecide: (_index, decision): void => decide(openIndex, decision),
            collapseDecided: false,
          }}
        />
      )}
      <Stack gap="tight">
        <Text voice="kicker">Fields in this rewrite</Text>
        <Stack gap="tight">
          {entries.map((review, index) => (
            <QueueRow
              key={queueKeyOf(review)}
              onDecide={(decision): void => decide(index, decision)}
              onOpen={(): void => setWalkedTo(index)}
              review={review}
              state={queueStateOf(index, openIndex, decided[index] ?? null)}
            />
          ))}
        </Stack>
      </Stack>
      {undecided > 0 ? (
        <Text data-testid={testId("refineryUndecidedNote")} voice="gloss">
          {undecided} block{undecided === 1 ? " has" : "s have"} no verb pressed — undecided blocks are NOT applied. Decide them, or apply the {kept} kept and
          come back.
        </Text>
      ) : null}
    </Stack>
  );
}
