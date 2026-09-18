// domain/chat/contract/seeder — the demo-chat seeder's typed surface; seeder/ implements
// createDemoChatSeeder over these. The sibling of `domain/character/contract/seeder.ts` (the
// `types-in-contract` gate forbids an exported type living in `seeder/`).
//
// Wired by entry over chat's own bulk-import write op, with the transcript READ + the settings latch + the
// character lookup injected — so domain/chat never touches the filesystem and never imports
// domain/settings or domain/character.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { RpgActorOp, RpgJournalType, RpgQuestStatus, RpgRuleset, RpgTrackerDef } from "@orb/contracts/rpg";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterHandle, CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import type { BulkImportChats } from "./import.ts";

/** One bundled EXAMPLE conversation. The transcript itself is NOT here — it is the verbatim output of the
 *  real export verb, shipped as `@orb/default-content`'s `demo-chats/<slug>.jsonl` and handed in by the
 *  injected `readTranscript`. This manifest carries only what an ST transcript CANNOT: which cards sit in
 *  the room, in what order, and the room-behavior blob the group/rpg grammar needs. */
export interface DemoChat {
  /** The transcript file's basename AND the per-chat dedup key (`demo-chat:<slug>`). Stable forever. */
  readonly slug: string;
  /** The rendered chat title. ALWAYS carries the "Example — " prefix (the owner's labelling law). */
  readonly title: string;
  /** The seeded-card HANDLES seated in this room, PRIMARY FIRST (the primary is the header character the
   *  dedup + branch scoping key off). A handle the pack does not seed skips the whole example. */
  readonly handles: readonly string[];
  /** The room-behavior blob (group config / opening policy). Absent ⇒ a plain solo room. */
  readonly metadata?: ChatMetadata;
  /** Mint a lite rpg game for this room after the transcript lands (the flagship). Absent ⇒ no game. */
  readonly game?: DemoChatGame;
}

/** The rpg-lite game an example is born with — the same `ruleset` setting the live `startAsGame` door takes. */
export interface DemoChatGame {
  /** The RULESET the example is born with, DERIVED from rpg's own tuple (never re-spelled); entry hands it
   *  straight to rpg's real create door, which owns the ruleset→vocabulary derivation (#862). */
  readonly ruleset: RpgRuleset;
  /** The hand-authored OPENING STATE, replayed through rpg's real hand doors right after the game is minted
   *  (owner-sanctioned: hand ops on top of a real playthrough are a host editing their own game). Absent ⇒
   *  the example's game is born empty — which is what shipped first and read as an unbuilt panel. */
  readonly setup?: DemoChatGameSetup;
}

/** The authored opening state, in the shape of the FOUR real hand doors that write it: `updateConfig`
 *  (tracker defs) → `patchSheet`/`patchActor` (per actor) → `upsertQuest` → `addJournalEntry`, then the
 *  snapshot planes through `editSnapshot`. Deliberately NOT a snapshot IMAGE: the actor plane is op-shaped by
 *  law (R1 `RPG_OP_SHAPED_PLANES`), and an image is exactly the contract that plane was taken away from. */
export interface DemoChatGameSetup {
  /** The tracker defs this example ADDS on top of the ones its profile seeds. The write is a whole-list
   *  replace, so entry composes `[...rpgSeedTrackers(profile), ...trackers]` — the seeded defs are DERIVED
   *  from rpg's own contract data at the seam, never re-spelled in a manifest that would then rot when the
   *  seed set changes. */
  readonly trackers?: readonly RpgTrackerDef[];
  /** The hand-editable snapshot planes (`editSnapshot`): ambient (`location`/`weather`/`clock`/
   *  `calendarDate`), `recentEvents`, game-subject `trackerValues`, `plot`. Typed as the verb's own patch
   *  shape — the verb validates each plane at the write boundary and refuses an unknown key as DATA.
   *  `presentCharacters` is NOT authored here: it holds resolved actor-ref KEYS, which a manifest cannot
   *  spell, so scene presence rides each actor block's `present` flag and entry derives the plane. */
  readonly snapshot?: Readonly<Record<string, unknown>>;
  readonly actors?: readonly DemoChatGameActor[];
  readonly quests?: readonly DemoChatGameQuest[];
  readonly journal?: readonly DemoChatGameJournalEntry[];
}

