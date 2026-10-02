// The ST round trip reads database columns and rollups after real
// importChats/createBulkImportChats/reconcileStats, not only mapping shapes. Nested swipe sidecars, string
// variables, independent note knobs, sentinel headers/persona pins, sender attribution, and one-
// digit/spaced filenames are synthetic fixture cases. The title collision is a whole-run property and
// stats json_extract is the load-bearing reader.
//
// Every fixture uses the serde UTC default so instants/title dates do not depend on the host zone.

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

/** Synthetic fixtures preserve the external wire grammar: nested swipe extras, independent note knobs, sentinel headers, persona pins, and sender attribution. */
const UGLY_FILENAME = "Eleni Northwell - 2024-3-6 @14h 23m 45s 123ms.jsonl";
/** A SECOND transcript for the same character on the SAME calendar day (the title-collision case). */
const UGLY_FILENAME_SAME_DAY = "Eleni Northwell - 2024-3-6 @23h 4m 2s 118ms.jsonl";

const CHARACTER_NAME = "Eleni Northwell";

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

/** One synthetic ST swipe_info entry with the external NESTED shape: the take's economics live under `extra`, the
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
    user_name: "Alex",
    character_name: CHARACTER_NAME,
    create_date: "2024-3-6 @14h 23m 45s 123ms",
    chat_metadata: {
      // ST's `{{setvar}}`/`{{getvar}}` store carries string values.
      variables: { questGiver: "Marla", coins: "37" },
      // Note placement differs from the house in_chat/depth/system default so hardcoding that register
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
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "Mar 6, 2024 10:52pm", extra: { api: "openrouter", model: "gpt" } }),
    JSON.stringify({ is_user: true, mes: "Hi Eleni!", send_date: "Mar 6, 2024 10:53pm", extra: { token_count: 4 } }),
    JSON.stringify({
      is_user: false,
      mes: "Take two, as rendered.",
      send_date: "Mar 6, 2024 10:54pm",
      // The MESSAGE-level extra of a swipe-bearing row. Pre-fix this blob was carried; the per-swipe
      // `swipe_info[i]` was carried INSTEAD, nested, so no `$.reasoning_duration` existed at the read path.
      extra: { api: "openrouter", model: "gpt", reasoning: "weighing it", reasoning_duration: SWIPE_B_REASONING_MS },
      swipes: ["Take one, discarded.", "Take two, as rendered."],
      swipe_id: 1,
      swipe_info: [swipeInfo(SWIPE_A_REASONING_MS, "Mar 6, 2024 10:53pm"), swipeInfo(SWIPE_B_REASONING_MS, "Mar 6, 2024 10:54pm")],
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
    findByName: inert,
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
    // Lossless: the per-swipe `send_date` ST records beside `extra` still rides in the
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

  test("§5.5 — depth 4 / in_chat / system placement survives unchanged", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    // Synthetic fixtures preserve the external wire grammar: nested swipe extras, independent note knobs, sentinel headers, persona pins, and sender attribution.
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
    expect(row?.title).toBe("Eleni Northwell — Mar 6, 2024");
    // …and the raw ST filename is still the provenance record, so nothing is lost by the rename.
    expect(row?.importedFrom).toBe(UGLY_FILENAME);
  });

  // pinnedPersona carries a display name even when user_name is the unused sentinel. The pin must reach
  // anchor and user-turn attribution; chat_metadata.persona is a separate avatar-filename namespace and is
  // deliberately not read here.
  test("§5.7 — chat_metadata.pinnedPersona resolves the anchor persona BY NAME (user_name is the `unused` sentinel)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    // A REAL row: `chats.anchor_persona_id` is an FK, so a minted id would fail the write rather than the
    // assertion — the resolution has to land on a persona that exists.
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const personas = new Map<string, PersonaId>([["alex", alex]]);
    // The synthetic header records an explicit persona pin.
    const pinned = stChatBytes({ pinnedPersona: "Alex" }).replace('"user_name":"Alex"', '"user_name":"unused"');

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: pinned }], personas });

    const row = (await db.select().from(chats))[0];
    expect(row?.anchorPersonaId).toBe(alex);
    // …and the user turn is attributed to it, which is the whole point of an anchor.
    const userRows = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userRows.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([alex]);
  });

  // User-turn sender names are the third signal after pin/header. Sentinel headers without pins must still
  // resolve into the room anchor, host active persona, and user slot when a sender is known.
  test("§5.7 — a sentinel-header chat with NO pin resolves from its USER TURNS' own name stamps", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const personas = new Map<string, PersonaId>([["alex", alex]]);
    // The synthetic sentinel header has no pin; only the user line names the persona.
    const stamped = stChatBytes()
      .replace('"user_name":"Alex"', '"user_name":"unused"')
      .replace('{"is_user":true,"mes":"Hi Eleni!"', '{"is_user":true,"name":"Alex","mes":"Hi Eleni!"');

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: stamped }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(alex);
    const seats = await db.select({ kind: chatParticipants.kind, activePersonaId: chatParticipants.activePersonaId }).from(chatParticipants);
    expect(seats.find((s) => s.kind === "human")?.activePersonaId).toBe(alex);
    const userRows = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userRows.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([alex]);
  });

  test("§5.7 — the PIN wins over the header user_name (ST resolves a chat lock ahead of the ambient persona)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const { id: robin } = await seedPersona(db, { ownerId: owner.id, name: "Robin" });
    const personas = new Map<string, PersonaId>([
      ["alex", alex],
      ["robin", robin],
    ]);
    // Both resolvable, and they disagree: the explicit chat-bound pick is the authoritative answer.
    const pinned = stChatBytes({ pinnedPersona: "Robin" });

    await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: pinned }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(robin);
  });

  test("§5.7 — an unresolvable pin is OMITTED and REPORTED, never guessed; the header user_name still applies", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const personas = new Map<string, PersonaId>([["alex", alex]]);
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

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(alex);
    expect(result.unresolvedPinnedPersonas).toEqual([{ chat: UGLY_FILENAME, persona: "Ghost" }]);
  });

  test("§5.7 — an unresolvable pin with the `unused` sentinel anchors NOTHING (no fabricated persona)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const personas = new Map<string, PersonaId>([["alex", alex]]);
    const orphan = stChatBytes({ pinnedPersona: "Ghost" }).replace('"user_name":"Alex"', '"user_name":"unused"');

    const result = await importStChats({ db, ownerId: owner.id, characterId: character.id, files: [{ name: UGLY_FILENAME, text: orphan }], personas });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBeNull();
    expect(result.unresolvedPinnedPersonas).toEqual([{ chat: UGLY_FILENAME, persona: "Ghost" }]);
  });

  test("§5.7 — a chat with NO pin is unchanged: the header user_name still resolves the anchor", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
    const { id: alex } = await seedPersona(db, { ownerId: owner.id, name: "Alex" });

    const result = await importStChats({
      db,
      ownerId: owner.id,
      characterId: character.id,
      files: [{ name: UGLY_FILENAME, text: stChatBytes() }],
      personas: new Map([["alex", alex]]),
    });

    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(alex);
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
    expect(rows.map((r) => r.title).sort()).toEqual(["Eleni Northwell — Mar 6, 2024", "Eleni Northwell — Mar 6, 2024 (2)"]);
  });
});
