// Native OIDC captures retain private row material in Node; only canonical request outputs are portable.
import { readFile } from "node:fs/promises";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { pendingJoinConfirmRequestSchema, pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import type { AuthMe } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { sessions, users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { MS_PER_HOUR } from "@orb/kit/time";
import { oidcPendingJoinCookieFor, readRequestCookie, readSessionCookie } from "@orb/server/entry/auth";
import { eq } from "drizzle-orm";
import type { JWTPayload } from "jose";
import type { CorpusWire } from "../iso/corpus.ts";
import { captureOidcPendingSignup, captureOidcTransaction } from "./factories/rows/sessions.ts";
import type { BffSessionRow, OidcPendingSignupRow, OidcTransactionRow } from "./factories/sessions.ts";
import type { createNativeIssuer } from "./oidc-issuer.ts";
import type { UnclaimedServerTestHarness } from "./server.ts";
import { beginOidcLogin, cookieHeader, finishOidcLogin } from "./sign-in.ts";

const OWNER_SUBJECT = "corpus-native-owner-subject";
const JOINER_SUBJECT = "corpus-native-joiner-subject";
const JOINER_HANDLE = "corpus-oidc-joiner";

export interface SeededOidcCorpus {
  readonly ownerId: UserId;
  readonly secrets: readonly string[];
  readonly transactions: readonly OidcTransactionRow[];
  readonly pending: OidcPendingSignupRow;
  readonly joiner: typeof users.$inferSelect;
  readonly ownerSessions: readonly BffSessionRow[];
  readonly joinerSessions: readonly BffSessionRow[];
  readonly wire: NonNullable<CorpusWire["oidc"]>;
}

interface OidcLoginCapture {
  readonly response: Response;
  readonly transaction: OidcTransactionRow;
  readonly secrets: readonly string[];
}

async function captureIdentity(root: UnclaimedServerTestHarness, minted: Response): Promise<AuthMe> {
  const response = await root.http.request("/api/auth/me", { headers: { cookie: cookieHeader(minted) } });
  if (!response.ok) {
    throw new Error(`corpus OIDC identity request failed (${response.status})`);
  }
  return authMeSchema.parse(await response.json());
}

async function login(
  root: UnclaimedServerTestHarness,
  issuer: Awaited<ReturnType<typeof createNativeIssuer>>,
  claims: JWTPayload,
  query: string,
): Promise<OidcLoginCapture> {
  const started = await beginOidcLogin(root, issuer, claims, query);
  const { callback } = started;
  const state = callback.searchParams.get("state");
  if (state === null) {
    throw new Error("native issuer callback omitted the actual transaction state");
  }
  const transaction = await captureOidcTransaction(root.db, state);
  if (transaction === undefined) {
    throw new Error("actual OIDC login produced no canonical transaction row");
  }
  const response = await finishOidcLogin(root, started);
  const cookie = cookieHeader(response);
  const headers = new Headers({ cookie });
  const transport = callback.protocol === "https:" ? "https" : "http";
  return {
    response,
    transaction,
    secrets: [
      cookie,
      ...callback.searchParams.values(),
      readSessionCookie(headers, transport),
      readRequestCookie(headers, oidcPendingJoinCookieFor(transport).name),
    ].filter((value) => value !== null),
  };
}

/** Claim through the real boot file and join through native callback/CSRF routes; never mint a trusted identity. */
export async function seedOidcCorpus(root: UnclaimedServerTestHarness, issuer: Awaited<ReturnType<typeof createNativeIssuer>>): Promise<SeededOidcCorpus> {
  const configResponse = await root.http.request("/api/auth/config");
  if (!configResponse.ok) {
    throw new Error(`corpus OIDC auth-config request failed (${configResponse.status})`);
  }
  const anonymousConfig = authConfigSchema.parse(await configResponse.json());
  if (anonymousConfig.mode !== "oidc" || root.ownerClaimFile === undefined) {
    throw new Error("corpus OIDC capture requires a configured unclaimed root and its real boot claim file");
  }
  const handle = root.app.sessions.rolePolicy.ownerHandles()[0];
  if (handle === undefined) {
    throw new Error("corpus OIDC capture has no configured owner handle");
  }
  const claim = new URL((await readFile(root.ownerClaimFile, "utf8")).trim());
  // biome-ignore lint/style/useNamingConvention: preferred_username is the configured issuer's native claim.
  const ownerLogin = await login(root, issuer, { sub: OWNER_SUBJECT, preferred_username: handle }, claim.search);
  if (ownerLogin.response.status !== 302 || ownerLogin.response.headers.get("location") !== "/") {
    throw new Error("actual native OIDC boot claim did not complete");
  }
  const ownerMe = await captureIdentity(root, ownerLogin.response);
  const ownerId = await root.app.sessions.getOwnerUserId();
  if (!ownerMe.authenticated || ownerMe.role !== "owner" || ownerId === undefined) {
    throw new Error("actual native OIDC boot claim produced no admitted owner");
  }
  const owner = await root.internalCallerFor(ownerId);
  const room = await owner.chat.startChat({ characterIds: [], opening: "none" });
  const invite = await owner.invites.createInvite({
    chatId: room.chat.id,
    input: { allowSignup: true, maxUses: 1, expiresAt: root.clock.now() + MS_PER_HOUR },
  });
  // biome-ignore lint/style/useNamingConvention: preferred_username is the configured issuer's native claim.
  const join = await login(root, issuer, { sub: JOINER_SUBJECT, preferred_username: JOINER_HANDLE }, `?invite=${encodeURIComponent(invite.token)}`);
  if (join.response.status !== 302 || join.response.headers.get("location") !== "/login?pendingJoin=1") {
    throw new Error("actual native OIDC callback did not produce the required pending join");
  }
  const pending = await captureOidcPendingSignup(root.db, brandedId("ExternalId").parse(JOINER_SUBJECT));
  if (pending === undefined) {
    throw new Error("actual native OIDC callback produced no canonical pending-signup row");
  }
  const cookie = cookieHeader(join.response);
  const previewResponse = await root.http.request("/api/auth/oidc/pending/preview", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1" } });
  if (!previewResponse.ok) {
    throw new Error(`corpus OIDC pending preview failed (${previewResponse.status})`);
  }
  const pendingPreview = signedOutInvitePreviewSchema.parse(await previewResponse.json());
  const confirmResponse = await root.http.request("/api/auth/oidc/pending/confirm", {
    method: "POST",
    headers: { cookie, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(
      pendingJoinConfirmRequestSchema.parse({ persona: { name: "Corpus OIDC explorer", description: "An invited keeper of the native ledger." } }),
    ),
  });
  if (!confirmResponse.ok) {
    throw new Error(`corpus OIDC pending confirmation failed (${confirmResponse.status})`);
  }
  const confirmation = pendingJoinConfirmResultSchema.parse(await confirmResponse.json());
  const joiner = await root.db.select().from(users).where(eq(users.externalId, pending.subject)).get();
  if (joiner === undefined) {
    throw new Error("actual OIDC pending confirmation produced no canonical joined account");
  }
  const joinerMe = await captureIdentity(root, confirmResponse);
  const [ownerSessions, joinerSessions] = await Promise.all([
    root.db.select().from(sessions).where(eq(sessions.userId, ownerId)).orderBy(sessions.createdAt, sessions.id),
    root.db.select().from(sessions).where(eq(sessions.userId, joiner.id)).orderBy(sessions.createdAt, sessions.id),
  ]);
  await root.settleBackground();
  return {
    ownerId,
    secrets: [
      claim.href,
      ...claim.searchParams.values(),
      invite.token,
      ...issuer.idTokens,
      ...ownerLogin.secrets,
      ...join.secrets,
      cookieHeader(confirmResponse),
      readSessionCookie(new Headers({ cookie: cookieHeader(confirmResponse) }), "http"),
    ].filter((value) => value !== null),
    transactions: [ownerLogin.transaction, join.transaction],
    pending,
    joiner,
    ownerSessions,
    joinerSessions,
    wire: { anonymousConfig, ownerMe, pendingPreview, confirmation, joinerMe },
  };
}