/** WHICH actor an authored block addresses. `player` is the point of the indirection: the receiving user's
 *  own seat, resolved per-install, so a demo can never freeze the fixture author's identity into a shipped
 *  game (the owner-reported "the game says my player is `owner`" defect). */
export type DemoChatActorSeat =
  | { readonly kind: "player" }
  /** A seated card, by the manifest handle it was resolved from. */
  | { readonly kind: "handle"; readonly handle: CharacterHandle }
  /** A scene-only NPC the transcript introduced — minted by the first hand op on it (`patchActor` mints an
   *  absent target). The slug MUST already be canonical (`rpgNpcSlug`), which the wire enforces. */
  | { readonly kind: "npc"; readonly slug: string };

/** One actor's authored opening: its sheet (`patchSheet`), its volatile ops (`patchActor`), and whether it
 *  stands in the closing scene (the presence plane). */
export interface DemoChatGameActor {
  readonly seat: DemoChatActorSeat;
  readonly sheet?: {
    readonly className?: string;
    readonly attributes?: Readonly<Record<string, number>>;
    readonly flavor?: string;
    readonly level?: number | null;
    /** The per-actor tracker exceptions — how an example shows the applicability model (a talking SWORD
     *  carries no health track). */
    readonly trackerGrants?: readonly string[];
    readonly trackerRevokes?: readonly string[];
  };
  readonly ops?: readonly RpgActorOp[];
  /** Stands in the scene at the transcript's last beat. Entry projects these to `presentCharacters`. */
  readonly present?: boolean;
}

/** One authored quest (`upsertQuest` — the id is server-minted). Structural-only (reached through
 *  {@link DemoChatGameSetup}); not exported, so it never becomes a second importable name for the shape. */
interface DemoChatGameQuest {
  readonly name: string;
  readonly status: RpgQuestStatus;
  readonly description: string;
  readonly objectives: readonly { readonly text: string; readonly completed: boolean }[];
}

/** One authored journal entry (`addJournalEntry` — a hand entry, every-lineage). Structural-only, as above. */
interface DemoChatGameJournalEntry {
  readonly type: RpgJournalType;
  readonly title: string;
  readonly content: string;
}

/** One resolved roster seat handed to the game door: the manifest handle + the card it resolved to, so the
 *  authored `handle` seats become real `{kind:"character"}` actor refs at the entry seam (domain/chat never
 *  spells an rpg actor ref). */
export interface DemoChatSeat {
  readonly handle: CharacterHandle;
  readonly characterId: CharacterId;
}

