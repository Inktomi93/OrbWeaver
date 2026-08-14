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
// WHICH example wears WHICH grammar: the rpg flagship needs to be a REAL session — separate seats acting on
// their own turns while the board moves, not narrator mode — so the Ashen Spire takes `per-speaker`, and the
// NARRATOR grammar sits on Second Opinion (a chaired two-expert round-table is exactly a merged-voice scene).
// All three grammars ship, each on the example it actually fits.
//
// THE CURATED ROOM BACKGROUNDS. A SOLO example needs none: its one card's `backgroundOverride` paints
// through the BG-C card arm. A GROUP example has two or three cards and therefore no non-arbitrary card to
// pick from, so the card arm stays true-solo-only by ruling and the room paints only what its HOST chose —
// which for a shipped example is this manifest. The pick is the PRIMARY seat's own plate (the room is that
// character's scene), with one deliberate exception: the Ashen Spire takes `morgatha-bg`, the plate that
// literally depicts the location the whole transcript is set in, rather than primary-seat Sabine's tavern.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DemoChat, DemoChatGameSetup } from "../contract/seeder.ts";

/** The label every seeded example wears (owner law: an example is CLEARLY an example, never mistakable for
 *  the user's own history). One home — the seeder never re-spells it and the titles below embed it. */
export const DEMO_CHAT_TITLE_PREFIX = "Example — ";

/** The shipped EXAMPLE pack's version, stamped at `onboarding.demoChatsPackVersion` once a library holds it.
 *  BUMP IT whenever the manifest's DRESSING changes (a curated background, the game setup) — the seeder's
 *  heal then fills those fields on already-seeded copies that still sit at their seeded default. The
 *  transcripts themselves are immutable and are NOT what this version tracks: a transcript baked with a
 *  stale display identity (e.g. the persona rename) can ONLY be fixed by re-generating it — the
 *  re-generate-never-edit law applies to transcript bytes, never a hand patch. */
export const DEMO_CHAT_PACK_VERSION = 3;

/** A bundled seeded-plate background source. Built through the CONTRACT schema (which defaults the six
 *  non-seeded fields), never a hand-spelled seven-key literal. */
function seededBackground(seededId: string): ThemeBackground {
  return themeBackgroundSchema.parse({ kind: "seeded", seededId });
}

/** THE FLAGSHIP'S BOARD — the Ashen Spire's game state as the session ACTUALLY ENDED, captured off the live
 *  game the shipped transcript is the prose of (`rpg.getTrackerView` + `rpg.listJournal`, translated back into
 *  the hand-door op vocabulary that writes it).
 *
 *  WHY IT IS DATA AND NOT A REPLAY OF THE SESSION. An export carries prose, not snapshots, so a seeded example
 *  cannot recover its board from its own transcript — and re-deriving it would mean re-running a paid
 *  multi-model conversation on every install. So the board ships as the manifest's own data and replays through
 *  rpg's REAL hand doors (`updateConfig` → `patchSheet`/`patchActor` → `upsertQuest` → `addJournalEntry` →
 *  `editSnapshot`) at seed time: a virgin boot reproduces the flagship's panels EXACTLY, with zero model calls.
 *
 *  v3 CHANGED HOW IT IS OBTAINED. The v2 board was hand-written prose about a playthrough. This one was PLAYED:
 *  the session ran turn by turn with rpg-lite on, the model's own extraction moved meters, ticked objectives,
 *  minted Corvain and wrote journal beats as the story went, and the host closed the session by tidying what
 *  the extraction under-filled (the ward-burn, the spent stamina, the last of the rations) — the same two
 *  gestures any host has. What is below is the readback of that board, so every number in it is a thing that
 *  happened in the transcript beside it.
 *
 *  The `player` seat is the indirection that matters: it resolves to the RECEIVING user at seed, so no install
 *  ever inherits the generating account's identity. */
