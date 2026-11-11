// An encoder whose stored key no longer decrypts is a configuration fault, not an unbound index: the search surfaces the
// credentials error to the caller and the credential seam logs it once for the request.
// @subject packages/server/src/domain/search/substrate/space.ts
// @subject packages/server/src/domain/credentials/substrate/decrypt.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshDb, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";
import { z } from "zod";

const SEARCH_INPUT = { query: "orbital ledger", over: "entities", scope: { kind: "owner" }, topN: 5 } as const;
const OTHER_KEY = Buffer.alloc(32, 7);
const LOG_SCAN_LIMIT = 200;
// The request tag is read as a loose key: the test asks only whether the record carries one.
const REQUEST_TAG = "requestId";
const logRecordSchema = z.looseObject({ level: z.string(), msg: z.string().optional() });
const responseSchema = z.looseObject({ error: z.looseObject({ message: z.string() }) });

test("a stored key that no longer decrypts surfaces on the search and is logged once for the request", async () => {
  using fresh = await freshDb();
  await using resources = new AsyncDisposableStack();
  const first = resources.use(await createServerHarness({ db: fresh.db, secretBoxKey: SECRET_BOX_TEST_KEY }));
  const { ownerId, ids } = first;
  const principal = await first.principalFor(ownerId);
  const credential = await first.services.credentials.add({ principal, provider: "custom-openai", key: "encoder-key" });
  const encoder = await first.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "keyed-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  await first.services.connection.setBinding({ principal, task: "embed", connectionId: encoder.id });
  await first[Symbol.asyncDispose]();

  // The same database under another credentials key: the stored ciphertext no longer opens.
  const root = resources.use(
    await createServerHarness({
      db: fresh.db,
      ownerId,
      ids,
      secretBoxKey: OTHER_KEY,
      logLevel: "error",
      physicalPeer: () => "127.0.0.1",
      env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    }),
  );
  const response = await root.http.request(`/api/trpc/search.search?input=${encodeURIComponent(JSON.stringify(SEARCH_INPUT))}`);
  const { message } = responseSchema.parse(await response.json()).error;
  // The classified error's own text is on the wire and in the log; booting on the changed key probes it and logs that
  // too, outside any request, so only lines tagged with a request count.
  const requestLogs = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "error" && record.msg === message && record[REQUEST_TAG] !== undefined);
  expect(requestLogs).toHaveLength(1);
});
