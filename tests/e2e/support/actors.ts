// Actor identity headers bind the native transport; raw probes preserve HTTP status and body evidence.
import type { AuthMe } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import type { ChatId, Handle } from "@orb/kit/ids";
import { expect } from "@playwright/test";
import type { CryptoKey } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { NewConnection, TrpcClient, TrpcClientOutput } from "./trpc.ts";
import { createTrpcClient } from "./trpc.ts";

// Every actor constructor takes the stack's `baseUrl` explicitly — the spec passes Playwright's per-project
// `baseURL` fixture (its vite origin), so an actor ALWAYS targets the same stack as the project, with no
// fragile env coupling (the test-runner process has no `E2E_BASE_URL`; only the webServer does). The vite
// front door proxies `/api/*` (login, tRPC) + `/join` to that project's Hono backend.

// The session cookie name is infra/auth's `sessionCookieFor`. The harness reaches each stack over plain http with no proxy,
// so a login mints the http transport's cookie.
export const SESSION_COOKIE = "orb_session_insecure";

/** One authenticated actor's native client, identity headers and raw HTTP observations. */
export interface ActorClient {
  /** Native procedure members preserve query/mutation kinds and serialized response types. */
  readonly trpc: TrpcClient;
  /** The `expect(...).rejects` twin: run a call and RESOLVE with the error envelope's HTTP status + message
   *  instead of throwing — the "a member is refused an owner-only proc" assertion instrument. */
  readonly expectError: (procedure: string, input: unknown, kind: "query" | "mutation") => Promise<{ readonly status: number; readonly body: string }>;
  /** The resolved principal for THIS actor's headers (`GET /api/auth/me`) — the mode-agnostic whoami: who did
   *  the seam resolve this request AS, and at what role. `authenticated:false` for an unresolved caller. */
  readonly whoami: () => Promise<AuthMe>;
  /** This actor's identifying headers (cookie / signed-JWT proxy headers), for a caller that must speak the
   *  wire directly AS this actor — the SSE consumer (`collectChatRoomFrames`) attaches the member's own chat room. */
  readonly headers: Readonly<Record<string, string>>;
}

const IMPORT_IDLE_MS = 30_000;

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

/** One batched tRPC call carrying exactly `headers` (no CSRF header is added), resolved to its raw HTTP status and
 *  body: the instrument for a gate's refusal, which the native client would only throw. */
export async function rawTrpcCall(
  baseUrl: string,
  call: { readonly procedure: string; readonly input: unknown; readonly kind: "query" | "mutation" },
  headers: Readonly<Record<string, string>>,
): Promise<{ readonly status: number; readonly body: string }> {
  const { procedure, input, kind } = call;
  const url = kind === "query" ? `${baseUrl}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}` : `${baseUrl}/api/trpc/${procedure}?batch=1`;
  const res = await fetch(
    url,
    kind === "query" ? { headers } : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ 0: input }) },
  );
  return { status: res.status, body: await res.text() };
}

/** The actor's identifying headers without the CSRF header: what a cross-site page's request carries. */
export function ambientHeaders(actor: Pick<ActorClient, "headers">): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(actor.headers).filter(([name]) => name !== CSRF_HEADER));
}

/** Cancel the actor's own active bundle imports through the real verb. The kind is singular, and a harness stack
 *  leaves an upload queued, so an earlier run's upload would otherwise answer the next one with the 409 lock. */
export async function importsIdle(actor: Pick<ActorClient, "trpc">): Promise<void> {
  const active: readonly string[] = ACTIVE_WORKLOAD_STATUSES;
  const running = async (): Promise<TrpcClientOutput<"workloads.list">> =>
    (await actor.trpc.workloads.list.query({ kind: "import-bundle" })).filter((row) => active.includes(row.status));
  for (const row of await running()) {
    await actor.trpc.workloads.cancel.mutate({ id: row.id });
  }
  await expect.poll(async () => (await running()).length, { timeout: IMPORT_IDLE_MS }).toBe(0);
}

/** Build an actor client bound to a stack `baseUrl` + a fixed header set (the actor's session/identity).
 *  Mutations merge the actor's headers with the JSON content-type; queries ride the actor's headers on the GET. */
