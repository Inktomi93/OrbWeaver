// domain/buddy/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds:
//   • BuddyService        the 8-verb authoritative interface (the front door re-exports the type)
//   • BuddyContext        the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • BuddyServiceDeps    what the entry root supplies (identical to the context — no transform)
//   • the injected cross-feature op TYPES (buddy sideways-imports NO sibling runtime; every edge is a
//     type-only op wired at the entry composition root — `domain-no-cross-feature`).
//
// THE INJECTION MODEL:
//   - `resolveAgentConnection`  connection.resolveRole('agent') → the buddy's brain + the resolved
//                               credential + the capability descriptor. NOT separate credential ops:
//                               the connection contract's `ResolvedConnection` ALREADY carries
//                               `.credential` (resolved inside `resolveRole`, where the D17 owner gate
//                               lives) — re-resolving the credential here would DOUBLE the resolve
//                               (against derive-don't-double, §7.4); buddy reads
//                               `conn.credential`/`conn.model`/`conn.capability`. The
//                               entry binder fixes `role:'agent'` + the buddy's per-agent override, so
//                               buddy carries NEITHER the model literal NOR the routing logic
//                               (the neo-tavern `resolveBuddyRouting` router is deleted).
//   - `agentTurn` / `buildToolServer`  the sealed `infra/providers` agent-mode runner + tool-server
//                               factory (the firewall lives in the sealed runner; buddy never imports it).
//   - `roleClients`             the bound inference clients (`summarize` → soul-gen at hatch).
//   - `agentEnv`                the cross-feature HANDS (`startWorkload`) for the confirm→workload arm.
// `now`/`newTurnId`/`newProposalId` are the injected determinism seam (no ambient clock/id — testing §3).

import type { AgentSpeakerIdentity } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { BuddyTurnId, UserId } from "@orb/kit/ids";
import type { BuddyAgentEnv } from "./agent-env";
import type { AgentTurnOp, BuildToolServerOp } from "./agent-turn";
import type {
  AskBuddyParams,
  BuddyHistoryParams,
  ClearBuddyChatParams,
  ConfirmBuddyParams,
  GetBuddyParams,
  HatchBuddyParams,
  SetAgencyParams,
  SetReactionsParams,
} from "./params";
import type {
  AskBuddyResult,
  BuddyTurnView,
  ClearBuddyChatResult,
  ConfirmBuddyResult,
} from "./results";
import type { BuddyView } from "./views";

/** Resolve the buddy's agent connection (`connection.resolveRole('agent')` with `role` + the per-agent
 *  override fixed by the entry binder). Returns the resolved `{ api, model, credential, capability }` —
 *  the credential is already owner-gated (D17) inside resolution. */
export type ResolveAgentConnectionOp = (params: {
  readonly principal: Principal;
}) => Promise<ResolvedConnection>;

/**
 * The DI bundle the buddy verbs close over (wired at the entry composition root; surfaced through
 * `context.ts` as an explicit interface, never `ReturnType<>` — `no-context-returntype`). `db` routes
 * all queries through `persistence/`; the cross-feature ops are injected (buddy imports no sibling
 * runtime); `now`/`newTurnId`/`newProposalId` are the determinism seam.
 */
export interface BuddyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newTurnId: () => BuddyTurnId;
  /** Mints the ephemeral (non-persisted, 5-min-TTL) proposal id matched at `confirm`. */
  readonly newProposalId: () => string;
  readonly resolveAgentConnection: ResolveAgentConnectionOp;
  readonly agentTurn: AgentTurnOp;
  readonly buildToolServer: BuildToolServerOp;
  readonly roleClients: RoleClients;
  readonly agentEnv: BuddyAgentEnv;
}

/** What `createBuddyService` receives from the entry root. Identical to {@link BuddyContext} — no
 *  deps→context transform — kept for front-door surface symmetry with the other domains. */
export type BuddyServiceDeps = BuddyContext;

/**
 * Caller-scoped buddy operations — each user has exactly one buddy (PK = userId). Bones are rolled
 * deterministically from the user id; the soul is model-authored at hatch. `ask` is the tool-using
 * agent turn (may surface a proposal); `confirm` is the SOLE executor of a proposed action (the
 * propose/confirm gate). The reaction engine is started out-of-band (FLAG[PD-64]), not a verb.
 */
export interface BuddyService {
  /** The caller's buddy — `unhatched` preview (deterministic bones) if not hatched, else the stored view. */
  readonly get: (params: GetBuddyParams) => Promise<BuddyView>;
  /** Hatch: snapshot the rolled bones + a model-authored soul. Idempotent (PK-race → reload the winner). */
  readonly hatch: (params: HatchBuddyParams) => Promise<BuddyView>;
  /** Talk to the buddy — a tool-using agent turn; the reply may carry a `proposal` to confirm. */
  readonly ask: (params: AskBuddyParams) => Promise<AskBuddyResult>;
  /** Confirm or cancel a pending proposal. The ONLY path that executes a buddy action. */
  readonly confirm: (params: ConfirmBuddyParams) => Promise<ConfirmBuddyResult>;
  /** The caller's persisted transcript, oldest-first (for hydration on load). */
  readonly history: (params: BuddyHistoryParams) => Promise<BuddyTurnView[]>;
  readonly clearChat: (params: ClearBuddyChatParams) => Promise<ClearBuddyChatResult>;
  /** The observer toggle. */
  readonly setReactions: (params: SetReactionsParams) => Promise<BuddyView>;
  /** The capability-ceiling kill switch for the "hands". */
  readonly setAgency: (params: SetAgencyParams) => Promise<BuddyView>;
  /** Resolve the owner's buddy SOUL as an agent-speaker identity (D60, doc 04 §5) — the RESOLVE-phase product
   *  chat voices a seated buddy with (`displayName`←soul name, `systemPrompt`←`buildBuddySystemPrompt`). An
   *  INTERNAL cross-domain op (owner-keyed, NO principal — not tRPC-routed): the chat compose dispatch resolves
   *  agent→owner and calls this via the `AGENT_SPEAKER_SOURCES` registry. `null` = no buddy hatched. */
  readonly resolveSpeakerIdentity: (ownerUserId: UserId) => Promise<AgentSpeakerIdentity | null>;
}
