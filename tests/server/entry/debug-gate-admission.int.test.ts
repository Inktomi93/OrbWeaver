// D17: /api/_debug admits an owner credential or the operator's own loopback session, through the composed root.
// Token cases inject the harness `debugToken`; every other case runs tokenless.
// @subject packages/server/src/foundation/observability/debug/routes.ts
import { readFile, rm } from "node:fs/promises";
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES, CSRF_HEADER } from "@orb/contracts/identity";
import { isPlainObject } from "@orb/kit/guards";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv, createAuthSeam } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import { isOwner } from "@orb/testkit/node/auth";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, damageOwnerRow } from "@orb/testkit/node/composed";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";
import { describe } from "vitest";
import { z } from "zod";
import { authMe, claimedOwnerCookie, debugStatus, FORWARD_USERNAME_CLAIM, policy, signedForwardRoot, signedInMember } from "./_auth-roots.ts";

const LOOPBACK = "127.0.0.1";
const LAN_PEER = "10.0.0.7";
const WIDENED_OWNER_PEERS = "10.0.0.0/8";
const ADMIN_GROUP = "orb-debug-admins";
/** The principal-blind whole-db reads the gate is the entire boundary for, plus the db-free info control. */
const PROBE_PATHS = ["/api/_debug/info", "/api/_debug/db/chats", "/api/_debug/config/user"] as const;
const BUG_REPORT = "/api/_debug/bug-report";
const INJECTED_DEBUG_TOKEN = "debug-gate-injected-token";
// The writer answers with the artifact pair it wrote under the checkout's report directory; the case removes both.
const writtenReportSchema = z.object({ written: z.object({ json: z.string(), markdown: z.string() }) });
const HOST_CASES = [
  { name: "no Host header at all", headers: {} },
  { name: "Host: localhost", headers: { host: "localhost" } },
  { name: "Host: 127.0.0.1 (the exploit's forged loopback)", headers: { host: LOOPBACK } },
  { name: "Host: 10.0.0.7 (a forged private literal)", headers: { host: LAN_PEER } },
] as const;
const FOREIGN_HOST = "chat.example.com";
/** A same-host relay's tell: the loopback socket carries a third party, so the fallback arm never mints. */
const RELAYED = { "cf-connecting-ip": "203.0.113.9", "x-forwarded-proto": "https" };

type Root = Pick<ServerTestHarness, "http">;

interface Outcome {
  readonly path: string;
  readonly status: number;
  readonly refusal: boolean;
}

function rootFor(
  mode: AuthMode,
  options: Omit<ServerHarnessOptions, "authConfig"> & { readonly fallback?: "owner" | "deny" } = {},
): Promise<ServerTestHarness> {
  const { fallback, env, ...rest } = options;
  return createServerHarness({
    physicalPeer: () => LOOPBACK,
    ...(mode === "oidc" ? { oidc: NATIVE_OIDC_SETTINGS } : {}),
    ...rest,
    // The parse refuses `deny` under `single-user`, so that pairing alone rides the overlay; every other posture is
    // the record's, which the owner-fallback credential rule also reads. An unnamed fallback is the mode's own default.
    ...(mode === "single-user" && fallback === "deny"
      ? { env: { ...env }, authConfig: { mode, fallback } }
      : { env: { ...env, ["AUTH_MODE"]: mode, ...(fallback === undefined ? {} : { ["AUTH_FALLBACK"]: fallback }) } }),
  });
}

/** Every probe path's status, and whether the body is the gate's own refusal (it names the refusing arm). An
 *  unregistered route, or a handler that ran and failed, carries no reason. */
async function outcomes(root: Root, headers: Record<string, string> = {}): Promise<Outcome[]> {
  return await Promise.all(
    PROBE_PATHS.map(async (path): Promise<Outcome> => {
      const response = await root.http.request(path, { headers });
      const body: unknown = await response.json();
      return { path, status: response.status, refusal: isPlainObject(body) && typeof body["reason"] === "string" };
    }),
  );
}

