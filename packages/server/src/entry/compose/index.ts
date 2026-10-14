// Front door for the composition root; app/boot/lifecycle import compose factories from here, never an
// internal file. `services.ts` is the keystone graph; the sibling files are the seams it composes.

export {
  activePersonaIdFor,
  buildChatToolOps,
  createGeneratePictureOp,
  createRunChatTurnBridge,
  createTaskWindowReaders,
  createTurnPersonaResolver,
  voicePersonaFor,
} from "./chat.ts";
export type { EffectiveConfigWiring } from "./effective-config.ts";
export { createEffectiveConfigWiring } from "./effective-config.ts";
export type { DomainEventBus } from "./event-bus.ts";
export { createDomainEventBus } from "./event-bus.ts";
export { createHttpApp } from "./http-app.ts";
export { createConfiguredOidc } from "./oidc.ts";
export { createDeleteReachCapture, createRoomEntityFan } from "./room-reach.ts";
export { createRpgRestorePost } from "./rpg.ts";
export type { ServicesDeps, ServicesResult, ShareComposeDeps } from "./services.ts";
export { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "./services.ts";
export { createUpstreamProbes } from "./update-check.ts";
