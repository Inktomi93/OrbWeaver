// The HEAVY-fixture chat seeder. Stands up ONE chat carrying a long, deterministic transcript (N
// alternating user/assistant messages over M characters) so long-transcript / compaction / virtualization
// reviews have the VOLUME the UI cannot produce in a reasonable number of calls (UI-driving seeds honest
// SMALL fixtures; this is the escape hatch for scroll/ordering looks).
//
// It writes through the app's own CANON-SAFE bulk seam — the portability chat descriptor's `importFile`,
// which parses the transcript and delegates to chat's `bulkImportChats` (message SLOT + variant pool +
// selected-pointer + founding roster, one atomic db.batch). NEVER a raw INSERT that would bypass the canon
// invariants (variants / selectedVariantId / roster / the downstream index sweep).
//
// ROSTER: the canon bulk-import path rosters host + ONE primary character per chat (its contract) — so a
// multi-`--characters` run creates/reuses M library cards and the assistant lines round-robin their NAMES in
// the content (a group-flavoured transcript), while the chat's seated roster is host + the primary card.
//
// DEV-ONLY: refuses under NODE_ENV=production unless --force. SHARED-DB CAVEAT: an ALREADY-RUNNING dev stack
// holds its OWN libSQL/WAL connection snapshot — a second writer's committed rows are NOT guaranteed visible
// to that live connection, so a seed run WHILE the stack is up may land in the file yet stay invisible until
// the stack RESTARTS. Either restart after seeding, or point a fresh DATABASE_URL at a scratch file.

import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import { chatParticipants, chats, createDb, preCloseHousekeeping } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService, ownerHandles } from "@orb/server/domain/sessions";
import {
  createLocalLightUserSeed,
  DB_LAUNCHED,
  migrateDataLayout,
  runBootMigrations,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedOwner,
  seedThemes,
} from "@orb/server/entry/boot";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { and, desc, eq } from "drizzle-orm";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { Db, Services } from "../contract/types.ts";
import { fakeLocalLightCache } from "../lib/fake-local-light.ts";
import { CHAT_SEED_SESSION_SECRET, principalOf } from "../lib/fixture.ts";
import { buildTranscript, parseChatArgs, SEED_HANDLE_PREFIX, transcriptFilename } from "../lib/transcript.ts";

refuseDirectInvocation(import.meta.url, "pnpm seed:demo (node tooling/src/seed/cli.ts <demo|chat|multi-user>)");

/** Ensure M heavy-fixture characters exist (reuse by handle, else create); return their ids + names in order. */
async function ensureCharacters(
  services: Services,
  owner: ReturnType<typeof principalOf>,
  ownerId: UserId,
  count: number,
): Promise<{ id: CharacterId; name: string }[]> {
  const characters: { id: CharacterId; name: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const handle = castId<CharacterHandle>(`${SEED_HANDLE_PREFIX}-${i + 1}`);
    const name = `Character ${i + 1}`;
    const existing = await services.character.findByHandle({ ownerId, handle });
    if (existing !== null) {
      characters.push({ id: existing.characterId, name });
      continue;
    }
    const created = await services.character.create({
      principal: owner,
      input: { handle, name, description: `Deterministic heavy-fixture character ${i + 1}.`, greetings: [{ text: `${name} here.` }] },
    });
    characters.push({ id: created.id, name });
  }
  return characters;
}

/** The import derives `chats.title` from the `<handle>/<leaf>` filename; find the row it wrote so the clean
 *  `--title` can be applied through the real chat verb. */
