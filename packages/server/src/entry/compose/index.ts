// Front door for the composition root; app/boot/lifecycle import compose factories from here, never an
// internal file. `services.ts` is the keystone graph; the sibling files are the seams it composes.

export { activePersonaIdFor, createRunChatTurnBridge, extractTrailingSystemRows, flattenAgentHistory, splitAgentHistory } from "./chat";
export type { DemoChatGameDoorArgs, DemoChatGameDoorDeps } from "./demo-chat-game";
export { createDemoChatGameDoor } from "./demo-chat-game";
export type { EffectiveConfigWiring } from "./effective-config";
export { createEffectiveConfigWiring } from "./effective-config";
export { createCharacterUpdatedChatFan } from "./emit-character-updated";
export { createChatChangedEmitter } from "./emit-chat-changed";
export type { DomainEventBus } from "./event-bus";
export { createDomainEventBus } from "./event-bus";
export type { MaterializeBackgroundDeps } from "./materialize-background";
export { createMaterializeBackground } from "./materialize-background";
export type { ImageRefAssets } from "./resolve-image-ref";
export { resolveImageRefToUrl } from "./resolve-image-ref";
export type { RoleClientsBinderDeps } from "./role-clients";
export { bindRoleClientsForUser } from "./role-clients";
export type { ServicesDeps, ServicesResult } from "./services";
export { createServices } from "./services";
