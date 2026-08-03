// The dev-only rpg game-seeder implementation (`__orb.seed`). Lives at the composition tier — sibling to
// main.tsx, NOT under features/ — because it drives the app's REAL `rpg.*` wire verbs (createGame,
// patchSheet, editSnapshot, patchActor, upsertQuest, updateConfig, addJournalEntry) against a FRESH character+chat it
// creates itself, so an audit/demo/live-verify pass stands up a fully-populated game in ONE call instead of
// hand-rolling tRPC seeders every time. Every write is the EXACT verb the real UI would call (the same wire
// schemas `use-rpg-mutations` rides) — never a parallel mutation path or a raw insert.
//
// TWO profiles, both seedable (owner-requested — both panel states must be testable):
//   • d20      — the full sheet: the six-attribute grid (str/dex/con/int/wis/cha) + level + trackers + the rest.
//   • freeform — everything EXCEPT the attribute grid (freeform has no attribute vocabulary — the sparser
//                Sheet look). Pools/inventory/cast/quests/journal/plot/scene all seed identically.
//
// PLANE MAP (which verb owns which datum):
//   • sheet identity (className/attributes/level/tracker grants) → `patchSheet` (the `character` ref)
//   • the SCENE half of the swipe-volatile plane (presentCharacters+relationships, plot, ambient,
//     recentEvents, game trackers) → `editSnapshot` (the [merge-clear] overlay)
//   • the per-ACTOR half (hp, tracker readings, inventory, wallet, status) → `patchActor` (R1: the plane is
//     op-shaped now — `editSnapshot` refuses an `actorState` image, so the seed authors the same ops the
//     panel's own edit affordances send)
//   • the quest plane (with objectives) → `upsertQuest` (the dedicated hand arm — mints stable objective ids)
//   • the config plane (the TRACKER defs + relationship hints) → `updateConfig`
//   • the journal archive → `addJournalEntry`
//
// DEV-ONLY: the builder is instantiated at the composition root ONLY under `IS_DEV` (agent-bridge's gate) —
// it is never attached to `__orb` in prod. In dev single-user mode the owner auto-resolves, so these wire
// calls run as the host (able to create games + write every plane).

