// The identity wire a browser reads: `sessions.me`, `GET /api/auth/me` and `share.status`. Each schema is strict and is
// its route's output parser, so a field a refactor adds fails the call instead of reaching the browser.
import type { RelayStatus, ShareState, ShareStatus } from "@orb/contracts/identity";
import { authMeSchema, shareStatusSchema, viewerViewSchema } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { z } from "zod";

// Wire JSON as a browser receives it: the ids are plain strings until the schema brands them.
const VIEWER = { userId: "user-alice", handle: "alice", globalRole: "admin" };

test("the viewer projection admits its three fields and refuses a spread Principal by naming the extra keys", () => {
  expect(viewerViewSchema.parse(VIEWER)).toEqual(VIEWER);

  // A Principal carries the SSO subject and the admission path; neither may reach the browser.
  const refused = viewerViewSchema.safeParse({ ...VIEWER, externalId: "authentik-sub-alice", via: "cookie" });
  expect(refused.error?.issues).toMatchObject([{ code: "unrecognized_keys", keys: ["externalId", "via"] }]);
});

test("the viewer projection refuses a per-chat role as the global role", () => {
  expect(viewerViewSchema.safeParse(VIEWER).success).toBe(true);
  const refused = viewerViewSchema.safeParse({ ...VIEWER, globalRole: "host" });
  expect(refused.error?.issues).toMatchObject([{ code: "invalid_value", path: ["globalRole"] }]);
});

const SIGNED_IN = { authenticated: true, handle: "alice", role: "owner" };
const SIGNED_OUT = { authenticated: false, handle: null, role: null } satisfies z.input<typeof authMeSchema>;

test("the auth probe admits the signed-in and the unauthenticated answer, and refuses an unknown role or an extra field", () => {
  expect(authMeSchema.safeParse(SIGNED_IN).data).toEqual(SIGNED_IN);
  expect(authMeSchema.safeParse(SIGNED_OUT).data).toEqual(SIGNED_OUT);

  expect(authMeSchema.safeParse({ ...SIGNED_IN, role: "root" }).error?.issues).toMatchObject([{ code: "invalid_value", path: ["role"] }]);
  expect(authMeSchema.safeParse({ ...SIGNED_IN, via: "cookie" }).error?.issues).toMatchObject([{ code: "unrecognized_keys", keys: ["via"] }]);
});

const TUNNEL_URL = "https://calm-river-four-birds.trycloudflare.com";

// Every shape a relay state may take on the wire. A new state fails `tsc` here until it has a row.
const RELAY_SHAPES: Record<ShareState, readonly RelayStatus[]> = {
  off: [{ state: "off" }],
  // A restart carries the death it restarts after; an owner's own start carries null.
  starting: [
    { state: "starting", relay: "quick", restartAfter: "exited" },
    { state: "starting", relay: "quick", restartAfter: null },
  ],
  up: [{ state: "up", relay: "quick", url: TUNNEL_URL }],
  down: [
    { state: "down", relay: "quick", reason: "exited", restarting: false },
    { state: "down", relay: "quick", reason: "no_url", restarting: true },
  ],
};

function statusWith(relay: unknown): Record<keyof ShareStatus, unknown> {
  return { relay, liveSocketCount: 2, publicAddresses: ["https://orb.example.com"], certificate: { state: "off" } };
}

test.for(Object.values(RELAY_SHAPES).flat())("share.status round-trips the relay shape $state", (relay) => {
  const status = statusWith(relay);
  expect(shareStatusSchema.parse(status)).toEqual(status);
});

test.for([
  ["a start without the death it restarts after", { state: "starting", relay: "quick" }, { code: "invalid_value", path: ["relay", "restartAfter"] }],
  ["a plain-http link", { state: "up", relay: "quick", url: "http://calm-river.trycloudflare.com" }, { code: "invalid_format", path: ["relay", "url"] }],
  ["an up relay without its link", { state: "up", relay: "quick" }, { code: "invalid_type", path: ["relay", "url"] }],
  ["a link on a relay that is off", { state: "off", url: TUNNEL_URL }, { code: "unrecognized_keys", path: ["relay"], keys: ["url"] }],
  [
    "a down reason outside the roster",
    { state: "down", relay: "quick", reason: "crashed", restarting: true },
    { code: "invalid_value", path: ["relay", "reason"] },
  ],
  ["a relay kind outside the roster", { state: "up", relay: "named", url: TUNNEL_URL }, { code: "invalid_value", path: ["relay", "relay"] }],
] as const)("share.status refuses %s", ([, relay, issue]) => {
  expect(shareStatusSchema.safeParse(statusWith(RELAY_SHAPES.off[0])).success).toBe(true);
  expect(shareStatusSchema.safeParse(statusWith(relay)).error?.issues).toMatchObject([issue]);
});

test("share.status refuses an extra field, a negative socket count and a missing certificate", () => {
  const status = statusWith(RELAY_SHAPES.off[0]);
  expect(shareStatusSchema.safeParse(status).success).toBe(true);

  expect(shareStatusSchema.safeParse({ ...status, owner: "owner" }).error?.issues).toMatchObject([{ code: "unrecognized_keys", keys: ["owner"] }]);
  expect(shareStatusSchema.safeParse({ ...status, liveSocketCount: -1 }).error?.issues).toMatchObject([{ code: "too_small", path: ["liveSocketCount"] }]);
  const { certificate: _certificate, ...withoutCertificate } = status;
  expect(shareStatusSchema.safeParse(withoutCertificate).error?.issues).toMatchObject([{ path: ["certificate"] }]);
});
