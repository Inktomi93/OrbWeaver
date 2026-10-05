// Reranker-live probe (work item 0514): every consumer that reranks, driven through its shipped code path against
// the real local-light reranker that the boot seed binds. Only the query embedding is scripted (fixture vectors that
// put the right item LAST in vector order), so each consumer's order is the reranker's work. One model per process.

import { appendFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, availableParallelism, cpus, loadavg } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { speakerKey, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { RerankCapability } from "@orb/contracts/inference";
import { LOCAL_LIGHT_SEED_ROWS, modelIdSchema, RERANK_FLOOR } from "@orb/contracts/inference";
import type { RerankResult } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { MemoryQueryOptions, ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import { connectionBindings, userConnections } from "@orb/db";
import type { InferenceDeps, InferenceRuntime, RoleClientsWithSignal } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import type { CharacterId, ChatId, ConnectionBindingId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ConnectionContext, ConnectionService } from "@orb/server/domain/connection";
import { createConnectionPorts, createConnectionService } from "@orb/server/domain/connection";
import { and, eq } from "drizzle-orm";
import { localLightRows } from "../../../packages/inference/src/capability/sources/curated/local-light.ts";
import { rerankPick } from "../../../packages/server/src/domain/chat/engine/rerank-pick.ts";
import { recallMemory } from "../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import type { MsgRow } from "../../../packages/server/src/domain/chat/memory/types.ts";
import type { DatabankContext } from "../../../packages/server/src/domain/databank/contract/service.ts";
import { createGatherRetrieval } from "../../../packages/server/src/domain/databank/verbs/gather-retrieval.ts";
import { countOwnedVectors } from "../../../packages/server/src/domain/embeddings/persistence/owned-vector-counts.ts";
import type { SearchService } from "../../../packages/server/src/domain/search/index.ts";
import { seedLocalLightOnBoot } from "../../../packages/server/src/entry/boot/seed-local-light.ts";
import { makeChatContext } from "../../../tests/server/domain/chat/_support.ts";
import {
  makeSearch,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedChat,
  seedChatDigest,
  seedChatDigestSpeaker,
  seedChatDocument,
  seedChatSegment,
  seedDocument,
  seedDocumentChunk,
  seedImageEmbedding,
  seedUser,
  vec,
} from "../../../tests/server/domain/search/_support.ts";
import { freshDb } from "../../../tests/support/db.ts";
import { principal } from "../../../tests/support/factories/principal.ts";
import { makeResolvedSecret } from "../../../tests/support/factories/resolved-connection.ts";
import { ROOMS } from "../speaker-pick/fixtures.ts";
import type { LongItem } from "./corpus.ts";
import { ARC_CREDITS, ARC_TEXTS, CAPTIONS, GAZETTEER_CHUNKS, PERSONA_TEXTS, QUERIES, reachSweep } from "./corpus.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../../..");
const RESULTS = path.join(DIR, "results.jsonl");
const MINILM = "Xenova/ms-marco-MiniLM-L-6-v2";
const SEED_LABEL = LOCAL_LIGHT_SEED_ROWS[1].label;
const SEED_RERANK_MODEL = LOCAL_LIGHT_SEED_ROWS[1].model;
const PRE_SLOT_LABEL = LOCAL_LIGHT_SEED_ROWS[1].earlierLabels[0];
const EMBED_SEED = LOCAL_LIGHT_SEED_ROWS[0];
const KIB = 1024;
const MIB = 1_048_576;
const EXIT_FAIL = 1;
const EXIT_MISUSE = 3;
/** Every vector cosine stays well above recall's floor; the right item gets the largest off-axis lean. */
const RIGHT_LEAN = 0.9;
const WRONG_LEAN_STEP = 0.08;
const RECALL_CONFIG = { mode: "mixC", fanOut: 2, queryWindow: 4, minScore: 0.05 } as const;
const OMNIBOX_TOP_N = 3;
const GATHER_BUDGET = 4000;
/** The documents cut: two of the five chunks, so the vector pool (k times the overfetch) holds all five. */
const DOCUMENT_K = 2;
const FIXED_RNG = 0.5;
const PERCENT = 100;
/** The 512-token window MiniLM serves; a fact past it is invisible to that model. */
const MINILM_WINDOW = 512;
/** About 500 tokens of English: a document this long was cut by MiniLM's window before the swap. */
const LONG_DOCUMENT_CHARS = 2000;

const silent: InferenceDeps["log"] = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function writeRow(row: Record<string, unknown>): void {
  appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
}

function maxRssMib(): number {
  return Math.round((process.resourceUsage().maxRSS * KIB) / MIB);
}

function curatedRerank(model: string): { readonly window: number; readonly revision: string | null; readonly file: string } {
  const row = localLightRows.find((r) => r.kind === "rerank" && (r.match.ids as readonly string[]).includes(model));
  if (row?.kind !== "rerank") {
    throw new Error(`no curated local-light rerank row for ${model}`);
  }
  const onnx = "onnx" in row.rerank ? row.rerank.onnx : undefined;
  const files = onnx !== undefined && "files" in onnx ? (onnx.files as Readonly<Record<string, string>>) : undefined;
  return {
    window: row.rerank.maxInputTokens,
    revision: onnx?.revision ?? null,
    file: files?.[arch()] ?? (onnx?.dtype === undefined ? "model.onnx" : `model.onnx (${onnx.dtype})`),
  };
}

function deviceFacts(): Record<string, unknown> {
  return {
    cpu: cpus()[0]?.model ?? "unknown",
    arch: arch(),
    threads: availableParallelism(),
    node: process.version,
    loadavg: loadavg().map((l) => Math.round(l * PERCENT) / PERCENT),
  };
}

// ---- the real inference runtime and connection door over one fresh in-memory database ----

interface Stack {
  readonly db: Db;
  readonly runtime: InferenceRuntime;
  readonly svc: ConnectionService;
  readonly close: () => Promise<void>;
}

async function buildStack(cacheDir: string, allowRemoteModels: boolean): Promise<Stack> {
  const db = await freshDb();
  const now = (): number => Date.now();
  const ports = createConnectionPorts({ db, now });
  const deps: InferenceDeps = {
    now,
    log: silent,
    span: (_name, fn) => Promise.resolve(fn()),
    superviseDetached: (_name, _attrs, operation): void => {
      Promise.resolve()
        .then(operation)
        .catch(() => undefined);
    },
    env: { hostEnvAllowlist: (): Readonly<Record<string, string>> => ({}) },
    app: { name: "orbweaver-probe", url: "http://localhost:0" },
    snapshotStore: ports.snapshotStore,
    resolveCredential: () => Promise.resolve(makeResolvedSecret()),
    connections: ports.connections,
    bindings: ports.bindings,
    providerStore: ports.providerStore,
    agentSdk: {},
    userRuntimeDir: (ownerId): string => path.join(cacheDir, "..", "runtime", ownerId),
    localLight: { cacheDir, device: "cpu", allowRemoteModels },
    sdkFetch: globalThis.fetch,
  };
  const runtime = await createInferenceRuntime(deps);
  const ctx: ConnectionContext = {
    db,
    now,
    newConnectionId: () => mintTypeId(ID_PREFIX.userConnection) as UserConnectionId,
    newBindingId: () => mintTypeId(ID_PREFIX.connectionBinding) as ConnectionBindingId,
    runtime,
    audit: () => Promise.resolve(),
    credentialOwned: () => Promise.resolve(true),
    ruleOwnedBy: () => Promise.resolve(true),
    pluginGrantTasksOf: () => Promise.resolve(null),
    endpointAdmission: () => Promise.resolve("admitted"),
    recordProbeOutcome: (args) => Promise.resolve(args.result),
    syncEmbedTargets: () => Promise.resolve(null),
    targetWouldMove: () => Promise.resolve(null),
    countOwnedVectors: (ownerId) => countOwnedVectors(db, ownerId),
    emitUserEvent: () => undefined,
  };
  return { db, runtime, svc: createConnectionService(ctx), close: () => runtime.localLight.close() };
}

/** The boot seed path, exactly as `entry/lifecycle` runs it over every account alive at boot. */
async function bootSeed(stack: Stack): Promise<number> {
  return await seedLocalLightOnBoot({ db: stack.db, now: () => Date.now(), onEmbedSpaceBound: () => undefined });
}

async function seededRerankRow(db: Db, ownerId: UserId): Promise<UserConnectionId> {
  const [row] = await db
    .select({ id: userConnections.id })
    .from(userConnections)
    .where(and(eq(userConnections.ownerId, ownerId), eq(userConnections.seedSlot, "rerank")));
  if (row === undefined) {
    throw new Error("the boot seed left no rerank slot row");
  }
  return row.id;
}

// ---- per-call measurement: a pass-through over the funder's real rerank role ----

interface CallRecord {
  readonly consumer: string;
  readonly ms: number;
  readonly documents: number;
  /** Documents longer than {@link LONG_DOCUMENT_CHARS}, and how many of those still carried their late closing. */
  readonly longDocuments: number;
  readonly withClosing: number;
  readonly maxChars: number;
  readonly model: string;
  readonly top: readonly { readonly id: string; readonly score: number }[];
}

const CLOSINGS: readonly string[] = [...ARC_TEXTS, ...PERSONA_TEXTS, ...GAZETTEER_CHUNKS].map((item) => item.closing);

function timed(consumer: string, rerank: RoleClients["rerank"], calls: CallRecord[]): RoleClients["rerank"] {
  return async (query, documents, opts): Promise<RerankResult> => {
    const started = performance.now();
    const result = await rerank(query, documents, opts);
    const top = result.hits
      .toSorted((a, b) => b.score - a.score)
      .slice(0, OMNIBOX_TOP_N)
      .map((h) => ({ id: h.id, score: Math.round(h.score * PERCENT) / PERCENT }));
    const long = documents.filter((d) => (d.text ?? "").length > LONG_DOCUMENT_CHARS);
    calls.push({
      consumer,
      ms: Math.round(performance.now() - started),
      documents: documents.length,
      longDocuments: long.length,
      withClosing: long.filter((d) => CLOSINGS.some((closing) => (d.text ?? "").includes(closing))).length,
      maxChars: Math.max(0, ...documents.map((d) => (d.text ?? "").length)),
      model: result.model,
      top,
    });
    return result;
  };
}

// ---- the world every consumer reads: one owner, one hosted room, the caravan campaign ----

/** `text`: each long item names its subject near the top. `needle`: only its late closing tells it apart. */
type Shape = "text" | "needle";

const SHAPE_LABEL: Readonly<Record<Shape, string>> = {
  text: "subject named in the lead",
  needle: "detail only in the late closing",
};

interface World {
  readonly db: Db;
  readonly shape: Shape;
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly groupId: CharacterId;
  readonly characters: ReadonlyMap<string, CharacterId>;
}

/** An embedding that leans off the query axis by `lean`: the larger the lean, the lower its cosine to `vec(1)`. */
function leaning(lean: number): Float32Array<ArrayBuffer> {
  return vec(1, lean);
}

const TARGETS: readonly string[] = [QUERIES.recall.want, QUERIES.doc.want, QUERIES.character.want, QUERIES.image.want];

/** The wanted item leans furthest, so CSLS order always puts it last; the others lean less, in corpus order. */
function leanFor(key: string, index: number): number {
  return TARGETS.includes(key) ? RIGHT_LEAN : index * WRONG_LEAN_STEP;
}

async function seedWorld(db: Db, ownerId: UserId, shape: Shape): Promise<World> {
  const pick = (item: LongItem): string => (shape === "text" ? item.text : item.needle);
  const chatId = await seedChat(db, `chat_caravan_${shape}`, "The northern caravan");
  const groupId = await seedCharacter(db, { id: `character_group_${shape}`, ownerId, name: "Caravan", synthetic: true });
  const characters = new Map<string, CharacterId>();
  const personaByName = new Map(PERSONA_TEXTS.map((p) => [p.key, pick(p)]));
  for (const name of new Set<string>([...ARC_CREDITS, ...PERSONA_TEXTS.map((p) => p.key)])) {
    characters.set(
      name,
      await seedCharacter(db, { id: `character_${name.toLowerCase()}_${shape}`, ownerId, name, description: personaByName.get(name) ?? null }),
    );
  }
  for (const [blockIdx, arc] of ARC_TEXTS.entries()) {
    const embedding = leaning(leanFor(arc.key, blockIdx));
    const digestId = await seedChatDigest(db, { chatId, scopedCharacterId: groupId, blockIdx, text: pick(arc), embedding });
    const credit = characters.get(ARC_CREDITS[blockIdx] ?? "");
    if (credit !== undefined) {
      await seedChatDigestSpeaker(db, digestId, credit);
    }
    await seedChatSegment(db, { chatId, blockIdx, text: pick(arc), embedding });
  }
  for (const [index, persona] of PERSONA_TEXTS.entries()) {
    const characterId = characters.get(persona.key);
    if (characterId !== undefined) {
      await seedCharacterEmbedding(db, { characterId, embedding: leaning(leanFor(persona.key, index)) });
    }
  }
  const documentId = await seedDocument(db, { id: `document_gazetteer_${shape}`, ownerId, name: "Ashford Valley Gazetteer" });
  await seedChatDocument(db, chatId, documentId);
  for (const [chunkIdx, chunk] of GAZETTEER_CHUNKS.entries()) {
    await seedDocumentChunk(db, { documentId, chunkIdx, content: pick(chunk), embedding: leaning(leanFor(chunk.key, chunkIdx)) });
  }
  for (const [index, caption] of CAPTIONS.entries()) {
    const assetId = await seedAsset(db, { id: `asset_${caption.key}_${shape}`, ownerId, hash: `hash_${caption.key}_${shape}` });
    await seedImageEmbedding(db, { assetId, caption: caption.text, embedding: leaning(leanFor(caption.key, index)) });
  }
  return { db, shape, ownerId, chatId, groupId, characters };
}

// ---- the consumers ----

interface CellResult {
  readonly consumer: string;
  readonly shape: Shape;
  readonly want: string;
  /** The consumer's own output order, as item keys. */
  readonly got: readonly string[];
  readonly pass: boolean;
  readonly degraded?: boolean;
}

function cell(world: World, consumer: string, want: string, got: readonly string[]): CellResult {
  return { consumer, shape: world.shape, want, got, pass: got[0] === want };
}

/** For a verb that returns its survivors in reading order: the wanted item made the cut. */
function keptCell(world: World, consumer: string, want: string, got: readonly string[]): CellResult {
  return { consumer, shape: world.shape, want, got, pass: got.includes(want) };
}

function arcKey(blockIdx: number | undefined): string {
  return ARC_TEXTS[blockIdx ?? -1]?.key ?? `block ${String(blockIdx)}`;
}

function chunkKey(chunkIdx: number): string {
  return GAZETTEER_CHUNKS[chunkIdx]?.key ?? `chunk ${String(chunkIdx)}`;
}

function nameOf(world: World, characterId: CharacterId | null): string {
  return [...world.characters].find(([, id]) => id === characterId)?.[0] ?? String(characterId);
}

/** Memory recall, mixC: `recallMemory` over the real search `digests` verb, the reranker reordering the vector pool. */
async function runRecall(world: World, search: SearchService): Promise<CellResult> {
  const ctx = makeChatContext(world.db, {
    searchDigests: (query: Omit<MemoryQueryOptions, "ownerId">): Promise<readonly ScoredBlock[]> =>
      search
        .digests(
          { ...query, ownerId: world.ownerId },
          {
            // The shipped verb degrades a failed rerank to vector order; here that would pass a dead reranker as mixB.
            onRerankUnavailable: (): never => {
              throw new Error("the recall rerank degraded to vector order");
            },
          },
        )
        .then((hits) => hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }))),
  });
  const recent: MsgRow[] = [{ seq: 100, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content: QUERIES.recall.text }];
  const { trace } = await recallMemory(ctx, {
    scope: { chatId: world.chatId, scopedCharacterId: world.groupId, isGroup: false },
    groupCharacterId: world.groupId,
    recent,
    names: new Map<CharacterId, string>(),
    config: RECALL_CONFIG,
  });
  const admitted = trace.candidates.filter((c) => c.verdict === "admitted").map((c) => arcKey(c.blockIdx));
  return cell(world, "memory recall (mixC digest arcs)", QUERIES.recall.want, admitted);
}

