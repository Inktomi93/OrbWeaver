// The card-refinery WRITE tier (R2) — one `createEntityMutation` per write verb of the R1 router
// (`transport/trpc/routers/refinery.ts`), never an inline `useMutation` at a call site (§13.1).
//
// FRESHNESS IS THE BUS NOW, and that is a REVERSAL of this file's founding note — the event-bus coverage
// survey's H1 (docs/design/event-bus-coverage-survey.md §2.2) is closed. Refinery used to emit nothing on any
// plane, so every write here carried its own `invalidates` and the reads carried cited STATIC rows in
// `scripts/check/gates/query-freshness-coverage.ts`. That was writer-local freshness: it reconciled the tab
// that wrote and NOTHING else, so at `staleTime: Infinity` a second tab or device sat on the pre-write
// roster/session/ledger forever. Every persisting refinery verb now emits the `refineryChanged` user-bus
// member (contracts `user-bus`), the seam maps it to `trpc.refinery` + `trpc.character.get`
// (`data/invalidation.ts`), and the STATIC rows were deleted in the same commit (the ratchet REDs a cited key
// that gains a row). So every write below is `busDriven: true` — the compile-time XOR in
// `data/create-entity-mutation.ts` forbids carrying both, and doing both is the double-invalidate storm.
//
// WHAT THE SEAM ROW COVERS, so nothing here has to re-spell it:
//   · THE REFINERY READS — roster, session view, run ledger, schema library, preflight — the whole router
//     root, which is why a coarse member is enough for a surface that opens one session at a time.
//   · THE F6 SIGNAL STAMP, which is SILENT by design (`domain/character/persistence/refinery-ops.ts`: "no
//     audit entry, no user-bus event"). A score/analyze run rewrites `characters.refinery.*` — exactly what
//     `CharacterProvenanceSection` renders — so `character.get` is a row on `refineryChanged` itself. It used
//     to be an `invalidates` entry on `runStage`/`iterate` here; on the bus it now repaints the OTHER devices
//     too, which the mutation never could.
//   · THE APPLY'S CARD HALF, which was never this file's: `character.update`/`duplicate` emit
//     `charactersChanged` inside the verb, and the seam already routes that to `trpc.character.*`.
//
// THE DRAFT VERBS (`generateSchema`/`refineSchema`/`testSchema`, in use-refinery-schemas.ts) stay on an
// explicit EMPTY `invalidates`, not `busDriven`: they persist nothing, so the server emits nothing, and
// "this write moves no read" is a statement the empty list makes and `busDriven` would falsify.
//
// ERROR COPY IS DISCRIMINATED, NEVER ASSERTED — the `use-tag-suggestion-mutations` / `resolve-failure`
// precedent. Refinery mints three typed errors (`domain/refinery/contract/errors.ts`): two CODED refusals
// (`DomainOperationError` → BAD_REQUEST with a `data.reason` — out-of-order, and the caller-capped output
// budget) and the codeless run failure (`DomainUnavailableError` → SERVICE_UNAVAILABLE). The coded pair each
// carry the only text that makes them actionable — WHICH stage to run first, or the fit receipt (the computed
// need, the preset cap under it, the knob) — so the toast keys on the structured wire field and quotes the
// server's own sentence for them; "try again" stays the honest copy for the codeless arm alone.

import { REFINERY_OUTPUT_BUDGET_REASON, REFINERY_STAGE_NOT_READY_REASON } from "@orb/contracts/refinery";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

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

/** The refusals whose server sentence IS the deliverable — every CODED refinery error. Kept as a set rather
 *  than an `||` chain so adding a fourth typed error is a one-line decision at the contract's own vocabulary,
 *  not an edit to a predicate. */
const QUOTED_REFUSAL_REASONS: ReadonlySet<string> = new Set([REFINERY_STAGE_NOT_READY_REASON, REFINERY_OUTPUT_BUDGET_REASON]);

/**
 * The toast for a write that can be refused with a REASON: the server's own sentence when the wire carries
 * one of the coded refusals, else the verb's fallback.
 *
 * The server's message is the deliverable, not decoration — each coded error is thrown with the actionable
 * fact in its text (`RefineryStageNotReadyError` names the missing stage: "There is no analysis to refine
 * against yet — run analyze first."; `RefineryOutputBudgetError` carries the fit receipt: the tokens the run
 * needs, the preset cap sitting under it, and the knob to move). A generic "couldn't run that stage" would
 * throw away the only thing that makes either refusal actionable (the `handDoorRefusal` "the server's reason
 * IS the message" ruling). The fallback still covers the run failure, which is codeless by design: only a
 * `DomainOperationError` carries a reason.
 */
function codedRefusalAwareToast(fallback: string): (error: unknown) => string {
  return (error): string => (QUOTED_REFUSAL_REASONS.has(refineryFailureReason(error)) ? (refineryFailureMessage(error) ?? fallback) : fallback);
}

// ── session lifecycle ───────────────────────────────────────────────────────────────────────────────

/** The R2 write tier — the session producer (consumed by the R3 surface since `5727fcb12`). */
export const useStartRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["startSession"]>, inferOutput<Trpc["refinery"]["startSession"]>>({
  options: (trpc) => trpc.refinery.startSession.mutationOptions(),
  // `startSession` emits `refineryChanged` with the new session's id; the seam's row refetches the roster on
  // every device. (`getSession`/`listRuns` for a session that did not exist are cold fetches of NEW keys.)
  busDriven: true,
  errorToast: "Couldn't start a refinery session for that card.",
});

