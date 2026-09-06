// seeder: the bundled EXAMPLE conversations — the DRESSING contract, over fake doors (no db). The write
// path itself (bulk import) has its own coverage; what is pinned here is everything the seeder DECIDES:
//
//   • every example seats the RECEIVING user's persona (owner-reported 08-03: a persona-less host seat reads
//     as "Playing as None" in the persona panel AND names the rpg player actor by the bare account handle —
//     the live dev stack showed `viewerActivePersonaId: null` + a seat displayName of "owner" on five of six
//     seeded examples);
//   • the three GROUP examples carry a curated room background and the solo ones deliberately do not (their
//     one card's own `backgroundOverride` paints through the BG-C card arm);
//   • the flagship hands its authored game state to the game door, with the resolved seat map;
//   • the pack-bump HEAL fills a hole and never stomps a value, and never resurrects a deleted example.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DemoChatSeederDeps, SeededChatDressing } from "@orb/server/domain/chat";
import { createDemoChatSeeder, DEMO_CHAT_PACK_VERSION, DEMO_CHATS } from "@orb/server/domain/chat";
import { principal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const USER_ID = castId<UserId>("user_demo_seed");
const PERSONA_ID = castId<PersonaId>("persona_traveler");
const PRINCIPAL = principal(USER_ID);

/** A minimal well-formed export transcript. Written as RAW jsonl (not object literals) because the wire is
 *  ST-flavoured snake_case — the bytes are the fixture. */
const TRANSCRIPT = [
  '{"user_name":"Traveler","character_name":"Someone","create_date":"August 2, 2026 8:05am","chat_metadata":{}}',
  '{"name":"Traveler","is_user":true,"mes":"hello","send_date":1754000000000}',
  '{"name":"Someone","is_user":false,"mes":"hi","send_date":1754000001000}',
].join("\n");

/** The rpg flagship's real export shape: an rpg hand write anchors its snapshot on a CONTENT-LESS narrator row
 *  (the state-anchor law), and an ST transcript has nowhere to put that state — so it exports as `"mes":""`.
 *  The generating session put EIGHT of them ahead of its first user turn. */
const TRANSCRIPT_WITH_ANCHORS = [
  '{"user_name":"Traveler","character_name":"Someone","create_date":"August 2, 2026 8:05am","chat_metadata":{}}',
  '{"name":"Someone","is_user":false,"mes":"greeting","send_date":1754000000000}',
  '{"name":"Group","is_user":false,"mes":"","send_date":1754000000500}',
  '{"name":"Group","is_user":false,"mes":"","send_date":1754000000600}',
  '{"name":"Traveler","is_user":true,"mes":"hello","send_date":1754000001000}',
  '{"name":"Someone","is_user":false,"mes":"hi","send_date":1754000002000}',
].join("\n");

interface Recorded {
  readonly chats: BulkImportChatInput[];
  /** Every `markSkippedSlugs` write, in order — the #1550 ledger's whole observable surface. */
  readonly skipWrites: readonly string[][];
  readonly games: { readonly chatId: ChatId; readonly slugSeats: readonly string[]; readonly mint: boolean; readonly hasSetup: boolean }[];
  readonly boundPersonas: { readonly chatId: ChatId; readonly personaId: PersonaId }[];
  readonly backgrounds: { readonly chatId: ChatId; readonly seededId: string }[];
  readonly stampedVersions: number[];
}

interface HarnessOptions {
  readonly seeded?: boolean;
  readonly packVersion?: number;
  readonly persona?: PersonaId | null;
  readonly dressing?: (importHash: string) => SeededChatDressing | null;
  readonly transcript?: string;
  /** The card handles the library does NOT hold — the partial-character-seed repro (#1550). Every example
   *  whose manifest names one of these resolves no seats and is skipped. */
  readonly missingHandles?: readonly string[];
  /** The stored `onboarding.demoChatsSkipped` this run starts from. */
  readonly skipped?: readonly string[];
}

function makeHarness(options: HarnessOptions = {}): { readonly deps: DemoChatSeederDeps; readonly rec: Recorded } {
  const skipWrites: string[][] = [];
  const rec: Recorded = { chats: [], games: [], boundPersonas: [], backgrounds: [], stampedVersions: [], skipWrites };
  let packVersion = options.packVersion ?? 0;
  let skipped: readonly string[] = options.skipped ?? [];
  const deps: DemoChatSeederDeps = {
    readTranscript: (): Promise<string | null> => Promise.resolve(options.transcript ?? TRANSCRIPT),
    findCharacterByHandle: ({ handle }) =>
      Promise.resolve(options.missingHandles?.includes(handle) === true ? null : { characterId: castId(`character_${handle}`), name: `Card ${handle}` }),
    writeChats: ({ chats }) => {
      rec.chats.push(...chats);
      return Promise.resolve({
        identities: chats.map((c) => ({ chatId: castId<ChatId>(`chat_${c.importHash ?? "x"}`), messageIds: [], variantIds: [] })),
        written: chats.map((c) => ({ chatId: castId<ChatId>(`chat_${c.importHash ?? "x"}`), messageIds: [], variantIds: [] })),
        chatsImported: chats.length,
        chatsSkipped: 0,
        messagesImported: chats.reduce((n, c) => n + c.messages.length, 0),
        variantsImported: chats.reduce((n, c) => n + c.messages.length, 0),
        branchesLinked: 0,
        realConversationWritten: false,
        chatsPersonaHealed: 0,
      });
    },
    resolveSeatPersona: (): Promise<PersonaId | null> => Promise.resolve(options.persona ?? (options.persona === null ? null : PERSONA_ID)),
    createGame: ({ chatId, game, seats, mint }): Promise<void> => {
      rec.games.push({ chatId, slugSeats: seats.map((s) => s.handle), mint, hasSetup: game.setup !== undefined });
      return Promise.resolve();
    },
    isSeeded: (): Promise<boolean> => Promise.resolve(options.seeded ?? false),
    markSeeded: (): Promise<void> => Promise.resolve(),
    readPackVersion: (): Promise<number> => Promise.resolve(packVersion),
    markPackVersion: (_principal, version): Promise<void> => {
      packVersion = version;
      rec.stampedVersions.push(version);
      return Promise.resolve();
    },
    readSkippedSlugs: (): Promise<readonly string[]> => Promise.resolve(skipped),
    markSkippedSlugs: (_principal, slugs): Promise<void> => {
      skipped = [...slugs];
      skipWrites.push([...slugs]);
      return Promise.resolve();
    },
    readSeededChat: ({ importHash }) => Promise.resolve(options.dressing?.(importHash) ?? null),
    bindSeatPersona: ({ chatId, personaId }): Promise<void> => {
      rec.boundPersonas.push({ chatId, personaId });
      return Promise.resolve();
    },
    setChatBackground: ({ chatId, background }): Promise<void> => {
      rec.backgrounds.push({ chatId, seededId: background.seededId });
      return Promise.resolve();
    },
    now: (): number => 1_754_000_000_000,
  };
  return { deps, rec };
}

test("every seeded example seats the receiving user's persona (never a null host seat)", async () => {
  const { deps, rec } = makeHarness();
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.chats).toHaveLength(DEMO_CHATS.length);
  for (const chat of rec.chats) {
    expect(chat.anchorPersonaId).toBe(PERSONA_ID);
  }
});

