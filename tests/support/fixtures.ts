// The composed test (core/Spine-Testing.md §4) — `test.extend` over beforeEach. Import `test`/`expect`
// from HERE, never vitest (gate: test-fixture-imports). Fixtures are lazy — a fixture only constructs if
// a test destructures it:
//   clock / ids     — the determinism seams (frozen clock + seeded ids).
//   db              — fresh migrated libSQL `:memory:` (support/db freshDb).
//   app             — the REAL composition root over `db` (`createServices`: frozen clock, vLLM disabled,
//                     enabled-but-keyless SecretBox, temp CAS/variant dirs). The fixture IS the composed
//                     production wiring — tests exercise the real injection graph, not a parallel
//                     test-only assembly (Spine-Testing esoterica).
//   services        — `app.services` (the transport `Services` bundle), for direct front-door calls.
//   ownerCaller     — tRPC caller as the box OWNER (role 'owner' — the owner∪admin apex, D17).
//   adminCaller     — a SEPARATE delegated admin (role 'admin') — distinct from the owner so
//                     admin-vs-owner gates can be exercised.
//   otherCaller     — a separate plain user (role 'user'). Use for cross-user isolation tests.
//   anonCaller      — auth:null. NOT a user — models the unauthenticated request; authedProcedure 401s it.
//
// Doctrine the callers encode (assert with `toThrowTRPCError`, registered below):
//   • cross-user reads: `otherCaller` gets NOT_FOUND on someone else's entity — NEVER FORBIDDEN (a 403
//     would be an existence oracle; the domains collapse "missing" and "not yours" into one answer).
//   • admin-gated surfaces hit by a non-admin: FORBIDDEN (the caller exists; the action is gated).
//   • anonymous requests to authed surfaces: UNAUTHORIZED.
// Callers auth `via: "header"` — no cookie surface, so the CSRF gate is inert (mutations flow without
// the header; the CSRF path gets its own targeted tests at the transport mirror).

// RUNTIME-LIGHT ON PURPOSE: every test file imports this barrel, so its static runtime imports stay
// tiny (vitest + clock/ids + the light matchers). The heavy modules — `./db.ts` (drizzle-kit's
// programmatic API), `@orb/server/entry/compose` + `transport/trpc` (the whole server graph, including
// the throw-on-misconfig `foundation/env` parse-at-load), the factories (`@orb/db` schema) — are
// dynamic-imported INSIDE the fixture bodies: fixture laziness defers construction, but only a dynamic
// import defers the module graph, and a kit/ui/client unit test must not pay (or crash on) the server
// env parse. Server/db types ride in `import type` (erased).
//
// THE COST OF THAT LAZINESS IS CHARGED TO THE FIRST TEST THAT USES THE FIXTURE (vitest counts fixture
// setup inside `testTimeout`), and the server graph is seconds — so a COMPOSED-REAL file states the load
// once, in its own import list, with `import "…/support/composed-real.ts";` (#2386). That module owns the
// measurement, the rejected alternatives, and the list of graphs to keep in sync with the fixtures below.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { createCaller, RateLimitGate, Services } from "@orb/server/transport/trpc";
import { test as base } from "vitest";
import type { Clock } from "./clock.ts";
import { createFrozenClock } from "./clock.ts";
import type { SeededIds } from "./ids.ts";
import { createSeededIds } from "./ids.ts";
// Side-effect: register the custom matchers (toThrowTRPCError / toThrowProviderError) + their types.
import "./matchers.ts";

/** The server-side tRPC caller type (through the full middleware ladder). */
export type AppCaller = ReturnType<typeof createCaller>;

export interface Fixtures {
  clock: Clock;
  ids: SeededIds;
  db: Db;
  app: ServicesResult;
  services: Services;
  ownerCaller: AppCaller;
  otherCaller: AppCaller;
  adminCaller: AppCaller;
  anonCaller: AppCaller;
}

// The caller identities — FIXED ids (never the factory counters, so they can't collide with seeded
// rows) — exported for tests that assert against a caller's own userId.
export const OWNER_USER_ID = castId<UserId>("user_fixture_owner");
export const ADMIN_USER_ID = castId<UserId>("user_fixture_admin");
export const OTHER_USER_ID = castId<UserId>("user_fixture_other");

