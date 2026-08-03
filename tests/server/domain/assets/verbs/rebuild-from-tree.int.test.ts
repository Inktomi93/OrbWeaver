// verb: rebuildFromTree — disaster recovery. Load-bearing assertions:
//   • an ORPHAN BLOB gets a fresh index row (the `kind` stamped, the mime sniffed from the bytes).
//   • a blob that ALREADY has a row is counted `existing`, not re-created.
//   • rebuild does NOT emit `asset.created` (FLAG[PD-84] — the embeddings content_hash sweep re-covers it).

import { assets } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("rebuildFromTree", () => {
  test("re-derives an index row for an orphan blob (kind stamped, mime sniffed)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // An orphan blob: PNG bytes in the CAS with NO index row.
    const put = await h.ctx.cas.putBytes(owner, pngBytes(1, 2, 3), FROZEN_AT_MS);

    const result = await svc.rebuildFromTree({ kind: "avatar" });

    expect(result).toEqual({ created: 1, existing: 0 });
    const rows = await db.select().from(assets).where(eq(assets.hash, put.hash));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("avatar");
    expect(rows[0]?.mime).toBe(PNG);
    expect(rows[0]?.ownerId).toBe(owner);
    // DR does NOT emit — the embeddings content_hash catch-up sweep re-covers vectors (FLAG[PD-84]).
    expect(h.emitted).toHaveLength(0);
  });

  test("a blob that already has a row is counted existing, not re-created", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(4, 5),
      kind: "avatar",
      mime: PNG,
    });

    const result = await svc.rebuildFromTree({ kind: "avatar" });

    expect(result).toEqual({ created: 0, existing: 1 });
    // Still exactly one row for that hash (no duplicate rebuilt row).
    expect(await db.select().from(assets).where(eq(assets.hash, stored.hash))).toHaveLength(1);
  });
});
