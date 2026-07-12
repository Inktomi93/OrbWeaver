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
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  chats as chatsTable,
  galleryItems,
  messageAssets,
  messages as messagesTable,
  messageVariants,
  personas as personasTable,
  presets as presetsTable,
  tags as tagsTable,
  themes as themesTable,
  userSettings as userSettingsTable,
  worldBooks,
} from "@orb/db";
import type {
  ChatId,
  ChatParticipantId,
  Handle,
  MessageAssetId,
  MessageId,
  MessageVariantId,
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
import { expect, test } from "../../../support/fixtures";
import { makeRunnerDeps } from "../../domain/workloads/_support.ts";

// This suite builds TWO full service graphs (source `app` fixture + a fresh target box) and drives a real
// workload — it passes warm in ~2-3 s but exceeds vitest's 5 s default under parallel CPU contention. A
// generous per-suite timeout keeps CI from flaking on scheduling, not on real work.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// A minimal valid PNG (signature + a zero-length IEND) — `isPng` passes so the export-character avatar read
// embeds it directly (no image transcode), and the kit codec can weld the card tEXt chunk into it. Same
// fixture shape as tests/server/domain/import/verbs/import-character.test.ts.
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);
const GALLERY_BYTES = new TextEncoder().encode("gallery-blob-bytes-🖼");
const INLINE_BYTES = new TextEncoder().encode("inline-chat-image-bytes-📷");
// #67 — a user-ATTACHED inline image (kind `attachment`), carried by a `message_assets` structural row on
// the source; the bundle must re-create that retaining row on import (GC visibility), not just the body ref.
const ATTACH_BYTES = new TextEncoder().encode("composer-attachment-bytes-📎");

const OWNER_ID = castId<UserId>("user_p8_source_owner");

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
    json: (b, status = 200): Response =>
      new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }),
    body: (data, status = 200): Response => new Response(data, { status }),
    req: {
      query: (): string | undefined => undefined,
      raw: raw ?? new Request("http://t/", { method: "POST" }),
    },
  };
}
function libraryHandler(deps: ExportDeps): Handler {
  const routes = new Map<string, Handler>();
  const mockApp = {
    get: (path: string, fn: Handler): unknown => (routes.set(path, fn), mockApp),
  };
  // FABRICATION-OK: narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value.
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
    post: (path: string, fn: Handler): unknown => (routes.set(path, fn), mockApp),
  };
  // FABRICATION-OK: narrowing a captured mock app to Hono's registrar param — a test seam, not a domain value.
  registerImportBundle(mockApp as unknown as Parameters<typeof registerImportBundle>[0], deps);
  const handler = routes.get("/api/import/bundle");
  if (handler === undefined) {
    throw new Error("bundle route not registered");
  }
  return handler;
}