const ALL_REFUSED_TOKENLESS: Outcome[] = PROBE_PATHS.map((path) => ({ path, status: 404, refusal: true }));
const ALL_ADMITTED: Outcome[] = PROBE_PATHS.map((path) => ({ path, status: 200, refusal: false }));

function bugReport(root: Root, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(
    root.http.request(BUG_REPORT, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ note: "   ", windowMinutes: null }),
    }),
  );
}

// This process launches on the operator posture, where a direct loopback single-user caller is the operator and is
// admitted; that row is relayed here, and the production-posture HTTP row is production-debug-posture.int.test.ts.
describe("un-credentialed callers, and a relayed single-user loopback caller, never reach /api/_debug", () => {
  for (const mode of AUTH_MODES) {
    const relayed = mode === "single-user";
    for (const { name, headers } of HOST_CASES) {
      test(`${mode}: NO token configured, ${relayed ? "relayed, " : ""}${name} → 404 (surface off), never a handler`, async () => {
        await using root = await rootFor(mode);
        expect(await outcomes(root, relayed ? { ...headers, ...RELAYED } : headers)).toEqual(ALL_REFUSED_TOKENLESS);
      });
    }
    // A Host this box does not answer to is refused by the rebinding guard, before any principal resolves.
    test(`${mode}: NO token configured, Host: ${FOREIGN_HOST} (a public FQDN) → 421, never a handler`, async () => {
      await using root = await rootFor(mode);
      const statuses = await Promise.all(PROBE_PATHS.map(async (path) => (await root.http.request(path, { headers: { host: FOREIGN_HOST } })).status));
      expect(statuses).toEqual(PROBE_PATHS.map(() => 421));
    });
  }

  test("single-user with fallback=deny is refused too (the deny is the credential rule, not the config)", async () => {
    await using root = await rootFor("single-user", { fallback: "deny" });
    expect(await outcomes(root, { host: LOOPBACK })).toEqual(ALL_REFUSED_TOKENLESS);
  });

  test("no resolvable TCP peer is refused in every posture (the fallback arm cannot even mint)", async () => {
    await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" } });
    expect(await outcomes(root, { host: LOOPBACK })).toEqual(ALL_REFUSED_TOKENLESS);
  });
});

describe("the loopback owner fallback opens the door only where the posture says it is the operator", () => {
  test("dev posture + a LOOPBACK peer: the owner's own session is admitted (the #1193 defect)", async () => {
    await using root = await rootFor("single-user");
    expect(await outcomes(root)).toEqual(ALL_ADMITTED);
  });

  test("a LAN peer is refused on the SAME box (the peer gate, not the posture, bounds arm 3)", async () => {
    await using root = await rootFor("single-user", { physicalPeer: () => LAN_PEER });
    expect(await outcomes(root, { host: LOOPBACK })).toEqual(ALL_REFUSED_TOKENLESS);
  });

  test("a RELAYED loopback request is refused on the same dev box (a same-host tunnel is not the operator)", async () => {
    await using root = await rootFor("single-user");
    expect(await outcomes(root, RELAYED)).toEqual(ALL_REFUSED_TOKENLESS);
  });

  test("a DEMOTED loopback row is refused (the ROLE half of the verdict is untouched)", async () => {
    await using root = await rootFor("single-user");
    await damageOwnerRow(root, { role: "user" });
    expect((await authMe(root)).authenticated).toBe(true);
    expect(await outcomes(root)).toEqual(ALL_REFUSED_TOKENLESS);
  });

  // The record's widened peer set makes the loopback owner no operator credential, whatever the mode.
  for (const mode of AUTH_MODES) {
    test(`${mode}: the STRICT posture refuses an un-relayed loopback owner over HTTP (a widened peer set)`, async () => {
      await using root = await rootFor(mode, { fallback: "owner", env: { ["AUTH_FALLBACK_TRUSTED_PEERS"]: WIDENED_OWNER_PEERS } });
      expect(await authMe(root)).toMatchObject({ authenticated: true, role: "owner" });
      expect(await outcomes(root)).toEqual(ALL_REFUSED_TOKENLESS);
    });
  }

  // The posture is a launch fact production binds into the seam; a seam bound without it is the production arm.
  test("the PRODUCTION posture refuses the same loopback owner, single-user included (a proxy makes everyone one)", async () => {
    await using root = await rootFor("single-user");
    for (const mode of AUTH_MODES) {
      const config = { ...authConfigFromEnv(root.env), mode, fallback: "owner" as const };
      const production = createAuthSeam({ logger: root.logger, emitUserEvent: root.app.liveBuses.user.publishUserEvent, sessions: root.app.sessions, config });
      const operator = createAuthSeam({
        logger: root.logger,
        emitUserEvent: root.app.liveBuses.user.publishUserEvent,
        sessions: root.app.sessions,
        config,
        ownerFallbackIsOperatorCredential: true,
      });
      const { principal } = await production.resolvePrincipal(new Headers(), { peerIp: LOOPBACK, transport: "http" });
      expect(principal === null ? null : isOwner(principal), mode).toBe(true);
      expect(production.debugGateAdmits(principal, new Headers()), mode).toBe(false);
      expect(operator.debugGateAdmits(principal, new Headers()), mode).toBe(true);
    }
  });
});

