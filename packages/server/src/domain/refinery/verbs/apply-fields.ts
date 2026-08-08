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

import type { CharacterCard, Greeting } from "@orb/contracts/character";
import { updateCharacterSchema } from "@orb/contracts/character";
import type { RefineryRewriteField } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
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
      liveGreetingCount: liveCard.greetings.length,
      liveHasDepthPrompt: liveCard.depthPrompt !== null,
    });
    if (chosen.length === 0) {
      // Nothing survived the belts — an honest ZERO-WRITE result (the client renders the drops): no
      // snapshot, no update, just the current detail via the injected read.
      const detail = await ctx.getCharacter({ principal, characterId: session.characterId });
      return { applied, dropped, character: detail };
    }

    // Belt 12 — the internal-boundary re-parse (header). A patch this belt refuses is OUR defect (the
    // payload caps mirror the card caps by contract), so a throw here is loud, never itemized away.
    const input = updateCharacterSchema.parse(buildPatch(liveCard, chosen));

    // Belt 13 — snapshot first, then the ONE canon write (both through the injected character ops).
    await ctx.snapshotCharacter({ principal, characterId: session.characterId, label: APPLY_SNAPSHOT_LABEL });
    const detail = await ctx.updateCharacter({ principal, characterId: session.characterId, input });

    // An apply completes the session (a later run/iterate flips it back active — a label, not a lock).
    await ctx.db.update(refinerySessions).set({ status: "completed", updatedAt: ctx.now() }).where(eq(refinerySessions.id, sessionId));
    return { applied, dropped, character: detail };
  };
}

type AcceptVerdict = { readonly kind: "apply"; readonly entry: RefineryRewriteField } | { readonly kind: "drop"; readonly drop: DroppedField };

/** Walk every accept through {@link classifyAccept}, splitting the applied set from the itemized drops. */
function partitionAccepts(
  accepts: readonly AcceptedField[],
  belts: AcceptBelts,
): { applied: AppliedFieldRef[]; dropped: DroppedField[]; chosen: RefineryRewriteField[] } {
  const applied: AppliedFieldRef[] = [];
  const dropped: DroppedField[] = [];
  const chosen: RefineryRewriteField[] = [];
  for (const accept of accepts) {
    const verdict = classifyAccept(accept, belts);
    if (verdict.kind === "drop") {
      dropped.push(verdict.drop);
    } else {
      applied.push({ field: accept.field, greetingIndex: accept.greetingIndex });
      chosen.push(verdict.entry);
    }
  }
  return { applied, dropped, chosen };
}

/** The belt inputs one apply call classifies every accept against (derived once, up front). */
interface AcceptBelts {
  readonly rewriteFields: readonly RefineryRewriteField[];
  readonly selectedFields: readonly string[];
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
  // (3) the SESSION's selection fence (belt 9 — the scope-widening stopper).
  if (!belts.selectedFields.includes(accept.field)) {
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

// The patch off the LIVE card: greetings = the live array with accepted indexes replaced; a depth-prompt
// entry replaces the note TEXT only (the depth/role directive is authored config, never model output —
// the classify belt guaranteed the note exists). Plain // comment: TSDoc chokes on brace-shape prose.
function buildPatch(liveCard: CharacterCard, chosen: readonly RefineryRewriteField[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  let greetings: Greeting[] | null = null;
  for (const entry of chosen) {
    if (entry.field === "greetings") {
      greetings = greetings ?? [...liveCard.greetings];
      const i = entry.greetingIndex ?? -1;
      const current = greetings[i];
      if (current !== undefined) {
        greetings[i] = { ...current, text: entry.text };
      }
      continue;
    }
    if (entry.field === "depthPrompt") {
      patch["depthPrompt"] = liveCard.depthPrompt === null ? null : { ...liveCard.depthPrompt, prompt: entry.text };
      continue;
    }
    patch[entry.field] = entry.text;
  }
  if (greetings !== null) {
    patch["greetings"] = greetings;
  }
  return patch;
}
