// The chat READ SURFACE (`verbs/read.ts`) — proves against a real libSQL db: the listings are MEMBERSHIP-scoped
// (D18 — only the caller's chats), the lineage/fork walks gate per-ancestor INDEPENDENTLY (D27 — a fork grants
// no parent membership), the single reads return the D26 slot⋈variant views, the DRY-RUN previews build the
// prompt WITHOUT persisting or running a turn, the stream-ring reads return the resumable slice, and a
// non-participant is default-denied (leak-free NOT_FOUND). Reached through the BUNDLE `createRead(ctx, deps)`.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, ChatListCursor, MemberCardVisibility } from "@orb/contracts/chat";
import { characterRegexTierKey, SHAPE_BREAKPOINT_DECISIONS } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG, TEMPLATE_DEFS } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { characterBooks, chatParticipants, chats as chatsTable, messages, messageVariants, personaBooks, worldBooks, worldEntries } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatInviteId, Handle, ModelId, PersonaId, PresetId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createTurnPersonaResolver, voicePersonaFor } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus.ts";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { insertInvite, redeemInviteAtomic } from "../../../../../packages/server/src/domain/chat/persistence/invites.ts";
import { loadMessageView } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle.ts";
// The D16 policy SETTER (verbs/participants.ts) — imported here so the round-trip tests below drive the real
// write path against the real read clamp in one room (the setter's own gates live in roster.int.test.ts).
import { createParticipants, setParticipantActivePersona } from "../../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read.ts";
import { loadPersonasForOwners } from "../../../../../packages/server/src/domain/persona/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { makeGenerationCapability, makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";

import {
  addVariant,
  FROZEN_AT,
  makeChatContext,
  makeLoadParticipantViews,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPersona,
  seedStreamEvent,
  seedUser,
} from "../_support.ts";

// The `DEFAULT_PROMPT_CONFIG` main-section framing, `{{char}}` resolved through the speaker arm: the JOINED
// every seated character (narrator) vs a SINGLE primary (per-speaker). The two arms also resolve DIFFERENT default texts —
// the narrator arm gets `NARRATOR_MAIN_PROMPT_TEMPLATE` ("…voicing {{char}} and the world around them"),
// every other arm keeps the shipped per-speaker bytes. Hoisted per biome's top-level-regex rule.
const JOINED_CHARACTERS_FRAMING = /You are the narrator of an immersive[^\n]*voicing (Aria, Kai|Kai, Aria) and the world around them/;
const SINGLE_SPEAKER_FRAMING = /You are (Aria|Kai) in an immersive/;
/** The `listChats` page ceiling (`CHAT_LIST_MAX_LIMIT` in verbs/read.ts). Named here so the clamp arm below
 *  fails loudly if the verb's number moves, instead of silently testing a bound that no longer exists. */
const CHAT_LIST_PAGE_CEILING = 100;

/** The per-speaker MERGED default: the single default text with `{{char}}` bound to the whole roster. */
const ROSTER_FRAMING = /You are (Aria, Kai|Kai, Aria) in an immersive/;

let db: Db;
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  loadParticipantViews = makeLoadParticipantViews(db);
});

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** The read deps — the roster resolver + the (preview-only) connection/assemble resolvers. */
function makeDeps(overrides?: Partial<Parameters<typeof createRead>[1]>): Parameters<typeof createRead>[1] {
  return {
    loadParticipantViews,
    resolveConnection: () => Promise.resolve(makeResolved({ model: castId<ModelId>("test-model") })),
    checkSendAvailability: () => Promise.resolve({ available: true }),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: null, active: null },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
    // LAST so a caller can actually override any dep — the spread used to sit ABOVE `resolveForeignInputs`,
    // which silently ignored a foreign-inputs override (a test could not vary the preset).
    ...overrides,
  };
}

/** Seed a host+character chat where `host` is the room host. */
async function seedRoom(key: string, host: UserId): Promise<ChatId> {
  const chatId = await seedChat(db, key);
  const charA = await seedCharacter(db, host, `${key}_char`);
  await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `${key}_c`, characterId: charA });
  return chatId;
}

// ── #1742 — `listEffectiveRegex`, the room's Regex section's body ───────────────────────────────────────
describe("read — listEffectiveRegex (host-only, #1742)", () => {
  /** A room whose four tiers each hold one script. The rows come through the INJECTED scope resolver (the
   *  same op a turn uses), so this exercises the read's own job — gate, tier assembly, run order — without
   *  re-testing the junction queries `resolve-sources.int.test.ts` owns. */
  function regexSources(characterId: CharacterId): ChatContext["resolveRegexSources"] {
    const row = (name: string): RegexScriptRow =>
      regexScriptSchema.parse({
        id: mintTypeId(ID_PREFIX.regexScript),
        name,
        updatedAt: 1_700_000_000_000,
        findRegex: name,
        replaceString: `<${name}>`,
        placement: ["USER_INPUT"],
      });
    return () =>
      Promise.resolve({
        hostGlobal: [row("g1")],
        preset: [row("p1")],
        character: [{ characterId, scripts: [row("c1")] }],
        chat: [row("r1")],
      });
  }

  test("the HOST reads every tier in run order, with the ranks the turn will apply", async () => {
    const host = await seedUser(db, castId<Handle>("rx-read-host"));
    const chatId = await seedChat(db, "rx-read");
    const character = await seedCharacter(db, host, "rx-read-char");
    await seedParticipant(db, { chatId, key: "rxr_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxr_c", characterId: character });
    const ctx = makeChatContext(db, { resolveRegexSources: regexSources(character) });

    const view = await createRead(ctx, makeDeps()).listEffectiveRegex({ principal: principal(host), chatId });

    expect(view.enabled).toBe(true);
    expect(view.tiers.map((t) => t.scope)).toEqual(["global", "preset", characterRegexTierKey(character), "chat"]);
    expect(view.tiers.flatMap((t) => t.rows.map((r) => r.script.name))).toEqual(["g1", "p1", "c1", "r1"]);
    expect(view.effective.map((e) => e.runsAt)).toEqual([1, 2, 3, 4]);
  });

  test("a MEMBER is refused — three of the four tiers are the host's own library (D19)", async () => {
    const host = await seedUser(db, castId<Handle>("rx-read-host2"));
    const member = await seedUser(db, castId<Handle>("rx-read-member"));
    const chatId = await seedChat(db, "rx-read2");
    const character = await seedCharacter(db, host, "rx-read-char2");
    await seedParticipant(db, { chatId, key: "rxr2_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxr2_m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "rxr2_c", characterId: character });
    const ctx = makeChatContext(db, { resolveRegexSources: regexSources(character) });

    await expect(createRead(ctx, makeDeps()).listEffectiveRegex({ principal: principal(member), chatId })).rejects.toThrow();
  });

  test("the room's levers are HONOURED by the read, not just by the turn", async () => {
    const host = await seedUser(db, castId<Handle>("rx-read-host3"));
    const chatId = await seedChat(db, "rx-read3");
    const character = await seedCharacter(db, host, "rx-read-char3");
    await seedParticipant(db, { chatId, key: "rxr3_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxr3_c", characterId: character });
    const ctx = makeChatContext(db, { resolveRegexSources: regexSources(character) });
    const roster = createParticipants(ctx, { emit: (): Promise<void> => Promise.resolve(), claimChat: (): Promise<void> => Promise.resolve() });
    await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "preset", enabled: false } });

    const view = await createRead(ctx, makeDeps()).listEffectiveRegex({ principal: principal(host), chatId });

    // The switched-off tier is LISTED (the host has to be able to switch it back on) and contributes no rank.
    expect(view.tiers.find((t) => t.scope === "preset")?.allowed).toBe(false);
    expect(view.tiers.find((t) => t.scope === "preset")?.rows.map((r) => r.runsAt)).toEqual([null]);
    expect(view.effective).toHaveLength(3);
  });

  // ── #1754 — THE PRESET TIER'S NAME ────────────────────────────────────────────────────────────────
  // The tier KEY is the bare word `preset`, so the client has no way to a name except the VIEWER's own
  // active preset chip (`chat-context-band.tsx`) — which is NOT the preset this room assembles whenever the
  // rpg GM redirect fires. The name therefore has to come from the read, which already resolves through
  // `resolvePreviewInputs` (the redirect included). These three pin the three answers it can give.

  /** `resolveForeignInputs` as the composition root behaves: the RESOLVED preset's name travels beside its
   *  id, so the redirected arm and the host-default arm are two different strings, never one shared fake. */
  function namingDeps(names: { readonly redirected: string | null; readonly hostDefault: string | null }): Parameters<typeof createRead>[1] {
    return makeDeps({
      resolveForeignInputs: (params) =>
        Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          presetId: params.presetOverride ?? null,
          presetName: params.presetOverride === undefined ? names.hostDefault : names.redirected,
          personas: { anchor: null, active: null },
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    });
  }

  test("the preset tier is named by the preset THIS ROOM assembles — the GM redirect's, not the host default's", async () => {
    const host = await seedUser(db, castId<Handle>("rx-label-gm"));
    const chatId = await seedChat(db, "rx-label-gm");
    const character = await seedCharacter(db, host, "rx-label-gm-char");
    await seedParticipant(db, { chatId, key: "rxlg_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxlg_c", characterId: character });
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the read path reaches only these three ops. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      resolvePresetOverride: () => Promise.resolve(castId<PresetId>("preset_gm_voice_rx")),
      resolveUserMacros: () => Promise.resolve([]),
      gatherTurnContext: () => Promise.resolve(null),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const ctx = makeChatContext(db, { rpg, resolveRegexSources: regexSources(character) });

    const view = await createRead(ctx, namingDeps({ redirected: "Grimdark GM", hostDefault: "House default" })).listEffectiveRegex({
      principal: principal(host),
      chatId,
    });

    expect(view.tiers.find((t) => t.scope === "preset")?.label).toBe("Grimdark GM");
    // Only the preset tier is named from the wire — the other three keys carry their own identity.
    expect(view.tiers.filter((t) => t.scope !== "preset").map((t) => t.label)).toEqual([undefined, undefined, undefined]);
  });

  test("a plain room names the preset the host's own turn assembles", async () => {
    const host = await seedUser(db, castId<Handle>("rx-label-plain"));
    const chatId = await seedChat(db, "rx-label-plain");
    const character = await seedCharacter(db, host, "rx-label-plain-char");
    await seedParticipant(db, { chatId, key: "rxlp_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxlp_c", characterId: character });
    const ctx = makeChatContext(db, { resolveRegexSources: regexSources(character) });

    const view = await createRead(ctx, namingDeps({ redirected: "Grimdark GM", hostDefault: "House default" })).listEffectiveRegex({
      principal: principal(host),
      chatId,
    });

    expect(view.tiers.find((t) => t.scope === "preset")?.label).toBe("House default");
  });

  test("a preset-less room names NOTHING rather than the wrong thing", async () => {
    const host = await seedUser(db, castId<Handle>("rx-label-none"));
    const chatId = await seedChat(db, "rx-label-none");
    const character = await seedCharacter(db, host, "rx-label-none-char");
    await seedParticipant(db, { chatId, key: "rxln_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxln_c", characterId: character });
    const ctx = makeChatContext(db, { resolveRegexSources: regexSources(character) });

    const view = await createRead(ctx, namingDeps({ redirected: null, hostDefault: null })).listEffectiveRegex({
      principal: principal(host),
      chatId,
    });

    expect(view.tiers.find((t) => t.scope === "preset")?.label).toBeUndefined();
  });
});

describe("read — listings (membership-scoped, D18)", () => {
  test("listChats returns ONLY the caller's chats, with canon stats + participant names", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const other = await seedUser(db, castId<Handle>("other"));
    const mine = await seedRoom("mine", me);
    const theirs = await seedRoom("theirs", other);
    await seedMessage(db, mine, 1, { role: "user", authorUserId: me, content: "hi" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const chats = (await listChats({ principal: principal(me) })).items;

    expect(chats.map((c) => c.id)).toEqual([mine]);
    expect(chats.map((c) => c.id)).not.toContain(theirs);
    expect(chats[0]?.messageCount).toBe(1);
    expect(chats[0]?.lastMessageAt).not.toBeNull();
    // The characters are the OTHER seats (see the viewer-suppression arms below) — here, the room's character.
    expect(chats[0]?.participantNames).toEqual(["character_mine_char"]);
  });

  // side-eye NR4: the names are what an untitled row TITLES itself with, and the viewer is in every chat they
  // can list — so their own name is a constant prefix that carries nothing and eats the title's width.
  describe("listChats participantNames suppress the VIEWER'S OWN seat", () => {
    test("a room with another seat drops the viewer — the row names who it is ABOUT", async () => {
      const me = await seedUser(db, castId<Handle>("me"));
      const friend = await seedUser(db, castId<Handle>("friend"));
      const chatId = await seedRoom("shared", me);
      await seedParticipant(db, { chatId, key: "shared_friend", userId: friend, role: "member" });

      const { listChats } = createRead(makeChatContext(db), makeDeps());
      const [mine] = (await listChats({ principal: principal(me) })).items;
      const [theirs] = (await listChats({ principal: principal(friend) })).items;

      // PER-CALLER, from the SAME row: each viewer's own name is the one that's gone. Both answers are in
      // SEAT ORDER (joinSeq, then participant id) — the second line used to expect `["user_me", …]`, which
      // was the test double's INSERTION order rather than the roster's; the double orders like production
      // now (`makeLoadParticipantViews`), and production has never answered that way.
      expect(mine?.participantNames).toEqual(["character_shared_char", "user_friend"]);
      expect(theirs?.participantNames).toEqual(["character_shared_char", "user_me"]);
    });

    test("a SOLO chat keeps the viewer's name — suppression never empties the characters", async () => {
      const me = await seedUser(db, castId<Handle>("me"));
      const solo = await seedChat(db, "solo");
      await seedParticipant(db, { chatId: solo, key: "solo_me", userId: me, role: "host" });

      const { listChats } = createRead(makeChatContext(db), makeDeps());
      const chats = (await listChats({ principal: principal(me) })).items;

      // Otherwise the row would fall through the client's title chain to "Untitled chat".
      expect(chats[0]?.participantNames).toEqual(["user_me"]);
    });
  });

  test("listChats derives viewerRole per-caller from the roster (host vs member)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const other = await seedUser(db, castId<Handle>("other"));
    // A chat I host, and a chat someone else hosts where I am a plain member.
    const hosted = await seedRoom("hosted", me);
    const guested = await seedRoom("guested", other);
    await seedParticipant(db, { chatId: guested, key: "guested_me", userId: me, role: "member" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const byId = new Map((await listChats({ principal: principal(me) })).items.map((c) => [c.id, c.viewerRole]));

    expect(byId.get(hosted)).toBe("host");
    expect(byId.get(guested)).toBe("member");
  });

  test("listChats excludes archived unless includeArchived", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const live = await seedChat(db, "live");
    const archived = await seedChat(db, "arch", { archived: true });
    await seedParticipant(db, { chatId: live, key: "l", userId: me, role: "host" });
    await seedParticipant(db, { chatId: archived, key: "a", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    expect((await listChats({ principal: principal(me) })).items.map((c) => c.id)).toEqual([live]);
    const all = (await listChats({ principal: principal(me), includeArchived: true })).items;
    expect(all.map((c) => c.id).sort()).toEqual([archived, live].sort());
  });

  test("listChats ALWAYS hides temporary chats (ST Temporary Chat, PD-65)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const normal = await seedChat(db, "normal");
    const temp = await seedChat(db, "temp", { temporary: true });
    await seedParticipant(db, { chatId: normal, key: "n", userId: me, role: "host" });
    await seedParticipant(db, { chatId: temp, key: "t", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    expect((await listChats({ principal: principal(me) })).items.map((c) => c.id)).toEqual([normal]);
    // includeArchived widens the archive filter only — a temporary chat never surfaces in the library.
    const all = (await listChats({ principal: principal(me), includeArchived: true })).items;
    expect(all.map((c) => c.id)).toEqual([normal]);
  });

  // ── the two SCENT fields (the list row's second line + the game marker) ──────────────────────────────
  test("listChats: lastMessagePreview is the NEWEST visible body, markdown-flattened + hidden-span stripped", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("scent", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "an older beat" });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      content:
        '# The Gate\n\nThe door **gives way**.\n<lie character="Aria" type="claim" truth="she has the key" reason="cover"/>\nAsh on the [wind](https://example.test/ash).',
    });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const preview = (await listChats({ principal: principal(me) })).items[0]?.lastMessagePreview;

    expect(preview).toBe("The Gate The door gives way. Ash on the wind.");
    // The §3.6 class: a lie's TRUTH is never list chrome, for ANY viewer (the strip is unconditional).
    expect(preview).not.toContain("she has the key");
  });

  test("listChats: an EMPTY chat and an rpg STATE-ANCHOR-only chat both preview as null", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const empty = await seedRoom("empty", me);
    const anchorOnly = await seedRoom("anchoronly", me);
    // A state-anchor slot is an EMPTY-body assistant row — durable canon no reader sees.
    await seedMessage(db, anchorOnly, 1, { role: "assistant", content: "" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const byId = new Map((await listChats({ principal: principal(me) })).items.map((c) => [c.id, c.lastMessagePreview]));

    expect(byId.get(empty)).toBeNull();
    expect(byId.get(anchorOnly)).toBeNull();
  });

  test("listChats: the D16 floor clamps the preview PER-CALLER — a from-join member below it sees NOTHING", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const clamped = await seedUser(db, castId<Handle>("clamped"));
    const unclamped = await seedUser(db, castId<Handle>("unclamped"));
    const chatId = await seedRoom("clamp", host);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "the pre-join secret" });
    // `from-join` with a joinSeq ABOVE the newest row: the member's whole readable window is empty.
    await seedParticipant(db, { chatId, key: "clamp_m1", userId: clamped, role: "member", joinSeq: 2, joinHistoryVisibility: "from-join" });
    // `from-join` AT the newest row (the floor is inclusive) — they DO see it.
    await seedParticipant(db, { chatId, key: "clamp_m2", userId: unclamped, role: "member", joinSeq: 1, joinHistoryVisibility: "from-join" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const previewFor = async (userId: UserId): Promise<string | null | undefined> =>
      (await listChats({ principal: principal(userId) })).items.find((c) => c.id === chatId)?.lastMessagePreview;

    expect(await previewFor(host)).toBe("the pre-join secret");
    expect(await previewFor(clamped)).toBeNull();
    expect(await previewFor(unclamped)).toBe("the pre-join secret");
  });

  test("listChats: isGame marks a LIVE game only (no pointer / a disengaged pointer are both false)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const plain = await seedChat(db, "plain");
    const game = await seedChat(db, "game", { metadata: { rpg: { gameId: mintTypeId(ID_PREFIX.rpgGame), engaged: true } } });
    const off = await seedChat(db, "off", { metadata: { rpg: { gameId: mintTypeId(ID_PREFIX.rpgGame), engaged: false } } });
    await Promise.all(
      (
        [
          ["p", plain],
          ["g", game],
          ["o", off],
        ] as const
      ).map(([key, chatId]) => seedParticipant(db, { chatId, key, userId: me, role: "host" })),
    );

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const rows = new Map((await listChats({ principal: principal(me) })).items.map((c) => [c.id, c]));

    expect(rows.get(game)?.isGame).toBe(true);
    expect(rows.get(plain)?.isGame).toBe(false);
    expect(rows.get(off)?.isGame).toBe(false);
    // #863(f) — the PAUSED bit, off the SAME opaque pointer: it is the ONE row whose game exists but is
    // switched off. `isGame` is untouched (a disengaged game still claims no panel and no live marker); the
    // list gets a second, quieter fact so a host can find a sleeping game at all.
    expect(rows.get(off)?.gamePaused).toBe(true);
    expect(rows.get(game)?.gamePaused).toBe(false);
    expect(rows.get(plain)?.gamePaused).toBe(false);
  });
});