/** The funder's bound rerank role as the chat composition root hands it to the Smart pick (`compose/chat.ts`). */
function speakerReranker(
  rc: RoleClientsWithSignal,
  rerank: RoleClients["rerank"],
): () => Promise<{ readonly capability: RerankCapability; readonly rerank: RoleClients["rerank"] } | null> {
  return async () => {
    const view = await rc.resolved("rerank");
    if (view === null) {
      return null;
    }
    return { capability: view.capability.kind === "rerank" ? view.capability.rerank : RERANK_FLOOR, rerank };
  };
}

/** The human player whose line the Smart cell scores; a name they share addresses them, never a character. */
const SMART_HUMAN = "Rowan";

/** Smart's speaker pick: `rerankPick` over four long personas, the human's line naming nobody, the last speaker banned. */
async function runSmart(world: World, rc: RoleClientsWithSignal, rerank: RoleClients["rerank"]): Promise<CellResult> {
  const cast = PERSONA_TEXTS.map((p) => ({ name: p.key, ref: { kind: "character" as const, characterId: world.characters.get(p.key) ?? world.groupId } }));
  const personas = new Map(PERSONA_TEXTS.map((p) => [world.characters.get(p.key) ?? world.groupId, world.shape === "text" ? p.text : p.needle]));
  const result = await rerankPick({
    reranker: speakerReranker(rc, rerank),
    candidates: cast.map((c) => ({ ref: c.ref, talkativeness: TALKATIVENESS_DEFAULT, disabled: false, leftSeq: null })),
    speakerCandidates: cast,
    characterLines: personas,
    lastLine: { speakerName: SMART_HUMAN, text: QUERIES.pick.text, characterId: null },
    humanNames: [SMART_HUMAN],
    lastSpeaker: cast.find((c) => c.name === "Quill")?.ref ?? null,
    rng: () => FIXED_RNG,
  });
  const picked = result.speakers.map((ref) => nameOf(world, ref.characterId));
  return {
    ...cell(world, "Smart speaker pick (rerankPick)", QUERIES.pick.want, picked),
    pass: picked[0] === QUERIES.pick.want && !result.degraded,
    degraded: result.degraded,
  };
}

