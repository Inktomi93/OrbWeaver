// The DB-mediated ST-transcript fidelity round trip — the four planes the 2026-08-08 import-fidelity audit
// (§5.1/§5.5/§5.6 + the owner's "imported chat names are ugly" report) found landing wrong or not at all.
// Every assertion here reads a COLUMN or a ROLLUP, never an import-side shape: the REAL `importChats` verb
// runs over the REAL `createBulkImportChats` write op against a real db, and then the REAL `reconcileStats`
// reads it back the way the stats domain does in production. That is deliberate — §5.1's defect was
// invisible at every hop except the reader's `json_extract`, so a mapping-level assertion would have stayed
// green through it, and the title-collision rule is a WHOLE-RUN fact only the verb can express.
//
// The fixtures are the REAL corpus shapes (1,097-file ST profile, both user dirs): a swipe pool whose
// `swipe_info[i]` NESTS its `extra` (75,309 of 76,238 swipe entries carry `reasoning_duration` there), a
// `chat_metadata.variables` bag of strings (494 chats), the author's-note knobs (1,070 chats), and a
// filename ST wrote with 1-digit month/day and interior spaces (76 chats).
//
// Zone: every fixture resolves in the serde's `"UTC"` default, so the expected instants and the expected
// title date are fixed literals rather than host-zone-dependent.

import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, messageVariants, ownerStats } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatParticipantId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { parseChatJsonl } from "@orb/server/kit/serde/chat";
import { asc, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ChatImportContext } from "../../../../packages/server/src/domain/chat/contract/import.ts";
import { createBulkImportChats } from "../../../../packages/server/src/domain/chat/persistence/import-write.ts";
import type { ImportContext } from "../../../../packages/server/src/domain/import/context.ts";
import type { ImportChatsResult } from "../../../../packages/server/src/domain/import/contract/results.ts";
import { createImportChats } from "../../../../packages/server/src/domain/import/verbs/import-chats.ts";
import { bumpStatsCanonVersion } from "../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { reconcileStats } from "../../../../packages/server/src/domain/stats/write/rebuild-from-canon.ts";
import { freshDb } from "../../../support/db.ts";
import { seedCharacter, seedPersona, seedUser } from "../../../support/factories/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
/** The reasoning traces ST recorded on the two takes of the swiped turn (ms) — `extra.reasoning_duration`. */
const SWIPE_A_REASONING_MS = 1200;
const SWIPE_B_REASONING_MS = 900;

/** The exact spelling ST wrote for 76 of the 1,097 corpus files: 1-digit month/day, spaces inside the time. */
const UGLY_FILENAME = "Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl";
/** A SECOND transcript for the same character on the SAME calendar day (the title-collision case). */
const UGLY_FILENAME_SAME_DAY = "Emily Singleton - 2025-5-7 @23h 4m 2s 118ms.jsonl";

const CHARACTER_NAME = "Emily Singleton";

/** A deterministic counter-minted `ChatImportContext` (no ambient clock/ids under tests/). */
function importCtx(db: Db): ChatImportContext {
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    bumpStatsCanonVersion,
    now: (): number => NOW,
    newChatId: (): ChatId => castId<ChatId>(`chat_${counter()}`),
    newMessageId: (): MessageId => castId<MessageId>(`message_${counter()}`),
    newMessageVariantId: (): MessageVariantId => castId<MessageVariantId>(`message_variant_${counter()}`),
    newMessageAssetId: (): MessageAssetId => castId<MessageAssetId>(`message_asset_${counter()}`),
    newParticipantId: (): ChatParticipantId => castId<ChatParticipantId>(`chat_participant_${counter()}`),
    newChatInjectionId: (): ChatInjectionId => castId<ChatInjectionId>(`chat_injection_${counter()}`),
    filterExistingAssetIds: (): Promise<readonly AssetId[]> => Promise.resolve([]),
    mintSyntheticGroupCharacter: (): Promise<{ characterId: CharacterId }> => {
      throw new Error("st-chat-fidelity: no narrator slot in these fixtures");
    },
  };
}

