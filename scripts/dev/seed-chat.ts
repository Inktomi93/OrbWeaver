#!/usr/bin/env tsx
/**
 * seed-chat — the HEAVY-fixture chat seeder. Stands up ONE chat carrying a long, deterministic transcript
 * (N alternating user/assistant messages over M characters) so long-transcript / compaction /
 * virtualization reviews have the VOLUME the UI can't produce in a reasonable number of calls (UI-driving
 * seeds honest SMALL fixtures; this is the escape hatch for scroll/ordering looks).
 *
 *   tsx scripts/dev/seed-chat.ts --messages 120 --characters 3 [--title "..."]
 *
 * Dev tooling (throwaway script; global KISS applies — NOT the architecture). It composes the REAL service
 * graph (like scripts/seed/seed-demo.ts) and writes through the app's own CANON-SAFE bulk seam — the
 * portability chat descriptor's `importFile`, which parses the transcript and delegates to chat's
 * `bulkImportChats` (message SLOT + variant pool + selected-pointer + founding roster, one atomic
 * db.batch). NEVER a raw INSERT that would bypass the canon invariants (variants / selectedVariantId /
 * roster / the downstream index sweep).
 *
 * ROSTER: the canon bulk-import path (domain/chat/persistence/import-write.ts) rosters host + ONE primary
 * character per chat (its contract) — so a multi-`--characters` run creates/reuses M library cards and the
 * assistant lines round-robin their NAMES in the content (a group-flavoured transcript), while the chat's
 * seated roster is host + the primary card. That's exactly what a virtualization/scroll review needs; a
 * true M-way live group roster would require N real generation turns (slow + model-dependent).
 *
 * DETERMINISM: every line is numbered (`[#0000] …`) so a reviewer can assert ORDERING and offset math
 * against the rendered list. Re-running with the same args is idempotent by the import-hash oracle (the
 * bytes are stable), so it never dupes.
 *
 * DEV-ONLY: refuses under NODE_ENV=production unless --force. Writes through whatever DATABASE_URL points
 * at. SHARED-DB CAVEAT: an ALREADY-RUNNING dev stack holds its OWN libSQL/WAL connection snapshot — a second
 * writer's committed rows are NOT guaranteed visible to that live connection (and vice-versa), so a seed run
 * WHILE the stack is up may land in the file yet stay invisible to /api/_debug and --open-chat until the
 * stack RESTARTS (it re-opens the file). Two clean ways to use it:
 *   • RESTART-AFTER: run the seed, then bounce the dev stack — it picks the seeded chat up.
 *   • FRESH DB: `DATABASE_URL=file:/tmp/x.db tsx scripts/dev/seed-chat.ts …` then point a stack at it.
 * Verify (against a stack that has the file open): `curl /api/_debug/db/chat/<id>` (message count) or
 * `pnpm snap / --open-chat <id> --text`.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { Principal } from "@orb/contracts/identity";
import { chatParticipants, chats, createDb, preCloseHousekeeping } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService, ownerHandles } from "@orb/server/domain/sessions";
import { runBootMigrations, seedDefaultCharacters, seedDefaultPersona, seedDefaultPreset, seedOwner, seedThemes } from "@orb/server/entry/boot";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { and, desc, eq } from "drizzle-orm";

const SEED_SESSION_SECRET = "orbweaver-seed-chat-session-secret-do-not-ship";
const DEFAULT_MESSAGES = 120;
const DEFAULT_CHARACTERS = 3;
const DEFAULT_TITLE = "Heavy transcript fixture";
// The synthesized card handles — reused across runs (findByHandle before create), so the library never dupes.
const SEED_HANDLE_PREFIX = "seed-cast";
// Alternate user↔assistant every other row; zero-pad the line index to this width for stable sort/grep.
const ROLE_STRIDE = 2;
const SEQ_PAD = 4;

interface Args {
  readonly messages: number;
  readonly characters: number;
  readonly title: string;
  readonly force: boolean;
}

function numFlag(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  const raw = i === -1 ? undefined : argv[i + 1];
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function strFlag(argv: readonly string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  const raw = i === -1 ? undefined : argv[i + 1];
  return raw !== undefined && !raw.startsWith("--") ? raw : fallback;
}

function parseArgs(argv: readonly string[]): Args {
  return {
    messages: numFlag(argv, "--messages", DEFAULT_MESSAGES),
    characters: numFlag(argv, "--characters", DEFAULT_CHARACTERS),
    title: strFlag(argv, "--title", DEFAULT_TITLE),
    force: argv.includes("--force"),
  };
}

// A minimal offline vLLM client — the seeder never generates (the transcript is synthesized), but
// createServices requires the seam. It rejects any call, which is fine: nothing here embeds or streams.
function inertVllmClient(): VllmEngineClient {
  return {
    enginePost: <T>(_engine: string, path: string): Promise<T> => Promise.reject(new Error(`seed-chat: no live model (enginePost ${path})`)),
    engineStream: (_engine: string, path: string): Promise<ReadableStream<Uint8Array>> =>
      Promise.reject(new Error(`seed-chat: no live model (engineStream ${path})`)),
    baseUrl: (engine: string): string => `http://127.0.0.1:0/${engine}`,
  };
}

function principalOf(userId: UserId, handle: string): Principal {
  return { userId, role: "owner", handle: castId<Handle>(handle), externalId: null, via: "fallback" };
}

/** Ensure M cast characters exist (reuse by handle, else create); return their ids + names in order. */
async function ensureCast(
  services: Awaited<ReturnType<typeof createServices>>["services"],
  owner: Principal,
  ownerId: UserId,
  count: number,
): Promise<{ id: CharacterId; name: string }[]> {
  const cast: { id: CharacterId; name: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const handle = castId<CharacterHandle>(`${SEED_HANDLE_PREFIX}-${i + 1}`);
    const name = `Cast ${i + 1}`;
    // biome-ignore lint/performance/noAwaitInLoops: a handful of cards; serial keeps the create-or-reuse obvious.
    const existing = await services.character.findByHandle({ ownerId, handle });
    if (existing !== null) {
      cast.push({ id: existing.characterId, name });
      continue;
    }
    const created = await services.character.create({
      principal: owner,
      input: { handle, name, description: `Deterministic heavy-fixture cast member ${i + 1}.`, greetings: [{ text: `${name} here.` }] },
    });
    cast.push({ id: created.id, name });
  }
  return cast;
}

