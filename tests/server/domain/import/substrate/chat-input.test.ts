// Mirror test for domain/import/substrate/chat-input — the pure ST→canonical mapping. This file pins the two
// TRANSLATIONS the mapper owns and nothing else writes: ST's author's-note placement vocabulary onto orb's
// injection axis (the whole matrix, including the arms the real corpus has 1 of), and the imported room's
// DISPLAY TITLE (cast/room name + the chat's own date, plus the within-run collision suffix). The DB-mediated
// proof that these reach their columns lives in `tests/server/entry/import/st-chat-fidelity.suite.int.test.ts`.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
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

// ── ST `/inject`-saved injections → the SAME door (the silent-gap sweep, 2026-08-15) ─────────────────────
// `chat_metadata.script_injects` rides the same extension_prompt enums the note does, so the conversion is
// the same matrix — 5 corpus chats / 6 injections were parsed to sourceMetadata and thrown away (§5.7).
describe("ST script_injects → orb's injection system", () => {
  test("a corpus-shaped inject becomes one chat_injections row through the note's own conversion", () => {
    // Verbatim corpus shape (`main_Tessa_spec_v2` — the one non-null `scan` row): position 1, depth 1, role 2.
    const injects = {
      clothes: { value: "[Relevant Informations for portraying characters clothes]", position: 1, depth: 1, scan: true, role: 2, filter: null },
    };
    const input = buildBulkImportChatInput(collected("x.jsonl", { script_injects: injects }), DEPS);
    expect(input.injections).toEqual([
      {
        position: "in_chat",
        depth: 1,
        role: "assistant",
        content: "[Relevant Informations for portraying characters clothes]",
        order: null,
        createdAt: Date.UTC(2025, 4, 7, 22, 52, 11),
      },
    ]);
  });

  test("the note comes FIRST, then the injects in ST's own key order — one prose door for both channels", () => {
    const meta = {
      note_prompt: "Keep it tense.",
      script_injects: {
        b: { value: "second", position: 0, depth: 0, scan: false, role: 0, filter: null },
        a: { value: "third", position: 2, depth: 0, scan: false, role: 1, filter: null },
      },
    };
    const input = buildBulkImportChatInput(collected("x.jsonl", meta), DEPS);
    expect(input.injections?.map((i) => i.content)).toEqual(["Keep it tense.", "second", "third"]);
    expect(input.injections?.map((i) => i.position)).toEqual(["in_chat", "in_prompt", "before_prompt"]);
    expect(input.injections?.map((i) => i.role)).toEqual(["system", "system", "user"]);
  });

  test("an inject with unrecorded/unmappable knobs takes the house register, like the note", () => {
    const injects = { x: { value: "steer", position: 99, depth: null, scan: false, role: null, filter: null } };
    const input = buildBulkImportChatInput(collected("x.jsonl", { script_injects: injects }), DEPS);
    expect(input.injections?.[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
  });
});

describe("imported variant token accounting", () => {
  test("an inspected ST token_count remains measured on its role-routed axis", () => {
    const header = JSON.stringify({ user_name: "Alex", character_name: "Aria", create_date: "May 7, 2025 10:52pm" });
    const body = JSON.stringify({ is_user: false, mes: "Hello.", send_date: "May 7, 2025 10:52pm", extra: { token_count: 7 } });
    const parsed = parseChatJsonl(`${header}\n${body}\n`, { fileName: "exact.jsonl", charDirName: "Aria" });
    if (parsed === null) {
      throw new Error("fixture parse failed");
    }
    const input = buildBulkImportChatInput({ parsed, importedFrom: "exact.jsonl", importHash: "hash-exact" }, DEPS);
    expect(input.messages[0]?.variants[0]).toMatchObject({ tokensIn: null, tokensOut: 7, tokenProvenance: "measured" });
  });

  test("a missing ST token_count estimates the raw imported text through the canonical kit path", () => {
    const input = buildBulkImportChatInput(collected("estimated.jsonl"), DEPS);
    expect(input.messages[0]?.variants[0]).toMatchObject({
      tokensIn: null,
      tokensOut: estimateTokens("Hello."),
      tokenProvenance: "estimated",
    });
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
      characterIds: [],
      mutedSeats: [],
      speakerByFile: new Map(),
      speakerByName: new Map(),
      metadata: {},
    });
    // ST writes ONE member into a group transcript's `character_name`; titling the room after it would name
    // a five-hander after one seat.
    expect(input.title).toBe("Tavern Night — May 7, 2025");
  });
});

