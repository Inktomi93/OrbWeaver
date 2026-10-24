// The tRPC mount refuses an oversized batch before any procedure runs, so the refusal spends no rate-limit budget;
// an admitted batch spends one debit per call. The e2e batch cases own the wire statuses.
// @subject packages/server/src/entry/app.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import { TRPC_BATCH_MAX_ITEMS } from "@orb/contracts/rpc";
import { RATE_LIMIT_CAP_MIN } from "@orb/contracts/settings";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { signedInMember } from "./_auth-roots.ts";

const LOOPBACK = "127.0.0.1";
const TOO_MANY_REQUESTS = 429;
/** One full batch plus the smallest cap the schema admits, so the budget left after the batches is countable. */
const AUTHED_CAP = TRPC_BATCH_MAX_ITEMS + RATE_LIMIT_CAP_MIN;
const METHODS = [
  { method: "GET", path: "tag.listTags" },
  { method: "POST", path: "tag.pruneUnusedTags" },
] as const;

for (const { method, path } of METHODS) {
  test(`${method}: an overflow batch spends no budget and an admitted batch spends one debit per call`, async () => {
    await using root = await createServerHarness({ physicalPeer: () => LOOPBACK, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
    await root.services.settings.updateAppSettings({ principal: await root.principalFor(root.ownerId), partial: { rateLimits: { authed: AUTHED_CAP } } });
    const member = await signedInMember(root, castId<Handle>(`batch-budget-${method.toLowerCase()}`));
    const call = async (count: number): Promise<number> => {
      const response = await root.http.request(`/api/trpc/${Array.from({ length: count }, () => path).join(",")}?batch=1`, {
        method,
        headers: { cookie: member.cookie, ...(method === "POST" ? { [CSRF_HEADER]: "1", "content-type": "application/json" } : {}) },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      await response.arrayBuffer();
      return response.status;
    };
    expect(await call(TRPC_BATCH_MAX_ITEMS + 1)).toBe(400);
    expect(await call(TRPC_BATCH_MAX_ITEMS)).toBe(200);
    // Spend single calls until the gate refuses; the count left is what the two batches did not spend.
    let admitted = 0;
    while (admitted <= AUTHED_CAP && (await call(1)) !== TOO_MANY_REQUESTS) {
      admitted += 1;
    }
    expect(admitted).toBe(AUTHED_CAP - TRPC_BATCH_MAX_ITEMS);
  });
}
