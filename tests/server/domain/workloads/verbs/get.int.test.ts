// Verb test: get — one typed row by id; a missing/poison row is a DomainNotFoundError.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeService, seedWorkloadRow } from "../_support.ts";

describe("workloads.get", () => {
  test("returns the typed row", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { kind: "compute-themes", params: { k: 3 } });
    const row = await makeService(db).get({ id, ownerId: null });
    expect(row.kind).toBe("compute-themes");
    expect(row.params).toEqual({ k: 3 });
  });

  test("a missing row is a DomainNotFoundError", async () => {
    const s = makeService(await freshDb());
    await expect(
      s.get({ id: castId<WorkloadId>("workload_absent"), ownerId: null }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