// ── the ANCHOR PERSONA's three signals (owner ruling 2026-08-17, #163) ───────────────────────────────────
//
// A room's playing-as is resolved best-effort FROM THE TRANSCRIPT, never from whatever persona happens to be
// active in orb. The mapper's own section header carries the corpus receipts; this pins the ORDER, the
// per-turn arm, and the two refusals (no near-match; nothing rather than a guess).

const ALEX = castId<PersonaId>("persona_nate");
const ASHLEY = castId<PersonaId>("persona_ashley");
const PERSONAS = new Map<string, PersonaId>([
  ["alex", ALEX],
  ["ashley", ASHLEY],
]);
const WITH_PERSONAS = { ...DEPS, personaByUserName: PERSONAS };

/** One ST transcript with an explicit header `user_name` + per-line `name` stamps on its USER turns. */
function transcript(args: { readonly userName: string; readonly pinned?: string; readonly turnNames: readonly (string | null)[] }): CollectedChat {
  const header = JSON.stringify({
    user_name: args.userName,
    character_name: "Emily Singleton",
    create_date: "2025-5-7 @22h 52m 11s 856ms",
    chat_metadata: args.pinned === undefined ? {} : { pinnedPersona: args.pinned },
  });
  const lines = args.turnNames.map((name) =>
    JSON.stringify({ is_user: true, mes: "hi", send_date: "May 7, 2025 10:52pm", ...(name === null ? {} : { name }) }),
  );
  const parsed = parseChatJsonl([header, ...lines, ""].join("\n"), { fileName: "u.jsonl", charDirName: "Emily Singleton" });
  if (parsed === null) {
    throw new Error("fixture parse failed");
  }
  return { parsed, importedFrom: "u.jsonl", importHash: "hash-u" };
}

describe("the anchor persona — ST's three signals, in order", () => {
  test("the chat-bound PIN wins over the header user_name (ST's own 'locked persona' precedence)", () => {
    expect(buildBulkImportChatInput(transcript({ userName: "Ashley", pinned: "Alex", turnNames: ["Ashley"] }), WITH_PERSONAS).anchorPersonaId).toBe(ALEX);
  });

  test("the header user_name resolves when there is no pin", () => {
    expect(buildBulkImportChatInput(transcript({ userName: "Ashley", turnNames: [null] }), WITH_PERSONAS).anchorPersonaId).toBe(ASHLEY);
  });

  // THE #163 DEFECT. 569 of the owner's 1,083 transcripts write the sentinel `"unused"` as their header
  // `user_name` and only 71 carry a pin, so header-only resolution left ~500 rooms with no playing-as and
  // every user turn unattributed — while 468 of those same rooms stamp a resolvable persona name on their
  // user turns.
  test('a `user_name: "unused"` transcript resolves from the USER TURNS\' own name stamps', () => {
    const input = buildBulkImportChatInput(transcript({ userName: "unused", turnNames: ["Alex", "Alex"] }), WITH_PERSONAS);
    expect(input.anchorPersonaId).toBe(ALEX);
    expect(input.messages.map((m) => m.personaId)).toEqual([ALEX, ALEX]);
  });

  test("an unstamped leading turn does not stop the scan — the FIRST resolvable stamp anchors the room", () => {
    expect(buildBulkImportChatInput(transcript({ userName: "unused", turnNames: [null, "Ashley"] }), WITH_PERSONAS).anchorPersonaId).toBe(ASHLEY);
  });

  test("a turn credits its OWN persona when the author switched mid-chat; the anchor stays the first", () => {
    const input = buildBulkImportChatInput(transcript({ userName: "unused", turnNames: ["Alex", "Ashley"] }), WITH_PERSONAS);
    expect(input.anchorPersonaId).toBe(ALEX);
    expect(input.messages.map((m) => m.personaId)).toEqual([ALEX, ASHLEY]);
  });

  test("NOTHING is guessed: an unmatched name anywhere leaves the room unattributed (owner ruling)", () => {
    const input = buildBulkImportChatInput(transcript({ userName: "unused", turnNames: ["Nyako"] }), WITH_PERSONAS);
    expect(input.anchorPersonaId).toBeNull();
    expect(input.messages[0]?.personaId).toBeNull();
  });

  test("matching is case/whitespace-insensitive, and still never a near-match", () => {
    expect(buildBulkImportChatInput(transcript({ userName: "unused", turnNames: ["  ALEX "] }), WITH_PERSONAS).anchorPersonaId).toBe(ALEX);
    expect(buildBulkImportChatInput(transcript({ userName: "unused", turnNames: ["Nathan"] }), WITH_PERSONAS).anchorPersonaId).toBeNull();
  });
});
