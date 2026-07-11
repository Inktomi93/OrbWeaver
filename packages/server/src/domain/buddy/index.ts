// domain/buddy — FRONT DOOR: the only legal external import (domain-feature-front-door). Re-exports the
// public surface of the agent-mode buddy (v1, borrowed-owner posture):
//   • the service contract + its DI bundle/deps types (the tRPC Services bundle + client consume views)
//   • BuddyView (the read-model) + BuddyProposal/BuddyTurnView (the ask/history shapes)
//   • THE AGENT-TURN SEAM exposed for chat (D38 — buddy builds BEFORE chat to prove the injection): the
//     firewall request/result (`BuddyAgentRequest` has NO chatId) + the injected op types + the tool-spec
//     shapes. chat P5 reuses this pattern; the firewall lives in the sealed `infra/providers` runner.
//   • the cross-feature injected HANDS seam (`BuddyAgentEnv`/`BuddyWorkloadKind`), assembled at entry/.
//   • createBuddyService (the factory the entry root wires).
//
// The taxonomy (`CompanionBones`, `Mood`, `Rarity`, …) is NOT re-exported here — it lives in
// `@orb/contracts/buddy` (the ONE cross-boundary home); db/client/this domain import it from there directly.
//
// THE OBSERVER reaction engine (PD-45/PD-64 — SHIPPED with chat's event sources, D38): the per-user live
// reaction feed (`bus.ts` → `createBuddyBus`), the injected env + lite event/bus shapes
// (`BuddyObserverEnv`/`BuddyBusEvent`/`LiteWorkloadEvent`/`LiteChatEvent`/`LiteTrace`), and the supervised
// loop `startBuddyObserver` the composition root starts out-of-band (NOT a service verb). The tRPC
// `buddy.stream` subscription (transport) consumes the bus; the client feed is a separate follow-on.

export { createBuddyBus } from "./bus";
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
export type { BuddyContext, BuddyService, BuddyServiceDeps } from "./contract/service";
export type { BuddyView } from "./contract/views";
export { startBuddyObserver } from "./observer/start";
export { createBuddyService } from "./service";
