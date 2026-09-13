// entry/import — THE P-8 lock test (export-import-portability.md §8): the machine-checked "no SillyTavern
// problem" invariant. Seed an owner with (at least) one of EVERY portable entity + every asset-bearing
// reference (character+avatar, a chat with an inline `asset:<id>` image, persona, world-info book, tag,
// preset, theme, user-settings, a gallery item), export the FULL library through the real registry, import
// the bundle into a FRESH db + CAS + owner, and assert EVERY reference resolves (the blobs travel
// byte-identically, the rows land, the character↔chat seating + gallery handle re-link) AND a re-import is
// idempotent (zero dupes). This is the machine-checked proof the bundle is self-contained.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { rpgGameConfigSchema, rpgSheetSchema } from "@orb/contracts/rpg";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatInjections,
  chatParticipants,
  chats as chatsTable,
  chatTags,
  documents as documentsTable,
  galleryItems,
  globalDocuments,
  messageAssets,
  messages as messagesTable,
  messageVariants,
  personas as personasTable,
  presets as presetsTable,
  rpgCheckpoints,
  rpgGames,
  rpgJournal,
  rpgSheets,
  rpgSnapshots,
  rpgTurnToolCalls,
  tags as tagsTable,
  themes as themesTable,
  userSettings as userSettingsTable,
  worldBooks,
} from "@orb/db";
import type {
  CharacterHandle,
  ChatId,
  ChatParticipantId,
  Handle,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  RpgCheckpointId,
  RpgGameId,
  RpgJournalId,
  RpgSheetId,
  RpgSnapshotId,
  RpgTurnToolCallsId,
  UserId,
  WorkloadId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { loadWorkload, runWorkload } from "@orb/server/domain/workloads";
import type { ExportDeps, ImportBundleDeps } from "@orb/server/entry/http";
import { registerExport, registerImportBundle } from "@orb/server/entry/http";
import { and, eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { seedCharacter } from "../../../support/factories/character.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { loadRunnableWorkload, makeRunnerDeps } from "../../domain/workloads/_support.ts";

// This suite builds TWO full service graphs (source `app` fixture + a fresh target box) and drives a real
// workload — it passes warm in ~2-3 s but exceeds vitest's 5 s default under parallel CPU contention. A
// generous per-suite timeout keeps CI from flaking on scheduling, not on real work.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// A minimal valid PNG (signature + a zero-length IEND) — `isPng` passes so the export-character avatar read
// embeds it directly (no image transcode), and the kit codec can weld the card tEXt chunk into it. Same
// fixture shape as tests/server/domain/import/verbs/import-character.test.ts.
const PNG_1X1 = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const GALLERY_BYTES = new TextEncoder().encode("gallery-blob-bytes-🖼");
const INLINE_BYTES = new TextEncoder().encode("inline-chat-image-bytes-📷");
// #67 — a user-ATTACHED inline image (kind `attachment`), carried by a `message_assets` structural row on
// the source; the bundle must re-create that retaining row on import (GC visibility), not just the body ref.
const ATTACH_BYTES = new TextEncoder().encode("composer-attachment-bytes-📎");

const OWNER_ID = castId<UserId>("user_p8_source_owner");

// ── R6 fixture constants: the chat-anchored planes the ST jsonl arm could not carry (F9). Each is asserted
// by VALUE on the fresh box, so "the chat imported" can never stand in for "the plane travelled".
const R6_INJECTION = "Keep the tone wry and the stakes personal.";
const R6_TAG = "campaign";
const R6_COMPACT_SUMMARY = "Everything before the bridge collapse, in brief.";
const R6_COMPACTED_AT_SEQ = 1;
const R6_TITLE = "P8 Chat";
const R6_VARIABLES = { mood: "grim" };
const R6_JOURNAL_TITLE = "The bridge fell";
const R6_CHECKPOINT_LABEL = "before the bridge";
const R6_LOCATION = "the broken bridge";

function principalOf(userId: UserId): Principal {
  return { userId, role: "owner", handle: castId<Handle>(userId), externalId: null, via: "header" };
}

// ── The minimal Hono-shape mock the registrars capture onto (same pattern as the route tests). ────────────
type Handler = (c: MockCtx) => Promise<Response> | Response;
interface MockCtx {
  readonly get: (key: string) => Principal | null;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly req: { readonly query: (name: string) => string | undefined; readonly raw: Request };
}
function makeCtx(principal: Principal | null, raw?: Request): MockCtx {
  return {
    get: (key): Principal | null => (key === "principal" ? principal : null),
    json: (b, status = 200): Response => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }),
    body: (data, status = 200): Response =>
      // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
      new Response(data instanceof Uint8Array ? new Uint8Array(data) : data, { status }),
    req: {
      query: (): string | undefined => undefined,
      raw: raw ?? new Request("http://t/", { method: "POST" }),
    },
  };
}
function libraryHandler(deps: ExportDeps): Handler {
  const routes = new Map<string, Handler>();
  const mockApp = {
    get: (path: string, fn: Handler): unknown => {
      routes.set(path, fn);
      return mockApp;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerExport(mockApp as unknown as Parameters<typeof registerExport>[0], deps);
  const handler = routes.get("/api/export/library");
  if (handler === undefined) {
    throw new Error("library route not registered");
  }
  return handler;
}
function bundleHandler(deps: ImportBundleDeps): Handler {
  const routes = new Map<string, Handler>();
  const mockApp = {
    post: (path: string, fn: Handler): unknown => {
      routes.set(path, fn);
      return mockApp;
    },
  };
  // @orb-waive no-test-fabrication(unknown): narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerImportBundle(mockApp as unknown as Parameters<typeof registerImportBundle>[0], deps);
  const handler = routes.get("/api/import/bundle");
  if (handler === undefined) {
    throw new Error("bundle route not registered");
  }
  return handler;
}

describe("P-8: the full-library bundle round-trips into a fresh box, self-contained + idempotent", () => {
  test("every entity + every asset-bearing reference travels; a re-import writes zero dupes", async ({ db, app, clock }) => {
    // ── SEED one-of-everything for the owner on the SOURCE box ──────────────────────────────────────────
    await seedUser(db, { id: OWNER_ID, handle: castId<Handle>("p8-source-owner") });
    const owner = principalOf(OWNER_ID);

    // Blobs (avatar + a gallery image + a chat-inline image), all CAS-coherent via the real store.
    const avatar = await app.services.assets.store({
      principal: owner,
      bytes: PNG_1X1,
      kind: "avatar",
      mime: "image/png",
    });
    const galleryBlob = await app.services.assets.store({
      principal: owner,
      bytes: GALLERY_BYTES,
      kind: "generated",
      mime: "image/png",
    });
    const inlineBlob = await app.services.assets.store({
      principal: owner,
      bytes: INLINE_BYTES,
      kind: "generated",
      mime: "image/png",
    });
    // #67 — a composer ATTACHMENT blob (its own kind), referenced inline in the message body below and
    // pinned by a `message_assets` structural row on the source.
    const attachBlob = await app.services.assets.store({
      principal: owner,
      bytes: ATTACH_BYTES,
      kind: "attachment",
      mime: "image/png",
    });

    // Character (+ avatar) with a deterministic handle (the gallery + chat re-link key).
    const character = await seedCharacter(db, {
      ownerId: OWNER_ID,
      handle: castId<CharacterHandle>("hero"),
      name: "Hero",
      avatarAssetId: avatar.assetId,
    });
    // An ACCEPTED card tag on the character (travels embedded in the card) + the tag library entity.
    await app.services.tag.attachCardTagByName({
      ownerId: OWNER_ID,
      characterId: character.id,
      tagName: "adventure",
      source: "manual",
      status: "accepted",
    });
    // A gallery item (curation row: assetId + subject character handle).
    await app.services.assets.addToGallery({
      principal: owner,
      assetId: galleryBlob.assetId,
      subjectCharacterId: character.id,
    });
    // Persona, preset, theme, world-info book, user-settings — the self-contained entities.
    await app.services.persona.create({
      principal: owner,
      input: { name: "My Persona", description: "the human behind the keyboard" },
    });
    await app.services.preset.create({ userId: OWNER_ID, name: "My Preset", kind: "roleplay" });
    await app.services.settings.createTheme({
      principal: owner,
      input: { name: "My Theme", override: {}, css: null },
    });
    await app.services.worldInfo.createBook({ principal: owner, input: { name: "My World" } });
    // F1: the databank library. It was ABSENT from PORTABLE_KINDS entirely, so this whole plane used to
    // vanish from a full-account backup — the P1 the registry gate now makes unrepresentable.
    const documentCreated = await app.services.databank.createFromText({
      principal: owner,
      name: "Field Notes",
      text: "The kingdom's dusk lasts nine hours.",
    });
    await app.services.databank.attachGlobal({ principal: owner, documentId: documentCreated.document.id });
    // A NON-default chat toggle (continueOnSend defaults true) so a positive read on the fresh box proves the
    // VALUE transferred, not merely that the namespace exists.
    await app.services.settings.updateUserSettingsSection({
      principal: owner,
      input: { section: "chat", patch: { continueOnSend: false } },
    });

    // A chat hosted by the owner, seated with the character, carrying a message with an inline asset ref.
    const chatId = castId<ChatId>("chat_p8");
    await db.insert(chatsTable).values({
      id: chatId,
      title: "P8 Chat",
      starred: false,
      archived: false,
      temporary: false,
      pendingHostUserId: null,
      anchorPersonaId: null,
      parentChatId: null,
      forkedAt: null,
      // R6 — the fidelity planes. `runtimeVariables` is DERIVED and deliberately does NOT travel; the
      // rest do, and each is asserted by value after the round trip.
      compactSummary: R6_COMPACT_SUMMARY,
      compactedAtSeq: R6_COMPACTED_AT_SEQ,
      metadata: { roomOverrides: { scenario: "a rain-soaked frontier town" } },
      variableValues: R6_VARIABLES,
      runtimeVariables: { mood: "STALE-DERIVED-MUST-NOT-TRAVEL" },
      importedFrom: null,
      importHash: null,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(chatParticipants).values([
      {
        id: castId<ChatParticipantId>("chatpart_p8_host"),
        chatId,
        kind: "human",
        userId: OWNER_ID,
        role: "host",
        joinedAt: clock.now(),
        joinSeq: 0,
      },
      {
        id: castId<ChatParticipantId>("chatpart_p8_char"),
        chatId,
        kind: "character",
        characterId: character.id,
        role: "member",
        joinedAt: clock.now(),
        joinSeq: 1,
      },
    ]);
    const msgId = castId<MessageId>("msg_p8");
    await db.insert(messagesTable).values({
      id: msgId,
      chatId,
      seq: 1,
      role: "assistant",
      authorUserId: null,
      characterId: character.id,
      personaId: null,
      selectedVariantId: null,
      excludedFromPrompt: false,
      createdAt: clock.now(),
      editedAt: null,
    });
    await db.insert(messageVariants).values({
      id: castId<MessageVariantId>("msgvar_p8"),
      messageId: msgId,
      idx: 0,
      // Two inline refs: a generated image AND a user attachment (#67) — both must resolve on the fresh box.
      content: `Look at this: ![img](asset:${inlineBlob.assetId}) and ![att](asset:${attachBlob.assetId})`,
      createdAt: clock.now(),
    });
    await db
      .update(messagesTable)
      .set({ selectedVariantId: castId<MessageVariantId>("msgvar_p8") })
      .where(eq(messagesTable.id, msgId));
    // #67 — the STRUCTURAL retaining row for the attachment on the SOURCE (the send verb writes this; the
    // registry sees it for GC). It doesn't travel through the JSONL itself — import RE-CREATES it from the
    // body's `asset:<id>` ref for the blob that landed. Seeded here so the source is a faithful attach state.
    await db.insert(messageAssets).values({
      id: castId<MessageAssetId>("msgasset_p8"),
      messageId: msgId,
      assetId: attachBlob.assetId,
      createdAt: clock.now(),
    });

    // ── R6: the chat-anchored planes the ST jsonl arm is structurally incapable of carrying (F9) ───────
    // The per-chat PROSE plane (the author's-note replacement — a LIST with positions/depths/roles).
    await db.insert(chatInjections).values({
      id: castId("chatinj_p8"),
      chatId,
      position: "in_chat",
      depth: 4,
      role: "system",
      content: R6_INJECTION,
      order: 2,
      createdAt: clock.now(),
    });
    // The D30 per-tagger chat↔tag overlay — the ACCEPTED-LOSSY row this wave ended.
    await app.services.tag.attachChatTagByName({ ownerId: OWNER_ID, chatId, tagName: R6_TAG });
    // The rpg CAMPAIGN. The snapshot / journal entry / tool-call record are all keyed to `msgvar_p8` — the
    // variant whose id does NOT survive a cross-box move. Whether they come back anchored to the RIGHT
    // restored variant is the whole point of the positional remap, and is asserted below.
    const gameId = castId<RpgGameId>("rpg_game_p8");
    const snapshotId = castId<RpgSnapshotId>("rpg_snapshot_p8");
    await db.insert(rpgGames).values({
      id: gameId,
      chatId,
      mode: "lite",
      status: "active",
      sessionNumber: 3,
      config: rpgGameConfigSchema.parse({}),
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(rpgSheets).values([
      {
        id: castId<RpgSheetId>("rpg_sheet_p8"),
        gameId,
        characterId: character.id,
        userId: null,
        sheet: rpgSheetSchema.parse({ className: "Wanderer", level: 4 }),
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
    ]);
    await db.insert(rpgSnapshots).values({
      id: snapshotId,
      gameId,
      messageId: msgId,
      variantId: castId<MessageVariantId>("msgvar_p8"),
      asOfMessageId: null,
      location: R6_LOCATION,
      committed: 1,
      createdAt: clock.now(),
    });
    await db.insert(rpgJournal).values({
      id: castId<RpgJournalId>("rpg_journal_p8"),
      gameId,
      type: "event",
      label: "",
      title: R6_JOURNAL_TITLE,
      content: "The span gave way under the caravan.",
      variantId: castId<MessageVariantId>("msgvar_p8"),
      sourceMessageId: msgId,
      createdAt: clock.now(),
    });
    await db.insert(rpgTurnToolCalls).values({
      id: castId<RpgTurnToolCallsId>("rpg_ttc_p8"),
      gameId,
      messageId: msgId,
      variantId: castId<MessageVariantId>("msgvar_p8"),
      calls: [{ name: "update_scene", args: '{"location":"the broken bridge"}', verdict: "applied", issues: [] }],
      createdAt: clock.now(),
    });
    await db.insert(rpgCheckpoints).values({
      id: castId<RpgCheckpointId>("rpg_ckpt_p8"),
      gameId,
      snapshotId,
      label: R6_CHECKPOINT_LABEL,
      trigger: "manual",
      createdAt: clock.now(),
    });

    // ── EXPORT the full library through the real route ─────────────────────────────────────────────────
    const exportH = libraryHandler({ export: app.exportService, registry: app.portability });
    const zip = new Uint8Array(await (await exportH(makeCtx(owner))).arrayBuffer());
    expect(zip.byteLength).toBeGreaterThan(0);

    // ── IMPORT into a FRESH box (new db + new CAS + new owner) ──────────────────────────────────────────
    const { createServices } = await import("@orb/server/entry/compose");
    const freshDatabase = await freshDb();
    const casDir = await mkdtemp(join(tmpdir(), "orb-p8-cas-"));
    const variantDir = await mkdtemp(join(tmpdir(), "orb-p8-var-"));
    const targetId = castId<UserId>("user_p8_target_owner");
    await seedUser(freshDatabase, { id: targetId, handle: castId<Handle>("p8-target-owner") });
    const target = principalOf(targetId);
    try {
      const fresh = await createServices({
        db: freshDatabase,
        now: (): number => clock.now(),
        ownerId: targetId,
        secretBoxKey: null,
        casDir,
        variantDir,
        sessionSecret: "test-session-secret-at-least-32-chars",
        vllmDisabled: true,
      });

      // The route is WORKLOAD-BACKED (#113): POST stages the zip + starts a SINGULAR `import-bundle` run,
      // returning 202 {workloadId}; the import executes when the worker drives the row. The test drives it
      // synchronously (runWorkload over the REAL runner-env — its `importBundle` op reads the staged zip the
      // route wrote to the SAME OS-temp staging root — no running worker in the fixture).
      const importH = bundleHandler({ workloads: fresh.services.workloads });
      const runImport = async (): Promise<{
        imported: number;
        skipped: number;
        failed: number;
      }> => {
        const req = new Request("http://t/api/import/bundle", { method: "POST", body: zip });
        const res = await importH(makeCtx(target, req));
        expect(res.status).toBe(202);
        const { workloadId } = (await res.json()) as { workloadId: WorkloadId };
        const row = await loadRunnableWorkload(freshDatabase, fresh.workloadContributions, workloadId);
        await runWorkload(makeRunnerDeps(freshDatabase, fresh.workloadContributions), row, new AbortController().signal);
        const done = await loadWorkload(freshDatabase, fresh.workloadContributions, workloadId);
        expect(done?.status).toBe("succeeded");
        return done?.result as { imported: number; skipped: number; failed: number };
      };

      const report = await runImport();
      expect(report.failed).toBe(0);

      // ── ASSERT every reference resolves on the fresh box ─────────────────────────────────────────────
      // Blobs travel byte-identically (the SillyTavern-problem core): the gallery + inline images restore
      // under their ORIGINAL ids (Option A), byte-for-byte.
      const galleryRestored = await fresh.assets.loadAssetBytes(galleryBlob.assetId);
      expect(galleryRestored).not.toBeNull();
      expect([...(galleryRestored ?? [])]).toEqual([...GALLERY_BYTES]);
      const inlineRestored = await fresh.assets.loadAssetBytes(inlineBlob.assetId);
      expect(inlineRestored).not.toBeNull();
      expect([...(inlineRestored ?? [])]).toEqual([...INLINE_BYTES]);

      // Character round-trips (by handle) + gains an avatar asset on the fresh box.
      const freshChars = await freshDatabase
        .select({ id: charactersTable.id, avatarAssetId: charactersTable.avatarAssetId })
        .from(charactersTable)
        .where(and(eq(charactersTable.ownerId, targetId), eq(charactersTable.handle, castId<CharacterHandle>("hero"))));
      expect(freshChars).toHaveLength(1);
      const freshCharId = freshChars[0]?.id;
      const freshAvatarId = freshChars[0]?.avatarAssetId;
      expect(freshAvatarId).not.toBeNull();
      // The avatar BLOB travels byte-identically (not just `avatarAssetId !== null`): resolve the fresh id →
      // CAS bytes and compare to the SOURCE. The avatar rides the card format (the imported card PNG IS the
      // stored avatar, D-…), so the byte-identity oracle is the source character's exported card bytes.
      const sourceCard = await app.exportService.exportCharacter({
        principal: owner,
        characterId: character.id,
      });
      expect(sourceCard).not.toBeNull();
      const avatarRestored = freshAvatarId === null || freshAvatarId === undefined ? null : await fresh.assets.loadAssetBytes(freshAvatarId);
      expect(avatarRestored).not.toBeNull();
      expect([...(avatarRestored ?? [])]).toEqual([...(sourceCard?.bytes ?? [])]);

      // Gallery curation re-links the subject character by HANDLE → the fresh character id.
      const freshGallery = await freshDatabase
        .select({ subject: galleryItems.subjectCharacterId, assetId: galleryItems.assetId })
        .from(galleryItems)
        .where(eq(galleryItems.assetId, galleryBlob.assetId));
      expect(freshGallery).toHaveLength(1);
      expect(freshGallery[0]?.subject).toBe(freshCharId);

      // The self-contained entities all landed under the target owner.
      const rowsFor = async (table: typeof presetsTable | typeof themesTable | typeof tagsTable | typeof personasTable): Promise<number> => {
        const rows = await freshDatabase.select({ id: table.id }).from(table).where(eq(table.ownerId, targetId));
        return rows.length;
      };
      expect(await rowsFor(presetsTable)).toBe(1);
      expect(await rowsFor(themesTable)).toBe(1);
      expect(await rowsFor(personasTable)).toBe(1);
      // tags: the character's card tag ("adventure") travels via the tags library.
      const freshTags = await freshDatabase
        .select({ id: tagsTable.id })
        .from(tagsTable)
        .where(and(eq(tagsTable.ownerId, targetId), eq(tagsTable.name, "adventure")));
      expect(freshTags).toHaveLength(1);
      const freshBooks = await freshDatabase.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, targetId));
      expect(freshBooks).toHaveLength(1);

      // F1: the databank document's CANON travels (not merely a row), and its global attachment re-links.
      const freshDocs = await freshDatabase
        .select({ id: documentsTable.id, text: documentsTable.extractedText })
        .from(documentsTable)
        .where(eq(documentsTable.ownerId, targetId));
      expect(freshDocs).toHaveLength(1);
      expect(freshDocs[0]?.text).toBe("The kingdom's dusk lasts nine hours.");
      const freshGlobalDocs = await freshDatabase
        .select({ documentId: globalDocuments.documentId })
        .from(globalDocuments)
        .where(eq(globalDocuments.ownerId, targetId));
      expect(freshGlobalDocs.map((r) => r.documentId)).toEqual([freshDocs[0]?.id]);

      // The chat re-seated its host + character (handle-layout resolved on import).
      const freshHostSeat = await freshDatabase
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")));
      expect(freshHostSeat.length).toBeGreaterThanOrEqual(1);

      // The inline `asset:<id>` ref survives in the re-imported message CONTENT (verbatim, D51) AND resolves
      // to a live blob on the fresh box — not merely that the host seat exists.
      // ONE resolution of "the restored chat", reused by every read below — the same `?? none` spelled at
      // each call site is a branch per site (and the P-8 case has a cognitive-complexity budget).
      const freshHostChatId = freshHostSeat[0]?.chatId ?? castId<ChatId>("none");
      const freshVariants = await freshDatabase
        .select({ content: messageVariants.content })
        .from(messageVariants)
        .innerJoin(messagesTable, eq(messagesTable.id, messageVariants.messageId))
        .where(eq(messagesTable.chatId, freshHostChatId));
      const inlineRef = `asset:${inlineBlob.assetId}`;
      expect(freshVariants.some((v) => v.content.includes(inlineRef))).toBe(true);
      // …and that referenced id resolves to real bytes on the fresh CAS (the blob, not a dangling token).
      expect(await fresh.assets.loadAssetBytes(inlineBlob.assetId)).not.toBeNull();

      // #67 — the ATTACHMENT blob travels byte-identically AND its STRUCTURAL `message_assets` retaining row
      // RE-LINKS on the fresh box (re-created from the body ref → the restored blob), pinning the attachment
      // for GC — not merely the inline text ref surviving.
      const attachRestored = await fresh.assets.loadAssetBytes(attachBlob.assetId);
      expect(attachRestored).not.toBeNull();
      expect([...(attachRestored ?? [])]).toEqual([...ATTACH_BYTES]);
      const freshMessageAssets = await freshDatabase
        .select({ assetId: messageAssets.assetId, messageId: messageAssets.messageId })
        .from(messageAssets)
        .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
        .where(eq(messagesTable.chatId, freshHostChatId));
      expect(freshMessageAssets.map((r) => r.assetId)).toContain(attachBlob.assetId);

      // user-settings VALUE transferred (a positive read, not just `failed === 0`): the seeded chat toggle.
      const freshSettings = await fresh.services.settings.loadUserSettings(targetId);
      expect(freshSettings.chat.continueOnSend).toBe(false);

      // ── R6: the chat-anchored planes came back, BY VALUE, and the rpg campaign re-anchored CORRECTLY ─
      const freshChatRows = await freshDatabase
        .select({
          id: chatsTable.id,
          title: chatsTable.title,
          compactSummary: chatsTable.compactSummary,
          compactedAtSeq: chatsTable.compactedAtSeq,
          metadata: chatsTable.metadata,
          variableValues: chatsTable.variableValues,
          runtimeVariables: chatsTable.runtimeVariables,
        })
        .from(chatsTable)
        .where(eq(chatsTable.id, freshHostChatId));
      const freshChat = freshChatRows[0];
      expect(freshChat?.title).toBe(R6_TITLE);
      expect(freshChat?.compactSummary).toBe(R6_COMPACT_SUMMARY);
      expect(freshChat?.compactedAtSeq).toBe(R6_COMPACTED_AT_SEQ);
      // The ROOM BLOB (group config / room overrides / opening policy) — the plane a jsonl transcript has no
      // slot for at all.
      expect(freshChat?.metadata?.roomOverrides?.scenario).toBe("a rain-soaked frontier town");
      expect(freshChat?.variableValues).toEqual(R6_VARIABLES);
      // …and the DERIVED cache did NOT travel (it re-folds from the carried per-variant deltas). A carried
      // `runtimeVariables` would be shipping a snapshot of a cache the restore immediately invalidates.
      expect(freshChat?.runtimeVariables).toBeNull();

      // The per-chat PROSE plane (a LIST, with its position/depth/role/order intact).
      const freshInjections = await freshDatabase
        .select({ content: chatInjections.content, position: chatInjections.position, depth: chatInjections.depth, order: chatInjections.order })
        .from(chatInjections)
        .where(eq(chatInjections.chatId, freshHostChatId));
      expect(freshInjections).toEqual([{ content: R6_INJECTION, position: "in_chat", depth: 4, order: 2 }]);

      // The chat↔tag overlay re-links BY NAME (the ACCEPTED-LOSSY row this wave ended).
      const freshChatTags = await freshDatabase
        .select({ name: tagsTable.name })
        .from(chatTags)
        .innerJoin(tagsTable, eq(tagsTable.id, chatTags.tagId))
        .where(and(eq(chatTags.chatId, freshHostChatId), eq(chatTags.ownerId, targetId)));
      expect(freshChatTags.map((r) => r.name)).toEqual([R6_TAG]);

      // THE REMAP PROOF. The campaign's three variant-keyed planes must anchor to the RIGHT restored variant
      // — not to nothing (orphaned) and not to a different turn (cross-linked). Resolve the fresh chat's one
      // variant id independently, then require every plane to point AT IT.
      const freshVariantRows = await freshDatabase
        .select({ id: messageVariants.id, messageId: messageVariants.messageId })
        .from(messageVariants)
        .innerJoin(messagesTable, eq(messagesTable.id, messageVariants.messageId))
        .where(eq(messagesTable.chatId, freshHostChatId));
      expect(freshVariantRows).toHaveLength(1);
      const freshVariantId = freshVariantRows[0]?.id;
      const freshMessageId = freshVariantRows[0]?.messageId;
      // The ids are genuinely NEW — otherwise "it re-anchored" would be trivially true and prove nothing.
      expect(freshVariantId).not.toBe(castId<MessageVariantId>("msgvar_p8"));

      const freshGames = await freshDatabase
        .select({ id: rpgGames.id, mode: rpgGames.mode, status: rpgGames.status, sessionNumber: rpgGames.sessionNumber })
        .from(rpgGames)
        .where(eq(rpgGames.chatId, freshHostChatId));
      expect(freshGames).toHaveLength(1);
      const freshGameId = freshGames[0]?.id ?? castId<RpgGameId>("none");
      expect(freshGames[0]?.sessionNumber).toBe(3);

      const freshSnapshots = await freshDatabase
        .select({ id: rpgSnapshots.id, messageId: rpgSnapshots.messageId, variantId: rpgSnapshots.variantId, location: rpgSnapshots.location })
        .from(rpgSnapshots)
        .where(eq(rpgSnapshots.gameId, freshGameId));
      expect(freshSnapshots).toHaveLength(1);
      expect(freshSnapshots[0]?.variantId).toBe(freshVariantId);
      expect(freshSnapshots[0]?.messageId).toBe(freshMessageId);
      expect(freshSnapshots[0]?.location).toBe(R6_LOCATION);

      const freshJournal = await freshDatabase
        .select({ title: rpgJournal.title, variantId: rpgJournal.variantId, sourceMessageId: rpgJournal.sourceMessageId })
        .from(rpgJournal)
        .where(eq(rpgJournal.gameId, freshGameId));
      expect(freshJournal).toHaveLength(1);
      expect(freshJournal[0]?.title).toBe(R6_JOURNAL_TITLE);
      expect(freshJournal[0]?.variantId).toBe(freshVariantId);
      expect(freshJournal[0]?.sourceMessageId).toBe(freshMessageId);

      const freshToolCalls = await freshDatabase
        .select({ messageId: rpgTurnToolCalls.messageId, variantId: rpgTurnToolCalls.variantId, calls: rpgTurnToolCalls.calls })
        .from(rpgTurnToolCalls)
        .where(eq(rpgTurnToolCalls.gameId, freshGameId));
      expect(freshToolCalls).toHaveLength(1);
      expect(freshToolCalls[0]?.variantId).toBe(freshVariantId);
      expect(freshToolCalls[0]?.messageId).toBe(freshMessageId);
      expect(freshToolCalls[0]?.calls[0]?.name).toBe("update_scene");

      // The checkpoint's snapshot ref is a POSITION in the payload — it must resolve to the restored snapshot.
      const freshCheckpoints = await freshDatabase
        .select({ label: rpgCheckpoints.label, snapshotId: rpgCheckpoints.snapshotId })
        .from(rpgCheckpoints)
        .where(eq(rpgCheckpoints.gameId, freshGameId));
      expect(freshCheckpoints).toHaveLength(1);
      expect(freshCheckpoints[0]?.label).toBe(R6_CHECKPOINT_LABEL);
      expect(freshCheckpoints[0]?.snapshotId).toBe(freshSnapshots[0]?.id);

      // The per-actor SHEET re-links by character HANDLE (the host-sheet arm keys onto the importer instead).
      const freshSheets = await freshDatabase
        .select({ characterId: rpgSheets.characterId, userId: rpgSheets.userId, sheet: rpgSheets.sheet })
        .from(rpgSheets)
        .where(eq(rpgSheets.gameId, freshGameId));
      expect(freshSheets).toHaveLength(1);
      expect(freshSheets[0]?.characterId).toBe(freshCharId);
      expect(freshSheets[0]?.sheet.className).toBe("Wanderer");
      expect(freshSheets[0]?.sheet.level).toBe(4);

      // ── IDEMPOTENT re-import: a SECOND upload writes ZERO new rows for EACH of the 10 entities ────────
      // Count every entity scoped to the target owner (chat via its host seat; gallery via its asset owner;
      // user-settings is the per-user singleton row) — the whole self-contained proof, per entity.
      const countAll = async (): Promise<Record<string, number>> => {
        const owned = async (table: typeof presetsTable | typeof themesTable | typeof tagsTable | typeof personasTable): Promise<number> =>
          (await freshDatabase.select({ id: table.id }).from(table).where(eq(table.ownerId, targetId))).length;
        return {
          character: (await freshDatabase.select({ id: charactersTable.id }).from(charactersTable).where(eq(charactersTable.ownerId, targetId))).length,
          chat: (
            await freshDatabase
              .select({ chatId: chatParticipants.chatId })
              .from(chatParticipants)
              .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")))
          ).length,
          persona: await owned(personasTable),
          worldInfo: (await freshDatabase.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, targetId))).length,
          databank: (await freshDatabase.select({ id: documentsTable.id }).from(documentsTable).where(eq(documentsTable.ownerId, targetId))).length,
          preset: await owned(presetsTable),
          theme: await owned(themesTable),
          userSettings: (await freshDatabase.select({ id: userSettingsTable.userId }).from(userSettingsTable).where(eq(userSettingsTable.userId, targetId)))
            .length,
          tag: await owned(tagsTable),
          gallery: (
            await freshDatabase
              .select({ id: galleryItems.id })
              .from(galleryItems)
              .innerJoin(assetsTable, eq(assetsTable.id, galleryItems.assetId))
              .where(eq(assetsTable.ownerId, targetId))
          ).length,
          assets: (await freshDatabase.select({ id: assetsTable.id }).from(assetsTable).where(eq(assetsTable.ownerId, targetId))).length,
          // R6 — the chat-anchored planes. A re-import must not double them either: canon dedups on
          // `importHash`, returns its existing identity, and the idempotent overlay/campaign tails replay.
          chatInjections: (await freshDatabase.select({ id: chatInjections.id }).from(chatInjections).where(eq(chatInjections.chatId, freshHostChatId))).length,
          chatTags: (await freshDatabase.select({ tagId: chatTags.tagId }).from(chatTags).where(eq(chatTags.ownerId, targetId))).length,
          rpgGames: (await freshDatabase.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, freshHostChatId))).length,
          rpgSnapshots: (await freshDatabase.select({ id: rpgSnapshots.id }).from(rpgSnapshots).where(eq(rpgSnapshots.gameId, freshGameId))).length,
          rpgJournal: (await freshDatabase.select({ id: rpgJournal.id }).from(rpgJournal).where(eq(rpgJournal.gameId, freshGameId))).length,
          rpgCheckpoints: (await freshDatabase.select({ id: rpgCheckpoints.id }).from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, freshGameId))).length,
          // #67 — the attachment retaining rows (via the target-owned asset join) — a re-import must not
          // double them (the chat-skip on `importHash` guarantees it).
          messageAssets: (
            await freshDatabase
              .select({ id: messageAssets.id })
              .from(messageAssets)
              .innerJoin(assetsTable, eq(assetsTable.id, messageAssets.assetId))
              .where(eq(assetsTable.ownerId, targetId))
          ).length,
        };
      };

      const before = await countAll();
      // Sanity: the first import actually landed one of everything (no silent zero-count "idempotency").
      for (const [entity, n] of Object.entries(before)) {
        expect(n, `entity "${entity}" should have landed at least one row`).toBeGreaterThanOrEqual(1);
      }
      const report2 = await runImport();
      expect(report2.failed).toBe(0);
      const after = await countAll();
      // ZERO new rows for EACH of the 10 — the machine-checked idempotency lock.
      expect(after).toEqual(before);
    } finally {
      await rm(casDir, { recursive: true, force: true });
      await rm(variantDir, { recursive: true, force: true });
    }
  });

  // The single-turn P-8 test above proves the remap resolves to SOME variant of the restored chat, but with
  // only one turn in the fixture a bug that mapped every plane onto "the chat's one variant" (ignoring the
  // per-turn position entirely) would pass it too. Two rpg-anchored turns, each with its own snapshot /
  // journal / turn-tool-call refs, is the only way to catch a CROSS-LINK regression — turn A's planes landing
  // on turn B's restored (message, variant) id, or vice versa — rather than reading the positional-index
  // logic and trusting it.
  test("two rpg-anchored turns each remap to their OWN restored (message, variant) — never cross-linked", async ({ db, app, clock }) => {
    const sourceOwnerId = castId<UserId>("user_r6_2turn_source_owner");
    await seedUser(db, { id: sourceOwnerId, handle: castId<Handle>("r6-2turn-source-owner") });
    const owner = principalOf(sourceOwnerId);

    // NB: the character's HANDLE does not travel through the card format (a card carries only the NAME) — the
    // import verb re-derives it via `slugifyHandle(name)` (`substrate/card.ts`). The name is chosen so its
    // slug is exactly "hero-2t", matching the seeded handle below (both source-side reads and the round trip
    // rely on the SAME handle, never on the display name).
    const character = await seedCharacter(db, {
      ownerId: sourceOwnerId,
      handle: castId<CharacterHandle>("hero-2t"),
      name: "Hero 2T",
    });

    const chatId = castId<ChatId>("chat_r6_2turn");
    await db.insert(chatsTable).values({
      id: chatId,
      title: "R6 Two-Turn Chat",
      starred: false,
      archived: false,
      temporary: false,
      pendingHostUserId: null,
      anchorPersonaId: null,
      parentChatId: null,
      forkedAt: null,
      compactSummary: null,
      compactedAtSeq: null,
      metadata: {},
      variableValues: {},
      runtimeVariables: {},
      importedFrom: null,
      importHash: null,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(chatParticipants).values([
      {
        id: castId<ChatParticipantId>("chatpart_r6_2turn_host"),
        chatId,
        kind: "human",
        userId: sourceOwnerId,
        role: "host",
        joinedAt: clock.now(),
        joinSeq: 0,
      },
      {
        id: castId<ChatParticipantId>("chatpart_r6_2turn_char"),
        chatId,
        kind: "character",
        characterId: character.id,
        role: "member",
        joinedAt: clock.now(),
        joinSeq: 1,
      },
    ]);

    // Two turns, each its own message + variant, distinguished by CONTENT (which travels verbatim, D51) so
    // the fresh box's per-turn ids can be resolved back to "which turn" without relying on the remap itself.
    const msgAId = castId<MessageId>("msg_r6_2turn_a");
    const msgBId = castId<MessageId>("msg_r6_2turn_b");
    const varAId = castId<MessageVariantId>("msgvar_r6_2turn_a");
    const varBId = castId<MessageVariantId>("msgvar_r6_2turn_b");
    await db.insert(messagesTable).values([
      {
        id: msgAId,
        chatId,
        seq: 1,
        role: "assistant",
        authorUserId: null,
        characterId: character.id,
        personaId: null,
        selectedVariantId: null,
        excludedFromPrompt: false,
        createdAt: clock.now(),
        editedAt: null,
      },
      {
        id: msgBId,
        chatId,
        seq: 2,
        role: "assistant",
        authorUserId: null,
        characterId: character.id,
        personaId: null,
        selectedVariantId: null,
        excludedFromPrompt: false,
        createdAt: clock.now(),
        editedAt: null,
      },
    ]);
    await db.insert(messageVariants).values([
      { id: varAId, messageId: msgAId, idx: 0, content: "Turn one begins.", createdAt: clock.now() },
      { id: varBId, messageId: msgBId, idx: 0, content: "Turn two continues.", createdAt: clock.now() },
    ]);
    await db.update(messagesTable).set({ selectedVariantId: varAId }).where(eq(messagesTable.id, msgAId));
    await db.update(messagesTable).set({ selectedVariantId: varBId }).where(eq(messagesTable.id, msgBId));

    const gameId = castId<RpgGameId>("rpg_game_r6_2turn");
    const snapAId = castId<RpgSnapshotId>("rpg_snapshot_r6_2turn_a");
    const snapBId = castId<RpgSnapshotId>("rpg_snapshot_r6_2turn_b");
    await db.insert(rpgGames).values({
      id: gameId,
      chatId,
      mode: "lite",
      status: "active",
      sessionNumber: 1,
      config: rpgGameConfigSchema.parse({}),
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(rpgSnapshots).values([
      { id: snapAId, gameId, messageId: msgAId, variantId: varAId, asOfMessageId: null, location: "loc-turn-a", committed: 1, createdAt: clock.now() },
      { id: snapBId, gameId, messageId: msgBId, variantId: varBId, asOfMessageId: null, location: "loc-turn-b", committed: 1, createdAt: clock.now() },
    ]);
    await db.insert(rpgJournal).values([
      {
        id: castId<RpgJournalId>("rpg_journal_r6_2turn_a"),
        gameId,
        type: "event",
        label: "",
        title: "Journal Turn A",
        content: "First turn's event.",
        variantId: varAId,
        sourceMessageId: msgAId,
        createdAt: clock.now(),
      },
      {
        id: castId<RpgJournalId>("rpg_journal_r6_2turn_b"),
        gameId,
        type: "event",
        label: "",
        title: "Journal Turn B",
        content: "Second turn's event.",
        variantId: varBId,
        sourceMessageId: msgBId,
        createdAt: clock.now(),
      },
    ]);
    await db.insert(rpgTurnToolCalls).values([
      {
        id: castId<RpgTurnToolCallsId>("rpg_ttc_r6_2turn_a"),
        gameId,
        messageId: msgAId,
        variantId: varAId,
        calls: [{ name: "action_a", args: "{}", verdict: "applied", issues: [] }],
        createdAt: clock.now(),
      },
      {
        id: castId<RpgTurnToolCallsId>("rpg_ttc_r6_2turn_b"),
        gameId,
        messageId: msgBId,
        variantId: varBId,
        calls: [{ name: "action_b", args: "{}", verdict: "applied", issues: [] }],
        createdAt: clock.now(),
      },
    ]);

    // ── EXPORT the full library through the real route ─────────────────────────────────────────────────
    const exportH = libraryHandler({ export: app.exportService, registry: app.portability });
    const zip = new Uint8Array(await (await exportH(makeCtx(owner))).arrayBuffer());
    expect(zip.byteLength).toBeGreaterThan(0);

    // ── IMPORT into a FRESH box (new db + new CAS + new owner) ─────────────────────────────────────────
    const { createServices } = await import("@orb/server/entry/compose");
    const freshDatabase = await freshDb();
    const casDir = await mkdtemp(join(tmpdir(), "orb-r6-2turn-cas-"));
    const variantDir = await mkdtemp(join(tmpdir(), "orb-r6-2turn-var-"));
    const targetId = castId<UserId>("user_r6_2turn_target_owner");
    await seedUser(freshDatabase, { id: targetId, handle: castId<Handle>("r6-2turn-target-owner") });
    const target = principalOf(targetId);
    try {
      const fresh = await createServices({
        db: freshDatabase,
        now: (): number => clock.now(),
        ownerId: targetId,
        secretBoxKey: null,
        casDir,
        variantDir,
        sessionSecret: "test-session-secret-at-least-32-chars",
        vllmDisabled: true,
      });

      const importH = bundleHandler({ workloads: fresh.services.workloads });
      const req = new Request("http://t/api/import/bundle", { method: "POST", body: zip });
      const res = await importH(makeCtx(target, req));
      expect(res.status).toBe(202);
      const { workloadId } = (await res.json()) as { workloadId: WorkloadId };
      const row = await loadRunnableWorkload(freshDatabase, fresh.workloadContributions, workloadId);
      await runWorkload(makeRunnerDeps(freshDatabase, fresh.workloadContributions), row, new AbortController().signal);
      const done = await loadWorkload(freshDatabase, fresh.workloadContributions, workloadId);
      expect(done?.status).toBe("succeeded");
      const report = done?.result as { imported: number; skipped: number; failed: number };
      expect(report.failed).toBe(0);

      // ── Resolve "which restored turn is which" INDEPENDENTLY of the remap under test, via the CONTENT ──
      const freshHostSeat = await freshDatabase
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")));
      expect(freshHostSeat).toHaveLength(1);
      const freshChatId = freshHostSeat[0]?.chatId ?? castId<ChatId>("none");

      const freshVariants = await freshDatabase
        .select({ id: messageVariants.id, messageId: messageVariants.messageId, content: messageVariants.content })
        .from(messageVariants)
        .innerJoin(messagesTable, eq(messagesTable.id, messageVariants.messageId))
        .where(eq(messagesTable.chatId, freshChatId));
      expect(freshVariants).toHaveLength(2);
      const turnA = freshVariants.find((v) => v.content === "Turn one begins.");
      const turnB = freshVariants.find((v) => v.content === "Turn two continues.");
      expect(turnA).toBeDefined();
      expect(turnB).toBeDefined();
      const freshVarAId = turnA?.id;
      const freshVarBId = turnB?.id;
      const freshMsgAId = turnA?.messageId;
      const freshMsgBId = turnB?.messageId;
      // Genuinely new + genuinely distinct ids — otherwise the assertions below could pass trivially.
      expect(freshVarAId).not.toBe(varAId);
      expect(freshVarBId).not.toBe(varBId);
      expect(freshVarAId).not.toBe(freshVarBId);
      expect(freshMsgAId).not.toBe(freshMsgBId);

      const freshGames = await freshDatabase.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, freshChatId));
      expect(freshGames).toHaveLength(1);
      const freshGameId = freshGames[0]?.id ?? castId<RpgGameId>("none");

      // THE CROSS-LINK PROOF. Each plane must anchor to its OWN restored turn — snapshot/journal/tool-call
      // "A" (identified by its distinct value) must point at turn A's restored ids and explicitly NOT at
      // turn B's, and vice versa. A positional-index bug that swapped or collapsed the two turns fails these.
      const freshSnapshots = await freshDatabase
        .select({ location: rpgSnapshots.location, messageId: rpgSnapshots.messageId, variantId: rpgSnapshots.variantId })
        .from(rpgSnapshots)
        .where(eq(rpgSnapshots.gameId, freshGameId));
      expect(freshSnapshots).toHaveLength(2);
      const snapA = freshSnapshots.find((s) => s.location === "loc-turn-a");
      const snapB = freshSnapshots.find((s) => s.location === "loc-turn-b");
      expect(snapA?.messageId).toBe(freshMsgAId);
      expect(snapA?.variantId).toBe(freshVarAId);
      expect(snapA?.messageId).not.toBe(freshMsgBId);
      expect(snapA?.variantId).not.toBe(freshVarBId);
      expect(snapB?.messageId).toBe(freshMsgBId);
      expect(snapB?.variantId).toBe(freshVarBId);
      expect(snapB?.messageId).not.toBe(freshMsgAId);
      expect(snapB?.variantId).not.toBe(freshVarAId);

      const freshJournal = await freshDatabase
        .select({ title: rpgJournal.title, variantId: rpgJournal.variantId, sourceMessageId: rpgJournal.sourceMessageId })
        .from(rpgJournal)
        .where(eq(rpgJournal.gameId, freshGameId));
      expect(freshJournal).toHaveLength(2);
      const journalA = freshJournal.find((j) => j.title === "Journal Turn A");
      const journalB = freshJournal.find((j) => j.title === "Journal Turn B");
      expect(journalA?.sourceMessageId).toBe(freshMsgAId);
      expect(journalA?.variantId).toBe(freshVarAId);
      expect(journalA?.sourceMessageId).not.toBe(freshMsgBId);
      expect(journalA?.variantId).not.toBe(freshVarBId);
      expect(journalB?.sourceMessageId).toBe(freshMsgBId);
      expect(journalB?.variantId).toBe(freshVarBId);
      expect(journalB?.sourceMessageId).not.toBe(freshMsgAId);
      expect(journalB?.variantId).not.toBe(freshVarAId);

      const freshToolCalls = await freshDatabase
        .select({ messageId: rpgTurnToolCalls.messageId, variantId: rpgTurnToolCalls.variantId, calls: rpgTurnToolCalls.calls })
        .from(rpgTurnToolCalls)
        .where(eq(rpgTurnToolCalls.gameId, freshGameId));
      expect(freshToolCalls).toHaveLength(2);
      const ttcA = freshToolCalls.find((t) => t.calls[0]?.name === "action_a");
      const ttcB = freshToolCalls.find((t) => t.calls[0]?.name === "action_b");
      expect(ttcA?.messageId).toBe(freshMsgAId);
      expect(ttcA?.variantId).toBe(freshVarAId);
      expect(ttcA?.messageId).not.toBe(freshMsgBId);
      expect(ttcA?.variantId).not.toBe(freshVarBId);
      expect(ttcB?.messageId).toBe(freshMsgBId);
      expect(ttcB?.variantId).toBe(freshVarBId);
      expect(ttcB?.messageId).not.toBe(freshMsgAId);
      expect(ttcB?.variantId).not.toBe(freshVarAId);
    } finally {
      await rm(casDir, { recursive: true, force: true });
      await rm(variantDir, { recursive: true, force: true });
    }
  });
});
