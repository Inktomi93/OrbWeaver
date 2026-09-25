// infra/auth/oidc-exchange — the injected OIDC code→token exchange (#867).
//
// WHAT THIS FILE OWNS, and why it is not ceremony over four lines. The adapter is where the OIDC code
// flow's three replay/injection defences are MAPPED onto the grant: the PKCE verifier, the expected nonce,
// and the expected state, all read off the single-use transaction the callback just consumed. Drop any one
// of them and the exchange still succeeds against a cooperating IdP while the defence it carried is gone —
// a defect no route-level test can see, because the route hands the transaction across the seam whole. So
// the checks mapping is asserted field by field here, plus the two other clauses in the adapter's header:
// it NARROWS (only the verified claims and the raw ID token cross), and it NEVER SWALLOWS (a rejecting
// grant must reject, never resolve — a swallowed failure would mint a session on an exchange that failed).
//
// WHY THE GRANT IS INJECTED RATHER THAN MOCKED: `openid-client` resolves only under
// `packages/server/node_modules`, so a `vi.mock("openid-client")` from `tests/` never binds, and the
// path-form mock that would is correctly RED under `test-mock-doctrine`. Same ruling, same shape as
// `createOidcConfigCache(discover)` (#762).
//
// NOT COVERED HERE, deliberately and by tier: the grant's own CRYPTOGRAPHY (JWKS signature, issuer and
// audience validation, the nonce/PKCE binding it performs with the values this file proves it was handed)
// is `openid-client`'s, exercised against the real IdP, and re-asserting it would only test a fake. The
// route's use of this seam — fail-closed on a throw, the sanitized error code, the #141 id_token hop into
// `sessions.create` — is pinned at `tests/server/entry/http/auth-routes.test.ts` and, over a real database,
// `tests/server/entry/oidc-logout-roundtrip.suite.int.test.ts`.

import type { OidcCodeGrant, OidcTransaction } from "@orb/server/infra/auth";
import { createOidcExchange } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** The consumed transaction. Each field is a distinct literal so a swapped mapping (nonce ↔ state) shows up
 *  as a wrong VALUE rather than an accidental pass. */
const TX: OidcTransaction = {
  state: "state-aaa",
  codeVerifier: "verifier-bbb",
  nonce: "nonce-ccc",
  redirectUri: "https://app.example/api/auth/oidc/callback",
  createdAt: 1_700_000_000_000,
  inviteTokenHash: null,
};

const CALLBACK_URL = new URL("https://app.example/api/auth/oidc/callback?code=auth-code&state=state-aaa");
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.e30.sig-not-verified-here";
// biome-ignore lint/style/useNamingConvention: OIDC/OAuth2 wire field names (`preferred_username`, `id_token`) are snake_case by spec — the crafted claims + token-response objects must match that shape.
const CLAIMS = { sub: "sub-alice", preferred_username: "alice" };

/** The `Configuration` the route resolved from discovery. Nothing in the adapter reads it — it is passed
 *  straight through to the grant — so identity is the whole assertion. */
// @orb-waive no-test-fabrication(unknown): openid-client's Configuration has no test constructor and the adapter only forwards it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const CONFIG = { marker: "discovered-config" } as unknown as Parameters<OidcCodeGrant>[0];

type Checks = Parameters<OidcCodeGrant>[2];
interface Captured {
  readonly config: unknown;
  readonly url: URL;
  readonly checks: Checks;
}

/** A grant that resolves with the given token response. `id_token` is optional so the "IdP returned no ID
 *  token" degrade can be driven. */
function fakeGrant(response: { readonly idToken?: string }, capture: (c: Captured) => void): OidcCodeGrant {
  // @orb-waive no-test-fabrication(unknown): openid-client's TokenEndpointResponse carries the RP's access/refresh tokens, which the Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // adapter must never read — supplying them would weaken, not strengthen, this test.
  // biome-ignore lint/style/useNamingConvention: OIDC/OAuth2 wire field names (`preferred_username`, `id_token`) are snake_case by spec — the crafted claims + token-response objects must match that shape.
  const tokens = { claims: (): typeof CLAIMS => CLAIMS, ...(response.idToken === undefined ? {} : { id_token: response.idToken }) } as unknown as Awaited<
    ReturnType<OidcCodeGrant>
  >;
  // @orb-waive no-test-fabrication(unknown): `authorizationCodeGrant` has ~7 overloads whose full shape this fake deliberately does Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // not implement — the adapter only ever calls the 3-argument form, and widening the fake to satisfy the
  // rest would test the fake, not the mapping.
  return ((config: unknown, url: URL, checks: Checks): Promise<typeof tokens> => {
    capture({ config, url, checks });
    return Promise.resolve(tokens);
  }) as unknown as OidcCodeGrant;
}

