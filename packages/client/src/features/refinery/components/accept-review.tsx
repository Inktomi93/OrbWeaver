// The ACCEPT review (arm B, RULED — the accept-ergonomics mock): per-block Keep/Discard VERBS over the
// chosen rewrite run, tri-state with UNDECIDED failing closed (belt 10 rendered as UI: the default is
// nothing accepted, every keep is an individual press, no bulk gesture). Blocks classify as REPLACED
// (before/after pair), EMPTIED (before + the "Cleared" state panel — the distinct consent copy rides
// the primitive's cleared Keep verb), and — for a diverged field — the MERGE-CONFLICT treatment:
// a three-pane BASE·LIVE·REWRITE block whose Keep carries `confirmDiverged`.
//
// FORK C: side-by-side pairs for prose-length texts, an inline word `DiffView` under ~200 chars.
// Decided blocks COLLAPSE to header + state chip (the coarse-tax relief) — the primitive owns that.

import type { RefinableField, RefineryRewriteField } from "@orb/contracts/refinery";
import { isAppendedRewrite, isClearedRewrite } from "@orb/contracts/refinery";
import type { CompareBlock, CompareDecision } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import { DiffView } from "@orb/ui/diff";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { RefineryChip } from "./refinery-chip.tsx";

export interface AcceptReviewProps {
  readonly entries: readonly ReviewEntry[];
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
}

const INLINE_DIFF_THRESHOLD = 200;

function targetLabel(entry: RefineryRewriteField): string {
  if (isAppendedRewrite(entry)) {
    // No slot number exists yet — the label says what the block DOES rather than inventing a position the
    // card does not have (and would not keep, since the slot lands at whatever the tail is at apply time).
    return "greetings [new]";
  }
  return entry.field === "greetings" ? `greetings [${entry.greetingIndex ?? "?"}]` : entry.field;
}

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
  const label = targetLabel(entry);
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

export function AcceptReview({ entries, decided, onDecide }: AcceptReviewProps): ReactElement {
  const kept = decided.filter((d) => d === true).length;
  const discarded = decided.filter((d) => d === false).length;
  const undecided = entries.length - kept - discarded;
  return (
    <Stack data-testid={testId("refineryAcceptReview")} gap="row">
      <Row align="center" gap="field">
        <RefineryChip tone="good">{kept} kept</RefineryChip>
        <RefineryChip tone="bad">{discarded} discarded</RefineryChip>
        <RefineryChip tone="warn">{undecided} undecided</RefineryChip>
      </Row>
      <CompareBlocks blocks={entries.map(blockOf)} review={{ decided, onDecide }} />
      {undecided > 0 ? (
        <Text data-testid={testId("refineryUndecidedNote")} voice="gloss">
          {undecided} block{undecided === 1 ? " has" : "s have"} no verb pressed — undecided blocks are NOT applied. Decide them, or apply the {kept} kept and
          come back.
        </Text>
      ) : null}
    </Stack>
  );
}
