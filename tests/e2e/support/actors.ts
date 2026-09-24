// Actor-aware tRPC clients — the harness's ONE way to drive the app's API as a SPECIFIC authenticated
// principal (not just the ambient owner the bare `trpc.ts` helpers resolve to). A thin wrapper over the
// SAME batch-wire shape `trpc.ts` speaks (httpBatchLink contract), plus a per-actor header jar so a spec can
// hold two live principals at once (host + member) and prove per-viewer behavior at the WIRE — the P3
// member-strip, permission refusals, sharing flows. Additive: the 60+ single-user helpers in `trpc.ts` are
// untouched (an un-credentialed call still auto-resolves to the owner via the fallback seam).
//
// The three auth modes this harness boots (Playwright-project axis, playwright.config.ts) each mint an actor
// differently — but they all produce the SAME `ActorClient` shape, so a spec is mode-agnostic once it holds
// one:
//   • single-user / local HOST  → the OWNER via the un-credentialed 127.0.0.1 fallback seam (no cookie, no
//     CSRF header; `via:"fallback"` so a mutation needs no CSRF). `ownerActor()`.
//   • local MEMBER               → `POST /api/auth/login` (form) → the session cookie → a cookie
//     principal (`via:"cookie"`). Cookie MUTATIONS carry the `x-orb-csrf` header or the transport 403s
//     (transport/trpc/trpc.ts — the CSRF gate keys on `via==="cookie"` + the header). `loginLocal(...)`.
//   • forward-header             → a signed RS256 JWT (minted in-test with `jose`, the jwks.test.ts precedent;
//     NO external IdP) attached as the trusted-proxy `x-authentik-jwt` + its public JWKS as
//     `x-authentik-meta-jwks`. No login, no cookie. `actorViaHeader(...)`.
//   • oidc                       → DEFERRED (owner decision). See the stub in playwright.config.ts.
//
// The wire subset shapes are declared LOCALLY (the e2e-support tree stays import-free of the package trees —
// the `trpc.ts` CanonMessage posture, incl. its type-only `@orb/kit/ids` brand carve-out); string-union axes
// stay `string` (the `no-inline-union-redecl` gate bans re-spelling a homed tuple here, and specs compare to
// literals).

import type { ChatId, Handle } from "@orb/kit/ids";
import type { CryptoKey } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
// TYPE-ONLY: `trpc.ts`'s client is bound to the single-user origin, while an actor carries its own cookie
// jar — importing the create-input SHAPE keeps the literal in `configureCustomProvider` under that file's
// mirror pin without borrowing its client.
import type { NewConnection } from "./trpc.ts";

// Every actor constructor takes the stack's `baseUrl` explicitly — the spec passes Playwright's per-project
// `baseURL` fixture (its vite origin), so an actor ALWAYS targets the same stack as the project, with no
// fragile env coupling (the test-runner process has no `E2E_BASE_URL`; only the webServer does). The vite
// front door proxies `/api/*` (login, tRPC) + `/join` to that project's Hono backend.

// The wire-fixed names (declared here, not imported — the import-free-of-package-trees rule). CSRF_HEADER's
// one home is @orb/contracts/identity; the session cookie names are infra/auth's `sessionCookieFor`. The
// harness reaches each stack over plain http with no proxy, so a login mints the http transport's cookie.
const CSRF_HEADER = "x-orb-csrf";
export const SESSION_COOKIE = "orb_session_insecure";

/** One authenticated principal's wire client — `query`/`mutation` over the tRPC batch shape, carrying this
 *  actor's own headers (a session cookie, a signed-JWT proxy header, or nothing for the fallback owner). The
 *  SAME shape for every mode, so a spec that holds one is mode-agnostic. */
export interface ActorClient {
  /** A batch GET query — returns the single procedure's `result.data`. Throws on a non-2xx / error env. */
  readonly query: <T>(procedure: string, input: unknown) => Promise<T>;
  /** A batch mutation — returns the single procedure's `result.data`. Throws on a non-2xx / error env. */
  readonly mutation: <T>(procedure: string, input: unknown) => Promise<T>;
  /** The `expect(...).rejects` twin: run a call and RESOLVE with the error envelope's HTTP status + message
   *  instead of throwing — the "a member is refused an owner-only proc" assertion instrument. */
  readonly expectError: (procedure: string, input: unknown, kind: "query" | "mutation") => Promise<{ readonly status: number; readonly body: string }>;
  /** The resolved principal for THIS actor's headers (`GET /api/auth/me`) — the mode-agnostic whoami: who did
   *  the seam resolve this request AS, and at what role. `authenticated:false` for an unresolved caller. */
  readonly whoami: () => Promise<Whoami>;
  /** This actor's identifying headers (cookie / signed-JWT proxy headers), for a caller that must speak the
   *  wire directly AS this actor — the SSE consumer (`collectChatRoomFrames`) attaches the member's own chat room. */
  readonly headers: Readonly<Record<string, string>>;
}

