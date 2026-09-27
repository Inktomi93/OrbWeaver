// `@orb/contracts/identity` — the global-role axis + the two canonical identity shapes the auth seam
// threads. DAG root: kit-only, no domain, no `@orb/db`, no sibling contracts node.
// Identity resolves ONCE at the entry seam into ONE immutable `Principal` flowing down unchanged;
// `ResolvedIdentity` is the pre-row output (no `userId` — the seam adds it building `Principal`).
//
// VOCABULARY (#1772 / #914, vocabulary-map row 45): `ChatResource.membership` was `ChatResource.roster`
// until 2026-09-06. The TYPE half of row 45 landed at #903 C2 (`ChatRoster` → `ChatMembership`) and left
// the FIELD spelling the old word, so every `can()` call site read `{ kind: "chat", roster: {…} }` for a
// single-`{role}` value that is not a list at all. `roster` remains RESERVED for the saved TEMPLATE
// concept (`rosterPreset`, "Rosters" — row 48) and never names this one.

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

// The global-authz axis. `owner` = the box owner (sole max-pro-sub/wallet holder; immutable; exactly one);
// `admin` = delegated administrator; `user` = normal. The one home every gating domain derives from.
export const USER_ROLES = ["owner", "admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES) satisfies z.ZodType<UserRole>;

// Principal-KIND axis — currently `human` only (post-rollback: the agent-principal seat wave was purged
// 2026-07-25). A tuple, never an `isAgent` boolean, so it can grow a third flavor without `if`-branching —
// the rebuild grafts an `agent` member here if the agent-principal design set returns (docs/work/0048).
export const USER_KINDS = ["human"] as const;
export type UserKind = (typeof USER_KINDS)[number];
/** @public twin: USER_KINDS — drives the users.kind enum (cross-package PUBLIC). */
export const userKindSchema = z.enum(USER_KINDS) satisfies z.ZodType<UserKind>;

/** The custom CSRF request header. Cross-boundary wire fact: the client sends it every request and the
 *  server gate keys on it. `SameSite=Lax` + this header is the whole CSRF story. */
export const CSRF_HEADER = "x-orb-csrf";

// The SSO mechanism selector; `foundation/env` and `infra/auth`'s `MODE_RESOLVERS` derive from this tuple.
export const AUTH_MODES = ["single-user", "local", "forward-header", "oidc"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];
export const authModeSchema = z.enum(AUTH_MODES) satisfies z.ZodType<AuthMode>;

/** The bare-metal command that sets `AUTH_MODE` and `ALLOWED_HOSTS` in `.env`. The setup wizard (tooling) runs
 *  under it, and the server's refusals name it, so both read this one spelling. */
export const SETUP_COMMAND = "pnpm start --setup";

/** The `environment:` lines of `docker-compose.yaml` that switch a container to the local sign-in mode, in print
 *  order. The shipped `docker/orbweaver.env` pairs single-user with the owner fallback and the bridge peers, which
 *  production refuses beside a login mode, so all three keys move. A server env test boots these over that file. */
export const CONTAINER_LOCAL_LOGIN_ENV = [
  ["AUTH_MODE", "local"],
  ["AUTH_FALLBACK", "deny"],
  ["AUTH_FALLBACK_TRUSTED_PEERS", ""],
] as const satisfies readonly (readonly [string, string])[];

/** The modes that mint a session cookie, so they need the SESSION_SECRET pepper to authenticate anyone. */
export const COOKIE_AUTH_MODES = ["local", "oidc"] as const satisfies readonly AuthMode[];
export type CookieAuthMode = (typeof COOKIE_AUTH_MODES)[number];

export function isCookieAuthMode(mode: AuthMode): boolean {
  return (COOKIE_AUTH_MODES as readonly AuthMode[]).includes(mode);
}

/** How a request reached the box. `https` only when a trusted hop asserts it, the IP certificate's own listener
 *  included: the app's handler never sees TLS.
 *  It picks the session cookie's name and `Secure` attribute, and the OIDC callback scheme. */
export const REQUEST_TRANSPORTS = ["https", "http"] as const;
export type RequestTransport = (typeof REQUEST_TRANSPORTS)[number];

/** Where a request's resolved client address sits: this machine (a loopback address, where nothing crosses a
 *  network), a private network, or the public internet. */
export const CLIENT_SCOPES = ["loopback", "private", "public"] as const;
export type ClientScope = (typeof CLIENT_SCOPES)[number];

/** The relays a share can run: a Cloudflare quick tunnel. `SHARE_RELAY` in the server env takes a member to start one at boot. */
export const SHARE_RELAY_KINDS = ["quick"] as const;
export type ShareRelayKind = (typeof SHARE_RELAY_KINDS)[number];
export const shareRelayKindSchema = z.enum(SHARE_RELAY_KINDS) satisfies z.ZodType<ShareRelayKind>;

/** The relay controller's states: `starting` carries the death it restarts after (null for an owner's start), `up` the
 *  public URL, `down` a reason and whether a restart is still owed. */
export const SHARE_STATES = ["off", "starting", "up", "down"] as const;
export type ShareState = (typeof SHARE_STATES)[number];

/** Why a relay is down: its process ended, it reported no URL in time, or a restart could not launch it. */
export const RELAY_DOWN_REASONS = ["exited", "no_url", "launch_failed"] as const;
export type RelayDownReason = (typeof RELAY_DOWN_REASONS)[number];

/** The coded refusals of `share.start` (the wire's `data.reason`), each naming a fix the Share card shows. A relayed
 *  request is never the owner, so single-user answers 401 to every visitor; a same-host relay delivers each visitor
 *  from a loopback peer, so a loopback-trusted forward-header proxy would take a visitor's forged identity header; an
 *  identity provider returns people only to its registered redirect addresses, which a relay's random name never is;
 *  and a listener bound to one named interface takes no loopback connection for the relay to arrive on. */
export const SHARE_REFUSALS = ["share_single_user", "share_forward_header", "share_oidc", "share_bind_address", "share_owner_unclaimed"] as const;
export type ShareRefusal = (typeof SHARE_REFUSALS)[number];

/** The one home for which sign-in modes can share over a relay: null where a relayed visitor can sign in, else the
 *  refusal. The server's start, the Share card and the `pnpm start --share` launcher all read it. */
export const SHARE_MODE_REFUSAL = {
  "single-user": "share_single_user",
  "forward-header": "share_forward_header",
  oidc: "share_oidc",
  local: null,
} as const satisfies Record<AuthMode, ShareRefusal | null>;

/** The coded refusals of the relay binary: nothing runs unless the downloaded bytes match the pinned sha256. */
export const RELAY_BINARY_REFUSALS = ["relay_platform_unsupported", "relay_binary_download_failed", "relay_binary_checksum_mismatch"] as const;
export type RelayBinaryRefusal = (typeof RELAY_BINARY_REFUSALS)[number];

// One arm per share state, keyed by its own `state` literal: a missing arm or a swapped literal fails to compile.
const relayStatusSchemas = {
  off: z.strictObject({ state: z.literal("off") }),
  starting: z.strictObject({ state: z.literal("starting"), relay: shareRelayKindSchema, restartAfter: z.enum(RELAY_DOWN_REASONS).nullable() }),
  up: z.strictObject({ state: z.literal("up"), relay: shareRelayKindSchema, url: z.url({ protocol: /^https$/u }) }),
  down: z.strictObject({ state: z.literal("down"), relay: shareRelayKindSchema, reason: z.enum(RELAY_DOWN_REASONS), restarting: z.boolean() }),
} as const satisfies { readonly [S in ShareState]: z.ZodObject<{ state: z.ZodLiteral<S> }> };

/** One relay's state as the owner's Share card reads it. */
export const relayStatusSchema = z.discriminatedUnion("state", [
  relayStatusSchemas.off,
  relayStatusSchemas.starting,
  relayStatusSchemas.up,
  relayStatusSchemas.down,
]);
export type RelayStatus = z.infer<typeof relayStatusSchema>;

/** Why a share may not start, with the sentence that names its fix. */
const shareRefusalNoticeSchema = z.strictObject({ code: z.enum(SHARE_REFUSALS), message: z.string() });
export type ShareRefusalNotice = z.infer<typeof shareRefusalNoticeSchema>;

// The TCP port range a listener may take, and the longest IP literal's text (a full IPv6 address with an IPv4 tail).
const PORT_MIN = 1;
const PORT_MAX = 65_535;
const IP_LITERAL_MAX_LENGTH = 45;
const listenerPortSchema = z.number().int().min(PORT_MIN).max(PORT_MAX);

/** The owner's IP certificate choice (D269): this server's public address, and the two ports on this machine the
 *  router forwards to, 443 to `httpsPort` and 80 to `challengePort`. The server refuses any address that is not
 *  public before it asks a certificate authority for anything. */
export const ipCertificateSettingSchema = z.strictObject({
  address: z.string().min(1).max(IP_LITERAL_MAX_LENGTH),
  httpsPort: listenerPortSchema,
  challengePort: listenerPortSchema,
});
export type IpCertificateSetting = z.infer<typeof ipCertificateSettingSchema>;

/** The IP certificate's states: off, getting its first certificate, serving https, or failed back to plain http. */
export const IP_CERTIFICATE_STATES = ["off", "obtaining", "active", "failed"] as const;
export type IpCertificateState = (typeof IP_CERTIFICATE_STATES)[number];

/** Why a certificate is not serving: the certificate authority could not reach the challenge through port 80, any
 *  other issuance error, the https port could not open, or every renewal failed until the certificate expired. */
export const IP_CERTIFICATE_FAILURES = ["validation_failed", "issuance_failed", "listener_failed", "expired"] as const;
export type IpCertificateFailureCode = (typeof IP_CERTIFICATE_FAILURES)[number];

/** The coded refusals of `share.enableIpCertificate`: a sign-in mode a visitor over https cannot use safely, an
 *  unclaimed owner, an address a public certificate authority can never reach, a listener bound to this machine only,
 *  a listener bound to one named interface the https hop cannot reach over loopback, and ports that collide. Nothing is
 *  asked of a certificate authority until every one holds. */
export const IP_CERTIFICATE_REFUSALS = [
  "ip_certificate_mode",
  "ip_certificate_owner_unclaimed",
  "ip_certificate_not_public",
  "ip_certificate_loopback_bind",
  "ip_certificate_bind_address",
  "ip_certificate_ports",
] as const;
export type IpCertificateRefusal = (typeof IP_CERTIFICATE_REFUSALS)[number];

const ipCertificateFailureSchema = z.strictObject({ code: z.enum(IP_CERTIFICATE_FAILURES), message: z.string() });
export type IpCertificateFailure = z.infer<typeof ipCertificateFailureSchema>;

// One arm per certificate state, keyed by its own `state` literal. Times are epoch milliseconds.
const ipCertificateStatusSchemas = {
  off: z.strictObject({ state: z.literal("off") }),
  obtaining: z.strictObject({ state: z.literal("obtaining"), setting: ipCertificateSettingSchema }),
  active: z.strictObject({
    state: z.literal("active"),
    setting: ipCertificateSettingSchema,
    url: z.url({ protocol: /^https$/u }),
    notAfter: z.number().int(),
    renewAt: z.number().int(),
    renewalFailure: ipCertificateFailureSchema.nullable(),
  }),
  failed: z.strictObject({ state: z.literal("failed"), setting: ipCertificateSettingSchema, failure: ipCertificateFailureSchema }),
} as const satisfies { readonly [S in IpCertificateState]: z.ZodObject<{ state: z.ZodLiteral<S> }> };

/** The IP certificate as the owner's Share card reads it. */
export const ipCertificateStatusSchema = z.discriminatedUnion("state", [
  ipCertificateStatusSchemas.off,
  ipCertificateStatusSchemas.obtaining,
  ipCertificateStatusSchemas.active,
  ipCertificateStatusSchemas.failed,
]);
export type IpCertificateStatus = z.infer<typeof ipCertificateStatusSchema>;

/** `share.status`: the relay, the live sockets of every account but the caller's, the addresses this server already
 *  answers at from the internet (under oidc the origins of `OIDC_REDIRECT_URIS`, under local the public names in
 *  `ALLOWED_HOSTS`), so the card can send friends there instead of through a relay, and the IP certificate. */
export const shareStatusSchema = z.strictObject({
  relay: relayStatusSchema,
  liveSocketCount: z.number().int().nonnegative(),
  publicAddresses: z.array(z.string()),
  certificate: ipCertificateStatusSchema,
});
export type ShareStatus = z.infer<typeof shareStatusSchema>;

/** The share fields on `/api/auth/config`. `url` is the public origin while the relay is up, served to a signed-in
 *  caller only; an anonymous visitor reads `null`, because the sign-in page needs no link to hand out. */
export const authConfigShareSchema = z.strictObject({ state: z.enum(SHARE_STATES), url: z.string().nullable() });
export type AuthConfigShare = z.infer<typeof authConfigShareSchema>;

/** The pre-row output: identity resolved to its stable SSO fields, BEFORE the `users` row exists. Carries
 *  no `userId` by design. `email` is a mutable contact attribute, never an identity/join key — `null`
 *  never wipes a stored email (keep-on-null). */
export interface ResolvedIdentity {
  externalId: ExternalId | null;
  handle: Handle;
  groups: string[];
  email: string | null;
}

/** The post-seam, immutable, db-resolved caller, constructed ONCE and carried downstream unchanged. No
 *  `isOwner` field — owner⊇admin lives only inside the `can()` seam. `via: "fallback"` is the SAFE
 *  "this IS the owner" marker — never infer it from `externalId === null` (a forward-header is also null). */
export interface Principal {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";
}

/** The canonical viewer identity (`sessions.me`), projected from the request Principal at the transport seam.
 *  A stale client `globalRole` is a UI hint only; server authz always re-reads the live row. STRICT and
 *  installed as the procedure's output parser: a refactor that spreads the Principal would carry `externalId`
 *  (the SSO subject) and `via`, and fails the call instead of reaching the browser. */
export const viewerViewSchema = z.strictObject({
  userId: brandedId<UserId>(),
  handle: brandedId<Handle>(),
  globalRole: userRoleSchema,
});
export type ViewerView = z.infer<typeof viewerViewSchema>;

// The `can()` privilege-decision seam. Cross-boundary: admin's `can()` impl ARBITRATES, chat CALLS IN with
// a roster it loaded; the union homes at the DAG root so both sides import it down. `can()` + the
// `requireAdmin`/`requireOwner` wrappers live in `domain/admin/guard.ts`; chat reaches it by injection.

/** Global-scope authority actions. `admin` = requires an administrator (owner passes too); `owner` =
 *  requires the box owner. */
export const GLOBAL_ACTIONS = ["admin", "owner"] as const;
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number];

