// domain/buddy — DI BUNDLE. The explicit `BuddyContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). This conventional 8-slot context slot re-exports that type so the feature
// root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry
// composition root (db + the determinism seam + the injected connection/agent-turn/tool-server/roleClients
// ops + the workloads-backed agentEnv) and handed to `createBuddyService` — buddy sideways-imports none of
// those (`domain-no-cross-feature`; every cross-feature/infra edge is a type-only op on the contract).

export type { BuddyContext } from "./contract/service";