/** The databank gather a chat turn runs (`gatherRetrieval` over `search.documents`), with the host's rerank switch on.
 *  The verb restores reading order after its k cut, so the observable is which chunks survive a cut of
 *  {@link DOCUMENT_K}; the vector pool (k times the overfetch) still holds every chunk. */
async function runDatabank(world: World, search: SearchService): Promise<CellResult> {
  // The gather reads nothing from its context but the injected documents lens.
  const gather = createGatherRetrieval({ searchDocuments: search.documents } as Pick<DatabankContext, "searchDocuments"> as DatabankContext);
  const result = await gather({
    chatId: world.chatId,
    hostUserId: world.ownerId,
    queryText: QUERIES.doc.text,
    tokenBudget: GATHER_BUDGET,
    k: DOCUMENT_K,
    minScore: 0,
    rerank: true,
  });
  return keptCell(
    world,
    "databank gather (chat turn)",
    QUERIES.doc.want,
    (result?.hits ?? []).map((h) => chunkKey(h.chunkIdx)),
  );
}

/** The search omnibox with its rerank switch on, one query per target (`search.search`). */
async function runOmnibox(world: World, search: SearchService): Promise<CellResult[]> {
  const ownerScope = { kind: "owner" } as const;
  const base = { ownerId: world.ownerId, topN: OMNIBOX_TOP_N, rerank: true } as const;
  const out: CellResult[] = [];
  const run = async (target: string, want: string, keys: () => Promise<readonly string[]>): Promise<void> => {
    out.push(cell(world, `omnibox search: ${target}`, want, await keys()));
  };
  await run("digests", QUERIES.recall.want, async () => {
    const r = await search.search({ ...base, query: QUERIES.recall.text, over: "digests", scope: ownerScope });
    return r.over === "digests" ? r.hits.map((h) => arcKey(h.blockKey.blockIdx)) : [];
  });
  await run("segments (mixC)", QUERIES.recall.want, async () => {
    // The omnibox cuts the segment pool to topN before its rerank, so ask for every block to keep the wanted one in it.
    const r = await search.search({
      ...base,
      topN: ARC_TEXTS.length,
      query: QUERIES.recall.text,
      over: "segments",
      scope: { kind: "chat", chatId: world.chatId, scopedCharacterId: world.groupId },
    });
    return r.over === "segments" ? r.hits.map((h) => arcKey(h.blockKey.blockIdx)) : [];
  });
  await run("corpus (mixC)", QUERIES.recall.want, async () => {
    const r = await search.search({ ...base, query: QUERIES.recall.text, over: "corpus", scope: ownerScope });
    return r.over === "corpus" ? r.hits.map((h) => arcKey(h.blockKeys[0]?.blockIdx ?? (h.source.kind === "segment" ? h.source.blockIdx : undefined))) : [];
  });
  await run("discover", ARC_CREDITS[0], async () => {
    const r = await search.search({ ...base, query: QUERIES.recall.text, over: "discover", scope: ownerScope });
    return r.over === "discover" ? r.hits.map((h) => h.name) : [];
  });
  await run("entities", QUERIES.character.want, async () => {
    const r = await search.search({ ...base, query: QUERIES.character.text, over: "entities", scope: ownerScope });
    return r.over === "entities" ? r.hits.map((h) => nameOf(world, h.characterId)) : [];
  });
  await run("characters", QUERIES.character.want, async () => {
    const r = await search.search({ ...base, query: QUERIES.character.text, over: "characters", scope: ownerScope });
    return r.over === "characters" ? r.hits.map((h) => h.name) : [];
  });
  const docs = await search.search({ ...base, topN: DOCUMENT_K, query: QUERIES.doc.text, over: "documents", scope: ownerScope });
  out.push(keptCell(world, "omnibox search: documents", QUERIES.doc.want, docs.over === "documents" ? docs.hits.map((h) => chunkKey(h.chunkIdx)) : []));
  if (world.shape === "text") {
    await run("images (short captions)", QUERIES.image.want, async () => {
      const r = await search.search({ ...base, query: QUERIES.image.text, over: "images", scope: ownerScope, lens: "image-captioned" });
      return r.over === "images" ? r.hits.map((h) => h.hash.replace("hash_", "").replace(`_${world.shape}`, "")) : [];
    });
  }
  return out;
}

