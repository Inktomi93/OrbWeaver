// verb: submitManualRewrite — the HAND-AUTHORED rewrite arm (og-extension-feedback gap 1, the accepted
// OG workflow: score → (LLM | manual) → analyze). The owner's WIP edit lands as a rewrite RUN with
// `{kind:"manual"}` provenance, `model` null (no model ran), zero duration/usage — so analyze judges it
// against the anchored original EXACTLY like a model rewrite, iterate can refine it, and apply can land
// it, all through the machinery that already exists.
//
// THE SELECTION FENCE REFUSES LOUDLY here, not itemized: the author is the OWNER hand-editing in the WIP
// area — an entry outside the session's selection is a client defect (the editor only offers selected
// fields), never a steering attempt to salvage around. Same fence as belt 9, different failure posture
// (the apply-side intersection still runs at the terminal act regardless).

import type { RefineryRewriteField } from "@orb/contracts/refinery";
import { isAppendedRewrite, refineryRewritePayloadSchema } from "@orb/contracts/refinery";
import { refineryRuns, refinerySessions } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestRunRowOf, loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";

/** The coded reason for an out-of-selection manual entry (the client reads it off the BAD_REQUEST body). */
export const MANUAL_REWRITE_OUT_OF_SCOPE_REASON = "refinery_manual_rewrite_out_of_scope";

/** Is this entry inside the session's selection fence (field + narrowed greeting indexes)? An APPEND (F-T1)
 *  is fenced on the FIELD only: a new slot has no index to be inside a narrowing — the same asymmetry the
 *  apply belts carry, for the same reason (gating it on `greetingIndexes` would make hand-adding a greeting
 *  impossible in any narrowed session). */
function inSelection(entry: RefineryRewriteField, selection: { fields: readonly string[]; greetingIndexes?: readonly number[] | undefined }): boolean {
  if (!selection.fields.includes(entry.field)) {
    return false;
  }
  if (isAppendedRewrite(entry)) {
    return true;
  }
  if (entry.field === "greetings" && selection.greetingIndexes !== undefined) {
    return entry.greetingIndex !== undefined && selection.greetingIndexes.includes(entry.greetingIndex);
  }
  return true;
}

/** The out-of-scope refusal's human target name. An append has no slot to name, so it reads as the act it
 *  is — "greetings[new]" rather than a fabricated index or a bare `?`. */
function targetNameOf(entry: RefineryRewriteField): string {
  if (isAppendedRewrite(entry)) {
    return "greetings[new]";
  }
  return entry.field === "greetings" ? `greetings[${entry.greetingIndex ?? "?"}]` : entry.field;
}

export function createSubmitManualRewrite(ctx: RefineryContext): RefineryService["submitManualRewrite"] {
  return async ({ principal, sessionId, fields }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const session = sessionViewOf(row);
    // The internal-boundary parse (the wire parse does not cover a future internal caller) — the SAME
    // typed rewrite contract a model run produces, cleared arm included.
    const payload = refineryRewritePayloadSchema.parse({ fields });
    const outside = payload.fields.filter((entry) => !inSelection(entry, session.selection));
    if (outside.length > 0) {
      const names = outside.map(targetNameOf).join(", ");
      throw new DomainOperationError(
        MANUAL_REWRITE_OUT_OF_SCOPE_REASON,
        `These fields are outside this session's scope: ${names}. Widen the scope first, or drop them.`,
      );
    }

    // The DAG parent: the run the hand-edit worked FROM — the latest analyze (the feedback being
    // addressed) when one exists, else the latest score. Parsed presence is not required: a manual edit
    // is legal on a fresh session (the OG's own flow starts from score, but nothing structural demands it).
    const [score, analyze] = await Promise.all([latestRunRowOf(ctx.db, sessionId, "score"), latestRunRowOf(ctx.db, sessionId, "analyze")]);
    const at = ctx.now();
    const view = {
      id: ctx.newRefineryRunId(),
      sessionId,
      iteration: session.iterationCount,
      model: null,
      promptTokens: null,
      outputTokens: null,
      // Wall time of a hand edit is not a model economics number — zero, honestly (the row's cost columns
      // describe MODEL work; the ledger renders a manual run's cost line as "hand-authored").
      durationMs: 0,
      sourceRunId: analyze?.id ?? score?.id ?? null,
      stage: "rewrite" as const,
      payloadConfig: { kind: "manual" as const },
      payload,
      strippedKeys: [] as string[],
      createdAt: at,
    };
    await ctx.db.insert(refineryRuns).values(view);
    await ctx.db.update(refinerySessions).set({ status: "active", updatedAt: at }).where(eq(refinerySessions.id, sessionId));
    return view;
  };
}
