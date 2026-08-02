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
// what order, the room-behavior blob (group grammar / opening policy / the curated room background), and the
// rpg game. The three group examples deliberately cover the three viewer-visible room grammars —
// per-speaker×merged, per-speaker×scoped, and narrator — so the pack demonstrates the axis rather than one
// point on it.
//
// THE CURATED ROOM BACKGROUNDS (v2). A SOLO example needs none: its one card's `backgroundOverride` paints
// through the BG-C card arm. A GROUP example has two or three cards and therefore no non-arbitrary card to
// pick from, so the card arm stays true-solo-only by ruling and the room paints only what its HOST chose —
// which for a shipped example is this manifest. The pick is the PRIMARY seat's own plate (the room is that
// character's scene), with one deliberate exception: the Ashen Spire takes `morgatha-bg`, the plate that
// literally depicts the location the whole transcript is set in, rather than primary-seat Sabine's tavern.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { DemoChat, DemoChatGameSetup } from "../contract/seeder";

/** The label every seeded example wears (owner law: an example is CLEARLY an example, never mistakable for
 *  the user's own history). One home — the seeder never re-spells it and the titles below embed it. */
export const DEMO_CHAT_TITLE_PREFIX = "Example — ";

/** The shipped EXAMPLE pack's version, stamped at `onboarding.demoChatsPackVersion` once a library holds it.
 *  BUMP IT whenever the manifest's DRESSING changes (a curated background, the game setup) — the seeder's
 *  heal then fills those fields on already-seeded copies that still sit at their seeded default. The
 *  transcripts themselves are immutable and are NOT what this version tracks.
 *
 *  v2 (2026-08-03): the three group examples gained a curated room background (the BG-C takeover reaches a
 *  single-human GROUP room as of the same day's widening — before it, a group example could paint nothing at
 *  all and read as "no character background"), every example seats the receiving user's own persona, and the
 *  flagship carries a real authored game state instead of a born-empty panel. */
export const DEMO_CHAT_PACK_VERSION = 2;

/** A bundled seeded-plate background source. Built through the CONTRACT schema (which defaults the six
 *  non-seeded fields), never a hand-spelled seven-key literal. */
function seededBackground(seededId: string): ThemeBackground {
  return themeBackgroundSchema.parse({ kind: "seeded", seededId });
}

/** THE FLAGSHIP'S AUTHORED GAME STATE — the Ashen Spire's board as it stands at the transcript's last beat.
 *
 *  WHY IT IS HAND-AUTHORED. The transcript is a real playthrough, but its game state was never extracted
 *  (the examples are seeded from an EXPORT, and an export carries the prose, not the snapshot), so the
 *  flagship's panel opened empty — a showcase of a system with nothing in it. Every line below is written
 *  through a REAL hand door (`updateConfig` · `patchSheet` · `patchActor` · `upsertQuest` ·
 *  `addJournalEntry` · `editSnapshot`), which is precisely the workflow of a host who plays a session and
 *  then tidies the board afterwards — owner-sanctioned, and the only arm that does not require re-running a
 *  paid multi-model conversation to change a number.
 *
 *  It is authored to be TRUE to the transcript: the stairs, the Keening Ward, the tin behind the throne,
 *  Corin, and the four seats the story actually put in the room. Nothing here invents an event the
 *  conversation does not contain. */
