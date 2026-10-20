import type { TagWithUsage } from "@orb/contracts/tag";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import type { TagService } from "#server/domain/tag/index.ts";
import { caller, makeContext, principal } from "../_support.ts";

const tag = {
  id: mintTypeId(ID_PREFIX.tag),
  name: "adventure",
  color: null,
  color2: null,
  source: "manual",
  folderType: "NONE",
  sortOrder: null,
  isHiddenOnCard: false,
  usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
  pendingSuggestions: 0,
} satisfies TagWithUsage;

describe("tag output boundaries", () => {
  test("keeps the complete rollup and nullable presentation fields", async () => {
    const db = await freshDb();
    const listTagsWithUsage = vi.fn<TagService["listTagsWithUsage"]>().mockResolvedValue([tag]);
    const ctx = makeContext({ auth: await principal(db, "user"), services: { tag: { listTagsWithUsage } } });
    await expect(caller(ctx).tag.listTagsWithUsage()).resolves.toEqual([tag]);
  });

  test("refuses widening on the nested usage object instead of stripping it", async () => {
    const db = await freshDb();
    const widened = { ...tag, usage: { ...tag.usage, privateOwnerCount: 7 } };
    const listTagsWithUsage = vi.fn<TagService["listTagsWithUsage"]>().mockResolvedValue([widened]);
    const ctx = makeContext({ auth: await principal(db, "user"), services: { tag: { listTagsWithUsage } } });
    await expect(caller(ctx).tag.listTagsWithUsage()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
