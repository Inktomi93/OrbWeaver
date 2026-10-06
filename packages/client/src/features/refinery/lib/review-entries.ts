// The accept review's PURE derivation half (re-homed from the component under the components-export-
// only rule): resolve a rewrite payload's entries against the LIVE card (what apply would overwrite)
// and the session's ORIGINAL pin (the §21 divergence compare). The component (`AcceptReview`) only
// renders what this derives.

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";
import { isAppendedRewrite } from "@orb/contracts/refinery";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** One reviewable entry, resolved against the LIVE card and the ORIGINAL pin. */
export interface ReviewEntry {
  readonly entry: RefineryRewriteField;
  /** The LIVE card's current text for the target (what the merge overwrites). Always `""` for an APPEND —
   *  a new slot overwrites nothing, and the block renders no before pane at all (an empty left pane would
   *  claim "this was blank", which is a lie about a slot that never existed). */
  readonly live: string;
  /** The session pin's text — differs from `live` exactly when the field moved under the session. */
  readonly original: string;
  readonly diverged: boolean;
  /** The APPEND ordinal this entry carries on the wire (`appendedRewrites`' index) — the address the accept
   *  sends back. Absent on every other arm. */
  readonly appendIndex?: number;
  /** The entry's position in the run payload's `fields` — the stable address its persisted Keep/Discard
   *  decision is stored under (the in-scope list shifts when the selection changes; the payload never does). */
  readonly payloadIndex: number;
  /** Why the apply verb would refuse this entry whatever the user decides — set only for an entry that can
   *  never land on the LIVE card (the verb's own applicability belts, mirrored). Such an entry is shown as
   *  not applicable and is never keepable, so it can never refuse an otherwise good batch. */
  readonly refusal?: ReviewRefusal;
}

/** The verb's applicability refusals the review can predict from the payload and the live card alone. */
type ReviewRefusal = inferOutput<Trpc["refinery"]["applyFields"]>["dropped"][number]["reason"];

/** The entry's target in words — `greetings [2]`, `greetings [new]` for an append, else the field. */
export function reviewTargetLabel(entry: RefineryRewriteField): string {
  if (isAppendedRewrite(entry)) {
    // No slot number exists yet — the label says what the block DOES rather than inventing a position the
    // card does not have (and would not keep, since the slot lands at whatever the tail is at apply time).
    return "greetings [new]";
  }
  return entry.field === "greetings" ? `greetings [${entry.greetingIndex ?? "?"}]` : entry.field;
}

/** The applicability belts of the apply verb that depend only on the entry and the LIVE card. */
function refusalOf(entry: RefineryRewriteField, liveCard: CharacterCard): ReviewRefusal | undefined {
  if (isAppendedRewrite(entry)) {
    return;
  }
  if (entry.field === "greetings") {
    if (entry.greetingIndex === undefined) {
      return "greeting_index_missing";
    }
    return entry.greetingIndex >= liveCard.greetings.length ? "greeting_index_invalid" : undefined;
  }
  return entry.field === "depthPrompt" && liveCard.depthPrompt === null ? "not_applicable" : undefined;
}

/** Derive the reviewable entries from a rewrite payload + the two cards (pure — unit-tested through the
 *  accept-review CT's controlled lifecycle). Out-of-selection entries are dropped here so the review
 *  never PAINTS a block the apply verb would refuse (the server's belt stays the enforcer). */
export function reviewEntriesOf(
  fields: readonly RefineryRewriteField[],
  liveCard: CharacterCard,
  originalCard: CharacterCard,
  selection: RefinerySelection,
): ReviewEntry[] {
  const inScope = (entry: RefineryRewriteField): boolean => {
    if (!selection.fields.includes(entry.field)) {
      return false;
    }
    // An APPEND is fenced on the FIELD only — the verb's own belt, mirrored so the review never paints a
    // block the apply would refuse (nor hides one it would accept).
    if (isAppendedRewrite(entry)) {
      return true;
    }
    if (entry.field === "greetings" && selection.greetingIndexes !== undefined) {
      return entry.greetingIndex !== undefined && selection.greetingIndexes.includes(entry.greetingIndex);
    }
    return true;
  };
  // The append ORDINAL counts over the WHOLE payload, not the in-scope subset: it addresses into the run
  // row's own `fields` array, which is what the verb resolves against (`appendedRewrites`). Counting after
  // the filter would silently re-point an accept whenever any earlier append fell out of scope.
  const appendIndexOf = new Map<RefineryRewriteField, number>();
  let appendCount = 0;
  for (const entry of fields) {
    if (isAppendedRewrite(entry)) {
      appendIndexOf.set(entry, appendCount);
      appendCount += 1;
    }
  }
  return fields.flatMap((entry, payloadIndex): ReviewEntry[] => {
    if (!inScope(entry)) {
      return [];
    }
    const live = cardTextOf(liveCard, entry);
    const original = cardTextOf(originalCard, entry);
    const appendIndex = appendIndexOf.get(entry);
    const refusal = refusalOf(entry, liveCard);
    return [
      {
        entry,
        live,
        original,
        diverged: live !== original,
        payloadIndex,
        ...(appendIndex === undefined ? {} : { appendIndex }),
        ...(refusal === undefined ? {} : { refusal }),
      },
    ];
  });
}

function cardTextOf(card: CharacterCard, entry: RefineryRewriteField): string {
  if (isAppendedRewrite(entry)) {
    return "";
  }
  if (entry.field === "greetings") {
    return entry.greetingIndex === undefined ? "" : (card.greetings[entry.greetingIndex]?.text ?? "");
  }
  if (entry.field === "depthPrompt") {
    return card.depthPrompt?.prompt ?? "";
  }
  // Every remaining refinable target is a direct nullable-string card field — the indexed read IS the
  // exhaustiveness proof (a refinable member outside `CharacterCard`'s keys fails tsc right here).
  return card[entry.field] ?? "";
}
