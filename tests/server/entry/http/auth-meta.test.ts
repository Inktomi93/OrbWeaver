// entry/http/auth-meta — the public bootstrap registrar (FINAL-Auth-Modes §7 P0). Pins: /config derives
// the per-mode flags from the INJECTED mode (requiresLogin only for the cookie modes); discreet login
// WITHHOLDS the handle pre-fill (read per request — a runtime AppSettings flip takes effect immediately);
// A8 serves the OIDC provider name; B4 serves the origin-scoped localFirstRun flag; /me projects the
// middleware-resolved principal (authenticated/handle/role) and never resolves a second time. Hono isn't
// test-resolvable, so the registrar runs over a captured mock app + context (the healthz.test.ts pattern).

import type { AuthMode, Principal } from "@orb/contracts/identity";
import { resolveUploadCaps } from "@orb/contracts/uploads";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthMetaDeps } from "@orb/server/entry/http";
import { registerAuthMeta } from "@orb/server/entry/http";
import { ownerFallbackAllowed } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

interface MockResult {
  readonly body: Record<string, unknown>;
  readonly status: number;
}
interface MockCtx {
  readonly get: (key: "principal") => Principal | null;
  readonly json: (body: Record<string, unknown>, status?: number) => MockResult;
  readonly req: { readonly header: (name: string) => string | undefined; readonly raw: { readonly headers: Headers } };
  // /config now reads the raw TCP peer via `getConnInfo(c)` (#298 f2 — the localFirstRun peer gate), which
  // reads `c.env.incoming.socket.*`. Mirror what `@hono/node-server` binds (see app.test.ts's PEER_ENV).
  readonly env: { readonly incoming: { readonly socket: { readonly remoteAddress: string } } };
}
type Handler = (c: MockCtx) => MockResult | Promise<MockResult>;

const OK = 200;
const PROVIDER = "Test IdP";

/** Register over a captured mock app; return the two handlers keyed by path. */
function handlers(deps: AuthMetaDeps): { config: Handler; me: Handler } {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  // @orb-waive no-test-fabrication(unknown): Hono isn't test-resolvable — the captured mock app is a deliberate partial (the healthz.test.ts pattern). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerAuthMeta(app as unknown as Parameters<typeof registerAuthMeta>[0], deps);
  const config = routes.get("GET /api/auth/config");
  const me = routes.get("GET /api/auth/me");
  if (config === undefined || me === undefined) {
    throw new Error("auth-meta routes not registered");
  }
  return { config, me };
}