type Room = (typeof ROOMS)[number];

/** One fixture cut through the shipped `rerankPick`: the picked name and whether the pick degraded. */
async function pickAtCut(
  room: Room,
  at: number,
  rc: RoleClientsWithSignal,
  rerank: RoleClients["rerank"],
): Promise<{ readonly pick: string | undefined; readonly degraded: boolean }> {
  const cast = room.characters.map((c) => ({ name: c.name, ref: { kind: "character" as const, characterId: c.id } }));
  const trigger = room.lines[at - 1];
  const lastName = room.lines.slice(0, at).findLast((l) => l.speaker !== room.user)?.speaker;
  const speakerId = room.characters.find((c) => c.name === trigger?.speaker)?.id ?? null;
  const result = await rerankPick({
    reranker: speakerReranker(rc, rerank),
    candidates: cast.map((c) => ({ ref: c.ref, talkativeness: TALKATIVENESS_DEFAULT, disabled: false, leftSeq: null })),
    speakerCandidates: cast,
    characterLines: new Map(room.characters.map((c) => [c.id, c.persona])),
    lastLine: trigger === undefined ? null : { speakerName: trigger.speaker, text: trigger.text, characterId: speakerId },
    humanNames: [room.user],
    lastSpeaker: cast.find((c) => c.name === lastName)?.ref ?? null,
    rng: () => FIXED_RNG,
  });
  const first = result.speakers.at(0);
  const pick = first === undefined ? undefined : cast.find((c) => speakerKey(c.ref) === speakerKey(first))?.name;
  return { pick, degraded: result.degraded };
}

