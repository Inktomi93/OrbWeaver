// A root composed with no rate-limit input keeps every shipped bucket: each axis refuses the first attempt past its
// cap through the real mount, while every earlier axis still passes, so the refusal belongs to the axis under test.
// @subject packages/server/src/entry/rate-limit-gate.ts
// @subject packages/server/src/entry/http/auth-routes.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { signedInMember } from "./_auth-roots.ts";

const LOCAL = { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" } as const;
const PEER = "203.0.113.9";
const OK = 200;
const UNAUTHORIZED = 401;
const TOO_MANY_REQUESTS = 429;
// The handle axis sits above the per-IP axis; this bound only stops a broken axis from looping forever.
const HANDLE_AXIS_SEARCH_MULTIPLE = 4;

function localRoot(options: Pick<ServerHarnessOptions, "physicalPeer" | "env"> = {}): Promise<ServerTestHarness> {
  return createServerHarness({ physicalPeer: () => PEER, ...options, env: { ...LOCAL, ...options.env } });
}

async function statusOf(root: ServerTestHarness, path: string, init?: RequestInit): Promise<number> {
  const response = await root.http.request(path, init);
  await response.arrayBuffer();
  return response.status;
}

function login(root: ServerTestHarness, handle: string): Promise<number> {
  return statusOf(root, "/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle, password: "not-the-password" }),
  });
}

/** Spend `count` attempts in order, one at a time, so a fixed-window count is exact. */
async function spend(count: number, attempt: (index: number) => Promise<number>): Promise<number[]> {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) {
    statuses.push(await attempt(index));
  }
  return statuses;
}

function admittedThenRefused(cap: number, admitted: number): number[] {
  return [...Array.from({ length: cap }, () => admitted), TOO_MANY_REQUESTS];
}

test("the login route refuses the attempt past the per-IP cap, and only a raised floor admits it", async () => {
  await using shipped = await localRoot();
  const cap = shipped.services.settings.getEffectiveConfig().rateLimits.login;
  expect(await spend(cap + 1, (index) => login(shipped, `ip-axis-${String(index)}`))).toEqual(admittedThenRefused(cap, UNAUTHORIZED));

  await using raised = await localRoot({ env: { ["RATE_LIMIT_LOGIN"]: String(cap + 1) } });
  expect(await spend(cap + 1, (index) => login(raised, `ip-axis-${String(index)}`))).toEqual(Array.from({ length: cap + 1 }, () => UNAUTHORIZED));
});

test("the handle axis refuses one account past the per-IP cap when rotating peers never trip it", async () => {
  let peer = PEER;
  await using root = await localRoot({ physicalPeer: () => peer });
  const cap = root.services.settings.getEffectiveConfig().rateLimits.login;
  const bound = cap * HANDLE_AXIS_SEARCH_MULTIPLE;
  let admitted = 0;
  let status = UNAUTHORIZED;
  while (admitted < bound && status === UNAUTHORIZED) {
    peer = `198.51.100.${String(admitted + 1)}`;
    status = await login(root, "one-targeted-account");
    admitted += status === UNAUTHORIZED ? 1 : 0;
  }
  expect(status).toBe(TOO_MANY_REQUESTS);
  expect(admitted).toBeGreaterThan(cap);
});

test("an anonymous caller is refused past the per-IP tRPC cap and told when to retry", async () => {
  await using root = await localRoot();
  const cap = root.services.settings.getEffectiveConfig().rateLimits.publicIp;
  expect(await spend(cap, () => statusOf(root, "/api/trpc/health"))).toEqual(Array.from({ length: cap }, () => OK));
  const refused = await root.http.request("/api/trpc/health");
  await refused.arrayBuffer();
  expect(refused.status).toBe(TOO_MANY_REQUESTS);
  expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
});

test("a signed-in member is refused past the per-user request cap", async () => {
  await using root = await localRoot();
  const { cookie } = await signedInMember(root, castId<Handle>("general-bucket-member"));
  const cap = root.services.settings.getEffectiveConfig().rateLimits.authed;
  expect(await spend(cap + 1, () => statusOf(root, "/api/trpc/sessions.me", { headers: { cookie } }))).toEqual(admittedThenRefused(cap, OK));
});

test("an AI turn verb is refused past its stricter cap while the general bucket still has room", async () => {
  await using root = await localRoot();
  const { cookie } = await signedInMember(root, castId<Handle>("ai-turn-member"));
  const { aiTurn: cap, authed } = root.services.settings.getEffectiveConfig().rateLimits;
  expect(cap).toBeLessThan(authed);
  const turn = (): Promise<number> =>
    statusOf(root, "/api/trpc/chat.send", { method: "POST", headers: { cookie, [CSRF_HEADER]: "1", ["content-type"]: "application/json" }, body: "{}" });
  const statuses = await spend(cap + 1, turn);
  expect(statuses.slice(0, cap)).not.toContain(TOO_MANY_REQUESTS);
  expect(statuses.at(cap)).toBe(TOO_MANY_REQUESTS);
  expect(await statusOf(root, "/api/trpc/sessions.me", { headers: { cookie } })).toBe(OK);
});
