// domain/share — FRONT DOOR. The owner's share surface, and the relay and IP certificate controllers the composition
// root builds once.

export { createCertificateController } from "./certificate/controller.ts";
export type { ShareGraph, ShareGraphOptions } from "./contract/composition.ts";

export type {
  CertificateBootOutcome,
  CertificateController,
  RelayController,
  ShareBootOutcome,
  ShareService,
} from "./contract/service.ts";
export { createRelayController } from "./relay/controller.ts";
export { createShareService } from "./service.ts";

export { createEnableShareSeating } from "./verbs/enable-share-seating.ts";
