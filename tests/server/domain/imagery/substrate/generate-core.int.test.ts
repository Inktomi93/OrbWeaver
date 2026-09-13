// substrate/runGeneration + sumCost — the spend-and-persist tail both generatePicture and editImage run
// (their round-trip through the real store/provenance path is pinned by the verb-level int tests). This
// file pins the claims the verb tests don't isolate: zero decodable images (neither base64 nor a
// successfully-fetched url) THROWS `GenerationFailedError` rather than silently returning an empty set, a
// fanned-out (n>1) generation shares ONE `createdAt` across every provenance row, and `sumCost`'s
// null-propagating sum (doc 02 §8 — an unknown component makes the total null, never a fabricated partial).

import { imageryGenerations } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { GenerationFailedError } from "@orb/server/domain/imagery";
import { describe } from "vitest";
import { runGeneration, sumCost } from "../../../../../packages/server/src/domain/imagery/substrate/generate-core.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, PNG_BYTES, principal, seedOwner } from "../_support.ts";

// @orb-waive no-test-fabrication(Parameters<typeof runGeneration>[1]): a minimal runGeneration request double — this file pins the spend/persist tail only, which never reads credential/capability internals. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const REQ = { credential: {}, model: "img-model", prompt: "test", capability: {} } as Parameters<typeof runGeneration>[1];
const PROV = {
  chatId: null,
  mode: "free" as const,
  subjectCharacterId: null,
  identityHash: null,
  prompt: "a dragon",
  negativePrompt: null,
  edited: false,
};

describe("sumCost", () => {
  test("both known sums normally", () => {
    expect(sumCost(1, 2)).toBe(3);
  });
  test("either side unknown (null) makes the WHOLE total null — never a fabricated partial", () => {
    expect(sumCost(null, 2)).toBeNull();
    expect(sumCost(1, null)).toBeNull();
    expect(sumCost(null, null)).toBeNull();
  });
});

describe("runGeneration", () => {
  test("zero decodable images (no base64, fetch returns null) throws GenerationFailedError", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [{ base64: undefined, mediaType: "image/png", url: "https://example.com/x.png" }],
          model: "img-model",
          usage: { costUsd: 0.01 },
          warnings: [],
        }),
      fetchImage: () => Promise.resolve(null),
    });

    await expect(runGeneration(ctx, REQ, { ...PROV, caller: principal(owner) })).rejects.toThrow(GenerationFailedError);
  });

  test("a fanned-out (n>1) generation shares ONE createdAt across every provenance row", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const base64 = Buffer.from(PNG_BYTES).toString("base64");
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [
            { base64, mediaType: "image/png", url: undefined },
            { base64, mediaType: "image/png", url: undefined },
          ],
          model: "img-model",
          usage: { costUsd: 0.02 },
          warnings: [],
        }),
    });

    const outcome = await runGeneration(ctx, REQ, { ...PROV, caller: principal(owner) });

    expect(outcome.images).toHaveLength(2);
    const rows = await db.select({ createdAt: imageryGenerations.createdAt }).from(imageryGenerations);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.createdAt)).size).toBe(1);
  });
});
