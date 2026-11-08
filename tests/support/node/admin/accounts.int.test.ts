// @subject tests/support/node/admin/accounts.ts
// The statement hold rides `createDb`'s `LibSqlWrap`, the seam production's OTel client wrapper uses on the same
// handle; no module is replaced. It parks the user seed an authed request starts, at its first ledger read.

import { createDbStatementHold, freshDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { readAccounts } from "./accounts.ts";

// A single-user box admits its owner from a loopback peer, so the request below is authenticated and starts the seed.
const LOOPBACK_PEER = "127.0.0.1";
const AUTH_ME_ROUTE = "/api/auth/me";
const SEED_LEDGER_READ = /user_seed_ledger/u;

test("readAccounts answers only after the seed an authed request started has settled", async () => {
  const statements = createDbStatementHold();
  using held = await freshDb(statements.wrap);
  await using root = await createServerHarness({ db: held.db, physicalPeer: () => LOOPBACK_PEER });
  const seed = statements.hold(SEED_LEDGER_READ);
  try {
    await (await root.http.request(AUTH_ME_ROUTE)).arrayBuffer();
    await seed.reached;
    let answered = false;
    const accounts = readAccounts(root).then((rows) => {
      answered = true;
      return rows;
    });
    // The positive control: the listing itself answers while the seed is parked, so only the settle can hold the read.
    const direct = await (await root.internalCallerFor(root.ownerId)).admin.listUsers();
    // One macrotask turn drains every microtask an unsettled read would still need; no timer is involved.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(direct.map(({ id }) => id)).toContain(root.ownerId);
    expect(answered).toBe(false);
    seed.release();
    expect(await accounts).toEqual(direct);
  } finally {
    seed.release();
  }
});
