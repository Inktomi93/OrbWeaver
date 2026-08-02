// scripts/seed/seed-demo — the DEV demo-database seeder. Against a fresh db it stands up a populated,
// verifiable app so every `pnpm seed:demo --fresh` yields the same demo state (a group chat, a solo chat
// with a seeded transcript, two humans, personas, a world book, an ingested databank document with real
// chunks + embeddings, a saved preset, and tags) — the manual-verification substrate the owner asked for.
//
// WHY it composes the REAL services (never raw inserts): the seed content flows through the same domain
// verbs the app uses (character/persona/chat/world-info/databank/preset/tag), so a successful seed run is
// ALSO a smoke test of the write paths (FKs, belts, the embeddings single-write-path, the databank ingest
// pipeline). A raw-insert seeder would populate rows while silently bypassing every invariant.
//
// EMBEDDINGS (offline): `embeddings.store` has no precomputed-vector path — it always embeds via
// `roleClients.embed`. So to exercise the REAL vector write path without a GPU/live model, this seeder
// injects a deterministic fake vLLM engine client through the sanctioned `providerSeams.vllmClient` seam
// (the same seam the compose int-tests use). The fake answers `/v1/embeddings` with stable pseudo-random
// vectors (L2-normalized downstream) and `/v1/chat/completions` with a scripted SSE reply, so both the
// databank chunk→embed pipeline and (best-effort) real chat turns run credit-free and deterministically.
//
// DEV-ONLY (structurally). This is throwaway tooling, NOT a boot path:
//   • Refuses when `NODE_ENV=production` unless `--force` — the scripted vLLM wiring must never become a
//     prod default.
//   • Refuses against a db that already carries demo content (the second-human sentinel) unless `--force`
//     or `--fresh` — so a re-run never dupes and never mutates a db that already looks seeded.
//   • `--fresh` wipes the `data/` db file (+ WAL/SHM sidecars), re-migrates from the baseline, then seeds.
// It writes ONLY through the domain verbs against whatever `DATABASE_URL` points at; it changes no config.
//
// Run: `pnpm seed:demo` · `pnpm seed:demo --fresh` · `pnpm seed:demo --force`.

import { rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { Principal } from "@orb/contracts/identity";
import {
  chatBooks,
  chatParticipants,
  chats,
  createDb,
  documentChunks,
  documents,
  localPath,
  messages,
  personas,
  preCloseHousekeeping,
  tags,
  users,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { createSessionsService, ownerHandles } from "@orb/server/domain/sessions";
import { runBootMigrations, seedDefaultCharacters, seedDefaultPersona, seedDefaultPreset, seedOwner, seedThemes } from "@orb/server/entry/boot";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { detectGpu } from "@orb/server/infra/providers";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";

const SECOND_HUMAN_HANDLE = "companion";
// A fixed dev pepper for invite/session token hashing against the THROWAWAY demo db (real env wins if set).
// Not a secret: the seeded db is disposable and never a launched deployment.
const SEED_SESSION_SECRET = "orbweaver-demo-seed-session-secret-do-not-ship";
const SOLO_CHAT_TITLE = "Getting started with Assistant";
const GROUP_CHAT_TITLE = "The refinery crew";
const WORLD_BOOK_NAME = "Demo World — The Loom";
const DEMO_DOCUMENT_NAME = "Loom lore (databank demo)";
const DEMO_PRESET_NAME = "Demo balanced preset";
const DEMO_TAG_NAME = "demo";

// The pasted databank document — long enough to chunk into several pieces so `document_chunks` > 1.
const DEMO_DOCUMENT_TEXT = [
  "The Loom is the great orbital engine at the heart of the settlement, a lattice of woven light that",
  "binds the drifting habitats into one turning wheel. Its keepers, the Weavers, tend the threads that",
  "carry water, heat, and memory between the rings. When a thread frays, a Weaver must climb the",
  "spokes and re-splice it by hand, singing the old counting songs that keep the tension true.",
  "",
  "Rev runs the card refinery on the third ring, where broken personas are melted down and re-cast.",
  "Mara audits every splice for drift, and Niko keeps the archive of songs no one else remembers.",
  "The Assistant speaks for the Loom itself, translating its slow machine-thoughts into human words.",
  "Together they hold the wheel against the long dark, one thread and one turn at a time.",
].join("\n");

interface Args {
  readonly fresh: boolean;
  readonly force: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  return { fresh: argv.includes("--fresh"), force: argv.includes("--force") };
}

/** Resolve a `file:` DATABASE_URL to an absolute on-disk path (cwd-relative like the server), else null.
 *  Delegates to `@orb/db`'s `localPath` — the ONE `file:`-URL parser (a local re-derivation here
 *  previously ran `fileURLToPath` on a relative `file:./data/x.db` url, which silently absolutizes the
 *  dot-segment against ROOT to `/data/x.db` instead of throwing — so `--fresh` wiped a file that was
 *  never the one `createDb` actually opened, and every "fresh" reseed silently reused the stale db). */
function dbFilePath(url: string): string | null {
  const raw = localPath(url);
  if (raw === undefined) {
    return null;
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

// ── The deterministic offline vLLM engine (embeddings + scripted chat) ─────────────────────────────────

/** A stable [0,1) pseudo-random stream seeded from a string (mulberry32) — same text ⇒ same vector. */
function seededStream(text: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic embedding for `text` of the given dim (centered so L2-normalization keeps it non-degenerate). */
function fakeEmbedding(text: string, dim: number): number[] {
  const rand = seededStream(text);
  return Array.from({ length: dim }, () => rand() - 0.5);
}

// The text-embed surface posts `{ input: string[] }`; the image-embed surface posts `{ messages: […] }`
// (one conversation per call). The fake handles both — one deterministic vector per requested item.
interface EmbeddingsBody {
  readonly input?: readonly string[];
  readonly messages?: unknown;
  readonly model?: string;
  readonly dimensions?: number;
}

/** One scripted assistant reply streamed as OpenAI SSE bytes (what the vLLM chat surface drains). */
function scriptedChatSse(reply: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: reply }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 8 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

function fakeVllmClient(embedDim: number): VllmEngineClient {
  return {
    enginePost: <T>(engine: string, path: string, body: unknown): Promise<T> => {
      if (path.includes("/embeddings")) {
        const b = body as EmbeddingsBody;
        const dim = b.dimensions ?? embedDim;
        const seeds = Array.isArray(b.input) ? b.input : [JSON.stringify(b.messages ?? "")];
        const data = seeds.map((text, index) => ({ index, embedding: fakeEmbedding(String(text), dim) }));
        return Promise.resolve({ data, model: b.model ?? env.VLLM_GEN_MODEL } as T);
      }
      return Promise.reject(new Error(`seed-demo fake vLLM: unhandled enginePost ${engine} ${path}`));
    },
    engineStream: (_engine: string, _path: string, _body: unknown): Promise<ReadableStream<Uint8Array>> =>
      Promise.resolve(scriptedChatSse("Glad to have you here — the Loom is turning steady today. What would you like to explore first?")),
    baseUrl: (engine: string): string => `http://127.0.0.1:0/${engine}`,
  };
}

// ── Principals ─────────────────────────────────────────────────────────────────────────────────────────

function principalOf(userId: UserId, handle: string, role: "owner" | "user"): Principal {
  return { userId, role, handle: castId<Handle>(handle), externalId: null, via: "fallback" };
}

// ── Row-count report ─────────────────────────────────────────────────────────────────────────────────────

async function countRows(db: Awaited<ReturnType<typeof createDb>>): Promise<Record<string, number>> {
  const tablesByLabel = { users, personas, chats, chatParticipants, messages, worldBooks, worldEntries, chatBooks, documents, documentChunks, tags };
  const pairs = await Promise.all(Object.entries(tablesByLabel).map(async ([label, table]): Promise<[string, number]> => [label, await db.$count(table)]));
  return Object.fromEntries(pairs);
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string): void => {
    process.stdout.write(`[seed:demo] ${msg}\n`);
  };

  if (env.NODE_ENV === "production" && !args.force) {
    process.stderr.write("[seed:demo] REFUSING: NODE_ENV=production. This is dev tooling — re-run with --force only if you truly mean it.\n");
    process.exitCode = 1;
    return;
  }

  const filePath = dbFilePath(env.DATABASE_URL);
  if (args.fresh) {
    if (filePath === null) {
      process.stderr.write(`[seed:demo] --fresh requires a file: DATABASE_URL (got ${env.DATABASE_URL}).\n`);
      process.exitCode = 1;
      return;
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(filePath + suffix, { force: true });
    }
    log(`--fresh: wiped ${filePath} (+ WAL/SHM)`);
  }

  const now = (): number => Date.now();
  const db = await createDb(env.DATABASE_URL);
  await runBootMigrations({ db, databaseUrl: env.DATABASE_URL });
  log("db migrated from the baseline");

  await runFullSeed({
    db,
    now,
    sessionSecret: env.SESSION_SECRET ?? SEED_SESSION_SECRET,
    casDir: env.ASSETS_DIR,
    variantDir: join(dirname(env.ASSETS_DIR), "variants"),
    // --fresh always re-augments (the db was just wiped); --force overrides the "already seeded" sentinel.
    force: args.force || args.fresh,
    log,
  });

  process.stdout.write(`\n[seed:demo] DONE. Demo db contents:\n${JSON.stringify(await countRows(db), null, 2)}\n`);
  await preCloseHousekeeping(db);
}

export interface RunFullSeedDeps {
  readonly db: Awaited<ReturnType<typeof createDb>>;
  readonly now: () => number;
  /** The invite/session-token pepper (any non-empty string against the throwaway db). */
  readonly sessionSecret: string;
  readonly casDir: string;
  readonly variantDir: string;
  /** Re-augment even when the demo sentinel already exists (the CLI's --force/--fresh; tests pass true). */
  readonly force: boolean;
  readonly log: (msg: string) => void;
  /** Override the effective vLLM-availability fact (tests pin `false` to keep routing through the
   *  deterministic `fakeVllmClient` below regardless of the box's GPU). Omitted ⇒ derive it the same way
   *  boot does (`entry/lifecycle.ts`): a force-off env override OR no GPU present. */
  readonly vllmDisabled?: boolean;
}

export interface RunFullSeedResult {
  readonly built: Awaited<ReturnType<typeof createServices>>;
  readonly ownerId: UserId;
  /** false when the sentinel was present and `force` was not set (demo content left untouched). */
  readonly augmented: boolean;
}

/** The effective vLLM-availability fact, derived the same way boot does (`entry/lifecycle.ts`): a
 *  force-off env override OR no GPU present — never assume the GPU. `gpuPresent` defaults to the real
 *  probe; injectable so this derivation is testable without exec-ing `nvidia-smi`. */
export function resolveSeedVllmDisabled(forceDisabled: boolean, gpuPresent: () => boolean = detectGpu): boolean {
  return forceDisabled || !gpuPresent();
}

/** The reusable seed core (shared by the CLI + the tooling int test): seed the owner, compose the service
 *  graph with the deterministic offline vLLM client, run the idempotent boot seeds, then — unless the demo
 *  sentinel is already present and `force` is off — augment with the demo content. Assumes `db` is already
 *  migrated. */
export async function runFullSeed(deps: RunFullSeedDeps): Promise<RunFullSeedResult> {
  const { db, now, sessionSecret, log } = deps;

  const handles = ownerHandles();
  const bootSessions = createSessionsService({ db, now, sessionSecret });
  const ownerIds = await seedOwner({ db, sessions: bootSessions, ownerHandles: handles, now });
  const ownerId = ownerIds[0];
  if (ownerId === undefined) {
    throw new Error("seed:demo: seedOwner returned no owner id");
  }
  const owner = principalOf(ownerId, handles[0] ?? env.DEFAULT_USER_HANDLE, "owner");

  const built = await createServices({
    db,
    now,
    ownerId,
    secretBoxKey: null,
    casDir: deps.casDir,
    variantDir: deps.variantDir,
    sessionSecret,
    vllmDisabled: deps.vllmDisabled ?? resolveSeedVllmDisabled(env.VLLM_DISABLED),
    repoRoot: process.cwd(),
    holder: "seed-demo",
    providerSeams: { vllmClient: fakeVllmClient(env.VLLM_EMBED_DIM), vllmEmbedDim: env.VLLM_EMBED_DIM },
  });

  // The idempotent boot seeds (owner cards + avatars, default persona, preset, themes) — safe to re-run.
  await seedDefaultPreset({ db, now });
  await seedThemes({ db, now });
  await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
  await seedDefaultPersona({ seeder: built.personaSeeder, owner });
  log("boot seeds applied (characters + avatars, default persona, preset, themes)");

  // Sentinel: the second human. Present ⇒ the demo content is already seeded; skip unless forced.
  const existingSecond = await built.sessions.resolveHandle(castId<Handle>(SECOND_HUMAN_HANDLE));
  if (existingSecond !== null && !deps.force) {
    log(`demo content already present (${SECOND_HUMAN_HANDLE} exists) — re-run with --fresh to rebuild. Skipping augmentation.`);
    return { built, ownerId, augmented: false };
  }

  await seedDemoContent({ services: built.services, built, owner, ownerId, log });
  return { built, ownerId, augmented: true };
}

interface SeedDemoDeps {
  readonly services: Awaited<ReturnType<typeof createServices>>["services"];
  readonly built: Awaited<ReturnType<typeof createServices>>;
  readonly owner: Principal;
  readonly ownerId: UserId;
  readonly log: (msg: string) => void;
}

async function seedDemoContent(deps: SeedDemoDeps): Promise<void> {
  const { services, built, owner, ownerId, log } = deps;

  // A second human (idempotent: ensureUser upserts by handle). Passwordless — a demo participant, not a
  // login; sidesteps the AUTH_MODE=local password-hash SESSION_SECRET requirement.
  const secondId = await built.sessions.ensureUser(SECOND_HUMAN_HANDLE);
  const second = principalOf(secondId, SECOND_HUMAN_HANDLE, "user");
  log(`second human ready: ${SECOND_HUMAN_HANDLE}`);

  // A persona for the second human (the owner already has the default "You" persona from boot).
  await services.persona.create({
    principal: second,
    input: { name: "Companion", description: "A curious co-pilot exploring the Loom alongside you.", starred: true },
  });

  // Point both humans' chat role at the local vLLM gen so the best-effort seeded turns run through the real
  // chat path against the deterministic fake engine (a write-path smoke). Absent this, a send fail-closes.
  // model deliberately "" — vllm is a config-derived source and the coherence guard REFUSES a pin
  // (routing-coherence.ts): the resolver derives the engine's own model live, which is the truth.
  const chatRoleDefault = { source: "vllm" as const, api: "chat-completions" as const, model: "" };
  for (const p of [owner, second]) {
    // biome-ignore lint/performance/noAwaitInLoops: two principals, ordered settings writes — serial is clearer than a race.
    await services.settings.updateUserSettingsSection({ principal: p, input: { section: "routing", patch: { roleDefaults: { chat: chatRoleDefault } } } });
  }

  // Resolve the boot-seeded default characters by handle.
  const handleToId = new Map<string, CharacterId>();
  for (const card of DEFAULT_CHARACTER_CARDS) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of cards; serial lookups keep the mapping obvious.
    const ref = await services.character.findByHandle({ ownerId, handle: card.input.handle });
    if (ref !== null) {
      handleToId.set(card.input.handle, ref.characterId);
    }
  }
  const assistantId = handleToId.get("assistant");
  // The pack's flagship trio ("The Ashen Spire" group demo, docs/design/default-character-roster.md).
  const groupCharIds = ["sabine", "calamity", "morgatha"].map((h) => handleToId.get(h)).filter((id): id is CharacterId => id !== undefined);

  // Solo chat — seeds the primary's greeting (verbatim, no model), then one best-effort scripted turn.
  if (assistantId !== undefined) {
    const solo = await services.chat.startChat({ principal: owner, characterIds: [assistantId], opening: "first-message", title: SOLO_CHAT_TITLE });
    await tryTurn(() => services.chat.send({ principal: owner, chatId: solo.chat.id, content: "Hi! Can you show me what this app can do?" }), log, "solo");
    log(`solo chat created: ${SOLO_CHAT_TITLE}`);
  }

  // Group chat — 3 characters greet-all, both humans, varied roster knobs. The second human joins via the
  // real invite→accept chokepoint (the only public human-join path).
  if (groupCharIds.length >= 3) {
    const group = await services.chat.startChat({
      principal: owner,
      characterIds: groupCharIds,
      opening: "greet-all",
      title: GROUP_CHAT_TITLE,
      groupConfig: { output: "per-speaker", autoMode: false, allowSelfResponses: false },
      rosterOverrides: groupCharIds[0] !== undefined ? { [groupCharIds[0]]: { talkativeness: 0.8 } } : undefined,
    });
    const invite = await services.chat.createInvite({ principal: owner, chatId: group.chat.id, input: { invitedHandle: castId<Handle>(SECOND_HUMAN_HANDLE) } });
    await services.chat.acceptInvite({ principal: second, inviteId: invite.invite.id });
    await tryTurn(() => services.chat.send({ principal: owner, chatId: group.chat.id, content: "Everyone here? Let's plan the next splice." }), log, "group");
    log(`group chat created: ${GROUP_CHAT_TITLE} (+${SECOND_HUMAN_HANDLE} joined)`);

    // A world book with entries, attached to the group chat.
    const book = await services.worldInfo.createBook({ principal: owner, input: { name: WORLD_BOOK_NAME, description: "Lore for the demo group chat." } });
    await services.worldInfo.createEntry({
      principal: owner,
      bookId: book.id,
      input: { title: "The Loom", content: "The great orbital engine binding the habitats into one turning wheel.", keys: ["loom", "wheel"], priority: 100 },
    });
    await services.worldInfo.createEntry({
      principal: owner,
      bookId: book.id,
      input: {
        title: "The Weavers",
        content: "Keepers who re-splice frayed threads by hand, singing the counting songs.",
        keys: ["weaver", "weavers", "splice"],
      },
    });
    await services.worldInfo.attachToChat({ principal: owner, chatId: group.chat.id, bookId: book.id });
    log(`world book created + attached: ${WORLD_BOOK_NAME}`);
  }

  // A databank document (paste-origin) + a synchronous ingest so document_chunks + embeddings exist.
  const upload = await services.databank.createFromText({ principal: owner, name: DEMO_DOCUMENT_NAME, text: DEMO_DOCUMENT_TEXT });
  const ingest = await built.databankIngest.ingestDocument({ documentId: upload.document.id, signal: new AbortController().signal });
  log(`databank document ingested: ${DEMO_DOCUMENT_NAME} (${ingest.chunksUpserted} chunk(s) embedded)`);

  // A saved generation preset.
  await services.preset.create({ userId: ownerId, name: DEMO_PRESET_NAME, kind: "chat" });
  log(`preset created: ${DEMO_PRESET_NAME}`);

  // A tag, attached to the assistant character.
  const tag = await services.tag.createTag({ principal: owner, input: { name: DEMO_TAG_NAME } });
  if (assistantId !== undefined) {
    await services.tag.attachTag({ principal: owner, tagId: tag.id, targetType: "character", targetId: assistantId });
  }
  log(`tag created + attached: ${DEMO_TAG_NAME}`);
}

/** Run a best-effort seeded chat turn: on offline-model failure, log the honest limitation and continue —
 *  the greeting transcript is already committed, so a demo db is valid either way. */
async function tryTurn(run: () => Promise<unknown>, log: (msg: string) => void, label: string): Promise<void> {
  try {
    await run();
    log(`${label}: seeded a scripted assistant turn`);
  } catch (err) {
    log(`${label}: skipped live turn (${err instanceof Error ? err.message : String(err)}) — greeting transcript kept`);
  }
}

// Run only when executed directly (the CLI). Importing this module (the tooling int test) must NOT boot the
// seeder — the test drives `runFullSeed` against an in-memory freshDb itself.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
