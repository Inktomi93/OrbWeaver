// Verb test: cancel — the queued→cancelled / running→cancelling transitions returned to the caller.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, seedWorkloadRow } from "../_support.ts";

describe("workloads.cancel", () => {
  test("a queued row cancels outright", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "queued" });
    expect(await makeService(db).cancel({ id, ownerId: null })).toEqual({ status: "cancelled" });
  });

  test("a running row enters cancelling", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running" });
    expect(await makeService(db).cancel({ id, ownerId: null })).toEqual({ status: "cancelling" });
  });

  test("a terminal row is a no-op (null)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "succeeded" });
    expect(await makeService(db).cancel({ id, ownerId: null })).toEqual({ status: null });
  });
});
