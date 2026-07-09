// character.list — the keyset-paged library read (core/Tier-4-Transport.md). Thin: validate the optional
// `{cursor, limit}` wire shape → `ctx.services.character.list` with the resolved principal → return the
// `{items, nextCursor}` page verbatim. Driven through the real ladder via `createCaller` (authed).

import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterService, ListCharactersResult } from "@orb/server/domain/character";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const ACTOR = castId<UserId>("user_actor");

function emptyPage(): ListCharactersResult {
  return { items: [], nextCursor: null };
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

  test("returns the domain page verbatim ({items, nextCursor})", async () => {
    const cursor = {
      sort: "recent" as const,
      lastChattedAt: 500,
      createdAt: 500,
      id: castId<CharacterId>("character_0000000000000000000000000z"),
    };
    const page: ListCharactersResult = { items: [], nextCursor: cursor };
    const list = vi.fn<CharacterService["list"]>(async () => page);
    const ctx = makeContext({
      auth: principal("user", { userId: ACTOR }),
      services: { character: { list } },
    });

    const result = await caller(ctx).character.list();
    expect(result).toEqual(page);
  });
});
