// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.
// biome-ignore-all lint/security/noSecrets: ST @-date tokens in the fixture filenames are not secrets.
// Mirror test for domain/import/substrate/chat-input — the pure ST→canonical mapping. This file pins the two
// TRANSLATIONS the mapper owns and nothing else writes: ST's author's-note placement vocabulary onto orb's
// injection axis (the whole matrix, including the arms the real corpus has 1 of), and the imported room's
// DISPLAY TITLE (cast/room name + the chat's own date, plus the within-run collision suffix). The DB-mediated
// proof that these reach their columns lives in `tests/server/entry/import/st-chat-fidelity.suite.int.test.ts`.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { parseChatJsonl } from "@orb/server/kit/serde/chat";
import { describe } from "vitest";
import type { CollectedChat } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import {
  buildBulkImportChatInput,
  buildGroupChatInput,
  disambiguateChatTitles,
} from "../../../../../packages/server/src/domain/import/substrate/chat-input.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const DEPS = { now: (): number => NOW, personaByUserName: new Map<string, PersonaId>() };

/** One collected ST chat whose header carries `metaOver` as its `chat_metadata`. */
function collected(fileName: string, metaOver: Record<string, unknown> = {}, characterName = "Emily Singleton"): CollectedChat {
  const header = JSON.stringify({ user_name: "Alex", character_name: characterName, create_date: "2025-5-7 @22h 52m 11s 856ms", chat_metadata: metaOver });
  const body = JSON.stringify({ is_user: false, mes: "Hello.", send_date: "May 7, 2025 10:52pm" });
  const parsed = parseChatJsonl(`${header}\n${body}\n`, { fileName, charDirName: characterName });
  if (parsed === null) {
    throw new Error(`fixture parse failed: ${fileName}`);
  }
  return { parsed, importedFrom: fileName, importHash: `hash-${fileName}` };
}

/** The ONE injection an ST note converts to, or undefined when the chat carries none. */
function noteOf(meta: Record<string, unknown>): BulkImportChatInput["injections"] extends readonly (infer R)[] | undefined ? R | undefined : never {
  return buildBulkImportChatInput(collected("Chat - 2025-5-7 @22h 52m 11s 856ms.jsonl", meta), DEPS).injections?.[0];
}

const NOTE = { note_prompt: "Keep it tense." };

describe("ST author's note → orb's injection system (owner ruling 2026-08-08)", () => {
  test("ST's position vocabulary maps onto orb's own — every arm ST can express", () => {
    // SOURCE-PINNED (SillyTavern `public/script.js` extension_prompt_types): 0 IN_PROMPT, 1 IN_CHAT,
    // 2 BEFORE_PROMPT. orb's fourth position (`in_static`) has no ST counterpart and is never minted here.
    expect(noteOf({ ...NOTE, note_position: 0 })?.position).toBe("in_prompt");
    expect(noteOf({ ...NOTE, note_position: 1 })?.position).toBe("in_chat");
    expect(noteOf({ ...NOTE, note_position: 2 })?.position).toBe("before_prompt");
  });

  test("ST's role vocabulary maps onto orb's canonical MessageRole", () => {
    // extension_prompt_roles: 0 SYSTEM, 1 USER, 2 ASSISTANT.
    expect(noteOf({ ...NOTE, note_role: 0 })?.role).toBe("system");
    expect(noteOf({ ...NOTE, note_role: 1 })?.role).toBe("user");
    expect(noteOf({ ...NOTE, note_role: 2 })?.role).toBe("assistant");
  });

  test("ST's recorded depth wins on an at-depth note; the house register fills a missing one", () => {
    expect(noteOf({ ...NOTE, note_position: 1, note_depth: 2 })?.depth).toBe(2);
    expect(noteOf({ ...NOTE, note_position: 1 })?.depth).toBe(4);
    // Depth is meaningful ONLY on the at-depth splice, so any other position stores the column's own 0
    // rather than a number no reader consults.
    expect(noteOf({ ...NOTE, note_position: 0, note_depth: 2 })?.depth).toBe(0);
  });

  test("NO knobs ⇒ the house author's-note register, unchanged (the recorded 2026-08-01 ruling's arm)", () => {
    expect(noteOf(NOTE)).toEqual({
      position: "in_chat",
      depth: 4,
      role: "system",
      content: "Keep it tense.",
      order: null,
      createdAt: Date.UTC(2025, 4, 7, 22, 52, 11),
    });
  });

  test("ST's `NONE` position — which orb's model cannot express — falls back to the house register", () => {
    // `-1 NONE` means "do not inject at all"; a `chat_injections` row is always live, so orb has no seat for
    // it. Taking orb's default keeps the TEXT (dropping a note the user wrote is the worse failure) and the
    // drop is recorded in the audit's FIX-STATUS rather than silently absorbed.
    expect(noteOf({ ...NOTE, note_position: -1 })).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    // Same for a value ST never writes (a hand-edited profile).
    expect(noteOf({ ...NOTE, note_position: 99, note_role: 99 })).toMatchObject({ position: "in_chat", role: "system" });
  });

  test("`note_interval` is DROPPED — orb's injection system has no periodic-insertion concept", () => {
    const injection = noteOf({ ...NOTE, note_interval: 7 });
    expect(Object.keys(injection ?? {}).sort()).toEqual(["content", "createdAt", "depth", "order", "position", "role"]);
  });

  test("a chat with knobs but NO note text mints no injection at all", () => {
    // The real corpus is exactly this: 1,070 chats record the knobs, ZERO carry note text.
    expect(buildBulkImportChatInput(collected("x.jsonl", { note_prompt: "", note_depth: 4, note_position: 1 }), DEPS).injections).toBeUndefined();
  });
});

