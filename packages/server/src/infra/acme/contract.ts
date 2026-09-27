// The ACME adapter's contract (D269): the issuer the share domain's certificate controller drives, the HTTP-01
// responder it opens per challenge, and the store that keeps the keys and the certificate as owner-only files.

import type { IpCertificateFailureCode } from "@orb/contracts/identity";

/** A certificate chain and its private key, as PEM, with the validity the renewal schedule reads (epoch ms). */
export interface IssuedCertificate {
  /** The leaf first, then the chain the certificate authority sent. */
  readonly certificatePem: string;
  readonly keyPem: string;
  readonly notBefore: number;
  readonly notAfter: number;
}

/** One order for one public IP address. The HTTP-01 responder listens on `challengePort` only while the challenge is
 *  pending; `bindHost` is the app listener's own interface, undefined for every interface. */
export interface IssueRequest {
  readonly address: string;
  readonly challengePort: number;
  readonly bindHost: string | undefined;
  readonly accountKeyPem: string;
}

/** Which issuance failures an order can end in; the listener and expiry failures belong to the controller. */
export type IssueFailureCode = Extract<IpCertificateFailureCode, "validation_failed" | "issuance_failed">;

/** An order's end: the verified certificate, or a coded failure whose detail is the certificate authority's sentence. */
export type IssueOutcome =
  | { readonly ok: true; readonly certificate: IssuedCertificate }
  | { readonly ok: false; readonly code: IssueFailureCode; readonly detail: string };

/** A certificate's verdict: its leaf's validity (epoch ms) when it is usable, else the reason it is not. */
export type CertificateCheck = { readonly ok: true; readonly notBefore: number; readonly notAfter: number } | { readonly ok: false; readonly reason: string };

/** The issuer. `issue` never throws: every failure, the network's included, is an outcome. */
export interface AcmeIssuer {
  readonly createAccountKey: () => Promise<string>;
  readonly issue: (request: IssueRequest) => Promise<IssueOutcome>;
}

/** Where the HTTP-01 responder listens and the one token and answer it serves. */
export interface ChallengeResponse {
  readonly port: number;
  readonly host: string | undefined;
  readonly token: string;
  readonly keyAuthorization: string;
}

/** A listening responder; `close` stops it and never throws. */
export interface OpenChallenge {
  readonly close: () => Promise<void>;
}

/** Opens a responder that answers only `GET /.well-known/acme-challenge/<token>` with the key authorization. */
export type OpenChallengeResponder = (response: ChallengeResponse) => Promise<OpenChallenge>;

/** The issuer's seams: the ACME directory, the responder, and the waits between status polls. */
export interface AcmeIssuerDeps {
  readonly directoryUrl: string;
  readonly openResponder: OpenChallengeResponder;
  /** How many times, and how far apart in ms, the issuer polls an order or a challenge that is still pending. */
  readonly polling: { readonly attempts: number; readonly minMs: number; readonly maxMs: number };
}

/** The certificate files under the secrets directory, each read back only when it is usable. */
export interface CertificateStore {
  readonly loadAccountKey: () => Promise<string | null>;
  readonly saveAccountKey: (pem: string) => Promise<void>;
  /** The stored certificate when it names `address` and matches its stored key, else null. */
  readonly loadCertificate: (address: string) => Promise<IssuedCertificate | null>;
  readonly saveCertificate: (certificate: IssuedCertificate) => Promise<void>;
  /** Deletes the certificate and its key; the account key stays for the next order. */
  readonly removeCertificate: () => Promise<void>;
}
