// A query the client abandons mid-flight is not a server fault: no `trpc.unhandled` error line and no
// debug-errors entry. The same throw on a request whose client is still waiting is unmapped and still logs.
// @subject packages/server/src/transport/trpc/trpc.ts
// @subject packages/server/src/transport/trpc/error-mapping.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";

const QUERY = "/api/trpc/tag.listTagsWithUsage";
const MUTATION = "/api/trpc/tag.pruneUnusedTags";
const WRITE_FAILURE = "tag prune write failed";
const LOG_SCAN_LIMIT = 500;
const CSRF = { [CSRF_HEADER]: "1" } as const;
// The text a closed connection's abort reason carries. The product never reads it; the twin case throws the
// same text on a live request to prove the verdict comes from the signal.
const ABORT_TEXT = "Client connection prematurely closed.";
const logRecordSchema = z.looseObject({ level: z.string(), event: z.string().optional(), err: z.looseObject({ message: z.string() }).optional() });
const debugErrorsSchema = z.object({ errors: z.array(z.looseObject({ event: z.string().optional() })) });

const HARNESS_OPTIONS = {
  logLevel: "debug",
  physicalPeer: () => "127.0.0.1",
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
} as const;

function records(logLines: (limit: number) => readonly string[]): readonly z.infer<typeof logRecordSchema>[] {
  return logLines(LOG_SCAN_LIMIT).map((line) => logRecordSchema.parse(JSON.parse(line)));
}

test("a query the client abandons mid-flight logs no unhandled error and reaches no debug-errors entry", async () => {
  await using root = await createServerHarness(HARNESS_OPTIONS);
  const rejectHeld = Promise.withResolvers<never>();
  const entered = Promise.withResolvers<void>();
  const listTagsWithUsage = vi.spyOn(root.services.tag, "listTagsWithUsage").mockImplementation((): Promise<never> => {
    entered.resolve();
    return rejectHeld.promise;
  });
  try {
    const client = new AbortController();
    const request = root.http.request(QUERY, { headers: CSRF, signal: client.signal });
    await entered.promise;
    client.abort(new Error(ABORT_TEXT));
    rejectHeld.reject(new Error(ABORT_TEXT));
    await Promise.allSettled([request]);

    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.unhandled")).toEqual([]);
    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.abandoned")).toEqual([expect.objectContaining({ level: "debug" })]);
    const debug = await root.http.request("/api/_debug/errors", { headers: CSRF });
    expect(debugErrorsSchema.parse(await debug.json()).errors).toEqual([]);
  } finally {
    listTagsWithUsage.mockRestore();
  }
});

test("a mutation that fails after the client abandoned it still logs trpc.unhandled with its cause", async () => {
  await using root = await createServerHarness(HARNESS_OPTIONS);
  const rejectHeld = Promise.withResolvers<never>();
  const entered = Promise.withResolvers<void>();
  const pruneUnusedTags = vi.spyOn(root.services.tag, "pruneUnusedTags").mockImplementation((): Promise<never> => {
    entered.resolve();
    return rejectHeld.promise;
  });
  try {
    const client = new AbortController();
    const request = root.http.request(MUTATION, {
      method: "POST",
      headers: { ...CSRF, "content-type": "application/json" },
      body: "{}",
      signal: client.signal,
    });
    await entered.promise;
    client.abort(new Error(ABORT_TEXT));
    rejectHeld.reject(new Error(WRITE_FAILURE));
    await Promise.allSettled([request]);

    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.unhandled")).toEqual([
      expect.objectContaining({ level: "error", err: expect.objectContaining({ message: WRITE_FAILURE }) }),
    ]);
  } finally {
    pruneUnusedTags.mockRestore();
  }
});

test("an abandoned query's debug line carries the cause", async () => {
  await using root = await createServerHarness(HARNESS_OPTIONS);
  const rejectHeld = Promise.withResolvers<never>();
  const entered = Promise.withResolvers<void>();
  const listTagsWithUsage = vi.spyOn(root.services.tag, "listTagsWithUsage").mockImplementation((): Promise<never> => {
    entered.resolve();
    return rejectHeld.promise;
  });
  try {
    const client = new AbortController();
    const request = root.http.request(QUERY, { headers: CSRF, signal: client.signal });
    await entered.promise;
    client.abort(new Error(ABORT_TEXT));
    rejectHeld.reject(new Error(ABORT_TEXT));
    await Promise.allSettled([request]);

    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.abandoned")).toEqual([
      expect.objectContaining({ level: "debug", err: expect.objectContaining({ message: ABORT_TEXT }) }),
    ]);
  } finally {
    listTagsWithUsage.mockRestore();
  }
});

test("the same throw on a request whose client is still waiting logs trpc.unhandled and answers 500", async () => {
  await using root = await createServerHarness(HARNESS_OPTIONS);
  const listTagsWithUsage = vi.spyOn(root.services.tag, "listTagsWithUsage").mockRejectedValue(new Error(ABORT_TEXT));
  try {
    const response = await root.http.request(QUERY, { headers: CSRF });
    await response.arrayBuffer();
    expect(response.status).toBe(500);
    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.unhandled")).toEqual([expect.objectContaining({ level: "error" })]);
    expect(records(root.observability.logLines).filter((record) => record.event === "trpc.abandoned")).toEqual([]);
  } finally {
    listTagsWithUsage.mockRestore();
  }
});
