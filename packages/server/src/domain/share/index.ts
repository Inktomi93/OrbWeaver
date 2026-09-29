// domain/share — FRONT DOOR. The owner's share surface, and the relay and IP certificate controllers the composition
// root builds once.

export { createCertificateController } from "./certificate/controller.ts";
export type { EnableIpCertificateParams, ShareParams } from "./contract/params.ts";
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
