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
  JSON.stringify({ user_name: "Nate", character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
  JSON.stringify({ name: "Aria", is_user: false, original_avatar: "Aria.png", mes: "Aria speaks.", send_date: "2025-07-18@12h00m01s" }),
  JSON.stringify({ name: "Nate", is_user: true, mes: "Hi both!", send_date: "2025-07-18@12h00m02s" }),
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
          identities: [],
          written: [],
          chatsImported: chats.length,
          chatsSkipped: 0,
          messagesImported: chats.reduce((n, c) => n + c.messages.length, 0),
          variantsImported: 0,
          branchesLinked: 0,
          realConversationWritten: true,
          chatsPersonaHealed: 0,
        });
      },
      bulkImportPersonas: unused,
      enqueueBackfill: () => Promise.resolve(true),
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
  JSON.stringify({ user_name: "Nate", character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
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

  // #1469 item 5 — `speakerByName` was built with a bare `.set(name, id)` over the seated cast, so two
  // same-named cards COLLAPSED to whichever seat wrote last, and a pre-group-era line carrying only a name
  // was then attributed to the WRONG character deterministically and silently. An ambiguous name must
  // resolve to nobody (the write op's documented "absent ⇒ the run's primary") and be REPORTED.
  test("a display name shared by two seated cards attributes NOBODY and is reported as ambiguous", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));
    // The same two-Emily room, but the line carries NO `original_avatar` — the pre-group-era export shape,
    // the only case the name fallback exists for.
    const jsonl = [
      JSON.stringify({ user_name: "Nate", character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
      JSON.stringify({ name: "Emily", is_user: false, mes: "Which Emily?", send_date: "2025-07-18@12h00m01s" }),
    ].join("\n");
    const bytes = ENC.encode(JSON.stringify({ id: "g3", name: "Two Emilys", members: ["Emily.png", "Emily-2.png"], generation_mode: 0, chats: ["emilys"] }));
    const parsed = parseStGroupFile(bytes, "g3");
    const chat = parseChatJsonl(jsonl, { fileName: "emilys.jsonl", charDirName: "Two Emilys" });
    if (parsed === null || chat === null) {
      throw new Error("fixture did not parse");
    }

    const result = await service.importGroupChats({
      groups: [
        {
          parsed,
          sourceFile: "groups/g3.json",
          chats: [{ parsed: chat, importedFrom: "emilys.jsonl", importHash: importFileHash(ENC.encode(jsonl)) }],
          missingChatLeaves: [],
        },
      ],
      characterIdByCardFilename: new Map([
        ["Emily.png", EMILY_A],
        ["Emily-2.png", EMILY_B],
      ]),
      characterNameByCardFilename: new Map([
        ["Emily.png", "Emily"],
        ["Emily-2.png", "Emily"],
      ]),
    });

    // No characterId is proposed: the slot falls through to the room's primary rather than being assigned to
    // the LAST same-named seat (which is what the collapsing map did).
    expect(written.calls[0]?.chats[0]?.messages[0]?.characterId).toBeUndefined();
    expect(result.ambiguousSpeakerNames).toEqual([{ group: "Two Emilys", name: "Emily", seats: 2 }]);
  });

  test("a UNIQUE display name still resolves by name — the fallback is narrowed, not removed", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"])]));

    // Bram's line carries no `original_avatar`; his name is unique in this room, so it still seats him.
    expect(written.calls[0]?.chats[0]?.messages[2]?.characterId).toBe(BRAM);
    expect(result.ambiguousSpeakerNames).toEqual([]);
  });

  // #1469 item 4 → #1687. The seating ruling (contract/views.ts: "still seated — the room's cast is the
  // cast") is preserved; its INPUT changed. #1469 could only REPORT the mute as lost because the bulk-import
  // wire had no knob channel; the wire now carries `seatKnobs`, so the seat lands MUTED and the report says
  // the flag travelled.
  test("a member ST had DISABLED is still seated, and the mute TRAVELS as a per-seat knob (#1687)", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"], { disabled_members: ["Bram.png"] })]));

    // The cast is unchanged — Bram keeps his seat (the recorded ruling)…
    expect(written.calls[0]?.chats[0]?.roster).toEqual([BRAM]);
    // …and the write op is handed the mute for exactly that seat (the knob the room is born with).
    expect(written.calls[0]?.chats[0]?.seatKnobs).toEqual([{ characterId: BRAM, disabled: true }]);
    expect(result.seatedDisabledMembers).toEqual([{ group: "Group: Aria + Bram", member: "Bram.png" }]);
  });

  test("a DISABLED member whose card never resolved is a skipped member, never a phantom muted seat", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    // "Ghost.png" is in neither the import set nor the library, and ST had it disabled.
    const result = await service.importGroupChats(input([group(["Aria.png", "Ghost.png"], { disabled_members: ["Ghost.png"] })]));

    expect(result.skippedMembers.map((m) => m.member)).toEqual(["Ghost.png"]);
    // Claiming a seat that does not exist was muted would be a lie the write op would refuse anyway.
    expect(result.seatedDisabledMembers).toEqual([]);
    expect(written.calls[0]?.chats[0]?.seatKnobs).toBeUndefined();
  });

  test("the PRIMARY seat is mutable too — ST disables by position, and position 0 is a position", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"], { disabled_members: ["Aria.png"] })]));

    // Aria is the room's primary (first resolved member); the knob names her all the same.
    expect(written.calls[0]?.chats[0]?.seatKnobs).toEqual([{ characterId: ARIA, disabled: true }]);
    expect(result.seatedDisabledMembers).toEqual([{ group: "Group: Aria + Bram", member: "Aria.png" }]);
  });

  test("a group with no disabled members reports an empty list, never a missing one, and carries NO knobs", async () => {
    const written: Written = { calls: [] };
    const service = createImportService(ctxWith(written));

    const result = await service.importGroupChats(input([group(["Aria.png", "Bram.png"])]));

    expect(result.seatedDisabledMembers).toEqual([]);
    // ABSENT, not an empty array: the field's contract says absent ⇒ every seat takes the column defaults,
    // which is byte-identically the pre-#1687 row.
    expect(written.calls[0]?.chats[0]?.seatKnobs).toBeUndefined();
  });
});