async function run(handler: Handler, principal: Principal | null = null, headers: Headers = new Headers(), peer = "127.0.0.1"): Promise<MockResult> {
  const ctx: MockCtx = {
    get: () => principal,
    json: (body, status = OK): MockResult => ({ body, status }),
    req: { header: (name: string): string | undefined => headers.get(name) ?? undefined, raw: { headers } },
    env: { incoming: { socket: { remoteAddress: peer } } },
  };
  return await handler(ctx);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DATABANK_BYTES = 20 * 1024 * 1024;

function depsFor(mode: AuthMode, discreet = false, capable = false, forbidExternalMedia = true): AuthMetaDeps {
  return {
    mode,
    defaultHandle: "owner",
    oidcProviderName: PROVIDER,
    discreetLogin: () => discreet,
    multiHumanCapable: () => capable,
    maxImageBytes: () => MAX_IMAGE_BYTES,
    maxDatabankBytes: () => MAX_DATABANK_BYTES,
    forbidExternalMedia: () => forbidExternalMedia,
    // The strict floor is the default here (a fifth positional would breach the max-params ceiling); the
    // one test that needs a TRUSTING deployment spells its own deps literal, like the per-request tests do.
    trustHtml: () => false,
    allowInteractiveCards: () => false,
  };
}

const USER: Principal = {
  userId: castId<UserId>("usr_1"),
  role: "user",
  handle: castId<Handle>("alice"),
  externalId: null,
  via: "cookie",
};

describe("GET /api/auth/config", () => {
  test("local mode → requiresLogin + localEnabled, handle pre-fill present", async () => {
    expect((await run(handlers(depsFor("local")).config)).body).toEqual({
      mode: "local",
      requiresLogin: true,
      localEnabled: true,
      oidcEnabled: false,
      oidcProviderName: PROVIDER,
      localFirstRun: false,
      discreetLogin: false,
      defaultHandle: "owner",
      multiHumanCapable: false,
      forbidExternalMedia: true,
      trustHtml: false,
      allowInteractiveCards: false,
      uploads: resolveUploadCaps({ maxImageBytes: MAX_IMAGE_BYTES, maxDatabankBytes: MAX_DATABANK_BYTES }),
      transport: "http",
      clientScope: "private",
    });
  });

  // Rule C/E: the login screen warns from these two facts, so they are this request's, never the box's.
  test.each([
    ["a LAN browser over plain http", "192.168.1.20", {}, { transport: "http", clientScope: "private" }],
    [
      "a trusted proxy asserting https for a public visitor",
      "172.18.0.5",
      { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.9" },
      { transport: "https", clientScope: "public" },
    ],
    ["a router port-forward (public peer, plain http)", "203.0.113.9", {}, { transport: "http", clientScope: "public" }],
    [
      "a public peer forging X-Forwarded-Proto and a private X-Forwarded-For",
      "203.0.113.9",
      { "x-forwarded-proto": "https", "x-forwarded-for": "10.0.0.1" },
      { transport: "http", clientScope: "public" },
    ],
  ] as const)("transport + clientScope for %s", async (_label, peer, headers, expected) => {
    const body = (await run(handlers(depsFor("local")).config, null, new Headers(headers), peer)).body;
    expect({ transport: body["transport"], clientScope: body["clientScope"] }).toEqual(expected);
  });

  // A8 — the human-facing IdP name for the "Continue with {name}" button; served in every mode (inert off oidc).
  test("serves the OIDC provider name (A8)", async () => {
    expect((await run(handlers(depsFor("oidc")).config)).body["oidcProviderName"]).toBe(PROVIDER);
  });

  // B4 — the origin-scoped first-run flag. Absent dep (non-local modes) ⇒ served false; present ⇒ the
  // predicate's per-request verdict (owner-needs-password AND local origin) is served.
  test("localFirstRun: FALSE when no first-run dep is supplied (non-local modes)", async () => {
    expect((await run(handlers(depsFor("oidc")).config)).body["localFirstRun"]).toBe(false);
  });

  test("localFirstRun: reflects the injected per-request predicate (owner-needs-password × local origin)", async () => {
    let pending = true;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      localFirstRun: () => Promise.resolve(pending),
      discreetLogin: () => false,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => true,
      trustHtml: () => false,
      allowInteractiveCards: () => false,
    });
    expect((await run(config)).body["localFirstRun"]).toBe(true);
    pending = false;
    expect((await run(config)).body["localFirstRun"]).toBe(false);
  });

  // Rule B: the flag shares the first-run route's gate, so a relayed loopback request must not see the setup
  // screen. The injected predicate is the real one `entry/lifecycle.ts` wires; what is pinned is that the
  // registrar hands it the request's headers.
  test("localFirstRun: FALSE for a relayed loopback request, TRUE for the bare one (control)", async () => {
    const { config } = handlers({
      ...depsFor("local"),
      localFirstRun: (peer, requestHeaders) => Promise.resolve(ownerFallbackAllowed(peer, requestHeaders)),
    });
    expect((await run(config, null, new Headers({ "x-forwarded-for": "203.0.113.9" }))).body["localFirstRun"]).toBe(false);
    expect((await run(config, null, new Headers({ "cf-connecting-ip": "203.0.113.9" }))).body["localFirstRun"]).toBe(false);
    expect((await run(config)).body["localFirstRun"]).toBe(true);
  });

  // DRAFT-TRUST arm 1: the OTHER render-policy floor axis. Served so a client surface that previews card
  // content (the character editor, which has no server-resolved renderPolicy to read) can run the same
  // `resolveRenderPolicy` combine the compose-time roster does, instead of reading the card's raw override.
  // Per-request like every flag here, and NOT a ceiling: a card override wins over it in either direction.
  test("serves the deployment trustHtml floor, read PER REQUEST", async () => {
    expect((await run(handlers(depsFor("local")).config)).body["trustHtml"]).toBe(false);

    let trusts = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      discreetLogin: () => false,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => true,
      trustHtml: () => trusts,
      allowInteractiveCards: () => false,
    });
    expect((await run(config)).body["trustHtml"]).toBe(false);
    trusts = true;
    expect((await run(config)).body["trustHtml"]).toBe(true);
  });

  // #111 leg 3 — the INTERACTIVE-CARD ceiling. Served for the same don't-ship-a-dead-switch reason as the
  // external-media one: while it is off, the per-character "Interactive" rung stores fine and resolves to
  // the static posture, so the editor has to say so. The DEFAULT arm asserts FALSE deliberately: the shipped
  // floor is off, and a config that started serving `true` by accident would silently arm every card whose
  // host clicked the rung back when the editor said it was inert.
  test("serves the deployment allowInteractiveCards ceiling, read PER REQUEST, floor OFF", async () => {
    expect((await run(handlers(depsFor("local")).config)).body["allowInteractiveCards"]).toBe(false);

    let allows = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      discreetLogin: () => false,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => true,
      trustHtml: () => false,
      allowInteractiveCards: () => allows,
    });
    expect((await run(config)).body["allowInteractiveCards"]).toBe(false);
    allows = true;
    expect((await run(config)).body["allowInteractiveCards"]).toBe(true);
  });

  // The deployment external-media CEILING, served so the per-character "External media" control can render
  // disabled-and-explained instead of a dead "Allow" (the resolver is tighten-only; the CSP blocks anyway).
  // Read per request like every other flag here — an admin flip is live for the next boot/reload.
  test("serves the deployment forbidExternalMedia ceiling, read PER REQUEST", async () => {
    expect((await run(handlers(depsFor("local")).config)).body["forbidExternalMedia"]).toBe(true);

    let forbid = true;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      discreetLogin: () => false,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => forbid,
      trustHtml: () => false,
      allowInteractiveCards: () => false,
    });
    expect((await run(config)).body["forbidExternalMedia"]).toBe(true);
    forbid = false;
    expect((await run(config)).body["forbidExternalMedia"]).toBe(false);
  });

  test("serves the resolved upload byte caps (image cap = min of the route cap and the admin maxImageBytes)", async () => {
    const body = (await run(handlers(depsFor("local")).config)).body;
    // maxImageBytes (5 MiB) is tighter than the 64 MiB route cap, so the served image cap is the admin value.
    expect(body["uploads"]).toEqual(resolveUploadCaps({ maxImageBytes: MAX_IMAGE_BYTES, maxDatabankBytes: MAX_DATABANK_BYTES }));
    expect((body["uploads"] as { image: number }).image).toBe(MAX_IMAGE_BYTES);
  });

  test("oidc mode → requiresLogin + oidcEnabled", async () => {
    const body = (await run(handlers(depsFor("oidc")).config)).body;
    expect(body["requiresLogin"]).toBe(true);
    expect(body["oidcEnabled"]).toBe(true);
    expect(body["localEnabled"]).toBe(false);
  });

  test("single-user / forward-header → requiresLogin false (no login page can fix either)", async () => {
    expect((await run(handlers(depsFor("single-user")).config)).body["requiresLogin"]).toBe(false);
    expect((await run(handlers(depsFor("forward-header")).config)).body["requiresLogin"]).toBe(false);
  });

  test("discreet login WITHHOLDS defaultHandle (no enumeration on the login surface)", async () => {
    const body = (await run(handlers(depsFor("local", true)).config)).body;
    expect(body["discreetLogin"]).toBe(true);
    expect(body["defaultHandle"]).toBeNull();
  });

  test("multiHumanCapable is the INJECTED per-request derivation (a runtime LOCAL_MULTI_USER flip takes effect immediately)", async () => {
    let capable = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      discreetLogin: () => false,
      multiHumanCapable: () => capable,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => true,
      trustHtml: () => false,
      allowInteractiveCards: () => false,
    });
    expect((await run(config)).body["multiHumanCapable"]).toBe(false);
    capable = true;
    expect((await run(config)).body["multiHumanCapable"]).toBe(true);
  });

  test("the discreet flag is read PER REQUEST (a runtime AppSettings flip takes effect immediately)", async () => {
    let discreet = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      oidcProviderName: PROVIDER,
      discreetLogin: () => discreet,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
      maxDatabankBytes: () => MAX_DATABANK_BYTES,
      forbidExternalMedia: () => true,
      trustHtml: () => false,
      allowInteractiveCards: () => false,
    });
    expect((await run(config)).body["defaultHandle"]).toBe("owner");
    discreet = true;
    expect((await run(config)).body["defaultHandle"]).toBeNull();
  });
});

describe("GET /api/auth/me", () => {
  test("projects the middleware-resolved principal", async () => {
    expect((await run(handlers(depsFor("local")).me, USER)).body).toEqual({
      authenticated: true,
      handle: "alice",
      role: "user",
    });
  });

  test("anonymous → authenticated:false with null identity fields (a 200, never a 401)", async () => {
    const res = await run(handlers(depsFor("local")).me, null);
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ authenticated: false, handle: null, role: null });
  });
});