test("a user with no persona at all still gets their examples (the seat falls back, the seed does not fail)", async () => {
  const { deps, rec } = makeHarness({ persona: null });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.chats).toHaveLength(DEMO_CHATS.length);
  expect(rec.chats.every((c) => c.anchorPersonaId === null)).toBe(true);
});

test("rpg STATE-ANCHOR slots never seed: a content-less assistant row is a snapshot FK, not a blank bubble", async () => {
  const { deps, rec } = makeHarness({ transcript: TRANSCRIPT_WITH_ANCHORS });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  const [chat] = rec.chats;
  expect(chat?.messages.map((m) => m.variants[0]?.content)).toEqual(["greeting", "hello", "hi"]);
  // The dates the room is sorted + stamped by must come from the SPOKEN rows too — an anchor's timestamp is
  // the host's setup click, not a beat of the conversation.
  expect(chat?.updatedAt).toBe(1_754_000_002_000);
});

// ── #1550: a skipped example is OWED a later attempt, and a deleted one is still never resurrected ──────
// `demoChatsSeeded` latches unconditionally, so an example skipped during a partial seed (the repro: the
// CHARACTER pack half-seeded, so a demo's cast handle is not in the library yet) was unreachable forever —
// and a demo room's absence reads identically whether we never created it or the user deleted it. The skip
// ledger is the per-example evidence that tells those apart, recorded at the moment we know it.