/** The `GET /api/auth/me` shape — the seam's resolved principal (handle + role), or unauthenticated. */
interface Whoami {
  readonly authenticated: boolean;
  readonly handle: Handle | null;
  readonly role: string | null;
}

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

interface TrpcEnvelope<T> {
  readonly result?: { readonly data?: T };
  readonly error?: unknown;
}

/** Build an actor client bound to a stack `baseUrl` + a fixed header set (the actor's session/identity).
 *  Mutations merge the actor's headers with the JSON content-type; queries ride the actor's headers on the GET. */
function makeActorClient(baseUrl: string, headers: Readonly<Record<string, string>>): ActorClient {
  async function query<T>(procedure: string, input: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}`, { headers });
    const body = (await res.json()) as readonly TrpcEnvelope<T>[];
    const entry = body[0];
    if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
      throw new Error(`actor trpc: ${procedure} query failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return entry.result.data as T;
  }

  async function mutation<T>(procedure: string, input: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ 0: input }),
    });
    const body = (await res.json()) as readonly TrpcEnvelope<T>[];
    const entry = body[0];
    if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
      throw new Error(`actor trpc: ${procedure} mutation failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return entry.result.data as T;
  }

  async function expectError(procedure: string, input: unknown, kind: "query" | "mutation"): Promise<{ readonly status: number; readonly body: string }> {
    const url = kind === "query" ? `${baseUrl}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}` : `${baseUrl}/api/trpc/${procedure}?batch=1`;
    const res = await fetch(
      url,
      kind === "query" ? { headers } : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ 0: input }) },
    );
    return { status: res.status, body: await res.text() };
  }

  async function whoami(): Promise<Whoami> {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers });
    if (!res.ok) {
      throw new Error(`actor whoami failed (${res.status})`);
    }
    return (await res.json()) as Whoami;
  }

  return { query, mutation, expectError, whoami, headers };
}

// ── OWNER (single-user + the local/forward-header HOST) ─────────────────────────────────────────────────

/** The ambient OWNER actor — the un-credentialed 127.0.0.1 fallback seam resolves the box owner (`via:
 *  "fallback"`), so no cookie and no CSRF header are needed even for mutations. This is the HOST in every
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

/** The `invites.createInvite` return (subset) — the raw `token` is returned exactly once (stored hashed). */
interface CreatedInvite {
  readonly token: string;
}

/** Seat a MEMBER actor into an existing chat: the HOST mints a targeted invite for `memberHandle`, then the
 *  MEMBER redeems the raw token (the one atomic participant-insert chokepoint). After this the member is a
 *  present participant and every member-gated read (`listMessages`/`replayChatEvents`) resolves for them.
 *  The `member` client must already be logged in (`loginLocal`). */
export async function addMemberToChat(host: ActorClient, member: ActorClient, chatId: ChatId, memberHandle: string): Promise<void> {
  const invite = await host.mutation<CreatedInvite>("invites.createInvite", { chatId, input: { invitedHandle: memberHandle } });
  await member.mutation("invites.redeemInvite", { token: invite.token });
}

// ── CUSTOM PROVIDER — point the chat role at a BYO OpenAI-compatible endpoint (the fixture provider) ───────

/** The `connection.create` return (subset) — the row id the `chat` binding points at. */
interface CreatedConnection {
  readonly id: string;
}

/**
 * Point the HOST's `chat` Model role at a BYO OpenAI-compatible endpoint — the REAL product seam a user uses
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
 * `modelListed: false` because nothing dialled the endpoint's `/v1/models` for this id — `model` is a bare
 * label here, exactly as before (the openai-compat runner reads capabilities, not a baked model).
 */
export async function configureCustomProvider(host: ActorClient, baseUrl: string, model: string): Promise<void> {
  const input: NewConnection = {
    label: `e2e-fixture-provider-${model}`,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl,
    model,
    modelListed: false,
  };
  const connection = await host.mutation<CreatedConnection>("connection.create", input);
  await host.mutation("connection.setBinding", { task: "chat", connectionId: connection.id });
}