/** One ST swipe_info entry, in the corpus's own NESTED shape: the take's economics live under `extra`, the
 *  timings + the per-swipe `send_date` sit beside it. */
function swipeInfo(reasoningDurationMs: number, sendDate: string): Record<string, unknown> {
  return {
    send_date: sendDate,
    gen_started: "2025-05-07T22:52:00.000Z",
    gen_finished: "2025-05-07T22:52:09.000Z",
    extra: {
      api: "openrouter",
      model: "gpt",
      reasoning: "weighing it",
      reasoning_duration: reasoningDurationMs,
      reasoning_signature: "sig",
      token_count: 40,
    },
  };
}

/** One ST chat `.jsonl`: a greeting, a user turn, and a SWIPE-BEARING assistant turn (the §5.1 shape).
 *  `metaOver` overrides the header's `chat_metadata`. */
function stChatBytes(metaOver: Record<string, unknown> = {}): string {
  const header = {
    user_name: "Nate",
    character_name: CHARACTER_NAME,
    create_date: "2025-5-7 @22h 52m 11s 856ms",
    chat_metadata: {
      // ST's `{{setvar}}`/`{{getvar}}` store — 494 corpus chats carry one; every value is a string.
      variables: { questGiver: "Marla", coins: "37" },
      // The author's note + the placement knobs ST records alongside it. Deliberately NOT the corpus's
      // overwhelming `d=4 p=1 r=0` combo: these are the 1-in-1,070 arms, so a hardcoded house register
      // cannot pass by coincidence.
      note_prompt: "Keep it tense.",
      note_depth: 2,
      // 0 = extension_prompt_types.IN_PROMPT (SOURCE-PINNED: SillyTavern `public/script.js`).
      note_position: 0,
      // 1 = extension_prompt_roles.USER.
      note_role: 1,
      note_interval: 1,
      ...metaOver,
    },
  };
  const lines = [
    JSON.stringify(header),
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "May 7, 2025 10:52pm", extra: { api: "openrouter", model: "gpt" } }),
    JSON.stringify({ is_user: true, mes: "Hi Emily!", send_date: "May 7, 2025 10:53pm", extra: { token_count: 4 } }),
    JSON.stringify({
      is_user: false,
      mes: "Take two, as rendered.",
      send_date: "May 7, 2025 10:54pm",
      // The MESSAGE-level extra of a swipe-bearing row. Pre-fix this blob was carried; the per-swipe
      // `swipe_info[i]` was carried INSTEAD, nested, so no `$.reasoning_duration` existed at the read path.
      extra: { api: "openrouter", model: "gpt", reasoning: "weighing it", reasoning_duration: SWIPE_B_REASONING_MS },
      swipes: ["Take one, discarded.", "Take two, as rendered."],
      swipe_id: 1,
      swipe_info: [swipeInfo(SWIPE_A_REASONING_MS, "May 7, 2025 10:53pm"), swipeInfo(SWIPE_B_REASONING_MS, "May 7, 2025 10:54pm")],
    }),
  ];
  return `${lines.join("\n")}\n`;
}

/** An `ImportContext` whose ONLY live op is the REAL chat bulk-import write over `db` — the card ops are
 *  inert (the chats verb must never call one) and the two post-import hooks are no-ops. `personas` is the
 *  run's name→id attribution map, exactly as the persona wave hands it to the chat wave in production. */
function stImportContext(db: Db, ownerId: UserId, personas: Map<string, PersonaId> = new Map()): ImportContext {
  const inert = (): never => {
    throw new Error("st-chat-fidelity: card op not wired (the chats verb must not call it)");
  };
  return {
    ownerId,
    createCharacter: inert,
    findByImportHash: inert,
    findByHandle: inert,
    storeAsset: inert,
    attachCardTag: inert,
    profile: {
      now: (): number => NOW,
      personaByUserName: personas,
      bulkImportChats: createBulkImportChats(importCtx(db)),
      bulkImportPersonas: inert,
      enqueueBackfill: (): Promise<boolean> => Promise.resolve(false),
      reconcileStats: (): Promise<void> => Promise.resolve(),
    },
  };
}

