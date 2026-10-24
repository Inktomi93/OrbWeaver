// The tRPC mount refuses an oversized batch before any procedure runs, so the refusal debits no rate-limit budget;
// an admitted batch debits the caller's general bucket once per call. The e2e batch cases own the wire statuses.
// @subject packages/server/src/entry/app.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import { TRPC_BATCH_MAX_ITEMS } from "@orb/contracts/rpc";
import { rateLimitBuckets } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { like, sum } from "drizzle-orm";
import { signedInMember } from "./_auth-roots.ts";

const LOOPBACK = "127.0.0.1";
/** The authed per-user bucket every admitted procedure call debits (`entry/rate-limit-gate.ts`). */
const GENERAL_SCOPE = "general";
const METHODS = [
  { method: "GET", path: "tag.listTags" },
  { method: "POST", path: "tag.pruneUnusedTags" },
] as const;

async function generalBudgetSpent(root: ServerTestHarness, userId: UserId): Promise<number> {
  const [row] = await root.db
    .select({ spent: sum(rateLimitBuckets.count).mapWith(Number) })
    .from(rateLimitBuckets)
    .where(like(rateLimitBuckets.key, `${GENERAL_SCOPE}:${userId}:%`));
  return row?.spent ?? 0;
}

for (const { method, path } of METHODS) {
  test(`${method}: an overflow batch spends no budget and an admitted batch spends one debit per call`, async () => {
    await using root = await createServerHarness({ physicalPeer: () => LOOPBACK, authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
    const member = await signedInMember(root, castId<Handle>(`batch-budget-${method.toLowerCase()}`));
    const batch = async (count: number): Promise<{ readonly status: number; readonly spent: number }> => {
      const before = await generalBudgetSpent(root, member.id);
      const response = await root.http.request(`/api/trpc/${Array.from({ length: count }, () => path).join(",")}?batch=1`, {
        method,
        headers: { cookie: member.cookie, ...(method === "POST" ? { [CSRF_HEADER]: "1", "content-type": "application/json" } : {}) },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      await response.arrayBuffer();
      return { status: response.status, spent: (await generalBudgetSpent(root, member.id)) - before };
    };
    expect(await batch(TRPC_BATCH_MAX_ITEMS + 1)).toEqual({ status: 400, spent: 0 });
    expect(await batch(TRPC_BATCH_MAX_ITEMS)).toEqual({ status: 200, spent: TRPC_BATCH_MAX_ITEMS });
  });
}