/** The first manifest example whose cast the harness can make missing — the repro needs a real slug. */
const OWED = DEMO_CHATS[0];

test("#1550 an example skipped for a missing cast is RECORDED, and the rest of the pass still seeds", async () => {
  const handles = OWED?.handles ?? [];
  const { deps, rec } = makeHarness({ missingHandles: handles });

  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  // The skipped example did not land…
  expect(rec.chats.map((c) => c.importHash)).not.toContain(`demo-chat:${OWED?.slug ?? ""}`);
  // …and it is on the ledger, which is what makes it reachable at all. (Other examples sharing a missing
  // handle are recorded too — the assertion is about the owed one being there, not about the count.)
  expect(rec.skipWrites.at(-1)).toContain(OWED?.slug);
});

test("#1550 a LATER touch retries exactly the recorded slug, and the ledger DROPS it once it lands", async () => {
  // Already latched (`seeded`), with one recorded skip — the state the pass above leaves behind, except the
  // library now holds the cast.
  const { deps, rec } = makeHarness({ seeded: true, packVersion: DEMO_CHAT_PACK_VERSION, skipped: [OWED?.slug ?? ""] });

  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  // EXACTLY the owed example is written — not the whole manifest (every other example is the user's own copy
  // by now, and re-writing one would be the resurrection this ledger exists to avoid).
  expect(rec.chats.map((c) => c.importHash)).toEqual([`demo-chat:${OWED?.slug ?? ""}`]);
  // …and it stops being owed. A merge-shaped ledger could never remove it, which is why the door replaces.
  expect(rec.skipWrites.at(-1)).toEqual([]);
});

test("#1550 an EMPTY ledger on a latched user does nothing at all — the pre-#1550 behaviour, fail-closed", async () => {
  // The pre-ledger cohort (and every user whose first seed was complete) reads `[]`. Nothing is retried and
  // nothing is written: a user who DELETED an example must not find it back, and an empty ledger cannot tell
  // a deletion from a never-written row — so it refuses to guess. This is the same read a corrupt settings
  // blob produces (`.catch([])`), which is why the ledger records SKIPS rather than "ours".
  const { deps, rec } = makeHarness({ seeded: true, packVersion: DEMO_CHAT_PACK_VERSION, skipped: [] });

  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.chats).toEqual([]);
  expect(rec.skipWrites).toEqual([]);
});

test("#1550 a recorded slug that has LEFT the shipped manifest is dropped, never carried forever", async () => {
  const { deps, rec } = makeHarness({ seeded: true, packVersion: DEMO_CHAT_PACK_VERSION, skipped: ["a-retired-example"] });

  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.chats).toEqual([]);
  expect(rec.skipWrites).toEqual([[]]);
});

const soloSeatCount = 1;

