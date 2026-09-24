// admin.restart — the verb's gates, in order: owner only, a supervisor must have started the process, and one
// restart at a time. The injected port records instead of ending the process; the confirm is typed and the router
// test owns its refusal (`tests/server/transport/trpc/routers/admin.test.ts`).

import type { UserRole } from "@orb/contracts/identity";
import { DomainConflictError, DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { describe } from "vitest";
import { createRestart } from "../../../../../packages/server/src/domain/admin/verbs/restart.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal } from "../_support.ts";

const AT = 1_750_000_000_000;

function harness(supervised: boolean): {
  readonly restart: ReturnType<typeof createRestart>;
  readonly restarts: () => number;
  readonly audits: AuditEntry[];
} {
  let restarts = 0;
  const audits: AuditEntry[] = [];
  const restart = createRestart({
    now: () => AT,
    audit: (entry): Promise<void> => {
      audits.push(entry);
      return Promise.resolve();
    },
    serverRestart: {
      supervised,
      restart: (): void => {
        restarts += 1;
      },
    },
  });
  return { restart, restarts: () => restarts, audits };
}

function caller(role: UserRole): ReturnType<typeof principal> {
  return principal(castId<UserId>(`user_${role}`), role);
}

describe("admin.restart", () => {
  test("control: the owner of a supervised server restarts it once, audited", async () => {
    const h = harness(true);
    await h.restart({ principal: caller("owner"), confirm: true });
    expect(h.restarts()).toBe(1);
    expect(h.audits.map((a) => a.action)).toEqual(["admin.restart"]);
  });

  test("an admin or a user is refused and nothing restarts", async () => {
    const h = harness(true);
    for (const role of ["admin", "user"] as const) {
      await expect(h.restart({ principal: caller(role), confirm: true }), role).rejects.toBeInstanceOf(DomainForbiddenError);
    }
    expect(h.restarts()).toBe(0);
  });

  test("without a supervisor the owner is refused with a coded error and nothing restarts", async () => {
    const h = harness(false);
    const refusal = h.restart({ principal: caller("owner"), confirm: true });
    await expect(refusal).rejects.toBeInstanceOf(DomainOperationError);
    await expect(refusal).rejects.toMatchObject({ code: "restart_unsupervised" });
    expect(h.restarts()).toBe(0);
    expect(h.audits).toEqual([]);
  });

  test("a second call while one is in flight is refused, even when both start together", async () => {
    const h = harness(true);
    const [first, second] = await Promise.allSettled([
      h.restart({ principal: caller("owner"), confirm: true }),
      h.restart({ principal: caller("owner"), confirm: true }),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second.status === "rejected" ? second.reason : second).toBeInstanceOf(DomainConflictError);
    await expect(h.restart({ principal: caller("owner"), confirm: true })).rejects.toBeInstanceOf(DomainConflictError);
    expect(h.restarts()).toBe(1);
  });
});