/** ST send_date human string (the parser accepts any string; a stable synthetic keeps re-runs byte-identical). */
function sendDate(seq: number): string {
  return `seed message ${String(seq).padStart(SEQ_PAD, "0")}`;
}

/** Build a deterministic ST `.jsonl` transcript: header line + N alternating user/assistant messages, each
 *  numbered so a reviewer can assert ordering. Assistant lines round-robin the cast NAMES (group flavour). */
function buildTranscript(args: { readonly title: string; readonly messageCount: number; readonly castNames: readonly string[] }): string {
  const { title, messageCount, castNames } = args;
  const header = { user_name: "You", character_name: castNames[0] ?? "Cast 1", create_date: sendDate(0), chat_metadata: { seedTitle: title } };
  const lines: string[] = [JSON.stringify(header)];
  for (let seq = 0; seq < messageCount; seq += 1) {
    const isUser = seq % ROLE_STRIDE === 0;
    const speaker = isUser ? "You" : (castNames[Math.floor(seq / ROLE_STRIDE) % Math.max(castNames.length, 1)] ?? "Cast 1");
    const label = `[#${String(seq).padStart(SEQ_PAD, "0")}]`;
    const mes = isUser ? `${label} user line ${seq} — asking about item ${seq}.` : `${label} ${speaker} replies to line ${seq}.`;
    lines.push(JSON.stringify({ name: speaker, is_user: isUser, is_system: false, mes, send_date: sendDate(seq + 1) }));
  }
  return `${lines.join("\n")}\n`;
}

/** The chat title as it renders: import writes `chats.title` from the parser's `character_name` header field
 *  fallback — so we set the seeded title through the transcript header AND read it back from the row. */