import type { RpgActorOp, RpgActorRef, RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20, RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server";
import type { TRPCClient } from "@trpc/client";
import type { OrbSeedHandle, SeedProfile } from "../lib/agent-bridge";

/**
 * EDITSNAP-OK — the errors-as-data CHECK for this seeder's two hand-door calls.
 *
 * `editSnapshot`/`patchActor` refuse LEGIBLY as data (`{ok:false, reason}`) on a resolved promise, and
 * `editSnapshot` rejects the WHOLE patch on ONE bad plane. A seeder that ignores that verdict is the worst
 * possible consumer of it: `__orb.seed` exists so a verify pass can trust the panel it is looking at, and an
 * un-checked refusal hands back a chatId for a game whose scene planes silently never landed. It throws —
 * the seed's job is to be trustworthy or to say it failed, and the caller is an agent reading the rejection.
 */
function assertHandWrote(door: string, result: { readonly ok: boolean; readonly reason?: string }): void {
  if (!result.ok) {
    throw new Error(`__orb.seed: rpg.${door} refused — ${result.reason ?? "no reason given"}`);
  }
}

/** The player character card the seeded game rosters. A stable handle keeps the dev library from duping on
 *  re-seed (`character.create` reuses by handle when it already exists). */
const PLAYER_HANDLE = "orb-seed-hero";
const PLAYER_NAME = "Aldric Vane";

/** The game's TRACKERS (`config.trackers` — the ONE def home since the tracked-field unification). The seed
 *  exercises every axis on purpose: party-carried spend/restore meters (the old "pools", two of them PINNED
 *  to the band), an NPC-carried meter + text pair (the old "cast fields"), and a game-wide meter (the old
 *  custom widget). Colors ride the strict tracker-color hex grammar (decorative bar geometry; the value text
 *  rides theme tokens); every one carries the steering HINT the model reads. */
const TRACKERS = [
  {
    // HEALTH IS A TRACKER (R3) — the seed's own proof of the demotion. It used to be `sheet.maxHp` plus a
    // schema-privileged `hp` leaf plus a `setHp` op; it is now one def like any other, which is why the seed
    // can state its ceiling once, here, instead of in two places that nothing reconciled.
    key: "hp",
    label: "HP",
    shape: "meter" as const,
    write: "delta" as const,
    subject: "actor" as const,
    appliesTo: "everyone" as const,
    max: 38,
    color: "#e05a5a",
    pinned: true,
    sort: -1,
    hint: "physical health — damage lowers it, rest and care restore it; unset counts as 0",
  },
  {
    key: "mana",
    label: "Mana",
    shape: "meter" as const,
    write: "delta" as const,
    subject: "actor" as const,
    appliesTo: "party" as const,
    max: 40,
    color: "#5b8cff",
    pinned: true,
    sort: 0,
    hint: "arcane fuel; empty means no spellcasting",
  },
  {
    key: "focus",
    label: "Focus",
    shape: "meter" as const,
    write: "delta" as const,
    subject: "actor" as const,
    appliesTo: "party" as const,
    max: 20,
    color: "#3fb98a",
    pinned: true,
    sort: 1,
    hint: "composure under pressure; spent by strain",
  },
  {
    key: "grit",
    label: "Grit",
    shape: "meter" as const,
    write: "delta" as const,
    subject: "actor" as const,
    appliesTo: "party" as const,
    max: 10,
    color: "#d98a3f",
    sort: 2,
    hint: "resolve you spend to push through danger",
  },
  {
    key: "trust",
    label: "Trust",
    shape: "meter" as const,
    write: "set" as const,
    subject: "actor" as const,
    appliesTo: "npcs" as const,
    max: 100,
    sort: 3,
    hint: "how much this NPC trusts the player",
  },
  {
    key: "role",
    label: "Role",
    shape: "text" as const,
    write: "set" as const,
    subject: "actor" as const,
    appliesTo: "npcs" as const,
    sort: 4,
    hint: "the NPC's function in the scene",
  },
  {
    key: "alarm",
    label: "Town alarm",
    shape: "meter" as const,
    write: "set" as const,
    subject: "game" as const,
    max: 100,
    sort: 5,
    hint: "how hard the watch is looking for you",
  },
];

/** The custom-relationship gloss (config.features.relationshipHints — steers a `{kind:"custom",label}`). */
const RELATIONSHIP_HINTS = { "sworn rival": "a bitter but respectful competitor; never an outright enemy" };

/** The scene cast's IDENTITY half as actor OPS (R2 — a cast NPC's name/emoji/mood/guides/relationship live on
 *  her own `actorState` row, not on a presence row that departure would destroy). One rides a first-class
 *  relationship kind, one a custom label. The `key` is the stable slug the ref uses; `name` is the display
 *  name, and the two are deliberately different strings. */
const CAST_IDENTITY_OPS: readonly { readonly castKey: string; readonly ops: readonly RpgActorOp[] }[] = [
  {
    castKey: "mira",
    ops: [
      { op: "setIdentityText", field: "name", text: "Mira Solheart" },
      { op: "setIdentityText", field: "emoji", text: "🗡️" },
      { op: "setIdentityText", field: "mood", text: "guarded" },
      { op: "setIdentityText", field: "appearance", text: "a lean duelist in travel-worn leathers, one hand always near her hilt" },
      { op: "setIdentityText", field: "outfit", text: "oiled leather cuirass, a faded green cloak" },
      { op: "setIdentityText", field: "thoughts", text: "he talks a good game — but can he hold a line when it breaks?" },
      { op: "setRelationship", relationship: { kind: "ally", label: "" } },
    ],
  },
  {
    castKey: "corvin",
    ops: [
      { op: "setIdentityText", field: "name", text: "Corvin Ashe" },
      { op: "setIdentityText", field: "emoji", text: "🔥" },
      { op: "setIdentityText", field: "mood", text: "smug" },
      { op: "setIdentityText", field: "appearance", text: "a silver-tongued mage with soot under his nails and a collector's grin" },
      { op: "setIdentityText", field: "outfit", text: "a burnt-hem coat stitched with cooling runes" },
      { op: "setIdentityText", field: "thoughts", text: "the relic is mine by right — Aldric merely doesn't know it yet" },
      { op: "setRelationship", relationship: { kind: "custom", label: "sworn rival" } },
    ],
  },
];

/** Who stands in the scene — the PRESENCE plane, as `actorRefKey` strings (R2). */
const PRESENT_CHARACTERS: readonly string[] = CAST_IDENTITY_OPS.map((c) => `cast:${c.castKey}`);

/** The player's inventory items, as `patchActor` ADD ops (the item id is minted server-side — a hand caller
 *  never names an item's identity, exactly as the model applier never does). */
const PLAYER_ITEM_OPS: readonly RpgActorOp[] = [
  {
    op: "addItem",
    item: {
      name: "Ashfall Longsword",
      description: "a heirloom blade that hums faintly near old magic",
      quantity: 1,
      location: "sheathed",
      type: "weapon",
    },
  },
  {
    op: "addItem",
    item: { name: "Elixir of Mending", description: "restores vigor; bitter as regret", quantity: 3, location: "belt pouch", type: "consumable" },
  },
  {
    op: "addItem",
    item: {
      name: "Tarnished Vault Key",
      description: "cold to the touch, etched with the sigil of House Vane",
      quantity: 1,
      location: "inner pocket",
      type: "key",
    },
  },
];

/** The player's wallet (stored named-amount slots) as SET ops — `setWalletAmount` upserts the slot. */
const PLAYER_WALLET_OPS: readonly RpgActorOp[] = [
  { op: "setWalletAmount", name: "gold", amount: 214 },
  { op: "setWalletAmount", name: "silver", amount: 47 },
];

/** The plot plane (snapshot-resident P5 datum): a story title + acts, current act embered. */
const PLOT = {
  act: 2,
  title: "The Ashfall Inheritance",
  acts: [
    { title: "A Death in Vane Keep", summary: "the old lord dies; the vault key surfaces" },
    { title: "The Rival's Bargain", summary: "Corvin offers an alliance Aldric can't quite trust" },
    { title: "What the Vault Holds", summary: "the relic — and the price of claiming it" },
  ],
};

/** The scene ambient — where/when/weather + a couple of recent beats the reminder tail slices. */
const SCENE = {
  location: "The Gilded Ember tavern, lower Ashfall",
  calendarDate: "14th of Emberfall, 3rd Age",
  clock: { day: 3, hour: 21, minute: 40 },
  weather: { type: "rain", label: "steady rain on the shutters" },
  recentEvents: [
    "Aldric produced the tarnished vault key; the room went quiet.",
    "Corvin bought a round and named a price for his help.",
    "Mira put her back to the wall, watching the door.",
  ],
};

/** The quests (the dedicated `upsertQuest` verb — mints stable objective ids server-side). */
const QUESTS = [
  {
    name: "Claim the Vault",
    status: "active" as const,
    description: "reach the Vane family vault beneath the keep and open it before Corvin does",
    objectives: [
      { text: "Recover the second half of the key from the crypt", completed: true },
      { text: "Descend to the vault door", completed: false },
      { text: "Decide what to do with the relic", completed: false },
    ],
  },
  {
    name: "Earn Mira's Trust",
    status: "active" as const,
    description: "the sellsword follows the coin, but her loyalty is worth more",
    objectives: [
      { text: "Back her in a fight", completed: false },
      { text: "Keep your word once", completed: false },
    ],
  },
];

/** The journal archive entries (the variant-aware table; `addJournalEntry`). */
const JOURNAL = [
  { type: "location" as const, title: "The Gilded Ember", content: "A smoke-dark tavern in lower Ashfall. Rain on the shutters; a bard nobody listens to." },
  {
    type: "npc" as const,
    title: "Corvin Ashe",
    content: "A rival arcanist. Charming, acquisitive, and almost certainly playing a longer game than he admits.",
  },
  { type: "event" as const, title: "The key revealed", content: "Aldric showed the vault key openly. A gamble — now everyone at the table knows the stakes." },
  { type: "quest" as const, title: "The vault below", content: "The Vane vault lies beneath the keep. The relic is real. So is the risk." },
];

/** The player's per-attribute scores (d20 vocabulary). Freeform seeds NO attributes (no vocabulary). */
const D20_ATTRIBUTES: Readonly<Record<string, number>> = { str: 15, dex: 13, con: 14, int: 12, wis: 11, cha: 16 };
const PLAYER_LEVEL = 4;

/** The player's TRACKER readings (volatile) — keyed by tracker `key`, one `setTracker` op each (the server
 *  keeps each written value TOTAL). Partially spent, for a lived-in look. */
const PLAYER_TRACKER_OPS: readonly RpgActorOp[] = [
  { op: "setTracker", key: "hp", value: { value: 31 } },
  { op: "setTracker", key: "mana", value: { value: 28 } },
  { op: "setTracker", key: "focus", value: { value: 20 } },
  { op: "setTracker", key: "grit", value: { value: 6 } },
];

/** The scene cast's own volatile rows — a `cast:<key>` actor per present NPC, carrying THEIR tracker
 *  readings. Cast members read from the SAME per-actor plane roster members do (one value home, D108 #2). */
const CAST_ACTOR_OPS: readonly { readonly castKey: string; readonly ops: readonly RpgActorOp[] }[] = [
  {
    castKey: "mira",
    ops: [
      { op: "setTracker", key: "trust", value: { value: 62 } },
      { op: "setTracker", key: "role", value: { value: "sellsword escort" } },
    ],
  },
  {
    castKey: "corvin",
    ops: [
      { op: "setTracker", key: "trust", value: { value: 18 } },
      { op: "setTracker", key: "role", value: { value: "rival arcanist" } },
    ],
  },
];

function statProfileFor(profile: SeedProfile): RpgStatProfile {
  return profile === "d20" ? RPG_PROFILE_D20 : RPG_PROFILE_FREEFORM;
}

/** Build the `__orb.seed` handle. `client` is the SAME wire client the app renders through, so every seed
 *  write goes over the real HTTP verb surface as the auto-resolved host (dev single-user). */
export function buildAgentSeed(client: TRPCClient<AppRouter>): OrbSeedHandle {
  async function ensurePlayer(): Promise<CharacterId> {
    // Reuse the card by handle across re-seeds so the dev library never dupes; else create it.
    const page = await client.character.list.query({ limit: 500 });
    const existing = page.items.find((c) => c.handle === PLAYER_HANDLE);
    if (existing !== undefined) {
      return castId<CharacterId>(existing.id);
    }
    const created = await client.character.create.mutate({
      input: {
        handle: PLAYER_HANDLE,
        name: PLAYER_NAME,
        description: "A displaced heir to House Vane, chasing an inheritance that may be a curse.",
        greetings: [{ text: "Rain again. Fitting, for the night everything changes." }],
      },
    });
    return castId<CharacterId>(created.id);
  }

  async function game(args: { profile: SeedProfile; title?: string }): Promise<{ readonly chatId: string }> {
    const { profile } = args;
    const title = args.title ?? `Seeded game — ${profile}`;
    const characterId = await ensurePlayer();
    // The human plays as the `user` actor (the panel's default "You" sheet/inventory subject) — the rich
    // protagonist planes ride THIS ref so the panel populates on open without a subject switch; Aldric is the
    // roster companion. patchSheet/editSnapshot both accept a `user` ref (host writes any actor).
    const me = await client.sessions.me.query();
    const playerRef = { kind: "user", userId: me.userId } as const;

    // 1) The room. The caller (auto-resolved owner) becomes the host participant; the card joins the roster.
    const started = await client.chat.startChat.mutate({ characterIds: [characterId], title });
    const chatId = castId<ChatId>(started.chat.id);

    // 2) The game (lite mode; the picked stat profile). Writes the chats.metadata.rpg pointer.
    await client.rpg.createGame.mutate({ chatId, mode: "lite", profile: statProfileFor(profile) });

    // 3) Config: the tracker defs (one home for every tracked field) + relationship hints.
    await client.rpg.updateConfig.mutate({ chatId, patch: { trackers: TRACKERS, relationshipHints: RELATIONSHIP_HINTS } });

    // 4) The player sheet (identity plane). d20 carries the attribute grid; freeform omits it (no vocabulary).
    await client.rpg.patchSheet.mutate({
      chatId,
      actorRef: playerRef,
      patch: {
        className: "Warden of House Vane",
        flavor: "grim, dutiful, quicker with a blade than with words",
        level: PLAYER_LEVEL,
        ...(profile === "d20" ? { attributes: D20_ATTRIBUTES } : {}),
      },
    });

    // 5) The SCENE half of the swipe-volatile plane in one overlay: ambient, the present cast (relationships
    //    + guides), the plot spine, the game-subject tracker.
    const sceneWrite = await client.rpg.editSnapshot.mutate({
      chatId,
      patch: {
        location: SCENE.location,
        calendarDate: SCENE.calendarDate,
        clock: SCENE.clock,
        weather: SCENE.weather,
        recentEvents: SCENE.recentEvents,
        presentCharacters: PRESENT_CHARACTERS,
        plot: PLOT,
        trackerValues: { alarm: { value: 15, items: null } },
      },
    });
    assertHandWrote("editSnapshot", sceneWrite);

    // 5b) The per-ACTOR half through the op door (R1 — `editSnapshot` refuses an `actorState` image). One call
    //     per actor, SEQUENTIAL for the same reason the quests are: each write reads and rewrites the current
    //     snapshot head, so parallel calls would race on it.
    const actorWrites: readonly { readonly targetRef: RpgActorRef; readonly ops: readonly RpgActorOp[] }[] = [
      {
        targetRef: playerRef,
        ops: [...PLAYER_TRACKER_OPS, ...PLAYER_ITEM_OPS, ...PLAYER_WALLET_OPS, { op: "setStatus", status: "on edge" }],
      },
      // The cast's IDENTITY ops must land before its tracker ops on the same row read, so both halves are
      // written in ONE call per actor (the ops apply in order against the true head).
      ...CAST_IDENTITY_OPS.map((c) => ({
        targetRef: { kind: "cast", castKey: c.castKey } as const,
        ops: [...c.ops, ...(CAST_ACTOR_OPS.find((t) => t.castKey === c.castKey)?.ops ?? [])],
      })),
    ];
    await actorWrites.reduce<Promise<unknown>>(
      (chain, write) =>
        chain
          .then(() => client.rpg.patchActor.mutate({ chatId, targetRef: write.targetRef, ops: [...write.ops] }))
          .then((applied) => {
            assertHandWrote("patchActor", applied);
          }),
      Promise.resolve(),
    );

    // 6) The quest plane (dedicated verb — mints stable objective ids). Each upsert reads+rewrites the
    //    current snapshot head, so they run SEQUENTIALLY (a promise chain, not Promise.all — parallel writes
    //    would race on the head). The reduce keeps that serial without an await-in-loop suppression.
    await QUESTS.reduce<Promise<unknown>>((chain, quest) => chain.then(() => client.rpg.upsertQuest.mutate({ chatId, ...quest })), Promise.resolve());

    // 7) The journal archive — sequential for stable insert order (the same promise-chain shape).
    await JOURNAL.reduce<Promise<unknown>>((chain, entry) => chain.then(() => client.rpg.addJournalEntry.mutate({ chatId, ...entry })), Promise.resolve());

    return { chatId };
  }

  return {
    game,
    richGame: (profile: SeedProfile = "freeform") => game({ profile }),
  };
}
