// E2E (FORWARD-HEADER mode) — the auth-harness smoke for the SSO trusted-proxy path: a signed JWT (minted
// in-test with jose, NO external IdP — the jwks.test.ts precedent) attached as the trusted-proxy header
// resolves a real principal, and role derivation + gating BITE at the wire. Deterministic (model-free), NOT
// `@live`.
//
// The forward-header stack boots with FORWARD_AUTH_VERIFY_JWT=true + a non-empty JWKS allowlist; the actor
// signs a JWT and rides its public JWKS as a request literal (the server verifies against it). The OWNER is
// the handle in OWNER_HANDLES — unset here ⇒ [DEFAULT_USER_HANDLE] = "owner"; any other handle → role=user.

import { expect, test } from "@playwright/test";
import { actorViaHeader } from "./support/actors";

test("a signed-JWT identity with a non-owner handle resolves as role=user", async ({ baseURL }) => {
  const alice = await actorViaHeader(baseURL ?? "", { handle: "alice", sub: "sub-alice" });
  const who = await alice.whoami();
  expect(who.authenticated).toBe(true);
  expect(who.handle).toBe("alice");
  expect(who.role).toBe("user");
});

test("the OWNER handle (DEFAULT_USER_HANDLE) resolves as role=owner via a signed JWT", async ({ baseURL }) => {
  const owner = await actorViaHeader(baseURL ?? "", { handle: "owner", sub: "sub-owner" });
  const who = await owner.whoami();
  expect(who.authenticated).toBe(true);
  expect(who.role).toBe("owner");
});

test("a non-owner JWT identity is REFUSED an owner-only proc (admin.listUsers → 403)", async ({ baseURL }) => {
  const alice = await actorViaHeader(baseURL ?? "", { handle: "alice", sub: "sub-alice" });
  const refused = await alice.expectError("admin.listUsers", {}, "query");
  expect(refused.status).toBe(403);
});

test("the signed JWT is AUTHORITATIVE over the ambient local-origin owner fallback", async ({ baseURL }) => {
  // On a localhost origin, an un-credentialed request would resolve as the owner via the fallback seam (a dev
  // affordance). A request carrying a valid signed JWT for `alice` must resolve as ALICE — the seam prefers
  // the verified identity, so the forwarded principal wins over the fallback owner. This is the proof the
  // signed path is the resolver, not merely ignored under the fallback.
  const alice = await actorViaHeader(baseURL ?? "", { handle: "alice", sub: "sub-alice" });
  const who = await alice.whoami();
  expect(who.handle).toBe("alice");
  expect(who.role).not.toBe("owner");
});
