// Lazy Node fixtures delegate server construction to the single production harness.
// Caller fixtures use row-derived internal authority; HTTP login/session resolution proves request admission.
// Runtime imports stay lazy so pure tests do not load the server environment or composition graph.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { createCaller, Services } from "@orb/server/transport/trpc";
import { test as base } from "vitest";
import type { Clock } from "../iso/clock.ts";
import { createFrozenClock } from "../iso/clock.ts";
import type { SeededIds } from "../iso/ids.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { CorpusHarnessOptions, CorpusServerHarness } from "./corpus.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "./server.ts";
// Side-effect: register the custom matchers (toThrowTRPCError / toThrowProviderError) + their types.
import "./matchers.ts";

/** The server-side tRPC caller type (through the full middleware ladder). */
export type AppCaller = ReturnType<typeof createCaller>;

export interface Fixtures {
  harness: ServerTestHarness;
  corpusHarness: CorpusServerHarness;
  clock: Clock;
  ids: SeededIds;
  db: Db;
  providerFetch: typeof fetch;
  networkExecution: ServerHarnessOptions["networkExecution"];
  authConfig: ServerHarnessOptions["authConfig"];
  sdkQuery: ServerHarnessOptions["sdkQuery"];
  sdkSpawn: ServerHarnessOptions["sdkSpawn"];
  runtimeSpan: ServerHarnessOptions["runtimeSpan"];
  secretBoxKey: Buffer | null;
  importStagingDir: string;
  app: ServicesResult;
  services: Services;
  ownerCaller: AppCaller;
  otherCaller: AppCaller;
  adminCaller: AppCaller;
  anonCaller: AppCaller;
}

export type { CorpusHarnessOptions, CorpusServerHarness } from "./corpus.ts";

/** Lazily delegate the runner fixture to the plain Node corpus owner. */
export async function createCorpusHarness(directory?: string, options?: CorpusHarnessOptions): Promise<CorpusServerHarness> {
  const { createCorpusHarness: open } = await import("./corpus.ts");
  return await open(directory, options);
}

// The caller identities — FIXED ids (never the factory counters, so they can't collide with seeded
// rows) — exported for tests that assert against a caller's own userId.
export const OWNER_USER_ID = castId<UserId>("user_fixture_owner");
const ADMIN_USER_ID = castId<UserId>("user_fixture_admin");
export const OTHER_USER_ID = castId<UserId>("user_fixture_other");

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

/** THE DEFAULT PROVIDER TRANSPORT FOR EVERY COMPOSED TEST — a refusal, not the network.
 *
 *  `InferenceDeps.sdkFetch` is required and `buildBackends` resolves it ONCE, synchronously, while the `app`
 *  fixture runs `createServices()` — which vitest executes BEFORE the test callback. So a
 *  `vi.spyOn(globalThis, "fetch")` inside a test body is DEAD for everything that fixture already built, and
 *  while this default was the ambient `fetch` a composed-real test reached a real listening inference engine
 *  on the box's loopback and asserted against its real answer. A refusal cannot do that silently.
 *
 *  A suite that legitimately drives the wire scripts it explicitly:
 *  `const wired = test.extend<Pick<Fixtures, "providerFetch">>({ providerFetch: async ({}, use) => { … } });`
 */
function refusingFetch(): typeof fetch {
  return (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    return Promise.reject(
      new Error(
        `support/fixtures: the composed graph attempted an unscripted provider request (${method} ${url}). ` +
          "The `providerFetch` fixture refuses real egress so a test cannot silently reach a live engine or a " +
          "hosted provider. Override `providerFetch` with a scripted fake if this call is the behaviour under test.",
      ),
    );
  };
}

// These callers exercise internal row-derived authority, not cookie/session authentication admission.
async function seedInternalCaller(
  harness: ServerTestHarness,
  spec: { readonly id: UserId; readonly handle: Handle; readonly role: UserRole },
): Promise<AppCaller> {
  const row = await harness.actor(spec);
  return await harness.internalCallerFor(row.id);
}

