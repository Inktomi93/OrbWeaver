// Handle copies and restore lookups outside `findByHandle`: a card stored before the handle alphabet keeps its
// links through a handoff copy and a library round trip, and a synthetic group row is never seated, copied,
// exported or bound. A legacy handle and a seated group row have no producing verb, so those rows are written directly.
// @subject packages/server/src/domain/character/persistence/handoff-copy-write.ts
// @subject packages/server/src/domain/character/persistence/queries.ts
// @subject packages/server/src/domain/chat/persistence/seat-characters.ts
// @subject packages/server/src/domain/character/persistence/gallery-character.ts
// @subject packages/server/src/domain/databank/persistence/portability-write.ts
// @subject packages/server/src/domain/imagery/persistence/portability-read.ts
// @subject packages/server/src/domain/imagery/persistence/portability-write.ts
import { characterHandleSchema, createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { portableImageryCallSchema } from "@orb/contracts/imagery";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableFile, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { characters, chatParticipants, imageryGenerations } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterHandle, CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
} from "@orb/testkit/node/composed";
import { seedChatInviteRows, seedInvitedChatParticipantRows } from "@orb/testkit/node/rows";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
/** Asset ids restore verbatim, so the exporting box mints from its own band. */
const SOURCE_ID_CURSOR = 2 ** 29;
/** Inside the length cap, outside the alphabet. */
const LEGACY_HANDLE = castId<CharacterHandle>("..");
const NAME = "Wanderer";
const DOCUMENT_NAME = "Ring survey";
const TEXT_MIME = "text/plain";
const IMAGE_MODEL = "ring-image-v1";
const ROUND_TRIP_KINDS = ["character", "assets", "gallery", "databank", "imagery"] as const satisfies readonly PortableKind[];
const documentFileSchema = z.object({ characterHandles: z.array(z.string()) }).loose();

function imageProvider(pictures: Uint8Array[]): typeof fetch {
  return createCorpusProviderExecution({
    modelIds: [IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: pictures,
  }).execute;
}

/** A local box whose loopback requests act as its owner, after that owner's first-login seed has settled. */
async function signedInBox(options: { readonly ids?: ReturnType<typeof createSeededIds>; readonly pictures?: Uint8Array[] } = {}): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    ...(options.pictures === undefined ? {} : { providerFetch: imageProvider(options.pictures) }),
  });
  expect((await root.http.request(SIGNED_IN_ROUTE)).status).toBe(200);
  await root.settleBackground();
  return root;
}

async function createCharacter(root: ServerTestHarness, handle: string, name: string): Promise<CharacterId> {
  const created = await root.services.character.create({
    principal: await root.principalFor(root.ownerId),
    input: createCharacterSchema.parse({ handle, name, description: "A wanderer maps the outer rings." }),
  });
  return created.id;
}

/** One portrait of `subject` through the owner's own image binding, filed in the subject's gallery. */
async function portraitOf(root: ServerTestHarness, pictures: Uint8Array[], subject: CharacterId): Promise<AssetId> {
  pictures.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const connection = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: owner, task: "generateImage", connectionId: connection.id });
  const picture = await root.services.imagery.generatePicture({
    caller: owner,
    mode: "character",
    prompt: "A wanderer at the ring's edge.",
    subjectCharacterId: subject,
    gallery: { subjectCharacterId: subject },
    n: 1,
  });
  const [image] = picture.images;
  if (image === undefined) {
    throw new Error("the image generation returned no picture");
  }
  return image.assetId;
}

async function uploadDocument(root: ServerTestHarness): Promise<DocumentId> {
  const { document } = await root.services.databank.upload({
    principal: await root.principalFor(root.ownerId),
    bytes: new TextEncoder().encode("The outer rings drift one degree each cycle."),
    mime: TEXT_MIME,
    name: DOCUMENT_NAME,
  });
  return document.id;
}