describe("the imported chat's display title", () => {
  test("the cast name + the chat's own date, never the ST filename token", () => {
    const input = buildBulkImportChatInput(collected("Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl"), DEPS);
    expect(input.title).toBe("Emily Singleton — May 7, 2025");
    // The raw filename keeps its provenance seat (and stays the branch-lineage key).
    expect(input.importedFrom).toBe("Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl");
  });

  test("the title's date renders in the SAME zone the ST dates were read in", () => {
    // 22:52 Denver-local is the NEXT UTC day; the title must say the day the filename spelled, not UTC's.
    const input = buildBulkImportChatInput(collected("Emily - 2025-5-7 @22h 52m 11s 856ms.jsonl"), { ...DEPS, wallClockZone: "America/Denver" });
    expect(input.title).toBe("Emily Singleton — May 7, 2025");
  });

  test("same cast + same day ⇒ a numeric suffix, in file order, never a merge", () => {
    const titled = disambiguateChatTitles([
      buildBulkImportChatInput(collected("A - 2025-5-7 @22h 52m 11s 856ms.jsonl"), DEPS),
      buildBulkImportChatInput(collected("B - 2025-5-7 @23h 04m 02s 118ms.jsonl"), DEPS),
      buildBulkImportChatInput(collected("C - 2025-5-7 @23h 40m 09s 001ms.jsonl"), DEPS),
    ]);
    expect(titled.map((c) => c.title)).toEqual(["Emily Singleton — May 7, 2025", "Emily Singleton — May 7, 2025 (2)", "Emily Singleton — May 7, 2025 (3)"]);
    // Never a merge: three inputs, three distinct rows, each keeping its own dedup oracle.
    expect(new Set(titled.map((c) => c.importHash)).size).toBe(3);
  });

  test("a GROUP room is titled by the group's name, not the header character", () => {
    const input = buildGroupChatInput(collected("Tavern Night - 2025-5-7 @22h 52m 11s 856ms.jsonl"), {
      ...DEPS,
      roomName: "Tavern Night",
      primaryCharacterId: castId<CharacterId>("character_a"),
      roster: [],
      speakerByFile: new Map(),
      speakerByName: new Map(),
      metadata: {},
    });
    // ST writes ONE member into a group transcript's `character_name`; titling the room after it would name
    // a five-hander after one seat.
    expect(input.title).toBe("Tavern Night — May 7, 2025");
  });
});
