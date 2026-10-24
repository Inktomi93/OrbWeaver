// @subject tests/support/iso/corpus-search.ts
// @subject tests/support/node/corpus-search-wire.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import {
  fieldSearchResultSchema,
  searchSpaceStatusSchema,
  searchSuggestionSchema,
  similarArtHitSchema,
  unifiedSearchResultSchema,
} from "@orb/contracts/search";
import { closeDb, createDb, localPath, optimizeDb, preCloseHousekeeping, runMigrations } from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { cloneStageDb } from "@orb/tooling/snap";
import { z } from "zod";
import { createFrozenClock } from "../iso/clock.ts";
import type { CorpusWire } from "../iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import { createCorpusViewerReadResponder } from "../iso/corpus-read-responder.ts";
import type { CorpusSearchLibrary } from "../iso/corpus-search.ts";
import { publishCorpusSearch } from "../iso/corpus-search.ts";
import { createSeededIds } from "../iso/ids.ts";
import { seedCorpusActors } from "./corpus-actors.ts";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { corpusKnowledgeText } from "./corpus-knowledge.ts";
import { seedCorpusKnowledgeImages } from "./corpus-knowledge-images.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { captureCorpusSearchPublication, seedCorpusSearch, settleCorpusSearchImages } from "./corpus-search.ts";
import { createCorpusSearchWire, replayCorpusSearchWire } from "./corpus-search-wire.ts";
import { captureCookieAuth, captureCorpusReads, seedCorpusLibraries } from "./corpus-seed.ts";
import { SHIPPED_MIGRATIONS } from "./db.ts";
import { seedUserConnectionRows } from "./factories/rows/connection.ts";
import { seedUserCredential } from "./factories/rows/credentials.ts";
import { seedRecallCorpusRows } from "./factories/rows/recall.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("settled search publication survives native authenticated clone reads and refuses cross-viewer, request and secret splices", {
  tags: "slow",
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-search-publication-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const sourceLayout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "source") });
  const sourceDb = await createDb(sourceLayout.databaseUrl);
  const clock = createFrozenClock();
  const ids = createSeededIds();
  const authEnv = { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" };
  const physical = createCorpusSearchWire(
    createCorpusProviderExecution({
      modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: corpusKnowledgeText,
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    }).execute,
  );
  const produced = await (async (): Promise<{
    readonly wire: CorpusWire & { readonly searchLibrary: CorpusSearchLibrary };
    readonly exchanges: Parameters<typeof replayCorpusSearchWire>[0];
    readonly authentication: Awaited<ReturnType<typeof captureCookieAuth>>;
    readonly foreignId: Awaited<ReturnType<typeof seedCorpusActors>>["secondUserId"];
  }> => {
    try {
      await runMigrations(sourceDb, SHIPPED_MIGRATIONS);
      await using root = await createServerHarness({
        db: sourceDb,
        clock,
        ids,
        env: authEnv,
        providerFetch: (): Promise<Response> => Promise.reject(new Error("native search must use its supplied physical network edge")),
        networkExecution: { fetch: physical.execute },
        secretBoxKey: randomBytes(32),
        casDir: sourceLayout.assets,
        variantDir: sourceLayout.variants,
        importStagingDir: sourceLayout.importStaging,
      });
      const actors = await seedCorpusActors(root);
      const libraries = await seedCorpusLibraries(root);
      const recall = await seedRecallCorpusRows(root, {
        chatConnectionId: actors.connections.text.id,
        embedConnectionId: actors.connections.embed.id,
        summarizeConnectionId: actors.connections.text.id,
      });
      const images = await seedCorpusKnowledgeImages(root);
      const tiedCards: (typeof images.cards)[number][] = [];
      const tiedAssets = images.assets.toSorted((a, b) => b.hash.localeCompare(a.hash));
      const ownerCaller = await root.internalCallerFor(root.ownerId);
      // Shared native avatars make exact vector ties cross the overfetch boundary in a different hash order.
      for (let index = 0; index < 8; index += 1) {
        const asset = tiedAssets[index % tiedAssets.length];
        assert(asset !== undefined);
        const card = await ownerCaller.character.create({
          input: createCharacterSchema.parse({
            handle: `tied-portrait-${index}`,
            name: `Tied portrait ${index}`,
            description: "A character sharing an owned portrait.",
          }),
        });
        tiedCards.push(await ownerCaller.character.update({ characterId: card.id, input: { avatarAssetId: asset.id } }));
      }
      const source = await seedCorpusSearch(root, { actors, libraries, recall, images });
      expect(source.lexical.foreignSuggestions).toEqual([]);
      const earlier = structuredClone(source.reads);
      const caller = await root.internalCallerFor(root.ownerId);
      const added = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "settled-search-witness",
          name: "Orbital settled witness",
          description: "A later producer changes the lexical population.",
        }),
      });
      const addedDocument = await caller.databank.createFromText({
        name: "Settled search source",
        text: "A later native document records the orbital ledger.",
      });
      const ingested = await root.app.databankIngest.ingestDocument({ documentId: addedDocument.document.id, signal: new AbortController().signal });
      expect(ingested.chunksUpserted).toBeGreaterThan(0);
      const authentication = await captureCookieAuth(root, actors.owner, "private-source-search-password");
      const reads = await captureCorpusReads(root, {
        soloChatId: libraries.room.chat.id,
        groupChatId: source.group.room.chat.id,
        documentId: libraries.document.id,
      });
      const base = hydrateCorpusWire({
        auth: authentication.auth,
        reads,
        health: healthResponseSchema.parse(await (await root.http.request("/healthz")).json()),
      });
      const before = await captureCorpusSearchPublication(root, source);
      expect(before.reads.fields.output.hits.some((hit) => hit.characterId === added.id)).toBe(true);
      expect(before.reads.fields.output).not.toEqual(source.reads.fields);
      assert(before.reads.documents.output.over === "documents");
      expect(before.reads.documents.output.hits.some((hit) => hit.documentId === addedDocument.document.id)).toBe(true);
      expect(before.reads.documents.output).not.toEqual(source.reads.outputs.find((output) => output.over === "documents"));
      const captured = { ...base, searchLibrary: before };
      const parsed = parseCorpusWire(serializeCorpusWire(captured, authentication.secrets));
      expect(parsed.searchLibrary).toEqual(before);
      expect(source.reads).toEqual(earlier);
      for (const name of Object.keys(before.reads)) {
        const changed = structuredClone(captured);
        Object.assign(Reflect.get(changed.searchLibrary.reads, name), { input: null });
        expect(() => serializeCorpusWire(changed, authentication.secrets)).toThrow("publication recipe");
      }
      const wrongLens = structuredClone(captured);
      Object.assign(wrongLens.searchLibrary.reads.imagesRaw.input, { lens: "image-captioned" });
      expect(() => serializeCorpusWire(wrongLens, authentication.secrets)).toThrow("publication recipe");
      const malformed = structuredClone(captured);
      Reflect.deleteProperty(malformed.searchLibrary.reads.fields.output, "coverage");
      expect(() => serializeCorpusWire(malformed, authentication.secrets)).toThrow("coverage");
      const wrongBranch = structuredClone(captured);
      Object.assign(wrongBranch.searchLibrary.reads.documents, { output: before.reads.imagesRaw.output });
      expect(() => serializeCorpusWire(wrongBranch, authentication.secrets)).toThrow("retrieval cohort mismatch");
      const changedRoom = structuredClone(captured);
      const firstRoom = changedRoom.searchLibrary.rooms[0];
      assert(firstRoom !== undefined);
      Object.assign(firstRoom, { input: null });
      expect(() => serializeCorpusWire(changedRoom, authentication.secrets)).toThrow("publication recipe");
      const snapshot = { viewerUserId: before.viewerUserId, read: before.reads.segments };
      expect(createCorpusViewerReadResponder("search.search", root.ownerId, snapshot)(snapshot.read.input)).toEqual(snapshot.read.output);
      expect(() => createCorpusViewerReadResponder("search.search", actors.secondUserId, snapshot)).toThrow("snapshot viewer does not match");
      const foreign = await root.internalCallerFor(actors.secondUserId);
      const foreignViewer = await foreign.sessions.me();
      const foreignRoom = await foreign.chat.startChat({ characterIds: [], opening: "none" });
      const foreignChat = await foreign.chat.getChat({ chatId: foreignRoom.chat.id });
      expect(foreignChat.viewerIsHost).toBe(true);
      const foreignSplice = structuredClone(captured);
      Object.assign(foreignSplice.searchLibrary, { viewerUserId: actors.secondUserId, rooms: [{ input: { chatId: foreignChat.id }, output: foreignChat }] });
      Object.assign(foreignSplice.searchLibrary.reads.viewer, { output: foreignViewer });
      expect(() => serializeCorpusWire(foreignSplice, authentication.secrets)).toThrow("retrieval cohort mismatch");
      const memberRooms: CorpusSearchLibrary["rooms"][number][] = [];
      const member = await root.principalFor(actors.secondUserId);
      for (const room of before.rooms) {
        const invite = await root.services.chat.createInvite({
          principal: actors.owner,
          chatId: typeIdSchema(ID_PREFIX.chat).parse(room.input.chatId),
          input: { invitedHandle: member.handle },
        });
        await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
        const output = await foreign.chat.getChat(room.input);
        expect(output.viewerIsHost).toBe(false);
        memberRooms.push({ input: room.input, output });
      }
      expect((await foreign.search.search(before.reads.segments.input)).hits).toEqual([]);
      const memberSplice = structuredClone(captured);
      Object.assign(memberSplice.searchLibrary, { viewerUserId: actors.secondUserId, rooms: memberRooms });
      Object.assign(memberSplice.searchLibrary.reads.viewer, { output: foreignViewer });
      expect.soft(() => serializeCorpusWire(memberSplice, authentication.secrets)).toThrow("retrieval cohort mismatch");
      const serialized = serializeCorpusWire(captured, authentication.secrets);
      const sectionMarker = JSON.stringify(publishCorpusSearch(before));
      expect(serialized.split(sectionMarker)).toHaveLength(2);
      const memberPublished = JSON.stringify({
        viewerUserId: actors.secondUserId,
        ids: before.ids,
        rooms: memberRooms.map((room) => room.output),
        reads: Object.fromEntries(Object.entries(memberSplice.searchLibrary.reads).map(([name, read]) => [name, read.output])),
      });
      expect.soft(() => parseCorpusWire(serialized.replace(sectionMarker, memberPublished))).toThrow("retrieval cohort mismatch");
      const secret = 'native-search-"credential"\\959';
      const credential = await seedUserCredential(root, { principal: actors.owner, provider: "custom-openai", key: secret });
      const secrets = [...authentication.secrets, secret, credential.row.ciphertext, credential.row.iv, credential.row.tag];
      const witness = images.cards[0];
      assert(witness !== undefined);
      for (const spelling of [secret, JSON.stringify(secret), JSON.stringify({ echo: secret })]) {
        await caller.character.update({ characterId: witness.id, input: { name: spelling } });
        const output = await caller.search.fields(before.reads.fields.input);
        expect(output.hits.find((hit) => hit.characterId === witness.id)?.name).toBe(spelling);
        const echoed = structuredClone(captured);
        Object.assign(echoed.searchLibrary.reads.fields, { output });
        expect(() => serializeCorpusWire(echoed, secrets)).toThrow("Corpus publication contains private material");
      }
      await caller.character.update({ characterId: witness.id, input: { name: witness.name } });
      Object.assign(malformed.searchLibrary.reads.fields.output, { [secret]: true });
      expect(() => serializeCorpusWire(malformed, secrets)).toThrow("Corpus publication contains private material");
      const temporary = await seedUserConnectionRows(root, {
        principal: actors.owner,
        providerId: "custom-openai",
        credentialId: null,
        baseUrl: CORPUS_PROVIDER_ENDPOINT,
        model: CORPUS_EMBED_MODEL,
        allowBackground: true,
        declared: {
          kind: "embedding",
          embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"] },
          features: { detectServer: false },
        },
      });
      await caller.connection.setBinding({ task: "imageEmbed", connectionId: temporary.id });
      await caller.connection.setBinding({ task: "imageEmbed", connectionId: images.connection.id });
      await root.settleBackground();
      expect(await caller.search.spaceStatus()).toEqual({ paused: true, embed: false, imageEmbed: true });
      const restoredJobs = await settleCorpusSearchImages(root);
      expect(restoredJobs).toMatchObject([{ kind: "index", status: "succeeded", params: { source: "image" } }]);
      const restored = await captureCorpusSearchPublication(root, source);
      assert(restored.reads.imagesRaw.output.over === "images");
      expect(restored.reads.imagesRaw.output.hits.length).toBeGreaterThan(0);
      expect(restored.reads.imagesRaw.output.hits.every((hit) => hit.lens === "image-raw")).toBe(true);
      expect(restored.reads.status.output).toEqual({ paused: false, embed: false, imageEmbed: false });
      const expectedNeighbours = restored.reads.similarRaw.output.map((hit) => hit.characterId).toSorted();
      expect(expectedNeighbours).toEqual(expect.arrayContaining(tiedCards.map((card) => card.id)));
      expect(restored.reads.similarRaw.output.map((hit) => hit.characterId)).toEqual(expectedNeighbours);
      expect(restored.reads.similarRaw.output.every((hit) => hit.score === 0 && hit.relevance === 1)).toBe(true);
      // Graceful source shutdown refreshes planner statistics before the real DB/CAS clone is read.
      await optimizeDb(sourceDb);
      const analyzed = await captureCorpusSearchPublication(root, source);
      expect(analyzed.reads.similarRaw).toEqual(restored.reads.similarRaw);
      expect(analyzed.reads.similarCaptioned).toEqual(restored.reads.similarCaptioned);
      expect(analyzed.reads.imagesRaw).toEqual(restored.reads.imagesRaw);
      expect(analyzed.reads.imagesCaptioned).toEqual(restored.reads.imagesCaptioned);
      for (const read of [restored.reads.similarRaw, restored.reads.similarCaptioned]) {
        expect(await caller.search.similarArt({ ...read.input, topN: 1 })).toEqual(read.output.slice(0, 1));
      }
      for (const read of [restored.reads.imagesRaw, restored.reads.imagesCaptioned]) {
        assert(read.output.over === "images");
        expect(read.output.hits.every((hit) => hit.score === 0 && hit.relevance === 1)).toBe(true);
        const assetIds = read.output.hits.map((hit) => hit.assetId);
        expect(assetIds).toEqual(assetIds.toSorted());
        expect((await caller.search.search({ ...read.input, topN: 1 })).hits).toEqual(read.output.hits.slice(0, 1));
      }
      await caller.connection.setBinding({ task: "imageEmbed", connectionId: null });
      await root.settleBackground();
      // Clearing retains the completed generation until the next native sweep selects captioned fallback.
      expect(await caller.search.spaceStatus()).toEqual({ paused: false, embed: false, imageEmbed: false });
      const fallbackJobs = await settleCorpusSearchImages(root);
      expect(fallbackJobs).toMatchObject([{ kind: "index", status: "succeeded", params: { source: "image" } }]);
      const fallback = await captureCorpusSearchPublication(root, source);
      assert(fallback.reads.imagesRaw.output.over === "images");
      expect(fallback.reads.imagesRaw.output.hits.length).toBeGreaterThan(0);
      expect(fallback.reads.imagesRaw.output.hits.every((hit) => hit.lens === "image-captioned")).toBe(true);
      expect(fallback.reads.similarRaw.output.length).toBeGreaterThan(0);
      expect(fallback.reads.similarRaw.output.every((hit) => hit.lens === "image-captioned")).toBe(true);
      expect(fallback.reads.imagesRaw.input.lens).toBe("image-raw");
      await caller.connection.setBinding({ task: "imageEmbed", connectionId: images.connection.id });
      expect(await settleCorpusSearchImages(root)).toMatchObject([{ kind: "index", status: "succeeded", params: { source: "image" } }]);
      const final = await physical.capture(() => captureCorpusSearchPublication(root, source));
      expect(final.value.reads.similarRaw.output).toEqual(restored.reads.similarRaw.output);
      expect(final.value.reads.similarCaptioned.output).toEqual(restored.reads.similarCaptioned.output);
      expect(final.value.reads.status.output).toEqual({ paused: false, embed: false, imageEmbed: false });
      const wire = { ...base, searchLibrary: final.value };
      expect(parseCorpusWire(serializeCorpusWire(wire, secrets)).searchLibrary).toEqual(final.value);
      await root.settleBackground();
      return { wire, exchanges: final.exchanges, authentication, foreignId: actors.secondUserId };
    } finally {
      await preCloseHousekeeping(sourceDb);
    }
  })();
  const cloneLayout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "clone") });
  const sourcePath = localPath(sourceLayout.databaseUrl);
  assert(sourcePath !== undefined);
  cloneStageDb(sourcePath, { databaseUrl: cloneLayout.databaseUrl, assetsDir: cloneLayout.assets });
  const db = await createDb(cloneLayout.databaseUrl);
  ownership.defer(() => closeDb(db));
  const replay = replayCorpusSearchWire(produced.exchanges);
  await using clone = await createServerHarness({
    db,
    clock,
    ids,
    env: authEnv,
    ownerId: produced.wire.searchLibrary.viewerUserId,
    providerFetch: replay.execute,
    casDir: cloneLayout.assets,
    variantDir: cloneLayout.variants,
    importStagingDir: cloneLayout.importStaging,
  });
  const section = produced.wire.searchLibrary;
  const principal = await clone.principalFor(section.viewerUserId);
  await expect(captureCorpusCookieIdentity(clone, produced.authentication.identity.viewer, produced.authentication.cookie)).rejects.toThrow(
    "request refused (401)",
  );
  const authentication = await captureCookieAuth(clone, principal, "fresh-private-search-clone-password");
  const address = await clone.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  for (const [path, captures, schema] of [
    [
      "search.search",
      [
        section.reads.entities,
        section.reads.characters,
        section.reads.discover,
        section.reads.digests,
        section.reads.corpus,
        section.reads.documents,
        section.reads.segments,
        section.reads.imagesRaw,
        section.reads.imagesCaptioned,
      ],
      unifiedSearchResultSchema,
    ],
    ["search.fields", [section.reads.fields], fieldSearchResultSchema],
    ["search.suggest", [section.reads.suggest], searchSuggestionSchema.array()],
    ["search.similarArt", [section.reads.similarRaw, section.reads.similarCaptioned], similarArtHitSchema.array()],
    ["search.spaceStatus", [section.reads.status], searchSpaceStatusSchema],
  ] as const) {
    for (const read of captures) {
      const url = new URL(`/api/trpc/${path}`, origin);
      if (read.input !== undefined) {
        url.searchParams.set("input", JSON.stringify(read.input));
      }
      const response = await fetch(url, { headers: { cookie: authentication.cookie, forwarded: "" } });
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(z.object({ result: z.object({ data: schema }) }).parse(body).result.data).toEqual(read.output);
    }
  }
  expect(replay.remaining()).toBe(0);
  const exchange = produced.exchanges[0];
  assert(exchange !== undefined, "native settled search did not exercise the physical provider edge");
  await expect(
    replay.execute(new Request(exchange.url, { method: exchange.method, ...(exchange.method === "GET" ? {} : { body: exchange.body }) })),
  ).rejects.toThrow("exhausted native search provider request");
  const foreignPrincipal = await clone.principalFor(produced.foreignId);
  const foreignAuthentication = await captureCookieAuth(clone, foreignPrincipal, "fresh-private-search-member-password");
  const scoped = new URL("/api/trpc/search.search", origin);
  scoped.searchParams.set("input", JSON.stringify(section.reads.segments.input));
  const response = await fetch(scoped, { headers: { cookie: foreignAuthentication.cookie, forwarded: "" } });
  expect(response.status).toBe(200);
  const foreignOutput = z.object({ result: z.object({ data: unifiedSearchResultSchema }) }).parse(await response.json()).result.data;
  expect(foreignOutput.hits).toEqual([]);
  expect(JSON.stringify(foreignOutput)).not.toContain(JSON.stringify(section.reads.segments.output.hits));
});