async function exportedFiles(root: ServerTestHarness, kind: PortableKind, ownerId: UserId): Promise<PortableFile[]> {
  const descriptor = root.app.portability.find((entity) => entity.kind === kind);
  if (descriptor === undefined) {
    throw new Error(`production composition has no ${kind} portability descriptor`);
  }
  const files: PortableFile[] = [];
  for await (const file of descriptor.exportAll(ownerId)) {
    files.push(file);
  }
  return files;
}

async function importFile(root: ServerTestHarness, kind: PortableKind, file: PortableFile): Promise<PortableImportOutcome> {
  const descriptor = root.app.portability.find((entity) => entity.kind === kind);
  if (descriptor === undefined) {
    throw new Error(`production composition has no ${kind} portability descriptor`);
  }
  return await descriptor.importFile(root.ownerId, file);
}

/** Upload the bundle and run its import workload to the end. */
async function restore(root: ServerTestHarness, bundle: Uint8Array): Promise<string> {
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: bundle });
  const { workloadId } = importStartedSchema.parse(await response.json());
  await root.runAdmittedWorkload?.(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  return (await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: workloadId })).status;
}

/** The subject each imported imagery output of `assetId` was linked to. */
async function importedSubjects(root: ServerTestHarness, assetId: AssetId): Promise<readonly (CharacterId | null)[]> {
  const rows = await root.db
    .select({ subject: imageryGenerations.subjectCharacterId })
    .from(imageryGenerations)
    .where(and(eq(imageryGenerations.assetId, assetId), isNotNull(imageryGenerations.importSource)));
  return rows.map((row) => row.subject);
}

test("a handoff copy of a card stored outside the alphabet lands under an in-alphabet handle", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const characterId = await createCharacter(root, "wanderer", NAME);
  const { chat } = await root.services.chat.startChat({ principal: owner, characterIds: [characterId], title: "Outer rings" });
  await root.db.update(characters).set({ handle: LEGACY_HANDLE }).where(eq(characters.id, characterId));
  const invite = await seedChatInviteRows(root, { principal: owner, chatId: chat.id, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipantRows(root, { principal: member, inviteId: invite.id });
  await root.services.chat.nominateHostHandoff({
    principal: owner,
    chatId: chat.id,
    userId: member.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId: chat.id });

  const accepted = await (await root.internalCallerFor(member.userId)).chat.getChat({ chatId: chat.id });
  const seated = accepted.participants.flatMap((participant) => (participant.characterId === null ? [] : [participant.characterId]));
  const copies = await Promise.all(seated.map(async (id) => await root.services.character.get({ principal: member, characterId: id })));
  expect(copies.map((copy) => ({ copied: copy.id !== characterId, inAlphabet: characterHandleSchema.safeParse(copy.handle).success }))).toEqual([
    { copied: true, inAlphabet: true },
  ]);
});

test("a card stored outside the alphabet keeps its gallery, databank and imagery links through a library round trip", async () => {
  const pictures: Uint8Array[] = [];
  await using source = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR), pictures });
  const owner = await source.principalFor(source.ownerId);
  const characterId = await createCharacter(source, "wanderer", NAME);
  const assetId = await portraitOf(source, pictures, characterId);
  const documentId = await uploadDocument(source);
  await source.services.databank.attachToCharacter({ principal: owner, documentId, characterId });
  await source.db.update(characters).set({ handle: LEGACY_HANDLE }).where(eq(characters.id, characterId));
  const download = await source.http.request(`${EXPORT_ROUTE}?kinds=${ROUND_TRIP_KINDS.join(",")}`);
  expect(download.status).toBe(200);
  const bundle = new Uint8Array(await download.arrayBuffer());

  await using target = await signedInBox();
  const status = await restore(target, bundle);
  const principal = await target.principalFor(target.ownerId);
  const restored = (await (await target.internalCallerFor(target.ownerId)).character.list({})).items.filter((item) => item.name === NAME);
  const restoredIds = restored.map((item) => item.id);
  const gallery = await target.services.assets.listGallery({ principal, limit: 100 });
  const documents = (await target.services.databank.list({ principal })).items.filter((item) => item.name === DOCUMENT_NAME);
  const attached = await Promise.all(
    documents.map(async (item) => (await target.services.databank.listAttachments({ principal, id: item.id })).characters.map((ref) => ref.id)),
  );
  const imagerySubjects = await importedSubjects(target, assetId);

  expect({
    status,
    restored: restored.length,
    gallery: gallery
      .filter((item) => item.assetId === assetId)
      .map((item) => item.subjectCharacterId !== null && restoredIds.includes(item.subjectCharacterId)),
    attached: attached.map((ids) => ids.filter((id) => restoredIds.includes(id)).length),
    imagery: imagerySubjects.map((subject) => subject !== null && restoredIds.includes(subject)),
  }).toEqual({ status: "succeeded", restored: 1, gallery: [true], attached: [1], imagery: [true] });
});

