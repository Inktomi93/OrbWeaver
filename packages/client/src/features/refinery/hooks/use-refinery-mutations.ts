// The card-refinery WRITE tier (R2) — one `createEntityMutation` per write verb of the R1 router
// (`transport/trpc/routers/refinery.ts`), never an inline `useMutation` at a call site (§13.1).
//
// FRESHNESS IS EXPLICIT HERE, BY NECESSITY — the databank precedent, for the same reason: there is NO
// refinery bus event. `USER_BUS_EVENT_TYPES` has no refinery member and `domain/refinery/**` emits nothing
// at all, so a row in the central seam would have no event to hang on. Every refinery read is therefore
// reconciled by a named `invalidates` row below, and the three keys carry cited `STATIC` entries in
// `scripts/check/gates/query-freshness-coverage.ts` naming THIS file as their driver (the writer-local class).
//
// THE TWO CHARACTER-SIDE HALVES ARE NOT THE SAME, and the difference is the whole reason `character.get`
// appears here at all:
//   · THE APPLY WRITE IS BUS-COVERED. `applyFields` lands the accepted rewrite through the injected
//     `character.update`, which emits `charactersChanged` on the user bus (`domain/character/verbs/update.ts`)
//     — the seam's `charactersChanged` row path-invalidates `trpc.character.*`. Re-spelling it here would be
//     the double-invalidate storm, so `applyFields` names only the refinery reads its own row moved.
//   · THE F6 SIGNAL STAMP IS SILENT. `stampRefinerySignals` (`domain/character/persistence/refinery-ops.ts`)
//     is deliberately event-free — "no audit entry, no user-bus event, no snapshot", its own header — yet a
//     score run rewrites `characters.refinery.score` and an analyze run rewrites `characters.refinery.analysis`,
//     which is exactly what the card's provenance readout renders (`CharacterProvenanceSection`). With the app
//     QueryClient's `staleTime: Infinity` that readout has NO driver but the mutation that caused the stamp, so
//     `runStage` and `iterate` name `character.get` themselves. Path-level: the stamp's characterId lives on the
//     SESSION, not in these vars, and the read is free to invalidate when nothing observes it.
//
// ERROR COPY IS DISCRIMINATED, NEVER ASSERTED — the `use-tag-suggestion-mutations` / `resolve-failure`
// precedent. Refinery mints exactly two typed errors (`domain/refinery/contract/errors.ts`): the OUT-OF-ORDER
// refusal (a `DomainOperationError` → BAD_REQUEST carrying `data.reason: refinery_stage_not_ready`) and the
// run failure (`DomainUnavailableError` → SERVICE_UNAVAILABLE, codeless). Their FIXES are opposite — one is
// "run the missing stage first", the other is "try again" — so the toast reads the structured wire field and
// quotes the server's own sentence for the first, which is the only text that names WHICH stage is missing.

import { REFINERY_STAGE_NOT_READY_REASON } from "@orb/contracts/refinery";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { InvalidateFilter, Trpc } from "#data";
import { createEntityMutation } from "#data";

// ── the reads each write moves ──────────────────────────────────────────────────────────────────────

/** The sessions roster (D62 LIST) — every lifecycle write moves a row on it, and a run/apply moves its
 *  `status`/`latestVerdict`/`updatedAt` columns. */
function rosterRead(trpc: Trpc): InvalidateFilter {
  return trpc.refinery.listSessions.pathFilter();
}

/** ONE session's full view (the CONTENT surface's state: selection, stageConfig, guidance, iterationCount,
 *  status). Query-level — a write names the session it touched, so a second open session never refetches. */
function sessionRead(trpc: Trpc, sessionId: inferInput<Trpc["refinery"]["getSession"]>["sessionId"]): InvalidateFilter {
  return trpc.refinery.getSession.queryFilter({ sessionId });
}

