// domain/chat/seeder/demo-chats — the EXAMPLE-conversation manifest (6 chats: 3 solo, 3 group, one of
// them rpg-lite). The sibling of `domain/character/seeder/cards.ts`.
//
// THE TRANSCRIPTS ARE NOT HERE, AND ARE NOT HAND-WRITTEN. Owner law: demo chats are GENERATED LIVE against
// a real model and exported through the real export verb — never authored by hand. Each conversation was
// driven through `chat.startChat` → `chat.send` on a fresh install (the casting is
// `docs/design/default-character-roster.md` §Demo-chat casting) and its transcript is the VERBATIM output
// of `GET /api/export/chat/:id?format=jsonl`, bundled at `entry/boot/seed-assets/demo-chats/<slug>.jsonl`.
// Re-generate a transcript; never edit one.
//
// This file carries only what the ST-flavoured transcript CANNOT: which seeded cards sit in the room and in
// what order, the room-behavior blob (group grammar / opening policy), and the rpg profile. The three group
// examples deliberately cover the three viewer-visible room grammars — per-speaker×merged, per-speaker×
// scoped, and narrator — so the pack demonstrates the axis rather than one point on it.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { DemoChat } from "../contract/seeder";

/** The label every seeded example wears (owner law: an example is CLEARLY an example, never mistakable for
 *  the user's own history). One home — the seeder never re-spells it and the titles below embed it. */
export const DEMO_CHAT_TITLE_PREFIX = "Example — ";

export const DEMO_CHATS: readonly DemoChat[] = [
  // ── SOLO ──────────────────────────────────────────────────────────────────────────────────────────
  {
    slug: "hana-bench",
    title: `${DEMO_CHAT_TITLE_PREFIX}The Bench After the Rift`,
    handles: ["hana"],
  },
  {
    slug: "elias-marginalia",
    title: `${DEMO_CHAT_TITLE_PREFIX}Volume 4,113`,
    handles: ["elias"],
  },
  {
    slug: "birdie-rust",
    title: `${DEMO_CHAT_TITLE_PREFIX}The Rust Lecture`,
    handles: ["birdie"],
  },

  // ── GROUP: per-speaker × merged, `list` arbitration (Charlotte chairs a fixed rotation) ───────────
  {
    slug: "second-opinion",
    title: `${DEMO_CHAT_TITLE_PREFIX}Second Opinion`,
    handles: ["assistant", "jfc-coder"],
    metadata: {
      group: { ...DEFAULT_GROUP_CONFIG, output: "per-speaker", policy: "list", cardScope: "merged" },
      opening: "greet-all",
    },
  },

  // ── GROUP: per-speaker × SCOPED, `natural` arbitration (two opposite engines, separate card context) ──
  {
    slug: "midnight-run",
    title: `${DEMO_CHAT_TITLE_PREFIX}Midnight Run`,
    handles: ["niko", "kohaku"],
    metadata: {
      group: { ...DEFAULT_GROUP_CONFIG, output: "per-speaker", policy: "natural", cardScope: "scoped" },
      opening: "greet-all",
    },
  },

  // ── GROUP: NARRATOR output + rpg-lite ON — the flagship. Every AI slot in this transcript is voiced by
  //    the room's synthetic group identity (the `narrator` arm of the bulk write), which is exactly how a
  //    live narrator round commits.
  {
    slug: "ashen-spire",
    title: `${DEMO_CHAT_TITLE_PREFIX}The Ashen Spire`,
    handles: ["sabine", "calamity", "morgatha"],
    metadata: {
      group: {
        // The narrator arm is `z.strictObject` and OMITS `cardScope` by construction (narrator ⇒ merged is
        // made unrepresentable), so this one cannot spread the per-speaker default — it is spelled whole.
        output: "narrator",
        policy: "natural",
        speakerTags: true,
        groupNudge: true,
        autoMode: DEFAULT_GROUP_CONFIG.autoMode,
        autoModeMaxTurns: DEFAULT_GROUP_CONFIG.autoModeMaxTurns,
        autoModeDelayMs: DEFAULT_GROUP_CONFIG.autoModeDelayMs,
        allowSelfResponses: DEFAULT_GROUP_CONFIG.allowSelfResponses,
        memberCardVisibility: DEFAULT_GROUP_CONFIG.memberCardVisibility,
      },
      opening: "greet-all",
    },
    game: { profile: "d20" },
  },
];

/** The exported speaker NAME a narrator-voiced slot carries — the synthetic group card's name
 *  (`domain/character/substrate/group-character.ts` `buildGroupCard()`). The transcripts are produced by our
 *  own export verb, which resolves an assistant slot's name off its authoring character row, so a narrator
 *  turn always exports under this exact name. Recognised here so the seeder can route those slots back to a
 *  freshly minted synthetic identity instead of mis-attributing them to a roster card. */
export const DEMO_CHAT_NARRATOR_NAME = "Group";
