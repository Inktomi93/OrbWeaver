// entry/compose — FRONT DOOR for the composition root. app/boot/lifecycle (+ tests) import the compose
// factories from `@orb/server/entry/compose`, never an internal file. `services.ts` is the keystone graph
// (`createServices` → the 15-key `Services` bundle + the boot handles); the sibling files are the seams it
// composes (the event bus, the two role-client binders, the workload runner-env hub, the effective-config
// boot surface). Nothing here owns business logic — this tier only assembles lower tiers (entry invariant #1).

export type { EffectiveConfigWiring } from "./effective-config";
export { createEffectiveConfigWiring } from "./effective-config";
export type { DomainEventBus } from "./event-bus";
export { createDomainEventBus } from "./event-bus";
export type {
  RoleClientsBinderDeps,
  VllmFloorBinderDeps,
} from "./role-clients";
export { bindRoleClientsForUser, createVllmFloorRoleClients } from "./role-clients";
export type { RunnerEnvDeps } from "./runner-env";
export { buildWorkloadRunnerEnv } from "./runner-env";
export type { ServicesDeps, ServicesResult } from "./services";
export { createServices } from "./services";
