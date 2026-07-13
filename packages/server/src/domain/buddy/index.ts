// domain/buddy — FRONT DOOR: the only legal external import. Re-exports the service contract, view/result
// shapes, the agent-turn seam (also reused by chat), the injected observer env/bus shapes, and the
// supervised startBuddyObserver loop the composition root starts out-of-band. The taxonomy (CompanionBones,
// Mood, Rarity, …) is NOT re-exported here — it lives in @orb/contracts/buddy, the one cross-boundary home.

export { createBuddyBus } from "./bus";
export type { BuddyContext } from "./context";
export type { BuddyAgentEnv, BuddyWorkloadKind } from "./contract/agent-env";
export type {
  AgentTurnOp,
  BuddyAgentRequest,
  BuddyAgentResult,
  BuddyToolResult,
  BuddyToolServer,
  BuddyToolSpec,
  BuildToolServerOp,
} from "./contract/agent-turn";
export type {
  BuddyBus,
  BuddyBusEvent,
  BuddyObserverEnv,
  BuddyObserverHandle,
  BuddyObserverReads,
  LiteChatEvent,
  LiteTrace,
  LiteWorkloadEvent,
} from "./contract/observer-env";
export type { BuddyProposal, BuddyTurnView } from "./contract/results";
export type { BuddyService, BuddyServiceDeps } from "./contract/service";
export type { BuddyView } from "./contract/views";
export { startBuddyObserver } from "./observer/start";
export { createBuddyService } from "./service";
