// The active search space resolves an unrecorded owner's encoder through the owner's binding. A binding that cannot
// resolve is the no-space refusal the retrieval degrade absorbs; any other failure of the lookup surfaces as itself and is
// logged, never answered as that refusal.
// @subject packages/server/src/domain/search/substrate/space.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { connectionBindings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, withheldTable } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";
import { withRetrievalDegrade } from "#server/domain/search/index.ts";
import { UNCLASSIFIED_FAULT_MESSAGE } from "#server/transport/trpc/fault-copy.ts";

const QUERY = "orbital ledger";
const LOG_SCAN_LIMIT = 200;
const MISSING_TABLE = "no such table";
const SEARCH_INPUT = { query: QUERY, over: "entities", scope: { kind: "owner" }, topN: 5 } as const;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });
const responseSchema = z.looseObject({ error: z.looseObject({ message: z.string(), data: z.looseObject({ code: z.string() }) }) });

test("an unbound encoder is the no-space refusal, and a failed binding lookup surfaces as itself, logged once", async () => {
  await using root = await createServerHarness({
    logLevel: "error",
    physicalPeer: () => "127.0.0.1",
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.setBinding({ task: "embed", connectionId: null });
  const query = { ownerId: root.ownerId, ...SEARCH_INPUT } as const;

  // The control: the same wiring with no binding is the refusal the degrade answers with the ruled empty result.
  const unavailable = vi.fn();
  expect(await withRetrievalDegrade(() => root.services.search.search(query), { empty: null, onIndexUnavailable: unavailable })).toBeNull();
  expect(unavailable).toHaveBeenCalledOnce();

  await using _fault = await withheldTable(root.db, connectionBindings);
  const faultLogs = (): number =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.level === "error" && record.err?.message.includes(MISSING_TABLE) === true).length;
  const logsBefore = faultLogs();
  const missed = vi.fn();
  await expect(withRetrievalDegrade(() => root.services.search.search(query), { empty: null, onIndexUnavailable: missed })).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining(MISSING_TABLE) }),
  });
  expect(missed).not.toHaveBeenCalled();

  const response = await root.http.request(`/api/trpc/search.search?input=${encodeURIComponent(JSON.stringify(SEARCH_INPUT))}`);
  const { error } = responseSchema.parse(await response.json());
  expect(response.status).toBe(500);
  expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");
  expect(error.message).toBe(UNCLASSIFIED_FAULT_MESSAGE);
  expect(faultLogs() - logsBefore).toBe(1);
});

test("an encoder row whose kind drifted after it was bound reads as no space, not as a fault", async () => {
  await using root = await createServerHarness({ logLevel: "error" });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const encoder = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "drift-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "embed", connectionId: encoder.id });
  // The declaration is re-read on every resolve, so a later edit can leave the bound row unable to serve the task.
  await root.services.connection.update({ principal, connectionId: encoder.id, patch: { declared: { kind: "generation" } } });

  const unavailable = vi.fn();
  const result = await withRetrievalDegrade(() => root.services.search.search({ ownerId: root.ownerId, ...SEARCH_INPUT }), {
    empty: null,
    onIndexUnavailable: unavailable,
  });
  expect(result).toBeNull();
  expect(unavailable).toHaveBeenCalledOnce();
});
