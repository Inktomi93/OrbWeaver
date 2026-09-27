// infra/acme/issuer — the real acme-client flow against a fake ACME authority on loopback (D269). The authority decodes
// every signed request, so the order's payload is read as the wire carried it, and its CSR is read by a DER reader
// written apart from the library, so the SAN's GeneralName tag is checked independently.

import type { AcmeIssuer } from "@orb/server/infra/acme";
import { createAcmeIssuer, IP_IDENTIFIER_TYPE, openChallengeResponder, SHORTLIVED_PROFILE } from "@orb/server/infra/acme";
import { afterEach, describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { FakeAcme } from "../../../support/node/fake-acme.ts";
import { startFakeAcme } from "../../../support/node/fake-acme.ts";
import { freeLoopbackPort } from "../../../support/node/free-port.ts";
import { GENERAL_NAME_DNS_TAG, GENERAL_NAME_IP_TAG, ipBytes, readCsr } from "../../../support/node/x509.ts";

const ADDRESS = "81.2.69.160";
const TOKEN = "tok_Abc123-xyz";
const HOUR_MS = 3_600_000;
const SHORTLIVED_MS = 160 * HOUR_MS;
const POLLING = { attempts: 5, minMs: 1, maxMs: 5 };

async function refusesConnection(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${String(port)}/.well-known/acme-challenge/${TOKEN}`);
    return false;
  } catch {
    return true;
  }
}

let authority: FakeAcme | null = null;
afterEach(async () => {
  await authority?.close();
  authority = null;
});

async function setUp(
  options: { readonly answerPort?: number } = {},
): Promise<{ readonly issuer: AcmeIssuer; readonly fake: FakeAcme; readonly challengePort: number }> {
  const clock = createFrozenClock();
  const challengePort = await freeLoopbackPort();
  const fake = await startFakeAcme({
    challengePort: options.answerPort ?? challengePort,
    token: TOKEN,
    notBefore: clock.now(),
    notAfter: clock.now() + SHORTLIVED_MS,
  });
  authority = fake;
  const issuer = createAcmeIssuer({ directoryUrl: fake.directoryUrl, openResponder: openChallengeResponder, polling: POLLING });
  return { issuer, fake, challengePort };
}

describe("createAcmeIssuer", () => {
  test("the order carries the shortlived profile and one RFC 8738 ip identifier", async () => {
    const { issuer, fake, challengePort } = await setUp();
    const outcome = await issuer.issue({ address: ADDRESS, challengePort, bindHost: "127.0.0.1", accountKeyPem: await issuer.createAccountKey() });
    expect(outcome.ok).toBe(true);
    const order = fake.requests.find((request) => request.path === "/new-order");
    expect(order?.payload).toEqual({ identifiers: [{ type: IP_IDENTIFIER_TYPE, value: ADDRESS }], profile: SHORTLIVED_PROFILE });
    expect(IP_IDENTIFIER_TYPE).toBe("ip");
    expect(SHORTLIVED_PROFILE).toBe("shortlived");
    const account = fake.requests.find((request) => request.path === "/new-account");
    expect(account?.payload).toEqual({ termsOfServiceAgreed: true });
  });

  test("the CSR's only SAN is an iPAddress GeneralName carrying the address's four bytes", async () => {
    const { issuer, fake, challengePort } = await setUp();
    await issuer.issue({ address: ADDRESS, challengePort, bindHost: "127.0.0.1", accountKeyPem: await issuer.createAccountKey() });
    const [csr] = fake.csrs;
    expect(csr).toBeDefined();
    const { sanNames } = readCsr(csr ?? Buffer.alloc(0));
    expect(sanNames).toEqual([{ tag: GENERAL_NAME_IP_TAG, bytes: ipBytes(ADDRESS) }]);
    expect(sanNames.some((name) => name.tag === GENERAL_NAME_DNS_TAG)).toBe(false);
  });

  test("the authority validates through the responder, and the verified certificate comes back with its validity", async () => {
    const clock = createFrozenClock();
    const { issuer, fake, challengePort } = await setUp();
    const outcome = await issuer.issue({ address: ADDRESS, challengePort, bindHost: "127.0.0.1", accountKeyPem: await issuer.createAccountKey() });
    expect(fake.fetches).toHaveLength(1);
    expect(fake.fetches[0]?.status).toBe(200);
    expect(fake.fetches[0]?.body.startsWith(`${TOKEN}.`)).toBe(true);
    if (!outcome.ok) {
      throw new Error(`issue failed: ${outcome.detail}`);
    }
    expect(outcome.certificate.notBefore).toBe(Math.floor(clock.now() / 1000) * 1000);
    expect(outcome.certificate.notAfter).toBe(Math.floor((clock.now() + SHORTLIVED_MS) / 1000) * 1000);
    expect(outcome.certificate.keyPem).toContain("PRIVATE KEY");
    // The responder listened only while the challenge was pending.
    expect(await refusesConnection(challengePort)).toBe(true);
  });

  test("a challenge the authority cannot reach ends as validation_failed, with its detail, and the responder closed", async () => {
    const unreachable = await freeLoopbackPort();
    const { issuer, challengePort } = await setUp({ answerPort: unreachable });
    const outcome = await issuer.issue({ address: ADDRESS, challengePort, bindHost: "127.0.0.1", accountKeyPem: await issuer.createAccountKey() });
    expect(outcome).toMatchObject({ ok: false, code: "validation_failed" });
    expect(outcome.ok ? "" : outcome.detail).toContain("could not connect");
    expect(await refusesConnection(challengePort)).toBe(true);
  });

  test("an order the authority refuses ends as issuance_failed with the authority's sentence, never a throw", async () => {
    const clock = createFrozenClock();
    const challengePort = await freeLoopbackPort();
    const fake = await startFakeAcme({
      challengePort,
      token: TOKEN,
      notBefore: clock.now(),
      notAfter: clock.now() + SHORTLIVED_MS,
      refuseOrder: { type: "urn:ietf:params:acme:error:rejectedIdentifier", detail: "the ip identifier is not allowed under this profile" },
    });
    authority = fake;
    const issuer = createAcmeIssuer({ directoryUrl: fake.directoryUrl, openResponder: openChallengeResponder, polling: POLLING });
    const outcome = await issuer.issue({ address: ADDRESS, challengePort, bindHost: "127.0.0.1", accountKeyPem: await issuer.createAccountKey() });
    expect(outcome).toMatchObject({ ok: false, code: "issuance_failed" });
    expect(outcome.ok ? "" : outcome.detail).toContain("the ip identifier is not allowed under this profile");
    expect(fake.fetches).toEqual([]);
  });
});
