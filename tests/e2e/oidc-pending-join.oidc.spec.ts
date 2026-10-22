// A signed-out invitee whose IdP identity has no account is held as a pending join by the real OIDC callback;
// leaving it retires the invite and drops only the pendingJoin param. The issuer and code grant are real.
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { E2E_SSO_GROUPS, OIDC_CLIENT, oidcIssuerTls } from "./support/modes.ts";
import type { OidcIssuer } from "./support/oidc-issuer.ts";
import { stageIssuerIdentity, startOidcIssuer } from "./support/oidc-issuer.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const INVITE_TTL_MS = 10 * 60_000;
const JOINER_SUFFIX_BYTES = 4;
// The extra query bytes and hash the dismissal must keep, around two pendingJoin params it must drop.
const NOISY_PENDING_LANDING = "/login?space=%20&pendingJoin=1&plus=+&pendingJoin=1#turn-4";
const NOISY_AFTER_LEAVING = "/login?space=%20&plus=+#turn-4";
const NOT_NOW = "Not now";
const CONTINUE_WITH_IDP = `Continue with ${OIDC_CLIENT.providerName}`;

// A loopback request with no relay tell resolves as the box owner; the empty `forwarded` header makes this
// browser the signed-out visitor it stands for. The issuer's self-signed certificate is trusted only by the
// server child, so the browser's one hop through /authorize ignores it.
test.use({ extraHTTPHeaders: { forwarded: "" }, ignoreHTTPSErrors: true });

const tls = oidcIssuerTls();
let issuer: OidcIssuer | undefined;

test.beforeAll(async () => {
  issuer = await startOidcIssuer({
    port: OIDC_CLIENT.issuerPort,
    tls,
    clientId: OIDC_CLIENT.clientId,
    clientSecret: OIDC_CLIENT.clientSecret,
  });
});

test.afterAll(async () => {
  await issuer?.[Symbol.asyncDispose]();
});

test("leaving an OIDC pending join retires its invite and preserves other query bytes, hash and history", async ({ page, baseURL }) => {
  if (issuer === undefined) {
    throw new Error("the OIDC issuer did not start");
  }
  const owner = ownerActor(baseURL ?? "");
  const [character] = (await owner.trpc.character.list.query({})).items;
  if (character === undefined) {
    throw new Error("global-setup seeds a character on every stack");
  }
  const started = await owner.trpc.chat.startChat.mutate({ characterIds: [character.id] });
  try {
    const invite = await owner.trpc.invites.createInvite.mutate({
      chatId: started.chat.id,
      input: { allowSignup: true, maxUses: 1, expiresAt: Date.now() + INVITE_TTL_MS },
    });
    const joiner = `oidc-joiner-${randomBytes(JOINER_SUFFIX_BYTES).toString("hex")}`;
    await stageIssuerIdentity(issuer.url, { sub: joiner, preferredUsername: joiner, groups: [E2E_SSO_GROUPS.member] }, tls.cert);

    await page.goto(`/join/${invite.token}`);
    await page.getByRole("button", { name: CONTINUE_WITH_IDP, exact: true }).click();
    // JIT is closed, so the callback holds the new identity as a pending join instead of refusing it.
    await expect(page).toHaveURL(/\/login\?pendingJoin=1$/u, { timeout: WAIT_SETTLE_MS });
    await expect(page.getByRole("button", { name: NOT_NOW, exact: true })).toBeVisible();
    expect(await page.evaluate((token) => Object.values(sessionStorage).includes(token), invite.token)).toBe(true);

    await page.goto(NOISY_PENDING_LANDING);
    const historyLength = await page.evaluate(() => history.length);
    await page.getByRole("button", { name: NOT_NOW, exact: true }).click();
    await expect(page.getByRole("button", { name: CONTINUE_WITH_IDP, exact: true })).toBeVisible();
    expect(await page.evaluate((token) => Object.values(sessionStorage).includes(token), invite.token)).toBe(false);
    await expect
      .poll(() => page.evaluate(() => ({ href: location.pathname + location.search + location.hash, length: history.length })))
      .toEqual({ href: NOISY_AFTER_LEAVING, length: historyLength });
    const nextLogin = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/auth/oidc/login");
    await page.getByRole("button", { name: CONTINUE_WITH_IDP, exact: true }).click();
    expect(new URL((await nextLogin).url()).searchParams.has("invite")).toBe(false);
  } finally {
    await owner.trpc.chat.delete.mutate({ chatId: started.chat.id });
  }
});
