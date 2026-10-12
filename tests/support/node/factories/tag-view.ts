// Wire-output builders for the tag reads (`tag.listTags`, `tag.updateTag`, `tag.listTagsWithUsage`). Defaults
// parse through the contract schema; an override is spread after the parse.

import { tagViewSchema, tagWithUsageSchema } from "@orb/contracts/tag";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type TagViewWire = TrpcWireOutput<"tag.listTags">[number];
type TagWithUsageWire = TrpcWireOutput<"tag.listTagsWithUsage">[number];

/** A manual, unfiled tag shown on the card. */
export function makeTagView(overrides: Partial<TagViewWire> = {}): TagViewWire {
  return {
    ...tagViewSchema.parse({
      id: ids.next(ID_PREFIX.tag),
      name: "tag",
      color: null,
      color2: null,
      source: "manual",
      folderType: "NONE",
      sortOrder: null,
      isHiddenOnCard: false,
    }),
    ...overrides,
  };
}

/** A tag with its usage rollup; `total` follows the per-kind counts unless an override says otherwise. */
export function makeTagWithUsage(overrides: Partial<TagWithUsageWire> = {}): TagWithUsageWire {
  const usage = { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, ...overrides.usage };
  return {
    ...tagWithUsageSchema.parse({
      ...makeTagView(),
      usage: { ...usage, total: usage.characters + usage.chats + usage.worldBooks + usage.personas + usage.presets },
      pendingSuggestions: 0,
    }),
    ...overrides,
  };
}
