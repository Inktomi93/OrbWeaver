// domain/share — FRONT DOOR. The owner's share surface and the relay controller the composition root builds once.

export type { ShareParams } from "./contract/params.ts";
export type {
  RelayController,
  RelayControllerDeps,
  ShareBootOutcome,
  ShareContext,
  ShareFacts,
  ShareService,
  ShareServiceDeps,
} from "./contract/service.ts";
export { createRelayController } from "./relay/controller.ts";
export { createShareService } from "./service.ts";
