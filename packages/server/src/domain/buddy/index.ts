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
// `@orb/contracts/buddy` (buddy.md invariant #7); db/client/this domain import it from there directly.
//
// DEFERRED (FLAG[PD-45, PD-64], NOT exported yet): the live reaction feed (`bus.ts`), `BuddyObserverEnv`,
// `createBuddyObserverReads`, `startBuddyObserver` — the observer reaction engine reacts to chat/workload
// event sources that do not exist before chat (D38: buddy builds first to expose the agent-turn seam);
// it lands as a follow-on with chat.

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
export type { BuddyProposal, BuddyTurnView } from "./contract/results";
export type { BuddyContext, BuddyService, BuddyServiceDeps } from "./contract/service";
export type { BuddyView } from "./contract/views";
export { createBuddyService } from "./service";