const ASHEN_SPIRE_SETUP: DemoChatGameSetup = {
  // Two defs ON TOP of the profile's seeded `hp` — one per SUBJECT, so the panel demonstrates both halves of
  // the tracked-field axis (a per-actor meter you spend, and a game-wide gauge you observe).
  trackers: [
    {
      key: "stamina",
      label: "Stamina",
      shape: "meter",
      write: "delta",
      subject: "actor",
      appliesTo: "party",
      max: 6,
      hint: "the stairs take it; a real rest gives it back",
      color: "#c8a24a",
      icon: null,
      sort: 1,
      pinned: true,
      locked: false,
    },
    {
      key: "wardsong",
      label: "Wardsong",
      shape: "meter",
      write: "set",
      subject: "game",
      appliesTo: "everyone",
      max: 100,
      hint: "how strongly the Keening Ward still holds its note — the seal fails when it stops",
      color: "#7d5cc6",
      icon: null,
      sort: 2,
      pinned: true,
      locked: false,
    },
  ],
  snapshot: {
    location: "The Ashen Spire — the throne hall, at the top of the black glass stairs",
    calendarDate: "the third evening on the mountain",
    clock: { day: 3, hour: 21, minute: 40 },
    weather: { type: "ash", label: "ash falling past the window slits" },
    recentEvents: [
      "Morgatha made the invitation properly, on the record, with Sabine watching her commit to terms.",
      "Two hundred stairs of black glass; the eighth landing's Keening Ward let the party read it instead of breaking it.",
      "The tin behind the throne came open, and a hall that had not heard Ista's real voice in nine hundred years heard it.",
    ],
    trackerValues: { wardsong: { value: 88 } },
    plot: {
      act: 3,
      title: "The Ashen Spire",
      acts: [
        { title: "Terms at the Fire", summary: "A sellsword, a talking sword and the Dark Lady of the Spire agree to travel together — on the record." },
        { title: "Two Hundred Stairs", summary: "The climb, the Keening Ward, and the first honest count of what holds the seal shut." },
        { title: "The Knock", summary: "The throne-room door is knocked on rather than broken, and the thing behind it turns out to be a brother." },
      ],
    },
  },
  actors: [
    {
      seat: { kind: "player" },
      present: true,
      sheet: {
        className: "Envoy",
        level: 2,
        attributes: { str: 9, dex: 12, con: 11, int: 14, wis: 15, cha: 16 },
        flavor: "Climbs two hundred stairs to a door everyone says to break — and knocks on it instead.",
      },
      ops: [
        { op: "setTracker", key: "hp", value: { value: 17, max: 20 } },
        { op: "setTracker", key: "stamina", value: { value: 2, max: 6 } },
        { op: "setStatus", status: "Ward-touched — the seal's note is still ringing behind the teeth." },
        { op: "addCondition", condition: { name: "Ward-touched", stat: null, modifier: 0, turnsLeft: null } },
        {
          op: "addItem",
          item: {
            name: "Ista's tin",
            quantity: 1,
            type: "relic",
            location: "carried",
            description: "Wax-sealed for nine hundred years. Open. The only recording of a voice before the wall thinned it.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "Morgatha's terms, countersigned",
            quantity: 1,
            type: "document",
            location: "pack",
            description: "Made properly, on the record, because someone asked her to commit.",
          },
        },
        { op: "setWalletAmount", name: "silver marks", amount: 14 },
      ],
    },
    {
      seat: { kind: "handle", handle: "sabine" },
      present: true,
      sheet: {
        className: "Sellsword-Captain",
        level: 4,
        attributes: { str: 15, dex: 14, con: 14, int: 12, wis: 13, cha: 11 },
        flavor: "The only person present who has ever filed a quartermaster's report, which as of now makes her the adult.",
      },
      ops: [
        { op: "setTracker", key: "hp", value: { value: 20, max: 20 } },
        { op: "setTracker", key: "stamina", value: { value: 4, max: 6 } },
        { op: "setStatus", status: "Left of you and unarmed, hands open and visible — a choice, and she wants it legible." },
        { op: "addItem", item: { name: "Quartermaster's pack", quantity: 1, type: "gear", location: "carried", description: "Rule one: nobody touches it." } },
        { op: "setWalletAmount", name: "silver marks", amount: 61 },
      ],
    },
    {
      seat: { kind: "handle", handle: "calamity" },
      present: true,
      sheet: {
        className: "Doomblade of the Ninth Epoch",
        level: 9,
        attributes: { str: 18, dex: 6, con: 20, int: 13, wis: 8, cha: 17 },
        flavor: "Forged to end things. Currently strapped to a back, watching its wielder ask a door for its name.",
        // The applicability model, shown rather than described: a sword has no health track and does not tire.
        trackerRevokes: ["hp", "stamina"],
      },
      ops: [{ op: "setStatus", status: "Sheathed. Uncharacteristically quiet, and no cathedral in it at all." }],
    },
    {
      seat: { kind: "handle", handle: "morgatha" },
      present: true,
      sheet: {
        className: "The Undying Dark",
        level: 12,
        attributes: { str: 10, dex: 11, con: 20, int: 18, wis: 17, cha: 16 },
        flavor: "Nine hundred years, two hundred and twelve after-action reports, and one tin she could not open until tonight.",
      },
      ops: [
        { op: "setTracker", key: "hp", value: { value: 20, max: 20 } },
        { op: "setStatus", status: "Standing where she stood the night she let a sixteen-year-old sing herself into a wall." },
        { op: "addItem", item: { name: "The Spire's keys", quantity: 1, type: "gear", location: "carried", description: "Hers. Nine hundred years of them." } },
      ],
    },
    {
      // The scene NPC the story introduced — minted here by his first hand op (`patchActor` mints an absent
      // target), which is exactly how a host writes an NPC the extraction round never got to.
      seat: { kind: "cast", slug: "corin" },
      present: true,
      ops: [
        { op: "setIdentityText", field: "name", text: "Corin" },
        { op: "setIdentityText", field: "mood", text: "wrung out; unclenched for the first time in nine hundred years" },
        { op: "setIdentityText", field: "appearance", text: "A face too young for this, tears frozen on it in the cold coming off the seal." },
        { op: "setIdentityText", field: "outfit", text: "A warden's grey, worn thin at the knees from kneeling at the wall." },
        { op: "setIdentityText", field: "thoughts", text: "If he lets go of the seal, he thinks, he loses the last of his sister's voice." },
        { op: "setRelationship", relationship: { kind: "ally", label: "" } },
        { op: "setTracker", key: "hp", value: { value: 11, max: 20 } },
        { op: "setStatus", status: "Both hands still flat on the seal — but listening now." },
        { op: "addCondition", condition: { name: "Grief-frozen", stat: null, modifier: 0, turnsLeft: null } },
      ],
    },
  ],
  quests: [
    {
      name: "The Seal at the Spire's Heart",
      status: "active",
      description: "Morgatha's door is failing, and the thing that holds it shut is not a spell.",
      objectives: [
        { text: "Take the Dark Lady's invitation — properly, on the record", completed: true },
        { text: "Climb to the throne hall", completed: true },
        { text: "Read the Keening Ward without breaking it", completed: true },
        { text: "Find out who is holding the seal shut", completed: true },
        { text: "Decide what happens to Ista's note", completed: false },
      ],
    },
    {
      name: "Ista's Voice",
      status: "active",
      description: "A tin behind the throne, sealed since the night the wall took her.",
      objectives: [
        { text: "Learn about the tin", completed: true },
        { text: "Open it", completed: true },
        { text: "Give Corin his sister back", completed: false },
      ],
    },
    {
      name: "Terms with the Dark Lady",
      status: "completed",
      description: "Get the arrangement said out loud, with a quartermaster listening.",
      objectives: [
        { text: "Hear Sabine's read before agreeing", completed: true },
        { text: "Make her commit to terms on the record", completed: true },
      ],
    },
  ],
  journal: [
    {
      type: "location",
      title: "The Ashen Spire",
      content:
        "Black glass, two hundred-odd treads, and a Keening Ward set into the eighth landing. It does not repel what comes through the door — it sings the door shut, and it has held that one note for nine hundred years.",
    },
    {
      type: "npc",
      title: "Corin, the Griever",
      content:
        "Kneeling at the seal with both hands flat on it. His sister Ista was the last warden before Morgatha; she gave her voice to the wall at sixteen and Morgatha let her. He has been holding on ever since.",
    },
    {
      type: "event",
      title: "The tin behind the throne",
      content:
        "Sealed with her own sigil the night she closed it, and unopenable by her since. It came open tonight, and Ista's real voice — whole, laughing at something off-recording — filled a hall that had not heard it in nine hundred years.",
    },
  ],
};

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
      background: seededBackground("assistant-bg"),
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
      background: seededBackground("niko-bg"),
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
      background: seededBackground("morgatha-bg"),
    },
    game: { profile: "d20", setup: ASHEN_SPIRE_SETUP },
  },
];

/** The exported speaker NAME a narrator-voiced slot carries — the synthetic group card's name
 *  (`domain/character/substrate/group-character.ts` `buildGroupCard()`). The transcripts are produced by our
 *  own export verb, which resolves an assistant slot's name off its authoring character row, so a narrator
 *  turn always exports under this exact name. Recognised here so the seeder can route those slots back to a
 *  freshly minted synthetic identity instead of mis-attributing them to a roster card. */
export const DEMO_CHAT_NARRATOR_NAME = "Group";
