// domain/chat/seeder/seed — idempotent seeder for the bundled EXAMPLE conversations. The exact sibling of
// `domain/character/seeder/seed.ts`, wired at entry/ from the same two call sites (boot for the deployment
// owner, first authed request for a new user), and ALWAYS after the character seeder: an example attaches to
// the seeded cards, so a handle the pack has not laid down yet simply skips that example.
//
// Idempotency has two layers: the persisted latch `UserSettings.onboarding.demoChatsSeeded` (once true never
// re-runs — also the deletion-respect guard: a user who deletes an example does not get it back), and, under
// it, the bulk write's own `importHash` dedup (`demo-chat:<slug>`), so a crash mid-run re-runs cleanly
// without duplicating the examples that already landed.
//
// AND A THIRD, NARROWER ONE — the per-example SKIP LEDGER (`onboarding.demoChatsSkipped`, #1550). The latch
// above is a per-USER fact, so an example SKIPPED during a partial seed (its cast handle not in the library
// yet — the repro: the character pack half-seeded — a transcript missing from the bundle, a parse failure)
// was unreachable FOREVER: the latch went true anyway, and a demo room's absence reads identically whether
// we never created it or the user deleted it. So a skip is RECORDED at the moment we know it, and a later
// touch retries exactly those slugs.
//
// THE SET IS THE SKIPS, NOT "OURS", AND THE INVERSION IS THE SAFETY ARGUMENT. Recording which examples are
// ours would fail DANGEROUS — the settings blob's `.catch` default reads as "we created none", and a retry
// off that would re-create every example the user DELETED, which is the one thing the latch exists to
// prevent. A skip list fails CLOSED: empty or lost ⇒ no retries ⇒ exactly the pre-#1550 behaviour. That is
// also why the pre-ledger cohort needs no backfill pass — their empty list seals them, and the deletion they
// may have made stays respected.
//
// A DEDUP SKIP IS NOT A SKIP. `writeChats` returning no row means the example already landed on a prior
// partial run: the row EXISTS, so recording it would schedule a retry for something that is already there.
//
// Every write goes through chat's REAL canon-safe bulk seam (`BulkImportChats` — slots + variant pool +
// selected pointer + founding roster, one atomic batch per chat) and the rpg game through rpg's real create
// door. No raw SQL, no second write path.

import type { BulkImportChatInput, BulkImportMessageInput } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterHandle, CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ParsedChat, ParsedChatMessage } from "#kit/serde/chat";
import { parseChatJsonl } from "#kit/serde/chat";
import type { DemoChat, DemoChatSeeder, DemoChatSeederDeps, SeededChatDressing } from "../contract/seeder.ts";
import { DEMO_CHAT_PACK_VERSION, DEMO_CHATS } from "./demo-chats.ts";

/** The per-example dedup oracle written to `chats.importHash`. Stable across releases (keyed by the slug,
 *  never by the transcript bytes) so re-generating a transcript does not resurrect a deleted example. */
function importHashFor(demo: DemoChat): string {
  return `demo-chat:${demo.slug}`;
}

/** The seeded room's `chats.importedFrom` — the transcript's bundled filename, honest provenance for a row
 *  that really was bulk-written from a file. Not user-facing (only CHARACTER provenance renders). */
function importedFromFor(demo: DemoChat): string {
  return `seed-assets/demo-chats/${demo.slug}.jsonl`;
}

/** What one example's seed attempt did. `present` is a converged SUCCESS (the row is already there), which
 *  is why it is a THIRD member rather than a second flavour of failure — collapsing it into `skipped` would
 *  schedule a retry for a room that exists, and collapsing it into `written` would over-count the log. */
type SeedOutcome = "written" | "present" | "skipped";

/** One resolved roster seat: the card the manifest's handle pointed at, plus the display name the transcript
 *  attributes its lines to. `handle` is carried so the authored game setup's `handle` seats resolve to real
 *  actor refs at the entry seam. */
interface Seat {
  readonly handle: CharacterHandle;
  readonly characterId: CharacterId;
  readonly name: string;
}