// ≥32 chars (the env floor for session-derived keys); FIXED so assertions stay deterministic.
const TEST_SESSION_SECRET = "test-session-secret-at-least-32-chars";

// No-op rate-limit gate: integration tests through these callers must not throttle as a side effect of
// the ladder; the rate-limit primitive has its own slice test (tests/server/transport/rate-limit).
const ALLOW_ALL_RATE_LIMIT: RateLimitGate = { enforce: (): Promise<void> => Promise.resolve() };

/** Seed the caller's `users` row (the FK target for everything it creates) and build its Principal. */
async function seedCallerPrincipal(db: Db, spec: { readonly id: UserId; readonly handle: Handle; readonly role: UserRole }): Promise<Principal> {
  const { seedUser } = await import("./factories/user.ts");
  const handle = castId<Handle>(spec.handle);
  await seedUser(db, { id: spec.id, handle, role: spec.role });
  return { userId: spec.id, role: spec.role, handle, externalId: null, via: "header" };
}

/** A caller over the composed graph — the REAL ladder + routers, no HTTP (createCaller is the
 *  sanctioned tRPC seam). `presence` + `sockets` are the app's OWN registries so ctx and the domain share
 *  one instance each (the cross-tenant sweep probes `stream.attach` through this caller). */
async function callerFor(app: ServicesResult, auth: Principal | null): Promise<AppCaller> {
  const transport = await import("@orb/server/transport/trpc");
  return transport.createCaller(
    transport.createContext({
      auth,
      // No cookie session on a hand-built context: the session identity's ONE consumer is the socket
      // cell's stamp (W7a), and a suite that needs it passes an explicit id through the registry.
      sessionId: null,
      services: app.services,
      rateLimit: ALLOW_ALL_RATE_LIMIT,
      presence: app.presence,
      sockets: app.sockets,
      multiHumanCapable: true,
      csrfHeaderPresent: false,
      clientIp: "127.0.0.1",
    }),
  );
}

// `({}, use)` is the vitest fixture idiom — the 1st arg MUST be an object-destructuring pattern (else
// FixtureParseError); `{}` = depends on no other fixture. noEmptyPattern is off for tests/** (biome.json
// override) precisely so this idiom needs no per-fixture suppression.
export const test = base.extend<Fixtures>({
  clock: async ({}, use): Promise<void> => {
    await use(createFrozenClock());
  },
  ids: async ({}, use): Promise<void> => {
    await use(createSeededIds());
  },
  db: async ({}, use): Promise<void> => {
    const { freshDb } = await import("./db.ts");
    await use(await freshDb());
  },
  app: async ({ db, clock }, use): Promise<void> => {
    const { createServices } = await import("@orb/server/entry/compose");
    const casDir = await mkdtemp(join(tmpdir(), "orb-fixture-cas-"));
    const variantDir = await mkdtemp(join(tmpdir(), "orb-fixture-var-"));
    const result = await createServices({
      db,
      now: (): number => clock.now(),
      ownerId: OWNER_USER_ID,
      secretBoxKey: null,
      casDir,
      variantDir,
      sessionSecret: TEST_SESSION_SECRET,
    });
    await use(result);
    await rm(casDir, { recursive: true, force: true });
    await rm(variantDir, { recursive: true, force: true });
  },
  services: async ({ app }, use): Promise<void> => {
    await use(app.services);
  },
  ownerCaller: async ({ db, app }, use): Promise<void> => {
    const auth = await seedCallerPrincipal(db, {
      id: OWNER_USER_ID,
      handle: castId<Handle>("fixture-owner"),
      role: "owner",
    });
    await use(await callerFor(app, auth));
  },
  adminCaller: async ({ db, app }, use): Promise<void> => {
    const auth = await seedCallerPrincipal(db, {
      id: ADMIN_USER_ID,
      handle: castId<Handle>("fixture-admin"),
      role: "admin",
    });
    await use(await callerFor(app, auth));
  },
  otherCaller: async ({ db, app }, use): Promise<void> => {
    const auth = await seedCallerPrincipal(db, {
      id: OTHER_USER_ID,
      handle: castId<Handle>("fixture-other"),
      role: "user",
    });
    await use(await callerFor(app, auth));
  },
  anonCaller: async ({ app }, use): Promise<void> => {
    await use(await callerFor(app, null));
  },
});

export { expect } from "vitest";