describe("the two real credentials still open the gate", () => {
  test("an OWNER session cookie authorizes with no token configured (the arm's documented purpose)", async () => {
    await using root = await rootFor("local");
    expect(await outcomes(root, { cookie: await claimedOwnerCookie(root) })).toEqual(ALL_ADMITTED);
  });

  test("an OWNER session cookie authorizes", async () => {
    await using root = await rootFor("oidc");
    // The owner's real session row, presented under the cookie name this transport's login writes.
    await using naming = await rootFor("local");
    const [cookieName] = (await claimedOwnerCookie(naming)).split("=");
    const session = await root.app.sessions.create({ userId: root.ownerId });
    expect(await outcomes(root, { cookie: `${cookieName ?? ""}=${session.token}` })).toEqual(ALL_ADMITTED);
  });

  test("a signed forward-header SSO OWNER authorizes (via:'header' is a credential)", async () => {
    const signed = await signedForwardRoot(policy({}));
    await using root = signed.root;
    const owner = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: (await root.principalFor(root.ownerId)).handle, sub: "debug-gate-owner" });
    expect(await outcomes(root, owner)).toEqual(ALL_ADMITTED);
  });

  test("a plain USER session cookie is still refused (the role gate denies below owner)", async () => {
    await using root = await rootFor("local");
    expect(await outcomes(root, { cookie: (await signedInMember(root, castId<Handle>("debug-gate-user"))).cookie })).toEqual(ALL_REFUSED_TOKENLESS);
  });

  test("an UNSIGNED forward-header OWNER from a trusted proxy is refused (only a verified JWT is a credential)", async () => {
    await using root = await createServerHarness({
      physicalPeer: () => LOOPBACK,
      env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny", ["FORWARD_AUTH_TRUSTED_PROXIES"]: "127.0.0.0/8" },
    });
    const unsigned = { "x-authentik-username": (await root.principalFor(root.ownerId)).handle };
    expect((await authMe(root, unsigned)).role).toBe("owner");
    expect(await outcomes(root, unsigned)).toEqual(ALL_REFUSED_TOKENLESS);
  });
});

describe("an injected debug token is the gate's token everywhere it is read", () => {
  test("the token admits, a mismatch is refused, and /info reports the token as configured", async () => {
    await using root = await rootFor("local", { debugToken: INJECTED_DEBUG_TOKEN });
    expect((await root.http.request("/api/_debug/info", { headers: { "x-debug-token": "not-the-injected-token" } })).status).toBe(401);
    const info = await root.http.request("/api/_debug/info", { headers: { "x-debug-token": INJECTED_DEBUG_TOKEN } });
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ diagnostics: { tokenConfigured: true } });
  });
});

