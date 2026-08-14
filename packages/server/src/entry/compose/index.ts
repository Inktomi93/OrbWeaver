// Front door for the composition root; app/boot/lifecycle import compose factories from here, never an
// internal file. `services.ts` is the keystone graph; the sibling files are the seams it composes.

export { activePersonaIdFor, createRunChatTurnBridge, extractTrailingSystemRows, flattenAgentHistory, splitAgentHistory } from "./chat.ts";
export type { DemoChatGameDoorArgs, DemoChatGameDoorDeps } from "./demo-chat-game.ts";
export { createDemoChatGameDoor } from "./demo-chat-game.ts";
export type { EffectiveConfigWiring } from "./effective-config.ts";
export { createEffectiveConfigWiring } from "./effective-config.ts";
export { createChatChangedEmitter } from "./emit-chat-changed.ts";
export type { DomainEventBus } from "./event-bus.ts";
export { createDomainEventBus } from "./event-bus.ts";
export type { MaterializeBackgroundDeps } from "./materialize-background.ts";
export { createMaterializeBackground } from "./materialize-background.ts";
export type { ImageRefAssets } from "./resolve-image-ref.ts";
export { resolveImageRefToUrl } from "./resolve-image-ref.ts";
export type { RoleClientsBinderDeps } from "./role-clients.ts";
export { bindRoleClientsForUser } from "./role-clients.ts";
export type { DeleteReachCapture } from "./room-reach.ts";
export { createDeleteReachCapture, createRoomEntityFan } from "./room-reach.ts";
export type { ServicesDeps, ServicesResult } from "./services.ts";
export { createServices } from "./services.ts";