/** Chat-resource authority actions. `read` = the present-member floor; `host` = room authority. */
export const CHAT_ACTIONS = ["read", "host"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

/** A chat participant's room authority. Lives here (not `@orb/contracts/chat`) because `can()` reads it
 *  and identity is the DAG root; chat re-exports this same name, no alias. */
export const PARTICIPANT_ROLES = ["host", "member"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** The membership data chat feeds `can()` for a chat-resource decision. `can()` makes the verdict —
 *  chat never compares `role === 'host'` itself. */
export interface ChatMembership {
  readonly role: ParticipantRole;
}

/** GLOBAL scope — the global-role axis (admin/owner). */
export interface GlobalResource {
  readonly kind: "global";
}
/** CHAT scope — carries the {@link ChatMembership} chat loaded + fed in. */
export interface ChatResource {
  readonly kind: "chat";
  readonly membership: ChatMembership;
}
export type ResourceRef = GlobalResource | ChatResource;

/** The ONE privilege-decision primitive: throws `DomainForbiddenError` on deny, void on allow. The
 *  overload couples each action set to its resource kind so a mismatch is a compile error. */
export interface Can {
  (principal: Principal, action: GlobalAction, resource: GlobalResource): void;
  (principal: Principal, action: ChatAction, resource: ChatResource): void;
}
