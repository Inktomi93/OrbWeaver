// curatedShortlistEntries — the max-pro-sub cold-cache fallback: the curated Claude shortlist projected
// into picker-shape entries with `origin: "curated"`. Pins the projection (id/label carried, tag stamped)
// and that it mirrors CHAT_MODELS 1:1 (the cold-cache fallback never drops or invents an entry).

import { describe } from "vitest";
import { CHAT_MODELS } from "../../../../../packages/server/src/domain/connection/catalog/chat-models.ts";
import { curatedShortlistEntries } from "../../../../../packages/server/src/domain/connection/substrate/curated-shortlist.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("curatedShortlistEntries", () => {
  test("projects every curated CHAT_MODELS entry, id/label carried verbatim, tagged curated", () => {
    const entries = curatedShortlistEntries();
    expect(entries).toHaveLength(CHAT_MODELS.length);
    expect(entries).toEqual(CHAT_MODELS.map((m) => ({ id: m.id, label: m.label, origin: "curated" })));
  });

  test("every entry is tagged origin: curated (the picker's cold-cache-fallback discriminator)", () => {
    for (const entry of curatedShortlistEntries()) {
      expect(entry.origin).toBe("curated");
    }
  });
});
