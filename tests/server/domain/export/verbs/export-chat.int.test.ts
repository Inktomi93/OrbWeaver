// verb: exportChat (PD-42) — the transcript OUT against a real db. Load-bearing pins: the D29 HOST gate
// (non-host / non-member / missing chat all collapse to null); the D26 mapping (content from the SELECTED
// variant; the full variant set = the swipe array); the D28 primary-character name + anchor-persona name;
// the roomOverrides.authorsNote → note_prompt + parentChatId → main_chat round-trip; the txt format.

import type { Db } from "@orb/db";
import { chatParticipants, chats, messages, messageVariants, personas } from "@orb/db";
import type { ChatId, ChatParticipantId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createExportChat } from "../../../../../packages/server/src/domain/export/verbs/export-chat.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

const FROZEN_AT = 1_750_000_000_000;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedChatRow(
  key: string,
  over: {
    title?: string;
    anchorPersonaId?: PersonaId;
    parentChatId?: ChatId;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<ChatId> {
  const id = castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({
    id,
    title: over.title ?? null,
    anchorPersonaId: over.anchorPersonaId ?? null,
    parentChatId: over.parentChatId ?? null,
    // The typed metadata blob (tests inject raw — the read seam tolerates it).
    metadata: (over.metadata ?? null) as never,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

async function seedMember(
  chatId: ChatId,
  key: string,
  actor: { userId?: UserId; characterId?: string; role?: "host" | "member"; leftSeq?: number },
): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${key}`),
    chatId,
    kind: actor.userId !== undefined ? "human" : "character",
    userId: actor.userId ?? null,
    characterId: (actor.characterId ?? null) as never,
    role: actor.role ?? "member",
    joinSeq: 0,
    joinedAt: FROZEN_AT,
    // leftSeq set = a DEPARTED row (leave horizon stamped); null = present.
    leftSeq: actor.leftSeq ?? null,
  });
}

// A canon slot + its variants; `selectedIdx` picks the pointer (default: the last variant). The optional
// `characterId`/`personaId` stamp the speaker (Part III group fidelity — each turn resolves to its own name).
async function seedSlot(args: {
  chatId: ChatId;
  key: string;
  seq: number;
  role: MessageRole;
  variantContents: string[];
  selectedIdx?: number;
  characterId?: string;
  personaId?: PersonaId;
  authorUserId?: UserId;
}): Promise<void> {
  const messageId = castId<MessageId>(`message_${args.key}`);
  await db.insert(messages).values({
    id: messageId,
    chatId: args.chatId,
    seq: args.seq,
    role: args.role,
    characterId: (args.characterId ?? null) as never,
    personaId: args.personaId ?? null,
    authorUserId: args.authorUserId ?? null,
    createdAt: FROZEN_AT,
  });
  const ids = args.variantContents.map((_c, i) => castId<MessageVariantId>(`variant_${args.key}_${i}`));
  await db.insert(messageVariants).values(
    args.variantContents.map((content, i) => ({
      id: ids[i] as MessageVariantId,
      messageId,
      idx: i,
      content,
      model: `m${i}`,
      tokensOut: i + 1,
      createdAt: FROZEN_AT,
    })),
  );
  const chosen = ids[args.selectedIdx ?? ids.length - 1];
  await db.update(messages).set({ selectedVariantId: chosen }).where(eq(messages.id, messageId));
}

describe("exportChat — D29 host gate", () => {
  test("a member (non-host), a non-member, and a missing chat all collapse to null", async () => {
    const { ctx } = makeHarness(db);
    const host = await seedUser(db, { handle: "host" });
    const member = await seedUser(db, { handle: "member" });
    const outsider = await seedUser(db, { handle: "outsider" });
    const chatId = await seedChatRow("a");
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "m", { userId: member, role: "member" });
    const exportChat = createExportChat(ctx);

    expect(await exportChat({ principal: principal(member), chatId })).toBeNull();
    expect(await exportChat({ principal: principal(outsider), chatId })).toBeNull();
    expect(await exportChat({ principal: principal(host), chatId: castId<ChatId>("chat_missing") })).toBeNull();
    expect(await exportChat({ principal: principal(host), chatId })).not.toBeNull();
  });

  test("a DEPARTED ex-host (leftSeq set) is refused; the PRESENT host still exports", async () => {
    // nominate → old host leaves (sole-host-leave keeps role='host', stamps leftSeq) → nominee accepts
    // (demotes only the PRESENT host) leaves TWO role='host' rows: one departed, one present. Without the
    // `leftSeq IS NULL` belt the departed ex-host kept permanent bulk-export access (s4 F3).
    const { ctx } = makeHarness(db);
    const exHost = await seedUser(db, { handle: "exhost" });
    const newHost = await seedUser(db, { handle: "newhost" });
    const chatId = await seedChatRow("dep");
    // The departed host: still role='host', but leftSeq stamped → NOT present.
    await seedMember(chatId, "old", { userId: exHost, role: "host", leftSeq: 5 });
    // The present host after the handoff accept.
    await seedMember(chatId, "new", { userId: newHost, role: "host" });
    const exportChat = createExportChat(ctx);

    // The departed ex-host is refused (leak-free null), even though a role='host' row bearing their id exists.
    expect(await exportChat({ principal: principal(exHost), chatId })).toBeNull();
    // The present host is unaffected.
    expect(await exportChat({ principal: principal(newHost), chatId })).not.toBeNull();
  });
});

describe("exportChat — the D26/D28 assembly", () => {
  test("jsonl: selected-variant content + swipe arrays >1; names + note/branch round-trip; filename", async () => {
    const { ctx } = makeHarness(db);
    const host = await seedUser(db, { handle: "host" });
    const aria = await seedCharacter(db, { ownerId: host, name: "Aria", handle: "aria" });
    const personaId = castId<PersonaId>("persona_nate");
    await db.insert(personas).values({
      id: personaId,
      ownerId: host,
      name: "Alex",
      description: "d",
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    const parentId = await seedChatRow("parent");
    await db.update(chats).set({ importedFrom: "origin.jsonl" }).where(eq(chats.id, parentId));
    const chatId = await seedChatRow("a", {
      title: "Noir Night",
      anchorPersonaId: personaId,
      parentChatId: parentId,
      metadata: { roomOverrides: { authorsNote: "keep it noir" } },
    });
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "c", { characterId: aria });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hi"] });
    await seedSlot({
      chatId,
      key: "a1",
      seq: 2,
      role: "assistant",
      variantContents: ["take one", "take two"],
      selectedIdx: 1,
    });

    const out = await createExportChat(ctx)({ principal: principal(host), chatId });
    expect(out).not.toBeNull();
    expect(out?.filename).toBe("Aria-Noir_Night.jsonl");
    const lines = (out?.text ?? "").trim().split("\n");
    expect(lines).toHaveLength(3);
    const header = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(header["character_name"]).toBe("Aria");
    expect(header["user_name"]).toBe("Alex");
    expect(header["chat_metadata"]).toEqual({
      // biome-ignore lint/style/useNamingConvention: the ST wire keys are snake_case by format.
      main_chat: "origin.jsonl",
      // biome-ignore lint/style/useNamingConvention: the ST wire keys are snake_case by format.
      note_prompt: "keep it noir",
    });
    const userLine = JSON.parse(lines[1] ?? "") as Record<string, unknown>;
    expect(userLine["name"]).toBe("Alex");
    expect(userLine["is_user"]).toBe(true);
    expect(userLine["mes"]).toBe("hi");
    expect(userLine["swipes"]).toBeUndefined();
    const assistantLine = JSON.parse(lines[2] ?? "") as Record<string, unknown>;
    // The SELECTED variant is the primary contribution (D26); the full set is the swipe array.
    expect(assistantLine["mes"]).toBe("take two");
    expect(assistantLine["swipes"]).toEqual(["take one", "take two"]);
    expect(assistantLine["swipe_id"]).toBe(1);
  });

  test("jsonl: a task-#22 {prompt, depth, role} authorsNote directive exports its prompt as note_prompt", async () => {
    const { ctx } = makeHarness(db);
    const host = await seedUser(db, { handle: "host" });
    const aria = await seedCharacter(db, { ownerId: host, name: "Aria", handle: "aria" });
    const chatId = await seedChatRow("a", {
      title: "Noir Night",
      // The widened room note is the injection directive; export reads the prompt text off either shape.
      metadata: {
        roomOverrides: { authorsNote: { prompt: "keep it tense", depth: 2, role: "user" } },
      },
    });
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "c", { characterId: aria });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hi"] });

    const out = await createExportChat(ctx)({ principal: principal(host), chatId });
    expect(out).not.toBeNull();
    const header = JSON.parse((out?.text ?? "").trim().split("\n")[0] ?? "") as Record<string, unknown>;
    // biome-ignore lint/style/useNamingConvention: the ST wire key is snake_case by format.
    expect(header["chat_metadata"]).toMatchObject({ note_prompt: "keep it tense" });
  });

  test("txt: active-variant transcript with author labels", async () => {
    const { ctx } = makeHarness(db);
    const host = await seedUser(db, { handle: "host" });
    const aria = await seedCharacter(db, { ownerId: host, name: "Aria", handle: "aria" });
    const chatId = await seedChatRow("a");
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "c", { characterId: aria });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hi"] });
    await seedSlot({
      chatId,
      key: "a1",
      seq: 2,
      role: "assistant",
      variantContents: ["take one", "take two"],
      selectedIdx: 1,
    });

    const out = await createExportChat(ctx)({
      principal: principal(host),
      chatId,
      format: "txt",
    });
    expect(out?.filename).toBe("Aria-chat.txt");
    // No anchor persona + no per-row persona → the user label falls back to "User"; ACTIVE variant only.
    expect(out?.text).toBe("User: hi\n\nAria: take two\n");
  });

  test("GROUP fidelity: each assistant turn exports under ITS OWN character, not the header primary", async () => {
    const { ctx } = makeHarness(db);
    const host = await seedUser(db, { handle: "host" });
    // Three characters seated; the header primary is Aria (first join), but Bran and Cara each speak.
    const aria = await seedCharacter(db, {
      id: "character_aria",
      ownerId: host,
      name: "Aria",
      handle: "aria",
    });
    const bran = await seedCharacter(db, {
      id: "character_bran",
      ownerId: host,
      name: "Bran",
      handle: "bran",
    });
    const cara = await seedCharacter(db, {
      id: "character_cara",
      ownerId: host,
      name: "Cara",
      handle: "cara",
    });
    const chatId = await seedChatRow("grp", { title: "Party" });
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "ca", { characterId: aria });
    await seedMember(chatId, "cb", { characterId: bran });
    await seedMember(chatId, "cc", { characterId: cara });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hey all"] });
    await seedSlot({
      chatId,
      key: "ab",
      seq: 2,
      role: "assistant",
      variantContents: ["Bran speaks"],
      characterId: bran,
    });
    await seedSlot({
      chatId,
      key: "ac",
      seq: 3,
      role: "assistant",
      variantContents: ["Cara speaks"],
      characterId: cara,
    });

    const out = await createExportChat(ctx)({ principal: principal(host), chatId });
    const lines = (out?.text ?? "").trim().split("\n");
    const header = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(header["character_name"]).toBe("Aria"); // header stays the ST primary
    // …but each message LINE carries its actual speaker — the multi-speaker fix.
    expect((JSON.parse(lines[2] ?? "") as Record<string, unknown>)["name"]).toBe("Bran");
    expect((JSON.parse(lines[3] ?? "") as Record<string, unknown>)["name"]).toBe("Cara");
    const txt = await createExportChat(ctx)({ principal: principal(host), chatId, format: "txt" });
    expect(txt?.text).toBe("User: hey all\n\nBran: Bran speaks\n\nCara: Cara speaks\n");
  });
});

describe("exportChat — PD-17 agent-author provenance", () => {
  test("an agent-authored row exports under agent_author (jsonl + txt label); the agent id/soul never leak", async () => {
    const host = await seedUser(db, { handle: "host" });
    // The agent principal's users row (FK target for messages.author_user_id). The export verb reads its
    // provenance through the injected op, NOT the users row — so a plain seeded row is enough here.
    const agentId = await seedUser(db, { handle: "agent" });
    // The compose FK-walk + soul-drop is faked here as a userId → leak-safe provenance map.
    const agentAuthors = new Map([[agentId, { name: "Sparkles", sourceKind: "buddy" }]]);
    const { ctx } = makeHarness(db, { agentAuthors });
    const aria = await seedCharacter(db, { ownerId: host, name: "Aria", handle: "aria" });
    const chatId = await seedChatRow("ap", { title: "Room" });
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "c", { characterId: aria });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hi"] });
    // Agent-authored assistant row: authorUserId set, characterId NULL (the AP2 self-attribution shape).
    await seedSlot({ chatId, key: "ag", seq: 2, role: "assistant", variantContents: ["I am the agent"], authorUserId: agentId });

    const out = await createExportChat(ctx)({ principal: principal(host), chatId });
    const lines = (out?.text ?? "").trim().split("\n");
    const agentLine = JSON.parse(lines[2] ?? "") as Record<string, unknown>;
    // The per-line speaker is the AGENT's own display name, not the header primary character (Aria).
    expect(agentLine["name"]).toBe("Sparkles");
    // biome-ignore lint/style/useNamingConvention: the ST/orb wire keys are snake_case by format.
    expect(agentLine["agent_author"]).toEqual({ name: "Sparkles", source_kind: "buddy" });

    const txt = await createExportChat(ctx)({ principal: principal(host), chatId, format: "txt" });
    expect(txt?.text).toBe("User: hi\n\nSparkles: I am the agent\n");

    // Leak pin: the sidecar carries ONLY name + source_kind, and NO principal id (agent's own or the owner)
    // appears anywhere in the export bytes — provenance travels as a display label, never a joinable id.
    expect(Object.keys(agentLine["agent_author"] as object)).toEqual(["name", "source_kind"]);
    expect(out?.text ?? "").not.toContain(agentId);
    expect(out?.text ?? "").not.toContain(host);
  });

  test("regression: a character-voiced row carries NO agent_author key (byte-identical to pre-PD-17)", async () => {
    const { ctx } = makeHarness(db); // no agentAuthors seam → resolveAgentAuthor always null
    const host = await seedUser(db, { handle: "host" });
    const aria = await seedCharacter(db, { ownerId: host, name: "Aria", handle: "aria" });
    const chatId = await seedChatRow("reg");
    await seedMember(chatId, "h", { userId: host, role: "host" });
    await seedMember(chatId, "c", { characterId: aria });
    await seedSlot({ chatId, key: "u1", seq: 1, role: "user", variantContents: ["hi"] });
    await seedSlot({ chatId, key: "a1", seq: 2, role: "assistant", variantContents: ["hello"], characterId: aria });

    const out = await createExportChat(ctx)({ principal: principal(host), chatId });
    expect(out?.text ?? "").not.toContain("agent_author");
  });
});