async function findSeededChatId(db: Db, ownerId: UserId, importedFrom: string): Promise<string | null> {
  const rows = await db
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(and(eq(chatParticipants.userId, ownerId), eq(chats.importedFrom, importedFrom)))
    .orderBy(desc(chats.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** `seed chat --messages N --characters M [--title "…"] [--force]`. */
export async function runChatSeed(argv: readonly string[]): Promise<ExitCode> {
  const args = parseChatArgs(argv);
  const log = (msg: string): void => {
    print(`[seed-chat] ${msg}`);
  };

  if (env.NODE_ENV === "production" && !args.force) {
    warn("[seed-chat] REFUSING: NODE_ENV=production. Dev tooling — re-run with --force only if you truly mean it.");
    return EXIT.violations;
  }

  const now = (): number => Date.now();
  await migrateDataLayout({ layout: env.DATA_LAYOUT });
  const db = await createDb(env.DATABASE_URL);
  await runBootMigrations({ db, databaseUrl: env.DATABASE_URL, backupDir: env.DATA_LAYOUT.backups, launched: DB_LAUNCHED });

  const sessionSecret = env.SESSION_SECRET ?? CHAT_SEED_SESSION_SECRET;
  const handles = ownerHandles();
  // #2481 — the owner is minted through `ensureUser` below, and this CLI never runs the boot sweep, so
  // the per-user seed is the only thing that gives the seeded owner its local-light vector floor.
  const bootSessions = createSessionsService({ db, now, sessionSecret, seedUserConnections: createLocalLightUserSeed({ db, now }) });
  const ownerIds = await seedOwner({ db, sessions: bootSessions, ownerHandles: handles, now });
  const ownerId = ownerIds[0];
  if (ownerId === undefined) {
    throw new Error("seed chat: seedOwner returned no owner id");
  }
  const owner = principalOf(ownerId, handles[0] ?? env.DEFAULT_USER_HANDLE, "owner");

  const built = await createServices({
    db,
    now,
    ownerId,
    secretBoxKey: null,
    casDir: env.ASSETS_DIR,
    variantDir: env.DATA_LAYOUT.variants,
    sessionSecret,
    holder: "seed-chat",
    // A seed run has no supervisor, so `admin.restart` refuses here.
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    // The seeded local-light rows embed through the scripted cache — no download, no GPU, byte-stable.
    providerSeams: { localLight: { cache: fakeLocalLightCache(EMBED_SPACE_DIMS) } },
  });

  // The idempotent boot seeds (owner cards, default persona, preset, themes) — safe on an already-seeded db.
  await seedDefaultPreset({ db, now });
  await seedThemes({ db, now });
  await seedDefaultCharacters({ seeder: built.characterSeeder, owner });
  await seedDefaultPersona({ seeder: built.personaSeeder, owner });

  const characters = await ensureCharacters(built.services, owner, ownerId, args.characters);
  log(`characters ready: ${characters.map((c) => `${c.name}(${c.id})`).join(", ")}`);

  const filename = transcriptFilename(`${SEED_HANDLE_PREFIX}-1`, args.title);
  const transcript = buildTranscript({ title: args.title, messageCount: args.messages, characterNames: characters.map((c) => c.name) });
  const chatDescriptor = built.portability.find((e) => e.kind === "chat");
  if (chatDescriptor === undefined) {
    throw new Error("seed chat: no chat portability descriptor (composition changed?)");
  }
  const outcome = await chatDescriptor.importFile(ownerId, { filename, bytes: new TextEncoder().encode(transcript) });
  if (!outcome.ok) {
    throw new Error(`seed chat: import failed — ${outcome.error}`);
  }

  const chatId = await findSeededChatId(db, ownerId, filename);
  if (chatId !== null && outcome.created === true) {
    await built.services.chat.updateTitle({ principal: owner, chatId: castId<ChatId>(chatId), title: args.title });
  }
  log(outcome.created === true ? "imported a fresh chat" : "chat already present (idempotent skip — same bytes)");
  print(
    `\n[seed-chat] DONE.\n  chatId: ${chatId ?? "(not found)"}\n  title:  ${args.title}\n  messages: ${args.messages}\n  characters: ${characters.map((c) => c.name).join(", ")}\n  verify: curl -s "$BASE/api/_debug/db/chat/${chatId ?? "<id>"}" -H "x-debug-token: $DEBUG_TOKEN" | jq '.messages | length'`,
  );

  await preCloseHousekeeping(db);
  return EXIT.clean;
}
