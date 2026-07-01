// Verb test: start — enqueue, the re-parse defense, and the single-active conflict translation.

import { DomainConflictError } from "@orb/kit/errors";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService } from "../_support.ts";

describe("workloads.start", () => {
  test("enqueues a queued row", async () => {
    const s = makeService(await freshDb());
    const { id } = await s.start({ input: { kind: "reconcile-stats", params: {} }, ownerId: null });
    const row = await s.get({ id, ownerId: null });
    expect(row.status).toBe("queued");
    expect(row.kind).toBe("reconcile-stats");
  });

  test("a second active row of the same kind is a DomainConflictError", async () => {
    const s = makeService(await freshDb());
    await s.start({ input: { kind: "reconcile-stats", params: {} }, ownerId: null });
    await expect(
      s.start({ input: { kind: "reconcile-stats", params: {} }, ownerId: null }),
    ).rejects.toBeInstanceOf(DomainConflictError);
  });

  test("re-parses params (defense in depth) — an invalid param is rejected", async () => {
    const s = makeService(await freshDb());
    await expect(
      s.start({ input: { kind: "compute-themes", params: { k: -1 } }, ownerId: null }),
    ).rejects.toThrow();
  });
});
