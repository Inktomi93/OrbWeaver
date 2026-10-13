// domain/share — FRONT DOOR. The owner's share surface, and the relay and IP certificate controllers the composition
// root builds once.

export { createCertificateController } from "./certificate/controller.ts";
export type { EnableIpCertificateParams, ShareParams } from "./contract/params.ts";
export type { EnableShareSeatingDeps } from "./contract/seating.ts";
export type {
  CertificateBootOutcome,
  CertificateCheckResult,
  CertificateController,
  CertificateControllerDeps,
  CertificateFacts,
  IpCertificateRefusalNotice,
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
/** @public exported for the client CTs that stub the share verbs: the refusal code and sentence come from here. */
export { certificateRefusal } from "./substrate/certificate-refusal.ts";
/** @public exported for the client CTs that stub the share verbs: the refusal code and sentence come from here. */
export { modeShareRefusal } from "./substrate/refusal.ts";
export { createEnableShareSeating } from "./verbs/enable-share-seating.ts";
