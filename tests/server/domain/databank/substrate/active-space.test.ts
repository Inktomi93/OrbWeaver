// substrate/active-space — the owner's active embed-space model tag for a chunk-count read. The ONE thing it
// owns is the NULL arm: an owner with no `embed` binding must read the EMPTY tag, because no stored chunk
// carries it and the count is then honestly zero. Returning the owner's last-known model, or throwing, would
// each make the eight count readers lie in a different way — the empty string is load-bearing, not a default.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { NO_EMBED_SPACE_MODEL } from "../../../../../packages/server/src/domain/databank/contract/service.ts";
import { activeSpaceModel } from "../../../../../packages/server/src/domain/databank/substrate/active-space.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_a");

test("answers the bound space's model tag", async () => {
  const ctx = { getActiveEmbedSpace: () => Promise.resolve({ model: "jinaai/jina-clip-v2", dim: 1024 }) };
  expect(await activeSpaceModel(ctx, OWNER)).toBe("jinaai/jina-clip-v2");
});

test("an owner with NO embed binding reads the empty tag — the count is honestly zero, never a throw", async () => {
  const ctx = { getActiveEmbedSpace: () => Promise.resolve(null) };
  expect(await activeSpaceModel(ctx, OWNER)).toBe(NO_EMBED_SPACE_MODEL);
  expect(NO_EMBED_SPACE_MODEL, "no stored chunk can carry this tag — that is why it reads zero").toBe("");
});

test("the read is PER OWNER — the id it was asked about is the id it asks with", async () => {
  const asked: UserId[] = [];
  const ctx = {
    getActiveEmbedSpace: (ownerId: UserId): Promise<{ model: string; dim: number } | null> => {
      asked.push(ownerId);
      return Promise.resolve({ model: "m", dim: 1024 });
    },
  };
  await activeSpaceModel(ctx, OWNER);
  expect(asked).toEqual([OWNER]);
});
