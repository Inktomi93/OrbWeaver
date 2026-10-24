// One assets-gc box on the real composition root: a scratch CAS, a scripted image provider and the owner Principal.
// Shared by the assets suites whose verdict is what the one reference collector keeps: the sweep, its
// unreadable-reference persistence suite, the portability export and the sweep's overlap with an import.

import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { assets, closeDb } from "@orb/db";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, CharacterHandle, ChatId, MessageId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { Cas } from "@orb/server/infra/storage/cas";
import { createCas } from "@orb/server/infra/storage/cas";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { onTestFinished } from "vitest";

export const PNG = "image/png";
const MS_PER_SECOND = 1000;
const WORKLOAD_DEADLINE_MS = 30_000;
export const GC_IMAGE_MODEL = "gc-image-v1";

export interface GcBox {
  readonly root: ServerTestHarness;
  readonly cas: Cas;
  readonly principal: Principal;
  readonly images: Uint8Array[];
}

export interface StoredRef {
  readonly assetId: AssetId;
  readonly hash: string;
}

/** A box whose loopback HTTP requests act as its owner, so a suite can drive the export and import routes. */
const LOOPBACK_OWNER = { physicalPeer: () => "127.0.0.1", authConfig: { mode: "local", fallback: "owner" } } as const;

/** One harness on a scratch CAS; a supplied db is closed after the harness that used it. The scripted provider
 *  answers only an image generation, with whatever bytes a test pushes into `images` first. */
export async function openBox(db?: Db, options: { readonly loopbackOwner?: boolean; readonly ids?: ServerHarnessOptions["ids"] } = {}): Promise<GcBox> {
  const dir = await mkdtemp(join(tmpdir(), "orb-assets-gc-"));
  const casDir = join(dir, "cas");
  const images: Uint8Array[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [GC_IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images,
  });
  const root = await createServerHarness({
    startJobs: false,
    casDir,
    providerFetch: wire.execute,
    ...(db === undefined ? {} : { db }),
    ...(options.loopbackOwner === true ? LOOPBACK_OWNER : {}),
    ...(options.ids === undefined ? {} : { ids: options.ids }),
  });
  onTestFinished(async () => {
    await root[Symbol.asyncDispose]();
    if (db !== undefined) {
      closeDb(db);
    }
    await rm(dir, { recursive: true, force: true });
  });
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  // A committed message resolves the room's chat connection even when nothing generates; nothing here calls it.
  await seedCorpusConnections(root, principal);
  return { root, cas: createCas(casDir), principal, images };
}

/** An asset a production writer stored on its own, resolved to the `(id, hash)` the sweep keys on. */
export async function storedRow(box: GcBox, assetId: AssetId): Promise<StoredRef> {
  const row = await box.root.db.select({ hash: assets.hash }).from(assets).where(eq(assets.id, assetId)).get();
  if (row === undefined) {
    throw new Error("a production writer pointed at an asset with no index row");
  }
  return { assetId, hash: row.hash };
}

export async function store(
  box: GcBox,
  kind: "attachment" | "avatar" | "background" | "gallery" | "generated",
  bytes: Uint8Array = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset)),
): Promise<StoredRef> {
  const stored = await box.root.services.assets.store({ principal: box.principal, bytes, kind, mime: PNG });
  return { assetId: stored.assetId, hash: stored.hash };
}

/** A week ago is one scheduled-GC period: far outside any grace window. */
export function aWeekAgo(box: GcBox): number {
  return box.root.clock.now() - CADENCE_INTERVAL_MS.weekly;
}

/** Stamp every blob as last put at `atMs` (the lever `putBytes` pulls on every write and dedup hit). */
export async function stampEveryBlob(box: GcBox, atMs: number): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  for await (const owner of box.cas.listOwners()) {
    for await (const hash of box.cas.listHashes(castId<UserId>(owner))) {
      await utimes(box.cas.blobPath(castId<UserId>(owner), hash), seconds, seconds);
    }
  }
}

export async function stampBlob(box: GcBox, ref: StoredRef, atMs: number): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  await utimes(box.cas.blobPath(box.root.ownerId, ref.hash), seconds, seconds);
}

/** Only `refs` are past grace, so they are the only blobs the sweep can reach a destructive edge for. */
export async function ageOnly(box: GcBox, ...refs: readonly StoredRef[]): Promise<void> {
  await stampEveryBlob(box, box.root.clock.now());
  for (const ref of refs) {
    await stampBlob(box, ref, aWeekAgo(box));
  }
}

/** Enqueue the assets-gc workload the boot seed schedules. */
export async function startGc(box: GcBox): Promise<WorkloadId> {
  const started = await box.root.services.workloads.start({
    caller: box.principal,
    mode: "bulk",
    ownerId: box.root.ownerId,
    input: { kind: "assets-gc", params: {} },
  });
  return started.id;
}

/** Dispatch one admitted row through the engine's own claim, as the worker would. */
export async function dispatch(box: GcBox, id: WorkloadId): Promise<void> {
  const runAdmitted = box.root.runAdmittedWorkload;
  if (runAdmitted === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  await runAdmitted(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
}

export async function workloadRow(box: GcBox, id: WorkloadId): ReturnType<ServerTestHarness["services"]["workloads"]["get"]> {
  return await box.root.services.workloads.get({ caller: box.principal, id });
}

/** Start and run the assets-gc workload the boot seed schedules, then read its recorded outcome. */
export async function runScheduledGc(box: GcBox): ReturnType<ServerTestHarness["services"]["workloads"]["get"]> {
  const id = await startGc(box);
  await dispatch(box, id);
  return await workloadRow(box, id);
}

export async function survives(box: GcBox, ref: StoredRef): Promise<boolean> {
  const rows = await box.root.db.select({ id: assets.id }).from(assets).where(eq(assets.id, ref.assetId));
  return rows.length === 1 && (await box.cas.exists(box.root.ownerId, ref.hash));
}

export async function survival(box: GcBox, refs: Readonly<Record<string, StoredRef>>): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const [name, ref] of Object.entries(refs)) {
    out[name] = await survives(box, ref);
  }
  return out;
}

export function inlineImage(ref: StoredRef): string {
  return contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId: ref.assetId }, alt: "kept" });
}

export async function openRoom(box: GcBox, handle: CharacterHandle, principal: Principal = box.principal): Promise<ChatId> {
  const character = await box.root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle, name: "Keeper", description: "A keeper tends the orbital ledger." }),
  });
  const room = await box.root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  return room.chat.id;
}

export interface Post {
  readonly content: string;
  /** Rides the send's own attachment door, which writes the `message_assets` link. */
  readonly attached?: readonly StoredRef[];
  readonly as?: Principal;
}

/** Post without generating. */
export async function say(box: GcBox, chatId: ChatId, post: Post): Promise<MessageId> {
  const outcome = await box.root.services.chat.commitMessage({
    principal: post.as ?? box.principal,
    chatId,
    content: post.content,
    attachmentAssetIds: (post.attached ?? []).map((ref) => ref.assetId),
  });
  const message = outcome.messages[0];
  if (message === undefined) {
    throw new Error("commitMessage returned no committed row");
  }
  return message.id;
}

export async function attach(box: GcBox, chatId: ChatId, ref: StoredRef): Promise<MessageId> {
  return await say(box, chatId, { content: "", attached: [ref] });
}