// ONE RECENCY CLOCK (#150) — the invariant the whole home surface rests on, asserted where a consumer sees
// it: `items` is non-increasing in the value the rows DISPLAY (`lastMessageAt ?? updatedAt`). This is the
// named enforcer for the agreement between `chatRecencySql` (the sort) and `loadChatMessageStats` (the
// stamp): a divergence in either spelling sorts the library by a number no row in it shows, which is exactly
// how the home hero came to say "you left off 2w ago" over a room somebody had spoken in an hour earlier.
describe("read — listChats orders by the clock its rows DISPLAY (#150)", () => {
  test("the room with the freshest MESSAGE leads, even when another room's row stamp is newer", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const talked = await seedRoom("talked", me);
    const touched = await seedRoom("touched", me);
    const silent = await seedRoom("silent", me);
    // `touched` is the live shape: a NON-message write bumped its row stamp above everything while its last
    // line is a fortnight old. `talked` carries tonight's turn under an untouched row stamp (a turn does not
    // write the chat row). `silent` has no message at all.
    await db.update(chatsTable).set({ updatedAt: 5000 }).where(eq(chatsTable.id, touched));
    await db.update(chatsTable).set({ updatedAt: 1000 }).where(eq(chatsTable.id, talked));
    await db.update(chatsTable).set({ updatedAt: 3000 }).where(eq(chatsTable.id, silent));
    await seedMessage(db, talked, 1, { role: "user", authorUserId: me, content: "tonight", createdAt: 9000 });
    await seedMessage(db, touched, 1, { role: "user", authorUserId: me, content: "a fortnight ago", createdAt: 2000 });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const { items } = await listChats({ principal: principal(me) });

    expect(items.map((c) => c.id)).toStrictEqual([talked, silent, touched]);
    // …and the HERO's own stamp is the fresh one, so the sentence the masthead builds off `items[0]` reads
    // the same instant that put it on top.
    expect(items[0]?.lastMessageAt).toBe(9000);
    // The list is non-increasing in the DISPLAYED clock — sort key === display key, over the whole page.
    const shown = items.map((c) => c.lastMessageAt ?? c.updatedAt);
    expect(shown).toStrictEqual([...shown].sort((a, b) => b - a));
  });

  test("a new message re-sorts the room to the top on the NEXT read — no chat-row write required", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const behind = await seedRoom("behind", me);
    const ahead = await seedRoom("ahead", me);
    await seedMessage(db, behind, 1, { role: "user", authorUserId: me, content: "older", createdAt: 1000 });
    await seedMessage(db, ahead, 1, { role: "user", authorUserId: me, content: "newer", createdAt: 2000 });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    expect((await listChats({ principal: principal(me) })).items.map((c) => c.id)).toStrictEqual([ahead, behind]);

    // The turn path appends canon and does NOT touch `chats.updated_at` — the whole reason the old sort lied.
    await seedMessage(db, behind, 2, { role: "assistant", content: "just now", createdAt: 3000 });
    expect((await listChats({ principal: principal(me) })).items.map((c) => c.id)).toStrictEqual([behind, ahead]);
  });

  test("the keyset pages across the recency clock — every room exactly once, in one non-increasing run", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const stamps = [9000, 2000, 7000, 4000, 6000];
    const rooms: ChatId[] = [];
    for (const [index, at] of stamps.entries()) {
      const room = await seedRoom(`keyset${String(index)}`, me);
      await seedMessage(db, room, 1, { role: "user", authorUserId: me, content: `line ${String(index)}`, createdAt: at });
      rooms.push(room);
    }

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const walked: ChatId[] = [];
    const shown: number[] = [];
    let cursor: ChatListCursor | undefined;
    let pages = 0;
    do {
      const page = await listChats({ principal: principal(me), limit: 2, ...(cursor === undefined ? {} : { cursor }) });
      walked.push(...page.items.map((c) => c.id));
      shown.push(...page.items.map((c) => c.lastMessageAt ?? c.updatedAt));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined && pages <= rooms.length);

    expect(new Set(walked).size).toBe(rooms.length);
    expect(shown).toStrictEqual([9000, 7000, 6000, 4000, 2000]);
  });
});

