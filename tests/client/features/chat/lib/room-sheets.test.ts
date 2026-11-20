// The room's stylesheet sources (D354): only a row a character wrote at the sandboxed step contributes, once per row, in
// canon order, and a row carries only the sources before it.
// @subject packages/client/src/features/chat/lib/room-sheets.ts

import type { RowRenderPolicy } from "@orb/client/lib";
import { ID_PREFIX, mintTypeId, mintUserId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { RoomSheetRow } from "#client/features/chat/lib/room-sheets.ts";
import { roomSheetSources, roomSheetsBefore } from "#client/features/chat/lib/room-sheets.ts";

const ids = createSeededIds();
const characterId = mintTypeId(ID_PREFIX.character, ids.next);
const plainCharacterId = mintTypeId(ID_PREFIX.character, ids.next);
const memberId = mintUserId(ids.next);

function row(seq: number, css: string, author: Partial<Pick<RoomSheetRow, "role" | "authorUserId" | "characterId">> = {}): RoomSheetRow {
  return {
    id: mintTypeId(ID_PREFIX.message, ids.next),
    seq,
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    characterId,
    content: `<style>${css}</style>\n<p class="x">Row ${String(seq)}.</p>`,
    ...author,
  };
}

// The transcript's own per-row tier: one character is held at the plain step.
const policyOf = (source: RoomSheetRow): Pick<RowRenderPolicy, "cardTier"> => ({ cardTier: source.characterId === plainCharacterId ? "tierA" : "tierB" });
const cssOf = (sources: ReturnType<typeof roomSheetSources>): readonly (readonly string[])[] =>
  sources.map((source) => source.sheets.map((sheet) => sheet.css));

test("only a row a character wrote at the sandboxed step contributes its sheets", () => {
  const sources = roomSheetSources(
    [
      row(1, ".greeting{}"),
      row(2, ".member{}", { role: "user", authorUserId: memberId, characterId: null }),
      row(3, ".system{}", { role: "system", characterId: null }),
      row(4, ".plain{}", { characterId: plainCharacterId }),
      row(5, ".persona{}", { authorUserId: memberId }),
      row(6, ".later{}"),
    ],
    policyOf,
  );
  expect(cssOf(sources)).toEqual([[".greeting{}"], [".later{}"]]);
});

test("a row read twice contributes once, the first copy read, and sources come in canon order", () => {
  const held = row(5, ".held{}");
  const sources = roomSheetSources([held, row(1, ".head{}"), { ...held, content: "<style>.stale{}</style>" }], policyOf);
  expect(cssOf(sources)).toEqual([[".head{}"], [".held{}"]]);
});

test("a row with no closed stylesheet contributes nothing, and one in code is no sheet", () => {
  const sources = roomSheetSources(
    [{ ...row(1, ""), content: "<style>.open{" }, { ...row(2, ""), content: "`<style>.sample{}</style>`" }, row(3, ".real{}")],
    policyOf,
  );
  // Positive control: the closed sheet in prose is read.
  expect(cssOf(sources)).toEqual([[".real{}"]]);
});

test("a row carries only the sources before it", () => {
  const sources = roomSheetSources([row(1, ".a{}"), row(4, ".b{}")], policyOf);
  expect(roomSheetsBefore(sources, 1)).toBeUndefined();
  expect(roomSheetsBefore(sources, 4)?.map((sheet) => sheet.css)).toEqual([".a{}"]);
  expect(roomSheetsBefore(sources, 5)?.map((sheet) => sheet.css)).toEqual([".a{}", ".b{}"]);
});
