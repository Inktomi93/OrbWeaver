// domain/buddy/contract/service — typed API surface: BuddyService (verb interface), BuddyContext (DI
// bundle), BuddyServiceDeps (entry-root input), and the injected cross-feature op types (buddy
// sideways-imports no sibling runtime; every edge is a type-only op wired at the composition root).
//
// resolveAgentConnection returns the already owner-gated (D17) ResolvedConnection — buddy never
// re-resolves the credential (derive-don't-double) or carries the model literal/routing logic itself.

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
import type { AskBuddyResult, BuddyTurnView, ClearBuddyChatResult, ConfirmBuddyResult } from "./results";
import type { BuddyView } from "./views";

type ResolveAgentConnectionOp = (params: { readonly principal: Principal }) => Promise<ResolvedConnection>;

/** DI bundle the buddy verbs close over. */
export interface BuddyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newTurnId: () => BuddyTurnId;
  /** Mints the ephemeral (non-persisted, 5-min-TTL) proposal id matched at confirm. */
  readonly newProposalId: () => string;
  readonly resolveAgentConnection: ResolveAgentConnectionOp;
  readonly agentTurn: AgentTurnOp;
  readonly buildToolServer: BuildToolServerOp;
  readonly roleClients: RoleClients;
  readonly agentEnv: BuddyAgentEnv;
}

export type BuddyServiceDeps = BuddyContext;

/** Caller-scoped buddy operations — each user has exactly one buddy (PK = userId). */
export interface BuddyService {
  /** unhatched preview (deterministic bones) if not hatched, else the stored view. */
  readonly get: (params: GetBuddyParams) => Promise<BuddyView>;
  /** Idempotent (PK-race → reload the winner). */
  readonly hatch: (params: HatchBuddyParams) => Promise<BuddyView>;
  /** Tool-using agent turn; the reply may carry a proposal to confirm. */
  readonly ask: (params: AskBuddyParams) => Promise<AskBuddyResult>;
  /** The only path that executes a buddy action. */
  readonly confirm: (params: ConfirmBuddyParams) => Promise<ConfirmBuddyResult>;
  readonly history: (params: BuddyHistoryParams) => Promise<BuddyTurnView[]>;
  readonly clearChat: (params: ClearBuddyChatParams) => Promise<ClearBuddyChatResult>;
  readonly setReactions: (params: SetReactionsParams) => Promise<BuddyView>;
  readonly setAgency: (params: SetAgencyParams) => Promise<BuddyView>;
  /** Internal cross-domain op (owner-keyed, no principal) chat uses to voice a seated buddy. null = unhatched. */
  readonly resolveSpeakerIdentity: (ownerUserId: UserId) => Promise<AgentSpeakerIdentity | null>;
}
