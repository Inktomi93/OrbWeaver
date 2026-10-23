// @subject tests/support/node/corpus-oidc.ts
// @subject tests/support/node/factories/sessions.ts
import { oidcPendingSignups, oidcTransactions, users } from "@orb/db";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { seedOidcCorpus } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
import type { ServerHarnessOptions, UnclaimedServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

function oidcRoot(
  issuer: Awaited<ReturnType<typeof createNativeIssuer>>,
  settings: Partial<NonNullable<ServerHarnessOptions["oidc"]>>,
): Promise<UnclaimedServerTestHarness> {
  return createServerHarness({
    ownerId: null,
    authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" },
    oidc: { ...NATIVE_OIDC_SETTINGS, ...settings },
    networkExecution: {
      fetch: issuer.fetch,
      resolver: (hostname) =>
        hostname === new URL(ISSUER).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted corpus issuer address resolution")),
    },
  });
}

test.each([false, true])("native corpus captures real consumed OIDC rows and approval=%s without exporting security material", async (approval) => {
  const issuer = await createNativeIssuer();
  // biome-ignore lint/style/useNamingConvention: these are the canonical startup input names.
  await using root = await oidcRoot(issuer, { OIDC_SIGNUP: false, OIDC_REQUIRE_APPROVAL: approval });
  const capture = await seedOidcCorpus(root, issuer);
  expect(capture.transactions.length).toBe(2);
  expect(new Set(capture.transactions.map((row) => row.state)).size).toBe(2);
  expect(capture.transactions.every((row) => row.codeVerifier.length > 0 && row.nonce !== null && row.expiresAt > row.createdAt)).toBe(true);
  expect((await root.db.select({ state: oidcTransactions.state }).from(oidcTransactions)).length).toBe(0);
  expect((await root.db.select({ subject: oidcPendingSignups.subject }).from(oidcPendingSignups)).length).toBe(0);
  expect(capture.pending.subject === capture.joiner.externalId).toBe(true);
  expect(capture.pending.inviteTokenHash === capture.transactions[1]?.inviteTokenHash).toBe(true);
  expect(capture.joiner.enabled).toBe(!approval);
  expect(capture.wire.ownerMe).toMatchObject({ authenticated: true, role: "owner" });
  expect(capture.wire.confirmation.signedIn).toBe(!approval);
  expect(capture.wire.joinerMe.authenticated).toBe(!approval);
  expect(capture.wire.confirmation.chatId).toBe(capture.wire.pendingPreview.chatId);
  expect(capture.ownerSessions.length).toBe(1);
  expect(capture.joinerSessions.length).toBe(approval ? 0 : 1);
  const wire = JSON.stringify(capture.wire);
  const secrets = [
    ...issuer.idTokens,
    ...capture.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce]),
    capture.pending.secretHash,
    capture.pending.inviteTokenHash,
    capture.pending.idTokenCiphertext,
    ...capture.ownerSessions.map((row) => row.tokenHash),
    ...capture.joinerSessions.map((row) => row.tokenHash),
  ].filter((value) => value !== null);
  expect(secrets.some((secret) => wire.includes(secret))).toBe(false);
});

test("a native JIT login cannot certify a pending-row corpus it did not produce", async () => {
  const issuer = await createNativeIssuer();
  await using root = await oidcRoot(issuer, {});
  await expect(seedOidcCorpus(root, issuer)).rejects.toThrow("did not produce the required pending join");
  expect((await root.db.select({ subject: oidcPendingSignups.subject }).from(oidcPendingSignups)).length).toBe(0);
  expect((await root.db.select({ id: users.id }).from(users)).length).toBe(2);
});
