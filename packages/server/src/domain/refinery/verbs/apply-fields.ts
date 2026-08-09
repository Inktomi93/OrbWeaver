// verb: applyFields — the SHARP END (security pass §4.8-13, in order): the user-accepted entries of the
// LATEST rewrite run land on the LIVE card. Per-entry salvage, never a whole-payload refusal — every
// dropped entry is itemized with its typed reason (the client renders them; nothing silently coerces or
// falls through to a different field).
//
// THE INTERSECTION IS THE INJECTION STOPPER (belts 9+10): applied = accepts ∩ the rewrite payload's
// entries ∩ the SESSION's selection — the model does not get to widen its own apply scope (a card whose
// text steered the model into rewriting `systemPrompt` dies here when the user never selected it), and
// apply is never automatic (the accept set is the client's explicit per-field choice).
//
// THE RE-PARSE IS THE INTERNAL-BOUNDARY BELT (belt 12, §3.A): the injected `character.update` op carries
// NO runtime validation (the wire zod parse lives at tRPC, which this server-internal call never
// crosses), so the constructed patch runs `updateCharacterSchema.parse` HERE — the
// `domain/import/substrate/card.ts:192` precedent (its importer re-parses at its own non-wire producer
// seam for the same reason). Do not "simplify" it away.
//
// SNAPSHOT FIRST (belt 13): `character.snapshot("auto: before refinery apply")` — the `restore.ts`
// reversibility precedent; reversibility is the real mitigation for a rewrite nobody noticed was steered.
//
// EMPTYING IS A FIRST-CLASS WRITE (owner ruling 2026-08-08 — "they can fill it therefore they can empty
// it"; design docs/design/refinery-schema-renderer.md §15). A `cleared` entry is a DESTRUCTIVE write
// authored by a model, so it deliberately adds NO new belt class — it passes the SAME intersection as a
// text entry (a steered "clear systemPrompt" outside the selection dies at `not_selected` exactly like a
// steered rewrite), apply is still never automatic (belt 10: the accept set is the user's explicit press),
// and the auto-snapshot still makes every clear reversible (belt 13). The three things it DOES add:
//   • ONE new drop reason — `would_leave_no_greeting` (a card with zero greetings is worse than any empty
//     field), the only refusal emptying invents;
//   • per-field applicability: clear maps to `null` for every nullable card field, to `""` for
//     `description` alone (its UPDATE wire is non-nullable — the declared §15.3 asymmetry), and to a
//     greeting SLOT REMOVAL for greetings (an empty greeting is a blank first message offered in chat);
//   • INDEX COHERENCE: everything addresses greetings by POSITION, so a removal remaps the session's own
//     `selection.greetingIndexes` in the same act. Prior RUN payloads are append-only history and are NOT
//     rewritten — they described the card as it stood.