/** ParsedChat → the canonical bulk-write input. The corpus is OUR OWN export, so the mapping is narrow by
 *  construction: every slot carries exactly one variant (the rendered `mes`) and no swipe pool, and the ST
 *  quirks `domain/import` handles (persona-by-name resolution, filename dates, `note_prompt`) do not arise —
 *  which is why this is chat's own small mapping rather than a reach into import's (a sideways import, and
 *  a different set of concerns).
 *
 *  Attribution: a user slot carries none; a `narrator`-KIND slot carries its declaration through
 *  {@link BulkImportMessageInput.kind}, so the write op resolves it through the SAME synthetic-identity minter
 *  a live narrator round uses; any other assistant slot resolves its exported speaker NAME against the seats.
 *  An unrecognised name degrades to the primary rather than throwing — the pack was seeded moments ago so it
 *  cannot happen in practice, and an install whose card was renamed should still get its examples.
 *
 *  The narrator arm used to match the exported speaker NAME against the synthetic card's name ("Group"). That
 *  was the pack's copy of the inference D129 retires: rename the synthetic card, or ship a pack from an
 *  install where a real seated character is called Group, and the routing silently changes. The pack now DECLARES
 *  it (`extra.type: "narrator"`, ST's own marker), which is what our export verb emits today. */
function toMessageInput(m: ParsedChatMessage, seatsByName: ReadonlyMap<string, CharacterId>, createdAt: number): BulkImportMessageInput {
  const base = {
    role: m.role,
    kind: m.kind,
    createdAt,
    personaId: null,
    selectedIdx: 0,
    variants: [
      {
        idx: 0,
        content: m.content,
        model: m.model,
        provider: m.provider,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        tokenProvenance: m.tokenProvenance,
        reasoning: m.reasoning,
        ttftMs: m.ttftMs,
        genStartedAt: m.genStarted,
        genFinishedAt: m.genFinished,
        metadata: null,
      },
    ],
  } satisfies BulkImportMessageInput;
  if (m.role !== "assistant") {
    return base;
  }
  if (m.kind === "narrator") {
    return base;
  }
  const characterId = m.speakerName === null ? undefined : seatsByName.get(m.speakerName);
  return characterId === undefined ? base : { ...base, characterId };
}

// State-anchor exports (`"mes": ""` narrator rows — the state-anchor law: an empty slot is a snapshot FK,
// never a lost completion) are stripped by `parseChatJsonl` itself since the blank-row strip landed: a row
// with no rendered text anywhere is unrepresentable at the write boundary for EVERY consumer, so the
// seeder's own drop-filter became a second decision home and was deleted. The seeded copy's game state
// rides the manifest replay, not those rows — nothing is lost.

/** The whole bulk-write input for one example: the parsed transcript + the manifest's roster/metadata.
 *
 *  `anchorPersonaId` is the RECEIVING USER'S persona (never a shipped constant): the bulk write seats it on
 *  the host participant AND pins it as the room's anchor, so an example opens "Playing as <them>" and every
 *  identity projection built off the seat — the persona panel, the rpg player actor's name — reads them
 *  instead of falling back to their bare account handle. */
function toChatInput(args: {
  readonly demo: DemoChat;
  readonly parsed: ParsedChat;
  readonly seats: readonly Seat[];
  readonly anchorPersonaId: PersonaId | null;
  readonly now: number;
}): BulkImportChatInput {
  const { demo, parsed, seats, anchorPersonaId, now } = args;
  const seatsByName = new Map(seats.map((s) => [s.name, s.characterId]));
  const spoken = parsed.messages;
  const sendDates = spoken.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
  const createdAt = parsed.createDate ?? sendDates[0] ?? now;
  return {
    title: demo.title,
    importedFrom: importedFromFor(demo),
    importHash: importHashFor(demo),
    anchorPersonaId,
    createdAt,
    updatedAt: sendDates.length > 0 ? Math.max(...sendDates) : createdAt,
    parentRef: null,
    // Deliberately FALSE: an example is not the user's own conversation, and must not drag the seeded pack
    // into their memory index on first boot (PD-78's backfill enqueue gates on this).
    isRealConversation: false,
    characterIds: seats.slice(1).map((s) => s.characterId),
    ...(demo.metadata === undefined ? {} : { metadata: demo.metadata }),
    messages: spoken.map((m) => toMessageInput(m, seatsByName, m.sendDate ?? createdAt)),
  };
}

