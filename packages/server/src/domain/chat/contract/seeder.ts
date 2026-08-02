// domain/chat/contract/seeder — the demo-chat seeder's typed surface; seeder/ implements
// createDemoChatSeeder over these. The sibling of `domain/character/contract/seeder.ts` (the
// `types-in-contract` gate forbids an exported type living in `seeder/`).
//
// Wired by entry over chat's own bulk-import write op, with the transcript READ + the settings latch + the
// character lookup injected — so domain/chat never touches the filesystem and never imports
// domain/settings or domain/character.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { RpgPackagedProfileKey } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { BulkImportChats } from "./import";

/** One bundled EXAMPLE conversation. The transcript itself is NOT here — it is the verbatim output of the
 *  real export verb, bundled as `entry/boot/seed-assets/demo-chats/<slug>.jsonl` and handed in by the
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

/** The rpg-lite game an example is born with — the same `statProfile` the live `startAsGame` door takes. */
export interface DemoChatGame {
  /** A packaged profile key, DERIVED from rpg's own tuple (never re-spelled); entry resolves it through
   *  `RPG_PACKAGED_PROFILE_BY_KEY` and hands rpg's real create door the profile data. */
  readonly profile: RpgPackagedProfileKey;
}

export interface DemoChatSeederDeps {
  /** The bundled transcript's text for a manifest `slug`, or null when the file is absent (skip that one). */
  readonly readTranscript: (slug: string) => Promise<string | null>;
  /** Resolve one of THIS user's seeded cards by handle, with its DISPLAY NAME (the transcript attributes its
   *  lines by name, so the seat map is name-keyed). Null ⇒ the pack did not seed it (skip the example). */
  readonly findCharacterByHandle: (args: {
    readonly principal: Principal;
    readonly handle: string;
  }) => Promise<{ readonly characterId: CharacterId; readonly name: string } | null>;
  /** Chat's own canon-safe bulk write — the ONE chat-write seam (D34 Option B), never a raw INSERT. */
  readonly writeChats: BulkImportChats;
  /** Mint the rpg-lite game for a seeded room through rpg's real create door. Absent ⇒ examples seed
   *  game-less (the rpg example still reads as a transcript; nothing else regresses). */
  readonly createGame?: (args: { readonly principal: Principal; readonly chatId: ChatId; readonly game: DemoChatGame }) => Promise<void>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  readonly markSeeded: (principal: Principal) => Promise<void>;
  /** The injected clock — the fallback timestamp for a transcript that carries no dates. */
  readonly now: () => number;
}

export interface DemoChatSeeder {
  /** Idempotent + never throws; safe on every request (an in-process memo makes steady-state a Set lookup). */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
