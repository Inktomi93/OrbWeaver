// The ACME issuer over acme-client's low-level API (D269): account, an order for one RFC 8738 `ip` identifier under the
// `shortlived` profile, the HTTP-01 challenge, a CSR whose SAN is an iPAddress, finalize and download.
// acme-client's `auto()` is never used: it types every identifier as dns and cannot carry a profile.

import type { Authorization, Client as ClientType } from "acme-client";
import { crypto as acmeCrypto, Client, directory } from "acme-client";
import { checkIpCertificate } from "./certificate.ts";
import type { AcmeIssuer, AcmeIssuerDeps, IssueFailureCode, IssueOutcome, IssueRequest } from "./contract.ts";

/** The ACME profile Let's Encrypt issues an IP address certificate under, about 160 hours long. */
export const SHORTLIVED_PROFILE = "shortlived";
/** The order's identifier type for an IP address (RFC 8738). */
export const IP_IDENTIFIER_TYPE = "ip";
/** Let's Encrypt's production directory, the one a live certificate comes from. */
export const LETS_ENCRYPT_DIRECTORY = directory.letsencrypt.production;

/** How long the issuer polls a pending challenge or order: acme-client's own defaults, up to about four minutes. */
export const ACME_POLLING = { attempts: 10, minMs: 5000, maxMs: 30_000 } as const;

const HTTP_01 = "http-01";
// RFC 8555 section 8.3: a token is base64url. Anything else is refused before it becomes a served path.
const TOKEN_RE = /^[A-Za-z0-9_-]+$/u;

// acme-client's newOrder request plus the draft-ietf-acme-profiles field, which the library passes through unread.
type ProfiledOrderRequest = Parameters<ClientType["createOrder"]>[0] & { readonly profile: string };

type Step = <T>(code: IssueFailureCode, run: () => Promise<T>) => Promise<T>;

// A thrown step becomes the outcome's code and detail; `IssueAbort` carries it up past the remaining steps.
class IssueAbort extends Error {
  readonly code: IssueFailureCode;
  constructor(code: IssueFailureCode, detail: string) {
    super(detail);
    this.code = code;
  }
}

const step: Step = async (code, run) => {
  try {
    return await run();
  } catch (err) {
    throw err instanceof IssueAbort ? err : new IssueAbort(code, err instanceof Error ? err.message : String(err));
  }
};

type Challenge = Authorization["challenges"][number];

function httpChallenge(authorization: Authorization): Challenge {
  const challenge = authorization.challenges.find((candidate) => candidate.type === HTTP_01);
  if (challenge === undefined) {
    throw new IssueAbort("issuance_failed", "the certificate authority offered no http-01 challenge for this address");
  }
  if (!TOKEN_RE.test(challenge.token)) {
    throw new IssueAbort("issuance_failed", "the certificate authority sent a challenge token that is not base64url");
  }
  return challenge;
}

async function validate(client: ClientType, deps: AcmeIssuerDeps, request: IssueRequest, authorization: Authorization): Promise<void> {
  if (authorization.status === "valid") {
    return;
  }
  const challenge = httpChallenge(authorization);
  const keyAuthorization = await step("issuance_failed", () => client.getChallengeKeyAuthorization(challenge));
  const responder = await step("issuance_failed", () =>
    deps.openResponder({ port: request.challengePort, host: request.bindHost, token: challenge.token, keyAuthorization }),
  );
  try {
    await step("validation_failed", () => client.completeChallenge(challenge));
    await step("validation_failed", () => client.waitForValidStatus(challenge));
  } finally {
    await responder.close();
  }
}

async function order(deps: AcmeIssuerDeps, request: IssueRequest): Promise<IssueOutcome> {
  const client = new Client({
    directoryUrl: deps.directoryUrl,
    accountKey: request.accountKeyPem,
    backoffAttempts: deps.polling.attempts,
    backoffMin: deps.polling.minMs,
    backoffMax: deps.polling.maxMs,
  });
  await step("issuance_failed", () => client.createAccount({ termsOfServiceAgreed: true }));
  const orderRequest: ProfiledOrderRequest = { identifiers: [{ type: IP_IDENTIFIER_TYPE, value: request.address }], profile: SHORTLIVED_PROFILE };
  const placed = await step("issuance_failed", () => client.createOrder(orderRequest));
  const authorizations = await step("issuance_failed", () => client.getAuthorizations(placed));
  for (const authorization of authorizations) {
    await validate(client, deps, request, authorization);
  }
  const keyPem = (await acmeCrypto.createPrivateEcdsaKey()).toString("utf-8");
  const [, csr] = await step("issuance_failed", () => acmeCrypto.createCsr({ altNames: [request.address] }, keyPem));
  const finalized = await step("issuance_failed", () => client.finalizeOrder(placed, csr));
  const certificatePem = await step("issuance_failed", () => client.getCertificate(finalized));
  const check = checkIpCertificate(certificatePem, keyPem, request.address);
  if (!check.ok) {
    return { ok: false, code: "issuance_failed", detail: check.reason };
  }
  return { ok: true, certificate: { certificatePem, keyPem, notBefore: check.notBefore, notAfter: check.notAfter } };
}

/** The issuer over one ACME directory. Keys are ECDSA P-256; nothing here logs a key or a certificate. */
export function createAcmeIssuer(deps: AcmeIssuerDeps): AcmeIssuer {
  return {
    createAccountKey: async (): Promise<string> => (await acmeCrypto.createPrivateEcdsaKey()).toString("utf-8"),
    issue: async (request): Promise<IssueOutcome> => {
      // @orb-waive caught-failure-ownership(err): propagated as the returned failed outcome, whose code and detail the certificate controller turns into the status and log line. Ends if `issue` starts throwing to its caller.
      try {
        return await order(deps, request);
      } catch (err) {
        if (err instanceof IssueAbort) {
          return { ok: false, code: err.code, detail: err.message };
        }
        return { ok: false, code: "issuance_failed", detail: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
