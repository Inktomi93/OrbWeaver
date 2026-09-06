// character.list — the keyset-paged library read (core/Tier-4-Transport.md). Thin: validate the optional
// `{cursor, limit, search, starred, archived, includeTagIds, excludeTagIds}` wire shape →
// `ctx.services.character.list` with the resolved principal → return the `{items, nextCursor, totalCount}`
// page verbatim. Driven through the real ladder via `createCaller` (authed).

import type { CharacterId, TagId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterService, ListCharactersResult } from "@orb/server/domain/character";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const ACTOR = castId<UserId>("user_actor");

function emptyPage(): ListCharactersResult {
  return { items: [], nextCursor: null, totalCount: 0 };
}

describe("character.list — wire-through", () => {
  test("no input: delegates with only the resolved principal", async () => {
    const list = vi.fn<CharacterService["list"]>(async () => emptyPage());
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });

    const result = await caller(ctx).character.list();

    expect(list).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: ACTOR }) });
    expect(result).toEqual(emptyPage());
  });

  test("passes cursor + limit through verbatim when given", async () => {
    const list = vi.fn<CharacterService["list"]>(async () => emptyPage());
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });
    const cursor = {
      sort: "recent" as const,
      lastChattedAt: null,
      createdAt: 1000,
      id: castId<CharacterId>("character_00000000000000000000000000"),
    };

    await caller(ctx).character.list({ cursor, limit: 10 });

    expect(list).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: ACTOR }),
      cursor,
      limit: 10,
    });
  });

  test("omits cursor/limit from the domain call when the wire input omits them", async () => {
    const list = vi.fn<CharacterService["list"]>(async () => emptyPage());
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });

    await caller(ctx).character.list({});

    const args = list.mock.calls[0]?.[0];
    expect(args).not.toHaveProperty("cursor");
    expect(args).not.toHaveProperty("limit");
  });

  // THE LENSES (owner ruling 2026-08-13). They ride the same thin pass-through as cursor/limit: present
  // means "narrow by this", ABSENT means unfiltered — which is why an omitted `starred`/`archived` must
  // not arrive at the verb as `false` (that would silently hide every archived row from the four
  // lookup-map callers that ask for the plain library).
  test("passes the lens params through verbatim, and omits the ones the wire input omits", async () => {
    const list = vi.fn<CharacterService["list"]>(async () => emptyPage());
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });
    const tagId = castId<TagId>("tag_00000000000000000000000000");

    await caller(ctx).character.list({ search: "aria", starred: true, includeTagIds: [tagId] });

    expect(list).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: ACTOR }),
      search: "aria",
      starred: true,
      includeTagIds: [tagId],
    });
    const args = list.mock.calls[0]?.[0];
    expect(args).not.toHaveProperty("archived");
    expect(args).not.toHaveProperty("excludeTagIds");
  });

  test("returns the domain page verbatim ({items, nextCursor, totalCount})", async () => {
    const cursor = {
      sort: "recent" as const,
      lastChattedAt: 500,
      createdAt: 500,
      id: castId<CharacterId>("character_0000000000000000000000000z"),
    };
    const page: ListCharactersResult = { items: [], nextCursor: cursor, totalCount: 7 };
    const list = vi.fn<CharacterService["list"]>(async () => page);
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });

    const result = await caller(ctx).character.list();
    expect(result).toEqual(page);
  });
});

describe("character.bulkRemoveCardTag — wire-through", () => {
  test("delegates {tagName, characterIds} with the resolved principal", async () => {
    const bulkRemoveCardTag = vi.fn<CharacterService["bulkRemoveCardTag"]>(async () => ({ applied: [], failed: [] }));
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { bulkRemoveCardTag } },
    });
    const characterIds = [castId<CharacterId>("character_00000000000000000000000000")];

    await caller(ctx).character.bulkRemoveCardTag({ tagName: "hero", characterIds });

    expect(bulkRemoveCardTag).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: ACTOR }),
      tagName: "hero",
      characterIds,
    });
  });

  test("rejects a blank tag name at the wire boundary (min(1))", async () => {
    const bulkRemoveCardTag = vi.fn<CharacterService["bulkRemoveCardTag"]>(async () => ({ applied: [], failed: [] }));
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { bulkRemoveCardTag } },
    });

    await expect(
      caller(ctx).character.bulkRemoveCardTag({
        tagName: "",
        characterIds: [castId<CharacterId>("character_00000000000000000000000000")],
      }),
    ).rejects.toThrow();
    expect(bulkRemoveCardTag).not.toHaveBeenCalled();
  });
});