function makeActorClient(baseUrl: string, headers: Readonly<Record<string, string>>): ActorClient {
  const trpc = createTrpcClient(baseUrl, headers);

  function expectError(procedure: string, input: unknown, kind: "query" | "mutation"): Promise<{ readonly status: number; readonly body: string }> {
    return rawTrpcCall(baseUrl, { procedure, input, kind }, headers);
  }

  async function whoami(): Promise<AuthMe> {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers });
    if (!res.ok) {
      throw new Error(`actor whoami failed (${res.status})`);
    }
    return authMeSchema.parse(await res.json());
  }

  return { trpc, expectError, whoami, headers };
}

// ── OWNER (single-user + the local/forward-header HOST) ─────────────────────────────────────────────────

/** The ambient OWNER actor — the un-credentialed 127.0.0.1 fallback seam resolves the box owner
 *  (`via: "fallback"`), so no cookie and no CSRF header are needed even for mutations. This is the HOST in every
 *  mode (single-user's only principal; the local/forward-header room host). `baseUrl` is the spec's
 *  per-project Playwright `baseURL` (the vite origin). */
export function ownerActor(baseUrl: string): ActorClient {
  return makeActorClient(baseUrl, {});
}

// ── LOCAL MODE — a credentialed MEMBER via the login form ────────────────────────────────────────────────

/** Log in a seeded LOCAL user and return an actor client bound to their session cookie + the
 *  `x-orb-csrf` header (so their mutations pass the CSRF gate). The member the multi-user seed mints
 *  (`FIXTURE_MEMBER_HANDLE`) is the canonical caller. `baseUrl` is the local project's vite origin. Throws if
 *  the login mints no session cookie. */
export async function loginLocal(baseUrl: string, handle: Handle, password: string): Promise<ActorClient> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    // The login route requires the custom CSRF header (blocks login-CSRF); this actor sends it like the client.
    headers: { "content-type": "application/x-www-form-urlencoded", [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle, password }).toString(),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = res.ok ? new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie) : null;
  if (match === null) {
    throw new Error(`actor loginLocal(${handle}): no session cookie (HTTP ${res.status}): ${setCookie}`);
  }
  // Rebuild the cookie header value (name=value) — a browser would; the seam reads exactly this pair.
  return makeActorClient(baseUrl, { cookie: `${SESSION_COOKIE}=${match[1]}`, [CSRF_HEADER]: "1" });
}

// ── FORWARD-HEADER MODE — a signed-JWT trusted-proxy identity (no login, no cookie) ─────────────────────

/** The forward-header signed-JWT claim inputs (a subset of the OIDC/authentik claim shape the resolver maps).
 *  `handle` → `preferred_username`; `sub`/`groups`/`email` are optional. */
export interface ForwardClaims {
  readonly handle: Handle;
  readonly sub?: string;
  readonly groups?: readonly string[];
  readonly email?: string;
}

/** The in-test signing keypair: the RS256 private key + the public JWKS literal it verifies against. */
interface KeyMaterial {
  readonly privateKey: CryptoKey;
  readonly jwks: string;
}

// Minted once per process (jose CryptoKeys). The public JWKS rides EVERY request as the
// `x-authentik-meta-jwks` literal; the server verifies the signed JWT against it (the jwks.test.ts crypto
// path — real jose, no external IdP). The `kid` lets jose pick the key.
let keyMaterialPromise: Promise<KeyMaterial> | null = null;

async function mintKeyMaterial(): Promise<KeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "e2e-forward-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwks: JSON.stringify({ keys: [jwk] }) };
}

function keyMaterial(): Promise<KeyMaterial> {
  keyMaterialPromise ??= mintKeyMaterial();
  return keyMaterialPromise;
}

/** Mint an actor client for a forward-header trusted-proxy identity: sign an RS256 JWT over the claims and
 *  attach it as `x-authentik-jwt` + the public JWKS as `x-authentik-meta-jwks` (the authentik shape the
 *  resolver reads). No login, no cookie; the request IS the identity. The server needs
 *  `AUTH_MODE=forward-header` + a non-empty `FORWARD_AUTH_JWKS_ALLOWLIST` (the signed path refuses an empty
 *  allowlist) — the forward-header Playwright project sets both. The JWKS travels as a LITERAL, so the
 *  allowlist gates only remote-URL egress (never the literal), exactly as jwks.test.ts proves. `baseUrl` is
 *  the forward-header project's vite origin. */
