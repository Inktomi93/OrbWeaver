// WHAT THE READOUT IS ENTITLED TO SAY WHEN `preset.resolveEffective` FAILS — the failure band's words,
// derived from the error the server actually sent rather than asserted over every failure alike.
//
// THIS IS THE SECOND WRONG-CONFIDENT-CAUSE ON THAT PANEL, and the two findings pull opposite ways, so the
// fork is stated here rather than silently resolved. The F-02 ruling (2026-08-07, recorded in
// `readout-parts.tsx`'s own header) deleted a "Connect a chat model in Connections…" line because it named a
// MISSING CONNECTION as the cause of what was really a routing fault, and replaced it with an unconditional
// "This is a routing problem, not a missing connection". The 2026-08-08 finding is that the replacement is
// the same defect pointed the other way: it is printed over a RAW TRANSPORT STRING, so a preset that was
// deleted in another tab, a 500, or a dropped socket all get told they have a routing problem.
//
// Both rulings survive here because the verb's failure surface is DISCRIMINATED, not guessed
// (`domain/preset/verbs/resolve-effective.ts`): it throws `PresetNotFoundError` for an unreadable preset row,
// and otherwise fails inside the injected chat-capability op — whose routing refusal is a
// `DomainOperationError`, mapped to `BAD_REQUEST` by `transport/trpc/error-mapping.ts` (the F-02 receipt was
// literally a `400 incoherent routing (agent-sdk × local-light)`). So:
//
//   NOT_FOUND    → the PRESET is gone. Naming a routing problem here is simply false.
//   BAD_REQUEST  → the capability resolution refused. The F-02 verdict is EARNED and is kept VERBATIM.
//   anything else → a 500, a timeout, a dropped socket. We know the read failed and nothing more, so the
//                   band states no cause at all and offers the place to look plus a Retry.
//
// The code is read off `error.data.code`, the structured field, never message text (the `invite-dialog` /
// `rpg-error-state` discrimination precedent).

import { MODEL_ROLES_PATH_TEXT } from "#lib";

/** A THROWN read, as a failure band's prop takes it: the message it may quote plus the structured code it
 *  discriminates on. Deliberately structural rather than `Error` — `useQuery().error` is a
 *  `TRPCClientErrorLike`, which is an interface with no `name`, so it is NOT assignable to `Error` (measured:
 *  `tsc` TS2322) even though the runtime value is one. And deliberately not `unknown`: a band whose FAILED
 *  arm is selected by `error !== null` must not accept the `undefined` an unlanded read hands up, or a read
 *  that never failed renders a permanent failure (graduation verifier, 2026-08-08).
 *
 *  The reader functions below still take `unknown` — they are the defensive boundary, and a `catch` value
 *  genuinely is unknown. This type is what a COMPONENT PROP should be. */
export interface ReadFailure {
  readonly message: string;
  /** `| undefined` is LOAD-BEARING under `exactOptionalPropertyTypes` (this repo's setting): tRPC types this
   *  as `Maybe<Shape>` = `Shape | null | undefined`, and an optional marker alone forbids an EXPLICIT
   *  `undefined`, so the real client error would not assign (measured: `tsc` TS2322). */
  readonly data?: { readonly code?: string | undefined } | null | undefined;
}

/** The three causes the failure band can distinguish — `unknown` is the honest arm, not a fallback hole.
 *  Homed as a tuple so the union DERIVES rather than re-spells it (§5.5; `no-inline-union-redecl`). */
const RESOLVE_FAILURE_CAUSES = ["not-found", "routing", "unknown"] as const;

type ResolveFailureCause = (typeof RESOLVE_FAILURE_CAUSES)[number];

export interface ResolveFailureCopy {
  /** What failed and what it costs the reader — the band's first line. */
  readonly headline: string;
  /** What to do about it — the band's last line. Only the `routing` arm names a CAUSE. */
  readonly guidance: string;
}

/** A total Record over the cause union (§5.5 dispatch discipline): a fourth cause is a `tsc` error here,
 *  never a silently-missing arm. */
const RESOLVE_FAILURE_COPY: Record<ResolveFailureCause, ResolveFailureCopy> = {
  "not-found": {
    headline: "This preset couldn't be read, so what the next turn will send can't be shown.",
    guidance: "It may have been deleted or renamed in another tab — reopen it from Configuration → Presets.",
  },
  routing: {
    headline: "Your chat model couldn't be resolved, so what the next turn will send can't be shown.",
    guidance: `This is a routing problem, not a missing connection — fix it under ${MODEL_ROLES_PATH_TEXT}.`,
  },
  unknown: {
    // Deliberately names the READ, not a cause: on a 500 or a dropped socket we do not know which half of
    // `(preset × chat model)` failed, and the panel has been wrong about that twice already.
    headline: "The generation profile couldn't be resolved, so what the next turn will send can't be shown.",
    guidance: `Check your model roles under ${MODEL_ROLES_PATH_TEXT}, then retry.`,
  },
};

/** tRPC surfaces the mapped domain code on `error.data.code`; a transport-level failure carries no `data`.
 *
 *  EXPORTED so the SECOND surface that fails on a broken chat resolve — `CapabilityGate`, which stands the
 *  Params deck's model-fed clusters down when `connection.resolveChatCapability` throws — discriminates the
 *  cause the SAME way rather than hardcoding a routing verdict over every failure alike (the exact defect
 *  this module was minted to kill on the readout: a routing claim printed over a non-routing failure). The
 *  gate keeps its own deck-context COPY (its failure is about the knobs, not the assembled turn), so it reads
 *  the CAUSE here and not `resolveFailureCopy`, whose words name the preset/turn. */
export function failureCause(error: unknown): ResolveFailureCause {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return "unknown";
  }
  const code = (error as { data?: { code?: string } }).data?.code;
  if (code === "NOT_FOUND") {
    return "not-found";
  }
  return code === "BAD_REQUEST" ? "routing" : "unknown";
}

/** The failure band's words for a thrown `preset.resolveEffective` error. */
export function resolveFailureCopy(error: unknown): ResolveFailureCopy {
  return RESOLVE_FAILURE_COPY[failureCause(error)];
}

/** The server's own message, quoted verbatim under the headline — the F-02 pin (a swallowed server error
 *  dressed up as an empty state is what started all of this). `null` when the thrown value carries no
 *  message worth printing, so the band renders two lines instead of an empty one. */
export function resolveFailureMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}