describe("P-8: the full-library bundle round-trips into a fresh box, self-contained + idempotent", () => {
  test("every entity + every asset-bearing reference travels; a re-import writes zero dupes", async ({
    db,
    app,
    clock,
  }) => {
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
      handle: castId<Handle>("hero"),
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
      star: false,
      archived: false,
      temporary: false,
      pendingHostUserId: null,
      anchorPersonaId: null,
      parentChatId: null,
      forkedAt: null,
      compactSummary: null,
      compactedAtSeq: null,
      metadata: null,
      variableValues: null,
      runtimeVariables: null,
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
        const row = await loadWorkload(freshDatabase, workloadId);
        if (row === null) {
          throw new Error("import-bundle workload row missing after start");
        }
        await runWorkload(
          makeRunnerDeps(freshDatabase, fresh.runnerEnv),
          row,
          new AbortController().signal,
        );
        const done = await loadWorkload(freshDatabase, workloadId);
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
        .where(and(eq(charactersTable.ownerId, targetId), eq(charactersTable.handle, "hero")));
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
      const avatarRestored =
        freshAvatarId === null || freshAvatarId === undefined
          ? null
          : await fresh.assets.loadAssetBytes(freshAvatarId);
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
      const rowsFor = async (
        table: typeof presetsTable | typeof themesTable | typeof tagsTable | typeof personasTable,
      ): Promise<number> => {
        const rows = await freshDatabase
          .select({ id: table.id })
          .from(table)
          .where(eq(table.ownerId, targetId));
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
      const freshBooks = await freshDatabase
        .select({ id: worldBooks.id })
        .from(worldBooks)
        .where(eq(worldBooks.ownerId, targetId));
      expect(freshBooks).toHaveLength(1);

      // The chat re-seated its host + character (handle-layout resolved on import).
      const freshHostSeat = await freshDatabase
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")));
      expect(freshHostSeat.length).toBeGreaterThanOrEqual(1);

      // The inline `asset:<id>` ref survives in the re-imported message CONTENT (verbatim, D51) AND resolves
      // to a live blob on the fresh box — not merely that the host seat exists.
      const freshHostChatId = freshHostSeat[0]?.chatId;
      const freshVariants = await freshDatabase
        .select({ content: messageVariants.content })
        .from(messageVariants)
        .innerJoin(messagesTable, eq(messagesTable.id, messageVariants.messageId))
        .where(eq(messagesTable.chatId, freshHostChatId ?? castId<ChatId>("none")));
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
        .where(eq(messagesTable.chatId, freshHostChatId ?? castId<ChatId>("none")));
      expect(freshMessageAssets.map((r) => r.assetId)).toContain(attachBlob.assetId);

      // user-settings VALUE transferred (a positive read, not just `failed === 0`): the seeded chat toggle.
      const freshSettings = await fresh.services.settings.loadUserSettings(targetId);
      expect(freshSettings.chat.continueOnSend).toBe(false);

      // ── IDEMPOTENT re-import: a SECOND upload writes ZERO new rows for EACH of the 10 entities ────────
      // Count every entity scoped to the target owner (chat via its host seat; gallery via its asset owner;
      // user-settings is the per-user singleton row) — the whole self-contained proof, per entity.
      const countAll = async (): Promise<Record<string, number>> => {
        const owned = async (
          table: typeof presetsTable | typeof themesTable | typeof tagsTable | typeof personasTable,
        ): Promise<number> =>
          (
            await freshDatabase
              .select({ id: table.id })
              .from(table)
              .where(eq(table.ownerId, targetId))
          ).length;
        return {
          character: (
            await freshDatabase
              .select({ id: charactersTable.id })
              .from(charactersTable)
              .where(eq(charactersTable.ownerId, targetId))
          ).length,
          chat: (
            await freshDatabase
              .select({ chatId: chatParticipants.chatId })
              .from(chatParticipants)
              .where(and(eq(chatParticipants.userId, targetId), eq(chatParticipants.role, "host")))
          ).length,
          persona: await owned(personasTable),
          worldInfo: (
            await freshDatabase
              .select({ id: worldBooks.id })
              .from(worldBooks)
              .where(eq(worldBooks.ownerId, targetId))
          ).length,
          preset: await owned(presetsTable),
          theme: await owned(themesTable),
          userSettings: (
            await freshDatabase
              .select({ id: userSettingsTable.userId })
              .from(userSettingsTable)
              .where(eq(userSettingsTable.userId, targetId))
          ).length,
          tag: await owned(tagsTable),
          gallery: (
            await freshDatabase
              .select({ id: galleryItems.id })
              .from(galleryItems)
              .innerJoin(assetsTable, eq(assetsTable.id, galleryItems.assetId))
              .where(eq(assetsTable.ownerId, targetId))
          ).length,
          assets: (
            await freshDatabase
              .select({ id: assetsTable.id })
              .from(assetsTable)
              .where(eq(assetsTable.ownerId, targetId))
          ).length,
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
        expect(n, `entity "${entity}" should have landed at least one row`).toBeGreaterThanOrEqual(
          1,
        );
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
});
