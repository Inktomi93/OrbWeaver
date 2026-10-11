// lib/tag-model — the library's usage label treats seed tags' pending rows like the inbox does.

import type { TagWithUsage } from "@orb/contracts/tag";
import { tagUsageLabel } from "../../../packages/client/src/lib/tag-model.ts";
import { expect, test } from "../../support/fixtures.ts";

const NO_USAGE = { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 };

function label(name: string, pendingSuggestions: number): string {
  return tagUsageLabel({ name, pendingSuggestions, usage: NO_USAGE } satisfies Pick<TagWithUsage, "name" | "pendingSuggestions" | "usage">);
}

test("a seed tag's pending rows are not announced as suggestions, a plain tag's are", () => {
  expect(label("Default", 2)).toBe(label("Default", 0));
  expect(label("alpha", 2)).not.toBe(label("alpha", 0));
});
