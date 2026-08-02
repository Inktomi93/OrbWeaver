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
// Every write goes through chat's REAL canon-safe bulk seam (`BulkImportChats` — slots + variant pool +
// selected pointer + founding roster, one atomic batch per chat) and the rpg game through rpg's real create
// door. No raw SQL, no second write path.

import type { BulkImportChatInput, BulkImportMessageInput } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ParsedChat, ParsedChatMessage } from "#kit/serde/chat";
import { parseChatJsonl } from "#kit/serde/chat";
import type { DemoChat, DemoChatSeeder, DemoChatSeederDeps } from "../contract/seeder";
import { DEMO_CHAT_NARRATOR_NAME, DEMO_CHATS } from "./demo-chats";

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

/** One resolved roster seat: the card the manifest's handle pointed at, plus the display name the transcript
 *  attributes its lines to. */
interface Seat {
  readonly characterId: CharacterId;
  readonly name: string;
}

/** ParsedChat → the canonical bulk-write input. The corpus is OUR OWN export, so the mapping is narrow by
 *  construction: every slot carries exactly one variant (the rendered `mes`) and no swipe pool, and the ST
 *  quirks `domain/import` handles (persona-by-name resolution, filename dates, `note_prompt`) do not arise —
 *  which is why this is chat's own small mapping rather than a reach into import's (a sideways import, and
 *  a different set of concerns).
 *
 *  Attribution: a user slot carries none; a narrator slot flags {@link BulkImportMessageInput.narrator} so
 *  the write op resolves it through the SAME synthetic-identity minter a live narrator round uses; any other
 *  assistant slot resolves its exported speaker NAME against the seats. An unrecognised name degrades to the
 *  primary rather than throwing — the pack was seeded moments ago so it cannot happen in practice, and an
 *  install whose card was renamed should still get its examples. */
function toMessageInput(m: ParsedChatMessage, seatsByName: ReadonlyMap<string, CharacterId>, createdAt: number): BulkImportMessageInput {
  const base = {
    role: m.role,
    createdAt,
    personaId: null,
    selectedIdx: 0,
    variants: [
      {
        idx: 0,
        content: m.content,
        model: m.model,
        provider: m.provider,
        tokensOut: m.tokensOut,
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
  if (m.speakerName === DEMO_CHAT_NARRATOR_NAME) {
    return { ...base, narrator: true };
  }
  const characterId = m.speakerName === null ? undefined : seatsByName.get(m.speakerName);
  return characterId === undefined ? base : { ...base, characterId };
}

/** The whole bulk-write input for one example: the parsed transcript + the manifest's roster/metadata. */
function toChatInput(demo: DemoChat, parsed: ParsedChat, seats: readonly Seat[], now: number): BulkImportChatInput {
  const seatsByName = new Map(seats.map((s) => [s.name, s.characterId]));
  const sendDates = parsed.messages.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
  const createdAt = parsed.createDate ?? sendDates[0] ?? now;
  return {
    title: demo.title,
    importedFrom: importedFromFor(demo),
    importHash: importHashFor(demo),
    anchorPersonaId: null,
    createdAt,
    updatedAt: sendDates.length > 0 ? Math.max(...sendDates) : createdAt,
    parentRef: null,
    authorsNote: null,
    // Deliberately FALSE: an example is not the user's own conversation, and must not drag the seeded pack
    // into their memory index on first boot (PD-78's backfill enqueue gates on this).
    isRealConversation: false,
    roster: seats.slice(1).map((s) => s.characterId),
    ...(demo.metadata === undefined ? {} : { metadata: demo.metadata }),
    messages: parsed.messages.map((m) => toMessageInput(m, seatsByName, m.sendDate ?? createdAt)),
  };
}

export function createDemoChatSeeder(deps: DemoChatSeederDeps): DemoChatSeeder {
  const log = getLog();
  // Only populated on success — a transient failure retries on the next touch. Assumes single-replica.
  const settled = new Set<UserId>();
  // Two parallel first requests share one in-flight seed run instead of double-writing.
  const inFlight = new Map<UserId, Promise<void>>();

  /** Resolve every manifest handle to a seeded card, PRIMARY FIRST. Null ⇒ this example's cast is not (yet)
   *  in the library, so it is skipped rather than seeded half-cast. */
  async function resolveSeats(principal: Principal, demo: DemoChat): Promise<Seat[] | null> {
    // `Promise.all` PRESERVES input order, and order is load-bearing: seats[0] is the header character the
    // dedup + branch scoping key off. Independent owner-scoped reads, so they resolve concurrently.
    const found = await Promise.all(demo.handles.map((handle) => deps.findCharacterByHandle({ principal, handle })));
    const seats = found.flatMap((f) => (f === null ? [] : [{ characterId: f.characterId, name: f.name }]));
    return seats.length === demo.handles.length && seats.length > 0 ? seats : null;
  }

  /** Seed ONE example. Returns whether a chat was written (a dedup skip / a missing transcript / a missing
   *  cast member all return false). One bulk call per example: each has its OWN primary character. */
  async function seedOne(principal: Principal, demo: DemoChat, now: number): Promise<boolean> {
    const text = await deps.readTranscript(demo.slug);
    if (text === null) {
      log.warn({ slug: demo.slug }, "chat: demo transcript missing from the bundle — example skipped");
      return false;
    }
    const seats = await resolveSeats(principal, demo);
    if (seats === null) {
      return false;
    }
    const parsed = parseChatJsonl(text, { fileName: `${demo.slug}.jsonl`, charDirName: demo.slug });
    if (parsed === null || parsed.messages.length === 0) {
      log.warn({ slug: demo.slug }, "chat: demo transcript did not parse — example skipped");
      return false;
    }
    const primary = seats[0];
    if (primary === undefined) {
      return false;
    }
    const result = await deps.writeChats({
      ownerId: principal.userId,
      characterId: primary.characterId,
      chats: [toChatInput(demo, parsed, seats, now)],
    });
    const chatId = result.chatIds[0];
    if (chatId === undefined) {
      return false; // dedup skip — the example (and its game) already landed on a prior partial run
    }
    if (demo.game !== undefined && deps.createGame !== undefined) {
      await deps.createGame({ principal, chatId, game: demo.game });
    }
    return true;
  }

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      return;
    }
    // Concurrent by design and NOT order-dependent: each example is one INDEPENDENT atomic bulk write with
    // its own primary character and its own `importHash`, and the rendered list order comes from each
    // transcript's own carried dates (not from write order), so it is stable either way.
    const now = deps.now();
    const outcomes = await Promise.all(DEMO_CHATS.map((demo) => seedOne(principal, demo, now)));
    const seeded = outcomes.filter(Boolean).length;
    await deps.markSeeded(principal);
    log.info({ userId: principal.userId, seeded, total: DEMO_CHATS.length }, "chat: seeded the example conversations");
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