const ASHEN_SPIRE_SETUP: DemoChatGameSetup = {
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
    {
      key: "supplies",
      label: "Supplies",
      shape: "meter",
      write: "delta",
      subject: "game",
      appliesTo: "everyone",
      max: 10,
      hint: "rations, lamp oil and bandage linen the party still carries up the mountain",
      color: "#5a8f6b",
      icon: null,
      sort: 3,
      pinned: true,
      locked: false,
    },
  ],
  snapshot: {
    location: "The Ashen Spire — the throne hall, a fire built off the draft-line and the last of the rations on it",
    calendarDate: "the second night on the mountain",
    clock: {
      day: 2,
      hour: 21,
      minute: 40,
    },
    weather: {
      type: "ash",
      label: "ash turning in windless air",
    },
    recentEvents: [
      "Terms were said out loud at the fire with a quartermaster listening, and sealed with a handshake.",
      "Two hundred stairs of black glass; the eighth landing's Keening Ward was read whole instead of broken, at the cost of two burned palms and a nosebleed.",
      "The throne-room doors were knocked on. Someone lifted the bar from the other side.",
      "The man holding the seal shut is Corvain — Morgatha's elder brother, who stayed and kept singing.",
      "The tin behind the throne, sealed nine hundred years, went into his hands rather than onto the floor.",
    ],
    trackerValues: {
      wardsong: {
        value: 88,
      },
      supplies: {
        value: 0,
      },
    },
    plot: {
      act: 3,
      title: "The Ashen Spire",
      acts: [
        {
          title: "Terms at the Fire",
          summary: "An arrangement gets made, on the record.",
        },
        {
          title: "Two Hundred Stairs",
          summary: "The climb, and the ward-stone set into the eighth landing.",
        },
        {
          title: "The Knock",
          summary: "The throne-room door is knocked on rather than broken, and the thing behind it turns out to be a brother.",
        },
      ],
    },
  },
  actors: [
    {
      seat: {
        kind: "player",
      },
      present: true,
      sheet: {
        className: "Envoy",
        level: 2,
        flavor: "Talks first, and has yet to be wrong about it in a way that got anyone killed.",
        attributes: {
          str: 9,
          dex: 12,
          con: 11,
          int: 14,
          wis: 15,
          cha: 16,
        },
      },
      ops: [
        {
          op: "setTracker",
          key: "hp",
          value: {
            value: 17,
            max: 20,
          },
        },
        {
          op: "setTracker",
          key: "stamina",
          value: {
            value: 2,
            max: 6,
          },
        },
        {
          op: "setStatus",
          status: "Palms bandaged, nose stopped, sitting on the floor of a throne room with the whole braided pattern still in his teeth.",
        },
        {
          op: "addCondition",
          condition: {
            name: "Ward-Burned",
            stat: null,
            modifier: 0,
            turnsLeft: null,
          },
        },
        {
          op: "addItem",
          item: {
            name: "Envoy's letter-case",
            quantity: 1,
            type: "gear",
            location: "carried",
            description: "Sealing wax, three blank sheets, and a nib that has outlived two employers.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "Waterskin",
            quantity: 2,
            type: "consumable",
            location: "pack",
            description: "Full. For now.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "The braided pattern",
            quantity: 1,
            type: "relic",
            location: "carried",
            description: "Read whole off the eighth-landing stone and not let go of — the Ward's low line, and the second thread that catches.",
          },
        },
        {
          op: "setWalletAmount",
          name: "silver marks",
          amount: 22,
        },
      ],
    },
    {
      seat: {
        kind: "handle",
        handle: castId<CharacterHandle>("sabine"),
      },
      present: true,
      sheet: {
        className: "Sellsword-Captain",
        level: 4,
        flavor: "The only person present who has ever filed a quartermaster's report, which as of now makes her the adult.",
        attributes: {
          str: 15,
          dex: 14,
          con: 14,
          int: 12,
          wis: 13,
          cha: 11,
        },
      },
      ops: [
        {
          op: "setTracker",
          key: "hp",
          value: {
            value: 20,
            max: 20,
          },
        },
        {
          op: "setTracker",
          key: "stamina",
          value: {
            value: 3,
            max: 6,
          },
        },
        {
          op: "setStatus",
          status: "Fire built off the draft-line, the last of the rations on it, holding the room exactly as ordered.",
        },
        {
          op: "addItem",
          item: {
            name: "Quartermaster's pack",
            quantity: 1,
            type: "gear",
            location: "carried",
            description: "Rule one: nobody touches it.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "Arming sword",
            quantity: 1,
            type: "weapon",
            location: "carried",
            description: "Plain, well-kept, re-hilted twice.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "Bandage linen",
            quantity: 2,
            type: "",
            location: "",
            description: "",
          },
        },
        {
          op: "setWalletAmount",
          name: "silver marks",
          amount: 61,
        },
      ],
    },
    {
      seat: {
        kind: "handle",
        handle: castId<CharacterHandle>("calamity"),
      },
      present: true,
      sheet: {
        className: "Doomblade of the Ninth Epoch",
        level: 9,
        flavor: "Forged to end things. Currently strapped to a back, being carried up two hundred stairs.",
        attributes: {
          str: 18,
          dex: 6,
          con: 20,
          int: 13,
          wis: 8,
          cha: 17,
        },
        trackerRevokes: ["hp", "stamina"],
      },
      ops: [
        {
          op: "setStatus",
          status: "Sheathed, gold-banked and steady, holding a room for the first time in six thousand years without anything ending.",
        },
        {
          op: "addItem",
          item: {
            name: "The Ninth Epoch's edge",
            quantity: 1,
            type: "weapon",
            location: "carried",
            description: "Itself. It insists this counts as inventory.",
          },
        },
      ],
    },
    {
      seat: {
        kind: "handle",
        handle: castId<CharacterHandle>("morgatha"),
      },
      present: true,
      sheet: {
        className: "The Undying Dark",
        level: 12,
        flavor: "Nine hundred years, two hundred and twelve after-action reports, and one tin she cannot open.",
        attributes: {
          str: 10,
          dex: 11,
          con: 20,
          int: 18,
          wis: 17,
          cha: 16,
        },
      },
      ops: [
        {
          op: "setTracker",
          key: "hp",
          value: {
            value: 20,
            max: 20,
          },
        },
        {
          op: "setTracker",
          key: "stamina",
          value: {
            value: 4,
            max: 6,
          },
        },
        {
          op: "setStatus",
          status: "Sitting on the floor rather than the throne, nine hundred years of arithmetic arriving late.",
        },
        {
          op: "addCondition",
          condition: {
            name: "Unperforming",
            stat: null,
            modifier: 0,
            turnsLeft: null,
          },
        },
        {
          op: "addItem",
          item: {
            name: "The Spire's keys",
            quantity: 1,
            type: "gear",
            location: "carried",
            description: "Hers. Nine hundred years of them.",
          },
        },
        {
          op: "addItem",
          item: {
            name: "Ledger of after-action reports",
            quantity: 1,
            type: "document",
            location: "pack",
            description: "Two hundred and twelve entries. She has read them all more than once.",
          },
        },
        {
          op: "setWalletAmount",
          name: "silver marks",
          amount: 0,
        },
      ],
    },
    {
      seat: {
        kind: "cast",
        slug: "corvain",
      },
      present: true,
      ops: [
        {
          op: "setIdentityText",
          field: "name",
          text: "Corvain",
        },
        {
          op: "setIdentityText",
          field: "emoji",
          text: "🕯️",
        },
        {
          op: "setIdentityText",
          field: "mood",
          text: "rusted open; holding a tin instead of a note for the first time in nine hundred years",
        },
        {
          op: "setIdentityText",
          field: "appearance",
          text: "Ash-grey robes gone the colour of the floor from long sitting, and Morgatha's own violet in his eyes.",
        },
        {
          op: "setIdentityText",
          field: "outfit",
          text: "A warden's grey, worn through at the knees.",
        },
        {
          op: "setIdentityText",
          field: "thoughts",
          text: "That the note was never the promise. That someone finally knocked.",
        },
        {
          op: "setRelationship",
          relationship: {
            kind: "ally",
            label: "",
          },
        },
        {
          op: "setTracker",
          key: "hp",
          value: {
            value: 12,
            max: 20,
          },
        },
        {
          op: "setStatus",
          status: "Both hands still flat on the seal — but one of them is closing around a tin now.",
        },
        {
          op: "addCondition",
          condition: {
            name: "Nine-Hundred-Year Ache",
            stat: null,
            modifier: 0,
            turnsLeft: null,
          },
        },
        {
          op: "addItem",
          item: {
            name: "Morgatha's sealed tin",
            quantity: 1,
            type: "relic",
            location: "carried",
            description: "Wax unbroken since the year he stopped answering when she called down the stair. Put into his hands, not onto the floor.",
          },
        },
      ],
    },
  ],
  quests: [
    {
      name: "Terms with the Dark Lady",
      status: "completed",
      description: "Get the arrangement said out loud, with a quartermaster listening.",
      objectives: [
        {
          text: "Hear Sabine's read before agreeing",
          completed: true,
        },
        {
          text: "Make her commit to terms on the record",
          completed: true,
        },
      ],
    },
    {
      name: "The Seal at the Spire's Heart",
      status: "active",
      description: "Morgatha's door is failing, and the thing that holds it shut is not a spell.",
      objectives: [
        {
          text: "Take the Dark Lady's invitation — properly, on the record",
          completed: true,
        },
        {
          text: "Climb to the throne hall",
          completed: true,
        },
        {
          text: "Read the Keening Ward without breaking it",
          completed: true,
        },
        {
          text: "Find out who is holding the seal shut",
          completed: true,
        },
        {
          text: "Decide what happens to the note Corvain has held for nine hundred years",
          completed: false,
        },
      ],
    },
    {
      name: "The Tin Behind the Throne",
      status: "completed",
      description: "Sealed the year Corvain stopped answering, and reserved — she said — for the first challenger to surprise her.",
      objectives: [
        {
          text: "Ask about the tin instead of the seal",
          completed: true,
        },
        {
          text: "Put it in his hands, not on the floor",
          completed: true,
        },
      ],
    },
  ],
  journal: [
    {
      type: "event",
      title: "Nobody knocked, in nine hundred years",
      content:
        "Two hundred and twelve heroes broke the doors, blasted them, or asked them a riddle. The party knocked, and a hand on the other side lifted the bar.",
    },
    {
      type: "npc",
      title: "Corvain, who stayed",
      content:
        "Found seated at the base of the throne with both hands flat on the seal, in robes gone the colour of the floor. Morgatha's elder brother — the one who stayed and kept singing while she left and built a spire, a catalogue and a reputation on top of the note he was holding.",
    },
    {
      type: "location",
      title: "The Keening Ward",
      content:
        "Set into the eighth landing of the black glass stair. It does not repel what comes through the door — it sings the door shut, and it has held that note for nine hundred years. Read with both hands flat: the low line is the Ward itself, patient and still true; the second thread, higher and thinner, catches.",
    },
    {
      type: "npc",
      title: "Corvain, Keeper of the Note",
      content:
        "Behind the throne hall doors: not a monster, but Corvain — Morgatha's brother, unlisted in nine hundred years of her ledger. He has held the Keening Ward's note since before Morgatha built her spire or her catalogue, keeping a promise she no longer remembers making. The Ward is failing because the man holding it has been forgotten by the very person he swore it to.",
    },
    {
      type: "event",
      title: "Terms at the Fire",
      content:
        "Morgatha laid out her terms plainly under Sabine's questioning: the Keening Ward is failing not like a broken spell but like a note going flat, and she wants it read honestly, not fought over. She swore no trap, no oath-trick on the climb. Calamity, dropping its bravado, compared the failing Ward to an old bell gone hoarse from habit instead of belief — and volunteered, unprompted, to listen for whoever has stopped truly ringing it. Sabine is recording all of it for the record.",
    },
    {
      type: "npc",
      title: "Morgatha, the Undying Dark",
      content:
        "Walked into our firelight unarmed and sat down on a log like it was a throne. Claims the mess we are walking into is centred on her tower, which makes it her business.",
    },
    {
      type: "location",
      title: "The Ashen Spire",
      content: "A black glass tower on a mountain that has been shedding ash for nine hundred years. Nobody local will name it after dark.",
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

  // ── GROUP: NARRATOR output, `list` arbitration (Charlotte chairs a fixed rotation) — the merged-voice
  //    grammar, where one synthetic room identity writes both experts' lines in a single scene block.
  {
    slug: "second-opinion",
    title: `${DEMO_CHAT_TITLE_PREFIX}Second Opinion`,
    handles: ["assistant", "jfc-coder"],
    metadata: {
      group: {
        // The narrator arm is `z.strictObject` and OMITS `cardScope` by construction (narrator ⇒ merged is
        // made unrepresentable), so it cannot spread the per-speaker default — it is spelled whole.
        output: "narrator",
        policy: "list",
        speakerTags: true,
        groupNudge: DEFAULT_GROUP_CONFIG.groupNudge,
        autoMode: DEFAULT_GROUP_CONFIG.autoMode,
        autoModeMaxTurns: DEFAULT_GROUP_CONFIG.autoModeMaxTurns,
        autoModeDelayMs: DEFAULT_GROUP_CONFIG.autoModeDelayMs,
        allowSelfResponses: DEFAULT_GROUP_CONFIG.allowSelfResponses,
        memberCardVisibility: DEFAULT_GROUP_CONFIG.memberCardVisibility,
      },
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

  // ── GROUP: per-speaker × merged, `natural` arbitration + rpg-lite ON — THE FLAGSHIP, and the pack's one
  //    real tabletop session: three separate seats answer on their own turns (a round commonly commits two or
  //    three of them), the party sheet is filled for every actor, and the board moves as the story does.
  {
    slug: "ashen-spire",
    title: `${DEMO_CHAT_TITLE_PREFIX}The Ashen Spire`,
    handles: ["sabine", "calamity", "morgatha"],
    metadata: {
      group: { ...DEFAULT_GROUP_CONFIG, output: "per-speaker", policy: "natural", cardScope: "merged" },
      opening: "greet-all",
      background: seededBackground("morgatha-bg"),
    },
    game: { profile: "d20", setup: ASHEN_SPIRE_SETUP },
  },
];

/** The exported speaker NAME a narrator-voiced slot carries — the synthetic group card's name
 *  (`domain/character/substrate/group-character.ts` `buildGroupCard()`). The transcripts are produced by our
 *  own export verb, which resolves an assistant slot's name off its authoring character row, so a narrator
 *  turn always exports under this exact name.
 *
 *  IT NO LONGER ROUTES ANYTHING (D129). The seeder used to recognise this name to send those slots to a freshly
 *  minted synthetic identity; the pack DECLARES its narrator rows now (`extra.type`), so the name is back to
 *  being what it always was — a display string — and survives only as the pack's own vocabulary, used by the
 *  asset-shape test to tell narrator lines from cast lines in the raw JSONL. */
export const DEMO_CHAT_NARRATOR_NAME = "Group";
