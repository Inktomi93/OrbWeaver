// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL / group wire field names (snake_case) are the
// interchange format and appear verbatim in the fixtures.
// domain/import/verbs/import-group-chats — the ST GROUP wave. Pins the verb's own contract: members resolve by
// CARD FILENAME (never display name), the first resolved member is the room's primary and the rest are the
// roster, each assistant slot is attributed to the character that voiced it (`original_avatar` first, a
// roster-SCOPED name second, the primary as the floor), the room is born with the group's own behaviour blob,
// and isolation holds PER MEMBER and PER GROUP.

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CollectedGroup, ImportContext, ImportGroupsInput } from "@orb/server/domain/import";
import { createImportService, importFileHash, parseStGroupFile } from "@orb/server/domain/import";
import { parseChatJsonl } from "@orb/server/kit/serde/chat";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");
const ARIA = castId<CharacterId>("chr_aria");
const BRAM = castId<CharacterId>("chr_bram");
const ENC = new TextEncoder();

/** A real-shaped ST group transcript. `original_avatar` (the SPEAKING CARD'S FILENAME) is what ST stamps on
 *  every group assistant line; the Bram line deliberately omits it (the pre-group-era shape). */
const GROUP_JSONL = [
  JSON.stringify({ user_name: "Alex", character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
  JSON.stringify({ name: "Aria", is_user: false, original_avatar: "Aria.png", mes: "Aria speaks.", send_date: "2025-07-18@12h00m01s" }),
  JSON.stringify({ name: "Alex", is_user: true, mes: "Hi both!", send_date: "2025-07-18@12h00m02s" }),
  JSON.stringify({ name: "Bram", is_user: false, mes: "Bram answers.", send_date: "2025-07-18@12h00m03s" }),
  JSON.stringify({ name: "Ghost", is_user: false, original_avatar: "Ghost.png", mes: "A stranger.", send_date: "2025-07-18@12h00m04s" }),
].join("\n");

/** A real-shaped ST `groups/<id>.json`, parsed through the REAL substrate so the fixture cannot drift. */
function group(members: readonly string[], over: Record<string, unknown> = {}): CollectedGroup {
  const bytes = ENC.encode(
    JSON.stringify({
      id: "1773514134935",
      name: "Group: Aria + Bram",
      members,
      allow_self_responses: false,
      generation_mode: 0,
      disabled_members: [],
      chats: ["party-night"],
      ...over,
    }),
  );
  const parsed = parseStGroupFile(bytes, "1773514134935");
  if (parsed === null) {
    throw new Error("fixture is not a recognizable ST group");
  }
  const chatBytes = ENC.encode(GROUP_JSONL);
  const chat = parseChatJsonl(GROUP_JSONL, { fileName: "party-night.jsonl", charDirName: parsed.name });
  if (chat === null) {
    throw new Error("fixture group transcript did not parse");
  }
  return {
    parsed,
    sourceFile: "groups/1773514134935.json",
    chats: [{ parsed: chat, importedFrom: "party-night.jsonl", importHash: importFileHash(chatBytes) }],
    missingChatLeaves: [],
  };
}

interface Written {
  readonly calls: { readonly characterId: CharacterId; readonly chats: readonly BulkImportChatInput[] }[];
}

function ctxWith(written: Written, opts: { readonly throws?: boolean } = {}): ImportContext {
  const unused = (): never => {
    throw new Error("unexpected op call");
  };
  return {
    ownerId: OWNER,
    createCharacter: unused,
    findByImportHash: unused,
    findByHandle: unused,
    updateCharacter: unused,
    storeAsset: unused,
    attachCardTag: unused,
    profile: {
      now: () => 1_700_000_000_000,
      personaByUserName: new Map(),
      bulkImportChats: ({ characterId, chats }): Promise<BulkImportChatsResult> => {
        if (opts.throws === true) {
          // The shape the real write op refuses with when a seat is not the caller's.
          return Promise.reject(new Error("character not found\nchr_stranger"));
        }
        written.calls.push({ characterId, chats });
        return Promise.resolve({
          written: [],
          chatsImported: chats.length,
          chatsSkipped: 0,
          messagesImported: chats.reduce((n, c) => n + c.messages.length, 0),
          variantsImported: 0,
          branchesLinked: 0,
          realConversationWritten: true,
        });
      },
      bulkImportPersonas: unused,
      enqueueBackfill: () => Promise.resolve(),
      reconcileStats: () => Promise.resolve(),
    },
  };
}

/** The driver's post-character-wave maps: card filename → id, and card filename → display name. */
function input(groups: readonly CollectedGroup[]): ImportGroupsInput {
  return {
    groups,
    characterIdByCardFilename: new Map([
      ["Aria.png", ARIA],
      ["Bram.png", BRAM],
    ]),
    characterNameByCardFilename: new Map([
      ["Aria.png", "Aria"],
      ["Bram.png", "Bram"],
    ]),
  };
}

// ── The COLLISION fixture: two DIFFERENT cards that share one display name ────────────────────────────────
// This is the case the whole filename-keyed design exists for, and the only fixture that can tell the two
// resolution paths apart: a name match resolves "emily" to whichever seat wrote the map last (EMILY_B), while
// the filename match resolves `original_avatar: "Emily.png"` to EMILY_A. With identical display names the
// earlier fixture was structurally incapable of failing when the filename path was removed (verified by
// planting exactly that break — it stayed green).
const EMILY_A = castId<CharacterId>("chr_emily_a");
const EMILY_B = castId<CharacterId>("chr_emily_b");

const COLLIDING_JSONL = [
  JSON.stringify({ user_name: "Alex", character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
  JSON.stringify({ name: "Emily", is_user: false, original_avatar: "Emily.png", mes: "The first Emily.", send_date: "2025-07-18@12h00m01s" }),
].join("\n");

function collidingGroup(): CollectedGroup {
  const bytes = ENC.encode(JSON.stringify({ id: "g2", name: "Two Emilys", members: ["Emily.png", "Emily-2.png"], generation_mode: 0, chats: ["emilys"] }));
  const parsed = parseStGroupFile(bytes, "g2");
  if (parsed === null) {
    throw new Error("fixture is not a recognizable ST group");
  }
  const chat = parseChatJsonl(COLLIDING_JSONL, { fileName: "emilys.jsonl", charDirName: parsed.name });
  if (chat === null) {
    throw new Error("fixture group transcript did not parse");
  }
  return {
    parsed,
    sourceFile: "groups/g2.json",
    chats: [{ parsed: chat, importedFrom: "emilys.jsonl", importHash: importFileHash(ENC.encode(COLLIDING_JSONL)) }],
    missingChatLeaves: [],
  };
}

describe("importGroupChats", () => {
  test("two cards sharing a DISPLAY NAME are told apart by card filename, never by name", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    await service.importGroupChats({
      groups: [collidingGroup()],
      characterIdByCardFilename: new Map([
        ["Emily.png", EMILY_A],
        ["Emily-2.png", EMILY_B],
      ]),
      // Both cards are literally named "Emily" — exactly what ST's handle disambiguation produces.
      characterNameByCardFilename: new Map([
        ["Emily.png", "Emily"],
        ["Emily-2.png", "Emily"],
      ]),
    });

    // `original_avatar: "Emily.png"` must seat the FIRST Emily. A display-name match would seat EMILY_B here.
    expect(written.calls[0]?.chats[0]?.messages[0]?.characterId).toBe(EMILY_A);
  });

  test("seats the whole cast and attributes each assistant slot to the character that voiced it", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"])]));

    expect(result.groupsImported).toBe(1);
    expect(result.groupChatsImported).toBe(1);
    const call = written.calls[0];
    // ST's FIRST member is the room's primary; the rest are the extra roster seats, in ST's own order.
    expect(call?.characterId).toBe(ARIA);
    expect(call?.chats[0]?.roster).toEqual([BRAM]);
    // Aria resolves by `original_avatar` (the FILENAME — the identity key); Bram's line carries none so the
    // roster-scoped display name resolves it; the user slot is never character-attributed; and an off-roster
    // speaker carries NO characterId, which the write op's own contract reads as "the run's primary".
    expect(call?.chats[0]?.messages.map((m) => m.characterId)).toEqual([ARIA, undefined, BRAM, undefined]);
  });

  test("the room is born with the group's OWN behaviour blob (generation_mode → the output axis)", async () => {
    const perSpeaker: Written = { calls: [] };
    await createImportService(ctxWith(perSpeaker)).importGroupChats(input([group(["Aria.png", "Bram.png"])]));
    const narrator: Written = { calls: [] };
    await createImportService(ctxWith(narrator)).importGroupChats(input([group(["Aria.png", "Bram.png"], { generation_mode: 1 })]));

    const readOutput = (w: Written): string | undefined => (w.calls[0]?.chats[0]?.metadata as { group?: { output?: string } } | undefined)?.group?.output;
    // ST `generation_mode` 0 = swap (one speaker per turn) → per-speaker; 1 = append (the whole cast in one
    // generation) → narrator. A room that imported at the house default would lose the author's choice.
    expect(readOutput(perSpeaker)).toBe("per-speaker");
    expect(readOutput(narrator)).toBe("narrator");
  });

  test("an ORPHAN member is skipped WITH a note and the room still forms around the members that resolved", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Nobody.png"])]));

    expect(result.groupsImported).toBe(1);
    expect(result.skippedMembers).toEqual([
      { group: "Group: Aria + Bram", member: "Nobody.png", reason: "no character with that card filename in the import set or the library" },
    ]);
    expect(written.calls[0]?.chats[0]?.roster).toEqual([]);
  });

  test("a group whose members ALL fail to resolve is skipped with a reason and writes nothing", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Nobody.png"])]));

    expect(result.groupsImported).toBe(0);
    expect(result.skippedGroups).toEqual([{ group: "Group: Aria + Bram", reason: "none of its member cards resolved to an imported or existing character" }]);
    expect(written.calls).toEqual([]);
  });

  test("a thrown write is contained PER GROUP — the wave reports it and never aborts", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written, { throws: true }));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"])]));

    expect(result.groupsImported).toBe(0);
    // The refusal carries the write op's own last line, the same concision rule the card wave uses.
    expect(result.skippedGroups).toEqual([{ group: "Group: Aria + Bram", reason: "chr_stranger" }]);
  });

  test("a group with no readable transcript is skipped with its own distinct reason", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));
    const empty = { ...group(["Aria.png"]), chats: [], missingChatLeaves: ["party-night.jsonl"] };

    const result = await service.importGroupChats(input([empty]));

    expect(result.skippedGroups).toEqual([{ group: "Group: Aria + Bram", reason: "the group claimed no readable transcript under `group chats/`" }]);
    expect(written.calls).toEqual([]);
  });
});