/** ONE session's append-only run ledger (the CONTEXT Runs tab). Query-level, same argument as `sessionRead`. */
function runsRead(trpc: Trpc, sessionId: inferInput<Trpc["refinery"]["listRuns"]>["sessionId"]): InvalidateFilter {
  return trpc.refinery.listRuns.queryFilter({ sessionId });
}

/** The card detail carrying the F6 `refinery` signals — see the header's SILENT STAMP note. */
function cardSignalsRead(trpc: Trpc): InvalidateFilter {
  return trpc.character.get.pathFilter();
}

// ── the discriminated failure copy ──────────────────────────────────────────────────────────────────

/** The refusal reason off a tRPC error's `data.reason` (the error formatter's honest domain code), else "".
 *  Mirrors `use-tag-suggestion-mutations` / `turn-abort-notice` — the client keys on the structured wire
 *  field, never message text. */
function refineryFailureReason(error: unknown): string {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}

/** The thrown value's own message, or `null` when there is nothing worth printing. */
function refineryFailureMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

/**
 * The toast for a write that can be refused OUT OF ORDER: the server's own sentence when the wire reason is
 * `refinery_stage_not_ready`, else the verb's fallback.
 *
 * The server's message is the deliverable, not decoration — `RefineryStageNotReadyError` is thrown with the
 * missing stage named in the text ("There is no analysis to refine against yet — run analyze first."), and a
 * generic "couldn't run that stage" would throw away the only thing that makes the refusal actionable (the
 * `handDoorRefusal` "the server's reason IS the message" ruling). The fallback still covers the run failure,
 * which is codeless by design: only a `DomainOperationError` carries a reason.
 */
function stageOrderAwareToast(fallback: string): (error: unknown) => string {
  return (error): string => (refineryFailureReason(error) === REFINERY_STAGE_NOT_READY_REASON ? (refineryFailureMessage(error) ?? fallback) : fallback);
}

// ── session lifecycle ───────────────────────────────────────────────────────────────────────────────

/** @public the R2 write tier for the R3 refinery SURFACE (board C15, design-gated on the owner's mockup
 *  ruling) — the session producer. No prod consumer until that surface lands; the CT drives it today. */
export const useStartRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["startSession"]>, inferOutput<Trpc["refinery"]["startSession"]>>({
  options: (trpc) => trpc.refinery.startSession.mutationOptions(),
  // The roster only: `getSession`/`listRuns` for a session that did not exist are cold fetches of NEW keys.
  invalidates: (trpc) => [rosterRead(trpc)],
  errorToast: "Couldn't start a refinery session for that card.",
});

/** @public the R2 write tier for the R3 refinery surface (board C15) — the session patch (name · guidance ·
 *  selection · stageConfig · status). No prod consumer until R3; the CT drives it today. */
export const useUpdateRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["updateSession"]>, inferOutput<Trpc["refinery"]["updateSession"]>>({
  options: (trpc) => trpc.refinery.updateSession.mutationOptions(),
  // Both: the patch is the CONTENT surface's own state, and `name`/`status`/`updatedAt` are roster columns.
  invalidates: (trpc, vars) => [sessionRead(trpc, vars.sessionId), rosterRead(trpc)],
  errorToast: "Couldn't save the session.",
});

/** @public the R2 write tier for the R3 refinery surface (board C15) — session deletion (the runs cascade
 *  with it). No prod consumer until R3; the CT drives it today. */
export const useDeleteRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["deleteSession"]>, unknown>({
  options: (trpc) => trpc.refinery.deleteSession.mutationOptions(),
  // All three: a cached detail/ledger for a deleted session would otherwise be served verbatim to whatever
  // still observes it (staleTime is Infinity). The refetch resolves NOT_FOUND, which is the truth.
  invalidates: (trpc, vars) => [rosterRead(trpc), sessionRead(trpc, vars.sessionId), runsRead(trpc, vars.sessionId)],
  errorToast: "Couldn't delete the session.",
});

// ── the pipeline ────────────────────────────────────────────────────────────────────────────────────

/** @public the R2 write tier for the R3 refinery surface (board C15) — one stage under the session's
 *  in-force config. No prod consumer until R3; the CT drives it today. */