describe("/info reports the recorders this graph composed, not the ambient env", () => {
  async function retaining(root: Root): Promise<unknown> {
    const info = await root.http.request("/api/_debug/info", { headers: { "x-debug-token": INJECTED_DEBUG_TOKEN } });
    expect(info.status).toBe(200);
    return z.object({ diagnostics: z.object({ retaining: z.array(z.string()) }) }).parse(await info.json()).diagnostics.retaining;
  }

  test("a graph forced to capture and trace reports both retaining", async () => {
    await using root = await rootFor("local", { debugToken: INJECTED_DEBUG_TOKEN, wireCapture: true, rpgTrace: true });
    expect(await retaining(root)).toEqual(["WIRE_CAPTURE", "RPG_TRACE"]);
  });

  test("a graph that composed neither recorder reports nothing retaining", async () => {
    await using root = await rootFor("local", { debugToken: INJECTED_DEBUG_TOKEN, wireCapture: false, rpgTrace: false });
    expect(await retaining(root)).toEqual([]);
  });
});

describe("the bug-report WRITE route is behind the same gate", () => {
  test("no token configured → 404 (surface off), and NOTHING is written", async () => {
    await using root = await rootFor("single-user", { fallback: "deny" });
    const refused = await bugReport(root);
    expect(refused.status).toBe(404);
    const body: unknown = await refused.json();
    expect(isPlainObject(body) && typeof body["reason"] === "string").toBe(true);
  });

  test("a plain USER session cookie is refused on the WRITE too", async () => {
    await using root = await rootFor("local");
    const refused = await bugReport(root, { cookie: (await signedInMember(root, castId<Handle>("debug-gate-writer"))).cookie, [CSRF_HEADER]: "1" });
    expect(refused.status).toBe(404);
    await refused.arrayBuffer();
  });

  // An empty note is the schema's 400: the gate admitted the request and no report was written.
  test("the box operator's loopback session reaches the WRITER on a dev box (#1193)", async () => {
    await using root = await rootFor("single-user");
    const admitted = await bugReport(root);
    expect(admitted.status).toBe(400);
    await admitted.arrayBuffer();
  });

  test("a graph forced to capture wires reports capture enabled in the written bundle, as the wire reads do", async () => {
    await using root = await rootFor("single-user", { wireCapture: true });
    const captures: unknown = await (await root.http.request("/api/_debug/wire/captures")).json();
    expect(captures).toMatchObject({ enabled: true });
    const written = await root.http.request(BUG_REPORT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "forced-on wire capture witness", windowMinutes: null }),
    });
    expect(written.status).toBe(200);
    const paths = writtenReportSchema.parse(await written.json()).written;
    try {
      expect(JSON.parse(await readFile(paths.json, "utf8"))).toMatchObject({ server: { wireCaptureEnabled: true } });
    } finally {
      await Promise.all([rm(paths.json, { force: true }), rm(paths.markdown, { force: true })]);
    }
  });
});

describe("D17: a DELEGATED admin is not the box operator", () => {
  test("the narrowing is the GATE, not one route — a delegated admin is refused on every probe", async () => {
    await using root = await rootFor("local");
    const admin = await signedInMember(root, castId<Handle>("debug-gate-admin"));
    await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: admin.id, role: "admin" });
    expect((await authMe(root, { cookie: admin.cookie })).role).toBe("admin");
    expect(await outcomes(root, { cookie: admin.cookie })).toEqual(ALL_REFUSED_TOKENLESS);
  });

  test("a signed forward-header SSO ADMIN is refused too (the role gate binds every credential arm)", async () => {
    const signed = await signedForwardRoot(policy({ ["OIDC_ADMIN_GROUPS"]: ADMIN_GROUP }));
    await using root = signed.root;
    const admin = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "debug-gate-sso-admin", sub: "debug-gate-sso-admin", groups: [ADMIN_GROUP] });
    expect((await authMe(root, admin)).role).toBe("admin");
    expect(await debugStatus(root, admin, "/api/_debug/wire/captures")).toBe(404);
    expect(await outcomes(root, admin)).toEqual(ALL_REFUSED_TOKENLESS);
  });
});