/** The R2 write tier — the session patch (name · guidance · selection · stageConfig · status); consumed by the R3 surface. */
export const useUpdateRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["updateSession"]>, inferOutput<Trpc["refinery"]["updateSession"]>>({
  options: (trpc) => trpc.refinery.updateSession.mutationOptions(),
  // The patch moves the session view, two roster columns and the preflight arithmetic — all three live under
  // the `trpc.refinery` root the member path-invalidates.
  busDriven: true,
  errorToast: "Couldn't save the session.",
});

/** @public the R2 write tier for the R3 refinery surface (board C15) — session deletion (the runs cascade
 *  with it). No prod consumer until R3; the CT drives it today. */
export const useDeleteRefinerySession = createEntityMutation<inferInput<Trpc["refinery"]["deleteSession"]>, unknown>({
  options: (trpc) => trpc.refinery.deleteSession.mutationOptions(),
  // The verb emits AFTER the delete (the user bus is live-only — no durable event row to orphan). A cached
  // detail/ledger for a deleted session would otherwise be served verbatim to whatever still observes it
  // (staleTime is Infinity); the root refetch resolves NOT_FOUND, which is the truth.
  busDriven: true,
  errorToast: "Couldn't delete the session.",
});

// ── the pipeline ────────────────────────────────────────────────────────────────────────────────────

/** The R2 write tier — one stage under the session's in-force config; consumed by the R3 surface. */
export const useRunRefineryStage = createEntityMutation<inferInput<Trpc["refinery"]["runStage"]>, inferOutput<Trpc["refinery"]["runStage"]>>({
  options: (trpc) => trpc.refinery.runStage.mutationOptions(),
  // A run APPENDS to the ledger, flips the session back to `active` with a fresh `updatedAt` (both roster
  // columns), on score/analyze silently re-stamps the card's F6 signals, and a fresh rewrite changes the next
  // round's working overlay (the preflight arithmetic). The verb emits in a `finally`, so the tick survives a
  // stage that stamped and then threw — the same totality `onSettled` used to give this hook.
  busDriven: true,
  errorToast: codedRefusalAwareToast("That stage didn't finish — try again."),
});

/** The R2 write tier — one refinement round (refine-rewrite then analyze); consumed by the R3 surface. */
export const useIterateRefinery = createEntityMutation<inferInput<Trpc["refinery"]["iterate"]>, inferOutput<Trpc["refinery"]["iterate"]>>({
  options: (trpc) => trpc.refinery.iterate.mutationOptions(),
  // A round writes TWO runs plus `iterationCount` (and, through its analyze half, the F6 analysis stamp) —
  // the same read set as `runStage`. The MID-ROUND failure arm is preserved on the bus: the verb emits ONE
  // tick per round from a `finally`, so when the analyze half throws the already-landed rewrite still
  // repaints the ledger (one tick per round, never one per stage — that would be the storm).
  busDriven: true,
  errorToast: codedRefusalAwareToast("That refinement round didn't finish — try again."),
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

/** The accepted rewrite entries onto the LIVE card — the merge terminal act. */
export const useApplyRefineryFields = createEntityMutation<inferInput<Trpc["refinery"]["applyFields"]>, ApplyFieldsResult>({
  options: (trpc) => trpc.refinery.applyFields.mutationOptions(),
  // TWO events, both from the server, neither re-spelled here: `refineryChanged` for the completed session
  // (`status`/`updatedAt`, both roster columns) and `charactersChanged` from the injected `character.update`
  // for the card. The TOTAL-DROP arm writes nothing and emits nothing — correct: no row moved, and the
  // refusal below is the whole outcome.
  busDriven: true,
  refusal: applyRefusal,
  errorToast: codedRefusalAwareToast("Couldn't apply that rewrite."),
});

type ApplyAsCopyResult = inferOutput<Trpc["refinery"]["applyAsCopy"]>;

/** The zero-write branch-off (every accept dead on the belts ⇒ no copy minted) — the same errors-as-data
 *  refusal class as the apply arm. */
function copyRefusal(data: ApplyAsCopyResult): string | null {
  return data.character === null && data.dropped.length > 0 ? "No copy was made — every accepted rewrite was dropped." : null;
}

/** The BRANCH-OFF terminal act: the reviewed accepts land on a NEW character; the
 *  live card is untouched. The fresh character rides the user bus (`duplicate`/`update` both emit
 *  `charactersChanged`), so only the refinery half is named here. */
export const useApplyRefineryAsCopy = createEntityMutation<inferInput<Trpc["refinery"]["applyAsCopy"]>, ApplyAsCopyResult>({
  options: (trpc) => trpc.refinery.applyAsCopy.mutationOptions(),
  busDriven: true,
  refusal: copyRefusal,
  errorToast: codedRefusalAwareToast("Couldn't save the copy."),
});

/** The hand-authored rewrite arm (og-feedback gap 1): the WIP edit lands as a `{kind:"manual"}` rewrite
 *  run — the ledger, the session status and the next-round preflight all move. */
export const useSubmitManualRewrite = createEntityMutation<
  inferInput<Trpc["refinery"]["submitManualRewrite"]>,
  inferOutput<Trpc["refinery"]["submitManualRewrite"]>
>({
  options: (trpc) => trpc.refinery.submitManualRewrite.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save the hand edit — check it stays inside the session's scope.",
});