/** The speaker-pick probe's 30 cuts through the shipped `rerankPick`: its hand-judged hit rate on the judged cuts. */
async function runSpeakerPickCuts(
  rc: RoleClientsWithSignal,
  rerank: RoleClients["rerank"],
): Promise<{ readonly hits: number; readonly judged: number; readonly degraded: number }> {
  let hits = 0;
  let judged = 0;
  let degraded = 0;
  for (const room of ROOMS) {
    for (const cut of room.cuts) {
      if (cut.accept === null) {
        continue;
      }
      const result = await pickAtCut(room, cut.at, rc, rerank);
      judged += 1;
      hits += result.pick !== undefined && cut.accept.includes(result.pick) ? 1 : 0;
      degraded += result.degraded ? 1 : 0;
    }
  }
  return { hits, judged, degraded };
}

/** The reach sweep through the funder's rerank role: does the late closing still move the score at each depth? */
async function runReach(rc: RoleClientsWithSignal): Promise<readonly Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const p of reachSweep()) {
    const result = await rc.rerank(QUERIES.recall.text, [
      { id: "with", text: p.with },
      { id: "without", text: p.without },
      { id: "first", text: p.first },
    ]);
    const score = (id: string): number => Math.round((result.hits.find((h) => h.id === id)?.score ?? Number.NaN) * PERCENT) / PERCENT;
    rows.push({ prefixSentences: p.n, with: score("with"), without: score("without"), factFirst: score("first") });
  }
  return rows;
}

function latencySummary(calls: readonly CallRecord[]): { readonly n: number; readonly medianMs: number; readonly maxMs: number } {
  const ms = calls.map((c) => c.ms).toSorted((a, b) => a - b);
  return { n: ms.length, medianMs: ms[Math.floor(ms.length / 2)] ?? 0, maxMs: ms.at(-1) ?? 0 };
}

const CONSUMER_KEYS = ["recall", "smart", "databank", "omnibox", "speaker-pick-cuts"] as const;

function requireCache(): string {
  const cacheDir = argValue("cache");
  if (cacheDir === undefined) {
    throw new Error("--cache=<model cache dir> is required");
  }
  return cacheDir;
}

/** The boot seed, then the Model roles pick when the run asks for a model other than the seed's. */
async function bindModel(stack: Stack, ownerIds: readonly UserId[], model: string): Promise<void> {
  await bootSeed(stack);
  if (model === SEED_RERANK_MODEL) {
    return;
  }
  for (const ownerId of ownerIds) {
    await stack.svc.update({ principal: principal(ownerId), connectionId: await seededRerankRow(stack.db, ownerId), patch: { model } });
  }
}

function callSummary(calls: readonly CallRecord[]): Record<string, unknown> {
  return {
    servedBy: [...new Set(calls.map((c) => c.model))],
    firstCallMs: calls.at(0)?.ms ?? null,
    firstCallConsumer: calls.at(0)?.consumer ?? null,
    latency: Object.fromEntries(CONSUMER_KEYS.map((k) => [k, latencySummary(calls.filter((c) => c.consumer === k))])),
    longDocumentsSent: calls.reduce((n, c) => n + c.longDocuments, 0),
    longDocumentsWithClosing: calls.reduce((n, c) => n + c.withClosing, 0),
    maxDocumentChars: Math.max(0, ...calls.map((c) => c.maxChars)),
    calls: calls.map((c) => ({ consumer: c.consumer, ms: c.ms, documents: c.documents, top: c.top })),
  };
}

