// infra/acme — front door. The IP certificate's I/O (D269): the ACME issuer, its HTTP-01 responder and the certificate
// store. Sealed like every adapter: entry builds them and injects them into `domain/share`'s certificate controller.

export { checkIpCertificate } from "./certificate.ts";
export type {
  AcmeIssuer,
  AcmeIssuerDeps,
  CertificateCheck,
  CertificateStore,
  ChallengeResponse,
  IssuedCertificate,
  IssueFailureCode,
  IssueOutcome,
  IssueRequest,
  OpenChallenge,
  OpenChallengeResponder,
} from "./contract.ts";
export { openChallengeResponder } from "./http-01.ts";
export { ACME_POLLING, createAcmeIssuer, IP_IDENTIFIER_TYPE, LETS_ENCRYPT_DIRECTORY, SHORTLIVED_PROFILE } from "./issuer.ts";
export { createCertificateStore } from "./store.ts";