import type { CharacterCard, Greeting } from "@orb/contracts/character";
import { updateCharacterSchema } from "@orb/contracts/character";
import type { RefineryRewriteField, RefinerySelection } from "@orb/contracts/refinery";
import { isClearedRewrite, REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import { RefineryStageNotReadyError } from "../contract/errors.ts";
import type { AcceptedField } from "../contract/params.ts";
import type { AppliedFieldRef, DroppedField } from "../contract/results.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";

const APPLY_SNAPSHOT_LABEL = "auto: before refinery apply";

/** How many greetings must SURVIVE an apply. A card with zero greetings has no first message to offer in
 *  chat — a worse authoring state than any empty field, so the last slot refuses to be cleared away. */
const MIN_SURVIVING_GREETINGS = 1;

export function createApplyFields(ctx: RefineryContext): RefineryService["applyFields"] {
  return async ({ principal, sessionId, accepts }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const session = sessionViewOf(row);
    const latestRewrite = await latestRunRowOf(ctx.db, sessionId, "rewrite");
    const rewrite = latestRewrite === undefined ? null : REFINERY_STAGE_PAYLOADS.rewrite.safeParse(latestRewrite.payload);
    if (rewrite === null || !rewrite.success) {
      throw new RefineryStageNotReadyError("There is no rewrite to apply yet — run the rewrite stage first.");
    }
    // The LIVE card — the greeting-index assert runs against THIS, never the session snapshot (a greeting
    // deleted since session start must not be re-created by index; §1 gap 3's verb-tier ruling).
    const liveCard = await ctx.loadOwnedCard({ ownerId, characterId: session.characterId });
    if (liveCard === undefined) {
      throw new DomainNotFoundError("character", session.characterId);
    }

    // ── the per-entry intersection (belts 9-11), in itemized order ──
    const { applied, dropped, chosen } = partitionAccepts(accepts, {
      rewriteFields: rewrite.data.fields,
      selectedFields: session.selection.fields,
      selectedGreetingIndexes: session.selection.greetingIndexes,
      liveGreetingCount: liveCard.greetings.length,
      liveHasDepthPrompt: liveCard.depthPrompt !== null,
    });
    if (chosen.length === 0) {
      // Nothing survived the belts — an honest ZERO-WRITE result (the client renders the drops): no
      // snapshot, no update, just the current detail via the injected read.
      const detail = await ctx.getCharacter({ principal, characterId: session.characterId });
      return { applied, dropped, character: detail };
    }

    const { patch, removedGreetingIndexes } = buildPatch(liveCard, chosen);
    // Belt 12 — the internal-boundary re-parse (header). A patch this belt refuses is OUR defect (the
    // payload caps mirror the card caps by contract), so a throw here is loud, never itemized away.
    const input = updateCharacterSchema.parse(patch);

    // Belt 13 — snapshot first, then the ONE canon write (both through the injected character ops).
    await ctx.snapshotCharacter({ principal, characterId: session.characterId, label: APPLY_SNAPSHOT_LABEL });
    const detail = await ctx.updateCharacter({ principal, characterId: session.characterId, input });

    // An apply completes the session (a later run/iterate flips it back active — a label, not a lock), and
    // a greeting removal REMAPS the selection in the same write: the session speaks in positions, so an
    // un-remapped index would silently re-point at a different greeting.
    await ctx.db
      .update(refinerySessions)
      .set({
        status: "completed",
        updatedAt: ctx.now(),
        ...(removedGreetingIndexes.length === 0 ? {} : { selection: remapSelection(session.selection, removedGreetingIndexes) }),
      })
      .where(eq(refinerySessions.id, sessionId));
    return { applied, dropped, character: detail };
  };
}

type AcceptVerdict = { readonly kind: "apply"; readonly entry: RefineryRewriteField } | { readonly kind: "drop"; readonly drop: DroppedField };

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

/** The belt inputs one apply call classifies every accept against (derived once, up front). */
interface AcceptBelts {
  readonly rewriteFields: readonly RefineryRewriteField[];
  readonly selectedFields: readonly string[];
  /** The selection's greeting-index narrowing — `undefined` means every greeting is in scope (contracts
   *  law). When it IS an array, an accept for a greeting index outside it is scope-widening past what the
   *  user selected (belt 9): the index was never fed to the model, so a rewrite entry for it is fabricated. */
  readonly selectedGreetingIndexes: readonly number[] | undefined;
  readonly liveGreetingCount: number;
  readonly liveHasDepthPrompt: boolean;
}

/** One accept's belt walk (belts 9-11): the accept's OWN SHAPE first (a malformed index is the input's
 *  defect whatever the rewrite holds — the precise reason beats a generic not_in_rewrite), then
 *  rewrite-membership, then the selection fence, then live-card applicability. Returns the matched
 *  rewrite entry or the typed drop. */
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
  // (4) live-card applicability (belt 11 — against the LIVE card, never the snapshot).
  if (accept.field === "greetings" && accept.greetingIndex !== undefined && accept.greetingIndex >= belts.liveGreetingCount) {
    return { kind: "drop", drop: { ...at, reason: "greeting_index_invalid" } };
  }
  if (accept.field === "depthPrompt" && !belts.liveHasDepthPrompt) {
    return { kind: "drop", drop: { ...at, reason: "not_applicable" } };
  }
  return { kind: "apply", entry };
}

// What CLEAR writes for one non-greeting, non-depthPrompt field. Every card text field clears to `null`
// except `description`, whose UPDATE wire is non-nullable (`updateCharacterSchema` derives from
// `createCharacterSchema`, whose `description` is the card FACE's plain string) even though the CARD
// schema allows null — so its only spelling of empty on the write path is "". That asymmetry is DECLARED,
// not designed: harmonizing it belongs with the in-flight card-face nullability work, decided WITH that
// lane rather than around it (schema-renderer §15.3). Until then, this is the one special case.
const DESCRIPTION_CLEARED = "";

// The patch off the LIVE card, split by target: the per-field writes go through `fieldPatchValueOf`, and
// the greetings array — the only entry class that can change the array's LENGTH — through
// `applyGreetingEntries`, which also reports which slots it removed so the caller can remap the session.
// Plain // comment: TSDoc chokes on brace-shape prose.
function buildPatch(
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
function remapSelection(selection: RefinerySelection, removed: readonly number[]): RefinerySelection {
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