/** Run the REAL `importChats` verb over the REAL write op for a batch of ST files. */
async function importStChats(args: {
  db: Db;
  ownerId: UserId;
  characterId: CharacterId;
  files: readonly { name: string; text: string }[];
  /** The run's persona name→id attribution map (the persona wave's output). Absent ⇒ no personas exist. */
  personas?: Map<string, PersonaId>;
}): Promise<ImportChatsResult> {
  const { db, ownerId, characterId, files, personas } = args;
  const svc = createImportChats(stImportContext(db, ownerId, personas));
  const collected = files.map((f) => {
    const parsed = parseChatJsonl(f.text, { fileName: f.name, charDirName: CHARACTER_NAME });
    if (parsed === null) {
      throw new Error(`fixture parse failed: ${f.name}`);
    }
    return { parsed, importedFrom: f.name, importHash: `hash-${f.name}` };
  });
  return await svc({ characterId, chats: collected });
}

describe("ST chat import fidelity (the 2026-08-08 audit §5.1/§5.5/§5.6 + the ugly-title report)", () => {
  test("§5.1 — a swipe-bearing row's reasoning time survives to the stats rebuild's json_extract", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stChatBytes() }] });

    // The stored SHAPE: `reasoning_duration` is a TOP-LEVEL key of every variant metadata blob, which is the
    // one shape `rebuild-from-canon`'s `json_extract(v.metadata, '$.reasoning_duration')` can see. Pre-fix a
    // swiped row's blob was `{extra:{…}, gen_started, gen_finished}` and the path resolved to NULL.
    const swipedVariants = await db
      .select({ idx: messageVariants.idx, metadata: messageVariants.metadata })
      .from(messageVariants)
      .orderBy(asc(messageVariants.id));
    const durations = swipedVariants.flatMap((v) => {
      const d = v.metadata?.reasoning_duration;
      return typeof d === "number" ? [d] : [];
    });
    expect(durations.sort((a, b) => a - b)).toEqual([SWIPE_B_REASONING_MS, SWIPE_A_REASONING_MS].sort((a, b) => a - b));
    // Lossless: the per-swipe `send_date` ST records beside `extra` (78,407 corpus entries) still rides in the
    // blob — under the declared-opaque `importResidue` since §5.3c class 3 closed the column, because
    // flattening must not become a drop.
    expect(
      swipedVariants.some((v) => {
        const residue = v.metadata?.importResidue;
        return typeof residue === "object" && residue !== null && !Array.isArray(residue) && typeof residue["send_date"] === "string";
      }),
    ).toBe(true);

    // And the READER agrees: the rollup the owner actually sees. The selected take folds through the message
    // stream, the discarded take through the swipe stream — both reach `ownerStats.reasoningMs`.
    await reconcileStats(db, { ownerId: owner.id, now: (): number => NOW });
    const rollup = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0];
    expect(rollup?.reasoningMs).toBe(SWIPE_A_REASONING_MS + SWIPE_B_REASONING_MS);
  });

  test("§5.6 — chat_metadata.variables lands in chats.variableValues", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stChatBytes() }] });

    const row = (await db.select().from(chats))[0];
    expect(row?.variableValues).toEqual({ questGiver: "Marla", coins: "37" });
  });

  test("§5.6 — a chat with no ST variables still writes NULL (no empty bag minted)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stChatBytes({ variables: {} }) }] });

    expect((await db.select().from(chats))[0]?.variableValues).toBeNull();
  });

  test("§5.5 — the imported author's note honors ST's recorded depth/position/role", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stChatBytes() }] });

    const rows = await db.select().from(chatInjections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      content: "Keep it tense.",
      // note_position 0 = IN_PROMPT, note_role 1 = USER. Pre-fix: hardcoded `in_chat` / `system` / depth 4.
      position: "in_prompt",
      role: "user",
      // depth is meaningless off the at-depth splice, so a non-`in_chat` note lands at the column's own 0.
      depth: 0,
    });
  });

  test("§5.5 — an ST note with NO recorded knobs falls back to the house register (system @ depth 4)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const bare = stChatBytes({ note_depth: undefined, note_position: undefined, note_role: undefined, note_interval: undefined });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: bare }] });

    const rows = await db.select().from(chatInjections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system", content: "Keep it tense." });
  });

  test("§5.5 — the corpus's own dominant combo (depth 4 / in_chat / system) is unchanged", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    // 1,065 of the 1,070 note-bearing corpus chats record exactly this: it must land where it always did.
    await importStChats({
      db,
      ownerId: owner.id,
      characterId: character.id,
      files: [{ name: UGLY_FILENAME, text: stChatBytes({ note_depth: 4, note_position: 1, note_role: 0 }) }],
    });

    expect((await db.select().from(chatInjections))[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
  });

  test("the chat TITLE is a clean human name + date, not the raw ST filename", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stChatBytes() }] });

    const row = (await db.select().from(chats))[0];
    expect(row?.title).toBe("Emily Singleton — May 7, 2025");
    // …and the raw ST filename is still the provenance record, so nothing is lost by the rename.
    expect(row?.importedFrom).toBe(UGLY_FILENAME);
  });

  // §5.7 — ST's chat-bound persona pick. CORPUS-DRIVEN (whole 1,097-file profile, both user dirs, this lane):
  // the key is `chat_metadata.pinnedPersona` on 71 chats, its value is a persona NAME (`"Nate"` ×63,
  // `"Ashley"` ×8, 71/71 strings), and on ALL 71 the header `user_name` is the literal sentinel `"unused"` —
  // which is exactly why the pin matters: `personaByUserName.get("unused")` resolves nothing, so before this
  // those 71 chats imported with NO anchor persona and NO user-turn attribution at all. (583 of the 1,097
  // corpus chats carry that sentinel; the pin recovers the anchor for the 71 that also recorded a pick.)
  // ST's OWN upstream key `chat_metadata.persona` is a different field with a different vocabulary — an AVATAR
  // FILENAME, on 4 corpus chats, 2 of which also carry `pinnedPersona` — and is deliberately NOT read here.
  test("§5.7 — chat_metadata.pinnedPersona resolves the anchor persona BY NAME (user_name is the `unused` sentinel)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    // A REAL row: `chats.anchor_persona_id` is an FK, so a minted id would fail the write rather than the
    // assertion — the resolution has to land on a persona that exists.
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });
    const personas = new Map<string, PersonaId>([["nate", nate]]);
    // The real corpus header shape for a pinned chat.
    const pinned = stChatBytes({ pinnedPersona: "Nate" }).replace('"user_name":"Nate"', '"user_name":"unused"');

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: pinned }], personas });

    const row = (await db.select().from(chats))[0];
    expect(row?.anchorPersonaId).toBe(nate);
    // …and the user turn is attributed to it, which is the whole point of an anchor.
    const userRows = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userRows.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([nate]);
  });

  // §5.7 THIRD SIGNAL — the USER TURNS' own `name` stamp (#162/#163, owner-observed 2026-08-17, re-measured
  // against the owner's whole ST snapshot 2026-08-18). The pin recovers 71 chats; the sentinel covers 569 of
  // 1,083, so ~500 rooms had NO anchor and NO user-turn attribution from the two header signals alone — and
  // on the live corpus 417 of 895 imported rooms were sitting unattributed. ST stamps every line's `name`
  // with its sender at SEND time, and 468 of those sentinel chats carry a resolvable persona name there
  // (Nate ×438 · Ashley ×21 · Ash ×10 · Liam Calhoun ×4 · Yuki ×3). This is the DB-mediated proof that the
  // signal reaches all three columns: the room's pin, the host seat's active persona, and the user slot.
  test("§5.7 — a sentinel-header chat with NO pin resolves from its USER TURNS' own name stamps", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });
    const personas = new Map<string, PersonaId>([["nate", nate]]);
    // The majority corpus shape: the sentinel header, no pin, and the persona named only on the user line.
    const stamped = stChatBytes()
      .replace('"user_name":"Nate"', '"user_name":"unused"')
      .replace('{"is_user":true,"mes":"Hi Emily!"', '{"is_user":true,"name":"Nate","mes":"Hi Emily!"');

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stamped }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(nate);
    const seats = await db.select({ kind: chatParticipants.kind, activePersonaId: chatParticipants.activePersonaId }).from(chatParticipants);
    expect(seats.find((s) => s.kind === "human")?.activePersonaId).toBe(nate);
    const userRows = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userRows.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([nate]);
  });

  test("§5.7 — the PIN wins over the header user_name (ST resolves a chat lock ahead of the ambient persona)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });
    const { id: ashley } = await seedPersona(db, { ownerId: owner.id, name: "Ashley" });
    const personas = new Map<string, PersonaId>([
      ["nate", nate],
      ["ashley", ashley],
    ]);
    // Both resolvable, and they disagree: the explicit chat-bound pick is the authoritative answer.
    const pinned = stChatBytes({ pinnedPersona: "Ashley" });

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: pinned }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(ashley);
  });

  test("§5.7 — an unresolvable pin is OMITTED and REPORTED, never guessed; the header user_name still applies", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });
    const personas = new Map<string, PersonaId>([["nate", nate]]);
    // The pin names a persona this install does not have. ST itself DROPS a dangling chat lock and falls back
    // to the ambient persona (`personas.js` — `if (chat_metadata.persona && !userAvatars.includes(...)) delete`),
    // so the header `user_name` still applies. What must never happen is a guess at a near-match.
    const result = await importStChats({
      db,
      ownerId: owner.id,
      characterId: character.id,
      files: [{ name: UGLY_FILENAME, text: stChatBytes({ pinnedPersona: "Ghost" }) }],
      personas,
    });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(nate);
    expect(result.unresolvedPinnedPersonas).toEqual([{ chat: UGLY_FILENAME, persona: "Ghost" }]);
  });

  test("§5.7 — an unresolvable pin with the `unused` sentinel anchors NOTHING (no fabricated persona)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });
    const personas = new Map<string, PersonaId>([["nate", nate]]);
    const orphan = stChatBytes({ pinnedPersona: "Ghost" }).replace('"user_name":"Nate"', '"user_name":"unused"');

    const result = await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: orphan }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBeNull();
    expect(result.unresolvedPinnedPersonas).toEqual([{ chat: UGLY_FILENAME, persona: "Ghost" }]);
  });

  test("§5.7 — a chat with NO pin is unchanged: the header user_name still resolves the anchor", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: nate } = await seedPersona(db, { ownerId: owner.id, name: "Nate" });

    const result = await importStChats({
      db,
      ownerId: owner.id,
      characterId: character.id,
      files: [{ name: UGLY_FILENAME, text: stChatBytes() }],
      personas: new Map([["nate", nate]]),
    });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(nate);
    expect(result.unresolvedPinnedPersonas).toEqual([]);
  });

  test("two chats with the same character on the same DAY get a disambiguating suffix, never a merge", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    await importStChats({
      db,
      ownerId: owner.id,
      characterId: character.id,
      files: [
        { name: UGLY_FILENAME, text: stChatBytes() },
        { name: UGLY_FILENAME_SAME_DAY, text: stChatBytes({ note_prompt: "" }) },
      ],
    });

    const rows = await db.select({ title: chats.title }).from(chats).orderBy(asc(chats.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).sort()).toEqual(["Emily Singleton — May 7, 2025", "Emily Singleton — May 7, 2025 (2)"]);
  });
});