export async function actorViaHeader(baseUrl: string, claims: ForwardClaims): Promise<ActorClient> {
  const { privateKey, jwks } = await keyMaterial();
  // biome-ignore lint/style/useNamingConvention: OIDC/authentik claim names are wire-fixed snake_case.
  const payload: Record<string, unknown> = { preferred_username: claims.handle, sub: claims.sub ?? `sub-${claims.handle}` };
  if (claims.groups !== undefined) {
    payload["groups"] = [...claims.groups];
  }
  if (claims.email !== undefined) {
    payload["email"] = claims.email;
  }
  const jwt = await new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "e2e-forward-key" }).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  return makeActorClient(baseUrl, { "x-authentik-jwt": jwt, "x-authentik-meta-jwks": jwks });
}

// ── MEMBERSHIP — seat a second human in a chat (the local multi-human primitive) ────────────────────────

/** Seat a MEMBER actor into an existing chat: the HOST mints a targeted invite for `memberHandle`, then the
 *  MEMBER redeems the raw token (the one atomic participant-insert chokepoint). After this the member is a
 *  present participant and every member-gated read (`listMessages`/`replayChatEvents`) resolves for them.
 *  The `member` client must already be logged in (`loginLocal`). */
export async function addMemberToChat(host: ActorClient, member: ActorClient, chatId: ChatId, memberHandle: string): Promise<void> {
  const invite = await host.trpc.invites.createInvite.mutate({ chatId, input: { invitedHandle: memberHandle } });
  await member.trpc.invites.redeemInvite.mutate({ token: invite.token });
}

// ── CUSTOM PROVIDER — point the chat role at a BYO OpenAI-compatible endpoint (the fixture provider) ───────

/**
 * Point the HOST's Chat and Utility roles at a BYO OpenAI-compatible endpoint — the REAL product seam a user uses
 * to aim orbweaver at any OpenAI-compatible server. Used to drive the harness fixture provider (a scripted
 * deterministic stream); NOT a product backdoor, because the endpoint is external and the app only ever knows
 * it as a user-authored connection row.
 *
 * ONE ROW, NO CREDENTIAL. The `custom-openai` provider is `auth: endpoint`, so the URL lives on the
 * CONNECTION (`user_connections.baseUrl`) and the key is optional — the fixture provider takes none, and
 * `connectionFields.credentialId` is nullable, so minting a `user_credentials` row nothing would resolve
 * would be dead state, not fidelity. (The pre-inference shape stored `baseUrl`/`model` in the credential's
 * `metadata` and called `credentials.setActive`; both are gone — a credential is now a sealed secret with a
 * label, and WHICH key resolves is the connection's decision, so there is no `active` axis to set.)
 *
 * The returned cleanup restores prior role picks before removing the fixture connection.
 * No model check because nothing dialled the endpoint's `/v1/models` for this id — `model` is a bare
 * label here, exactly as before (the openai-compat runner reads capabilities, not a baked model).
 */
export async function configureCustomProvider(host: ActorClient, baseUrl: string, model: string): Promise<() => Promise<void>> {
  const previous = (await host.trpc.connection.listBindings.query(undefined)).filter((binding) => binding.task === "chat" || binding.task === "summarize");
  const input: NewConnection = {
    label: `e2e-fixture-provider-${model}`,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl,
    model,
    allowBackground: true,
  };
  const connection = await host.trpc.connection.create.mutate(input);
  for (const task of ["chat", "summarize"] as const) {
    await host.trpc.connection.setBinding.mutate({ task, connectionId: connection.id });
  }
  return async (): Promise<void> => {
    for (const binding of previous) {
      await host.trpc.connection.setBinding.mutate({ task: binding.task, connectionId: binding.binding?.connectionId ?? null });
    }
    await host.trpc.connection.remove.mutate({ connectionId: connection.id });
  };
}