// `({}, use)` is the vitest fixture idiom — the 1st arg MUST be an object-destructuring pattern (else
// FixtureParseError); `{}` = depends on no other fixture. noEmptyPattern is off for tests/** (biome.json
// override) precisely so this idiom needs no per-fixture suppression.
export const test = base.extend<Fixtures>({
  corpusHarness: async ({ providerFetch, networkExecution, authConfig, sdkQuery, sdkSpawn, runtimeSpan, secretBoxKey }, use): Promise<void> => {
    await using root = await createCorpusHarness(undefined, {
      providerFetch,
      networkExecution,
      secretBoxKey,
      ...(authConfig === undefined ? {} : { authConfig }),
      ...(sdkQuery === undefined ? {} : { sdkQuery }),
      ...(sdkSpawn === undefined ? {} : { sdkSpawn }),
      ...(runtimeSpan === undefined ? {} : { runtimeSpan }),
    });
    await use(root);
  },
  clock: async ({}, use): Promise<void> => {
    await use(createFrozenClock());
  },
  ids: async ({}, use): Promise<void> => {
    await use(createSeededIds());
  },
  db: async ({}, use): Promise<void> => {
    const { freshDb } = await import("./db.ts");
    const { closeDb } = await import("@orb/db");
    await using lifetime = new AsyncDisposableStack();
    const db = await freshDb();
    lifetime.defer(() => closeDb(db));
    await use(db);
  },
  providerFetch: async ({}, use): Promise<void> => {
    await use(refusingFetch());
  },
  networkExecution: async ({}, use): Promise<void> => {
    await use(undefined);
  },
  authConfig: async ({}, use): Promise<void> => {
    await use(undefined);
  },
  sdkQuery: async ({}, use): Promise<void> => {
    await use(undefined);
  },
  sdkSpawn: async ({}, use): Promise<void> => {
    await use(undefined);
  },
  runtimeSpan: async ({}, use): Promise<void> => {
    await use(undefined);
  },
  secretBoxKey: async ({}, use): Promise<void> => {
    await use(null);
  },
  importStagingDir: async ({}, use): Promise<void> => {
    await using lifetime = new AsyncDisposableStack();
    const dir = await mkdtemp(join(tmpdir(), "orb-fixture-staging-"));
    lifetime.defer(() => rm(dir, { recursive: true, force: true }));
    await use(dir);
  },
  harness: async (
    { db, clock, ids, providerFetch, networkExecution, authConfig, sdkQuery, sdkSpawn, runtimeSpan, secretBoxKey, importStagingDir },
    use,
  ): Promise<void> => {
    const { createServerHarness } = await import("./server.ts");
    await using harness = await createServerHarness({
      db,
      clock,
      ids,
      ownerId: OWNER_USER_ID,
      secretBoxKey,
      importStagingDir,
      providerFetch,
      networkExecution,
      ...(authConfig === undefined ? {} : { authConfig }),
      ...(sdkQuery === undefined ? {} : { sdkQuery }),
      ...(sdkSpawn === undefined ? {} : { sdkSpawn }),
      ...(runtimeSpan === undefined ? {} : { runtimeSpan }),
    });
    await use(harness);
  },
  app: async ({ harness }, use): Promise<void> => {
    await use(harness.app);
  },
  services: async ({ app }, use): Promise<void> => {
    await use(app.services);
  },
  ownerCaller: async ({ harness }, use): Promise<void> => {
    await use(
      await seedInternalCaller(harness, {
        id: OWNER_USER_ID,
        handle: castId<Handle>("fixture-owner"),
        role: "owner",
      }),
    );
  },
  adminCaller: async ({ harness }, use): Promise<void> => {
    await use(
      await seedInternalCaller(harness, {
        id: ADMIN_USER_ID,
        handle: castId<Handle>("fixture-admin"),
        role: "admin",
      }),
    );
  },
  otherCaller: async ({ harness }, use): Promise<void> => {
    await use(
      await seedInternalCaller(harness, {
        id: OTHER_USER_ID,
        handle: castId<Handle>("fixture-other"),
        role: "user",
      }),
    );
  },
  anonCaller: async ({ harness }, use): Promise<void> => {
    await use(await harness.internalCallerFor(null));
  },
});

export { expect } from "vitest";
