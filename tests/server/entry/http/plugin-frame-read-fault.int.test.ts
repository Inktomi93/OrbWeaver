// @subject packages/server/src/entry/http/plugin-frame.ts
// The plugin frame mint answers a plugin it cannot find with the leak-free 404 every miss shares. A failed read of the
// plugin rows is not a miss: it fails the request as a fault instead of reading as "no such plugin frame".
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import { plugins } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, withheldTable } from "@orb/testkit/node/composed";

const HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
const INTERNAL_SERVER_ERROR = 500;
const NOT_FOUND = 404;

test("an unknown plugin is the leak-free miss, and a failed plugin read is a fault", async () => {
  await using root = await createServerHarness({
    logLevel: "error",
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const mint = (): Promise<Response> =>
    Promise.resolve(
      root.http.request(PLUGIN_FRAME_ROUTE, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ pluginId: root.idSource.typeId(ID_PREFIX.plugin), surfaceId: "ledger" }),
      }),
    );

  const missed = await mint();
  expect(missed.status).toBe(NOT_FOUND);
  await missed.arrayBuffer();

  await using _fault = await withheldTable(root.db, plugins);
  const faulted = await mint();
  expect(faulted.status).toBe(INTERNAL_SERVER_ERROR);
  await faulted.arrayBuffer();
});