export const useRunRefineryStage = createEntityMutation<inferInput<Trpc["refinery"]["runStage"]>, inferOutput<Trpc["refinery"]["runStage"]>>({
  options: (trpc) => trpc.refinery.runStage.mutationOptions(),
  // A run APPENDS to the ledger, flips the session back to `active` with a fresh `updatedAt` (both roster
  // columns), and — on score/analyze — silently re-stamps the card's F6 signals (the header's note).
  invalidates: (trpc, vars) => [runsRead(trpc, vars.sessionId), sessionRead(trpc, vars.sessionId), rosterRead(trpc), cardSignalsRead(trpc)],
  errorToast: stageOrderAwareToast("That stage didn't finish — try again."),
});

/** @public the R2 write tier for the R3 refinery surface (board C15) — one refinement round (refine-rewrite
 *  then analyze). No prod consumer until R3; the CT drives it today. */
export const useIterateRefinery = createEntityMutation<inferInput<Trpc["refinery"]["iterate"]>, inferOutput<Trpc["refinery"]["iterate"]>>({
  options: (trpc) => trpc.refinery.iterate.mutationOptions(),
  // A round writes TWO runs plus `iterationCount` (and, through its analyze half, the F6 analysis stamp) —
  // the same read set as `runStage`, and it must survive the MID-ROUND failure arm: when the analyze half
  // throws, the rewrite run already landed, and `onSettled` runs on error too, so the ledger still repaints.
  invalidates: (trpc, vars) => [runsRead(trpc, vars.sessionId), sessionRead(trpc, vars.sessionId), rosterRead(trpc), cardSignalsRead(trpc)],
  errorToast: stageOrderAwareToast("That refinement round didn't finish — try again."),
});

// ── the sharp end ───────────────────────────────────────────────────────────────────────────────────

type ApplyFieldsResult = inferOutput<Trpc["refinery"]["applyFields"]>;

/**
 * ERRORS-AS-DATA — the total-drop apply, which is the third outcome class `createEntityMutation.refusal`
 * exists for (EDITSNAP-OK).
 *
 * `applyFields` never refuses a whole payload: it itemizes per entry (`applied` / `dropped` with a typed
 * reason) and RESOLVES. So an apply in which every accepted entry died on the intersection belts — a stale
 * accept set, a greeting deleted since session start, a field outside the session's selection — resolves
 * normally: `errorToast` cannot fire, `mutation.error` stays null, and a fire-and-forget `.mutate()` shows
 * the user nothing while their card is untouched. That is the silent-failure shape, and it rides the FACTORY
 * because it is a property of the VERB.
 *
 * Only the TOTAL drop. A partial apply DID write, and its per-entry reasons are structured data the R3
 * surface renders beside the fields; toasting an error over a successful write would be a lie about it.
 */
function applyRefusal(data: ApplyFieldsResult): string | null {
  return data.applied.length === 0 && data.dropped.length > 0 ? "Nothing was applied — every accepted rewrite was dropped." : null;
}

/** @public the R2 write tier for the R3 refinery surface (board C15) — the accepted rewrite entries onto the
 *  LIVE card. No prod consumer until R3; the CT drives it today. */
export const useApplyRefineryFields = createEntityMutation<inferInput<Trpc["refinery"]["applyFields"]>, ApplyFieldsResult>({
  options: (trpc) => trpc.refinery.applyFields.mutationOptions(),
  // The refinery half ONLY — an apply completes the session (`status`/`updatedAt`, both roster columns). The
  // CARD half rides the user bus: `character.update` emits `charactersChanged`, which the seam already routes
  // to `trpc.character.*` (see the header — re-spelling it here is the double-invalidate storm).
  invalidates: (trpc, vars) => [sessionRead(trpc, vars.sessionId), rosterRead(trpc)],
  refusal: applyRefusal,
  errorToast: stageOrderAwareToast("Couldn't apply that rewrite."),
});