test("a databank or imagery file naming a synthetic group handle attaches nothing to the group row", async () => {
  const pictures: Uint8Array[] = [];
  await using root = await signedInBox({ pictures });
  const owner = await root.principalFor(root.ownerId);
  const characterId = await createCharacter(root, "wanderer", NAME);
  const { chat } = await root.services.chat.startChat({ principal: owner, characterIds: [characterId], title: "Outer rings" });
  const group = await root.services.character.mintSyntheticGroupCharacter({ ownerId: root.ownerId, chatId: chat.id });
  const groupHandle = (await root.services.character.get({ principal: owner, characterId: group.characterId })).handle;
  const assetId = await portraitOf(root, pictures, characterId);
  const documentId = await uploadDocument(root);

  const [documentFile] = await exportedFiles(root, "databank", root.ownerId);
  const [imageryFile] = await exportedFiles(root, "imagery", root.ownerId);
  if (documentFile === undefined || imageryFile === undefined) {
    throw new Error("the owner's export produced no databank or imagery file");
  }
  const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
  const decoded = (file: PortableFile): unknown => JSON.parse(new TextDecoder().decode(file.bytes));
  const craftedDocument = { ...documentFileSchema.parse(decoded(documentFile)), characterHandles: [groupHandle] };
  const call = portableImageryCallSchema.loose().parse(decoded(imageryFile));
  // A changed prompt is a different execution, so the restore writes a fresh imported row rather than deduping.
  const craftedCall = { ...call, execution: { ...call.execution, prompt: `${call.execution.prompt} again`, subjectCharacterHandle: groupHandle } };

  const documentOutcome = await importFile(root, "databank", { ...documentFile, bytes: encode(craftedDocument) });
  const imageryOutcome = await importFile(root, "imagery", { ...imageryFile, bytes: encode(craftedCall) });
  const attachments = await root.services.databank.listAttachments({ principal: owner, id: documentId });

  expect({
    documentOk: documentOutcome.ok,
    imageryOk: imageryOutcome.ok,
    attachedToGroup: attachments.characters.some((ref) => ref.id === group.characterId),
    imagerySubjects: await importedSubjects(root, assetId),
  }).toEqual({ documentOk: true, imageryOk: true, attachedToGroup: false, imagerySubjects: [null] });
});

/** A room seating `characterIds`, and the synthetic group row its narrator rounds would mint. */
async function roomWithGroupRow(
  root: ServerTestHarness,
  characterIds: readonly CharacterId[],
): Promise<{ readonly chatId: ChatId; readonly groupId: CharacterId }> {
  const { chat } = await root.services.chat.startChat({
    principal: await root.principalFor(root.ownerId),
    characterIds: [...characterIds],
    title: "Outer rings",
  });
  const group = await root.services.character.mintSyntheticGroupCharacter({ ownerId: root.ownerId, chatId: chat.id });
  return { chatId: chat.id, groupId: group.characterId };
}

async function refusal(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
    return "accepted";
  } catch (error) {
    return error instanceof DomainNotFoundError ? "not-found" : "other";
  }
}