describe("read — listChats PAGING, projection + search (the 872-chat class)", () => {
  /** N rooms hosted by `me`, all stamped the SAME `updatedAt` — the shape a bulk import writes, and the one
   *  an `updated_at`-only keyset silently skips or repeats rows across. */
  async function seedSameStampRooms(me: UserId, count: number, stamp: number, prefix = "page"): Promise<readonly ChatId[]> {
    const ids: ChatId[] = [];
    for (let i = 0; i < count; i += 1) {
      const chatId = await seedChat(db, `${prefix}${i}`, { title: `Room ${i}`, updatedAt: stamp });
      await seedParticipant(db, { chatId, key: `${prefix}${i}_h`, userId: me, role: "host" });
      ids.push(chatId);
    }
    return ids;
  }

  test("the keyset walks the WHOLE list exactly once — no skipped or repeated row across a tied `updatedAt`", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const seeded = await seedSameStampRooms(me, 7, FROZEN_AT);

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const walked: ChatId[] = [];
    let cursor: ChatListCursor | undefined;
    let pages = 0;
    do {
      const page = await listChats({ principal: principal(me), limit: 3, ...(cursor === undefined ? {} : { cursor }) });
      walked.push(...page.items.map((c) => c.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      // A runaway keyset (a cursor that never advances) would loop forever — bound it at the row count.
    } while (cursor !== undefined && pages <= seeded.length);

    // EXACTLY once each: a tie-blind keyset returns the same page forever or jumps a whole tied run.
    expect(walked.length).toBe(seeded.length);
    expect(new Set(walked).size).toBe(seeded.length);
    expect([...walked].sort()).toEqual([...seeded].sort());
  });

  test("`beforeRecencyAt` is exclusive and keeps every tied row below the boundary reachable exactly once", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const below = await seedSameStampRooms(me, 3, 9000, "below");
    const atBoundary = await seedSameStampRooms(me, 1, 10_000, "boundary");
    const above = await seedSameStampRooms(me, 1, 11_000, "above");
    const displayedBelow = await seedChat(db, "displayed_below", { updatedAt: 12_000 });
    await seedParticipant(db, { chatId: displayedBelow, key: "displayed_below_h", userId: me, role: "host" });
    await seedMessage(db, displayedBelow, 1, { createdAt: 8000 });
    const displayedAbove = await seedChat(db, "displayed_above", { updatedAt: 8000 });
    await seedParticipant(db, { chatId: displayedAbove, key: "displayed_above_h", userId: me, role: "host" });
    await seedMessage(db, displayedAbove, 1, { createdAt: 12_000 });
    const expected = [...below, displayedBelow];

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const walked: ChatId[] = [];
    let cursor: ChatListCursor | undefined;
    do {
      const page = await listChats({
        principal: principal(me),
        beforeRecencyAt: 10_000,
        limit: 2,
        ...(cursor === undefined ? {} : { cursor }),
      });
      walked.push(...page.items.map((chat) => chat.id));
      expect(page.totalCount).toBe(expected.length);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(walked).toHaveLength(expected.length);
    expect(new Set(walked).size).toBe(expected.length);
    expect([...walked].sort()).toEqual([...expected].sort());
    expect(walked).not.toContain(atBoundary[0]);
    expect(walked).not.toContain(above[0]);
    expect(walked).not.toContain(displayedAbove);
  });

  test("`nextCursor` is null on a SHORT page — a full final page hands back one more, and it returns nothing", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    await seedSameStampRooms(me, 4, FROZEN_AT);

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const short = await listChats({ principal: principal(me), limit: 10 });
    expect(short.items.length).toBe(4);
    expect(short.nextCursor).toBeNull();

    // A page that came back FULL cannot know it is the last, so it mints a cursor — which must then be empty
    // rather than repeating the tail.
    const exact = await listChats({ principal: principal(me), limit: 4 });
    expect(exact.nextCursor).not.toBeNull();
    const after = await listChats({ principal: principal(me), limit: 4, ...(exact.nextCursor === null ? {} : { cursor: exact.nextCursor }) });
    expect(after.items).toEqual([]);
  });

  test("`limit` is CLAMPED to the ceiling — an over-ask is served the ceiling, never the whole library", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    // ONE MORE ROOM THAN THE CEILING, deliberately: a fixture SMALLER than the clamp cannot tell a clamped
    // read from an unclamped one, and this arm was exactly that false green until a planted control caught it
    // (removing the clamp left it passing). Every row costs `buildSummaries` a participant resolve, which is
    // the whole reason the ceiling exists — so the seed is the smallest one that can fail.
    await seedSameStampRooms(me, CHAT_LIST_PAGE_CEILING + 1, FROZEN_AT);

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const page = await listChats({ principal: principal(me), limit: 10_000 });

    expect(page.items.length).toBe(CHAT_LIST_PAGE_CEILING);
    // The CENSUS is not clamped — it answers about the library, which is what the band prints.
    expect(page.totalCount).toBe(CHAT_LIST_PAGE_CEILING + 1);
    // A clamped page is still a real page: it hands back a cursor, and the tail is reachable through it.
    expect(page.nextCursor).not.toBeNull();
    const tail = await listChats({ principal: principal(me), limit: 10_000, ...(page.nextCursor === null ? {} : { cursor: page.nextCursor }) });
    expect(tail.items.length).toBe(1);
  });

  test("`totalCount` is the SCOPE's census, not the page's length — and it moves with the filters", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const other = await seedUser(db, castId<Handle>("other"));
    await seedSameStampRooms(me, 5, FROZEN_AT);
    const theirs = await seedChat(db, "notmine");
    await seedParticipant(db, { chatId: theirs, key: "notmine_h", userId: other, role: "host" });
    const archived = await seedChat(db, "arch", { archived: true });
    await seedParticipant(db, { chatId: archived, key: "arch_h", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const page = await listChats({ principal: principal(me), limit: 2 });

    // The band prints THIS number over a two-row page.
    expect(page.items.length).toBe(2);
    expect(page.totalCount).toBe(5);
    // Someone else's room is not in my census; my archived one joins it only when I ask for archived.
    expect((await listChats({ principal: principal(me), limit: 1, includeArchived: true })).totalCount).toBe(6);
  });

  test("the date lens composes with D18 membership, archive, character projection, search, and the census", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const other = await seedUser(db, castId<Handle>("other"));
    const her = await seedCharacter(db, me, "Azarael");

    const included = await seedChat(db, "dated_included", { archived: true, title: "Needle beneath", updatedAt: 8000 });
    await seedParticipant(db, { chatId: included, key: "di_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: included, key: "di_c", characterId: her });

    const tooNew = await seedChat(db, "dated_new", { archived: true, title: "Needle recent", updatedAt: 12_000 });
    await seedParticipant(db, { chatId: tooNew, key: "dn_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: tooNew, key: "dn_c", characterId: her });

    const wrongSearch = await seedChat(db, "dated_search", { archived: true, title: "Other words", updatedAt: 7000 });
    await seedParticipant(db, { chatId: wrongSearch, key: "ds_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: wrongSearch, key: "ds_c", characterId: her });

    const foreign = await seedChat(db, "dated_foreign", { archived: true, title: "Needle foreign", updatedAt: 6000 });
    await seedParticipant(db, { chatId: foreign, key: "df_h", userId: other, role: "host" });
    await seedParticipant(db, { chatId: foreign, key: "df_c", characterId: her });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const params = { principal: principal(me), beforeRecencyAt: 10_000, characterId: her, search: " NEEDLE ", limit: 50 } as const;

    expect((await listChats(params)).items).toEqual([]);
    const page = await listChats({ ...params, includeArchived: true });
    expect(page.items.map((chat) => chat.id)).toEqual([included]);
    expect(page.totalCount).toBe(1);
  });

  test("`characterId` PROJECTS server-side — present AND departed seats, and it scopes the census too", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const her = await seedCharacter(db, me, "azarael");
    const him = await seedCharacter(db, me, "kai");

    const withHer = await seedChat(db, "withher", { title: "Rain" });
    await seedParticipant(db, { chatId: withHer, key: "wh_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: withHer, key: "wh_c", characterId: her });

    // She LEFT this one — character-scoped history includes departed seats, so the server filter must retain it.
    const sheLeft = await seedChat(db, "sheleft", { title: "Ash" });
    await seedParticipant(db, { chatId: sheLeft, key: "sl_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: sheLeft, key: "sl_c", characterId: her, leftSeq: 4 });

    const withHim = await seedChat(db, "withhim", { title: "Elsewhere" });
    await seedParticipant(db, { chatId: withHim, key: "whm_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: withHim, key: "whm_c", characterId: him });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const hers = await listChats({ principal: principal(me), characterId: her, limit: 50 });

    expect([...hers.items.map((c) => c.id)].sort()).toEqual([sheLeft, withHer].sort());
    expect(hers.totalCount).toBe(2);
    expect(hers.items.map((c) => c.id)).not.toContain(withHim);
  });

  // #192 — THE ROW CARRIES ITS OWN FACES. The client used to paint the leading slot by fetching the WHOLE
  // character library (`character.list {limit: 500}`) on every surface showing a chat row and indexing
  // character ids into it; past that ceiling the faces simply stopped resolving. The seats ride the
  // projection now, off the roster views it already loads — so this pins the two properties the row
  // renders with (SEAT ORDER, and character seats only) plus the deliberate split from the character-scoped
  // history filter, which keeps departed seats but must NOT turn one into a face.
  test("`participantPortraits` carries the PRESENT character seats in seat order — humans and departed seats excluded", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const her = await seedCharacter(db, me, "azarael");
    const him = await seedCharacter(db, me, "kai");
    const gone = await seedCharacter(db, me, "vanished");

    const chatId = await seedChat(db, "faces", { title: "The Ashen Spire" });
    await seedParticipant(db, { chatId, key: "fa_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId, key: "fa_c2", characterId: him, joinSeq: 2 });
    await seedParticipant(db, { chatId, key: "fa_c1", characterId: her, joinSeq: 1 });
    await seedParticipant(db, { chatId, key: "fa_c0", characterId: gone, joinSeq: 0, leftSeq: 3 });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const row = (await listChats({ principal: principal(me), limit: 50 })).items[0];

    expect(row?.participantPortraits.map((seat) => seat.characterId)).toEqual([her, him]);
    // The human host holds a seat and a name, but not a FACE: the leading slot is the room's CHARACTER.
    expect(row?.participantPortraits.some((seat) => seat.characterId === castId<CharacterId>(me))).toBe(false);
    // …while the character-scoped history read still finds the room through the departed seat.
    const departedHistory = await listChats({ principal: principal(me), characterId: gone, limit: 50 });
    expect(departedHistory.items.map((chat) => chat.id)).toEqual([chatId]);
  });

  test("`characterId` never duplicates a row when a character holds TWO seats in one chat", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const her = await seedCharacter(db, me, "azarael");
    const chatId = await seedChat(db, "twice", { title: "Twice" });
    await seedParticipant(db, { chatId, key: "tw_h", userId: me, role: "host" });
    // A re-join leaves the departed seat behind, so a chat legitimately carries two rows for one character.
    await seedParticipant(db, { chatId, key: "tw_c1", characterId: her, leftSeq: 2 });
    await seedParticipant(db, { chatId, key: "tw_c2", characterId: her });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const page = await listChats({ principal: principal(me), characterId: her, limit: 50 });

    // A JOIN instead of an EXISTS would return the row twice AND count it twice.
    expect(page.items.map((c) => c.id)).toEqual([chatId]);
    expect(page.totalCount).toBe(1);
  });

  test("`search` matches the TITLE, a CHARACTER SEAT's name, and the NEWEST message's body", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const her = await seedCharacter(db, me, "Azarael");

    const byTitle = await seedChat(db, "bytitle", { title: "The Ashen Spire" });
    await seedParticipant(db, { chatId: byTitle, key: "bt_h", userId: me, role: "host" });

    const byName = await seedChat(db, "byname", { title: "Untitled thing" });
    await seedParticipant(db, { chatId: byName, key: "bn_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: byName, key: "bn_c", characterId: her });

    const byBody = await seedChat(db, "bybody", { title: "Another room" });
    await seedParticipant(db, { chatId: byBody, key: "bb_h", userId: me, role: "host" });
    await seedMessage(db, byBody, 1, { role: "user", authorUserId: me, content: "nothing to see" });
    await seedMessage(db, byBody, 2, { role: "assistant", content: "the ASHEN wind rises" });

    const decoy = await seedChat(db, "decoy", { title: "Quiet" });
    await seedParticipant(db, { chatId: decoy, key: "dc_h", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const found = async (q: string): Promise<readonly ChatId[]> =>
      [...(await listChats({ principal: principal(me), search: q, limit: 50 })).items.map((c) => c.id)].sort();

    // Case-insensitive across all three arms — the user types what they remember, not what was stored.
    expect(await found("ashen")).toEqual([byBody, byTitle].sort());
    expect(await found("azarael")).toEqual([byName]);
    expect(await found("  ")).toEqual([byBody, byName, byTitle, decoy].sort());
    expect(await found("nothing-in-here")).toEqual([]);
    // The census answers about the SEARCH, or the band would print the unsearched library over a filtered page.
    expect((await listChats({ principal: principal(me), search: "ashen", limit: 50 })).totalCount).toBe(2);
  });

  test("`search` matches only the NEWEST message — an older body is not full-transcript search", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedChat(db, "older", { title: "Room" });
    await seedParticipant(db, { chatId, key: "old_h", userId: me, role: "host" });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "a buried phrase" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "something else entirely" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    // The 2026-08-01 ruling: search matches the SNIPPET THE ROW SHOWS, and the row shows the newest body.
    expect((await listChats({ principal: principal(me), search: "buried", limit: 50 })).items).toEqual([]);
    expect((await listChats({ principal: principal(me), search: "entirely", limit: 50 })).items.map((c) => c.id)).toEqual([chatId]);
  });

  test("`search` OBEYS THE D16 FLOOR — a from-join member cannot find a phrase they may not read", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const clamped = await seedUser(db, castId<Handle>("clamped"));
    const chatId = await seedChat(db, "floor", { title: "Sealed" });
    await seedParticipant(db, { chatId, key: "fl_h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "the pre-join secret" });
    // Their whole readable window sits ABOVE the only message — its body must be unfindable, not merely unshown.
    await seedParticipant(db, { chatId, key: "fl_m", userId: clamped, role: "member", joinSeq: 2, joinHistoryVisibility: "from-join" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const hit = async (userId: UserId): Promise<readonly ChatId[]> =>
      (await listChats({ principal: principal(userId), search: "pre-join secret", limit: 50 })).items.map((c) => c.id);

    expect(await hit(host)).toEqual([chatId]);
    // Search would otherwise be the ONE read that reaches beneath the floor every other read enforces.
    expect(await hit(clamped)).toEqual([]);
    // The title still finds it — they are a member of the room, they just may not read its pre-join canon.
    expect((await listChats({ principal: principal(clamped), search: "sealed", limit: 50 })).items.map((c) => c.id)).toEqual([chatId]);
  });

  test("`search` cannot find a HIDDEN-class span's text — result PRESENCE is the oracle, not the preview", async () => {
    const host = await seedUser(db, castId<Handle>("gm"));
    const member = await seedUser(db, castId<Handle>("player"));
    const chatId = await seedChat(db, "deception", { title: "The Vault" });
    await seedParticipant(db, { chatId, key: "dc_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "dc_m", userId: member, role: "member" });
    // The §3.6 deception grammar: the truth rides a hidden-class span the member's payload never carries
    // (`stripHiddenSpans`) and the row's scent line never shows (`projectBodyForPreview` drops it for every
    // viewer). The member is NOT floored — the D16 arm cannot save this one.
    await seedMessage(db, chatId, 1, {
      role: "assistant",
      content: 'The vault door is sealed. <lie character="Kai" truth="the reliquary is already empty"/>',
    });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const found = async (userId: UserId, q: string): Promise<readonly ChatId[]> =>
      (await listChats({ principal: principal(userId), search: q, limit: 50 })).items.map((c) => c.id);

    // The host reads canon verbatim (the reveal-eye plane) — their own search finds their own lie.
    expect(await found(host, "reliquary is already empty")).toEqual([chatId]);
    // THE LEAK: a member who GUESSES the phrase learns it is in the newest message purely because the row
    // comes back. A stripped preview does not save it — the result's presence IS the answer.
    expect(await found(member, "reliquary is already empty")).toEqual([]);
    // …and the census is the same oracle one level down: a page of zero rows over `totalCount: 1` still says yes.
    expect((await listChats({ principal: principal(member), search: "reliquary is already empty", limit: 50 })).totalCount).toBe(0);
    // THE DELIBERATE NARROWING (pinned, not incidental): for a non-host the whole BODY arm is withheld on a
    // tail that carries any hidden tag — SQL cannot strip a span, so matching the visible half would have to
    // match the raw bytes. Fewer results, never a leak. The other two arms are untouched.
    expect(await found(member, "door is sealed")).toEqual([]);
    expect(await found(member, "vault")).toEqual([chatId]); // the TITLE arm still finds their own room
  });

  test("the filters COMPOSE — search inside a character projection stays membership-scoped", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const her = await seedCharacter(db, me, "azarael");

    const mineHit = await seedChat(db, "minehit", { title: "Rain over the spire" });
    await seedParticipant(db, { chatId: mineHit, key: "mh_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: mineHit, key: "mh_c", characterId: her });

    const mineMiss = await seedChat(db, "minemiss", { title: "Snow" });
    await seedParticipant(db, { chatId: mineMiss, key: "mm_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId: mineMiss, key: "mm_c", characterId: her });

    // Same character, same word, someone ELSE'S room — the projection must not become a way to read it.
    const theirs = await seedChat(db, "theirs", { title: "Rain elsewhere" });
    await seedParticipant(db, { chatId: theirs, key: "th_h", userId: stranger, role: "host" });
    await seedParticipant(db, { chatId: theirs, key: "th_c", characterId: her });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const page = await listChats({ principal: principal(me), characterId: her, search: "rain", limit: 50 });

    expect(page.items.map((c) => c.id)).toEqual([mineHit]);
    expect(page.totalCount).toBe(1);
    expect(page.items.map((c) => c.id)).not.toContain(theirs);
  });
});

describe("read — fork lineage (D27, membership-gated per ancestor)", () => {
  test("listForks returns the fork children the caller is ALSO a member of", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const parent = await seedChat(db, "parent");
    await seedParticipant(db, { chatId: parent, key: "p", userId: me, role: "host" });
    const childMine = await seedChat(db, "child_mine", { parentChatId: parent });
    await seedParticipant(db, { chatId: childMine, key: "cm", userId: me, role: "host" });
    // A fork child of the same parent the caller is NOT a member of (a fork grants no parent membership).
    await seedChat(db, "child_foreign", { parentChatId: parent });

    const { listForks } = createRead(makeChatContext(db), makeDeps());
    const forks = await listForks({ principal: principal(me), chatId: parent });
    expect(forks.map((f) => f.id)).toEqual([childMine]);
  });

  test("getChatLineage walks ancestors root-first; a non-member ancestor is omitted (sparse)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const root = await seedChat(db, "root");
    const mid = await seedChat(db, "mid", { parentChatId: root });
    const leaf = await seedChat(db, "leaf", { parentChatId: mid });
    // The caller is a member of root + leaf, but NOT mid (the chain is sparse).
    await seedParticipant(db, { chatId: root, key: "r", userId: me, role: "host" });
    await seedParticipant(db, { chatId: leaf, key: "lf", userId: me, role: "host" });

    const { getChatLineage } = createRead(makeChatContext(db), makeDeps());
    const { chain } = await getChatLineage({ principal: principal(me), chatId: leaf });
    expect(chain.map((c) => c.id)).toEqual([root, leaf]);
  });
});

describe("read — single reads", () => {
  test("getChat returns the detail (roster + default room behavior)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(me), chatId });
    expect(detail.id).toBe(chatId);
    expect(detail.participants.some((p) => p.role === "host" && p.userId === me)).toBe(true);
    expect(detail.group.output).toBe("per-speaker"); // DEFAULT_GROUP_CONFIG applied
    expect(detail.opening).toBeNull();
    // The participant-scoped identity producer (Chat-Macro-Resolution.md §1 / D137) covers the roster's character.
    expect(detail.identities.some((e) => e.kind === "character" && e.name === "room_char")).toBe(true);
    // The viewer-scoped fields (host-of-this-room, no persona set yet).
    expect(detail.viewerUserId).toBe(me);
    expect(detail.viewerIsHost).toBe(true);
    expect(detail.viewerActivePersonaId).toBeNull();
  });

  test("getChat's viewerActivePersonaId reflects a setActivePersona write (chat_participants.activePersonaId)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    const personaId = await seedPersona(db, me, "worn");
    // `persona.setActivePersona` ultimately writes this same column (`setParticipantActivePersona`,
    // verbs/participants.ts) — seeding it directly proves getChat's VIEW reads what that write produces.
    await db
      .update(chatParticipants)
      .set({ activePersonaId: personaId })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, me)));

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(me), chatId });
    expect(detail.viewerActivePersonaId).toBe(personaId);
  });

  test("getChat's viewerIsHost is false for a present MEMBER (not the host)", async () => {
    const host = await seedUser(db, castId<Handle>("host2"));
    const member = await seedUser(db, castId<Handle>("member2"));
    const chatId = await seedRoom("room2", host);
    await seedParticipant(db, { chatId, key: "room2_m", userId: member, role: "member" });

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(member), chatId });
    expect(detail.viewerUserId).toBe(member);
    expect(detail.viewerIsHost).toBe(false);
    expect(detail.viewerActivePersonaId).toBeNull();
  });

  // #54 — the honest-refusal pre-send gate. The verb resolves the room host, calls the injected
  // deterministic verdict (no turn fired), and is member-gated; a non-participant/hostless room is a
  // leak-free NOT_FOUND. The verdict-classification itself is proven in connection/verbs/check-chat-
  // availability.int.test.ts; here we prove the chat-verb WIRING (host resolution + gate + pass-through).
  test("checkSendAvailability returns the injected verdict for a member (available)", async () => {
    const host = await seedUser(db, castId<Handle>("avail_host"));
    const chatId = await seedRoom("avail_room", host);

    const { checkSendAvailability } = createRead(makeChatContext(db), makeDeps());
    const verdict = await checkSendAvailability({ principal: principal(host), chatId });
    expect(verdict).toEqual({ available: true });
  });

  test("checkSendAvailability passes an UNAVAILABLE verdict through (engine-off)", async () => {
    const host = await seedUser(db, castId<Handle>("off_host"));
    const chatId = await seedRoom("off_room", host);

    const { checkSendAvailability } = createRead(
      makeChatContext(db),
      makeDeps({ checkSendAvailability: () => Promise.resolve({ available: false, cause: "no-connection" }) }),
    );
    const verdict = await checkSendAvailability({ principal: principal(host), chatId });
    expect(verdict).toEqual({ available: false, cause: "no-connection" });
  });

  test("checkSendAvailability is member-gated — a non-participant is a leak-free NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("gate_host"));
    const stranger = await seedUser(db, castId<Handle>("gate_stranger"));
    const chatId = await seedRoom("gate_room", host);

    const { checkSendAvailability } = createRead(makeChatContext(db), makeDeps());
    await expect(checkSendAvailability({ principal: principal(stranger), chatId })).rejects.toThrow(ChatNotFoundError);
  });

  test("listMessages returns the D26 slot⋈variant views in chronological order; hidden flag rides", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "first" });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      content: "second",
      excludedFromPrompt: true,
    });
    await seedMessage(db, chatId, 3, { role: "user", authorUserId: me, content: "third" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const all = await listMessages({ principal: principal(me), chatId });
    expect(all.messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    expect(all.messages[1]?.excludedFromPrompt).toBe(true);

    // Paging: a backward window before seq 3 returns the older two, still chronological.
    const page = await listMessages({ principal: principal(me), chatId, beforeSeq: 3, limit: 1 });
    expect(page.messages.map((m) => m.content)).toEqual(["second"]);
  });

  test("listMessages' identities covers the roster's character AND a message-stamped persona not on the roster (Chat-Macro-Resolution.md §1 / D137)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    const oldPersona = await seedPersona(db, me, "old_persona");
    // A since-switched persona: stamped on a message but not any participant's CURRENT active persona.
    await seedMessage(db, chatId, 1, { role: "user", personaId: oldPersona, content: "hi" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const { identities } = await listMessages({ principal: principal(me), chatId });
    expect(identities.some((e) => e.kind === "character" && e.name === "room_char")).toBe(true);
    expect(identities.some((e) => e.kind === "persona" && e.id === oldPersona)).toBe(true);
  });

  test("listMessageVariants returns the full sibling set ordered by idx, no content", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const v1 = await addVariant(db, messageId, 1, "second take");

    const { listMessageVariants } = createRead(makeChatContext(db), makeDeps());
    const variants = await listMessageVariants({ principal: principal(me), chatId, messageId });
    expect(variants).toStrictEqual([
      { variantId, idx: 0 },
      { variantId: v1, idx: 1 },
    ]);
  });

  test("listMessageVariants is leak-free NOT_FOUND for a foreign-chat messageId (member of the caller's chat, not this slot's)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    const other = await seedRoom("other", me);
    const { messageId } = await seedMessage(db, other, 1);

    const { listMessageVariants } = createRead(makeChatContext(db), makeDeps());
    await expect(listMessageVariants({ principal: principal(me), chatId, messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  test("listParticipants returns the present roster", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);

    const { listParticipants } = createRead(makeChatContext(db), makeDeps());
    const roster = await listParticipants({ principal: principal(me), chatId });
    expect(roster.some((p) => p.userId === me && p.role === "host")).toBe(true);
    expect(roster.some((p) => p.kind === "character")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D16 `joinHistoryVisibility` — the per-participant confidentiality policy (`chat_participants`,
// `.notNull().default("full")` — an invited member sees the room's whole history; `from-join` is the host's
// OPT-IN restriction, so every test below whose subject is the CLAMP spells it out).
// It was PERSISTED AND NEVER READ: a live multi-human drive found that a
// human invited at canon head 7 received `listMessages` seqs 1-7 (the host's pre-join greetings included)
// and a `lastEventId:"0"` subscribe replayed the whole durable log. The floor is resolved ONCE at the
// membership chokepoint (`guard.requireParticipant` → `substrate/auth::resolveHistoryFloorSeq`) and every
// read path that can surface pre-join canon consumes it. These are the LIVE REPRO, pinned.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — the D16 join-history floor (joinHistoryVisibility)", () => {
  /** A room with 4 canon rows: two host greetings (seq 1-2) then two later turns (seq 3-4). */
  async function seedRoomWithHistory(key: string, host: UserId): Promise<ChatId> {
    const chatId = await seedRoom(key, host);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "greeting one" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "greeting two" });
    await seedMessage(db, chatId, 3, { role: "user", authorUserId: host, content: "private chatter" });
    await seedMessage(db, chatId, 4, { role: "assistant", content: "after the join" });
    return chatId;
  }

  test("a from-join member cannot read canon below their joinSeq (the live repro: greetings + pre-join rows absent)", async () => {
    const host = await seedUser(db, castId<Handle>("jh_host"));
    const joiner = await seedUser(db, castId<Handle>("jh_joiner"));
    const chatId = await seedRoomWithHistory("jh", host);
    // The invite-redeem shape: role `member`, joinSeq stamped at the canon head when they joined (4 rows
    // existed, so the FIRST row they may see is seq 4 — the floor is INCLUSIVE). The host RESTRICTED this
    // member to `from-join`; the column default (`full`) is pinned separately below.
    await seedParticipant(db, { chatId, key: "jh_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });

    expect(page.messages.map((m) => m.seq)).toEqual([4]);
    const body = JSON.stringify(page.messages);
    expect(body).not.toContain("greeting one");
    expect(body).not.toContain("greeting two");
    expect(body).not.toContain("private chatter");
  });

  // F2 — the host has full control (owner ratified). A PROMOTED host is a member who joined late under a
  // `from-join` restriction and was then handed the host seat: the seat flips to `host`, but the row's
  // `joinSeq`/`joinHistoryVisibility` do NOT. Before F2 their `listMessages` still withheld pre-join history
  // (their old member floor) while export-chat + discovery already handed them full canon — an incoherent
  // split. The derive now floors a HOST at 0 in the ONE resolver, so `listMessages` sees the whole transcript.
  test("a PROMOTED host (from-join row, late joinSeq) reads the WHOLE pre-join history — F2 host full control", async () => {
    const founder = await seedUser(db, castId<Handle>("f2_founder"));
    const promoted = await seedUser(db, castId<Handle>("f2_promoted"));
    const chatId = await seedRoomWithHistory("f2", founder);
    // The roster a host-handoff leaves, in the writer's own order (demote the founder FIRST — one present
    // host per chat is a partial UNIQUE index, not writer discipline): the promoted row is role `host` but
    // keeps joinSeq 4 + from-join intact.
    await db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, founder)));
    await seedParticipant(db, { chatId, key: "f2_p", userId: promoted, role: "host", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(promoted), chatId });

    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    const body = JSON.stringify(page.messages);
    expect(body).toContain("greeting one");
    expect(body).toContain("private chatter");
  });

  // THE DEFAULT, pinned end-to-end. Owner ruling: "if you are inviting someone into a group chat they should
  // be able to view previous turns." So a member seeded with NO policy — the shape a real invite redeem
  // writes, which never names the column — must read the ENTIRE canon, including rows below their `joinSeq`.
  // This is the guard against a future schema edit silently re-restricting every invitee.
  test("the COLUMN DEFAULT is `full`: a member joined at head 4 with NO explicit policy reads the whole history", async () => {
    const host = await seedUser(db, castId<Handle>("jhd_host"));
    const joiner = await seedUser(db, castId<Handle>("jhd_joiner"));
    const chatId = await seedRoomWithHistory("jhd", host);
    const participantId = await seedParticipant(db, { chatId, key: "jhd_m", userId: joiner, role: "member", joinSeq: 4 });

    // The persisted policy itself — the default the DB wrote, not a value any caller supplied.
    const row = await db.select().from(chatParticipants).where(eq(chatParticipants.id, participantId));
    expect(row.at(0)?.joinHistoryVisibility).toBe("full");

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(page.messages)).toContain("greeting one");
  });

  test("a `full` member DOES see everything — the policy's other arm actually works", async () => {
    const host = await seedUser(db, castId<Handle>("jhf_host"));
    const joiner = await seedUser(db, castId<Handle>("jhf_joiner"));
    const chatId = await seedRoomWithHistory("jhf", host);
    await seedParticipant(db, { chatId, key: "jhf_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "full" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  // THE ROUND TRIP — the setter wired to the enforcement. The mechanism above was complete and unreachable
  // (no write path existed anywhere: only a manual SQL edit produced `from-join`). These two prove the host's
  // verb actually moves what the member reads, in both directions, with no other wiring.
  test("the host RESTRICTS a member (setMemberHistoryVisibility → from-join) and their next listMessages is clamped at their joinSeq", async () => {
    const host = await seedUser(db, castId<Handle>("jhw_host"));
    const joiner = await seedUser(db, castId<Handle>("jhw_joiner"));
    const chatId = await seedRoomWithHistory("jhw", host);
    // The invite-redeem shape: no explicit policy → the `full` column default. They read everything first.
    await seedParticipant(db, { chatId, key: "jhw_m", userId: joiner, role: "member", joinSeq: 4 });
    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);

    const roster = createParticipants(makeChatContext(db), { claimChat: (): Promise<void> => Promise.resolve(), emit: async (): Promise<void> => undefined });
    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: joiner, visibility: "from-join" });

    const after = await listMessages({ principal: principal(joiner), chatId });
    expect(after.messages.map((m) => m.seq)).toEqual([4]);
    expect(JSON.stringify(after.messages)).not.toContain("private chatter");
    // The restriction never moved their join point — it only changed what they may read from it.
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.joinSeq).toBe(4);
  });

  test("the host RESTORES a member (→ full) and they read the whole canon again", async () => {
    const host = await seedUser(db, castId<Handle>("jhwr_host"));
    const joiner = await seedUser(db, castId<Handle>("jhwr_joiner"));
    const chatId = await seedRoomWithHistory("jhwr", host);
    await seedParticipant(db, { chatId, key: "jhwr_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });
    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);

    const roster = createParticipants(makeChatContext(db), { claimChat: (): Promise<void> => Promise.resolve(), emit: async (): Promise<void> => undefined });
    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: joiner, visibility: "full" });

    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  test("the HOST is never clamped by a member's floor (the clamp is per-CALLER)", async () => {
    const host = await seedUser(db, castId<Handle>("jhh_host"));
    const joiner = await seedUser(db, castId<Handle>("jhh_joiner"));
    const chatId = await seedRoomWithHistory("jhh", host);
    await seedParticipant(db, { chatId, key: "jhh_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(host), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    // …and the clamped member in the SAME room still only sees their own window.
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);
  });

  test("pagination stays honest: a beforeSeq cursor at/below the floor is an EMPTY page, never a fabricated one", async () => {
    const host = await seedUser(db, castId<Handle>("jhp_host"));
    const joiner = await seedUser(db, castId<Handle>("jhp_joiner"));
    const chatId = await seedRoomWithHistory("jhp", host);
    await seedParticipant(db, { chatId, key: "jhp_m", userId: joiner, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    // The member's window is seq 3-4; walking back from 4 yields the floor row, then nothing.
    expect((await listMessages({ principal: principal(joiner), chatId, beforeSeq: 4 })).messages.map((m) => m.seq)).toEqual([3]);
    const exhausted = await listMessages({ principal: principal(joiner), chatId, beforeSeq: 3 });
    expect(exhausted.messages).toEqual([]);
    // The terminal page is truthful, not a re-served window: nothing below the floor is smuggled in.
    expect(JSON.stringify(exhausted.messages)).not.toContain("greeting");
  });

  test("the compaction checkpoint is withheld from a clamped member (a summary distills the canon their floor hides)", async () => {
    const host = await seedUser(db, castId<Handle>("jhc_host"));
    const joiner = await seedUser(db, castId<Handle>("jhc_joiner"));
    const chatId = await seedRoomWithHistory("jhc", host);
    await seedParticipant(db, { chatId, key: "jhc_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });
    await db.update(chatsTable).set({ compactSummary: "the pre-join story so far", compactedAtSeq: 3 }).where(eq(chatsTable.id, chatId));

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const hostDetail = await getChat({ principal: principal(host), chatId });
    expect(hostDetail.compactSummary).toBe("the pre-join story so far");
    expect(hostDetail.compactedAtSeq).toBe(3);

    const memberDetail = await getChat({ principal: principal(joiner), chatId });
    expect(memberDetail.compactSummary).toBeNull();
    expect(memberDetail.compactedAtSeq).toBeNull();
  });

  test("the durable replay from lastEventId:'0' hands a clamped member NO pre-join content", async () => {
    const host = await seedUser(db, castId<Handle>("jhr_host"));
    const joiner = await seedUser(db, castId<Handle>("jhr_joiner"));
    const chatId = await seedRoom("jhr", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join greeting" });
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post-join reply" });
    await seedParticipant(db, { chatId, key: "jhr_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });

    // Emit through the REAL durable-first bus, in the order a live room produces: a pre-join commit, the raw
    // token deltas of that pre-join turn, then a post-join commit — plus a POST-join EDIT of the PRE-join row
    // (the case a cursor floor alone would let straight through: high durable seq, low view seq), and finally
    // the token stream of a turn writing INTO the post-join slot (the member's own content).
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, pre.messageId);
    const postView = await loadMessageView(db, post.messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // slotSeq 1 = the PRE-join slot these tokens fill (a host swiping/continuing that old row streams exactly
    // this) — below the joiner's floor, so it must not reach them.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join greeting" } });
    await bus.emit({ type: "messageCommitted", chatId, messageId: post.messageId, ...(postView === undefined ? {} : { view: postView }) });
    await bus.emit({ type: "messageEdited", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // slotSeq 5 = the POST-join slot — at the joiner's floor, so its tokens ARE theirs to stream.
    await bus.emit({ type: "delta", chatId, slotSeq: 5, delta: { chatId, kind: "text", text: "post-join tokens" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    // `afterSeq: 0` IS the client's `lastEventId:"0"` seed — the exact live repro cursor.
    const replayed = await replayChatEvents({ principal: principal(joiner), chatId, afterSeq: 0 });

    expect(JSON.stringify(replayed)).not.toContain("pre-join greeting");
    // The member receives their OWN post-join commit AND the post-join slot's token stream, each at its true
    // durable cursor (withheld rows leave a seq gap; the cursor is never rewritten). Deltas are clamped
    // per-ROW, not blanket-withheld — a clamped member still gets streaming for content that is theirs.
    expect(replayed.map((e) => e.seq)).toEqual([3, 5]);
    expect(replayed.map((e) => e.event.type)).toEqual(["messageCommitted", "delta"]);
    expect(JSON.stringify(replayed)).toContain("post-join tokens");

    // The host, unclamped, still gets the whole log — the clamp is per-CALLER.
    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    expect(hostReplay.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  // The SSE attach probe is the seam that carries the floor OUT of the domain: the chat ROOM tails an
  // in-process fan-out keyed by chatId only, so the transport must be handed a per-CALLER floor to clamp the
  // LIVE half with (the durable half is clamped in `replayChatEvents` above). Pinned here at the source —
  // the transport's use of it is pinned in `tests/server/transport/trpc/routers/chat.int.test.ts`.
  test("chatEventBounds carries the CALLER's own floor — clamped for the joiner, 0 for the host, from one member-gated read", async () => {
    const host = await seedUser(db, castId<Handle>("jhb_host"));
    const joiner = await seedUser(db, castId<Handle>("jhb_joiner"));
    const chatId = await seedRoomWithHistory("jhb", host);
    await seedParticipant(db, { chatId, key: "jhb_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { chatEventBounds } = createRead(makeChatContext(db), makeDeps());
    expect((await chatEventBounds({ principal: principal(joiner), chatId })).historyFloorSeq).toBe(4);
    // Same probe, same room, same instant — the host is never clamped by the member's policy.
    expect((await chatEventBounds({ principal: principal(host), chatId })).historyFloorSeq).toBe(0);
  });

  test("a `full` member's durable replay is unchanged (the other arm, on the event path too)", async () => {
    const host = await seedUser(db, castId<Handle>("jhrf_host"));
    const joiner = await seedUser(db, castId<Handle>("jhrf_joiner"));
    const chatId = await seedRoom("jhrf", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join greeting" });
    await seedParticipant(db, { chatId, key: "jhrf_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "full" });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, pre.messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // A delta anchored to the PRE-join slot — withheld from a `from-join` member, delivered here.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join greeting" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    const replayed = await replayChatEvents({ principal: principal(joiner), chatId, afterSeq: 0 });
    expect(replayed.map((e) => e.seq)).toEqual([1, 2]);
    expect(JSON.stringify(replayed)).toContain("pre-join greeting");
  });

  // RE-JOIN semantics, driven through the REAL membership write (`redeemInviteAtomic` → the DO UPDATE arm of
  // `insertMemberAfterInviteClaimStatement`, the one human-join path both invite doors share). A human's
  // membership is ONE upserted row: the re-join re-stamps `joinSeq` to the current head, clears `leftSeq`,
  // and does NOT touch `joinHistoryVisibility`.
  // So a `from-join` member who left and came back is floored at their LATEST join and loses their PREVIOUS
  // era — the row retains no era history, so that is the only reading it can support (and the conservative
  // one). Pinned because it is surprising, not because it is a preference.
  test("a re-joined from-join member is floored at their LATEST joinSeq (their previous era is not re-granted)", async () => {
    const host = await seedUser(db, castId<Handle>("jhrj_host"));
    const joiner = await seedUser(db, castId<Handle>("jhrj_joiner"));
    const chatId = await seedRoomWithHistory("jhrj", host);
    // First era: joined at head 1, so seqs 1-4 were all visible to them at the time.
    await seedParticipant(db, { chatId, key: "jhrj_m", userId: joiner, role: "member", joinSeq: 1, leftSeq: 2, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    // Re-invited: the redeem stamps the floor from the canon head (4) inside its own claim batch.
    await insertInvite(db, {
      id: castId<ChatInviteId>("chat_invite_jhrj"),
      chatId,
      tokenHash: "hash_jhrj",
      maxUses: null,
      expiresAt: null,
      createdAt: FROZEN_AT,
    });
    const rejoined = await redeemInviteAtomic(db, {
      tokenHash: "hash_jhrj",
      userId: joiner,
      participantId: castId("chat_participant_unused"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(rejoined?.participant.joinSeq).toBe(4);
    expect(rejoined?.participant.joinHistoryVisibility).toBe("from-join"); // untouched by the re-join upsert

    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);
  });

  // #1399 — the variant-ID ORACLE. `listMessageVariants` gated on membership alone: a from-join member who
  // names a PRE-JOIN slot learned its sibling-variant ids and swipe COUNT, which is exactly the identifier
  // set the floored `listMessages` withholds from them. The floor now rides the persistence WHERE (the
  // `loadVariantSlotInChat` shape one plane over), so the below-floor slot is indistinguishable from an
  // absent one: the SAME leak-free NOT_FOUND a foreign-chat messageId gives.
  test("listMessageVariants OBEYS THE D16 FLOOR — a from-join member probing a PRE-JOIN slot gets NOT_FOUND, never its sibling variant ids", async () => {
    const host = await seedUser(db, castId<Handle>("jhv_host"));
    const joiner = await seedUser(db, castId<Handle>("jhv_joiner"));
    const chatId = await seedRoom("jhv", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join" });
    const preSwipe = await addVariant(db, pre.messageId, 1, "pre-join swipe");
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post-join" });
    const postSwipe = await addVariant(db, post.messageId, 1, "post-join swipe");
    await seedParticipant(db, { chatId, key: "jhv_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });

    const { listMessageVariants } = createRead(makeChatContext(db), makeDeps());

    // The POSITIVE CONTROL first — the same caller, the same verb, a slot AT their floor: two ids, in order.
    expect(await listMessageVariants({ principal: principal(joiner), chatId, messageId: post.messageId })).toStrictEqual([
      { variantId: post.variantId, idx: 0 },
      { variantId: postSwipe, idx: 1 },
    ]);
    // The pre-join slot: refused, and its ids never cross.
    await expect(listMessageVariants({ principal: principal(joiner), chatId, messageId: pre.messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
    // The HOST is unclamped — the same slot still resolves for them (the floor is per-CALLER, not a delete).
    expect((await listMessageVariants({ principal: principal(host), chatId, messageId: pre.messageId })).map((v) => v.variantId)).toEqual([
      pre.variantId,
      preSwipe,
    ]);
  });

  test("the SSE token-log replay is clamped too (raw transcript text anchored to a pre-join slot)", async () => {
    const host = await seedUser(db, castId<Handle>("jhs_host"));
    const joiner = await seedUser(db, castId<Handle>("jhs_joiner"));
    const chatId = await seedRoom("jhs", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre" });
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post" });
    await seedParticipant(db, { chatId, key: "jhs_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    await seedStreamEvent(db, chatId, 1, { delta: "pre-join tokens", messageId: pre.messageId });
    await seedStreamEvent(db, chatId, 2, { delta: "post-join tokens", messageId: post.messageId });

    const { replayStreamEvents } = createRead(makeChatContext(db), makeDeps());
    expect((await replayStreamEvents({ principal: principal(joiner), chatId })).map((e) => e.delta)).toEqual(["post-join tokens"]);
    expect((await replayStreamEvents({ principal: principal(host), chatId })).map((e) => e.delta)).toEqual(["pre-join tokens", "post-join tokens"]);
  });
});

describe("read — dry-run prompt previews (NO persist, NO turn)", () => {
  test("peekPrompt + previewAssembly build the prompt without persisting or emitting", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "hi" });

    const { peekPrompt, previewAssembly } = createRead(makeChatContext(db), makeDeps());
    const prompt = await peekPrompt({ principal: principal(me), chatId });
    expect(typeof prompt.static).toBe("string");
    const preview = await previewAssembly({ principal: principal(me), chatId });
    expect(preview.prompt.static).toBe(prompt.static);
    expect(preview.trace).toBe(preview.prompt.trace);
    // The activated-WI list reaches the wire trace (freshTrace → prompt.trace passthrough); this room has no
    // firing lore, so the honest surface is the empty set — the panel renders its "none activated" explanation.
    expect(preview.trace.worldInfoActivated).toEqual([]);

    // No new canon was written by the previews (the one seeded message is unchanged).
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
  });

  test("peekPrompt + previewAssembly are HOST-only; a present non-host member is refused (not_host)", async () => {
    // The full assembled prompt merges every roster member's card at FULL — exposing it to a plain member
    // would bypass the D22 `memberCardVisibility` clamp. Both verbs gate at `requireHost` (matrix `host`).
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedRoom("room", host);
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const { peekPrompt, previewAssembly } = createRead(makeChatContext(db), makeDeps());

    // The host reads both.
    expect(typeof (await peekPrompt({ principal: principal(host), chatId })).static).toBe("string");
    expect(typeof (await previewAssembly({ principal: principal(host), chatId })).prompt.static).toBe("string");

    // The present member is refused (known-existence authority refusal — the client mounts these host-only).
    const peekErr = await peekPrompt({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(peekErr).toBeInstanceOf(ChatOperationError);
    expect((peekErr as ChatOperationError).code).toBe("not_host");

    const previewErr = await previewAssembly({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(previewErr).toBeInstanceOf(ChatOperationError);
    expect((previewErr as ChatOperationError).code).toBe("not_host");
  });

  test("previewAssembly routes a guided steer through the SAME assembly a real turn gets (PD-63)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);

    const { previewAssembly } = createRead(makeChatContext(db), makeDeps());
    const steered = await previewAssembly({
      principal: principal(me),
      chatId,
      guided: { action: "response", input: "be dramatic" },
    });
    // The default `response` template (system-marker placement) renders in the dynamic half; the trace
    // records the inclusion.
    expect(steered.trace.guidedInstructionIncluded).toBe(true);
    expect(steered.prompt.dynamic).toContain("be dramatic");

    const plain = await previewAssembly({ principal: principal(me), chatId });
    expect(plain.trace.guidedInstructionIncluded).toBe(false);
    expect(plain.prompt.dynamic).not.toContain("be dramatic");
  });

  test("previewAssembly's BUDGET partitions the next turn's context by source (D-4)", async () => {
    // The host preview's honesty contract: `Σ sources[].tokens === totalTokens`, every source's `text` is
    // text the model actually receives, the ceiling is the SAME `min(window, maxContextTokens)` the fit uses,
    // and a PLAIN chat carries no `game-state` row.
    const me = await seedUser(db, castId<Handle>("budget_host"));
    const chatId = await seedRoom("budget", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "the older turn" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "a reply worth some tokens" });

    const capability = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 8192 } });
    const { previewAssembly } = createRead(
      makeChatContext(db),
      makeDeps({ resolveConnection: () => Promise.resolve(makeResolved({ generation: capability })) }),
    );
    const { budget, prompt } = await previewAssembly({ principal: principal(me), chatId });

    expect(budget.sources.reduce((sum, s) => sum + s.tokens, 0)).toBe(budget.totalTokens);
    expect(budget.totalTokens).toBeGreaterThan(0);
    expect(budget.ceilingTokens).toBe(8192);
    // The preset sections land in `system`, and the drill-in body is the assembled text VERBATIM (the panel
    // shows what the wire carries, never a re-derivation).
    const system = budget.sources.find((s) => s.source === "system");
    expect(system?.tokens).toBeGreaterThan(0);
    expect(prompt.static).toContain(system?.text ?? "<no system slice>");
    // History is accounted by COST, never re-served as content.
    const history = budget.sources.find((s) => s.source === "history");
    expect(history?.text).toBe("");
    expect(history?.tokens).toBeGreaterThan(0);
    expect(history?.detail).toBe("2 turns");
    // A plain chat has no game row (the row is game-conditional, not a zero-width segment).
    expect(budget.sources.some((s) => s.source === "game-state")).toBe(false);
  });

  test("previewAssembly's BUDGET also partitions by RACK SECTION, priced against the live room (D121-G)", async () => {
    // The preset editor's bound Prompt readout reads THIS partition: the same bytes, keyed by `PromptSection.id`
    // so the readout can price the rack it already draws. The pivot is the row the editor can never price
    // chat-free — its cost is the conversation's — so it is the one this test follows end to end.
    const me = await seedUser(db, castId<Handle>("sect_host"));
    const chatId = await seedRoom("sect", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "the older turn" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "a reply worth some tokens" });

    const { budget } = await createRead(makeChatContext(db), makeDeps()).previewAssembly({ principal: principal(me), chatId });

    const ids = budget.sections.map((s) => s.sectionId);
    // Every id is a REAL rack row of the resolved config (never a synthesized key), in rack order.
    const rackIds = DEFAULT_PROMPT_CONFIG.sections.map((s) => s.id);
    expect(ids.every((id) => rackIds.includes(id))).toBe(true);
    expect(ids).toEqual(ids.toSorted((a, b) => rackIds.indexOf(a) - rackIds.indexOf(b)));

    // THE CARRIER: `chat-history` renders nothing in the BUILD walk, so a chat-free editor prices it `~—`.
    // Bound, it carries the FIT's own number and one materialized row per kept turn.
    const pivot = budget.sections.find((s) => s.sectionId === "chat-history");
    expect(pivot?.tokens).toBe(budget.sources.find((s) => s.source === "history")?.tokens);
    expect(pivot?.rows.map((r) => r.label)).toEqual(["user", "assistant"]);
    expect(pivot?.rows.every((r) => r.tokens > 0)).toBe(true);
    // Every section reports its breakdown — a single-contributor row is ONE row, never an empty list.
    expect(budget.sections.every((s) => s.rows.length > 0)).toBe(true);
  });

  test("previewAssembly takes the editor's presetOverride — the room assembled as if THAT preset were active", async () => {
    // The §7.1 seam, shared with `previewActionTemplates`: the editor inspects a preset the room has NOT
    // adopted, so the override rides `ResolveForeignInputsOp.presetOverride` (resolved owned-or-system under
    // the HOST at compose) and the priced rack is the OVERRIDE's rack, not the room's.
    const me = await seedUser(db, castId<Handle>("over_host"));
    const chatId = await seedRoom("over", me);
    const overrideConfig: PromptConfig = {
      ...DEFAULT_PROMPT_CONFIG,
      sections: [{ type: "literal", id: "only-row", name: "Only row", role: "system", content: "THE OVERRIDE PRESET SPEAKS", enabled: true }],
    };
    const seen: (PresetId | undefined)[] = [];
    const { previewAssembly } = createRead(
      makeChatContext(db),
      makeDeps({
        resolveForeignInputs: (params) => {
          seen.push(params.presetOverride);
          return Promise.resolve({
            promptConfig: params.presetOverride === undefined ? DEFAULT_PROMPT_CONFIG : overrideConfig,
            personas: { anchor: null, active: null },
            globalRegexScripts: [],
            scanDepth: 6,
            injectionTokenBudget: 0,
          });
        },
      }),
    );

    const presetId = castId<PresetId>("preset_over");
    const overridden = await previewAssembly({ principal: principal(me), chatId, presetOverride: presetId });
    expect(seen).toEqual([presetId]);
    expect(overridden.prompt.static).toContain("THE OVERRIDE PRESET SPEAKS");
    expect(overridden.budget.sections.map((s) => s.sectionId)).toEqual(["only-row"]);

    // ABSENT ⇒ byte-identical to every pre-existing caller: the room's own preset, no override threaded.
    const plain = await previewAssembly({ principal: principal(me), chatId });
    expect(seen).toEqual([presetId, undefined]);
    expect(plain.prompt.static).not.toContain("THE OVERRIDE PRESET SPEAKS");
  });

  test("a two-character room reports what EACH member costs, by their card name (owner ruling)", async () => {
    // "The context panel definitely has the current characters' total token size that are in the room."
    // The BUDGET's `cards` row must therefore break down per ROSTER MEMBER — real names, real token counts,
    // resolved through the same `getCard` op the turn assembles from (no client-side guessing, no shim).
    const me = await seedUser(db, castId<Handle>("cast_host"));
    const chatId = await seedChat(db, "cast");
    const maraId = await seedCharacter(db, me, "mara");
    const nikoId = await seedCharacter(db, me, "niko");
    await seedParticipant(db, { chatId, key: "cast_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId, key: "cast_mara", characterId: maraId });
    await seedParticipant(db, { chatId, key: "cast_niko", characterId: nikoId });

    const cards: Record<string, { name: string; description: string; regexScripts: [] }> = {
      [maraId]: { name: "Mara", description: "A bold knight of the Lantern Road who never yields her post.", regexScripts: [] },
      [nikoId]: { name: "Niko", description: "A wary scout.", regexScripts: [] },
    };
    const ctx = makeChatContext(db, {
      // @orb-waive no-test-fabrication(unknown): minimal CharacterCard doubles — assembly reads name + description off these. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      getCard: ({ characterId }) => Promise.resolve((cards[characterId] ?? null) as unknown as CharacterCard),
    });

    const { budget } = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(me), chatId });

    const cardsRow = budget.sources.find((s) => s.source === "cards");
    // Both present members are named — the detail line AND a part apiece with its own real token count.
    expect(cardsRow?.detail).toBe("Mara · Niko");
    expect(cardsRow?.parts.map((p) => p.label)).toEqual(["Mara", "Niko"]);
    expect(cardsRow?.parts.every((p) => p.tokens > 0)).toBe(true);
    // Mara's card is the longer one, so she costs more — the numbers track the actual bytes, not a stub.
    const mara = cardsRow?.parts.find((p) => p.label === "Mara");
    const niko = cardsRow?.parts.find((p) => p.label === "Niko");
    expect(mara?.tokens ?? 0).toBeGreaterThan(niko?.tokens ?? 0);
    expect(mara?.text).toContain("Lantern Road");
    expect(niko?.text).toContain("wary scout");
    // …and each member's bytes are bytes the model actually receives.
    expect(cardsRow?.text).toBe([mara?.text, niko?.text].join("\n\n"));
  });

  // NARRATOR follow-up: buildPreviewContext / shapeNextTurn hardcoded `output: "per-speaker"`, so a
  // NARRATOR room previewed its per-speaker shape — under-reporting the joined-character-names `{{char}}` binding and
  // framing the co-speaker cards as bystanders. The fix threads the room's `GroupConfig.output` (the SAME axis
  // `TurnSpeakerShape` carries into the turn) through `PreviewInputs`. Asserted through the surface the host
  // reads: `prompt.static`.
  test("a NARRATOR room previews its NARRATOR shape — joined {{char}} + [Character —] framing, not per-speaker", async () => {
    const me = await seedUser(db, castId<Handle>("narr_host"));
    // The narrator arm is a `strictObject`; `policy` is its only non-defaulted field, so this parses to a real
    // narrator GroupConfig (a malformed blob `.catch`es to the per-speaker default and would silently defeat
    // the test — every other narrator knob carries a default).
    const chatId = await seedChat(db, "narr", { metadata: { group: { output: "narrator", policy: "natural" } } });
    const ariaId = await seedCharacter(db, me, "aria");
    const kaiId = await seedCharacter(db, me, "kai");
    await seedParticipant(db, { chatId, key: "narr_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId, key: "narr_aria", characterId: ariaId });
    await seedParticipant(db, { chatId, key: "narr_kai", characterId: kaiId });

    const cards: Record<string, { name: string; description: string; regexScripts: [] }> = {
      [ariaId]: { name: "Aria", description: "Aria is a warden of the ford.", regexScripts: [] },
      [kaiId]: { name: "Kai", description: "Kai is a wandering bard.", regexScripts: [] },
    };
    const ctx = makeChatContext(db, {
      // @orb-waive no-test-fabrication(unknown): minimal CharacterCard doubles — assembly reads name + description off these. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      getCard: ({ characterId }) => Promise.resolve((cards[characterId] ?? null) as unknown as CharacterCard),
    });
    const { prompt } = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(me), chatId });

    // The `DEFAULT_PROMPT_CONFIG` main section is a TOP-LEVEL (non-card) framing, so its `{{char}}` resolves
    // through the speaker arm: a narrator turn binds it to the JOINED character names. The shipped preview bound it to a
    // single primary name. The narrator arm also resolves the narrator-true DEFAULT — the host previewing a
    // narrator room must see the bytes that round actually sends, never the per-speaker framing.
    expect(prompt.static).toMatch(JOINED_CHARACTERS_FRAMING);
    expect(prompt.static).not.toMatch(SINGLE_SPEAKER_FRAMING); // never the single-speaker binding
    expect(prompt.static).not.toContain("perspective only"); // …nor its single-perspective clause
    // Both character cards reach the wire, framed as the round's VOICES (narrator "[Character — X]"), never bystanders.
    expect(prompt.static).toContain("Aria is a warden of the ford.");
    expect(prompt.static).toContain("Kai is a wandering bard.");
    expect(prompt.static).toContain("[Character — ");
    expect(prompt.static).not.toContain("[Also present —");
  });

  test("a PER-SPEAKER merged room previews the fixed roster layout — joined {{char}} + [Character —]", async () => {
    const me = await seedUser(db, castId<Handle>("ps_host"));
    const chatId = await seedChat(db, "ps", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
    const ariaId = await seedCharacter(db, me, "aria");
    const kaiId = await seedCharacter(db, me, "kai");
    await seedParticipant(db, { chatId, key: "ps_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId, key: "ps_aria", characterId: ariaId });
    await seedParticipant(db, { chatId, key: "ps_kai", characterId: kaiId });

    const cards: Record<string, { name: string; description: string; regexScripts: [] }> = {
      [ariaId]: { name: "Aria", description: "Aria is a warden of the ford.", regexScripts: [] },
      [kaiId]: { name: "Kai", description: "Kai is a wandering bard.", regexScripts: [] },
    };
    const ctx = makeChatContext(db, {
      // @orb-waive no-test-fabrication(unknown): minimal CharacterCard doubles — assembly reads name + description off these. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      getCard: ({ characterId }) => Promise.resolve((cards[characterId] ?? null) as unknown as CharacterCard),
    });
    const { prompt } = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(me), chatId });

    // Owner ruling: a merged room's system block is the whole roster for every speaker and names none — the
    // single default binds `{{char}}` to the joined names, and every non-primary card rides as "[Character — X]".
    expect(prompt.static).toMatch(ROSTER_FRAMING);
    expect(prompt.static).not.toMatch(SINGLE_SPEAKER_FRAMING);
    expect(prompt.static).not.toMatch(JOINED_CHARACTERS_FRAMING); // never the narrator's framing either
    expect(prompt.static).toContain("[Character — ");
    expect(prompt.static).not.toContain("[Also present —");
  });

  test("the budget ceiling is the CONNECTED model's window; an unknown window says so (owner bug, D41)", async () => {
    // "The preview just assumes 200k and isn't properly reading from the currently connected model." The
    // ceiling must be whatever THIS chat's resolved connection reports — and when that window is itself a
    // fallback guess (a catalog that couldn't be read), the wire must say `ceilingEstimated` so the panel
    // refuses to draw a ratio against it instead of showing a fabricated denominator.
    const me = await seedUser(db, castId<Handle>("ceiling_host"));
    const chatId = await seedRoom("ceiling", me);

    // A small-context local model: the ceiling tracks IT, not any blanket default.
    const small = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] }, context: { window: 40_960 } });
    const { previewAssembly } = createRead(makeChatContext(db), makeDeps({ resolveConnection: () => Promise.resolve(makeResolved({ generation: small })) }));
    const known = await previewAssembly({ principal: principal(me), chatId });
    expect(known.budget.ceilingTokens).toBe(40_960);
    expect(known.budget.ceilingEstimated).toBe(false);

    // The SAME window, but the capability marks it a guess (cold catalog): the number still drives the fit,
    // and the wire flags it so the surface says "unknown".
    const guessed = makeGenerationCapability({
      output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
      context: { window: 200_000, windowEstimated: true },
    });
    const { previewAssembly: previewGuessed } = createRead(
      makeChatContext(db),
      makeDeps({ resolveConnection: () => Promise.resolve(makeResolved({ generation: guessed })) }),
    );
    const unknown = await previewGuessed({ principal: principal(me), chatId });
    expect(unknown.budget.ceilingTokens).toBe(200_000);
    expect(unknown.budget.ceilingEstimated).toBe(true);
  });

  test("a user's own maxContextTokens cap is TRUTH — it binds, so the ceiling stops being a guess", async () => {
    // The nuance the flag must respect: when the preset's soft cap is below the guessed model window, the cap
    // is what actually bounds the context and the user declared it — the ratio is honest again.
    const me = await seedUser(db, castId<Handle>("cap_host"));
    const chatId = await seedRoom("cap", me);
    const guessed = makeGenerationCapability({
      output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
      context: { window: 200_000, windowEstimated: true },
    });
    const { previewAssembly } = createRead(
      makeChatContext(db),
      makeDeps({
        resolveConnection: () => Promise.resolve(makeResolved({ generation: guessed })),
        resolveForeignInputs: () =>
          Promise.resolve({
            promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, maxContextTokens: 16_000 } },
            personas: { anchor: null, active: null },
            globalRegexScripts: [],
            scanDepth: 6,
            injectionTokenBudget: 0,
          }),
      }),
    );

    const preview = await previewAssembly({ principal: principal(me), chatId });

    expect(preview.budget.ceilingTokens).toBe(16_000);
    expect(preview.budget.ceilingEstimated).toBe(false);
  });

  test("a GAME chat previews its state block: the rpg gather rides the preview + gets its own budget row", async () => {
    // Before D-4 the preview omitted the rpg reminder entirely — the host's honesty instrument showed a prompt
    // the model never receives. The gather now runs on the preview path (read-only, turnless) and its depth-0
    // reminder is accounted as `game-state`, disjoint from `steering`.
    const me = await seedUser(db, castId<Handle>("game_host"));
    const chatId = await seedRoom("game", me);
    const gatherTurnContext = vi.fn(() =>
      Promise.resolve({
        macros: {},
        injections: [{ position: "in_chat" as const, depth: 0, role: "system" as const, content: "## Game state\nroster: Mara (VIT 24/30)" }],
        tools: [],
      }),
    );
    // The same minimal-stub precedent as the deception-replay test below (which fabricates only
    // `resolveReasoningHostOnly`).
    // The preview path calls `gatherTurnContext`, the game-macro declaration read (`resolveUserMacros`, WAVE
    // MU's second definition home), and — since the GM-preset redirect landed on this path (2026-08-08) —
    // `resolvePresetOverride`. `null` here is the honest arm for THIS game: no `gmPresetId`, so the preview
    // falls to the host's own default preset exactly as its turn would. The redirect's own coverage is the two
    // tests below.
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the preview path reaches only these three ops. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      gatherTurnContext,
      resolveUserMacros: () => Promise.resolve([]),
      resolvePresetOverride: () => Promise.resolve(null),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const ctx = makeChatContext(db, { rpg });

    // PROSE-1 re-home (owner ruling 2026-08-08): the reminder's teach/heading overrides are the PRESET's
    // `promptConfig.prose`, and CHAT is what resolves them — rpg has no preset reach. This preset carries one
    // re-authored teach plus a key belonging to a USER-homed slot, so the assertion below proves both halves of
    // the threading: the preset key arrives, and `composeProse` drops the key that homes elsewhere (no cascade).
    const deps = makeDeps({
      resolveForeignInputs: () =>
        Promise.resolve({
          promptConfig: {
            ...DEFAULT_PROMPT_CONFIG,
            prose: {
              "rpg.reminder.steeringLicense": { text: "our table's own license", baseVersion: 1 },
              "chat.arbiter.system": { text: "WRONG HOME", baseVersion: 1 },
            },
          },
          personas: { anchor: null, active: null },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    });
    const { budget } = await createRead(ctx, deps).previewAssembly({ principal: principal(me), chatId });

    const gameState = budget.sources.find((s) => s.source === "game-state");
    expect(gameState?.text).toBe("## Game state\nroster: Mara (VIT 24/30)");
    expect(gameState?.detail).toBe("state block");
    expect(gameState?.tokens).toBeGreaterThan(0);
    // Turnless + dice-ineligible: the preview never marks a turn or feeds a queued roll.
    expect(gatherTurnContext).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId,
        pendingUserText: undefined,
        respondsToLatestUserTurn: false,
        steerIdentity: expect.objectContaining({ char: expect.any(String) }),
        // The preset's teach reaches rpg; the user-homed key in the same blob does not.
        prose: { "rpg.reminder.steeringLicense": { text: "our table's own license", baseVersion: 1 } },
      }),
    );
  });

  // ── THE GM-PRESET REDIRECT ON THE PREVIEW PATH (verifier REFUTED the re-home merge, 2026-08-08) ──────────
  // `turn.ts` runs `ctx.rpg.resolvePresetOverride(chatId)` BEFORE the foreign read, so a game turn assembles the
  // game's `gmPresetId`. `resolvePreviewInputs` never ran that hop — so on a game chat EVERY preview surface
  // rendered the host's DEFAULT preset while the turn shipped the GM preset's: sections, guided prompts, format
  // strings, the turn-wire framings, and (after the prose re-home) the eleven rpg teaches.
  //
  // The bug is OLDER than the re-home and was invisible for a structural reason worth stating: while the teaches
  // lived in `rpg_games.config.prose` they were ONE storage both paths read, so preview and turn agreed by
  // construction. Re-homing them to the preset moved them onto the unfaithful side — the merge did not create
  // the defect, it made the host's honesty instrument start lying about the bytes it exists to show.
  //
  // The stub above cannot see any of this (it hands back one config whatever it is asked for). This one branches
  // on `presetOverride`, which is the actual seam, and reads the RENDERED bytes rather than a call argument.
  test("a GAME chat's preview resolves the GM PRESET the turn resolves — the rpg teaches included", async () => {
    const me = await seedUser(db, castId<Handle>("gm_preset_host"));
    const chatId = await seedRoom("gmpreset", me);
    const gmPresetId = castId<PresetId>("preset_gm_voice");
    const authoredLicense = "OUR TABLE'S OWN LICENSE — the GM preset speaks.";
    const gmConfig: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, prose: { "rpg.reminder.steeringLicense": { text: authoredLicense, baseVersion: 1 } } };

    const seen: (PresetId | undefined)[] = [];
    // The three rpg ops this path reaches. `resolvePresetOverride` is the redirect under test; the gather
    // resolves its teach through the SAME `resolveProseText` the real reminder uses, so what is asserted is the
    // THREADING, never a re-implementation of the reminder.
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the preview path reaches only the three ops below. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      resolvePresetOverride: () => Promise.resolve(gmPresetId),
      resolveUserMacros: () => Promise.resolve([]),
      gatherTurnContext: (args: { readonly prose?: ProseOverrides | undefined }) =>
        Promise.resolve({
          macros: {},
          injections: [
            { position: "in_chat" as const, depth: 0, role: "system" as const, content: resolveProseText("rpg.reminder.steeringLicense", args.prose ?? {}) },
          ],
          tools: [],
        }),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const deps = makeDeps({
      resolveForeignInputs: (params) => {
        seen.push(params.presetOverride);
        return Promise.resolve({
          promptConfig: params.presetOverride === gmPresetId ? gmConfig : DEFAULT_PROMPT_CONFIG,
          personas: { anchor: null, active: null },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        });
      },
    });

    const { budget } = await createRead(makeChatContext(db, { rpg }), deps).previewAssembly({ principal: principal(me), chatId });

    // THE WHOLE CLASS, in one line: the foreign read ran under the GM preset, so EVERY template it carries —
    // sections and guided prompts included, not just prose — is the one the turn would use.
    expect(seen).toEqual([gmPresetId]);
    // …and the RENDERED bytes, which is what a host actually reads off this instrument.
    const gameState = budget.sources.find((s) => s.source === "game-state");
    expect(gameState?.text).toBe(authoredLicense);
    expect(gameState?.text).not.toBe(PROSE_SLOTS["rpg.reminder.steeringLicense"].text);
  });

  // The precedence half. A host inspecting a CANDIDATE preset is asking "what would THIS render in this room";
  // letting a game's `gmPresetId` win would answer a question nobody asked, on the one surface whose entire job
  // is inspecting a preset the room has not adopted.
  test("an EXPLICIT presetOverride still outranks the GM redirect", async () => {
    const me = await seedUser(db, castId<Handle>("gm_preset_host2"));
    const chatId = await seedRoom("gmpreset2", me);
    const candidateId = castId<PresetId>("preset_candidate");

    const seen: (PresetId | undefined)[] = [];
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — only the redirect + the macro-declaration read are reached. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      resolvePresetOverride: () => Promise.resolve(castId<PresetId>("preset_gm_voice")),
      resolveUserMacros: () => Promise.resolve([]),
      gatherTurnContext: () => Promise.resolve(null),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const deps = makeDeps({
      resolveForeignInputs: (params) => {
        seen.push(params.presetOverride);
        return Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: null, active: null },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        });
      },
    });

    await createRead(makeChatContext(db, { rpg }), deps).previewAssembly({ principal: principal(me), chatId, presetOverride: candidateId });
    expect(seen).toEqual([candidateId]);
  });

  // ── the persona-swap CONTEXT leak (owner report 2026-08-01) ────────────────────────────────────────
  // "I swapped my persona from You to Alex and re-pinned as Alex — the Preview still lists BOTH." The
  // per-member accounting is only honest if a persona that is neither the live ANCHOR nor any present
  // human's ACTIVE persona contributes NOTHING, however many past rows are still STAMPED with it (the
  // transcript keeps those names by design — that is DISPLAY resolution, not context contribution).
  //
  // These drive the composition root's REAL persona binding (`createTurnPersonaResolver` over the consent-gated
  // persona read), because the suite's default `resolveForeignInputs` fake returns fixed nulls and would prove
  // nothing.
  function personaResolvingDeps(): Partial<Parameters<typeof createRead>[1]> {
    const resolvePersonas = createTurnPersonaResolver(async ({ personaIds, allowedOwnerIds }) => {
      const rows = await loadPersonasForOwners(db, [...new Set(personaIds)], [...new Set(allowedOwnerIds)]);
      return new Map(rows.map((row) => [row.id, row]));
    });
    return {
      resolveForeignInputs: async (args) => ({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: await resolvePersonas(args),
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
    };
  }

  /** The owner's room mid-report: a host whose OLD persona ("You") is the chat anchor + the stamp on past
   *  canon, and whose NEW persona ("Alex") is the one he now plays. Returns both persona ids + the read bundle
   *  and the two REAL write verbs the two picker controls call. */
  async function seedPersonaSwapRoom(): Promise<{
    me: UserId;
    chatId: ChatId;
    oldPersona: PersonaId;
    newPersona: PersonaId;
    read: ReturnType<typeof createRead>;
    rePin: (personaId: PersonaId) => Promise<void>;
  }> {
    const me = await seedUser(db, castId<Handle>("swap_host"));
    const chatId = await seedRoom("swap", me);
    const oldPersona = await seedPersona(db, me, "You", { description: "the old traveller nobody plays anymore" });
    const newPersona = await seedPersona(db, me, "Alex", { description: "Alex, the current player" });
    // The chat opened under the OLD persona: it is both the anchor pin and the stamp on the canon written then.
    await db.update(chatsTable).set({ anchorPersonaId: oldPersona }).where(eq(chatsTable.id, chatId));
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, personaId: oldPersona, content: "an old line" });
    const ctx = makeChatContext(db);
    const emit = async (): Promise<void> => undefined;
    // "Playing as Alex" — the REAL write `persona.setActivePersona` delegates to (verbs/participants.ts).
    await setParticipantActivePersona(db, emit, { chatId, targetUserId: me, personaId: newPersona });
    const life = createChatLifecycle(ctx, {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit,
      emitLive: (): void => undefined,
      activeTurns: createActiveTurns(),
    });
    return {
      me,
      chatId,
      oldPersona,
      newPersona,
      read: createRead(ctx, makeDeps(personaResolvingDeps())),
      // "Re-pin" — the host anchor verb.
      rePin: (personaId) => life.setChatAnchorPersona({ principal: principal(me), chatId, personaId }),
    };
  }

  test("re-pinning the anchor drops the swapped-out persona from the preview AND the prompt (owner report)", async () => {
    const { me, chatId, newPersona, read, rePin } = await seedPersonaSwapRoom();

    // BEFORE the re-pin the old persona is still the ANCHOR, so it legitimately rides card-context (the
    // both-personas swap rule) — this is the state the owner saw, reproduced.
    const swapped = await read.previewAssembly({ principal: principal(me), chatId });
    expect(swapped.budget.sources.find((s) => s.source === "cards")?.parts.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Alex (persona)", "You (persona)"]),
    );

    await rePin(newPersona);

    // AFTER: the old persona is neither the anchor nor anyone's active persona ⇒ it contributes NOTHING,
    // even though canon row 1 is still STAMPED with it (stamp-derived DISPLAY names are untouched by design).
    const rePinned = await read.previewAssembly({ principal: principal(me), chatId });
    const cards = rePinned.budget.sources.find((s) => s.source === "cards");
    expect(cards?.parts.map((p) => p.label)).toContain("Alex (persona)");
    expect(cards?.parts.map((p) => p.label)).not.toContain("You (persona)");
    // …and the same verdict on the bytes the model actually receives — this is a PROMPT fact, not a panel fact.
    const peeked = await read.peekPrompt({ principal: principal(me), chatId });
    for (const text of [`${rePinned.prompt.static}\n${rePinned.prompt.dynamic}`, `${peeked.static}\n${peeked.dynamic}`]) {
      expect(text).toContain("Alex, the current player");
      expect(text).not.toContain("the old traveller nobody plays anymore");
    }
  });

  test("a host's PREVIEW never binds another member's persona — present OR departed (the retired personaIds[0] fallback)", async () => {
    // With a personaless host the preview once OMITTED its trigger, and the resolver fell back to
    // `personaIds[0]` — the first PRESENT human's active persona — so the guest's persona rode the HOST's own
    // instrument as `{{user}}`. That fallback is retired: a trigger-less read states `{kind:"none"}` ⇒ the chat
    // ANCHOR. A PRESENT guest's persona still enters the prompt (D122), but only as a headed people-block entry,
    // never as the unheaded voice part `{{user}}` names. Once they leave, the consent gate drops it entirely.
    const host = await seedUser(db, castId<Handle>("left_host"));
    const chatId = await seedRoom("left", host);
    const guest = await seedUser(db, castId<Handle>("left_guest"));
    const guestPersona = await seedPersona(db, guest, "Departed", { description: "the guest who walked out" });
    await seedParticipant(db, { chatId, key: "left_guest", userId: guest, role: "member", activePersonaId: guestPersona });

    const read = createRead(makeChatContext(db), makeDeps(personaResolvingDeps()));
    const present = await read.previewAssembly({ principal: principal(host), chatId });
    const presentText = `${present.prompt.static}\n${present.prompt.dynamic}`;
    expect(presentText).toContain("roleplay with Traveler");
    expect(presentText).toContain(`${resolveProseText("chat.group.personaHeading", {}, { name: "Departed" })}\nthe guest who walked out`);
    expect(presentText).not.toContain("\n\nthe guest who walked out");
    const presentCards = present.budget.sources.find((s) => s.source === "cards")?.parts ?? [];
    expect(presentCards.map((p) => p.label)).toContain("Departed (persona)");

    await db
      .update(chatParticipants)
      .set({ leftSeq: 1 })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, guest)));

    const departed = await read.previewAssembly({ principal: principal(host), chatId });
    expect(`${departed.prompt.static}\n${departed.prompt.dynamic}`).not.toContain("the guest who walked out");
    const departedCards = departed.budget.sources.find((s) => s.source === "cards")?.parts ?? [];
    expect(departedCards.map((p) => p.label)).not.toContain("Departed (persona)");
  });

  // The POSITIVE half of the ruling, at the integration tier. The test above is four `not.toContain`s, which
  // a resolver that returned `active: null` unconditionally would also satisfy — so on its own it proves the
  // bystander is gone without proving anything BOUND. `activePersonaIdFor`'s unit pins cover the pure
  // function; this covers the wired preview: a personaless host's trigger-less read takes the `none` arm and
  // resolves the chat ANCHOR, which is the identity that REPLACED the retired presence-order pick.
  test("a personaless host's preview binds the chat ANCHOR — the identity that replaced the bystander pick", async () => {
    const host = await seedUser(db, castId<Handle>("anchor_host"));
    const chatId = await seedRoom("anchorbind", host);
    const guest = await seedUser(db, castId<Handle>("anchor_guest"));
    const guestPersona = await seedPersona(db, guest, "Bystander", { description: "the first human who happened to join" });
    await seedParticipant(db, { chatId, key: "anchor_guest", userId: guest, role: "member", activePersonaId: guestPersona });
    // The HOST holds no seat persona (so the preview cannot take the `human` arm) but the ROOM has an anchor.
    const anchorPersona = await seedPersona(db, host, "Anchor", { description: "the identity this room is about" });
    await db.update(chatsTable).set({ anchorPersonaId: anchorPersona }).where(eq(chatsTable.id, chatId));

    const read = createRead(makeChatContext(db), makeDeps(personaResolvingDeps()));
    const preview = await read.previewAssembly({ principal: principal(host), chatId });

    const prompt = `${preview.prompt.static}\n${preview.prompt.dynamic}`;
    // The discriminating read is the ACTIVE binding, not the anchor's card contribution — the anchor arm is
    // resolved separately and would appear either way. This one string separates the candidate behaviours:
    // "Anchor" = the anchor human's empty seat falling back to the anchor persona they own; "Bystander" = the
    // retired `personaIds[0]` fallback; the kit floor "Traveler" = an active that resolved to nothing.
    expect(prompt).toContain("roleplay with Anchor");
    expect(prompt).not.toContain("roleplay with Bystander");
    expect(prompt).not.toContain("roleplay with Traveler");
    // The present bystander enters only as a headed people-block entry after the anchor's unheaded voice part.
    expect(prompt).toContain(
      `the identity this room is about\n\n${resolveProseText("chat.group.personaHeading", {}, { name: "Bystander" })}\nthe first human who happened to join`,
    );
  });

  test("a DISABLED member drops from the preview's foreign-input consent set — an honesty-instrument preview must not overstate what a live turn would resolve (#73 second-commit fix)", async () => {
    const host = await seedUser(db, castId<Handle>("preview_host"));
    const chatId = await seedRoom("preview_disabled", host);
    const member = await seedUser(db, castId<Handle>("preview_member"));
    await seedParticipant(db, { chatId, key: "preview_member", userId: member, role: "member" });

    let presentHumanUserIds: readonly UserId[] = [];
    const ctx = makeChatContext(db, { resolveUserEnabled: (userId) => Promise.resolve(userId !== member) });
    const { previewAssembly } = createRead(
      ctx,
      makeDeps({
        resolveForeignInputs: (args) => {
          presentHumanUserIds = args.presentHumanUserIds;
          return Promise.resolve({
            promptConfig: DEFAULT_PROMPT_CONFIG,
            personas: { anchor: null, active: null },
            globalRegexScripts: [],
            scanDepth: 6,
            injectionTokenBudget: 0,
          });
        },
      }),
    );

    await previewAssembly({ principal: principal(host), chatId });

    expect(presentHumanUserIds).toContain(host);
    expect(presentHumanUserIds).not.toContain(member);
  });

  // #1401 — the PREVIEW's `personaIds` had NO presence filter while the live turn's (`verbs/turn.ts`'s
  // `loadRoom`) does, and `personaIds` is exactly what gates which persona-scope world-info books join the
  // pool. So a host's preview assembled an OFFLINE member's persona lore that the next real turn would not
  // send — the divergence axis is PRESENCE, not the enabled/consent gate the sibling list applies.
  test("an OFFLINE member's persona-scope world-info stays OUT of the host preview (the turn's own presence rule)", async () => {
    const host = await seedUser(db, castId<Handle>("wi_pres_host"));
    const chatId = await seedRoom("wi_presence", host);
    const member = await seedUser(db, castId<Handle>("wi_pres_member"));
    const memberPersona = await seedPersona(db, member, "Offline Player", { description: "a member who is not in the room" });
    await seedParticipant(db, { chatId, key: "wi_pres_member", userId: member, role: "member", activePersonaId: memberPersona });

    const bookId = castId<WorldBookId>("world_book_wi_presence");
    await db.insert(worldBooks).values({ id: bookId, ownerId: member, name: "offline persona lore", createdAt: FROZEN_AT });
    await db.insert(worldEntries).values({
      id: castId<WorldEntryId>("world_entry_wi_presence"),
      worldBookId: bookId,
      title: "presence probe",
      content: "THE OFFLINE MEMBERS PRIVATE LORE",
      keys: null,
      enabled: true,
      priority: 0,
      ignoreBudget: false,
      metadata: null,
      createdAt: FROZEN_AT,
    });
    await db.insert(personaBooks).values({ personaId: memberPersona, worldBookId: bookId, createdAt: FROZEN_AT });

    const previewWith = async (online: boolean): Promise<string> => {
      const ctx = makeChatContext(db, { readPresence: (userId) => Promise.resolve({ userId, online: online || userId === host, lastSeenAt: null }) });
      const preview = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(host), chatId });
      return `${preview.prompt.static}\n${preview.prompt.dynamic}`;
    };

    // ONLINE: the book is in the pool — this is the positive control that proves the probe can even fire.
    expect(await previewWith(true)).toContain("THE OFFLINE MEMBERS PRIVATE LORE");
    // OFFLINE: it is out, exactly as the live turn would have it.
    expect(await previewWith(false)).not.toContain("THE OFFLINE MEMBERS PRIVATE LORE");
  });

  test("getActivePresetConfig returns the resolved PromptConfig", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);

    const { getActivePresetConfig } = createRead(makeChatContext(db), makeDeps());
    const config = await getActivePresetConfig({ principal: principal(me), chatId });
    expect(config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
  });

  // ── previewActionTemplates (D8 / preset-surface-redesign §7.1) — the preset editor's BOUND readout ────
  // Two properties carry the whole feature and neither is visible to a typecheck: the resolution is REAL
  // (identity macros resolve through the CHAT — Ruling B), and it is HONESTLY PARTIAL (the fire-time tokens
  // survive, because the user has typed no steer and picked no perspective; substituting them would put a
  // fabricated value on the editor's honesty instrument).

  /** A preset whose impersonate template carries one identity macro and BOTH fire-time tokens. */
  const bindingConfig: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: {
      ...DEFAULT_GUIDED_ACTIONS,
      impersonate: { prompt: "Write {{user}}'s next message from a {{person}}-person perspective. {{input}}", role: "user" },
    },
  };

  test("previewActionTemplates resolves identity through the CHAT and keeps the fire-time tokens as TOKENS", async () => {
    const me = await seedUser(db, castId<Handle>("bind_host"));
    const chatId = await seedRoom("bind", me);

    const { previewActionTemplates } = createRead(
      makeChatContext(db),
      makeDeps({
        // The `presetOverride` the editor sends lands here (compose resolves it under the HOST); the chat
        // resolves `{{user}}` from its own persona, which is precisely the binding's whole value.
        resolveForeignInputs: () =>
          Promise.resolve({
            promptConfig: bindingConfig,
            personas: { anchor: null, active: { name: "Alex", description: "" } },
            globalRegexScripts: [],
            scanDepth: 6,
            injectionTokenBudget: 0,
          }),
      }),
    );

    const preview = await previewActionTemplates({ principal: principal(me), chatId, presetId: castId<PresetId>("preset_bind") });
    const impersonate = preview.templates.find((t) => t.id === "impersonate")?.resolved ?? "";

    // REAL: the chat's persona is what `{{user}}` became — the editor could not have known this alone.
    expect(impersonate).toContain("Write the owner's next message");
    expect(impersonate).not.toContain("{{user}}");
    // HONESTLY PARTIAL: both fire-time tokens are still tokens.
    expect(impersonate).toContain("{{person}}");
    expect(impersonate).toContain("{{input}}");
    // The bindings the readout's gloss NAMES come off the same resolution, never re-derived client-side.
    expect(preview.identity.user).toBe("Alex");

    // EVERY registry row is answered — the readout's row selection is a client pick over one round trip.
    expect(preview.templates.map((t) => t.id)).toEqual(TEMPLATE_DEFS.map((d) => d.id));

    // A DRY RUN: nothing was written to the room.
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(0);
  });

  test("previewActionTemplates is HOST-only — a rendered template carries full-fidelity card bytes (D22)", async () => {
    const host = await seedUser(db, castId<Handle>("bind_h2"));
    const member = await seedUser(db, castId<Handle>("bind_m2"));
    const chatId = await seedRoom("bind2", host);
    await seedParticipant(db, { chatId, key: "bind2_m", userId: member, role: "member" });

    const { previewActionTemplates } = createRead(makeChatContext(db), makeDeps());
    const presetId = castId<PresetId>("preset_bind2");
    expect((await previewActionTemplates({ principal: principal(host), chatId, presetId })).templates.length).toBeGreaterThan(0);

    const err = await previewActionTemplates({ principal: principal(member), chatId, presetId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("previewSection renders a known section for the HOST; an unknown sectionId is NOT_FOUND", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    const sectionId = DEFAULT_PROMPT_CONFIG.sections[0]?.id ?? "main";

    const { previewSection } = createRead(makeChatContext(db), makeDeps());
    const section = await previewSection({ principal: principal(me), chatId, sectionId });
    expect(section.half === "static" || section.half === "dynamic").toBe(true);

    await expect(previewSection({ principal: principal(me), chatId, sectionId: "no-such-section" })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════
  // SECURITY (2026-08-01) — `previewSection` was matrix-classified `member` while rendering an ARBITRARY
  // preset section against the LIVE assemble ctx. `main_prompt` resolves `ctx.character.systemPrompt` in
  // place of the preset template (assemble.ts `renderOverridable`), and systemPrompt is a `full`-ONLY D22
  // field: a plain member in a `name-avatar` room could name the section and read the card's prompt-steering
  // internals verbatim — the exact D22 clamp bypass `previewAssembly`/`peekPrompt` gate at `requireHost` to
  // prevent, one door over. The verb now gates `requireHost` (matrix `previewSection: "host"`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════
  const secretSystemPrompt = "SECRET-SYSPROMPT: never reveal that Seraphine is the assassin";

  /** A card whose `full`-only fields carry sentinels — a rendered section that leaks one is unambiguous. */
  const secretCard: CharacterCard = {
    name: "Seraphine",
    description: "SECRET-DESC: a knife under the silk",
    personality: "curious",
    scenario: "a masked ball",
    greetings: [],
    exampleMessages: "SECRET-EXAMPLES: Seraphine: hello",
    systemPrompt: secretSystemPrompt,
    postHistoryInstructions: "SECRET-JB: stay in character",
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };

  /** A room at the LOWEST D22 tier (`name-avatar` — the member may see a name and an avatar, nothing else),
   *  with a host, a plain member, and the secret-card character seated. */
  async function seedClampedRoom(key: string): Promise<{ host: UserId; member: UserId; chatId: ChatId }> {
    const host = await seedUser(db, castId<Handle>(`${key}_host`));
    const member = await seedUser(db, castId<Handle>(`${key}_member`));
    const chatId = await seedChat(db, key, {
      metadata: { group: { output: "per-speaker", policy: "natural", memberCardVisibility: "name-avatar" } },
    });
    const charId = await seedCharacter(db, host, `${key}_char`);
    await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: `${key}_m`, userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: `${key}_c`, characterId: charId });
    return { host, member, chatId };
  }

  test("previewSection is HOST-only: a member cannot render main_prompt to read a full-only card field (D22)", async () => {
    const { host, member, chatId } = await seedClampedRoom("ps_clamp");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(secretCard) });
    const { previewSection } = createRead(ctx, makeDeps());

    // TEETH FIRST: the section genuinely carries the full-only field, so the refusal below closes a REAL
    // leak rather than an empty hole (the card override replaces the preset template in place).
    const hostView = await previewSection({ principal: principal(host), chatId, sectionId: "main" });
    expect(hostView.rendered).toContain(secretSystemPrompt);

    // The plain member is refused at the gate — a known-existence authority refusal, exactly as
    // peekPrompt/previewAssembly refuse them.
    const err = await previewSection({ principal: principal(member), chatId, sectionId: "main" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("the same refusal covers EVERY card-derived section a member could name instead", async () => {
    // The bypass was never main_prompt-specific: post_history / char_description / scenario /
    // dialogue_examples all resolve card text, so the gate — not a per-section filter — is the fix.
    const { host, member, chatId } = await seedClampedRoom("ps_all");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(secretCard) });
    const { previewSection } = createRead(ctx, makeDeps());
    const sectionIds = ["main", "post-history", "char-desc", "scenario", "examples"] as const;

    const hostRenders = await Promise.all(sectionIds.map((sectionId) => previewSection({ principal: principal(host), chatId, sectionId })));
    // Every named section resolves card bytes for the host (each carries its own sentinel).
    expect(hostRenders.map((r) => r.rendered).join("\n")).toContain("SECRET-DESC");
    expect(hostRenders.map((r) => r.rendered).join("\n")).toContain("SECRET-JB");

    const codes = await Promise.all(
      sectionIds.map((sectionId) =>
        previewSection({ principal: principal(member), chatId, sectionId }).then(
          () => "RESOLVED (leak)",
          (e: unknown) => (e instanceof ChatOperationError ? e.code : `unexpected ${String(e)}`),
        ),
      ),
    );
    expect(codes).toEqual(sectionIds.map(() => "not_host"));
  });

  test("the member-classified reads on this path expose NO card bytes (the sweep-classification pin)", async () => {
    // The classification rule the previewSection hole broke: a `member` chat read may build the assemble ctx
    // but must never hand back RENDERED bytes off it. These two are the only member-gated verbs left on the
    // preview path — `previewContextFit` (numbers + a boundary id) and `getActivePresetConfig` (preset
    // templates, no ctx at all). If either ever starts serializing ctx statics, this goes red.
    const { member, chatId } = await seedClampedRoom("ps_member_reads");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(secretCard) });
    const { previewContextFit, getActivePresetConfig } = createRead(ctx, makeDeps());

    const fit = await previewContextFit({ principal: principal(member), chatId });
    const config = await getActivePresetConfig({ principal: principal(member), chatId });

    expect(JSON.stringify(fit)).not.toContain("SECRET-");
    expect(JSON.stringify(config)).not.toContain("SECRET-");
    // …and the fit is still a real answer for the member (not an empty object that trivially passes).
    expect(fit.usedTokens).toBeGreaterThan(0);
  });

  test("a preview binds {{user}} to the HOST's own persona, never the presence-order-first human's", async () => {
    // `resolvePreviewInputs` used to pass only `personaIds` (roster order), so the composition root's
    // `triggerPersonaId ?? personaIds.at(0)` fell through to whoever joined first — a host's own preview
    // could render ANOTHER member's persona as {{user}}, and the answer changed with join order. That
    // fallback is now RETIRED outright (2026-08-07) rather than merely out-ranked, so the join order this
    // room seeds is no longer an input to anything — it is kept because a REGRESSION would re-introduce
    // exactly this shape, and this room is the one that would catch it.
    const host = await seedUser(db, castId<Handle>("pp_host"));
    const other = await seedUser(db, castId<Handle>("pp_other"));
    const hostPersonaId = await seedPersona(db, host, "pp_host_persona");
    const otherPersonaId = await seedPersona(db, other, "pp_other_persona");
    const chatId = await seedChat(db, "pp");
    const charId = await seedCharacter(db, host, "pp_char");
    // The OTHER human joined FIRST — the seat order the retired fallback would have picked from.
    await seedParticipant(db, { chatId, key: "pp_a_other", userId: other, role: "member", joinSeq: 1, activePersonaId: otherPersonaId });
    await seedParticipant(db, { chatId, key: "pp_b_host", userId: host, role: "host", joinSeq: 2, activePersonaId: hostPersonaId });
    await seedParticipant(db, { chatId, key: "pp_c_char", characterId: charId });

    const byId: Record<string, AssemblePersona> = {
      [hostPersonaId]: { name: "HostPersona", description: "HOST-PERSONA-DESC" },
      [otherPersonaId]: { name: "OtherPersona", description: "OTHER-PERSONA-DESC" },
    };
    // Binds through the composition root's own rule (compose/chat.ts `voicePersonaFor`), so the assertion is on
    // the real resolution, not on a stub that agrees by construction.
    const deps = makeDeps({
      resolveForeignInputs: ({ trigger, voice, runAsUserId, humanSeats }) =>
        Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: {
            anchor: null,
            active: byId[voicePersonaFor({ voice, trigger, anchorPersonaId: null, anchorOwnerId: null, runAsUserId, humanSeats }).personaId ?? ""] ?? null,
          },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    });

    const { previewSection } = createRead(makeChatContext(db), deps);
    const persona = await previewSection({ principal: principal(host), chatId, sectionId: "persona" });

    expect(persona.rendered).toContain("HOST-PERSONA-DESC");
    expect(persona.rendered).not.toContain("OTHER-PERSONA-DESC");
  });

  test("getShapeTrace returns the content-free SHAPE trace for the host; a non-host member is refused (not_host)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedRoom("room", me);
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "hi" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hey there" });

    const { getShapeTrace } = createRead(makeChatContext(db), makeDeps());
    const trace = await getShapeTrace({ principal: principal(me), chatId });

    // Row COUNTS per stage, no content bytes — the content-free projection (PD-132).
    expect(trace.stageCounts.withTail).toBe(2);
    expect(typeof trace.squashMerges).toBe("number");
    expect(SHAPE_BREAKPOINT_DECISIONS).toContain(trace.breakpointDecision);
    // No content leaks: the whole trace serializes to counts/flags/decisions, never the seeded message bodies.
    expect(JSON.stringify(trace)).not.toContain("hey there");

    // A present but non-host member is refused (the host/admin inspector gate, matrix `getShapeTrace: "host"`).
    const err = await getShapeTrace({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  // ── getVariantWire — the per-variant WIRE RECORD (RAWVIEW) ─────────────────────────────────────────
  // The RETROSPECTIVE preview: a stored `promptSnapshot` is a real assembled prompt, so it carries the
  // roster's cards at FULL fidelity (the D22 bypass), the hidden spans the §3.6 member strip removes, and
  // history below a clamped member's D16 floor. Reading a PAST prompt must not be the cheap way around the
  // three host-gated doors — the exact hole `previewSection` was closed for (2026-08-01). The arms below:
  // the host READ, the two REFUSAL planes (member / stranger), the CROSS-CHAT variantId belt, and the two
  // honest-absence degrades.
  describe("getVariantWire", () => {
    /** The hidden truth + the pre-floor canon a stored snapshot embeds — the two classes of byte a non-host
     *  must never recover through this read. */
    const Snapshot = {
      static: "PRE-JOIN CANON: the vault code is 4417.",
      dynamic: 'He smiles. <lie character="Z" truth="he is the traitor"/> "Nothing," he says.',
      afterHistory: [{ position: "in_chat", depth: 0, role: "system", content: "steer" }],
      sendHistory: true,
      trace: {},
    };

    /** Seed one room with a snapshot-bearing assistant variant; returns the room + that variant's id. */
    async function seedWiredRoom(key: string, host: UserId): Promise<{ chatId: ChatId; variantId: string }> {
      const chatId = await seedRoom(key, host);
      const m = await seedMessage(db, chatId, 1, { role: "assistant", content: "He shrugs." });
      // The engine writes a full `AssembledPrompt` here; the read PROJECTS it through `sentPromptSchema`, so
      // only the projected fields are under test (`trace` is dropped by design — asserted below).
      const blob = Snapshot as never; // An AssembledPrompt stand-in; the read projects it.
      await db
        .update(messageVariants)
        .set({ promptSnapshot: blob, params: { temperature: 0.7 } })
        .where(eq(messageVariants.id, castId(m.variantId)));
      return { chatId, variantId: m.variantId };
    }

    test("the HOST reads the sent prompt + params; the projection drops `trace` and never surfaces a raw blob", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const { chatId, variantId } = await seedWiredRoom("wire_host", host);

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const wire = await getVariantWire({ principal: principal(host), chatId, variantId: castId(variantId) });

      expect(wire.variantId).toBe(variantId);
      // The host IS entitled to the hidden plane (§3.6 "the host reads their own payload UNSTRIPPED") and to
      // the whole canon (F2 — a host is never history-floor clamped), so these bytes are correct HERE.
      expect(wire.prompt?.dynamic).toContain("traitor");
      expect(wire.prompt?.static).toContain("4417");
      expect(wire.prompt?.afterHistory).toHaveLength(1);
      expect(wire.params?.temperature).toBe(0.7);
      // `trace` is deliberately NOT re-served (the Preview tab renders a live one) — the projection is the
      // payload floor, so a widened `AssembledPrompt` can never silently grow this host-only read.
      expect(Object.keys(wire.prompt ?? {}).sort()).toEqual(["afterHistory", "dynamic", "sendHistory", "static"]);
    });

    test("a present non-host MEMBER is refused (not_host) — the stored prompt is never loaded", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const member = await seedUser(db, castId<Handle>("member"));
      const { chatId, variantId } = await seedWiredRoom("wire_member", host);
      await seedParticipant(db, { chatId, key: "wire_member_m", userId: member, role: "member" });

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const err = await getVariantWire({ principal: principal(member), chatId, variantId: castId(variantId) }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ChatOperationError);
      expect((err as ChatOperationError).code).toBe("not_host");
      // The refusal carries no prompt bytes (an error message that echoed the blob would be the leak itself).
      expect((err as Error).message).not.toContain("traitor");
    });

    test("a NON-MEMBER stranger gets the leak-free NOT_FOUND (never learns the room or the variant exists)", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const stranger = await seedUser(db, castId<Handle>("stranger"));
      const { chatId, variantId } = await seedWiredRoom("wire_stranger", host);

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const err = await getVariantWire({ principal: principal(stranger), chatId, variantId: castId(variantId) }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ChatNotFoundError);
    });

    // THE CROSS-CHAT BELT the stranger sweep structurally cannot reach: the caller is a LEGITIMATE host, so
    // `requireHost` passes — the only thing standing between them and another room's assembled prompt is the
    // query's `messages.chatId` join. A dropped join here is a silent IDOR over every stored prompt in the db.
    test("a legitimate HOST passing ANOTHER room's real variantId gets NOT_FOUND (the messages.chatId join is the belt)", async () => {
      const hostA = await seedUser(db, castId<Handle>("hostA"));
      const hostB = await seedUser(db, castId<Handle>("hostB"));
      const mine = await seedWiredRoom("wire_mine", hostA);
      const theirs = await seedWiredRoom("wire_theirs", hostB);

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      // A hosts `mine` legitimately, and aims the variantId at B's room.
      const err = await getVariantWire({ principal: principal(hostA), chatId: mine.chatId, variantId: castId(theirs.variantId) }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ChatNotFoundError);
      // The refusal is byte-identical to an UNKNOWN id — never "wrong chat", which would confirm it exists.
      const unknown = await getVariantWire({ principal: principal(hostA), chatId: mine.chatId, variantId: castId("variant_nope") }).catch((e: unknown) => e);
      expect((unknown as Error).message).toBe((err as Error).message);
    });

    test("a variant that captured nothing reads as an honest null prompt, never an error", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const chatId = await seedRoom("wire_empty", host);
      // A user row: authored, never generated — no snapshot was ever stamped.
      const m = await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const wire = await getVariantWire({ principal: principal(host), chatId, variantId: castId(m.variantId) });

      expect(wire.prompt).toBeNull();
      expect(wire.params).toBeNull();
      expect(wire.macroDraws).toBeNull();
      // D129-F: a body no persist-time transform touched carries no provenance either (the NULL convention).
      expect(wire.rawContent).toBeNull();
      expect(wire.macroFreezes).toBeNull();
    });

    // D129-F: the freeze provenance is HOST-PLANE and THIS view is its only reader — the refusal arms above
    // (member → not_host, stranger → NOT_FOUND, cross-chat → NOT_FOUND) are therefore the whole gate for it.
    test("the HOST reads the freeze provenance — the pre-transform raw + the record of what the commit baked", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const chatId = await seedRoom("wire_freeze", host);
      const m = await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "I roll 17" });
      await db
        .update(messageVariants)
        .set({ rawContent: 'I roll {{roll::d20}} <lie truth="pre-strip bytes"/>', macroFreezes: [{ name: "roll", args: "d20", value: "17" }] })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const wire = await getVariantWire({ principal: principal(host), chatId, variantId: castId(m.variantId) });

      expect(wire.rawContent).toBe('I roll {{roll::d20}} <lie truth="pre-strip bytes"/>');
      expect(wire.macroFreezes).toEqual([{ name: "roll", args: "d20", value: "17" }]);
    });

    test("a MALFORMED freeze record degrades to null at the read seam (the macroDraws/variableDelta discipline)", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const chatId = await seedRoom("wire_bad_freeze", host);
      const m = await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "x" });
      // @orb-waive no-test-fabrication(never): deliberate invalid-input probe of the parse seam. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const garbage = { roll: 9 } as never;
      await db
        .update(messageVariants)
        .set({ macroFreezes: garbage })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const wire = await getVariantWire({ principal: principal(host), chatId, variantId: castId(m.variantId) });

      expect(wire.macroFreezes).toBeNull();
    });

    test("a MALFORMED snapshot blob degrades to null at the read seam (never a throw, never a raw cast)", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      const chatId = await seedRoom("wire_bad", host);
      const m = await seedMessage(db, chatId, 1, { role: "assistant", content: "x" });
      // A garbage blob is exactly what the read seam exists to bound: `$type<>` is a compile-time claim, and
      // the bytes at rest are untyped JSON that a prior schema version (or a hand edit) can have written.
      // @orb-waive no-test-fabrication(never): deliberate invalid-input probe of the parse seam. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const garbage = { static: 42 } as never;
      await db
        .update(messageVariants)
        .set({ promptSnapshot: garbage })
        .where(eq(messageVariants.id, castId(m.variantId)));

      const { getVariantWire } = createRead(makeChatContext(db), makeDeps());
      const wire = await getVariantWire({ principal: principal(host), chatId, variantId: castId(m.variantId) });

      expect(wire.prompt).toBeNull();
    });
  });
});

describe("read — resumable stream ring", () => {
  test("replayStreamEvents resumes after a cursor; streamEventBounds reports min/max", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    await seedStreamEvent(db, chatId, 1, "a");
    await seedStreamEvent(db, chatId, 2, "b");
    await seedStreamEvent(db, chatId, 3, "c");

    const { replayStreamEvents, streamEventBounds } = createRead(makeChatContext(db), makeDeps());
    const tail = await replayStreamEvents({ principal: principal(me), chatId, afterSeq: 1 });
    expect(tail.map((e) => e.delta)).toEqual(["b", "c"]);
    const bounds = await streamEventBounds({ principal: principal(me), chatId });
    expect(bounds).toEqual({ minSeq: 1, maxSeq: 3 });
  });
});

describe("read — default-deny (membership chokepoint)", () => {
  test("a non-participant gets a leak-free NOT_FOUND on every chatId read", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const chatId = await seedRoom("room", me);
    const { messageId } = await seedMessage(db, chatId, 1);

    const read = createRead(makeChatContext(db), makeDeps());
    const p = principal(stranger);
    await expect(read.getChat({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listMessages({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listMessageVariants({ principal: p, chatId, messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listParticipants({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.peekPrompt({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.streamEventBounds({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    // A non-member of the parent cannot list its forks either.
    await expect(read.listForks({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("read — durable chat-bus log (the chat room SSE resume)", () => {
  test("replayChatEvents resumes after a cursor; chatEventBounds reports min/max; both member-gated", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const chatId = await seedRoom("room", me);
    // Emit through the REAL domain bus (durable-first) — the replay reads what emit wrote.
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({ type: "chatUpdated", chatId });
    await bus.emit({ type: "chatCreated", chatId });
    await bus.emit({ type: "chatUpdated", chatId });

    const { replayChatEvents, chatEventBounds } = createRead(ctx, makeDeps());

    const tail = await replayChatEvents({ principal: principal(me), chatId, afterSeq: 1 });
    expect(tail.map((e) => e.seq)).toEqual([2, 3]);
    expect(tail.map((e) => e.event.type)).toEqual(["chatCreated", "chatUpdated"]);

    // The attach probe carries the caller's own D16 floor alongside the window (the SSE live loop clamps on
    // it) — `me` is the born-here host, so it is the unclamped 0.
    const bounds = await chatEventBounds({ principal: principal(me), chatId });
    // `reasoningHostOnly` is false — the host reads verbatim, and a plain chat is never deception-active.
    expect(bounds).toEqual({ minSeq: 1, maxSeq: 3, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false });

    // The membership chokepoint: a stranger's read collapses to a leak-free NOT_FOUND.
    await expect(replayChatEvents({ principal: principal(stranger), chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(chatEventBounds({ principal: principal(stranger), chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  // The FIRST-TURN-RACE server pin (#1): the client seeds `lastEventId:"0"` for a just-created chat so
  // the server replays the head deltas that raced past the fresh SSE attach. This proves the exact path
  // that silently re-breaks — a fresh chat's DELTA events, written through the REAL durable-first bus,
  // are returned by `replayChatEvents({afterSeq:0})` in seq order with their nested payload intact. The
  // sibling events.int.test only round-trips flat `chatUpdated`/`chatCreated`; nothing else exercises a
  // real-bus-emitted `delta` (the token-carrying member) through the member-gated replay verb.
  test("a replay from afterSeq 0 returns a fresh chat's head deltas in order, payload intact (the #1 first-turn-race pin)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const chatId = await seedRoom("room", me);
    // Emit the HEAD of a turn through the REAL domain bus (durable-first: the chat_events INSERT commits
    // before the ring push) — turnStarted + two text deltas, exactly the shape that races the attach.
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({
      type: "turnStarted",
      chatId,
      intent: "send",
      api: "chat-completions",
      provider: castId<ProviderId>("custom-openai"),
      model: "test-model",
      speakerCharacterId: null,
      targetMessageId: null,
    });
    // The fresh room's first reply lands at `messages.seq` 1, so that is the slot these tokens fill.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "Hello " } });
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "world" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    // afterSeq:0 == the client's `lastEventId:"0"` seed — replay the whole durable log from baseline.
    const replayed = await replayChatEvents({ principal: principal(me), chatId, afterSeq: 0 });

    expect(replayed.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(replayed.map((e) => e.event.type)).toEqual(["turnStarted", "delta", "delta"]);
    // The token-carrying payload survives the JSON round-trip through the durable column, byte-for-byte —
    // including the `slotSeq` clamp anchor (a lost anchor would silently re-blind every clamped member) and
    // the §3.6 `memberText` stamp (`null` = "identical to `delta.text`", this caller being the HOST anyway).
    expect(replayed.slice(1).map((e) => (e.event.type === "delta" ? e.event : null))).toEqual([
      { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "Hello " }, memberText: null },
      { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "world" }, memberText: null },
    ]);
  });
});

describe("previewContextFit — present-tense fit budget (engine-stamp parity)", () => {
  // A real capability with a MID window so the fit trims SOME rows but keeps id-bearing ones (mirrors the
  // pipeline test's boundary anchor). previewFit must reproduce the SAME boundary the engine stamps: the
  // earliest-KEPT id-bearing row. The blown-budget shape (real transcript ending on assistant → id-less
  // continuation nudge appended, window smaller than reserve+system) gets its own test below — the fit's
  // irreducible tail anchors on the newest ID-BEARING turn, so the boundary is nameable even there (the
  // original null-boundary "dodge" here was the bug the live cutoff spec caught, 2026-07-24).
  const midCapability = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 400 } });

  function makeFitDeps(capability: GenerationCapability): Parameters<typeof createRead>[1] {
    return {
      loadParticipantViews,
      resolveConnection: () => Promise.resolve(makeResolved({ generation: capability })),
      checkSendAvailability: () => Promise.resolve({ available: true }),
      resolveForeignInputs: () =>
        Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: null, active: null },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    };
  }

  test("reproduces the engine's stamped boundary (earliest kept id) + honest budget numbers", async () => {
    const host = await seedUser(db, castId<Handle>("fit_host"));
    const chatId = await seedRoom("fit", host);
    // 11 alternating id-bearing turns ending on a USER row (odd count) so no continuation nudge is appended.
    // The seq is explicit per row, so insertion order is irrelevant (Promise.all avoids the await-in-loop gate).
    await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        seedMessage(db, chatId, i + 1, {
          role: (i + 1) % 2 === 1 ? "user" : "assistant",
          content: `turn ${i + 1} with several words to spend a few tokens`,
        }),
      ),
    );

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(midCapability));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // The fit trimmed SOME rows (0 < droppedCount < 11 → real rows survive), the boundary is the earliest
    // KEPT message id (message_<chatId>_<seq> for seq = droppedCount + 1 — the seeded 1-indexed scheme), and
    // the budget numbers are honest (not stubbed zeros).
    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.droppedCount).toBeLessThan(11);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_${fit.droppedCount + 1}`));
    expect(fit.ceilingTokens).toBe(400); // min(window, ∞) — no soft cap set
    expect(fit.reserveOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS); // no preset maxOutputTokens ⇒ the default reserve
    expect(fit.usedTokens).toBeGreaterThan(0);
  });

  // The live-context-cutoff catch (2026-07-24): an EVEN turn count ends the transcript on assistant, so
  // SHAPE appends the id-less continuation nudge as the newest row; a window smaller than reserve+system
  // makes the prompt budget negative. The old newest-ROW irreducible keep retained only the nudge —
  // droppedCount > 0 with boundaryMessageId null, an unrenderable divider. The irreducible TAIL (newest
  // id-bearing turn + trailing synthetics) keeps the newest real row and names it.
  test("a blown budget (tiny window, nudge tail) still names the newest real row as the boundary", async () => {
    const host = await seedUser(db, castId<Handle>("fit_host3"));
    const chatId = await seedRoom("fit3", host);
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    const tiny = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 200 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // Everything older than the newest real row drops (5 canon rows; the nudge rides irreducibly and is
    // uncounted as a drop), and the boundary NAMES the survivor — the newest seeded row.
    expect(fit.droppedCount).toBe(5);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_6`));
    expect(fit.ceilingTokens).toBe(200);
  });

  test("everything fits under a wide window ⇒ null boundary, zero dropped", async () => {
    const host = await seedUser(db, castId<Handle>("fit_host2"));
    const chatId = await seedRoom("fit2", host);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `short turn ${i + 1}` })),
    );
    const wide = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 1_000_000 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(wide));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBeNull();
    expect(fit.ceilingTokens).toBe(1_000_000);
  });

  // COMPACTION-COVERED shrinkage (#9 verifier fix): a chat with a marker covering through seq N excludes seq
  // ≤ N from the shaped history, so previewFit's boundary is TRUE (> N) on BOTH the wide-window (no fit trim)
  // and the tiny-window (fit trims further) paths, and the memory fact is exposed.
  const stampMarker = (chatId: Awaited<ReturnType<typeof seedRoom>>, coveredThroughSeq: number): Promise<unknown> =>
    db.update(chatsTable).set({ compactSummary: "the story so far", compactedAtSeq: coveredThroughSeq }).where(eq(chatsTable.id, chatId));

  test("a marker covering seq 2 ⇒ wide window keeps NOTHING dropped but the boundary is the first row above coverage (seq 3) + summary exposed", async () => {
    const host = await seedUser(db, castId<Handle>("fit_cov"));
    const chatId = await seedRoom("fitcov", host);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `short turn ${i + 1}` })),
    );
    await stampMarker(chatId, 2);
    const wide = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 1_000_000 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(wide));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // Covered rows (seq 1-2) fell out of the shaped history, so the fit dropped nothing MORE; the boundary is
    // the first row STILL in the prompt above the coverage point (seq 3), and the marker is exposed.
    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_3`));
    expect(fit.compactSummary).toBe("the story so far");
  });

  test("a marker covering seq 2 + a tiny window ⇒ the fit trims the post-marker window FURTHER; boundary > coverage, summary still exposed", async () => {
    const host = await seedUser(db, castId<Handle>("fit_cov2"));
    const chatId = await seedRoom("fitcov2", host);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    await stampMarker(chatId, 2);
    const tiny = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 260 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // The shaped input already excludes seq 1-2; the tiny window then trims some of the post-marker rows. The
    // boundary NAMES a survivor with seq > 2 (never a covered row), and the marker covers everything above it.
    expect(fit.boundaryMessageId).not.toBeNull();
    const boundarySeq = Number((fit.boundaryMessageId ?? "").toString().split("_").at(-1));
    expect(boundarySeq).toBeGreaterThan(2);
    expect(fit.compactSummary).toBe("the story so far");
  });

  test("no marker ⇒ compactSummary is null even with dropped rows (a plain fit boundary, no memory fact)", async () => {
    const host = await seedUser(db, castId<Handle>("fit_nocov"));
    const chatId = await seedRoom("fitnocov", host);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    const tiny = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 260 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.compactSummary).toBeNull();
  });

  // ── #1540 — the preview fits the CONVERTED rows, exactly as the turn's fitter does (#1434) ────────────
  //
  // The turn pipeline runs CONVERT → FIT: the wire conversion collapses a stored `:::card` body to
  // `[card: Title]` and DROPS a `:::choices` block entirely, and the fitter prices what is left. The preview
  // used to fit the RAW shaped rows, so on a card-heavy or choices-heavy chat it charged the budget for
  // multi-KB bodies the provider never receives — reporting rows as out of context that the very next turn
  // keeps, and drawing the transcript divider above them. Both arms below FIT UNDER THE WIRE COST and blow
  // the window under the raw one, so each fails on the pre-fix read and passes on the converted one.
  const wideEnoughForStubs = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 6000 } });

  /** A `ctx.rpg` that contributes ONLY the M2 wire knob — a game chat whose `cardKeepLastX: 0` stubs every
   *  STORED card on the wire (rpg's own shipped default). */
  function cardWindowRpg(cardKeepLastX: number): NonNullable<ChatContext["rpg"]> {
    // @orb-waive no-test-fabrication(unknown): the preview path reaches exactly these three rpg ops (`resolvePresetOverride`, Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // `resolveUserMacros`, `gatherTurnContext`); a full ChatRpgOps double would assert ~20 ops no preview calls.
    return {
      resolvePresetOverride: () => Promise.resolve(null),
      resolveUserMacros: () => Promise.resolve([]),
      gatherTurnContext: () => Promise.resolve({ macros: {}, injections: [], tools: [], cardKeepLastX }),
    } as unknown as NonNullable<ChatContext["rpg"]>;
  }

  /** One stored card whose BODY is ~2000 estimated tokens — three of them blow a 6000-token window, while
   *  their `[card: cN]` stubs cost a handful. The body is the shape the wire seam actually sees: a closed
   *  `:::card` fence over an html blob (what an immersive-html game persists). */
  const bigCard = (n: number): string => `:::card title="c${n}"\n<div>${"blob ".repeat(1600)}</div>\n:::`;

  test("a CARD-HEAVY chat: the preview prices the wire STUBS the turn sends, not the stored bodies (#1540)", async () => {
    const host = await seedUser(db, castId<Handle>("fit_cards"));
    const chatId = await seedRoom("fitcards", host);
    // 7 alternating turns (odd ⇒ ends on USER, so SHAPE appends no continuation nudge). The oldest three
    // carry the big stored cards; the rest are ordinary prose.
    await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const seq = i + 1;
        return seedMessage(db, chatId, seq, {
          role: seq % 2 === 1 ? "user" : "assistant",
          content: seq <= 3 ? bigCard(seq) : `turn ${seq} with several words to spend a few tokens`,
        });
      }),
    );

    const ctx = makeChatContext(db, { rpg: cardWindowRpg(0) });
    const { previewContextFit } = createRead(ctx, makeFitDeps(wideEnoughForStubs));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // Every card collapses to `[card: cN]` before the fit prices it, so the whole transcript fits: nothing
    // is dropped and the divider has no line to draw. Pre-fix the three raw bodies (~6000 tokens) blew the
    // ~3900-token prompt budget and the boundary named a row the next turn keeps.
    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBeNull();
    // …and the NUMBER is the wire's, not the transcript's: seven stub/prose rows cost ~100 tokens, never the
    // ~6000 the stored bodies weigh. (A range, because the estimator is advisory by contract.)
    expect(fit.usedTokens).toBeLessThan(400);
  });

  test("a CHOICES-HEAVY chat: the CYOA blocks are dropped from the wire, so the preview never charges for them (#1540)", async () => {
    const host = await seedUser(db, castId<Handle>("fit_choices"));
    const chatId = await seedRoom("fitchoices", host);
    // A `:::choices` block is `wire:"drop"` — unselected options must not re-pile into context — so its
    // bytes reach the transcript and never the model. No rpg game is needed: the drop is unconditional.
    const bigChoices = (n: number): string =>
      `:::choices\n${Array.from({ length: 40 }, (_, k) => `${k + 1}. option ${k} of turn ${n} spelled out at length so the block is expensive`).join("\n")}\n:::`;
    await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const seq = i + 1;
        return seedMessage(db, chatId, seq, {
          role: seq % 2 === 1 ? "user" : "assistant",
          content: seq <= 4 ? `here is what you can do\n${bigChoices(seq)}` : `turn ${seq} with several words to spend a few tokens`,
        });
      }),
    );

    const tight = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 2800 } });
    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tight));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBeNull();
    expect(fit.usedTokens).toBeLessThan(400);
  });

  // A FENCE, NOT A DEFECT PROOF — it passes on the pre-fix read too (which priced every card raw, so a card
  // riding FULL was the one case the old code got right by accident). It is here to stop the fix from
  // over-correcting into "always stub": the conversion must track `cardKeepLastX`, and a card inside the
  // window costs its real bytes on the wire and therefore in the preview.
  test("FENCE: the M2 window is honoured — a card inside keep-last-1 rides whole and costs its bytes (#1540)", async () => {
    const host = await seedUser(db, castId<Handle>("fit_cards_win"));
    const chatId = await seedRoom("fitcardswin", host);
    await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const seq = i + 1;
        return seedMessage(db, chatId, seq, {
          role: seq % 2 === 1 ? "user" : "assistant",
          content: seq <= 3 ? bigCard(seq) : `turn ${seq} with several words to spend a few tokens`,
        });
      }),
    );

    // The NEWEST stored card (seq 3) rides FULL under `cardKeepLastX: 1` — so the preview must charge for it,
    // which is the other half of the honesty claim: the fit tracks the window, it does not just always stub.
    const ctx = makeChatContext(db, { rpg: cardWindowRpg(1) });
    const { previewContextFit } = createRead(ctx, makeFitDeps(wideEnoughForStubs));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.usedTokens).toBeGreaterThan(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// The §3.6 hidden-content MEMBER-STRIP (parity-plus) — a TRUST BOUNDARY, pinned at the PAYLOAD level: the
// instrument is the server-side strip at the read/replay projections; the CONSEQUENCE asserted is that a
// member's serialized payload contains ZERO truth bytes (a client-only hide leaks in the wire). The model's
// wire is untouched (pipeline pins own {wire: full}); the host reads unstripped (the P3 reveal eye's plane).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — the §3.6 hidden-content member-strip", () => {
  const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';

  test("listMessages: a MEMBER's payload carries ZERO hidden bytes; the HOST reads the full stored body", async () => {
    const host = await seedUser(db, castId<Handle>("ms_host"));
    const member = await seedUser(db, castId<Handle>("ms_member"));
    const chatId = await seedRoom("ms", host);
    await seedParticipant(db, { chatId, key: "ms_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: `He nods. ${lieTag} "Nothing," he says.` });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());

    const memberPage = await listMessages({ principal: principal(member), chatId });
    const memberPayload = JSON.stringify(memberPage);
    expect(memberPayload).not.toContain("crypt");
    expect(memberPayload).not.toContain("<lie");
    expect(memberPage.messages[0]?.content).toBe('He nods.  "Nothing," he says.');

    const hostPage = await listMessages({ principal: principal(host), chatId });
    expect(hostPage.messages[0]?.content).toBe(`He nods. ${lieTag} "Nothing," he says.`);
  });

  test("listMessages: a lie inside a CLOSED :::card fence is stripped for a MEMBER too — fence context hides nothing (2026-08-14)", async () => {
    // THE HOLE THIS PINS: the tokenizer is strict, so a closed fence swallowed its whole body into one card
    // span's `raw` and the strip re-emitted it verbatim. A card body renders as HTML, so the member's SCREEN
    // showed nothing while their PAYLOAD carried the GM's truth — and the mid-stream scrubber (fence-blind)
    // had already shown them a clean live view, so the leak appeared only on reload. Pinned at the payload
    // level (`JSON.stringify`), at the read a member's transcript is actually built from.
    const host = await seedUser(db, castId<Handle>("mc_host"));
    const member = await seedUser(db, castId<Handle>("mc_member"));
    const chatId = await seedRoom("mc", host);
    await seedParticipant(db, { chatId, key: "mc_m", userId: member, role: "member" });
    const stored = `The ledger reads clean.\n:::card title="Ledger"\n<p>All accounted for.</p>\n${lieTag}\n:::\nHe closes it.`;
    await seedMessage(db, chatId, 1, { role: "assistant", content: stored });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());

    const memberPage = await listMessages({ principal: principal(member), chatId });
    const memberPayload = JSON.stringify(memberPage);
    expect(memberPayload).not.toContain("crypt");
    expect(memberPayload).not.toContain("<lie");
    // The card itself SURVIVES for the member — only the hidden tag's bytes leave (a projection, not a cut).
    expect(memberPage.messages[0]?.content).toBe(stored.replace(lieTag, ""));

    // THE DUAL: the host's stored body is byte-identical — hosts read their own lies, in cards included.
    const hostPage = await listMessages({ principal: principal(host), chatId });
    expect(hostPage.messages[0]?.content).toBe(stored);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // THE DURABLE REASONING CHANNEL (§3.6 P3). The pre-existing pins covered the LIVE/replay halves (deltas +
  // `reasoningStreamDone`); this block pins the DURABLE one — `message_variants.reasoning`, the column every
  // completed turn persists and `MessageView.reasoning` serves, which the transcript now RENDERS as an
  // expandable block on a settled row. That render makes the field user-visible rather than devtools-only, so
  // `listMessages` — the read a member's transcript is built from — must drop it for a member of a
  // deception-active game, and must follow the ROLE, not the row: the verdict is re-derived per read
  // (`membership.role === "host" ? false : resolveReasoningHostOnly(...)`), so a host handoff moves the
  // channel with the seat on the very next read.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** The GM-plane spill a deceptive model puts in its thinking trace — the bytes a member must never receive. */
  const reasoningSpill = "I'll deflect: say the study, but he is really in the crypt.";
  /** Deception-active: the injected op returns true for every chat. read.ts calls ONLY this member of
   *  `ChatRpgOps` on the non-host read path. */
  function deceptionCtx(): ChatContext {
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — only `resolveReasoningHostOnly` is reached by these reads. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = { resolveReasoningHostOnly: () => Promise.resolve(true) } as unknown as NonNullable<ChatContext["rpg"]>;
    return makeChatContext(db, { rpg });
  }

  test("listMessages (deception game): a MEMBER's payload carries ZERO durable reasoning bytes; the HOST reads the trace", async () => {
    const host = await seedUser(db, castId<Handle>("dr_host"));
    const member = await seedUser(db, castId<Handle>("dr_member"));
    const chatId = await seedRoom("dr", host);
    await seedParticipant(db, { chatId, key: "dr_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "He shrugs.", reasoning: reasoningSpill });

    const { listMessages } = createRead(deceptionCtx(), makeDeps());

    const memberPage = await listMessages({ principal: principal(member), chatId });
    // The whole serialized payload, not just the field — a devtools-open member must find no truth bytes.
    expect(JSON.stringify(memberPage)).not.toContain("crypt");
    expect(memberPage.messages[0]?.reasoning).toBeNull();
    // The body is untouched — the reasoning cut is whole-channel, never a body edit.
    expect(memberPage.messages[0]?.content).toBe("He shrugs.");

    const hostPage = await listMessages({ principal: principal(host), chatId });
    expect(hostPage.messages[0]?.reasoning).toBe(reasoningSpill);
  });

  test("listMessages (deception game): a host HANDOFF moves the channel — the PROMOTED member gains the reasoning on the next read, the DEMOTED host loses it", async () => {
    const founder = await seedUser(db, castId<Handle>("dh_founder"));
    const successor = await seedUser(db, castId<Handle>("dh_successor"));
    const chatId = await seedRoom("dh", founder);
    await seedParticipant(db, { chatId, key: "dh_s", userId: successor, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "He shrugs.", reasoning: reasoningSpill });

    const { listMessages } = createRead(deceptionCtx(), makeDeps());

    expect((await listMessages({ principal: principal(founder), chatId })).messages[0]?.reasoning).toBe(reasoningSpill);
    expect((await listMessages({ principal: principal(successor), chatId })).messages[0]?.reasoning).toBeNull();

    // The handoff: the founder drops to member, the successor takes the host seat — DEMOTE BEFORE PROMOTE,
    // the order `acceptHostHandoffSwapStatements` writes, because one present host per chat is a partial
    // UNIQUE index (the reverse order collides). No re-seeding, no cache to bust — the SAME verbs are
    // called again.
    await db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, founder)));
    await db
      .update(chatParticipants)
      .set({ role: "host" })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, successor)));

    expect((await listMessages({ principal: principal(successor), chatId })).messages[0]?.reasoning).toBe(reasoningSpill);
    const demoted = await listMessages({ principal: principal(founder), chatId });
    expect(demoted.messages[0]?.reasoning).toBeNull();
    expect(JSON.stringify(demoted)).not.toContain("crypt");
  });

  test("listMessages (NO deception): a member KEEPS the durable reasoning channel — the P3 cut is game-conditional, not a blanket withhold", async () => {
    const host = await seedUser(db, castId<Handle>("nd_host"));
    const member = await seedUser(db, castId<Handle>("nd_member"));
    const chatId = await seedRoom("nd", host);
    await seedParticipant(db, { chatId, key: "nd_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "He shrugs.", reasoning: "weighing two openings" });

    // The default harness ctx wires NO rpg op ⇒ `resolveReasoningHostOnly` resolves false (a plain chat).
    const { listMessages } = createRead(makeChatContext(db), makeDeps());

    expect((await listMessages({ principal: principal(member), chatId })).messages[0]?.reasoning).toBe("weighing two openings");
  });

  test("replayChatEvents: a replayed view payload is stripped for a MEMBER, full for the HOST; chatEventBounds resolves viewerIsHost", async () => {
    const host = await seedUser(db, castId<Handle>("mr_host"));
    const member = await seedUser(db, castId<Handle>("mr_member"));
    const chatId = await seedRoom("mr", host);
    await seedParticipant(db, { chatId, key: "mr_m", userId: member, role: "member" });
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", content: `prose ${lieTag}` });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const view = await loadMessageView(db, messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId, ...(view === undefined ? {} : { view }) });

    const { replayChatEvents, chatEventBounds } = createRead(ctx, makeDeps());

    const memberReplay = await replayChatEvents({ principal: principal(member), chatId, afterSeq: 0 });
    expect(memberReplay).toHaveLength(1);
    expect(JSON.stringify(memberReplay)).not.toContain("crypt");
    expect(JSON.stringify(memberReplay)).not.toContain("<lie");

    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    expect(JSON.stringify(hostReplay)).toContain("crypt");

    // The LIVE half's verdict input: the same member-gated probe hands the transport `viewerIsHost`.
    expect((await chatEventBounds({ principal: principal(host), chatId })).viewerIsHost).toBe(true);
    expect((await chatEventBounds({ principal: principal(member), chatId })).viewerIsHost).toBe(false);
  });

  // The DURABLE-replay DELTA leak (found by the e2e reasoning-strip proof): a resume from afterSeq:0 re-drains
  // the raw mid-turn `delta` rows, so `replayChatEvents` must scrub them per-slot exactly like the LIVE
  // transport — otherwise a member's reconnect leaks the model's hidden `<lie>` TEXT bytes AND, on a
  // deception-active game, the whole reasoning channel the live stream withheld. Deception-active is injected
  // via the `rpg.resolveReasoningHostOnly` op (the ONE seam chat reads the verdict from).
  test("replayChatEvents (deception game): a MEMBER's durable resume withholds reasoning DELTAS + scrubs hidden TEXT deltas; the HOST gets both", async () => {
    const host = await seedUser(db, castId<Handle>("drd_host"));
    const member = await seedUser(db, castId<Handle>("drd_member"));
    const chatId = await seedRoom("drd", host);
    await seedParticipant(db, { chatId, key: "drd_m", userId: member, role: "member" });
    // A committed reply slot at seq 1 (the deltas below stream INTO it — slotSeq 1).
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", content: `He nods. ${lieTag}` });

    // Deception-active: the injected op returns true for this chat (the game's `deception||omniscience`). A
    // minimal ChatRpgOps stub — read.ts calls ONLY `resolveReasoningHostOnly` on the non-host replay path.
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — only `resolveReasoningHostOnly` is reached by these reads. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const deceptionRpg = { resolveReasoningHostOnly: () => Promise.resolve(true) } as unknown as NonNullable<ChatContext["rpg"]>;
    const ctx = makeChatContext(db, { rpg: deceptionRpg });
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const view = await loadMessageView(db, messageId);
    // The exact durable log a member's reconnect re-drains: a reasoning delta (spells the truth), the hidden
    // `<lie>` TEXT delta, the reasoningStreamDone signal, then the at-commit committed view.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "reasoning", text: "I'll deflect, but he is in the crypt." } });
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: `He nods. ${lieTag}` } });
    await bus.emit({ type: "reasoningStreamDone", chatId });
    await bus.emit({ type: "messageCommitted", chatId, messageId, ...(view === undefined ? {} : { view }) });

    const { replayChatEvents } = createRead(ctx, makeDeps());

    const memberReplay = await replayChatEvents({ principal: principal(member), chatId, afterSeq: 0 });
    const memberBytes = JSON.stringify(memberReplay);
    // Zero truth bytes anywhere — reasoning delta withheld, text delta scrubbed, committed view stripped.
    expect(memberBytes).not.toContain("crypt");
    expect(memberBytes).not.toContain("<lie");
    // No reasoning-channel delta and no `reasoningStreamDone` reach the member on a deception game.
    expect(memberReplay.some((e) => e.event.type === "delta" && e.event.delta.kind === "reasoning")).toBe(false);
    expect(memberReplay.some((e) => e.event.type === "reasoningStreamDone")).toBe(false);

    // The host gets the whole log verbatim — the reasoning delta + the raw `<lie>` + reasoningStreamDone.
    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    const hostBytes = JSON.stringify(hostReplay);
    expect(hostBytes).toContain("crypt");
    expect(hostReplay.some((e) => e.event.type === "delta" && e.event.delta.kind === "reasoning")).toBe(true);
    expect(hostReplay.some((e) => e.event.type === "reasoningStreamDone")).toBe(true);
  });

  // The MID-SPAN RESUME CURSOR. A `<lie …/>` open spans many ticks, and the cursor advances past it for
  // ordinary reasons: the chunk that opened it also carried deliverable prose, or a lifecycle event / another
  // slot's tokens landed in between. The replay then starts INSIDE the tag. When the scrub state was rebuilt
  // per-call, that fresh scrubber found no `<` in `1234"/> …`, called the whole tail safe, and handed the
  // member the secret's last bytes — while the SAME log read from seq 0 came back clean, which is why an
  // afterSeq:0 test could never see it. The bytes are now decided once at emit, so every cursor agrees.
  test("replayChatEvents: a resume cursor landing INSIDE an open <lie …/> still withholds the tail (no cold start)", async () => {
    const host = await seedUser(db, castId<Handle>("midspan_host"));
    const member = await seedUser(db, castId<Handle>("midspan_member"));
    const chatId = await seedRoom("midspan", host);
    await seedParticipant(db, { chatId, key: "midspan_m", userId: member, role: "member" });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const text = (t: string): Parameters<typeof bus.emit>[0] => ({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: t } });
    // ONE chunk carrying prose AND the opener (the ordinary provider chunking shape) — its safe prefix is
    // delivered, so the member's cursor sits at that row, mid-tag. Then the closer, then more prose.
    await bus.emit(text('The vault is <lie character="Vex" truth="the vault code is '));
    await bus.emit(text('1234"/> empty.'));
    await bus.emit(text(" Vex smiles."));

    const { replayChatEvents } = createRead(ctx, makeDeps());
    // Resume from EVERY cursor position, including the two that land inside the open span.
    const byCursor = await Promise.all([0, 1, 2, 3].map((afterSeq) => replayChatEvents({ principal: principal(member), chatId, afterSeq })));
    for (const replayed of byCursor) {
      const bytes = JSON.stringify(replayed);
      expect(bytes).not.toContain("1234");
      expect(bytes).not.toContain("vault code");
      expect(bytes).not.toContain("<lie");
      expect(bytes).not.toContain('"/>');
    }
    // …and the delivered prose is still whole: resuming at the cursor BEFORE the opener replays exactly the
    // stripped body, so the member's ghost reads correctly rather than merely safely.
    const fromStart = await replayChatEvents({ principal: principal(member), chatId, afterSeq: 0 });
    const assembled = fromStart.map((e) => (e.event.type === "delta" && e.event.delta.kind === "text" ? e.event.delta.text : "")).join("");
    expect(assembled).toBe("The vault is  empty. Vex smiles.");
    // The HOST reads the same log verbatim from a mid-span cursor — the strip is the MEMBER's, not a mangle.
    expect(JSON.stringify(await replayChatEvents({ principal: principal(host), chatId, afterSeq: 1 }))).toContain("1234");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D22 `getMemberCard` — the per-member VISIBILITY read. A present member may READ a roster character's card,
// but ONLY the fields at/below the room's host-set `memberCardVisibility`. The RISK this proves closed: a
// card's prompt-steering internals (systemPrompt/postHistory) or its lore leaking to a member below the level,
// and a non-participant (or a not-in-roster characterId) reading any card. Every assertion below checks the
// WIRE payload (fields ABSENT/null), not a client-side hide — the strip is server-side by construction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — getMemberCard (D22 member-card visibility)", () => {
  const cardChar = castId<CharacterId>("character_mc_card");

  /** A card whose text fields carry `{{user}}`/`{{char}}` macros — so a passing render proves the anchor +
   *  character bind (never literal braces on the wire), and the field values double as visibility sentinels. */
  const macroCard: CharacterCard = {
    name: "Seraphine",
    description: "{{char}} greets {{user}} warmly",
    personality: "curious",
    scenario: "{{user}} meets {{char}}",
    greetings: [{ text: "Hi {{user}}, I am {{char}}" }],
    exampleMessages: "{{char}}: hello {{user}}",
    systemPrompt: "SECRET: {{char}} manipulates {{user}}",
    postHistoryInstructions: "SECRET-JB: stay in character as {{char}}",
    depthPrompt: { depth: 4, prompt: "note" },
    creatorNotes: "made by alex",
    creator: "alex",
    cardVersion: "1.0",
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };

  const anchorPersona: AssemblePersona = { name: "Alex", description: "the anchor persona" };

  /** A ChatContext wired for the member-card read: the card via `getCard` (keyed to `cardChar`), the tags via
   *  `resolveCharacterTags`, the avatar hash via `resolveAssetHash`. Everything else is the harness default.
   *  `card` overrides the served card (the clamp-bypass tests inject a card with a full-only macro in a
   *  surviving sheet-tier field). */
  function makeCardCtx(overrides: { tags?: string[]; avatarHash?: string | null; card?: CharacterCard } = {}): ChatContext {
    const served = overrides.card ?? macroCard;
    return makeChatContext(db, {
      getCard: ({ characterId }) => Promise.resolve(characterId === cardChar ? served : null),
      resolveCharacterTags: () => Promise.resolve(overrides.tags ?? ["fantasy", "rogue"]),
      resolveAssetHash: () => Promise.resolve(overrides.avatarHash ?? null),
    });
  }

  /** The anchor-persona render deps: `resolveForeignInputs` returns the anchorPersona as `personas.anchor` — the same
   *  DTO the composition root produces, so the display render binds `{{user}}` to it exactly as the assemble does. */
  function makeCardDeps(): Parameters<typeof createRead>[1] {
    return {
      loadParticipantViews,
      // getMemberCard never resolves a connection (a card DISPLAY is not a turn) — a real factory keeps the
      // dep type-honest without the double-cast the `no-test-fabrication` gate forbids.
      resolveConnection: () => Promise.resolve(makeResolved()),
      checkSendAvailability: () => Promise.resolve({ available: true }),
      resolveForeignInputs: () =>
        Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: anchorPersona, active: anchorPersona },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    };
  }

  /** Seed a room whose group config sets `memberCardVisibility`, with a host + the card character seated +
   *  a plain member. Returns the ids. The card char's WI (`loadCharacterCardLore` source) is seeded separately. */
  async function seedCardRoom(key: string, visibility: MemberCardVisibility): Promise<{ host: UserId; member: UserId; chatId: ChatId }> {
    const host = await seedUser(db, castId<Handle>(`${key}_host`));
    const member = await seedUser(db, castId<Handle>(`${key}_member`));
    const chatId = await seedChat(db, key, { metadata: { group: { output: "per-speaker", policy: "natural", memberCardVisibility: visibility } } });
    await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: `${key}_m`, userId: member, role: "member" });
    await seedCharacter(db, host, "mc_card", { id: cardChar });
    await seedParticipant(db, { chatId, key: `${key}_c`, characterId: cardChar });
    return { host, member, chatId };
  }

  /** Seed a character-scope world-info book (owned by `owner`) + one enabled entry, linked to `characterId`. */
  async function seedCardLore(owner: UserId, key: string, content: string): Promise<void> {
    const bookId = castId<WorldBookId>(`world_book_${key}`);
    await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
    await db.insert(worldEntries).values({
      id: castId<WorldEntryId>(`world_entry_${key}`),
      worldBookId: bookId,
      title: key,
      content,
      keys: null,
      enabled: true,
      priority: 0,
      ignoreBudget: false,
      metadata: null,
      createdAt: FROZEN_AT,
    });
    await db.insert(characterBooks).values({ characterId: cardChar, worldBookId: bookId, role: "auxiliary", createdAt: FROZEN_AT });
  }

  test("a MEMBER at `sheet` sees name/description/personality/scenario but NOT systemPrompt/postHistory/lore (wire payload)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_sheet", "sheet");
    // The card HAS lore, but a `sheet` member is below `sheet+lore` — it must be clamped null regardless.
    await seedCardLore(host, "mc_sheet_lore", "hidden lore");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // sheet-tier fields present…
    expect(view.name).toBe("Seraphine");
    expect(view.description).not.toBeNull();
    expect(view.personality).toBe("curious");
    expect(view.scenario).not.toBeNull();
    // …the prompt-steering internals + lore are NULL, and the SECRET bytes never cross the wire.
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
    expect(view.lore).toBeNull();
    const bytes = JSON.stringify(view);
    expect(bytes).not.toContain("SECRET");
    expect(bytes).not.toContain("hidden lore");
  });

  test("a DISABLED member drops from getMemberCard's anchor-persona foreign-input consent set (#73 second-commit fix)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_disabled", "sheet");
    let presentHumanUserIds: readonly UserId[] = [];
    const ctx = makeChatContext(db, {
      getCard: ({ characterId }) => Promise.resolve(characterId === cardChar ? macroCard : null),
      resolveCharacterTags: () => Promise.resolve(["fantasy", "rogue"]),
      resolveAssetHash: () => Promise.resolve(null),
      resolveUserEnabled: (userId) => Promise.resolve(userId !== member),
    });
    const deps: Parameters<typeof createRead>[1] = {
      loadParticipantViews,
      resolveConnection: () => Promise.resolve(makeResolved()),
      checkSendAvailability: () => Promise.resolve({ available: true }),
      resolveForeignInputs: (args) => {
        presentHumanUserIds = args.presentHumanUserIds;
        return Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: anchorPersona, active: anchorPersona },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        });
      },
    };
    const { getMemberCard } = createRead(ctx, deps);

    await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(presentHumanUserIds).toContain(host);
    expect(presentHumanUserIds).not.toContain(member);
  });

  test("at `sheet+lore` the character's rendered lore appears; the prompt internals stay NULL", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_lore", "sheet+lore");
    // The lore book is the HOST's (the card owner) — the read is host-owner-scoped.
    await seedCardLore(host, "mc_lore_entry", "the ancient prophecy");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.lore).toEqual(["the ancient prophecy"]);
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
  });

  test("the HOST always sees `full` — systemPrompt/postHistory/lore all present even when the room is set to `sheet`", async () => {
    const { host, chatId } = await seedCardRoom("mc_host", "sheet");
    await seedCardLore(host, "mc_host_lore", "host-visible lore");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    expect(view.visibility).toBe("full");
    expect(view.systemPrompt).not.toBeNull();
    expect(view.postHistoryInstructions).not.toBeNull();
    expect(view.lore).toEqual(["host-visible lore"]);
  });

  test("surviving text fields RENDER display macros against the anchorPersona persona — no literal braces on the wire", async () => {
    const { host, chatId } = await seedCardRoom("mc_macro", "full");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    // Host = full, so every field survives and every field renders.
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    // `{{user}}` → anchor name (Alex), `{{char}}` → the card name (Seraphine); never literal braces.
    expect(view.scenario).toBe("Alex meets Seraphine");
    expect(view.description).toBe("Seraphine greets Alex warmly");
    expect(view.greetings).toEqual(["Hi Alex, I am Seraphine"]);
    expect(view.systemPrompt).toBe("SECRET: Seraphine manipulates Alex");
    expect(JSON.stringify(view)).not.toContain("{{");
  });

  test("a NON-PARTICIPANT gets a leak-free NOT_FOUND (no card bytes)", async () => {
    const { chatId } = await seedCardRoom("mc_stranger", "full");
    const stranger = await seedUser(db, castId<Handle>("mc_the_stranger"));

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const err = await getMemberCard({ principal: principal(stranger), chatId, characterId: cardChar }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    // The refusal carries no card content — it names the chat, not the character.
    expect(JSON.stringify((err as ChatNotFoundError).message)).not.toContain("Seraphine");
  });

  test("a characterId NOT in THIS chat's roster is NOT_FOUND (you cannot read an arbitrary card through your chat)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_foreign", "full");
    // A character the host owns but that is NOT seated in this chat.
    const foreignChar = await seedCharacter(db, host, "mc_foreign_char");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    // Even the host cannot read a not-in-roster card through this chat.
    await expect(getMemberCard({ principal: principal(host), chatId, characterId: foreignChar })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(getMemberCard({ principal: principal(member), chatId, characterId: foreignChar })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  test("at `name-avatar` even the sheet identity is withheld — only name/avatarHash/tags-null survive", async () => {
    const { member, chatId } = await seedCardRoom("mc_floor", "name-avatar");

    const { getMemberCard } = createRead(makeCardCtx({ avatarHash: "hash_seraphine" }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.name).toBe("Seraphine");
    expect(view.avatarHash).toBe("hash_seraphine");
    expect(view.description).toBeNull();
    expect(view.personality).toBeNull();
    expect(view.tags).toBeNull();
    expect(view.systemPrompt).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // THE CLAMP-BYPASS REGRESSION (security review 2026-07-28 — CONFIRMED HIGH, was untested). The bug: the
  // display-render context was built from the FULL card, so a SURVIVING sheet-tier field embedding a full-only
  // card macro (`{{charsysinfo}}` ← systemPrompt, `{{charposthistory}}` ← postHistoryInstructions) re-expanded
  // the exact bytes the clamp nulled. Exploitable via imported/shared cards (author ≠ room host). The fix binds
  // the render context from the CLAMPED view, so the macro renders EMPTY for a below-`full` member.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** A malicious/imported card: its SURVIVING sheet-tier fields embed full-only macros. If the render context
   *  is the full card, a `sheet` member's `description`/`scenario` leak the systemPrompt/post-history bytes. */
  const bypassCard: CharacterCard = {
    ...macroCard,
    description: "A rogue. LEAK[{{charsysinfo}}]",
    personality: "sly LEAK[{{charposthistory}}]",
    scenario: "a tavern; {{charsysinfo}}",
    greetings: [{ text: "hi — {{charposthistory}}" }],
    exampleMessages: "ex: {{charsysinfo}}",
    creatorNotes: "notes: {{charsysinfo}}",
    systemPrompt: "TOP_secretSystemPrompt",
    postHistoryInstructions: "TOP_SECRET_JAILBREAK",
  };

  test("a `sheet` member CANNOT surface systemPrompt/post-history via a {{charsysinfo}}/{{charposthistory}} macro in a surviving field (the clamp-bypass fix)", async () => {
    const { member, chatId } = await seedCardRoom("mc_bypass", "sheet");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // The full-only fields are NULL…
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
    // …AND the macros that reference them render EMPTY inside the surviving fields (not the secret bytes).
    // The macro expands to "" in place (no mid-string trim), so the surrounding literal text is unchanged
    // minus the secret. The load-bearing assertion is the ABSENCE of the secret bytes (checked below).
    expect(view.description).toBe("A rogue. LEAK[]");
    expect(view.personality).toBe("sly LEAK[]");
    expect(view.scenario).toBe("a tavern; ");
    expect(view.greetings).toEqual(["hi — "]);
    expect(view.exampleMessages).toBe("ex: ");
    expect(view.creatorNotes).toBe("notes: ");
    // THE WIRE PROOF: the serialized view is byte-clean of the secret content, anywhere.
    const bytes = JSON.stringify(view);
    expect(bytes).not.toContain("TOP_secretSystemPrompt");
    expect(bytes).not.toContain("TOP_SECRET_JAILBREAK");
  });

  test("`name-avatar` (below sheet) also can't leak — the surviving-field surface is empty, and no macro re-adds a secret", async () => {
    const { member, chatId } = await seedCardRoom("mc_bypass_floor", "name-avatar");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // Below `sheet`, description/scenario/etc. are themselves clamped null — nothing to render, nothing to leak.
    expect(view.description).toBeNull();
    expect(view.scenario).toBeNull();
    expect(view.systemPrompt).toBeNull();
    expect(JSON.stringify(view)).not.toContain("TOP_SECRET");
  });

  test("`sheet+lore` member: lore appears, but the {{charsysinfo}} macro in a surviving field STILL renders empty (full-only stays clamped)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_bypass_lore", "sheet+lore");
    await seedCardLore(host, "mc_bypass_lore_entry", "the prophecy");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.lore).toEqual(["the prophecy"]);
    expect(view.systemPrompt).toBeNull();
    expect(view.description).toBe("A rogue. LEAK[]");
    expect(JSON.stringify(view)).not.toContain("TOP_SECRET");
  });

  test("the HOST (full) DOES see the {{charsysinfo}} macro expand — the render obeys the level, it doesn't blanket-strip", async () => {
    const { host, chatId } = await seedCardRoom("mc_bypass_host", "full");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    // At `full`, systemPrompt survives, so `{{charsysinfo}}` in the description resolves to it (render-on-display
    // for the fields the viewer IS allowed to see — the fix clamps the render context to the LEVEL, not to empty).
    expect(view.systemPrompt).toBe("TOP_secretSystemPrompt");
    expect(view.description).toBe("A rogue. LEAK[TOP_secretSystemPrompt]");
    expect(view.personality).toBe("sly LEAK[TOP_SECRET_JAILBREAK]");
  });
});
