// domain/refinery/substrate/accept-belts — the SHARED accept intersection + patch construction the two
// terminal verbs run (`applyFields` = merge onto the live card; `applyAsCopy` = branch-off, §17 "belts
// 9-11 verbatim"). ONE code path so the copy arm can never drift a belt (a biconditional about every
// writer is a claim about every writer — this file makes it one writer).
//
// THE INTERSECTION IS THE INJECTION STOPPER (belts 9+10): applied = accepts ∩ the rewrite payload's
// entries ∩ the SESSION's selection — the model does not get to widen its own apply scope, and apply is
// never automatic (the accept set is the client's explicit per-block Keep press, arm B).
//
// THE DIVERGENCE BELT (schema-renderer §21 edge 2 — the git merge-conflict): an accepted field whose
// LIVE text differs from the session's `original_card` pin moved UNDER the session. Without an explicit
// `confirmDiverged` the entry drops (`diverged_since_session`) rather than writing blind — the surface
// re-opens the block as a BASE·LIVE·REWRITE conflict and the re-confirmed accept passes. No auto-merge.

import type { CharacterCard, Greeting } from "@orb/contracts/character";
import type { RefinableField, RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";
import { isClearedRewrite, REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefineryRunId, RefinerySessionId, UserId } from "@orb/kit/ids";
import type { RefineryContext } from "../context.ts";
import { RefineryStageNotReadyError } from "../contract/errors.ts";
import type { AcceptedField } from "../contract/params.ts";
import type { AcceptBelts, AcceptVerdict, AppliedFieldRef, DroppedField, RefinerySessionView } from "../contract/results.ts";
import { latestRunRowOf, loadOwnedSessionRow, loadSessionRewriteRunRow, sessionViewOf } from "../persistence/queries.ts";

/** How many greetings must SURVIVE an apply. A card with zero greetings has no first message to offer in
 *  chat — a worse authoring state than any empty field, so the last slot refuses to be cleared away. */
const MIN_SURVIVING_GREETINGS = 1;

// What CLEAR writes for one non-greeting, non-depthPrompt field. Every card text field clears to `null`
// except `description`, whose UPDATE wire is non-nullable (`updateCharacterSchema` derives from
// `createCharacterSchema`, whose `description` is the card FACE's plain string) even though the CARD
// schema allows null — so its only spelling of empty on the write path is "". That asymmetry is DECLARED,
// not designed: harmonizing it belongs with the in-flight card-face nullability work (schema-renderer
// §15.3). Until then, this is the one special case.
const DESCRIPTION_CLEARED = "";

// `AcceptVerdict` / `AcceptBelts` are homed in `../contract/results.ts` (§7.4 — the one type home).

/** One field's CURRENT text on a card, for the divergence compare — greetings per index, depthPrompt =
 *  the note text (the same projection the prompt substrate reads). */
function comparableTextOf(card: CharacterCard, field: RefinableField, greetingIndex: number | undefined): string | null {
  if (field === "greetings") {
    return greetingIndex === undefined ? null : (card.greetings[greetingIndex]?.text ?? null);
  }
  switch (field) {
    case "description":
      return card.description;
    case "personality":
      return card.personality;
    case "scenario":
      return card.scenario;
    case "exampleMessages":
      return card.exampleMessages;
    case "systemPrompt":
      return card.systemPrompt;
    case "postHistoryInstructions":
      return card.postHistoryInstructions;
    case "depthPrompt":
      return card.depthPrompt?.prompt ?? null;
    case "creatorNotes":
      return card.creatorNotes;
    default: {
      const never: never = field;
      throw new Error(`unreachable refinable field: ${String(never)}`);
    }
  }
}

/** Has this field MOVED since the session's pin? Empty-vs-null are two spellings of the same authored
 *  emptiness on a card face, so they compare equal here — a divergence verdict is about CONTENT motion,
 *  never the storage spelling. */
function divergedSincePin(belts: AcceptBelts, field: RefinableField, greetingIndex: number | undefined): boolean {
  const original = comparableTextOf(belts.originalCard, field, greetingIndex) ?? "";
  const live = comparableTextOf(belts.liveCard, field, greetingIndex) ?? "";
  return original !== live;
}

/** One accept's belt walk (belts 9-11 + the divergence belt): the accept's OWN SHAPE first (a malformed
 *  index is the input's defect whatever the rewrite holds — the precise reason beats a generic
 *  not_in_rewrite), then rewrite-membership, then the selection fence, then live-card applicability,
 *  then the divergence check. Returns the matched rewrite entry or the typed drop. */
function classifyAccept(accept: AcceptedField, belts: AcceptBelts): AcceptVerdict {
  const at = { field: accept.field, greetingIndex: accept.greetingIndex };
  // (1) shape — the greetingIndex biconditional's two arms.
  if (accept.field === "greetings" && accept.greetingIndex === undefined) {
    return { kind: "drop", drop: { ...at, reason: "greeting_index_missing" } };
  }
  if (accept.field !== "greetings" && accept.greetingIndex !== undefined) {
    return { kind: "drop", drop: { ...at, reason: "greeting_index_forbidden" } };
  }
  // (2) the rewrite actually produced this entry.
  const entry = belts.rewriteFields.find((f) => f.field === accept.field && (accept.field !== "greetings" || f.greetingIndex === accept.greetingIndex));
  if (entry === undefined) {
    return { kind: "drop", drop: { ...at, reason: "not_in_rewrite" } };
  }
  // (3) the SESSION's selection fence (belt 9 — the scope-widening stopper). Two arms: the FIELD must be
  // selected, AND — when the selection narrowed greetings to specific indexes — the greeting INDEX must be
  // among them. A steered rewrite fabricating an entry for an unselected greeting slot dies here even with
  // an explicit accept (the index was never in the pipeline, so its "rewrite" is invented).
  if (!belts.selectedFields.includes(accept.field)) {
    return { kind: "drop", drop: { ...at, reason: "not_selected" } };
  }
  if (
    accept.field === "greetings" &&
    belts.selectedGreetingIndexes !== undefined &&
    accept.greetingIndex !== undefined &&
    !belts.selectedGreetingIndexes.includes(accept.greetingIndex)
  ) {
    return { kind: "drop", drop: { ...at, reason: "not_selected" } };
  }
  // (4) live-card applicability (belt 11 — against the LIVE card, never the snapshot). BEFORE the
  // divergence belt deliberately: a deleted slot / removed depth note is unapplicable-and-diverged at
  // once, and the SPECIFIC verdict ("that slot no longer exists") beats the generic conflict.
  if (accept.field === "greetings" && accept.greetingIndex !== undefined && accept.greetingIndex >= belts.liveGreetingCount) {
    return { kind: "drop", drop: { ...at, reason: "greeting_index_invalid" } };
  }
  if (accept.field === "depthPrompt" && !belts.liveHasDepthPrompt) {
    return { kind: "drop", drop: { ...at, reason: "not_applicable" } };
  }
  // (5) the divergence belt (§21 edge 2 — header): a still-applicable field that MOVED under the session
  // needs the explicit re-confirmation; an unconfirmed accept drops rather than fast-forwarding.
  if (accept.confirmDiverged !== true && divergedSincePin(belts, accept.field, accept.greetingIndex)) {
    return { kind: "drop", drop: { ...at, reason: "diverged_since_session" } };
  }
  return { kind: "apply", entry };
}

/** Walk every accept through {@link classifyAccept}, splitting the applied set from the itemized drops.
 *
 *  The ONE belt that cannot live in the per-entry classifier is the greeting-clear budget: whether the
 *  NEXT removal is legal depends on how many earlier accepts in THIS batch already removed a slot. It is
 *  evaluated here, in accept order, so the outcome is deterministic and every refusal is itemized rather
 *  than the batch being refused whole. */
function partitionAccepts(
  accepts: readonly AcceptedField[],
  belts: AcceptBelts,
): { applied: AppliedFieldRef[]; dropped: DroppedField[]; chosen: RefineryRewriteField[] } {
  const applied: AppliedFieldRef[] = [];
  const dropped: DroppedField[] = [];
  const chosen: RefineryRewriteField[] = [];
  let greetingsRemoved = 0;
  for (const accept of accepts) {
    const verdict = classifyAccept(accept, belts);
    if (verdict.kind === "drop") {
      dropped.push(verdict.drop);
      continue;
    }
    const cleared = isClearedRewrite(verdict.entry);
    if (cleared && accept.field === "greetings") {
      if (belts.liveGreetingCount - greetingsRemoved <= MIN_SURVIVING_GREETINGS) {
        dropped.push({ field: accept.field, greetingIndex: accept.greetingIndex, reason: "would_leave_no_greeting" });
        continue;
      }
      greetingsRemoved += 1;
    }
    applied.push({ field: accept.field, greetingIndex: accept.greetingIndex, kind: cleared ? "cleared" : "replaced" });
    chosen.push(verdict.entry);
  }
  return { applied, dropped, chosen };
}

// The patch off the LIVE card, split by target: the per-field writes go through `fieldPatchValueOf`, and
// the greetings array — the only entry class that can change the array's LENGTH — through
// `applyGreetingEntries`, which also reports which slots it removed so the caller can remap the session.
// Plain // comment: TSDoc chokes on brace-shape prose.
export function buildPatch(
  liveCard: CharacterCard,
  chosen: readonly RefineryRewriteField[],
): { patch: Record<string, unknown>; removedGreetingIndexes: readonly number[] } {
  const patch: Record<string, unknown> = {};
  const greetingEntries = chosen.filter((entry) => entry.field === "greetings");
  for (const entry of chosen) {
    if (entry.field === "greetings") {
      continue;
    }
    patch[entry.field] = fieldPatchValueOf(liveCard, entry);
  }
  if (greetingEntries.length === 0) {
    return { patch, removedGreetingIndexes: [] };
  }
  const { greetings, removed } = applyGreetingEntries(liveCard, greetingEntries);
  patch["greetings"] = greetings;
  return { patch, removedGreetingIndexes: removed };
}

/** What ONE non-greeting entry writes. A depth-prompt REPLACE touches the note text only (the
 *  `{depth, role}` directive is authored config, never model output — the classify belt guaranteed the
 *  note exists); a depth-prompt CLEAR drops the note and its directive together. */
function fieldPatchValueOf(liveCard: CharacterCard, entry: Exclude<RefineryRewriteField, { field: "greetings" }>): unknown {
  if (entry.field === "depthPrompt") {
    return isClearedRewrite(entry) || liveCard.depthPrompt === null ? null : { ...liveCard.depthPrompt, prompt: entry.text };
  }
  if (isClearedRewrite(entry)) {
    return entry.field === "description" ? DESCRIPTION_CLEARED : null;
  }
  return entry.text;
}

/** The greetings array the patch writes: the LIVE array with accepted indexes replaced, then the cleared
 *  ones removed. The two passes are ORDERED deliberately — every belt decision above ran against
 *  PRE-splice indexes (the positions the whole session speaks), so replacement must land before removal,
 *  and a single filter is exactly the descending-order splice without the ordering trap. */
function applyGreetingEntries(liveCard: CharacterCard, entries: readonly RefineryRewriteField[]): { greetings: Greeting[]; removed: readonly number[] } {
  const greetings: Greeting[] = [...liveCard.greetings];
  const removed = new Set<number>();
  for (const entry of entries) {
    const i = entry.greetingIndex ?? -1;
    const current = greetings[i];
    if (current === undefined) {
      continue;
    }
    if (isClearedRewrite(entry)) {
      removed.add(i);
      continue;
    }
    greetings[i] = { ...current, text: entry.text };
  }
  return { greetings: removed.size === 0 ? greetings : greetings.filter((_, i) => !removed.has(i)), removed: [...removed] };
}

/** Re-point the session's selected greeting indexes across a removal: a removed index drops out, and every
 *  survivor shifts down by the number of removals BELOW it (§15.2's worked example — `[0,2,3]` minus a
 *  removal at 2 → `[0,2]`). A selection that never named indexes still means "every greeting" and needs no
 *  remap; the surviving list may legally end up empty (the user selected only removed slots). */
export function remapSelection(selection: RefinerySelection, removed: readonly number[]): RefinerySelection {
  const indexes = selection.greetingIndexes;
  if (indexes === undefined) {
    return selection;
  }
  const gone = new Set(removed);
  return {
    ...selection,
    greetingIndexes: indexes.filter((i) => !gone.has(i)).map((i) => i - removed.filter((r) => r < i).length),
  };
}

/** Everything both terminal verbs resolve BEFORE their write half: the owned session, the chosen rewrite
 *  run (latest, or the §16.1 operate-back pin — session-scoped, leak-free), the LIVE card, and the belt
 *  intersection over the accepts. ONE resolver so the merge and branch-off arms cannot drift a load or a
 *  belt (the header's one-writer law, extended to the preamble). */
export async function resolveApplyBasis(
  ctx: RefineryContext,
  args: {
    readonly ownerId: UserId;
    readonly sessionId: RefinerySessionId;
    readonly rewriteRunId: RefineryRunId | undefined;
    readonly accepts: readonly AcceptedField[];
  },
): Promise<{
  readonly session: RefinerySessionView;
  readonly liveCard: CharacterCard;
  readonly applied: AppliedFieldRef[];
  readonly dropped: DroppedField[];
  readonly chosen: RefineryRewriteField[];
}> {
  const { ownerId, sessionId, rewriteRunId, accepts } = args;
  const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
  if (row === undefined) {
    throw new DomainNotFoundError("refinery session", sessionId);
  }
  const session = sessionViewOf(row);
  const rewriteRow =
    rewriteRunId === undefined ? await latestRunRowOf(ctx.db, sessionId, "rewrite") : await loadSessionRewriteRunRow(ctx.db, sessionId, rewriteRunId);
  if (rewriteRunId !== undefined && rewriteRow === undefined) {
    throw new DomainNotFoundError("refinery run", rewriteRunId);
  }
  const rewrite = rewriteRow === undefined ? null : REFINERY_STAGE_PAYLOADS.rewrite.safeParse(rewriteRow.payload);
  if (rewrite === null || !rewrite.success) {
    throw new RefineryStageNotReadyError("There is no rewrite to apply yet — run the rewrite stage first.");
  }
  // The LIVE card — the greeting-index assert runs against THIS, never the session snapshot (a greeting
  // deleted since session start must not be re-created by index; §1 gap 3's verb-tier ruling).
  const liveCard = await ctx.loadOwnedCard({ ownerId, characterId: session.characterId });
  if (liveCard === undefined) {
    throw new DomainNotFoundError("character", session.characterId);
  }
  const { applied, dropped, chosen } = partitionAccepts(accepts, {
    rewriteFields: rewrite.data.fields,
    selectedFields: session.selection.fields,
    selectedGreetingIndexes: session.selection.greetingIndexes,
    liveGreetingCount: liveCard.greetings.length,
    liveHasDepthPrompt: liveCard.depthPrompt !== null,
    originalCard: session.originalCard,
    liveCard,
  });
  return { session, liveCard, applied, dropped, chosen };
}