describe("createOidcExchange — the transaction's checks reach the grant", () => {
  // THE SECURITY ASSERTION OF THIS FILE. `pkceCodeVerifier` binds the code to this browser's authorize leg,
  // `expectedNonce` binds the ID token to it, `expectedState` binds the callback itself. A missing one is a
  // silently weaker flow, not a failure.
  test("the PKCE verifier, nonce and state are all presented, each from its own transaction field", async () => {
    let seen: Captured | null = null;
    const exchange = createOidcExchange(
      fakeGrant({ idToken: ID_TOKEN }, (c) => {
        seen = c;
      }),
    );

    await exchange(CONFIG, CALLBACK_URL, TX);

    const captured = seen as Captured | null;
    expect(captured).not.toBeNull();
    expect(captured?.checks?.pkceCodeVerifier).toBe(TX.codeVerifier);
    expect(captured?.checks?.expectedNonce).toBe(TX.nonce);
    expect(captured?.checks?.expectedState).toBe(TX.state);
  });

  test("the discovered config and the RECONSTRUCTED callback URL pass through untouched", async () => {
    let seen: Captured | null = null;
    const exchange = createOidcExchange(
      fakeGrant({ idToken: ID_TOKEN }, (c) => {
        seen = c;
      }),
    );

    await exchange(CONFIG, CALLBACK_URL, TX);

    const captured = seen as Captured | null;
    expect(captured?.config).toBe(CONFIG);
    // The route reconstructs this URL from the ALLOWLISTED stored redirect_uri; the adapter must not
    // rewrite it, or the redirect_uri presented to the IdP stops matching what the IdP issued the code for.
    expect(captured?.url.href).toBe(CALLBACK_URL.href);
  });
});

describe("createOidcExchange — the narrowing", () => {
  test("the verified claims and the RAW id_token are what cross the seam", async () => {
    const exchange = createOidcExchange(fakeGrant({ idToken: ID_TOKEN }, () => undefined));

    const tokens = await exchange(CONFIG, CALLBACK_URL, TX);

    expect(tokens.claims).toBe(CLAIMS);
    // #141 — byte-identical: `sessions.create` seals exactly this value, and a mangled one is a hint
    // authentik rejects at end-session.
    expect(tokens.idToken).toBe(ID_TOKEN);
    // Nothing else rides. The RP's access/refresh tokens are the adapter's business with the IdP and must
    // not reach a caller that only needs an identity assertion.
    expect(Object.keys(tokens).toSorted()).toEqual(["claims", "idToken"]);
  });

  test("an IdP that returned no id_token yields null, never undefined (the #141 degrade)", async () => {
    const exchange = createOidcExchange(fakeGrant({}, () => undefined));

    const tokens = await exchange(CONFIG, CALLBACK_URL, TX);

    // `sessions.create` branches on a null/empty token to store nothing rather than sealing "" — an
    // `undefined` here would ride into the params as an absent field and silently mean the same thing by
    // accident instead of by contract.
    expect(tokens.idToken).toBeNull();
  });
});

describe("createOidcExchange — a failing grant is NEVER swallowed", () => {
  // The route's `ok:true` arm feeds `sessions.create`. An adapter that caught and returned a resolved value
  // would mint a session for an exchange that never succeeded — the whole fail-closed posture, inverted.
  test("a rejecting grant rejects, and the error reaches the caller with its `error` code intact", async () => {
    const err = { error: "invalid_grant" };
    // @orb-waive no-test-fabrication(unknown): a deliberately failing grant — it never returns, so there is no token response to Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // build, and the overload shape is irrelevant to the rejection under test.
    const exchange = createOidcExchange((() => Promise.reject(err)) as unknown as OidcCodeGrant);

    // `.rejects` is the assertion: a resolved value of ANY shape here is the defect.
    await expect(exchange(CONFIG, CALLBACK_URL, TX)).rejects.toBe(err);
  });
});