function printCell(c: CellResult): void {
  const degraded = c.degraded === true ? " (degraded)" : "";
  console.log(`${c.pass ? "PASS" : "FAIL"} [${SHAPE_LABEL[c.shape]}] ${c.consumer}: want ${c.want}, got ${c.got.join(" > ")}${degraded}`);
}

async function consumers(): Promise<void> {
  const model = argValue("model") ?? SEED_RERANK_MODEL;
  const run = argValue("label") ?? model;
  const stack = await buildStack(requireCache(), false);
  // One owner per corpus shape, so an owner-wide search never sees the other shape's rows.
  const textOwner = await seedUser(stack.db, { id: "user_text", handle: castId<Handle>("text") });
  const needleOwner = await seedUser(stack.db, { id: "user_needle", handle: castId<Handle>("needle") });
  await bindModel(stack, [textOwner, needleOwner], model);
  const rcOf = (ownerId: UserId): RoleClientsWithSignal => stack.runtime.roleClientsFor(principal(ownerId));
  const rc = rcOf(textOwner);
  const view = await rc.resolved("rerank");
  const worlds = [await seedWorld(stack.db, textOwner, "text"), await seedWorld(stack.db, needleOwner, "needle")];
  const calls: CallRecord[] = [];
  const rssBeforeMib = maxRssMib();
  const consumer = (label: string, roles: RoleClientsWithSignal): RoleClients["rerank"] => timed(label, (q, d, o) => roles.rerank(q, d, o), calls);
  const searchFor = (label: string, roles: RoleClientsWithSignal): SearchService =>
    makeSearch(stack.db, { embedVector: () => vec(1), imageEmbedVector: () => vec(1), rerank: consumer(label, roles) });

  const started = performance.now();
  const cells: CellResult[] = [];
  for (const world of worlds) {
    const roles = rcOf(world.ownerId);
    cells.push(await runRecall(world, searchFor("recall", roles)));
    cells.push(await runSmart(world, roles, consumer("smart", roles)));
    cells.push(await runDatabank(world, searchFor("databank", roles)));
    cells.push(...(await runOmnibox(world, searchFor("omnibox", roles))));
  }
  const cuts = await runSpeakerPickCuts(rc, consumer("speaker-pick-cuts", rc));
  const wallMs = Math.round(performance.now() - started);
  const reach = await runReach(rc);
  for (const c of cells) {
    writeRow({ kind: "cell", run, model, ...c });
  }
  const meta = {
    kind: "meta",
    run,
    model,
    resolvedModel: view?.model ?? null,
    window: view?.capability.kind === "rerank" ? view.capability.rerank.maxInputTokens : null,
    curated: curatedRerank(model),
    device: deviceFacts(),
    ...callSummary(calls),
    wallMs,
    maxRssBeforeFirstCallMib: rssBeforeMib,
    maxRssMib: maxRssMib(),
    speakerPickCuts: cuts,
    reach,
    passed: cells.filter((c) => c.pass).length,
    cells: cells.length,
  };
  writeRow(meta);
  console.log(JSON.stringify({ ...meta, calls: undefined }, null, 1));
  cells.forEach(printCell);
  await stack.close();
}

// ---- seed behaviour: a fresh install and upgrades, through the boot seed ----

async function insertEarlierRow(
  db: Db,
  ownerId: UserId,
  row: { readonly label: string; readonly seedSlot: "embed" | "rerank" | null; readonly model: string },
  bindTask?: "embed" | "rerank",
): Promise<UserConnectionId> {
  const id = mintTypeId(ID_PREFIX.userConnection) as UserConnectionId;
  const now = Date.now();
  // As a release before the `seed_model` column wrote it: the column NULL, the model the only built-in reranker.
  await db.insert(userConnections).values({
    id,
    ownerId,
    label: row.label,
    seedSlot: row.seedSlot,
    providerId: castId("local-light"),
    credentialId: null,
    baseUrl: null,
    model: modelIdSchema.parse(row.model),
    seedModel: null,
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: true,
    createdAt: now,
    updatedAt: now,
  });
  if (bindTask !== undefined) {
    await db.insert(connectionBindings).values({
      id: mintTypeId(ID_PREFIX.connectionBinding) as ConnectionBindingId,
      actorKind: "user",
      userId: ownerId,
      ruleId: null,
      pluginId: null,
      task: bindTask,
      connectionId: id,
    });
  }
  return id;
}

interface UserState {
  readonly rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly seedSlot: string | null;
    readonly model: string;
    readonly seedModel: string | null;
  }[];
  readonly rerankBinding: string | null;
  readonly servedBy: string;
  readonly window: number | null;
  readonly sane: boolean;
}

const SANITY_QUERY = "Which planet is known as the Red Planet?";
const SANITY_DOCS = [
  { id: "venus", text: "Venus is often called Earth's twin because of its similar size and proximity." },
  { id: "mars", text: "Mars, known for its reddish appearance, is often referred to as the Red Planet." },
];