export interface DemoChatSeederDeps {
  /** The bundled transcript's text for a manifest `slug`, or null when the file is absent (skip that one). */
  readonly readTranscript: (slug: string) => Promise<string | null>;
  /** Resolve one of THIS user's seeded cards by handle, with its DISPLAY NAME (the transcript attributes its
   *  lines by name, so the seat map is name-keyed). Null ⇒ the pack did not seed it (skip the example). */
  readonly findCharacterByHandle: (args: {
    readonly principal: Principal;
    readonly handle: CharacterHandle;
  }) => Promise<{ readonly characterId: CharacterId; readonly name: string } | null>;
  /** Chat's own canon-safe bulk write — the ONE chat-write seam (D34 Option B), never a raw INSERT. */
  readonly writeChats: BulkImportChats;
  /** THE RECEIVING USER'S persona for the host seat — `seeds.currentPersonaId ?? seeds.defaultPersonaId`,
   *  the same chain `startChat` walks. `null` only when the persona seeder has not run / the user cleared
   *  both, and the seat then falls back to the account handle exactly as it does live.
   *
   *  WHY IT EXISTS: an example seeded with a persona-less host seat reads as "Playing as None" in the persona
   *  panel AND resolves the rpg player actor's name to the ACCOUNT HANDLE ("owner") — one null, two
   *  owner-visible defects (08-03). A seeded conversation is the user's own room; it opens playing as them. */
  readonly resolveSeatPersona: (principal: Principal) => Promise<PersonaId | null>;
  /** Mint the rpg-lite game for a seeded room through rpg's real create door, then replay `game.setup`
   *  through the hand doors. Absent ⇒ examples seed game-less (the rpg example still reads as a transcript;
   *  nothing else regresses). `seats` carries the manifest handle → card mapping the setup's `handle` seats
   *  resolve through. Idempotent BY CONTRACT: the setup replay applies only onto a still-born game state, so
   *  the pack-bump heal can call it on an example whose game the user has since played. */
  readonly createGame?: (args: {
    readonly principal: Principal;
    readonly chatId: ChatId;
    readonly game: DemoChatGame;
    readonly seats: readonly DemoChatSeat[];
    /** `true` on a freshly-written example (the game must be minted); `false` on the pack-bump heal, whose
     *  room already carries one. */
    readonly mint: boolean;
  }) => Promise<void>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  readonly markSeeded: (principal: Principal) => Promise<void>;
  /** Reads `onboarding.demoChatsPackVersion` — the EXAMPLE pack this library's copies were last dressed to. */
  readonly readPackVersion: (principal: Principal) => Promise<number>;
  readonly markPackVersion: (principal: Principal, version: number) => Promise<void>;
  /** Reads `onboarding.demoChatsSkipped` — the slugs a previous seed pass could not write (#1550). Empty is
   *  the overwhelming case AND the fail-closed default: no recorded skip ⇒ nothing is retried. */
  readonly readSkippedSlugs: (principal: Principal) => Promise<readonly string[]>;
  /** Replaces `onboarding.demoChatsSkipped` WHOLE (never a merge): the seeder computes the new set from the
   *  pass it just ran, and a slug that landed must LEAVE the list — a merge could never remove one. */
  readonly markSkippedSlugs: (principal: Principal, slugs: readonly string[]) => Promise<void>;
  /** The pack-bump HEAL's read: this library's copy of one example (by its stable `importHash`) with the
   *  dressing fields the heal fills, or `null` when the user has no such example (deleted / never seeded —
   *  the heal never re-creates one; the latch owns deletion-respect). */
  readonly readSeededChat?: (args: { readonly principal: Principal; readonly importHash: string }) => Promise<SeededChatDressing | null>;
  /** Bind the host seat's persona on an ALREADY-seeded example (chat's own anchor-persona door). Called only
   *  when the seat carries none. */
  readonly bindSeatPersona?: (args: { readonly principal: Principal; readonly chatId: ChatId; readonly personaId: PersonaId }) => Promise<void>;
  /** Set the curated room background on an already-seeded example (chat's own `setChatBackground` door).
   *  Called only when the room carries none. */
  readonly setChatBackground?: (args: { readonly principal: Principal; readonly chatId: ChatId; readonly background: ThemeBackground }) => Promise<void>;
  /** The injected clock — the fallback timestamp for a transcript that carries no dates. */
  readonly now: () => number;
}

/** What the heal needs to know about an already-seeded example: its id + which dressing fields are still at
 *  their seeded default. Only ABSENCE is actionable — the heal fills a hole, it never overwrites a value
 *  (a user who picked their own background/persona in their copy of an example keeps it). */
export interface SeededChatDressing {
  readonly chatId: ChatId;
  /** `true` ⇒ the host seat already plays as some persona (heal skips). */
  readonly hasSeatPersona: boolean;
  /** `true` ⇒ the room already carries a chat-set background (heal skips). */
  readonly hasBackground: boolean;
}

export interface DemoChatSeeder {
  /** Idempotent + never throws; safe on every request (an in-process memo makes steady-state a Set lookup). */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
