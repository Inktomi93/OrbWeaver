import type { AuthMode, Principal, ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import {
  AUTH_MODES,
  authConfigShareSchema,
  authModeSchema,
  relayStatusSchema,
  SHARE_STATES,
  shareStatusSchema,
  USER_ROLES,
  userRoleSchema,
  viewerViewSchema,
} from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// D17 PIN: the global-role axis is EXACTLY [owner, admin, user] — the `owner` member is the new one
// (was neo's 2-member admin|user). A drift here is the whole point of this node's existence.
test("USER_ROLES is exactly the 3-member D17 axis [owner, admin, user]", () => {
  expect(USER_ROLES).toEqual(["owner", "admin", "user"]);
  expect(userRoleSchema.options).toEqual(USER_ROLES);
});

// Exhaustiveness: a `Record<UserRole, …>` fails `tsc` if a member is added/removed, so the runtime
// assert below is backed by a compile-time guard (no inline role-union re-spelling anywhere else).
const ROLE_SEEN: Record<UserRole, true> = { owner: true, admin: true, user: true };
test("UserRole has no member beyond the tuple (exhaustive over owner|admin|user)", () => {
  expect(Object.keys(ROLE_SEEN).sort()).toEqual(USER_ROLES.toSorted());
});

test("userRoleSchema round-trips every valid role and rejects non-members", () => {
  for (const role of USER_ROLES) {
    expect(userRoleSchema.parse(role)).toBe(role);
  }
  // The neo-era and adjacent-axis values are NOT roles: a 2-member echo, a per-chat resource role,
  // an agent-ish label, the empty string.
  expect(userRoleSchema.safeParse("superadmin").success).toBe(false);
  expect(userRoleSchema.safeParse("host").success).toBe(false);
  expect(userRoleSchema.safeParse("guest").success).toBe(false);
  expect(userRoleSchema.safeParse("").success).toBe(false);
});

// The auth-mode axis is EXACTLY the 4 SSO mechanisms; `foundation/env` + `infra/auth` DERIVE from this
// one tuple (no inline re-spell — the no-inline-union-redecl gate now catches a z.enum/union duplicate).
test("AUTH_MODES is exactly [single-user, local, forward-header, oidc]", () => {
  expect(AUTH_MODES).toEqual(["single-user", "local", "forward-header", "oidc"]);
  expect(authModeSchema.options).toEqual(AUTH_MODES);
});

const MODE_SEEN: Record<AuthMode, true> = {
  "single-user": true,
  local: true,
  "forward-header": true,
  oidc: true,
};
test("AuthMode has no member beyond the tuple (exhaustive over the 4 modes)", () => {
  expect(Object.keys(MODE_SEEN).sort()).toEqual(AUTH_MODES.toSorted());
});

test("authModeSchema round-trips every mode and rejects non-members", () => {
  for (const mode of AUTH_MODES) {
    expect(authModeSchema.parse(mode)).toBe(mode);
  }
  expect(authModeSchema.safeParse("saml").success).toBe(false);
  expect(authModeSchema.safeParse("").success).toBe(false);
});

// Sample branded values built at the untyped seam (castId is the sanctioned cast) — no pasted secrets.
const SAMPLE_USER_ID = castId<UserId>("user-alice");
const SAMPLE_HANDLE = castId<Handle>("alice");
const SAMPLE_EXTERNAL_ID = castId<ExternalId>("authentik-sub-alice");

test("Principal pins the D19 shape: userId+role+handle+externalId+via, no callerUserId/isOwner/groups", () => {
  const principal: Principal = {
    userId: SAMPLE_USER_ID,
    role: "owner",
    handle: SAMPLE_HANDLE,
    externalId: SAMPLE_EXTERNAL_ID,
    via: "fallback",
  };
  expect(Object.keys(principal).sort()).toEqual(["externalId", "handle", "role", "userId", "via"].sort());
  // D19: the caller is `Principal.userId` — there is NO `callerUserId`, NO `isOwner` (owner⊇admin lives
  // in the can() seam), and NO `groups` (role is the sole carried authz axis — ledger §2).
  expect("callerUserId" in principal).toBe(false);
  expect("isOwner" in principal).toBe(false);
  expect("groups" in principal).toBe(false);
  // owner-fallback path keys on handle, so externalId MAY be null on a real Principal.
  const fallbackOwner: Principal = {
    userId: SAMPLE_USER_ID,
    role: "owner",
    handle: SAMPLE_HANDLE,
    externalId: null,
    via: "fallback",
  };
  expect(fallbackOwner.externalId).toBeNull();
});

test("ResolvedIdentity is the pre-row shape and carries NO userId (invariant #3)", () => {
  const resolved: ResolvedIdentity = {
    externalId: SAMPLE_EXTERNAL_ID,
    handle: SAMPLE_HANDLE,
    groups: ["platform-owners"],
    email: "owner@example.com",
  };
  expect(Object.keys(resolved).sort()).toEqual(["email", "externalId", "groups", "handle"].sort());
  expect("userId" in resolved).toBe(false);
  // `email` is a mutable attribute (nullable) — never an identity key.
  expect("role" in resolved).toBe(false);
  // The single-user / owner-fallback path resolves with a null externalId (keys on handle) + no email.
  const singleUser: ResolvedIdentity = {
    externalId: null,
    handle: SAMPLE_HANDLE,
    groups: [],
    email: null,
  };
  expect(singleUser.externalId).toBeNull();
});

// `sessions.me` parses its projection through this schema. STRICT: the projection is three fields, and a
// refactor that spreads the Principal would carry `externalId` (the SSO subject) and `via` to the browser.
test("viewerViewSchema admits the three-field projection and refuses a spread Principal", () => {
  const view = { userId: SAMPLE_USER_ID, handle: SAMPLE_HANDLE, globalRole: "admin" as const };
  expect(viewerViewSchema.parse(view)).toEqual(view);

  const spread = { ...view, externalId: SAMPLE_EXTERNAL_ID, via: "cookie" };
  const refused = viewerViewSchema.safeParse(spread);
  expect(refused.success).toBe(false);
  expect(refused.error?.issues).toEqual([expect.objectContaining({ code: "unrecognized_keys", keys: ["externalId", "via"] })]);
  // The issue names the keys and never echoes the refused value.
  expect(JSON.stringify(refused.error?.issues)).not.toContain(SAMPLE_EXTERNAL_ID);

  expect(viewerViewSchema.safeParse({ ...view, globalRole: "host" }).success).toBe(false);
});

// The share relay's wire: the owner's card reads `share.status`, every caller reads `/api/auth/config`'s share fields.
const TUNNEL_URL = "https://calm-river-four-birds.trycloudflare.com";

test("relayStatusSchema accepts each state's own shape and nothing more", () => {
  expect(relayStatusSchema.parse({ state: "off" })).toEqual({ state: "off" });
  expect(relayStatusSchema.parse({ state: "up", relay: "quick", url: TUNNEL_URL })).toEqual({ state: "up", relay: "quick", url: TUNNEL_URL });
  expect(relayStatusSchema.parse({ state: "down", relay: "quick", reason: "exited", restarting: false })).toMatchObject({ restarting: false });
  // A restart carries the death it restarts after; an owner's own start carries null, and the field is never absent.
  expect(relayStatusSchema.parse({ state: "starting", relay: "quick", restartAfter: "exited" })).toMatchObject({ restartAfter: "exited" });
  expect(relayStatusSchema.parse({ state: "starting", relay: "quick", restartAfter: null })).toMatchObject({ restartAfter: null });
  expect(relayStatusSchema.safeParse({ state: "starting", relay: "quick" }).success).toBe(false);
  // A plain-http link, an up state without its URL, and an extra field are all refused.
  expect(relayStatusSchema.safeParse({ state: "up", relay: "quick", url: "http://calm-river.trycloudflare.com" }).success).toBe(false);
  expect(relayStatusSchema.safeParse({ state: "up", relay: "quick" }).success).toBe(false);
  expect(relayStatusSchema.safeParse({ state: "off", url: TUNNEL_URL }).success).toBe(false);
  expect(relayStatusSchema.safeParse({ state: "down", relay: "quick", reason: "crashed", restarting: true }).success).toBe(false);
});

test("every SHARE_STATES member has exactly one relay status shape", () => {
  expect(relayStatusSchema.options.map((option) => option.shape.state.value).toSorted()).toEqual(SHARE_STATES.toSorted());
});

test("shareStatusSchema is strict, so a status carrying anything else fails the router's output parser", () => {
  const status = { relay: { state: "off" }, liveSocketCount: 2, publicAddresses: ["https://orb.example.com"], standingRefusal: null };
  expect(shareStatusSchema.parse(status)).toEqual(status);
  expect(shareStatusSchema.safeParse({ ...status, owner: "owner" }).success).toBe(false);
  expect(shareStatusSchema.safeParse({ ...status, liveSocketCount: -1 }).success).toBe(false);
  expect(shareStatusSchema.safeParse({ relay: { state: "off" }, liveSocketCount: 2 }).success).toBe(false);
  // The standing refusal carries a known refusal code and its sentence, nothing else.
  const standing = { code: "share_in_container", message: "run the relay beside this container" };
  expect(shareStatusSchema.parse({ ...status, standingRefusal: standing })).toEqual({ ...status, standingRefusal: standing });
  expect(shareStatusSchema.safeParse({ ...status, standingRefusal: { ...standing, code: "share_later" } }).success).toBe(false);
});

test("authConfigShareSchema carries only the state and a nullable link", () => {
  expect(authConfigShareSchema.parse({ state: "up", url: null })).toEqual({ state: "up", url: null });
  expect(authConfigShareSchema.safeParse({ state: "up", url: null, relay: "quick" }).success).toBe(false);
});