async function stateOf(stack: Stack, ownerId: UserId): Promise<UserState> {
  const rows = await stack.db
    .select({
      id: userConnections.id,
      label: userConnections.label,
      seedSlot: userConnections.seedSlot,
      model: userConnections.model,
      seedModel: userConnections.seedModel,
    })
    .from(userConnections)
    .where(eq(userConnections.ownerId, ownerId));
  const [binding] = await stack.db
    .select({ connectionId: connectionBindings.connectionId })
    .from(connectionBindings)
    .where(and(eq(connectionBindings.userId, ownerId), eq(connectionBindings.task, "rerank")));
  const rc = stack.runtime.roleClientsFor(principal(ownerId));
  const view = await rc.resolved("rerank");
  const result = await rc.rerank(SANITY_QUERY, SANITY_DOCS);
  const top = result.hits.toSorted((a, b) => b.score - a.score)[0]?.id;
  return {
    rows: rows.filter((r) => r.label !== EMBED_SEED.label && r.label !== EMBED_SEED.earlierLabels[0]),
    rerankBinding: binding?.connectionId ?? null,
    servedBy: result.model,
    window: view?.capability.kind === "rerank" ? view.capability.rerank.maxInputTokens : null,
    sane: top === "mars",
  };
}

interface SeedCheck {
  readonly scenario: string;
  readonly expect: string;
  readonly pass: boolean;
  readonly state: UserState;
}

async function seed(): Promise<void> {
  const cacheDir = argValue("cache");
  if (cacheDir === undefined) {
    throw new Error("--cache=<model cache dir> is required");
  }
  const stack = await buildStack(cacheDir, false);
  const user = async (id: string): Promise<UserId> => await seedUser(stack.db, { id, handle: castId<Handle>(id) });
  const fresh = await user("user_fresh");
  const slotted = await user("user_slotted");
  const preSlot = await user("user_preslot");
  const own = await user("user_own");

  // An upgrade from the release that seeded MiniLM into the slot, before `seed_model` existed.
  await insertEarlierRow(stack.db, slotted, { label: EMBED_SEED.label, seedSlot: "embed", model: EMBED_SEED.model }, "embed");
  const slottedRow = await insertEarlierRow(stack.db, slotted, { label: SEED_LABEL, seedSlot: "rerank", model: MINILM }, "rerank");
  // An upgrade from the release before seed slots: an unslotted MiniLM row under the seed's earlier label.
  const preSlotRow = await insertEarlierRow(stack.db, preSlot, { label: PRE_SLOT_LABEL, seedSlot: null, model: MINILM }, "rerank");
  // A user who made their own MiniLM row through the connection door and bound it.
  const ownRow = await stack.svc.create({
    principal: principal(own),
    providerId: "local-light",
    credentialId: null,
    baseUrl: null,
    model: MINILM,
    label: "My reranker",
    allowBackground: true,
  });
  await stack.svc.setBinding({ principal: principal(own), task: "rerank", connectionId: ownRow.id });

  const firstInserted = await bootSeed(stack);
  const checks: SeedCheck[] = [];
  const check = async (scenario: string, ownerId: UserId, expect: string, judge: (s: UserState) => boolean): Promise<void> => {
    const state = await stateOf(stack, ownerId);
    checks.push({ scenario, expect, pass: judge(state) && state.sane, state });
  };
  const slotRow = (s: UserState): UserState["rows"][number] | undefined => s.rows.find((r) => r.seedSlot === "rerank");

  await check("fresh install", fresh, "a seeded rerank row on ettin-32m, bound, serving ettin-32m at a 2048 window", (s) => {
    const row = slotRow(s);
    return (
      row?.model === SEED_RERANK_MODEL &&
      row.seedModel === SEED_RERANK_MODEL &&
      s.rerankBinding === row.id &&
      s.servedBy === SEED_RERANK_MODEL &&
      s.window === curatedRerank(SEED_RERANK_MODEL).window
    );
  });
  await check("upgrade: MiniLM in the seed slot, seed_model NULL", slotted, "the same row moved to ettin-32m; the binding follows it", (s) => {
    const row = slotRow(s);
    return (
      row?.id === slottedRow &&
      row.model === SEED_RERANK_MODEL &&
      row.seedModel === SEED_RERANK_MODEL &&
      s.rerankBinding === slottedRow &&
      s.servedBy === SEED_RERANK_MODEL
    );
  });
  await check("upgrade: unslotted MiniLM row under the earlier seed label", preSlot, "adopted into the slot, relabelled and moved to ettin-32m", (s) => {
    const row = slotRow(s);
    return (
      row?.id === preSlotRow &&
      row.label === SEED_LABEL &&
      row.model === SEED_RERANK_MODEL &&
      s.rerankBinding === preSlotRow &&
      s.servedBy === SEED_RERANK_MODEL
    );
  });
  await check("user's own MiniLM row, bound", own, "never adopted or moved; still bound and serving MiniLM; the seed adds an unbound slot row", (s) => {
    const mine = s.rows.find((r) => r.id === ownRow.id);
    const slot = slotRow(s);
    return (
      mine?.model === MINILM &&
      mine.seedSlot === null &&
      mine.label === "My reranker" &&
      s.rerankBinding === ownRow.id &&
      s.servedBy === MINILM &&
      slot !== undefined &&
      slot.id !== ownRow.id
    );
  });

  // The user later picks MiniLM on the seeded row; the next boot must leave that choice alone.
  for (const ownerId of [fresh, slotted]) {
    await stack.svc.update({ principal: principal(ownerId), connectionId: await seededRerankRow(stack.db, ownerId), patch: { model: MINILM } });
  }
  const secondInserted = await bootSeed(stack);
  for (const [scenario, ownerId] of [
    ["fresh install, then a MiniLM pick, then a reboot", fresh],
    ["upgraded slot row, then a MiniLM pick, then a reboot", slotted],
  ] as const) {
    await check(scenario, ownerId, "the pick sticks: the slot row stays on MiniLM and serves it", (s) => {
      const row = slotRow(s);
      return row?.model === MINILM && row.seedModel === SEED_RERANK_MODEL && s.rerankBinding === row.id && s.servedBy === MINILM && s.window === MINILM_WINDOW;
    });
  }
  for (const c of checks) {
    writeRow({ kind: "seed", ...c });
    console.log(`${c.pass ? "PASS" : "FAIL"} ${c.scenario}: ${c.expect}\n  ${JSON.stringify(c.state)}`);
  }
  writeRow({ kind: "seed-meta", firstBootInserted: firstInserted, secondBootInserted: secondInserted, device: deviceFacts() });
  console.log(`boot inserted ${firstInserted} rows, then ${secondInserted} on the reboot`);
  await stack.close();
  if (checks.some((c) => !c.pass)) {
    process.exitCode = EXIT_FAIL;
  }
}

