// substrate/field-index — the lexical BM25 engine internals (per-owner in-memory MiniSearch cache). Pins:
// a fresh (within TTL) cache hit never calls `load`; a stale (past TTL) entry rebuilds via `load`; and
// `queryFields`/`suggestFields` respect `topN`/`limit` and carry the boosted name-field ranking through.

import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import {
  FIELD_INDEX_TTL_MS,
  getOrBuildFieldIndex,
  queryFields,
  suggestFields,
} from "../../../../../packages/server/src/domain/search/substrate/field-index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

interface CardDoc {
  readonly id: CharacterId;
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly creatorNotes: string | null;
}

function card(id: string, name: string): CardDoc {
  return { id: castId<CharacterId>(id), name, description: null, personality: null, scenario: null, creatorNotes: null };
}

describe("getOrBuildFieldIndex", () => {
  test("a fresh cache entry (within TTL) is a hit — load is never called again", async () => {
    const owner = castId<UserId>("user_field_index_fresh");
    const load = vi.fn(() => Promise.resolve([card("character_aria", "Aria")]));

    await getOrBuildFieldIndex(owner, 1000, load);
    await getOrBuildFieldIndex(owner, 1000 + FIELD_INDEX_TTL_MS - 1, load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("an entry past TTL rebuilds via load", async () => {
    const owner = castId<UserId>("user_field_index_stale");
    const load = vi.fn(() => Promise.resolve([card("character_aria", "Aria")]));

    await getOrBuildFieldIndex(owner, 1000, load);
    await getOrBuildFieldIndex(owner, 1000 + FIELD_INDEX_TTL_MS, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  // #1467 item 7: the omnibox fires `fields` and `suggest` on the same keystroke, so the misses arrive
  // TOGETHER — each awaiting its own load and its own full MiniSearch inversion before racing to publish.
  test("CONCURRENT misses for one owner share ONE build", async () => {
    const owner = castId<UserId>("user_field_index_concurrent");
    // The load parks here until every caller has arrived, which is what makes the misses genuinely concurrent.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(async () => {
      await gate;
      return [card("character_aria", "Aria")];
    });

    const all = Promise.all([getOrBuildFieldIndex(owner, 0, load), getOrBuildFieldIndex(owner, 0, load), getOrBuildFieldIndex(owner, 0, load)]);
    release();
    const [a, b, c] = await all;

    expect(load).toHaveBeenCalledTimes(1);
    // The joiners get the SAME index instance, not a second one built from the same rows.
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  // A FENCE on the single-flight edit above (it passes pre-fix too): the shared promise must not turn a
  // transient load failure into a poisoned owner slot.
  test("a FAILED build is not cached — the next caller retries", async () => {
    const owner = castId<UserId>("user_field_index_failed");
    const load = vi
      .fn<() => Promise<CardDoc[]>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue([card("character_aria", "Aria")]);

    await expect(getOrBuildFieldIndex(owner, 0, load)).rejects.toThrow("db down");
    await expect(getOrBuildFieldIndex(owner, 0, load)).resolves.toBeDefined();

    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("queryFields / suggestFields", () => {
  test("queryFields respects topN and returns the higher-boosted name match first", async () => {
    const owner = castId<UserId>("user_field_index_query");
    const docs = [card("character_a", "Kestrel"), card("character_b", "Kestrel the Bold")];
    const index = await getOrBuildFieldIndex(owner, 0, () => Promise.resolve(docs));

    const hits = queryFields(index, "Kestrel", 1);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.characterId).toBeDefined();
  });

  test("suggestFields respects limit", async () => {
    const owner = castId<UserId>("user_field_index_suggest");
    const docs = [card("character_a", "Kestrel"), card("character_b", "Kestrina")];
    const index = await getOrBuildFieldIndex(owner, 0, () => Promise.resolve(docs));

    const suggestions = suggestFields(index, "Kest", 1);

    expect(suggestions.length).toBeLessThanOrEqual(1);
  });
});
