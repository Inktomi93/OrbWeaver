// @subject packages/server/src/foundation/observability/rings.ts
// @subject packages/server/src/foundation/observability/audit.ts
// Two roots composed in one worker each read only their own log, request and trace rings, audit failures and
// instance id, through the production debug routes and the live socket.
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { auditLogs } from "@orb/db";
import { isPlainObject } from "@orb/kit/guards";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, withheldTable } from "@orb/testkit/node/composed";
import { z } from "zod";

const DEBUG_TOKEN = "root-isolation-debug-token";
const DEBUG_HEADERS = { "x-debug-token": DEBUG_TOKEN };
const PROBE_PATH = "/healthz";

// The debug records stay opaque; each read names only the correlation key it filters on.
const records = z.array(z.record(z.string(), z.unknown()));
const debugReads = {
  logs: z.object({ logs: records }),
  requests: z.object({ requests: records }),
  traces: z.object({ traces: records }),
  stats: z.object({ auditFailures: z.object({ count: z.number() }) }),
};

async function debugRead<T>(root: ServerTestHarness, path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await root.http.request(path, { headers: DEBUG_HEADERS });
  expect(response.status, path).toBe(200);
  return schema.parse(await response.json());
}

/** What this root's own debug surface holds for `requestId`. */
async function heldFor(root: ServerTestHarness, requestId: string): Promise<{ logs: number; requests: number; traces: number }> {
  const [logs, requests, traces] = await Promise.all([
    debugRead(root, `/api/_debug/logs?requestId=${encodeURIComponent(requestId)}`, debugReads.logs),
    debugRead(root, "/api/_debug/requests", debugReads.requests),
    debugRead(root, "/api/_debug/traces", debugReads.traces),
  ]);
  return {
    logs: logs.logs.length,
    requests: requests.requests.filter((record) => record["id"] === requestId).length,
    traces: traces.traces.filter((trace) => trace["requestId"] === requestId).length,
  };
}

/** The instance id the root's live socket announces first. */
async function announcedInstance(root: ServerTestHarness): Promise<string> {
  const caller = await root.internalCallerFor(root.ownerId);
  const { socketId } = streamConnectInputSchema.parse({ socketId: root.ids.uuid() });
  const frames = (await caller.stream.connect({ socketId }))[Symbol.asyncIterator]();
  try {
    const first = await frames.next();
    // A control frame rides the tracked envelope as its data slot.
    const frame: unknown = Array.isArray(first.value) ? first.value[1] : first.value;
    if (!isPlainObject(frame) || frame["type"] !== "serverReady" || typeof frame["serverInstanceId"] !== "string") {
      throw new Error("the live socket did not open with its serverReady frame");
    }
    return frame["serverInstanceId"];
  } finally {
    await frames.return?.();
  }
}

test("two roots in one worker keep their own log, request and trace rings, audit failures and instance id", async ({ ids }) => {
  await using first = await createServerHarness({ logLevel: "info", debugToken: DEBUG_TOKEN });
  // A second seeded sequence: two roots on one seed would mint the same instance id by construction.
  await using second = await createServerHarness({ logLevel: "info", debugToken: DEBUG_TOKEN, ids: createSeededIds(FIXTURE_ID_CURSOR) });
  const firstRequest = `root-isolation:first:${ids.uuid()}`;
  const secondRequest = `root-isolation:second:${ids.uuid()}`;

  expect((await first.http.request(PROBE_PATH, { headers: { "x-request-id": firstRequest } })).status).toBe(200);
  expect((await second.http.request(PROBE_PATH, { headers: { "x-request-id": secondRequest } })).status).toBe(200);

  expect(await heldFor(first, firstRequest)).toEqual({ logs: 1, requests: 1, traces: 1 });
  expect(await heldFor(first, secondRequest)).toEqual({ logs: 0, requests: 0, traces: 0 });
  expect(await heldFor(second, secondRequest)).toEqual({ logs: 1, requests: 1, traces: 1 });
  expect(await heldFor(second, firstRequest)).toEqual({ logs: 0, requests: 0, traces: 0 });

  {
    await using _withheld = await withheldTable(first.db, auditLogs);
    await first.app.audit({ actorUserId: first.ownerId, action: "root-isolation.probe" }, first.clock.now());
  }
  expect((await debugRead(first, "/api/_debug/db/stats", debugReads.stats)).auditFailures.count).toBe(1);
  expect((await debugRead(second, "/api/_debug/db/stats", debugReads.stats)).auditFailures.count).toBe(0);

  expect(await announcedInstance(first)).not.toBe(await announcedInstance(second));
});