// ---- cold start: an empty model cache, the download through the shipped loader ----

function dirBytes(dir: string): number {
  if (!existsSync(dir)) {
    return 0;
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + statSync(path.join(e.parentPath, e.name)).size, 0);
}

async function cold(): Promise<void> {
  const cacheDir = argValue("cache");
  const model = argValue("model") ?? SEED_RERANK_MODEL;
  if (cacheDir === undefined || dirBytes(cacheDir) > 0) {
    throw new Error("--cache=<an empty or absent dir> is required");
  }
  const stack = await buildStack(cacheDir, true);
  const ownerId = await seedUser(stack.db, { id: "user_cold", handle: castId<Handle>("cold") });
  await bootSeed(stack);
  if (model !== SEED_RERANK_MODEL) {
    await stack.svc.update({ principal: principal(ownerId), connectionId: await seededRerankRow(stack.db, ownerId), patch: { model } });
  }
  const rc = stack.runtime.roleClientsFor(principal(ownerId));
  const t0 = performance.now();
  const first = await rc.rerank(SANITY_QUERY, SANITY_DOCS);
  const firstMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  await rc.rerank(SANITY_QUERY, SANITY_DOCS);
  const secondMs = Math.round(performance.now() - t1);
  const row = {
    kind: "cold",
    model,
    servedBy: first.model,
    firstCallMs: firstMs,
    secondCallMs: secondMs,
    downloadedMb: Math.round((dirBytes(cacheDir) / MIB) * 10) / 10,
    maxRssMib: maxRssMib(),
    device: deviceFacts(),
  };
  writeRow(row);
  console.log(JSON.stringify(row));
  await stack.close();
}

// ---- token counts: each long item in each model's own tokenizer ----

interface ProbeTokenizer {
  readonly encode: (text: string) => number[];
}

async function tokens(): Promise<void> {
  const cacheDir = argValue("cache");
  if (cacheDir === undefined) {
    throw new Error("--cache=<model cache dir> is required");
  }
  const entry = createRequire(path.join(REPO, "packages/inference/package.json")).resolve("@huggingface/transformers");
  const lib = (await import(pathToFileURL(entry).href)) as {
    env: { cacheDir: string | null; allowRemoteModels: boolean };
    AutoTokenizer: { from_pretrained: (id: string, opts?: { revision?: string }) => Promise<ProbeTokenizer> };
  };
  lib.env.cacheDir = cacheDir;
  lib.env.allowRemoteModels = false;
  const groups: readonly (readonly [string, readonly LongItem[]])[] = [
    ["digest arc / segment", ARC_TEXTS],
    ["persona", PERSONA_TEXTS],
    ["databank chunk", GAZETTEER_CHUNKS],
  ];
  for (const model of [SEED_RERANK_MODEL, MINILM]) {
    const revision = curatedRerank(model).revision;
    const tok = await lib.AutoTokenizer.from_pretrained(model, revision === null ? {} : { revision });
    const count = (text: string): number => tok.encode(text).length;
    for (const [group, items] of groups) {
      for (const item of items) {
        const row = {
          kind: "tokens",
          model,
          group,
          key: item.key,
          tokens: count(item.text),
          closingStartsAtToken: count(item.text.slice(0, item.text.indexOf(item.closing))),
          needleTokens: count(item.needle),
          needleClosingStartsAtToken: count(item.needle.slice(0, item.needle.indexOf(item.closing))),
        };
        writeRow(row);
        console.log(JSON.stringify(row));
      }
    }
    for (const p of reachSweep()) {
      // The pair as the model reads it: the query, then the document up to where the closing begins.
      const row = { kind: "reach-tokens", model, prefixSentences: p.n, closingStartsAtPairToken: count(QUERIES.recall.text) + count(p.without) };
      writeRow(row);
      console.log(JSON.stringify(row));
    }
  }
}

async function main(): Promise<void> {
  const verb: string = process.argv.at(2) ?? "";
  switch (verb) {
    case "consumers":
      await consumers();
      return;
    case "seed":
      await seed();
      return;
    case "cold":
      await cold();
      return;
    case "tokens":
      await tokens();
      return;
    case "pairs":
      // The reach sweep's texts, for `reference.py`.
      console.log(JSON.stringify({ query: QUERIES.recall.text, pairs: reachSweep() }));
      return;
    default:
      console.log("usage: run.ts consumers|seed|tokens --cache=<dir> [--model=<hub id>] [--label=] | cold --cache=<empty dir> [--model=] | pairs");
      process.exitCode = EXIT_MISUSE;
  }
}

await main();
