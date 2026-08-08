// domain/refinery/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// principal; ownership derives through the CHARACTER join off `principal.userId` (D23 — refinery tables
// stamp no owner; docs/design/refinery-r0.md §3.1), never a caller-supplied ownerId.

import type { Principal } from "@orb/contracts/identity";
import type { RefinableField, RefinerySelection, RefinerySessionStatus, RefineryStage, RefineryStageConfig } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";

interface RefineryActorParams {
  readonly principal: Principal;
}

export interface StartSessionParams extends RefineryActorParams {
  readonly characterId: CharacterId;
  /** Optional roster label (bounded by `refinerySessionNameSchema` at the verb); absent/null ⇒ unnamed. */
  readonly name?: string | null;
}

export interface GetSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

export type ListSessionsParams = RefineryActorParams;

export interface ListRunsParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

/** The session-config patch (the D62 Setup surface's write). Absent = leave unchanged; `null` on the two
 *  nullable text fields = clear. Each present member is re-parsed through its contracts schema AT THE VERB
 *  (the internal-boundary re-parse posture, security pass §3.A) — the tRPC wire parse does not cover a
 *  future internal caller. */
export interface UpdateSessionPatch {
  readonly name?: string | null | undefined;
  readonly guidance?: string | null | undefined;
  readonly selection?: RefinerySelection | undefined;
  readonly stageConfig?: RefineryStageConfig | undefined;
  readonly status?: RefinerySessionStatus | undefined;
}

export interface UpdateSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly patch: UpdateSessionPatch;
}

export interface DeleteSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

export interface RunStageParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly stage: RefineryStage;
}

export interface IterateParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  /** Loop guidance for THIS and later rounds — persisted onto the session (parsed via
   *  `refineryGuidanceSchema`); absent ⇒ the session's stored guidance stands. */
  readonly guidance?: string;
}

/** One user-accepted rewrite entry (the CompareBlocks accept set). `greetingIndex` present ⇔
 *  `field === "greetings"` — asserted at the verb against the LIVE card (§1 gap 3's verb-tier ruling). */
export interface AcceptedField {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
}

export interface ApplyFieldsParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  /** Explicit per-field accept — apply is NEVER automatic and never all-fields-by-default (belt 10). */
  readonly accepts: readonly AcceptedField[];
}