test("BG-C: every GROUP example ships a curated room background; a SOLO example ships none (its card paints)", () => {
  const dressed = DEMO_CHATS.map((demo) => ({
    slug: demo.slug,
    group: demo.handles.length > soloSeatCount,
    // A curated background is a `seeded` plate with a real slug; anything else counts as undressed.
    background: demo.metadata?.background?.kind === "seeded" ? demo.metadata.background.seededId || null : null,
  }));
  // A group example WITHOUT a plate would paint nothing at all (the card arm is true-solo-only); a solo
  // example WITH one would override the character's own carried background for no reason.
  expect(dressed.filter((d) => d.group).map((d) => `${d.slug}:${d.background ?? "MISSING"}`)).toEqual([
    "second-opinion:assistant-bg",
    "midnight-run:niko-bg",
    "ashen-spire:morgatha-bg",
  ]);
  expect(dressed.filter((d) => !d.group).map((d) => d.background)).toEqual([null, null, null]);
});

test("the flagship hands its AUTHORED game state + the resolved seat map to the game door, minting the game", async () => {
  const { deps, rec } = makeHarness();
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.games).toHaveLength(1);
  const [game] = rec.games;
  expect(game?.mint).toBe(true);
  expect(game?.hasSetup, "the rpg example must carry authored state — a born-empty panel reads as unbuilt").toBe(true);
  expect(game?.slugSeats).toEqual(["sabine", "calamity", "morgatha"]);
});

test("a fresh seed stamps the shipped pack version (so the next bump's heal has something to compare)", async () => {
  const { deps, rec } = makeHarness();
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);
  expect(rec.stampedVersions).toEqual([DEMO_CHAT_PACK_VERSION]);
});

test("pack bump: an already-seeded library gets its holes filled — persona AND background — and is re-stamped", async () => {
  const { deps, rec } = makeHarness({
    seeded: true,
    packVersion: 1,
    dressing: (importHash) => ({ chatId: castId<ChatId>(`chat_${importHash}`), hasSeatPersona: false, hasBackground: false }),
  });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  // No re-write of any transcript — the heal only dresses.
  expect(rec.chats).toHaveLength(0);
  expect(rec.boundPersonas).toHaveLength(DEMO_CHATS.length);
  expect(rec.boundPersonas.every((b) => b.personaId === PERSONA_ID)).toBe(true);
  // Exactly the group examples carry a curated background, so exactly those get one healed in.
  expect(rec.backgrounds.map((b) => b.seededId).toSorted((a, b) => a.localeCompare(b))).toEqual(["assistant-bg", "morgatha-bg", "niko-bg"]);
  // The flagship's game is re-dressed WITHOUT a second mint.
  expect(rec.games.map((g) => g.mint)).toEqual([false]);
  expect(rec.stampedVersions).toEqual([DEMO_CHAT_PACK_VERSION]);
});

test("pack bump NEVER stomps a choice: a copy that already carries a persona and a background is left alone", async () => {
  const { deps, rec } = makeHarness({
    seeded: true,
    packVersion: 1,
    dressing: (importHash) => ({ chatId: castId<ChatId>(`chat_${importHash}`), hasSeatPersona: true, hasBackground: true }),
  });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.boundPersonas).toHaveLength(0);
  expect(rec.backgrounds).toHaveLength(0);
  expect(rec.stampedVersions).toEqual([DEMO_CHAT_PACK_VERSION]);
});

test("pack bump never resurrects a DELETED example (deletion-respect stays with the latch)", async () => {
  const { deps, rec } = makeHarness({ seeded: true, packVersion: 1, dressing: () => null });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.chats).toHaveLength(0);
  expect(rec.boundPersonas).toHaveLength(0);
  expect(rec.backgrounds).toHaveLength(0);
  expect(rec.games).toHaveLength(0);
});

test("a library already on the shipped pack does no heal work at all", async () => {
  const { deps, rec } = makeHarness({
    seeded: true,
    packVersion: DEMO_CHAT_PACK_VERSION,
    dressing: (importHash) => ({ chatId: castId<ChatId>(`chat_${importHash}`), hasSeatPersona: false, hasBackground: false }),
  });
  await createDemoChatSeeder(deps).ensureSeeded(PRINCIPAL);

  expect(rec.boundPersonas).toHaveLength(0);
  expect(rec.backgrounds).toHaveLength(0);
  expect(rec.stampedVersions).toHaveLength(0);
});