export function createDemoChatSeeder(deps: DemoChatSeederDeps): DemoChatSeeder {
  const log = getLog();
  // Only populated on success — a transient failure retries on the next touch. Assumes single-replica.
  const settled = new Set<UserId>();
  // Two parallel first requests share one in-flight seed run instead of double-writing.
  const inFlight = new Map<UserId, Promise<void>>();

  /** Resolve every manifest handle to a seeded card, PRIMARY FIRST. Null ⇒ this example's characters are not (yet)
   *  in the library, so it is skipped rather than seeded with a half-built roster. */
  async function resolveSeats(principal: Principal, demo: DemoChat): Promise<Seat[] | null> {
    // `Promise.all` PRESERVES input order, and order is load-bearing: seats[0] is the header character the
    // dedup + branch scoping key off. Independent owner-scoped reads, so they resolve concurrently.
    const found = await Promise.all(demo.handles.map((handle) => deps.findCharacterByHandle({ principal, handle: castId<CharacterHandle>(handle) })));
    const seats = found.flatMap((f, i) =>
      f === null ? [] : [{ handle: castId<CharacterHandle>(demo.handles[i] ?? ""), characterId: f.characterId, name: f.name }],
    );
    return seats.length === demo.handles.length && seats.length > 0 ? seats : null;
  }

  /** Seed ONE example — THREE outcomes, because two of them used to be one `false` and that is the #1550
   *  defect. `written`: this pass created the room. `present`: the row is already there (the bulk write's
   *  `importHash` dedup fired — a prior partial run landed it), which is a converged SUCCESS and must never
   *  be scheduled for a retry. `skipped`: nothing was written and nothing is there, so this example is owed
   *  a later attempt — the one outcome the skip ledger records. One bulk call per example: each has its OWN
   *  primary character. */
  async function seedOne(principal: Principal, demo: DemoChat, anchorPersonaId: PersonaId | null, now: number): Promise<SeedOutcome> {
    const text = await deps.readTranscript(demo.slug);
    if (text === null) {
      log.warn({ slug: demo.slug }, "chat: demo transcript missing from the bundle — example skipped");
      return "skipped";
    }
    const seats = await resolveSeats(principal, demo);
    if (seats === null) {
      return "skipped";
    }
    const parsed = parseChatJsonl(text, { fileName: `${demo.slug}.jsonl`, charDirName: demo.slug });
    if (parsed === null || parsed.messages.length === 0) {
      log.warn({ slug: demo.slug }, "chat: demo transcript did not parse — example skipped");
      return "skipped";
    }
    const primary = seats[0];
    if (primary === undefined) {
      return "skipped";
    }
    const result = await deps.writeChats({
      ownerId: principal.userId,
      characterId: primary.characterId,
      chats: [toChatInput({ demo, parsed, seats, anchorPersonaId, now })],
    });
    const chatId = result.written[0]?.chatId;
    if (chatId === undefined) {
      return "present"; // dedup skip — the example (and its game) already landed on a prior partial run
    }
    if (demo.game !== undefined && deps.createGame !== undefined) {
      await deps.createGame({ principal, chatId, game: demo.game, seats, mint: true });
    }
    return "written";
  }

  /** Run one pass over `demos`, persist the skip ledger it produced, and answer how many rooms were written.
   *  The ledger is written WHOLE from this pass's own outcomes UNION the skips this pass did not look at —
   *  a merge could never REMOVE a slug, and removal is the whole point (a retry that lands must stop being
   *  owed). Written LAST, so a throw above leaves the previous ledger and the next touch retries. */
  async function runPass(
    principal: Principal,
    pass: { readonly demos: readonly DemoChat[]; readonly anchorPersonaId: PersonaId | null; readonly now: number; readonly carried: readonly string[] },
  ): Promise<number> {
    const { demos, anchorPersonaId, now, carried } = pass;
    const outcomes = await Promise.all(demos.map(async (demo) => ({ slug: demo.slug, outcome: await seedOne(principal, demo, anchorPersonaId, now) })));
    const attempted = new Set(demos.map((demo) => demo.slug));
    const skipped = [...carried.filter((slug) => !attempted.has(slug)), ...outcomes.flatMap((o) => (o.outcome === "skipped" ? [o.slug] : []))];
    await deps.markSkippedSlugs(principal, skipped);
    return outcomes.filter((o) => o.outcome === "written").length;
  }

  /** The RETRY pass for examples a previous seed could not write (#1550). Runs on an already-latched user,
   *  and only for slugs the ledger names — so it can never re-create an example the user deleted (that one
   *  was WRITTEN once, so it was never recorded here). Zero recorded skips ⇒ zero reads, zero writes, which
   *  is every touch for every user whose first seed was complete. */
  async function retrySkipped(principal: Principal): Promise<void> {
    const skipped = await deps.readSkippedSlugs(principal);
    if (skipped.length === 0) {
      return;
    }
    const owed = DEMO_CHATS.filter((demo) => skipped.includes(demo.slug));
    if (owed.length === 0) {
      // Every recorded slug has left the shipped manifest — drop them rather than carrying names forever.
      await deps.markSkippedSlugs(principal, []);
      return;
    }
    const anchorPersonaId = await deps.resolveSeatPersona(principal);
    const seeded = await runPass(principal, { demos: owed, anchorPersonaId, now: deps.now(), carried: skipped });
    log.info({ userId: principal.userId, seeded, owed: owed.length }, "chat: retried the example conversations a partial seed had skipped");
  }

  /** The pack-bump HEAL for ONE already-seeded example. Fills only the dressing fields still at their seeded
   *  default — an absent host-seat persona, an absent room background, a still-born game state — because the
   *  user's copy of an example is THEIRS: a background they picked, a persona they switched to, a game they
   *  played are all left exactly as they are. Returns whether anything was filled. */
  async function healOne(principal: Principal, demo: DemoChat, anchorPersonaId: PersonaId | null): Promise<boolean> {
    const existing = (await deps.readSeededChat?.({ principal, importHash: importHashFor(demo) })) ?? null;
    if (existing === null) {
      return false; // deleted, never seeded, or no read door — the latch owns deletion-respect
    }
    const filled = await Promise.all([
      healSeatPersona(principal, existing, anchorPersonaId),
      healBackground(principal, existing, demo),
      healGame(principal, existing, demo),
    ]);
    return filled.includes(true);
  }

  /** The seat's "playing as", only when it carries none. */
  async function healSeatPersona(principal: Principal, existing: SeededChatDressing, anchorPersonaId: PersonaId | null): Promise<boolean> {
    if (existing.hasSeatPersona || anchorPersonaId === null || deps.bindSeatPersona === undefined) {
      return false;
    }
    await deps.bindSeatPersona({ principal, chatId: existing.chatId, personaId: anchorPersonaId });
    return true;
  }

  /** The curated room background, only when the room carries none. */
  async function healBackground(principal: Principal, existing: SeededChatDressing, demo: DemoChat): Promise<boolean> {
    const background = demo.metadata?.background;
    if (existing.hasBackground || background === undefined || deps.setChatBackground === undefined) {
      return false;
    }
    await deps.setChatBackground({ principal, chatId: existing.chatId, background });
    return true;
  }

  /** The authored game state. Idempotent by the door's own contract: it replays the setup only onto a
   *  still-born state, so a game the user has actually played is never re-dressed. */
  async function healGame(principal: Principal, existing: SeededChatDressing, demo: DemoChat): Promise<boolean> {
    if (demo.game === undefined || deps.createGame === undefined) {
      return false;
    }
    const seats = await resolveSeats(principal, demo);
    if (seats === null) {
      return false;
    }
    await deps.createGame({ principal, chatId: existing.chatId, game: demo.game, seats, mint: false });
    return true;
  }

  /** The reseed migration for examples latched under an older EXAMPLE pack. The transcripts never change (a
   *  re-generated transcript keys off the same slug and must not resurrect a deleted example) — what a pack
   *  bump carries is DRESSING, so this walks the same manifest and heals hole-by-hole. */
  async function migratePack(principal: Principal): Promise<void> {
    if ((await deps.readPackVersion(principal)) >= DEMO_CHAT_PACK_VERSION) {
      return;
    }
    const anchorPersonaId = await deps.resolveSeatPersona(principal);
    const outcomes = await Promise.all(DEMO_CHATS.map((demo) => healOne(principal, demo, anchorPersonaId)));
    // LAST, so a throw anywhere above leaves the old stamp and the next touch retries — every heal above is
    // only-if-unset, so the retry is a no-op on everything already healed.
    await deps.markPackVersion(principal, DEMO_CHAT_PACK_VERSION);
    log.info(
      { userId: principal.userId, healed: outcomes.filter(Boolean).length, total: DEMO_CHATS.length, packVersion: DEMO_CHAT_PACK_VERSION },
      "chat: migrated the example-conversation pack",
    );
  }

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      // #1550 BEFORE the dressing heal: an example that was never written has nothing to dress, and a retry
      // that lands wants this pass's heal to see it.
      await retrySkipped(principal);
      await migratePack(principal);
      return;
    }
    // Concurrent by design and NOT order-dependent: each example is one INDEPENDENT atomic bulk write with
    // its own primary character and its own `importHash`, and the rendered list order comes from each
    // transcript's own carried dates (not from write order), so it is stable either way.
    const now = deps.now();
    const anchorPersonaId = await deps.resolveSeatPersona(principal);
    const seeded = await runPass(principal, { demos: DEMO_CHATS, anchorPersonaId, now, carried: [] });
    await deps.markSeeded(principal);
    // A fresh seed IS the shipped pack by construction — stamping it here keeps the next bump's heal off it
    // until there is actually something to fill (the character seeder's precedent).
    await deps.markPackVersion(principal, DEMO_CHAT_PACK_VERSION);
    log.info({ userId: principal.userId, seeded, total: DEMO_CHATS.length, packVersion: DEMO_CHAT_PACK_VERSION }, "chat: seeded the example conversations");
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
      if (settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending) {
        return pending;
      }
      const run = seed(principal)
        .then((): void => {
          settled.add(principal.userId);
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "chat: demo-chat seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