test("a synthetic group row can neither found a room nor join one", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const { chatId, groupId } = await roomWithGroupRow(root, [await createCharacter(root, "wanderer", NAME)]);
  const founded = await refusal(root.services.chat.startChat({ principal: owner, characterIds: [groupId], title: "Group squat" }));
  const joined = await refusal(root.services.chat.addCharacterToChat({ principal: owner, chatId, characterId: groupId }));
  const seated = (await root.services.chat.getChat({ principal: owner, chatId })).participants.map((participant) => participant.characterId);
  expect({ founded, joined, groupSeated: seated.includes(groupId) }).toEqual({ founded: "not-found", joined: "not-found", groupSeated: false });
});

test("a handoff copies a room's cards but never its seated synthetic group row", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const keeperId = await createCharacter(root, "keeper", "Keeper");
  const { chatId, groupId } = await roomWithGroupRow(root, [await createCharacter(root, "wanderer", NAME), keeperId]);
  const groupName = (await root.services.character.get({ principal: owner, characterId: groupId })).name;
  // A room seated before the seat gate: the second character seat points at the group row.
  await root.db
    .update(chatParticipants)
    .set({ characterId: groupId })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, keeperId)));
  const invite = await seedChatInviteRows(root, { principal: owner, chatId, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipantRows(root, { principal: member, inviteId: invite.id });
  await root.services.chat.nominateHostHandoff({ principal: owner, chatId, userId: member.userId, offer: { copyCharacters: true, copyGmPreset: false } });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId });

  const library = (await (await root.internalCallerFor(member.userId)).character.list({})).items.map((item) => item.name);
  expect({ copiedCard: library.includes(NAME), copiedGroup: library.includes(groupName) }).toEqual({ copiedCard: true, copiedGroup: false });
});

const galleryFileSchema = z
  .object({ items: z.array(z.object({ assetId: typeIdSchema(ID_PREFIX.asset), subjectCharacterHandle: z.string().nullable() }).loose()) })
  .loose();

test("an owner's export names no synthetic group row as a gallery, databank or imagery subject", async () => {
  const pictures: Uint8Array[] = [];
  await using root = await signedInBox({ pictures });
  const owner = await root.principalFor(root.ownerId);
  const { groupId } = await roomWithGroupRow(root, [await createCharacter(root, "wanderer", NAME)]);
  const assetId = await portraitOf(root, pictures, groupId);
  const documentId = await uploadDocument(root);
  await root.services.databank.attachToCharacter({ principal: owner, documentId, characterId: groupId });
  const nativeSubjects = await root.db
    .select({ subject: imageryGenerations.subjectCharacterId })
    .from(imageryGenerations)
    .where(and(eq(imageryGenerations.assetId, assetId), isNull(imageryGenerations.importSource)));
  const decoded = async (kind: PortableKind): Promise<unknown[]> =>
    (await exportedFiles(root, kind, root.ownerId)).map((file) => JSON.parse(new TextDecoder().decode(file.bytes)));

  expect({
    // Each export source holds the group row, so a missing filter would carry its handle out.
    held: {
      gallery: (await root.services.assets.listGallery({ principal: owner, limit: 100 })).some((item) => item.subjectCharacterId === groupId),
      databank: (await root.services.databank.listAttachments({ principal: owner, id: documentId })).characters.some((ref) => ref.id === groupId),
      imagery: nativeSubjects.map((row) => row.subject),
    },
    // The first-login seed files its own gallery items; only the portrait's item is in question.
    gallery: (await decoded("gallery")).flatMap((file) =>
      galleryFileSchema
        .parse(file)
        .items.filter((item) => item.assetId === assetId)
        .map((item) => item.subjectCharacterHandle),
    ),
    databank: (await decoded("databank")).flatMap((file) => documentFileSchema.parse(file).characterHandles),
    imagery: (await decoded("imagery")).map((file) => portableImageryCallSchema.loose().parse(file).execution.subjectCharacterHandle),
  }).toEqual({ held: { gallery: true, databank: true, imagery: [groupId] }, gallery: [null], databank: [], imagery: [null] });
});
