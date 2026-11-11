// One assets-gc box on the real composition root: a scratch CAS, a scripted image provider and the owner Principal.
// Shared by the assets suites whose verdict is what the one reference collector keeps: the sweep, its
// unreadable-reference persistence suite, the portability export and the sweep's overlap with an import.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { modelIdSchema } from "@orb/contracts/inference";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, CharacterHandle, ChatId, MessageId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import type { HeldDb, ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  casOf,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { onTestFinished } from "vitest";

export const PNG = "image/png";
const WORKLOAD_DEADLINE_MS = 30_000;
export const GC_IMAGE_MODEL = modelIdSchema.parse("gc-image-v1");
/** The remote art host a guest's `net.fetchAsset` reaches; the box serves one image there. */
export const COVER_HOST = "covers.example.test";
export const COVER_URL = `https://${COVER_HOST}/cover.png`;
// A public address for the cover host, so the egress guard treats it as the internet it stands for.
const COVER_ADDRESS = "93.184.215.14";

export interface GcBox {
  readonly root: ServerTestHarness;
  readonly cas: ReturnType<typeof casOf>;
  readonly principal: Principal;
  readonly images: Uint8Array[];
  /** The box's database hold, for a case that parks a statement mid-sweep. */
  readonly hold: HeldDb["hold"];
}

export interface StoredRef {
  readonly assetId: AssetId;
  readonly hash: string;
}

/** A box whose loopback HTTP requests act as its owner, so a suite can drive the export and import routes. The
 *  shipped library stays unseeded: it would only grow the exported bundle and the restore that no case judges. */
const LOOPBACK_OWNER = {
  physicalPeer: () => "127.0.0.1",
  env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
} as const;
const AUTH_ME_ROUTE = "/api/auth/me";

/** One harness on a scratch CAS over the box's own held database. The scripted provider answers only an image
 *  generation, with whatever bytes a test pushes into `images` first. Plugin guests run as real processes, and the
 *  cover host answers a guest's fetch with one image. */
export async function openBox(
  options: { readonly loopbackOwner?: boolean; readonly ids?: ServerHarnessOptions["ids"]; readonly logLevel?: ServerHarnessOptions["logLevel"] } = {},
): Promise<GcBox> {
  // Registered before the first await: `onTestFinished` runs after the case's own scopes, so a failed open still closes.
  const lifetime = new AsyncDisposableStack();
  onTestFinished(() => lifetime.disposeAsync());
  const dir = await mkdtemp(join(tmpdir(), "orb-assets-gc-"));
  lifetime.defer(() => rm(dir, { recursive: true, force: true }));
  // biome-ignore lint/nursery/useDisposables: lifetime.use registers disposal; onTestFinished disposes the stack after the case.
  const held = lifetime.use(await freshHeldDb());
  const casDir = join(dir, "cas");
  const images: Uint8Array[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [GC_IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images,
  });
  const cover = makeAssetBytes(createSeededIds().typeId(ID_PREFIX.asset));
  // Provider and plugin egress share the root's one network door, so one function answers both by host.
  const network: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    return new URL(request.url).hostname === COVER_HOST
      ? new Response(Uint8Array.from(cover), { headers: { "content-type": PNG } })
      : await wire.execute(request);
  };
  const root = lifetime.use(
    await createServerHarness({
      db: held.db,
      startJobs: false,
      casDir,
      providerFetch: network,
      pluginSpawn: spawn,
      networkExecution: {
        fetch: network,
        resolver: (host) => (host === COVER_HOST ? Promise.resolve([COVER_ADDRESS]) : Promise.reject(new Error(`unscripted DNS lookup: ${host}`))),
      },
      ...(options.loopbackOwner === true ? LOOPBACK_OWNER : {}),
      ...(options.ids === undefined ? {} : { ids: options.ids }),
      ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    }),
  );
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  // A committed message resolves the room's chat connection even when nothing generates; nothing here calls it.
  await seedCorpusConnections(root, principal);
  if (options.loopbackOwner === true) {
    // Production seeds its owner at boot. One owner request starts that seed and the box settles it, so a later
    // hold parks only the statement its case names, never the first request's seed.
    await (await root.http.request(AUTH_ME_ROUTE)).arrayBuffer();
    await root.settleBackground();
  }
  return { root, cas: casOf(root), principal, images, hold: held.hold };
}

/** An asset a production writer stored on its own, resolved to the `(id, hash)` the sweep keys on. */
export async function storedRow(box: GcBox, assetId: AssetId): Promise<StoredRef> {
  const row = await box.root.services.assets.assetCasRefById(assetId);
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
  for await (const owner of box.cas.listOwners()) {
    for await (const hash of box.cas.listHashes(castId<UserId>(owner))) {
      await box.cas.putBytes(castId<UserId>(owner), await box.cas.read(castId<UserId>(owner), hash), atMs);
    }
  }
}

export async function stampBlob(box: GcBox, ref: StoredRef, atMs: number): Promise<void> {
  await box.cas.putBytes(box.root.ownerId, await box.cas.read(box.root.ownerId, ref.hash), atMs);
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

/** Where an asset still exists. The index row and the owner's CAS blob are separate stores, and a sweep must clear both. */
export interface AssetStores {
  readonly row: boolean;
  readonly blob: boolean;
}

export const BOTH_STORES: AssetStores = { row: true, blob: true };
export const NEITHER_STORE: AssetStores = { row: false, blob: false };

/** Read both stores every time, so a row-only deletion cannot pass as a reclaimed asset. */
export async function storesOf(box: GcBox, ref: StoredRef): Promise<AssetStores> {
  const [row, blob] = await Promise.all([box.root.services.assets.assetCasRefById(ref.assetId), box.cas.exists(box.root.ownerId, ref.hash)]);
  return { row: row !== undefined, blob };
}

export async function storesOfEach(box: GcBox, refs: Readonly<Record<string, StoredRef>>): Promise<Record<string, AssetStores>> {
  const out: Record<string, AssetStores> = {};
  for (const [name, ref] of Object.entries(refs)) {
    out[name] = await storesOf(box, ref);
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