async function findSeededChatId(db: Awaited<ReturnType<typeof createDb>>, ownerId: UserId, importedFrom: string): Promise<string | null> {
  const rows = await db
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(and(eq(chatParticipants.userId, ownerId), eq(chats.importedFrom, importedFrom)))
    .orderBy(desc(chats.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string): void => {
    process.stdout.write(`[seed-chat] ${msg}\n`);
  };

  if (env.NODE_ENV === "production" && !args.force) {
    process.stderr.write("[seed-chat] REFUSING: NODE_ENV=production. Dev tooling — re-run with --force only if you truly mean it.\n");
    process.exitCode = 1;
    return;
  }

  const now = (): number => Date.now();
  const db = await createDb(env.DATABASE_URL);
  await runBootMigrations({ db, databaseUrl: env.DATABASE_URL });

  const handles = ownerHandles();
  const bootSessions = createSessionsService({ db, now, sessionSecret: env.SESSION_SECRET ?? SEED_SESSION_SECRET });
  const ownerIds = await seedOwner({ db, sessions: bootSessions, ownerHandles: handles, now });
  const ownerId = ownerIds[0];
  if (ownerId === undefined) {
    throw new Error("seed-chat: seedOwner returned no owner id");
  }
  const owner = principalOf(ownerId, handles[0] ?? env.DEFAULT_USER_HANDLE);

  const built = await createServices({
    db,
    now,
    ownerId,
    secretBoxKey: null,
    casDir: env.ASSETS_DIR,
    variantDir: `${env.ASSETS_DIR}/../variants`,
    sessionSecret: env.SESSION_SECRET ?? SEED_SESSION_SECRET,
    vllmDisabled: true,
    repoRoot: process.cwd(),
    holder: "seed-chat",
    providerSeams: { vllmClient: inertVllmClient(), vllmEmbedDim: env.VLLM_EMBED_DIM },
  });

  // The idempotent boot seeds (owner cards, default persona, preset, themes) — safe on an already-seeded db.
  await seedDefaultPreset({ db, now });
  await seedThemes({ db, now });
  await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
  await seedDefaultPersona({ seeder: built.personaSeeder, owner });

  const cast = await ensureCast(built.services, owner, ownerId, args.characters);
  log(`cast ready: ${cast.map((c) => `${c.name}(${c.id})`).join(", ")}`);

  const primaryHandle = `${SEED_HANDLE_PREFIX}-1`;
  const transcript = buildTranscript({ title: args.title, messageCount: args.messages, castNames: cast.map((c) => c.name) });
  // The portability chat descriptor is the app's own import path: <handle>/<leaf>.jsonl → parse → importChats
  // → the canon-safe bulkImportChats. `importedFrom` is the filename; make it title-derived + unique so the
  // seeded chat is findable and re-runs (same bytes) idempotently skip via the import-hash oracle.
  const leaf = `${args.title.replace(/[^\w-]+/g, "-")}.jsonl`;
  const filename = `${primaryHandle}/${leaf}`;
  const chatDescriptor = built.portability.find((e) => e.kind === "chat");
  if (chatDescriptor === undefined) {
    throw new Error("seed-chat: no chat portability descriptor (composition changed?)");
  }
  const outcome = await chatDescriptor.importFile(ownerId, { filename, bytes: new TextEncoder().encode(transcript) });
  if (!outcome.ok) {
    throw new Error(`seed-chat: import failed — ${outcome.error}`);
  }

  const chatId = await findSeededChatId(db, ownerId, filename);
  // The import derives `chats.title` from the `<handle>/<leaf>` filename; set the clean `--title` through the
  // real chat verb so the seeded chat renders + opens (--open-chat) under the name the caller asked for.
  if (chatId !== null && outcome.created) {
    await built.services.chat.updateTitle({ principal: owner, chatId: castId<ChatId>(chatId), title: args.title });
  }
  log(outcome.created ? "imported a fresh chat" : "chat already present (idempotent skip — same bytes)");
  process.stdout.write(
    `\n[seed-chat] DONE.\n  chatId: ${chatId ?? "(not found)"}\n  title:  ${args.title}\n  messages: ${args.messages}\n  cast: ${cast.map((c) => c.name).join(", ")}\n  verify: curl -s "$BASE/api/_debug/db/chat/${chatId ?? "<id>"}" -H "x-debug-token: $DEBUG_TOKEN" | jq '.messages | length'\n`,
  );

  await preCloseHousekeeping(db);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
