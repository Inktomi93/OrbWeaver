// The DEV demo-database seeder. Against a fresh db it stands up a populated, verifiable app so every
// `pnpm seed:demo --fresh` yields the same demo state (a group chat, a solo chat with a seeded transcript,
// two humans, personas, a world book, an ingested databank document with real chunks + embeddings, a saved
// preset, and tags) — the manual-verification substrate.
//
// WHY it composes the REAL services (never raw inserts): the seed content flows through the same domain
// verbs the app uses (character/persona/chat/world-info/databank/preset/tag), so a successful seed run is
// ALSO a smoke test of the write paths (FKs, belts, the embeddings single-write-path, the databank ingest
// pipeline). A raw-insert seeder would populate rows while silently bypassing every invariant.
//
// DEV-ONLY (structurally). This is throwaway tooling, NOT a boot path:
//   • Refuses when `NODE_ENV=production` unless `--force` — the scripted vLLM wiring must never become a
//     prod default.
//   • Refuses against a db that already carries demo content (the second-human sentinel) unless `--force`
//     or `--fresh` — so a re-run never dupes and never mutates a db that already looks seeded.
//   • `--fresh` wipes the `data/` db file (+ WAL/SHM sidecars), re-migrates from the baseline, then seeds.
// It writes ONLY through the domain verbs against whatever `DATABASE_URL` points at; it changes no config.
import { rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import {
  characterRegexScripts,
  chatBooks,
  chatParticipants,
  chatRegexScripts,
  chats,
  createDb,
  documentChunks,
  documents,
  globalRegexScripts,
  localPath,
  messages,
  personas,
  preCloseHousekeeping,
  presetRegexScripts,
  regexScripts,
  rosterPresetMembers,
  rosterPresets,
  tags,
  users,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type { CharacterHandle, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { deriveRegexTierFlags, SubstituteFindRegex } from "@orb/kit/regex";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { createSessionsService, ownerHandles } from "@orb/server/domain/sessions";
import {
  DB_LAUNCHED,
  readSeedAvatar,
  runBootMigrations,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedOwner,
  seedThemes,
} from "@orb/server/entry/boot";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { detectGpu } from "@orb/server/infra/providers";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { Db, RunFullSeedDeps, RunFullSeedResult, SeedDemoDeps } from "../contract/types.ts";
import { fakeVllmClient } from "../lib/fake-vllm.ts";
import {
  DEMO_DOCUMENT_NAME,
  DEMO_DOCUMENT_TEXT,
  DEMO_PRESET_NAME,
  DEMO_TAG_NAME,
  GROUP_CAST_HANDLES,
  GROUP_CAST_SIZE,
  GROUP_CHAT_TITLE,
  principalOf,
  REGEX_DISABLED_SCRIPT_NAME,
  REGEX_DISPLAY_ONLY_SCRIPT_NAME,
  REGEX_FIND_REPLACE_SCRIPT_NAME,
  REGEX_PROMPT_ONLY_SCRIPT_NAME,
  ROSTER_PRESET_ALT_NAME,
  ROSTER_PRESET_MATCHING_NAME,
  SECOND_HUMAN_HANDLE,
  SEED_SESSION_SECRET,
  SOLO_CHAT_TITLE,
  WORLD_BOOK_NAME,
} from "../lib/fixture.ts";
import { parseDemoArgs } from "../lib/transcript.ts";

refuseDirectInvocation(import.meta.url, "pnpm seed:demo (node tooling/src/seed/cli.ts <demo|chat|multi-user>)");

const FIRST_SEAT_TALKATIVENESS = 0.8;

async function validateRequiredDemoAssets(): Promise<void> {
  const handles = [...DEFAULT_CHARACTER_CARDS.map((card) => card.input.handle), castId<CharacterHandle>("persona-you")];
  const missing: string[] = [];
  for (const handle of handles) {
    if ((await readSeedAvatar(handle)) === null) {
      missing.push(handle);
    }
  }
  if (missing.length > 0) {
    throw new Error(`seed demo: required bundled avatars missing: ${missing.join(", ")}`);
  }
}
const LOOM_ENTRY_PRIORITY = 100;

/** Resolve a `file:` DATABASE_URL to an absolute on-disk path (cwd-relative like the server), else null.
 *  Delegates to `@orb/db`'s `localPath` — the ONE `file:`-URL parser (a local re-derivation here previously
 *  ran `fileURLToPath` on a relative `file:./data/x.db` url, which silently absolutizes the dot-segment
 *  against ROOT to `/data/x.db` instead of throwing — so `--fresh` wiped a file that was never the one
 *  `createDb` actually opened, and every "fresh" reseed silently reused the stale db). */
function dbFilePath(url: string): string | null {
  const raw = localPath(url);
  if (raw === undefined) {
    return null;
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

async function countRows(db: Db): Promise<Record<string, number>> {
  const tablesByLabel = {
    users,
    personas,
    chats,
    chatParticipants,
    messages,
    worldBooks,
    worldEntries,
    chatBooks,
    documents,
    documentChunks,
    tags,
    regexScripts,
    globalRegexScripts,
    characterRegexScripts,
    presetRegexScripts,
    chatRegexScripts,
    rosterPresets,
    rosterPresetMembers,
  };
  const pairs = await Promise.all(Object.entries(tablesByLabel).map(async ([label, table]): Promise<[string, number]> => [label, await db.$count(table)]));
  return Object.fromEntries(pairs);
}

/** The effective vLLM-availability fact, derived the same way boot does (`entry/lifecycle.ts`): a force-off
 *  env override OR no GPU present — never assume the GPU. `gpuPresent` defaults to the real probe;
 *  injectable so this derivation is testable without exec-ing `nvidia-smi`. */
export function resolveSeedVllmDisabled(forceDisabled: boolean, gpuPresent: () => boolean = detectGpu): boolean {
  return forceDisabled || !gpuPresent();
}

/** Run a best-effort seeded chat turn: on offline-model failure, log the honest limitation and continue —
 *  the greeting transcript is already committed, so a demo db is valid either way. */
async function tryTurn(run: () => Promise<unknown>, log: (msg: string) => void, label: string): Promise<void> {
  // @orb-gate-ignore caught-failure-ownership(empty:err): the JSDoc above states the intent directly — a best-effort seeded turn where the greeting transcript is already committed, so an offline-model failure is logged with the honest limitation and the demo db stays valid. Ends if the failure stops being logged.
  try {
    await run();
    log(`${label}: seeded a scripted assistant turn`);
  } catch (err) {
    log(`${label}: skipped live turn (${err instanceof Error ? err.message : String(err)}) — greeting transcript kept`);
  }
}

async function seedDemoContent(deps: SeedDemoDeps): Promise<void> {
  const { services, built, owner, ownerId, log } = deps;

  // A second human (idempotent: ensureUser upserts by handle). Passwordless — a demo participant, not a
  // login; sidesteps the AUTH_MODE=local password-hash SESSION_SECRET requirement.
  const secondId = await built.sessions.ensureUser(castId<Handle>(SECOND_HUMAN_HANDLE));
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
    await services.settings.updateUserSettingsSection({ principal: p, input: { section: "routing", patch: { roleDefaults: { chat: chatRoleDefault } } } });
  }

  // Resolve the boot-seeded default characters by handle.
  const handleToId = new Map<string, CharacterId>();
  for (const card of DEFAULT_CHARACTER_CARDS) {
    const ref = await services.character.findByHandle({ ownerId, handle: card.input.handle });
    if (ref !== null) {
      handleToId.set(card.input.handle, ref.characterId);
    }
  }
  const assistantId = handleToId.get("assistant");
  const groupCharIds = GROUP_CAST_HANDLES.map((h) => handleToId.get(h)).filter((id): id is CharacterId => id !== undefined);

  // Solo chat — seeds the primary's greeting (verbatim, no model), then one best-effort scripted turn.
  if (assistantId !== undefined) {
    const solo = await services.chat.startChat({ principal: owner, characterIds: [assistantId], opening: "first-message", title: SOLO_CHAT_TITLE });
    await tryTurn(() => services.chat.send({ principal: owner, chatId: solo.chat.id, content: "Hi! Can you show me what this app can do?" }), log, "solo");
    log(`solo chat created: ${SOLO_CHAT_TITLE}`);
  }

  // Group chat — 3 characters greet-all, both humans, varied roster knobs. The second human joins via the
  // real invite→accept chokepoint (the only public human-join path).
  if (groupCharIds.length >= GROUP_CAST_SIZE) {
    const group = await services.chat.startChat({ principal: owner, characterIds: groupCharIds, opening: "greet-all", title: GROUP_CHAT_TITLE });
    // Group config + per-seat roster tuning are POST-CREATE writes now (R2 retired the creation-time draft
    // carry) — apply them against the real room the same way the group-config/roster panels do.
    await services.chat.setGroupConfig({
      principal: owner,
      chatId: group.chat.id,
      config: { output: "per-speaker", autoMode: false, allowSelfResponses: false },
    });
    const firstSeat = group.chat.participants.find((p) => p.characterId === groupCharIds[0]);
    if (firstSeat !== undefined) {
      await services.chat.setSeatKnobs({
        principal: owner,
        chatId: group.chat.id,
        participantId: firstSeat.id,
        patch: { talkativeness: FIRST_SEAT_TALKATIVENESS },
      });
    }
    const invite = await services.chat.createInvite({ principal: owner, chatId: group.chat.id, input: { invitedHandle: castId<Handle>(SECOND_HUMAN_HANDLE) } });
    await services.chat.acceptInvite({ principal: second, inviteId: invite.invite.id });
    await tryTurn(() => services.chat.send({ principal: owner, chatId: group.chat.id, content: "Everyone here? Let's plan the next splice." }), log, "group");
    log(`group chat created: ${GROUP_CHAT_TITLE} (+${SECOND_HUMAN_HANDLE} joined)`);

    // A world book with entries, attached to the group chat.
    const book = await services.worldInfo.createBook({ principal: owner, input: { name: WORLD_BOOK_NAME, description: "Lore for the demo group chat." } });
    await services.worldInfo.createEntry({
      principal: owner,
      bookId: book.id,
      input: {
        title: "The Loom",
        content: "The great orbital engine binding the habitats into one turning wheel.",
        keys: ["loom", "wheel"],
        priority: LOOM_ENTRY_PRIORITY,
      },
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

    // Regex scripts (#1725 boards 04/05 + the #1742 room Regex section) — one per tier, so the room's
    // effective run order shows every tier populated on a fresh db: global / character / chat / preset
    // (the preset leg lands below, once the demo preset exists). `deriveRegexTierFlags` is the SAME pure
    // derivation the client's save boundary and the server's bulk-placement verb use, so a seeded row's
    // markdownOnly/promptOnly flags can never disagree with its placement set.
    const findReplacePlacement: RegexPlacement[] = ["AI_OUTPUT", "USER_INPUT"];
    const findReplaceScript = await services.regex.createScript({
      principal: owner,
      input: {
        name: REGEX_FIND_REPLACE_SCRIPT_NAME,
        enabled: true,
        findRegex: "\\bthe Loom\\b",
        replaceString: "the great Loom",
        placement: findReplacePlacement,
        ...deriveRegexTierFlags(findReplacePlacement),
        runOnEdit: false,
        trimStrings: [],
        substituteRegex: SubstituteFindRegex.none,
      },
    });
    await services.regex.attachGlobal({ principal: owner, scriptId: findReplaceScript.id });

    const displayOnlyPlacement: RegexPlacement[] = ["DISPLAY"];
    const displayOnlyScript = await services.regex.createScript({
      principal: owner,
      input: {
        name: REGEX_DISPLAY_ONLY_SCRIPT_NAME,
        enabled: true,
        findRegex: "\\*([^*]+)\\*",
        replaceString: "_$1_",
        placement: displayOnlyPlacement,
        ...deriveRegexTierFlags(displayOnlyPlacement),
        runOnEdit: false,
        trimStrings: [],
        substituteRegex: SubstituteFindRegex.none,
      },
    });
    if (assistantId !== undefined) {
      await services.regex.attachToCharacter({ principal: owner, characterId: assistantId, scriptId: displayOnlyScript.id });
    }

    const promptOnlyPlacement: RegexPlacement[] = ["AI_OUTPUT"];
    const promptOnlyScript = await services.regex.createScript({
      principal: owner,
      input: {
        name: REGEX_PROMPT_ONLY_SCRIPT_NAME,
        enabled: true,
        findRegex: "\\bvault-key-7\\b",
        replaceString: "[redacted]",
        placement: promptOnlyPlacement,
        ...deriveRegexTierFlags(promptOnlyPlacement),
        runOnEdit: false,
        trimStrings: [],
        substituteRegex: SubstituteFindRegex.none,
      },
    });
    await services.regex.attachToChat({ principal: owner, chatId: group.chat.id, scriptId: promptOnlyScript.id });
    log(
      `regex scripts created + attached: global/${REGEX_FIND_REPLACE_SCRIPT_NAME}, character/${REGEX_DISPLAY_ONLY_SCRIPT_NAME}, chat/${REGEX_PROMPT_ONLY_SCRIPT_NAME}`,
    );

    // Saved rosters (D61 B6) — through the same library-create door the rosters panel uses. One matching
    // the demo group's seated trio, one a different pairing, so the picker shows more than a single row.
    await services.rosterPreset.create({
      principal: owner,
      input: {
        name: ROSTER_PRESET_MATCHING_NAME,
        description: "The refinery crew, ready to seat as a group.",
        members: groupCharIds.map((characterId, position) => ({ kind: "character" as const, characterId, position })),
      },
    });
    if (assistantId !== undefined) {
      const altMembers = [assistantId, groupCharIds[0]]
        .filter((id): id is CharacterId => id !== undefined)
        .map((characterId, position) => ({ kind: "character" as const, characterId, position }));
      await services.rosterPreset.create({
        principal: owner,
        input: { name: ROSTER_PRESET_ALT_NAME, description: "A smaller two-seat pairing.", members: altMembers },
      });
    }
    log(`saved rosters created: ${ROSTER_PRESET_MATCHING_NAME}, ${ROSTER_PRESET_ALT_NAME}`);
  }

  // A databank document (paste-origin) + a synchronous ingest so document_chunks + embeddings exist.
  const upload = await services.databank.createFromText({ principal: owner, name: DEMO_DOCUMENT_NAME, text: DEMO_DOCUMENT_TEXT });
  const ingest = await built.databankIngest.ingestDocument({ documentId: upload.document.id, signal: new AbortController().signal });
  log(`databank document ingested: ${DEMO_DOCUMENT_NAME} (${ingest.chunksUpserted} chunk(s) embedded)`);

  // A saved generation preset.
  const preset = await services.preset.create({ userId: ownerId, name: DEMO_PRESET_NAME, kind: "chat" });
  log(`preset created: ${DEMO_PRESET_NAME}`);

  // The FOURTH regex tier: a DISABLED script attached to the demo preset — so the preset leg of the room's
  // Regex section is populated too, and a disabled row stays disabled through the attach.
  const disabledPlacement: RegexPlacement[] = ["WORLD_INFO"];
  const disabledScript = await services.regex.createScript({
    principal: owner,
    input: {
      name: REGEX_DISABLED_SCRIPT_NAME,
      enabled: false,
      findRegex: "\\r\\n",
      replaceString: "\\n",
      placement: disabledPlacement,
      ...deriveRegexTierFlags(disabledPlacement),
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: SubstituteFindRegex.none,
    },
  });
  await services.regex.attachToPreset({ principal: owner, presetId: preset.id, scriptId: disabledScript.id });
  log(`regex script created (disabled) + attached: preset/${REGEX_DISABLED_SCRIPT_NAME}`);

  // A tag, attached to the assistant character.
  const tag = await services.tag.createTag({ principal: owner, input: { name: DEMO_TAG_NAME } });
  if (assistantId !== undefined) {
    await services.tag.attachTag({ principal: owner, tagId: tag.id, targetType: "character", targetId: assistantId });
  }
  log(`tag created + attached: ${DEMO_TAG_NAME}`);
}

/** The reusable seed core (shared by the CLI + the tooling int test): seed the owner, compose the service
 *  graph with the deterministic offline vLLM client, run the idempotent boot seeds, then — unless the demo
 *  sentinel is already present and `force` is off — augment with the demo content. Assumes `db` is already
 *  migrated. */
export async function runFullSeed(deps: RunFullSeedDeps): Promise<RunFullSeedResult> {
  const { db, now, sessionSecret, log } = deps;

  await Promise.resolve(deps.validateRequiredAssets?.());

  const handles = ownerHandles();
  const bootSessions = createSessionsService({ db, now, sessionSecret });
  const ownerIds = await seedOwner({ db, sessions: bootSessions, ownerHandles: handles, now });
  const ownerId = ownerIds[0];
  if (ownerId === undefined) {
    throw new Error("seed demo: seedOwner returned no owner id");
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
    providerSeams: { vllmClient: fakeVllmClient(env.VLLM_EMBED_DIM, env.VLLM_GEN_MODEL), vllmEmbedDim: env.VLLM_EMBED_DIM },
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

/** `pnpm seed:demo [--fresh] [--force]`. */
export async function runDemoSeed(argv: readonly string[]): Promise<ExitCode> {
  const args = parseDemoArgs(argv);
  const log = (msg: string): void => {
    print(`[seed:demo] ${msg}`);
  };

  if (env.NODE_ENV === "production" && !args.force) {
    warn("[seed:demo] REFUSING: NODE_ENV=production. This is dev tooling — re-run with --force only if you truly mean it.");
    return EXIT.violations;
  }

  // @orb-gate-ignore caught-failure-ownership(empty:error): the message is warned to the operator and the function returns EXIT.toolError — propagated through both channels, not dropped. Ends if either the warn or the return code is removed.
  try {
    await validateRequiredDemoAssets();
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
    return EXIT.toolError;
  }

  const filePath = dbFilePath(env.DATABASE_URL);
  if (args.fresh) {
    if (filePath === null) {
      warn(`[seed:demo] --fresh requires a file: DATABASE_URL (got ${env.DATABASE_URL}).`);
      return EXIT.violations;
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(filePath + suffix, { force: true });
    }
    log(`--fresh: wiped ${filePath} (+ WAL/SHM)`);
  }

  const now = (): number => Date.now();
  const db = await createDb(env.DATABASE_URL);
  await runBootMigrations({ db, databaseUrl: env.DATABASE_URL, launched: DB_LAUNCHED });
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

  print(`\n[seed:demo] DONE. Demo db contents:\n${JSON.stringify(await countRows(db), null, 2)}`);
  await preCloseHousekeeping(db);
  return EXIT.clean;
}
