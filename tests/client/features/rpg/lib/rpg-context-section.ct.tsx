// CT: the rpg CP-4 LITE takeover (features/rpg — the `rpgContextTabs` contributions rendered through the REAL
// chats SectionContextHost via the contributor seam, over the stubbed network). Drives the production path:
// `chat.getChat` supplies the roster + the rpg POINTER (the takeover APPLICABILITY gate, §4.1); `rpg.getGame`
// carries the mode/read-only trim; `rpg.getTrackerView` feeds every tab. Asserts the four things the W3b brief
// pins: (1) the 4 game tabs render (in the "Game" strip) when `chat.rpg !== null`, with the meta strip below;
// (2) a tab body renders real tracker data; (3) an editable block fires its mutation (the mutation COUNT, per
// [assert-the-mutation-fired] — not the UI reaction); (4) the read-only pill shows + disables edits when
// `trackersReadOnly`. The roster/view stubs return only what the panel reads (a partial shape, the chats-
// section.ct ROSTER_STUB posture); every value crosses the routeTrpc JSON boundary as a plain object.

import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { RpgTakeoverFloorStory, RpgTakeoverReferenceStory, RpgTakeoverStory } from "../_ct-stories";

const GAME_ID = "rpg_game_ct_keystone";

/** "a `title` with any content at all" — hoisted (a regex literal in a test body is a per-call recompile,
 *  `useTopLevelRegex`) and used with `not.toHaveAttribute`, which also passes when the attribute is absent. */
const ANY_TITLE = /./;

// A `chat.getChat` stub carrying the rpg POINTER (fires the takeover) + the host gate + the viewer identity.
function gameChat(): unknown {
  return {
    participants: [{ kind: "human", role: "host", userId: "user_ct", characterId: null }],
    viewerUserId: "user_ct",
    viewerIsHost: true,
    pendingHostUserId: null,
    roomOverrides: {},
    background: null,
    rpg: { gameId: GAME_ID },
  };
}

// A `rpg.getGame` stub — the lite mode trim + the read-only flag (the CP pill gate) + the delivery-model
// knob and its EFFECTIVE resolution (the freshness-indicator driver since EFF-3). Defaults `cheap` (the
// two-call arm — the lagging label) unless overridden.
function gameView(trackersReadOnly: boolean, extractionMode: RpgExtractionMode = "cheap"): unknown {
  return {
    id: GAME_ID,
    chatId: "chat_ct_keystone",
    mode: "lite",
    status: "active",
    trackersReadOnly,
    // The born-state round's own capability verdict (`hasStructuredWriter`) — a real `getGame` always carries it.
    canPopulate: true,
    extractionMode,
    // What the knob RESOLVES to on this room's connection — the server derives it (`deriveEffectiveDelivery`);
    // the stub mirrors the un-degraded arm of that derivation, plus the readonly case's no-vehicle verdict.
    effectiveDelivery: trackersReadOnly
      ? { path: "none", fallbackReason: null }
      : { path: extractionMode === "folded" ? "folded" : "tool-round", fallbackReason: null },
    publicConfig: {
      statProfile: {
        attributes: [],
        range: { min: 0, max: 20 },
        modifier: { center: 10, step: 2 },
        skillGoverning: {},
        defaultAttribute: "",
        perceptionAttribute: "",
        resolution: { kind: "house-d20" },
      },
      // The member-safe play-style trim (§5.4/§6.4) the Scene echo + card archive gate on.
      cyoa: false,
      cyoaChoiceBehavior: "compose",
      plotProgression: true,
      immersiveHtml: false,
    },
  };
}

/** The two tracker defs the stubbed roster actor carries (meters, party-class, band-PINNED). */
const VITALITY = {
  key: "vitality",
  label: "Vitality",
  shape: "meter",
  write: "delta",
  subject: "actor",
  appliesTo: "party",
  max: 30,
  hint: "",
  color: null,
  icon: null,
  sort: 0,
  pinned: true,
  locked: false,
};
const RESOLVE = { ...VITALITY, key: "resolve", label: "Resolve", max: 10, sort: 1 };

// A `rpg.getTrackerView` stub — one roster actor with trackers + a condition, ambient + orbs, cast, a goal, beats.
function trackerView(trackersReadOnly: boolean): unknown {
  return {
    ambient: {
      location: "The Rusted Lantern — Common Room",
      calendarDate: null,
      clock: { day: 3, hour: 21, minute: 0 },
      weather: { type: "rain", label: "steady rain on the shutters" },
    },
    actors: [
      {
        actorRef: { kind: "character", characterId: "character_ct_mara" },
        name: "Mara",
        sheet: { className: "Warden", attributes: {}, maxHp: null, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
        // The trackers this actor CARRIES, resolved server-side (the one carrier predicate) and paired with
        // the readings on its volatile row — the panel renders exactly these, never a re-derivation.
        trackers: [VITALITY, RESOLVE],
        volatile: {
          actorRef: { kind: "character", characterId: "character_ct_mara" },
          hp: null,
          trackerValues: { vitality: { value: 24, items: null }, resolve: { value: 7, items: null } },
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [],
          wallet: [],
          status: "",
        },
      },
    ],
    cast: [
      {
        key: "sera",
        name: "Sera",
        characterId: undefined,
        emoji: "🕯️",
        mood: "guarded",
        // RV-11 — the standing guides the extraction round writes every beat. `outfit` is deliberately
        // UNWRITTEN here: the Scene cast card must show the two that exist and no line at all for the third.
        appearance: "tall, silver-haired, a burn scar down one forearm",
        thoughts: "weighing whether to trust you with the key",
        relationship: { kind: "ally", label: "" },
      },
    ],
    trackerDefs: [VITALITY, RESOLVE],
    // A cast member's carried trackers + readings, resolved server-side (empty here — this stub's cast
    // carries none, so the Scene renders her row without tracked values).
    castTrackers: {},
    castVolatile: {},
    gameTrackers: [],
    quests: [{ id: "q1", name: "Keep the bone key", status: "active", description: "", objectives: [{ id: "o1", text: "Hold the door", completed: true }] }],
    recentBeats: ["The rain has not let up since dusk."],
    trackersReadOnly,
    trackerOrbs: [
      { key: "vitality", label: "Vitality", value: 24, max: 30, color: null },
      { key: "resolve", label: "Resolve", value: 7, max: 10, color: null },
    ],
    // A hand-lock on the ambient `location` path (�12.3) — the Scene ambient renders its pin + Release.
    lockedPaths: ["location"],
    // P5 — the plot plane (null = no story spine yet; the act-rail CT overrides with a real plot).
    plot: null,
  };
}

// A `rpg.revealHidden` stub — the P3 host-reveal read the Veiled ledger (Status, host-only) tails. Default
// EMPTY (no hidden content ⇒ the ledger renders nothing); `standingLies` carries the crown-gold rows.
function revealView(
  lies: readonly { readonly character: string; readonly type: string; readonly truth: string; readonly reason: string; readonly messageId: string }[] = [],
): unknown {
  const byCharacter = new Map<string, typeof lies>();
  for (const lie of lies) {
    byCharacter.set(lie.character, [...(byCharacter.get(lie.character) ?? []), lie]);
  }
  return {
    messages: [],
    standingLies: [...byCharacter.entries()].map(([character, characterLies]) => ({ character, lies: characterLies })),
  };
}

// A `rpg.getConfigView` stub — the HOST GM-console read (steering note, delivery model, the TRACKER defs,
// relationship hints, the deception knobs). Empty-but-valid defaults; the console renders it.
function configView(macros: readonly unknown[] = [], presetNames: readonly string[] = []): unknown {
  return {
    statProfile: {
      attributes: [{ key: "str", label: "Strength", hint: "raw power" }],
      range: { min: 1, max: 20 },
      modifier: { center: 10, step: 2 },
      skillGoverning: {},
      defaultAttribute: "str",
      perceptionAttribute: "str",
      resolution: { kind: "house-d20" },
    },
    steeringNote: "Keep the tone grim.",
    gmPresetId: null,
    extractionMode: "cheap",
    trackers: [
      {
        key: "trust",
        label: "Trust",
        shape: "text",
        write: "set",
        subject: "actor",
        appliesTo: "npcs",
        max: null,
        hint: "",
        color: null,
        icon: null,
        sort: 0,
        pinned: false,
        locked: false,
      },
    ],
    relationshipHints: { debtor: "owes the party a debt" },
    journalTypeHints: {},
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 6,
    // The §1.3 extraction-depth trio the scalar form now edits (`toGmConsoleForm` reads all three).
    extractionContext: "window",
    extractionWindowTokens: 4096,
    reconcileEveryBeats: 10,
    // The P4/P5 knobs the scalar form projects (`toGmConsoleForm`).
    immersiveHtml: false,
    immersiveHtmlInteractive: false,
    cardKeepLastX: 3,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
    // WAVE MU — the two macro-editor fields: the GAME's own authored macros and the NAMES the chat's active
    // preset declares (the shadow gloss). Overridable per test.
    userMacros: macros,
    presetMacroNames: presetNames,
  };
}

// A `rpg.listJournal` stub — the paged chronicle the Journal tab's All scope reads. Two hand/model beats
// (the tab can't tell them apart, and the edit verb deliberately reaches both).
// R4c: a `custom` entry carries its OWN free `label` ("prophecy") — the row must render that word, not the
// generic "Custom" (the label was stored + model-written and no surface showed it).
const JOURNAL_ENTRIES = [
  { id: "rpg_journal_ct_1", type: "npc", label: "", title: "Sera's debt", content: "She owes the party a favour.", createdAt: 2000 },
  { id: "rpg_journal_ct_2", type: "location", label: "", title: "The Rusted Lantern", content: "", createdAt: 1000 },
  { id: "rpg_journal_ct_3", type: "custom", label: "prophecy", title: "The drowned crown", content: "", createdAt: 500 },
];

function stubTakeover(
  page: Page,
  opts: {
    readonly readOnly?: boolean;
    readonly reveal?: unknown;
    readonly tracker?: unknown;
    readonly game?: unknown;
    readonly messages?: unknown;
    readonly chat?: unknown;
    readonly config?: unknown;
  } = {},
): ReturnType<typeof routeTrpc> {
  const readOnly = opts.readOnly ?? false;
  return routeTrpc(page, {
    "chat.getChat": () => opts.chat ?? gameChat(),
    "rpg.getGame": () => opts.game ?? gameView(readOnly),
    "rpg.getTrackerView": () => opts.tracker ?? trackerView(readOnly),
    "rpg.editSnapshot": () => undefined,
    "rpg.patchActor": () => undefined,
    "rpg.dismissActor": () => undefined,
    "rpg.patchSheet": () => undefined,
    "rpg.populateFromCharacter": () => undefined,
    "rpg.updateConfig": () => undefined,
    "rpg.upsertQuest": () => undefined,
    "rpg.deleteQuest": () => undefined,
    // The Journal tab's own reads + the RV-6 hand-authoring verbs (all host-gated server-side).
    "rpg.listJournal": () => JOURNAL_ENTRIES,
    "rpg.listCheckpoints": () => [],
    "rpg.addJournalEntry": () => "rpg_journal_ct_new",
    "rpg.editJournalEntry": () => undefined,
    "rpg.deleteJournalEntry": () => undefined,
    "rpg.getConfigView": () => opts.config ?? configView(),
    "rpg.revealHidden": () => opts.reveal ?? revealView(),
    // The chat panel's own reads (the meta strip's tabs suspend on these when opened) + the transcript
    // read the Scene choice echo / card archive projects (fetched only when the play-style knobs gate on).
    "chat.listChatInjections": () => [],
    "chat.listMessages": () => opts.messages ?? { messages: [] },
    "chat.send": () => undefined,
  });
}

test("the takeover renders the 5 LIVE game tabs + the locked Map (in the Game strip) when chat.rpg !== null, meta strip below", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The redesign's top strip (panel-redesign §4) as the tracked-field unification §3 left it: 5 live game
  // tabs — Quests + Journal are LIVE lite tabs (the owner correction), and SHEET IS GONE (the sheet is a
  // STATE of Status now: expanding a roster entry IS the sheet).
  const gameStrip = component.getByRole("tablist", { name: "Game state" });
  await Promise.all(["Status", "Inventory", "Scene", "Quests", "Journal"].map((label) => expect(gameStrip.getByRole("tab", { name: label })).toBeVisible()));
  await expect(gameStrip.getByRole("tab", { name: "Sheet" })).toHaveCount(0);
  // Map is the ONE PHASE-locked tab: visible, wearing the lock + its reason on `title` (never hidden, and
  // never `aria-disabled` — see the RV-7 CT: it opens onto the body that states when maps arrive).
  const mapTab = gameStrip.getByRole("tab", { name: "Map" });
  await expect(mapTab).toBeVisible();
  await expect(mapTab).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
  // The chat meta set sits in the "Chat" strip below (the bracket's bottom row) — plus the crown GM-console
  // "Game" tab (host-only, `strip:"meta"` — a member never sees it; this stub's viewer IS host).
  const metaStrip = component.getByRole("tablist", { name: "Chat" });
  await expect(metaStrip.getByRole("tab", { name: "This chat" })).toBeVisible();
  await expect(metaStrip.getByRole("tab", { name: "Game" })).toBeVisible();
});

test("the band renders EVERY server-derived orb — no client cap drops a pinned orb", async ({ mount, page }) => {
  // The server owns the PINNED selection + the envelope cap; the client renders them ALL. A 4-orb set must
  // yield 4 rendered orb data lines — a client `.slice(0,3)` would silently drop the 4th (the bug this pins).
  await stubTakeover(page, {
    tracker: {
      ...(trackerView(false) as Record<string, unknown>),
      trackerOrbs: [
        { key: "vitality", label: "Vitality", value: 24, max: 30, color: null },
        { key: "resolve", label: "Resolve", value: 7, max: 10, color: null },
        { key: "supplies", label: "Supplies", value: 12, max: 20, color: null },
        { key: "fatigue", label: "Fatigue", value: 5, max: 8, color: null },
      ],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // All four orb datums (the visually-hidden `label value/max`) render — including the pinned 4th.
  await Promise.all(["Vitality 24/30", "Resolve 7/10", "Supplies 12/20", "Fatigue 5/8"].map((datum) => expect(component.getByText(datum)).toBeVisible()));
});

test("the crown GM console (Game tab, host) renders getConfigView — scalars, the TRACKER defs, hints", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The Game tab lives in the meta strip (host-only crown console).
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // The crown header + the sections the config read feeds.
  await expect(component.getByText("GM console — host only")).toBeVisible();
  // The steering-note scalar (autosave form) — the stubbed value.
  await expect(component.getByRole("textbox", { name: "Steering note" })).toHaveValue("Keep the tone grim.");
  // The stat-profile READ display (the vocabulary badge).
  await expect(component.getByText("Strength")).toBeVisible();
  // The TRACKER def row (the stubbed "Trust" text tracker, display-at-rest — the input appears on click,
  // §12.4.1) + the relationship-hint row ("debtor"). ONE section now holds what three surfaces used to.
  const trackerRest = component.getByRole("button", { name: "Tracker 1 label" });
  await expect(trackerRest).toContainText("Trust");
  await trackerRest.click();
  await expect(component.getByRole("textbox", { name: "Tracker 1 label" })).toHaveValue("Trust");
  await expect(component.getByText("debtor")).toBeVisible();
});

test("the GM console BAND toggle fires updateConfig (host) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // Band visibility is a control ON THE DEF ROW (the band section is gone — one home). It speaks BAND
  // vocabulary, never "pin" (owner 08-01: "pin" belongs to the hand-lock), and the write is the same
  // whole-list `updateConfig` every axis makes.
  await component.locator('[data-slot="rpg-game-tab"]').getByRole("button", { name: "Show Trust as a band orb" }).click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("a tab body renders real tracker data (Status: roster row + pool meters + condition + orbs)", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The header scene banner + a pool orb datum (the visually-hidden `label value/max`) — these ride the
  // `.shell-panel-header` BAND above both strips (the W3c header-contributor seam), not the tab body.
  await expect(component.getByText("The Rusted Lantern — Common Room")).toBeVisible();
  // The band's when-line shows the model's weather LABEL, not the canonical bin name it renders the sky from.
  await expect(component.getByText("steady rain on the shutters", { exact: false })).toBeVisible();
  await expect(component.getByText("Vitality 24/30")).toBeVisible();
  // The freshness indicator rides the same band — the getGame stub defaults `cheap` with no live turn,
  // so the accepted one-beat-lag label is surfaced (the honest freshness posture, in real panel geometry).
  await expect(component.getByText("As of last beat")).toBeVisible();
  // The roster row: name + className + the pool MeterRow value text + the condition chip.
  await expect(component.getByText("Mara")).toBeVisible();
  await expect(component.getByText("Warden")).toBeVisible();
  await expect(component.getByText("poisoned")).toBeVisible();
});

test("an editable pool value fires the patchActor mutation (host, writable) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The pool value is editable DISPLAY-AT-REST (§12.4.1): static text on a button; the inline field
  // appears on click. Reveal it, change it, commit on blur.
  const vitalityRest = component.getByRole("button", { name: "Vitality value" }).first();
  await expect(vitalityRest).toBeVisible();
  await vitalityRest.click();
  const vitality = component.getByRole("textbox", { name: "Vitality value" });
  await vitality.fill("18");
  await vitality.blur();

  // Assert the MUTATION fired (the count), not the UI reaction (the save-catch could hide a throw). The
  // per-actor plane is op-shaped (R1), so the roster's tracker edit rides `patchActor`, never `editSnapshot`.
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(0);
});

test("read-only trackers: the pill shows BUT the host still hand-edits (D108 — trackersReadOnly gates the MODEL write path only)", async ({ mount, page }) => {
  await stubTakeover(page, { readOnly: true });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The honest-arms read-only pill (§4.4; the redesign band's compact label) — the affordance, not a lock.
  await expect(component.getByText("Read-only")).toBeVisible();
  // D108 manual-steering (owner-confirmed 2026-07-28): `trackersReadOnly` disables the MODEL write path, NOT
  // the host's HAND edits — when the model can't write trackers, the host hand-edits every plane (the pill's
  // "edit them by hand" IS the affordance). So a host STILL sees the editable pool value under readonly
  // (display-at-rest: the edit BUTTON; the input appears on click);
  // conflating the two disabled the exact recovery the read-only state exists to enable.
  await expect(component.getByRole("button", { name: "Vitality value" }).first()).toBeVisible();
});

test("a hand-locked field shows the pin; ONE click releases — the mutation fires (§12.3 + the 08-01 single-click ruling)", async ({ mount, page }) => {
  // The tracker stub locks the ambient `location` path — the Scene ambient renders the pin. One click
  // releases directly (the popover-confirm two-step was ruled friction — any hand edit re-pins), so the
  // assertion is the editSnapshot MUTATION COUNT, not a UI reaction ([[assert-the-mutation-fired]]).
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  // The pin (§12.3 — aria-labelled) sits in the ambient strip beside the locked `location` field, and it
  // NAMES that field: the Scene tab renders five of these pins and a reader navigating by name has to be
  // able to tell which plane each one hands back (side-eye 08-01).
  const pin = component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Release the location to the model" });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// RV-11 — the Scene cast card reads the standing guides. The extraction round wrote appearance/outfit/thoughts
// on every beat into a plane NOTHING projected; this proves the panel end of the wire (the reminder is the
// model end) and that an unwritten guide contributes no line at all.
test("RV-11: the Scene cast card shows the standing guides, omits the unwritten one, and an edit fires editSnapshot", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  const card = component.locator('[data-slot="cast-card"]');
  // The model-written emoji leads the name — the same written-never-rendered class the guides are in.
  await expect(card).toContainText("🕯️");
  await expect(card).toContainText("tall, silver-haired, a burn scar down one forearm");
  await expect(card).toContainText("weighing whether to trust you with the key");
  // The stub leaves `outfit` unwritten — no label, no placeholder, no line.
  await expect(card.locator('[data-slot="cast-guides"]')).not.toContainText("outfit");

  // The host may correct what the story wrote: the guides ride the SAME `presentCharacters` overlay the mood
  // does, so the receipt is the editSnapshot mutation COUNT ([[assert-the-mutation-fired]]).
  await card.getByRole("button", { name: "Sera appearance" }).click();
  const field = component.getByRole("textbox", { name: "Sera appearance" });
  await field.fill("shaven-headed, a fresh scar");
  await field.blur();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// The cast NPC's whole volatile row, as `getTrackerView` projects it (`castVolatile`, keyed by cast key) —
// hp, a pack, a purse and a status the story wrote onto her `cast:sera` plane.
const SERA_VOLATILE = {
  actorRef: { kind: "cast", castKey: "sera" },
  hp: { value: 9, max: 14 },
  trackerValues: { trust: { value: 3, items: null } },
  conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: 2 }],
  inventory: [{ id: "item_ct_key", name: "bone key", description: "", quantity: 1, location: "", type: "" }],
  wallet: [{ name: "gold", amount: 40 }],
  status: "guarding the stair",
};
const TRUST_METER = { ...VITALITY, key: "trust", label: "Trust", appliesTo: "npcs", max: 10, sort: 0, pinned: false };

// The plane-loss defect, killed STRUCTURALLY (R1). The Scene cast edit used to build a whole-`actorState`
// IMAGE from the ROSTER half of the view only, so a `cast:` target was never "found" and an EMPTY volatile got
// minted — authoring `hp: null`, `inventory: []`, `wallet: []`, `status: ""` over the NPC's real row (AUTHORED
// values the server's additive policy cannot save: it preserves rows a write OMITS, never fields it NAMES).
// The op door cannot express that mistake: the wire payload carries the ONE datum the human touched and names
// no sibling plane at all. The receipt is the WIRE payload, not a UI reaction.
test("editing a cast NPC's tracker sends ONE op naming only that datum (her other planes are unmentionable)", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, {
    tracker: {
      ...(trackerView(false) as Record<string, unknown>),
      castTrackers: { sera: [{ def: TRUST_METER, value: { value: 3, items: null } }] },
      castVolatile: { sera: SERA_VOLATILE },
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  // The cast card's meter is editable display-at-rest (§12.4.1) — reveal, retype, commit on blur.
  const card = component.locator('[data-slot="cast-card"]');
  await card.getByRole("button", { name: "Trust value" }).click();
  const trust = component.getByRole("textbox", { name: "Trust value" });
  await trust.fill("5");
  await trust.blur();

  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("rpg.patchActor") as { readonly targetRef: Record<string, unknown>; readonly ops: readonly Record<string, unknown>[] };

  // The call addresses HER, by ref — no image, no roster half, nothing to be partial about.
  expect(input.targetRef).toEqual({ kind: "cast", castKey: "sera" });
  expect(input.ops).toEqual([{ op: "setTracker", key: "trust", value: { value: 5 } }]);
  // The planes the empty mint used to clear are not on the wire AT ALL — the server keeps them by construction.
  const wire = JSON.stringify(input);
  for (const plane of ["hp", "inventory", "wallet", "status", "conditions"]) {
    expect(wire).not.toContain(plane);
  }
});

test("the host New-quest affordance fires upsertQuest (create) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Quests" }).click();

  // Type a name + blur (TrackerValue commits its draft on blur/Enter, enabling the button) + click New quest
  // → upsertQuest with NO questId (create).
  const nameField = component.getByRole("textbox", { name: "New quest name" });
  await nameField.fill("Find the ledger");
  await nameField.blur();
  await component.getByRole("button", { name: "New quest" }).click();
  await expect.poll(() => trpc.count("rpg.upsertQuest"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("the host quest DELETE fires deleteQuest behind a confirm — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Quests" }).click();

  // The per-card destructive action names its target; the confirm names the consequence (never a bare click).
  await component.getByRole("button", { name: "Delete quest: Keep the bone key" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.deleteQuest"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// RV-6 — hand journal authoring. The three verbs are host-gated (`resolveHost`), so the host arm is the
// composer + per-row edit/delete, and a member gets the chronicle read-only (PERMISSION-omit).
test("the host New-entry composer fires addJournalEntry with the chosen type and title (body born empty)", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  await component.getByRole("combobox", { name: "Entry type" }).click();
  await page.getByRole("option", { name: "Location" }).click();
  await component.getByRole("textbox", { name: "New entry title" }).fill("The bone door");
  await component.getByRole("button", { name: "Add entry" }).click();

  // The body is authored in place on the born row (§12.4.1), so the create carries an empty `content`.
  await expect.poll(() => trpc.count("rpg.addJournalEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("rpg.addJournalEntry"), { intervals: [20, 50, 100] })
    .toMatchObject({ type: "location", title: "The bone door", content: "" });
});

test("a beat row's inline title edit fires editJournalEntry (host) — the mutation COUNT + patch", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  // Display-at-rest (§12.4.1): the title is a button; the inline field appears on click, commits on blur.
  await component.getByRole("button", { name: "Sera's debt title" }).click();
  const field = component.getByRole("textbox", { name: "Sera's debt title" });
  await field.fill("Sera's bargain");
  await field.blur();

  await expect.poll(() => trpc.count("rpg.editJournalEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("rpg.editJournalEntry"), { intervals: [20, 50, 100] })
    .toMatchObject({ entryId: "rpg_journal_ct_1", patch: { title: "Sera's bargain" } });
});

// Owner dogfood (2026-07-31): the BODY edited through a one-line input — "it just does a single line and
// it's very hard to see". The body now expands IN PLACE into a real textarea (the room-overrides collapse
// anatomy), autosaving on blur (D66 A4 — no Save button anywhere in the panel).
test("a beat row's BODY expands in place into a multi-line editor, and blur saves it", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  // At rest the body is the chronicle's muted line — the trigger, not an input (the instrument posture).
  const bodyTrigger = component.getByRole("button", { name: "Sera's debt entry" });
  await expect(bodyTrigger).toContainText("She owes the party a favour.");
  await expect(component.getByRole("textbox", { name: "Sera's debt entry" })).toHaveCount(0);

  await bodyTrigger.click();
  const body = component.getByRole("textbox", { name: "Sera's debt entry" });
  await expect(body).toBeVisible();
  // The click's continuation: the editor took the trigger's place, so it takes the focus too (the trigger
  // it replaced is unmounted — without this the keyboard path would dead-end).
  await expect(body).toBeFocused();
  // A real multi-line editor, not a letterbox: `rows={4}` floors it well past a single line.
  const box = await body.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(60);

  await body.fill("She owes the party a favour, and the debt is called in at the Lantern.");
  await body.blur();
  await expect.poll(() => trpc.count("rpg.editJournalEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("rpg.editJournalEntry"), { intervals: [20, 50, 100] })
    .toMatchObject({ entryId: "rpg_journal_ct_1", patch: { content: "She owes the party a favour, and the debt is called in at the Lantern." } });
  // The editor collapses back to the row (one place at a time — the chronicle stays a reading surface).
  await expect(component.getByRole("textbox", { name: "Sera's debt entry" })).toHaveCount(0);
});

test("Escape abandons an open beat-body draft — nothing is sent", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  await component.getByRole("button", { name: "Sera's debt entry" }).click();
  const body = component.getByRole("textbox", { name: "Sera's debt entry" });
  await body.fill("half a thought");
  await body.press("Escape");
  await expect(component.getByRole("textbox", { name: "Sera's debt entry" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Sera's debt entry" })).toContainText("She owes the party a favour.");
  await expect.poll(() => trpc.count("rpg.editJournalEntry"), { intervals: [20, 50, 100] }).toBe(0);
});

test("a beat row's confirmed delete fires deleteJournalEntry (host) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  await component.getByRole("button", { name: "Delete entry: Sera's debt" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.deleteJournalEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.deleteJournalEntry"), { intervals: [20, 50, 100] }).toMatchObject({ entryId: "rpg_journal_ct_1" });
});

test("a MEMBER reads the chronicle with NO authoring affordances (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  // The beats still READ (the list verb is member-read) — the entry text is there…
  await expect(component.getByText("Sera's debt")).toBeVisible();
  // …but nothing to author with: no composer, no per-row edit button, no delete.
  await expect(component.getByRole("textbox", { name: "New entry title" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Sera's debt title" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Delete entry: Sera's debt" })).toHaveCount(0);
});

test("P5: the ACT RAIL renders the snapshot plot plane (current act embered; null plot ⇒ no rail)", async ({ mount, page }) => {
  // The default stub carries `plot: null` — the sibling Quests CTs prove the rail ABSENT there (no
  // client-invented acts). This mount overrides the tracker with a real plot plane.
  const tracker = {
    ...(trackerView(false) as Record<string, unknown>),
    plot: {
      act: 2,
      title: "The Bone Key",
      acts: [
        { title: "Arrival", summary: "" },
        { title: "Descent", summary: "" },
        { title: "", summary: "" },
      ],
    },
  };
  await stubTakeover(page, { tracker });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Quests" }).click();

  const rail = component.locator('[data-slot="rpg-act-rail"]');
  await expect(rail).toBeVisible();
  // The TEXT is the datum — now EDITABLE-in-place for the host (#2): the act number rests as the mock's
  // ROMAN numeral on a real click-to-edit button, the current act's title beside it, the story title chip
  // trailing. (The old static "Act II — Descent" heading is the read-only member arm.)
  await expect(rail).toContainText("Act");
  await expect(rail.getByRole("button", { name: "Current act number" })).toHaveText("II");
  await expect(rail.getByRole("button", { name: "Act 2 title" })).toHaveText("Descent");
  await expect(rail).toContainText("The Bone Key");
  // Three act stops on the (aria-hidden) dot row — past, current (embered ◉), future.
  await expect(rail).toContainText("◉ II");
  await expect(rail).toContainText("● I");
  await expect(rail).toContainText("○ III");
});

// The per-carrier ceiling (owner amendment 2026-07-31): the max on a character's row is THAT CHARACTER's,
// stored as an override on their value plane (`patchActor`'s `setTracker`), never the game-wide def
// (`updateConfig`).
test("a tracker max edit writes THIS CHARACTER's ceiling override (patchActor, never updateConfig) + drags the reading", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  const maxRest = component.getByRole("button", { name: "Vitality max" });
  await expect(maxRest).toBeVisible();
  // The control states whose ceiling this is, and how to go back to the game default.
  await expect(maxRest).toHaveAttribute("title", "Vitality's ceiling for this character — the game's default is 30; type it back to follow the default again.");
  await maxRest.click();
  const maxField = component.getByRole("textbox", { name: "Vitality max" });
  await maxField.fill("20");
  await maxField.blur();

  // ONE write, on the actor's own value plane — the def (updateConfig) is untouched.
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(0);
  // 20 ≠ the def's 30 ⇒ a genuine override is STORED, and because it is below the reading (24) the value is
  // dragged down in the SAME commit (never a silent truncate).
  await expect
    .poll(() => trpc.lastInput("rpg.patchActor"), { intervals: [20, 50, 100] })
    .toMatchObject({ ops: [{ op: "setTracker", key: "vitality", value: { max: 20, value: 20 } }] });
  await expect(component.getByText("Vitality 24 → 20 — ceiling lowered")).toBeVisible();
});

test("typing the game DEFAULT back into a character's ceiling CLEARS the override (the anti-drift rule)", async ({ mount, page }) => {
  // This actor carries an override (28 against the def's 30) — the row says so; writing 30 stores `null`.
  const tracker = trackerView(false) as Record<string, unknown>;
  const actors = (tracker["actors"] as Record<string, unknown>[]).map((a) => ({
    ...a,
    volatile: {
      ...(a["volatile"] as Record<string, unknown>),
      trackerValues: { vitality: { value: 24, items: null, max: 28 }, resolve: { value: 7, items: null } },
    },
  }));
  const trpc = await stubTakeover(page, { tracker: { ...tracker, actors } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // An overridden ceiling STATES the default it departs from (visible ⇒ reversible).
  await expect(component.getByText("Vitality ceiling 28 — default: 30")).toBeVisible();

  await component.getByRole("button", { name: "Vitality max" }).click();
  const maxField = component.getByRole("textbox", { name: "Vitality max" });
  await maxField.fill("30");
  await maxField.blur();
  await expect
    .poll(() => trpc.lastInput("rpg.patchActor"), { intervals: [20, 50, 100] })
    .toMatchObject({ ops: [{ op: "setTracker", key: "vitality", value: { max: null } }] });
});

test("the Scene CHOICE echo renders the transcript's LIVE :::choices (info-blue; send-mode line) and a pick fires chat.send", async ({ mount, page }) => {
  // A cyoa game in `send` mode + a transcript whose LAST message is an assistant turn carrying a choices
  // fence — the echo's exact live condition (a later user reply would settle it → no echo).
  const game = {
    ...(gameView(false) as Record<string, unknown>),
    publicConfig: {
      ...((gameView(false) as { publicConfig: Record<string, unknown> }).publicConfig ?? {}),
      cyoa: true,
      cyoaChoiceBehavior: "send",
    },
  };
  const messages = {
    messages: [
      { id: "message_ct_u1", role: "user", content: "We hold the door.", createdAt: 1000 },
      {
        id: "message_ct_a1",
        role: "assistant",
        content: "The bandits circle.\n\n:::choices\n1. Bar the door\n2. Parley through the window\n:::",
        createdAt: 2000,
      },
    ],
  };
  const trpc = await stubTakeover(page, { game, messages });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  const echo = component.locator('[data-slot="rpg-choice-echo"]');
  await expect(echo).toBeVisible();
  await expect(echo).toContainText("Choice on the table");
  // The honest consequence line for `send` mode (the compose arm words it as a composer drop).
  await expect(echo).toContainText("picks send as your turn");
  // A pick fires the turn — assert the MUTATION count ([assert-the-mutation-fired]).
  await echo.getByRole("button", { name: "1. Bar the door" }).click();
  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// RV-2 — the P4 card ARCHIVE in Scene: the section IS the Scene home for immersive cards. It projects the
// SAME `chat.listMessages` cache the transcript reads (no second round-trip), opens a card in the archive
// lightbox, and — with cards enabled but none written yet — says so instead of vanishing (an invisible
// section reads as an absent feature, which is exactly how the owner read it).
function cardsGame(): unknown {
  const base = gameView(false) as { publicConfig: Record<string, unknown> };
  return { ...(base as Record<string, unknown>), publicConfig: { ...base.publicConfig, immersiveHtml: true } };
}

const CARD_MESSAGES = {
  messages: [
    {
      id: "message_ct_card1",
      role: "assistant",
      content: 'The courier hands it over.\n\n:::card title="Zandik\'s letter"\n<div>secret page</div>\n:::',
      createdAt: 1000,
    },
  ],
};

test("RV-2: the Scene CARD ARCHIVE lists the transcript's cards and opens one in the sandboxed lightbox", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame(), messages: CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  const archive = component.locator('[data-slot="rpg-card-archive"]');
  await expect(archive).toContainText("Cards — 1");
  await archive.getByRole("button", { name: "Open card: Zandik's letter" }).click();

  // The archive lightbox renders the card through the SAME chrome (title + null-origin sandboxed iframe);
  // the card's HTML never lands in the main DOM.
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  const frame = dialog.locator('iframe[data-slot="sandbox-frame"]');
  await expect(frame).toHaveCount(1);
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).not.toBeNull();
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  await expect(page.locator("div", { hasText: "secret page" })).toHaveCount(0);
});

// The card-row TREATMENT (owner: the bare "✦ title" lines read as dead text). One row component serves both
// homes — the row IS the card's title bar: ✦ title · provenance · origin TurnRef · the expand glyph, on a
// real bordered instrument row whose accessible name says what a click does.
test("RV-2: an archived-card row wears the artifact chrome — title, turn ref, expand glyph, named action", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame(), messages: CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  const row = component.locator('[data-slot="rpg-card-row"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Zandik's letter");
  // The origin turn ref (§12.1.4) — the row carries a REAL message ref, so it renders the anchor chip.
  await expect(row.locator('[data-slot="rpg-turn-ref"]')).toHaveText("tard1");
  // The row's action is NAMED (a bare "✦ title" line said nothing about what a click does).
  await expect(row).toHaveAttribute("aria-label", "Open card: Zandik's letter");
  // A real bordered instrument row, not a bare text line: it carries the expand glyph + a border box.
  await expect(row.locator("svg")).toHaveCount(1);

  // The Journal chronicle renders the SAME row component (one projection, one row).
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();
  await expect(component.locator('[data-slot="rpg-card-row"]').first()).toContainText("Zandik's letter");
  await component.locator('[data-slot="rpg-card-row"]').first().click();
  await expect(page.locator('[data-slot="dialog-popup"]')).toBeVisible();
});

// The three bodies that were LIVE-EMPTY on the dogfood DB (chat_01kym4aq7…, chat_01kym4w52…,
// chat_01kym4b1y…), verbatim in shape: a nested-closer card and two generations truncated mid-attribute.
// Each showed the reader a raw `:::card title="…"` line in the transcript and NOTHING in the archive.
// With the committed EOF-close they are cards again — in the archive AND in the transcript.
const BROKEN_CARD_MESSAGES = {
  messages: [
    {
      id: "message_ct_nest1",
      role: "assistant",
      content: ':::card title="The Blade’s Whisper"\n\nA flicker of steel.\n\n:::choices\n1. Demand answers\n2. Walk away\n:::',
      createdAt: 1000,
    },
    { id: "message_ct_trunc2", role: "assistant", content: ':::card title="Ashfell Night Market"\n\n<div style="font-family: \'Courier New', createdAt: 2000 },
    { id: "message_ct_trunc3", role: "assistant", content: ':::card title="The Watcher’s Shadow"\n<div style="background: #1a', createdAt: 3000 },
  ],
};

test("RV-2 root cause: unterminated cards (truncated + nested-closer) reach the archive once committed", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame(), messages: BROKEN_CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  const archive = component.locator('[data-slot="rpg-card-archive"]');
  await expect(archive).toContainText("Cards — 3");
  await expect(archive.getByRole("button", { name: "Open card: The Watcher’s Shadow" })).toBeVisible();
  await expect(archive.getByRole("button", { name: "Open card: Ashfell Night Market" })).toBeVisible();
  // The nested-closer body: ONE card (the swallowed choices are card content, not a second block).
  await expect(archive.getByRole("button", { name: "Open card: The Blade’s Whisper" })).toBeVisible();
  await expect(component.locator('[data-slot="rpg-card-row"]')).toHaveCount(3);
});

test("RV-2: cards ON with none written renders the honest empty archive; cards OFF omits the section entirely", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame() });
  const withCardsOn = await mount(<RpgTakeoverStory />);
  await withCardsOn.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();
  await expect(withCardsOn.locator('[data-slot="rpg-card-archive"]')).toContainText("No cards yet");
});

test("RV-2: a game with immersiveHtml OFF has no card section at all (applicability, not a disabled twin)", async ({ mount, page }) => {
  // The default stub's game carries `immersiveHtml: false`.
  await stubTakeover(page, { messages: CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();
  await expect(component.locator('[data-slot="rpg-card-archive"]')).toHaveCount(0);
});

test("the band's host-only VEILED count (P3) renders off rpg.revealHidden — crown-gold cue, absent at zero", async ({ mount, page }) => {
  await stubTakeover(page, {
    reveal: revealView([
      { character: "Sera", type: "lie", truth: "she pocketed the key", reason: "claims she never touched it", messageId: "message_ct_beat_t41" },
      { character: "Niko", type: "ofilter", truth: "the dart was poisoned", reason: "", messageId: "message_ct_beat_t43" },
    ]),
  });
  const component = await mount(<RpgTakeoverStory />);

  // The cue rides the BAND (above both strips) — no tab click needed; "2 veiled" is the datum text.
  const cue = component.locator('[data-slot="rpg-veiled-cue"]');
  await expect(cue).toBeVisible();
  await expect(cue).toContainText("2 veiled");
});

test("the Veiled ledger (P3, host) renders the standing lies off rpg.revealHidden — crown-gold, host-only", async ({ mount, page }) => {
  await stubTakeover(page, {
    reveal: revealView([
      { character: "Sera", type: "lie", truth: "she pocketed the key", reason: "claims she never touched it", messageId: "message_ct_beat_t41" },
    ]),
  });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The ledger section header + the standing lie's character, public claim, and the host-only TRUTH — LIVE
  // off the P3 `rpg.revealHidden` read (the deception plane), not a placeholder.
  await expect(component.getByText("Veiled — host only")).toBeVisible();
  await expect(component.getByText("she pocketed the key")).toBeVisible();
  // The TurnRef chip anchors where it was told (the trailing-id short form).
  await expect(component.getByText("t_t41")).toBeVisible();
});

// FIX 3 runs on a COARSE (touch) pointer: the design system deliberately compresses controls below 44px on a
// fine pointer (theme.css `@media (pointer: fine)` → control-sm = 2rem), so the ≥44px tap-target floor is a TOUCH
// contract. `hasTouch` flips the primary pointer to coarse, where the shared control tokens deliver 44px by
// construction — the honest place to assert the floor (a fine-pointer measure would read 32px for EVERY control).
test.describe("FIX 3 — consolidated, announced error region", () => {
  test.use({ hasTouch: true, viewport: { width: 420, height: 800 } });

  test("a failed takeover read surfaces ONE announced (role=alert) error region with a ≥44px Retry, not two fragmented blocks", async ({ mount, page }) => {
    // The chat is a game (pointer present, band + body both read the rpg views), but the rpg reads FAIL. Before the
    // fix this rendered TWO unannounced blocks (a generic band "Couldn't load this." + a "Couldn't load status.")
    // with bare ~34px retry links. Now the band collapses silently and the body owns the SINGLE `role="alert"`
    // region with scene-named copy + a real Button retry.
    await routeTrpc(page, {
      "chat.getChat": () => gameChat(),
      "rpg.getGame": () => trpcError({ code: "BAD_REQUEST", message: "incoherent routing: api=agent-sdk is not coherent with source=vllm" }),
      "rpg.getTrackerView": () => trpcError({ code: "BAD_REQUEST", message: "incoherent routing" }),
      "chat.listChatInjections": () => [],
    });
    const component = await mount(<RpgTakeoverStory />);

    // Exactly ONE announced error region (the band's boundary renders null on error — no second block).
    const alert = component.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText("Couldn't load the scene");
    // The generic fallback copy is GONE (no fragmented second block).
    await expect(component.getByText("Couldn't load this.")).toHaveCount(0);

    // Retry is a real Button meeting the ≥44px touch floor (the shared control-sm token = 2.75rem on coarse).
    const retry = alert.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

// §3.3 — the DANGLING-POINTER heal. A pointer at a game that no longer exists makes the rpg reads 404. The
// error region DISCRIMINATES that NOT_FOUND (typed gone-state) from a transient/server error (the Retry arm):
// a doomed Retry loop is exactly the pre-heal defect. The HOST gets a "Detach game" self-heal; a MEMBER gets
// the honest copy + nothing (the host owns the heal, PERMISSION-omit).
test.describe("§3.3 — the dangling-pointer heal (typed NOT_FOUND, not a retry loop)", () => {
  test("a NOT_FOUND read renders the typed gone-state + the HOST's Detach action (no Retry)", async ({ mount, page }) => {
    const trpc = await routeTrpc(page, {
      "chat.getChat": () => gameChat(), // viewerIsHost: true
      // The dangling read: the game row is gone → the verb collapses to the leak-free NOT_FOUND.
      "rpg.getGame": () => trpcError({ code: "NOT_FOUND", message: "game" }),
      "rpg.getTrackerView": () => trpcError({ code: "NOT_FOUND", message: "game" }),
      "rpg.detachDanglingPointer": () => undefined,
      "chat.listChatInjections": () => [],
    });
    const component = await mount(<RpgTakeoverStory />);

    // The typed gone-copy (NOT the transient "Couldn't load the scene" Retry arm).
    const alert = component.getByRole("alert").filter({ hasText: "This chat points at a game that no longer exists" });
    await expect(alert).toBeVisible();
    await expect(component.getByText("Couldn't load the scene.")).toHaveCount(0);
    await expect(component.getByRole("button", { name: "Retry" })).toHaveCount(0);

    // The host's self-heal fires `rpg.detachDanglingPointer` — the mutation COUNT ([assert-the-mutation-fired]).
    await alert.getByRole("button", { name: "Detach game" }).click();
    await expect.poll(() => trpc.count("rpg.detachDanglingPointer"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  });

  test("a MEMBER sees the gone-copy but NO Detach action (PERMISSION-omit — the host owns the heal)", async ({ mount, page }) => {
    await routeTrpc(page, {
      // A member viewer (not host) on a chat with a dangling pointer.
      "chat.getChat": () => ({ ...(gameChat() as Record<string, unknown>), viewerIsHost: false }),
      "rpg.getGame": () => trpcError({ code: "NOT_FOUND", message: "game" }),
      "rpg.getTrackerView": () => trpcError({ code: "NOT_FOUND", message: "game" }),
      "chat.listChatInjections": () => [],
    });
    const component = await mount(<RpgTakeoverStory />);

    await expect(component.getByText("This chat points at a game that no longer exists.")).toBeVisible();
    // No detach action for a member — the host owns the heal.
    await expect(component.getByRole("button", { name: "Detach game" })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The CHARACTER TAKEOVER (tracked-field unification §3) — Status is the only list of people, and
// expanding an entry IS the sheet. Sheet-the-tab dissolved into this state; nothing it held became
// unreachable (title · level · wallet · attribute values live here, its def rows on the Game tab).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A d20 game — a real attribute vocabulary, so the takeover renders the stat grid (the surface d20 must
 *  not ship ugly on, RV-13) instead of the no-attributes teaching line. */
function d20Game(): unknown {
  return {
    id: GAME_ID,
    chatId: "chat_ct_keystone",
    mode: "lite",
    status: "active",
    trackersReadOnly: false,
    canPopulate: true,
    extractionMode: "cheap",
    effectiveDelivery: { path: "tool-round", fallbackReason: null },
    publicConfig: {
      statProfile: {
        attributes: [{ key: "str", label: "STR", hint: "raw physical power" }],
        range: { min: 1, max: 20 },
        modifier: { center: 10, step: 2 },
        skillGoverning: {},
        defaultAttribute: "str",
        perceptionAttribute: "str",
        resolution: { kind: "house-d20" },
      },
      cyoa: false,
      cyoaChoiceBehavior: "compose",
      plotProgression: true,
      immersiveHtml: false,
    },
  };
}

/** A roster whose one actor carries everything Sheet-the-tab used to show — title, level, wallet, attribute
 *  values — plus a packed item (the RV-5 surface). */
function richTracker(): unknown {
  return {
    ...(trackerView(false) as Record<string, unknown>),
    actors: [
      {
        actorRef: { kind: "character", characterId: "character_ct_mara" },
        name: "Mara",
        // `flavor` (RV-11) — host-written sheet prose that reached no reader until the takeover grew its gloss line.
        sheet: {
          className: "Warden",
          attributes: { str: 14 },
          maxHp: null,
          flavor: "Sworn to a house that no longer exists.",
          level: 3,
          trackerGrants: [],
          trackerRevokes: [],
        },
        trackers: [VITALITY, RESOLVE],
        volatile: {
          actorRef: { kind: "character", characterId: "character_ct_mara" },
          hp: null,
          trackerValues: { vitality: { value: 24, items: null }, resolve: { value: 7, items: null } },
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [{ id: "item_ct_key", name: "Bone key", description: "cold to the touch", quantity: 1, location: "belt pouch", type: "quest" }],
          wallet: [{ name: "gold", amount: 128 }],
          status: "resolute",
        },
      },
    ],
  };
}

/** A FULL pack (8 items) — the grid lens's real load: model-authored long names/descriptions, stacked
 *  quantities, and stored locations (the three data the tile has to carry without overflowing). */
const PACKED_ITEMS = [
  { id: "i1", name: "Bone key", description: "cold to the touch", quantity: 1, location: "belt pouch", type: "quest" },
  {
    id: "i2",
    name: "Iron dagger of the drowned watch",
    description: "a long model-authored description that runs on well past any tile width",
    quantity: 3,
    location: "strapped across her back",
    type: "weapon",
  },
  { id: "i3", name: "Rope, 30 ft", description: "", quantity: 1, location: "pack", type: "tool" },
  { id: "i4", name: "Healing potion", description: "", quantity: 12, location: "belt pouch", type: "consumable" },
  { id: "i5", name: "Map of the sunken road", description: "", quantity: 1, location: "", type: "document" },
  { id: "i6", name: "Gold ring", description: "", quantity: 2, location: "finger", type: "treasure" },
  { id: "i7", name: "Rations", description: "", quantity: 5, location: "pack", type: "food" },
  { id: "i8", name: "Torch", description: "", quantity: 4, location: "pack", type: "tool" },
];

function packedTracker(): unknown {
  const base = richTracker() as { readonly actors: readonly { readonly volatile: Record<string, unknown> }[] };
  const actor = base.actors[0];
  return { ...base, actors: [{ ...actor, volatile: { ...actor?.volatile, inventory: PACKED_ITEMS } }] };
}

test("Status: expanding a roster entry TAKES OVER the panel with the character — everything Sheet-the-tab held", async ({ mount, page }) => {
  await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The roster is the list of people; the name IS the door (a named button, not a mystery row).
  await expect(component.locator('[data-slot="rpg-status-tab"]')).toBeVisible();
  await component.getByRole("button", { name: "Open Mara" }).click();

  // The takeover REPLACES the roster (one place at a time — not an accordion under the row).
  const detail = component.locator('[data-slot="rpg-character-detail"]');
  await expect(detail).toBeVisible();
  await expect(component.locator('[data-slot="rpg-status-tab"]')).toHaveCount(0);

  // The Sheet-tab inventory of planes, all present on the character: title, level, wallet, the attribute
  // value under its profile label, and this actor's live tracker readings + conditions.
  await expect(detail.getByRole("button", { name: "Mara title" })).toContainText("Warden");
  // RV-11 — the sheet's FLAVOR prose, the gloss line under the name (written by patchSheet, read by nobody
  // until now). Editable here (host), so it is the click-to-edit rest button carrying the text.
  await expect(detail.getByRole("button", { name: "Mara flavor" })).toContainText("Sworn to a house that no longer exists.");
  await expect(detail.getByRole("button", { name: "Level value" })).toContainText("3");
  await expect(detail.getByRole("button", { name: "gold amount" })).toContainText("128");
  await expect(detail.getByRole("button", { name: "STR value" })).toContainText("14");
  await expect(detail).toContainText("Vitality");
  await expect(detail.getByText("poisoned")).toBeVisible();

  // The breadcrumb is the way back — and it lands on the roster, not on a blank panel.
  await detail.getByRole("button", { name: "Back to the roster" }).click();
  await expect(component.locator('[data-slot="rpg-status-tab"]')).toBeVisible();
  await expect(component.locator('[data-slot="rpg-character-detail"]')).toHaveCount(0);
});

test("Status takeover: a sheet edit fires patchSheet and a tracker edit fires patchActor — the mutation COUNTs", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  // An ATTRIBUTE value (the plane that only existed on the dissolved tab) writes through patchSheet.
  await component.getByRole("button", { name: "STR value" }).click();
  const attr = component.getByRole("textbox", { name: "STR value" });
  await attr.fill("16");
  await attr.blur();
  await expect.poll(() => trpc.count("rpg.patchSheet"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);

  // A tracker READING on the same surface writes through patchActor (the op-shaped volatile plane).
  await component.getByRole("button", { name: "Vitality value" }).click();
  const vit = component.getByRole("textbox", { name: "Vitality value" });
  await vit.fill("18");
  await vit.blur();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);

  // The PURSE is the takeover's other volatile plane, and it rides the named-amount op (an upsert server-side)
  // — the wire carries the slot name + its new amount, nothing about the actor's other slots or planes.
  await component.getByRole("button", { name: "gold amount" }).click();
  const coin = component.getByRole("textbox", { name: "gold amount" });
  await coin.fill("140");
  await coin.blur();
  await expect
    .poll(() => trpc.lastInput("rpg.patchActor"), { intervals: [20, 50, 100] })
    .toMatchObject({ ops: [{ op: "setWalletAmount", name: "gold", amount: 140 }] });
});

// The takeover on a MOBILE-width panel (the build-time verification the unification §3 asks for): the panel
// IS the screen there, so the takeover must not need a second navigation layer to escape — it swaps the
// viewport in place, and the breadcrumb is a real ≥44px touch target (the coarse-pointer control floor).
test.describe("the takeover at mobile width", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

  test("expand + return work at 390px, and the breadcrumb meets the coarse touch floor", async ({ mount, page }) => {
    await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
    const component = await mount(<RpgTakeoverStory />);
    await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();
    await component.getByRole("button", { name: "Open Mara" }).click();

    const detail = component.locator('[data-slot="rpg-character-detail"]');
    await expect(detail).toBeVisible();
    const back = detail.getByRole("button", { name: "Back to the roster" });
    const box = await back.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(component.locator('[data-slot="rpg-status-tab"]')).toBeVisible();
  });
});

// RV-7 — the PHASE-locked Map OPENS onto the body that states the promise (it used to open onto nothing).
// The 2026-08-01 side-eye found the two input paths DISAGREEING about that: the cell was `aria-disabled`
// (so AT announced "unavailable" and Playwright's actionability refused the click) while Enter opened it
// anyway. One story now — a real tab wearing a lock — so BOTH paths are driven here, plus the SR contract:
// the reason is the cell's accessible DESCRIPTION (`title` beside an `aria-label`), not a mouse-only tooltip.
test("RV-7: the locked Map tab opens onto its coming-soon body from BOTH the mouse and the keyboard", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  const mapTab = component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Map" });
  // NOT aria-disabled: the lock is a glyph + a reason, not a refusal the tab does not honour.
  await expect(mapTab).not.toHaveAttribute("aria-disabled", "true");
  await expect(mapTab).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");

  // MOUSE — a plain click (Playwright would refuse this outright on an aria-disabled control).
  await mapTab.click();
  const map = component.locator('[data-slot="rpg-map-tab"]');
  await expect(map).toBeVisible();
  await expect(map).toContainText("Maps unlock with the map arc");
  await expect(map).toContainText("arrives with MA-3");

  // KEYBOARD — leave and come back with Enter, so the path is proven independently of the click above.
  await component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Scene" }).click();
  await expect(map).toBeHidden();
  await mapTab.focus();
  await page.keyboard.press("Enter");
  await expect(component.locator('[data-slot="rpg-map-tab"]')).toBeVisible();
});

// RV-4 / RV-12 — the stat profile was a READ-ONLY badge row: a game shipped with six d20 attributes or none,
// and the HINT (the steering lever the model reads) was unauthorable. It is now a full def plane.
test("RV-4/RV-12: the GM stat profile adds, renames and GLOSSES attributes — each write fires updateConfig", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  const profile = component.locator('[data-slot="rpg-stat-profile"]');
  // RENAME the stubbed "Strength" (display-at-rest — the field appears on click).
  await profile.getByRole("button", { name: "Attribute 1 label" }).click();
  const label = profile.getByRole("textbox", { name: "Attribute 1 label" });
  await label.fill("Might");
  await label.blur();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(1);

  // The HINT editor (non-negotiable per the unification — this is what the prompt carries).
  await profile.getByRole("button", { name: "Strength hint" }).click();
  const hint = profile.getByRole("textbox", { name: "Strength hint" });
  await hint.fill("how hard you can push");
  await hint.blur();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(2);

  // ADD — the shared AddRow: a name is required first, and Enter commits it.
  const draft = profile.getByRole("textbox", { name: "New attribute name" });
  await draft.fill("Grace");
  await draft.press("Enter");
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(3);
  await expect
    .poll(() => trpc.lastInput("rpg.updateConfig"), { intervals: [20, 50, 100] })
    .toMatchObject({ patch: { statProfile: { attributes: [{ key: "str" }, { key: "grace", label: "Grace", hint: "" }] } } });
});

// RV-5 — the pack had NO add/edit at all, and `location` (stored, and asked of the model in the extraction
// guidance) never reached a surface. The list view is the edit view.
test("RV-5: the pack adds an item and edits its LOCATION in place — the patchActor ops + the lock derivation", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  // ADD (a name is required first — no "Item 3" orphans).
  await component.getByRole("textbox", { name: "New item name" }).fill("Rope");
  await component.getByRole("button", { name: "Add item" }).click();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBe(1);
  // The item's ID is not on the wire — identity is server-minted (the model applier's own seam).
  await expect.poll(() => trpc.lastInput("rpg.patchActor"), { intervals: [20, 50, 100] }).toMatchObject({ ops: [{ op: "addItem", item: { name: "Rope" } }] });

  // EDIT — the list lens carries every datum, `location` included.
  await component.getByRole("button", { name: "Show as a list" }).click();
  const row = component.locator('[data-slot="rpg-pack-row"]').first();
  await expect(row).toContainText("belt pouch");
  await row.getByRole("button", { name: "Bone key location" }).click();
  const location = component.getByRole("textbox", { name: "Bone key location" });
  await location.fill("sewn into the lining");
  await location.blur();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBe(2);
  // The panel names the OP, not the lock path: the pin (`…inventory`, whose Release lives on the section
  // kicker) is DERIVED server-side per op (R1), so a client can no longer claim a path it didn't edit.
  const input = trpc.lastInput("rpg.patchActor") as { readonly ops: readonly Record<string, unknown>[]; readonly autoLock?: boolean };
  expect(input.ops).toEqual([{ op: "patchItem", id: "item_ct_key", patch: { location: "sewn into the lining" } }]);
  expect(input.autoLock).toBeUndefined();
});

// R4c — the journal `label` was write-only rot: model-writable, stored, returned on the view, rendered NOWHERE
// (the chronicle printed the generic type word for every custom entry).
test("a CUSTOM journal entry renders its own label; an entry without one falls back to the type word", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Journal" }).click();

  const chronicle = component.locator('[data-slot="rpg-journal-tab"]');
  await expect(chronicle).toContainText("prophecy");
  await expect(chronicle).not.toContainText("CUSTOM");
  // The label-less entries still read as their type ("Character" for `npc`).
  await expect(chronicle).toContainText("Character");
});

test("RV-5: a MEMBER reads the pack with no authoring affordances (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: richTracker(), chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  await expect(component.locator('[data-slot="rpg-inventory-tab"]')).toContainText("Bone key");
  await expect(component.getByRole("textbox", { name: "New item name" })).toHaveCount(0);
});

// The owner dogfood pass on the GRID lens (2026-07-31): the pack tile was a 3.5rem SQUARE holding a 20px
// glyph — the quantity was a lost corner digit, the location truncated to "belt p…", and the name existed
// only on hover. The tile is now the item's own card: name (wrapped) · ×N · where it's kept, in a card
// SHORTER than the old square, and a host clicks it to edit in place.
test("the pack GRID tile carries the ×N and the location, at a density SHORTER than the old square", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  const cells = component.locator('[data-slot="rpg-pack-cell"]');
  await expect(cells).toHaveCount(PACKED_ITEMS.length);
  // The three data the tile now spells out (a stack of ONE renders no ×1 — the list row's exact grammar).
  const dagger = cells.filter({ hasText: "Iron dagger" });
  await expect(dagger).toContainText("×3");
  await expect(dagger).toContainText("strapped across her back");
  const key = cells.filter({ hasText: "Bone key" });
  await expect(key).toContainText("belt pouch");
  await expect(key).not.toContainText("×1");

  // GEOMETRY (the density change, asserted — not eyeballed): a single-line tile is SHORTER than the 3.5rem
  // square it replaced, and no tile overflows its track (a model-authored name wraps, it never spills).
  // "Torch", not "Rope, 30 ft": since the story mounts the REAL `.shell-panel-body` box (2026-08-01), the
  // content width is the panel's true one and the longer name legitimately wraps to two lines — which is
  // the wrap rule below, not a density regression. The single-line claim needs a single-line name.
  const torch = cells.filter({ hasText: "Torch" });
  const torchBox = await torch.boundingBox();
  expect(torchBox?.height ?? 0).toBeLessThan(56);
  const overflow = await cells.evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
  expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
  await component.locator('[data-slot="rpg-inventory-tab"]').screenshot({ path: "reports/snaps/pack-grid-after.png" });
});

test("clicking a GRID tile edits that item in place — the same click-to-edit grammar, one write path", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  // The tile IS the door (the grid lens no longer sends the host to the list view to author).
  await component.getByRole("button", { name: "Edit Bone key" }).click();
  const editor = page.locator('[data-slot="rpg-pack-tile-editor"]');
  await expect(editor).toBeVisible();

  // Every entry the list row edits is editable here, through the same TrackerValue grammar + write path.
  await editor.getByRole("button", { name: "Bone key location" }).click();
  const location = page.getByRole("textbox", { name: "Bone key location" });
  await location.fill("sewn into the lining");
  await location.blur();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBe(1);
  // The grid writes the SAME op the list row does (one authoring home, one write path).
  await expect
    .poll(() => trpc.lastInput("rpg.patchActor"), { intervals: [20, 50, 100] })
    .toMatchObject({ ops: [{ op: "patchItem", patch: { location: "sewn into the lining" } }] });

  await editor.getByRole("button", { name: "Bone key quantity" }).click();
  const quantity = page.getByRole("textbox", { name: "Bone key quantity" });
  await quantity.fill("4");
  await quantity.blur();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBe(2);
});

// The P4 card knobs were STORED, wired into the reminder + the §4.8 lenient wrap, and had NO editor —
// the D107 dead-switch class (owner dogfood 2026-07-31: "we are missing the toggle to enable/disable the
// interactive html part of the prompt"). The stub game carries both OFF.
test("the Game tab toggles immersive HTML, and the interactivity sub-toggle is DISABLED (not hidden) while it is off", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // APPLICABILITY, not absence: the sub-toggle is visible and disabled — an interactivity ask is
  // meaningless with no card ask to make interactive, and the reason has to stay readable.
  const cards = component.getByRole("switch", { name: "Immersive HTML cards" });
  const interactive = component.getByRole("switch", { name: "Allow interactivity in cards" });
  await expect(cards).toBeVisible();
  await expect(interactive).toBeDisabled();

  // The parent writes through the ONE config door (the autosave form's debounce).
  await cards.click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [50, 100, 200] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ patch: { immersiveHtml: true } });

  // With the teaching on, the sub-toggle becomes reachable and writes its own arm of the same patch.
  await expect(interactive).toBeEnabled();
  await interactive.click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [50, 100, 200] }).toBe(2);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ patch: { immersiveHtml: true, immersiveHtmlInteractive: true } });
});

// R4c — `journalTypeHints` was stored, READ (the extraction prompt renders each gloss into the tool
// descriptions the model sees) and unauthorable: a host could define a custom beat type and had no way to say
// what it meant. The editor is the relationship-hints block, second instance.
test("the Game tab adds and glosses a CUSTOM JOURNAL TYPE — each write fires the ONE config door", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // The stub carries NO journal-type hints — the empty state has to say what an empty map MEANS, not just
  // render nothing (an absent section reads as "unbuilt").
  const tab = component.locator('[data-slot="rpg-game-tab"]');
  await expect(tab).toContainText("No custom journal types glossed yet");

  // ADD — the shared AddRow: a name is required first, Enter commits it, and the row is born gloss-less.
  const draft = tab.getByRole("textbox", { name: "New journal type" });
  await draft.fill("omen");
  await draft.press("Enter");
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig"), { intervals: [20, 50, 100] }).toMatchObject({ patch: { journalTypeHints: { omen: "" } } });

  // GLOSS the relationship label that IS in the stub — the same block, the same gesture, its own patch field
  // (the write must land on `relationshipHints`, never leak into the journal map they share a component with).
  await tab.getByRole("button", { name: "debtor hint" }).click();
  const hint = tab.getByRole("textbox", { name: "debtor hint" });
  await hint.fill("owes the party blood, not coin");
  await hint.blur();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(2);
  await expect
    .poll(() => trpc.lastInput("rpg.updateConfig"), { intervals: [20, 50, 100] })
    .toMatchObject({ patch: { relationshipHints: { debtor: "owes the party blood, not coin" } } });
});

// The §1.3 depth/budget NUMBERS were stored + wired (the reminder slice, the state round's evidence window,
// the reconcile cadence) with no editor — the D107 dead-switch class. The stepper writes through the SAME
// autosave form the toggles use, so its patch carries the whole scalar bag.
test("the Game tab's numeric knobs write through the config door — the reminder slice and the extraction window", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // The field shows the game's CURRENT value honestly (the stub's 6, not the schema default 8) — and its
  // placeholder still names the default, so a cleared box reads as configured-by-default, not broken.
  const beats = component.getByRole("textbox", { name: "Recent beats in the reminder" });
  await expect(beats).toHaveValue("6");
  await expect(beats).toHaveAttribute("placeholder", "8 (default)");
  // Step it (the stepper's keyboard arm — one deterministic decrement, no fill-vs-caret ambiguity).
  await beats.click();
  await beats.press("ArrowDown");
  await expect(beats).toHaveValue("5");
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [50, 100, 200] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ patch: { recentBeatsKeepLast: 5 } });

  // The window budget is APPLICABILITY-bound to the `window` context arm (the stub's) — and the extraction
  // trio rides the same door, so an unrelated depth edit must not disturb the beats value just written.
  const windowBudget = component.getByRole("textbox", { name: "Window budget (tokens)" });
  // The stepper renders its number grouped for reading (4,096) and steps by the contract's own granularity.
  await expect(windowBudget).toHaveValue("4,096");
  await windowBudget.click();
  await windowBudget.press("ArrowUp");
  await expect(windowBudget).toHaveValue("4,608");
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [50, 100, 200] }).toBe(2);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ patch: { extractionWindowTokens: 4608, recentBeatsKeepLast: 5 } });

  // `beat` has no window to budget — the field is ABSENT, never a disabled twin ([no-separate-reduced-modes]).
  await component.getByRole("button", { name: "beat", exact: true }).click();
  await expect(component.getByRole("textbox", { name: "Window budget (tokens)" })).toHaveCount(0);
});

test("a MEMBER's grid tile is a card, not a door (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: packedTracker(), chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  // The member READS everything the host does — and has no tile trigger at all.
  await expect(component.locator('[data-slot="rpg-pack-cell"]').filter({ hasText: "Healing potion" })).toContainText("×12");
  await expect(component.getByRole("button", { name: "Edit Bone key" })).toHaveCount(0);
});

// The POPULATE doorway on the takeover (owner ruling 2026-08-01): host-only, per character, BUTTON-ONLY. The
// two arms that matter are the mutation COUNT ([assert-the-mutation-fired] — the panel never reads the round's
// return; the invalidation repaints it) and the HONEST DISABLED state on a connection that cannot run it.

test("Status takeover: the born-state button fires populateFromCharacter for THIS character — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const populate = component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" });
  await expect(populate).toBeEnabled();
  await populate.click();
  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

/** The disabled-reason the born-state button carries on a writer-less connection (hoisted — a regex literal
 *  inside a test body is a per-call recompile, `useTopLevelRegex`). */
const NO_WRITER_REASON = /can't write structured state/;

test("Status takeover: a connection with no structured writer DISABLES the born-state button with the reason (never a hidden control)", async ({
  mount,
  page,
}) => {
  const trpc = await stubTakeover(page, {
    game: { ...(d20Game() as Record<string, unknown>), canPopulate: false },
    tracker: richTracker(),
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  // Still PRESENT (the affordance is real and the reason is stated) — and refusing, so no call is ever made.
  const populate = component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" });
  await expect(populate).toBeDisabled();
  await expect(populate).toHaveAttribute("title", NO_WRITER_REASON);
  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50] }).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WAVE MU — GAME MACROS on the crown console (owner ruling #20's game half). The read + write arms
// landed with nothing to author them: `config.userMacros` resolved in turns and appeared in Macro
// picks, and a host had no way to define one (the D107 dead-switch class). The section mounts the
// SAME `EntryListEditor` + `UserMacroEditorDialog` anatomy the preset's Macros tab uses (extracted to
// `#components`), and writes the WHOLE list through the one config door.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** One authored macro as `getConfigView` returns it (the full `UserMacroSpec` — the editor binds every field). */
function gameMacro(name: string, description = ""): unknown {
  return { name, description, args: [], body: "the stone hums", inputs: [], strict: false };
}

test("WAVE MU: the Game tab lists the game's macros and ADDS one — the WHOLE list rides the config door", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { config: configView([gameMacro("waystone", "how the stone reads")]) });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // The existing def reads as its CALL form + its own description (the list is the macro's identity).
  const section = component.locator('[data-slot="rpg-game-macros"]');
  await expect(section).toContainText("{{waystone}}");
  await expect(section).toContainText("how the stone reads");

  // Add → the shared editor Dialog opens on the new tail (it portals to document.body, so `page`).
  await section.getByRole("button", { name: "Add macro" }).click();
  await page.getByLabel("Name", { exact: true }).fill("house_rule");
  await page.getByRole("button", { name: "Done" }).click();

  // The write is a WHOLE-LIST replace: the payload carries the existing def AND the new one (a patch that
  // sent only the addition would silently delete the game's other macros).
  await expect
    .poll(() => trpc.lastInput("rpg.updateConfig"), { intervals: [100, 200, 400, 600] })
    .toMatchObject({ patch: { userMacros: [{ name: "waystone" }, { name: "house_rule" }] } });
});

test("WAVE MU: a name that collides with the active preset's macro carries the honest 'overrides preset' gloss", async ({ mount, page }) => {
  await stubTakeover(page, { config: configView([gameMacro("tone"), gameMacro("waystone")], ["tone", "narrator"]) });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // The colliding def states the CONSEQUENCE (the game def is the one that resolves) — the shadow rule is
  // real and invisible everywhere else; the non-colliding sibling stays unglossed (no blanket noise).
  const section = component.locator('[data-slot="rpg-game-macros"]');
  await expect(section).toContainText("Overrides preset");
  await expect(section.getByText("Overrides preset", { exact: false })).toHaveCount(1);
});

test("WAVE MU: with no macros the section says what empty MEANS (never a blank that reads as unbuilt)", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  await expect(component.locator('[data-slot="rpg-game-macros"]')).toContainText("No game macros yet");
});

test("WAVE MU: a MEMBER never reaches the macro editor — the whole crown console is host-gated (PERMISSION-omit)", async ({ mount, page }) => {
  await stubTakeover(page, { chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);

  // The console tab itself is omitted for a member (never a disabled twin), so the section cannot be reached.
  await expect(component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" })).toHaveCount(0);
  await expect(component.locator('[data-slot="rpg-game-macros"]')).toHaveCount(0);
});

// ── HUD-1: the pane IS the HUD ───────────────────────────────────────────────────────────────────────
// The claim is over the WHOLE pane, so the assertions below are about OWNERSHIP and GEOMETRY, not content:
// the shell's band is empty (the claimant paints its own top edge), the shell's `.ctx-tab-strip` never
// renders, and the HUD spends its own vertical budget (§7.1 — the dead-zone rule).

test("HUD-1: the rpg HUD CLAIMS the pane — the shell's band is empty and its generic strip never renders", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await expect(component.getByRole("tablist", { name: "Game state" })).toBeVisible();

  // The claimant renders inside the single-writer region host…
  await expect(component.locator("[data-context-region]")).toHaveCount(1);
  // …the shell's band slot has NO content (D66 A1 suspended for a claimed pane — the HUD owns the top edge)…
  await expect(component.locator(".shell-panel-header")).toBeEmpty();
  // …and no shell-owned strip exists in the pane at all: the HUD draws its own rails.
  await expect(component.locator(".ctx-tab-strip")).toHaveCount(0);
});

test("HUD-1 §7.2: a rail cell RENDERS its caption at the real panel width — the box holds glyph over word", async ({ mount, page }) => {
  // F6 defect 2: the shared strip's container-query reveal can never fire at the widths the shell gives this
  // panel, so the game rail was icon-only permanently. The HUD's cells carry the word unconditionally — and
  // the assertion is the CELL'S BOX, not the text node: the first build appended `h-auto` to the primitive's
  // sealed `h-control-sm`, which tailwind-merge cannot resolve on a custom token, so the caption rendered
  // into a clipped ~5px sliver while every class-string assertion stayed green (`done ≠ rendered`).
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const inventory = component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Inventory" });

  await expect(inventory).toContainText("Inventory");
  const glyph = inventory.locator("svg");
  const caption = inventory.getByText("Inventory");
  await expect(glyph).toBeVisible();
  const [cellBox, glyphBox, captionBox] = await Promise.all([inventory.boundingBox(), glyph.boundingBox(), caption.boundingBox()]);
  if (cellBox === null || glyphBox === null || captionBox === null) {
    throw new Error("expected the cell, its glyph and its caption to be laid out");
  }
  const padding = await inventory.evaluate((el) => {
    const style = getComputedStyle(el);
    return Number.parseFloat(style.paddingBlockStart) + Number.parseFloat(style.paddingBlockEnd);
  });
  const lineHeight = await caption.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  // THE SQUASH IS THE DEFECT, and it is what a naive "does it fit" check misses: pinned to 32px the cell did
  // not overflow — it CRUSHED its own children, rendering a 6px glyph over a 5px sliver of the word. So the
  // children are measured against what they are: the glyph is square, and the caption owns its line-box.
  expect(glyphBox.height).toBeCloseTo(glyphBox.width, 0);
  expect(captionBox.height).toBeGreaterThanOrEqual(lineHeight - 0.5);
  // …and the cell is at least as tall as what it holds, with the caption UNDER the glyph and inside the box.
  expect(cellBox.height).toBeGreaterThanOrEqual(padding + glyphBox.height + captionBox.height);
  expect(captionBox.y).toBeGreaterThanOrEqual(glyphBox.y + glyphBox.height);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(cellBox.y + cellBox.height);
});

test("HUD-1 §7.2: only the PHASE-LOCKED cell carries a `title` — a live cell's word is on screen already", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const rail = component.getByRole("tablist", { name: "Game state" });
  await expect(rail.getByRole("tab", { name: "Inventory" })).not.toHaveAttribute("title", ANY_TITLE);
  await expect(rail.getByRole("tab", { name: "Map" })).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
});

test("HUD-1: the ACTIVE cell's caption takes the cell's accent state colour (the Text primitive must not win)", async ({ mount, page }) => {
  // `voice="gloss"` paints `text-muted-foreground`; without `text-inherit` the caption stays grey while the
  // glyph and the cell tint go accent, which reads as "nothing is selected". Asserted as the COMPUTED colour
  // against the same token the cell's `data-active:text-primary` resolves to.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const rail = component.getByRole("tablist", { name: "Game state" });
  await rail.getByRole("tab", { name: "Scene" }).click();
  await expect(rail.getByRole("tab", { name: "Scene" })).toHaveAttribute("aria-selected", "true");

  const activeCaption = rail.getByRole("tab", { name: "Scene" }).getByText("Scene");
  const restingCaption = rail.getByRole("tab", { name: "Quests" }).getByText("Quests");
  // Caption and cell are read in ONE evaluate and POLLED: the cell carries a colour transition, so two
  // separate reads land at two different instants of the same interpolation and disagree by a hair even
  // when the wiring is right (H2 widened that transition and this test caught itself on it).
  await expect
    .poll(
      () =>
        activeCaption.evaluate((el) => {
          const cell = el.closest('[data-slot="tabs-tab"]') as Element;
          return getComputedStyle(el).color === getComputedStyle(cell).color;
        }),
      { intervals: [20, 50, 100, 200] },
    )
    .toBe(true);
  const [active, resting] = await Promise.all([
    activeCaption.evaluate((el) => getComputedStyle(el).color),
    restingCaption.evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(active).not.toBe(resting);
});

test("HUD-1 §3.6 fence 6: the ACTIVE tabpanel is NAMED by its cell — two rails off one root break Base UI's own association", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const scene = component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Scene" });
  await scene.click();
  await expect(scene).toHaveAttribute("aria-selected", "true");

  const panel = component.locator('[data-slot="tabs-panel"]:visible');
  const labelledBy = await panel.getAttribute("aria-labelledby");
  const cellId = await scene.getAttribute("id");
  expect(labelledBy).not.toBeNull();
  expect(labelledBy).toBe(cellId);
  // …and the id actually resolves to the cell, so the name is a real one, not a dangling reference.
  await expect(component.locator(`[id="${labelledBy ?? ""}"]`)).toHaveAttribute("role", "tab");
});

test("HUD-1 §7.1: the admin rail is PINNED to the pane's foot — on a short body AND a tall one, with no jump", async ({ mount, page }) => {
  // The dead-zone rule as owner decision 6 was re-answered on real screenshots: the viewport is
  // `flex: 0 1 auto` (a short body takes its natural height, never a half-empty stretched scroll region),
  // the GROUND absorbs the residual span, and the rail sits on the pane's bottom edge in BOTH states — a
  // rail floating ~400px up the pane was the defect. Measured, never eyeballed.
  await stubTakeover(page);
  // Measured at the 30rem × 900 reference, not the 320-wide story: at 320 the game rail wraps to two rows
  // (side-eye 08-01) and this stub's Journal body then fills the pane exactly, so there is no residual span
  // left for the GROUND to be — and "the ground is painted" is precisely what this test exists to pin.
  const component = await mount(<RpgTakeoverReferenceStory />);
  const region = component.locator("[data-context-region]");
  await expect(region).toBeVisible();
  const rail = component.getByRole("tablist", { name: "Chat" });

  // Measure only once the swap has SETTLED: Base UI keeps the outgoing panel mounted through its exit
  // transition, so a mid-swap read sees two viewports (the DEF-14 flake class). The panel is addressed by
  // its accessible name — which it has because the cell labels it (the fence-6 CT above).
  const footOf = async (tabName: string): Promise<{ readonly railBottom: number; readonly regionBottom: number; readonly viewportBottom: number }> => {
    await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);
    const [railBox, regionBox, viewportBox] = await Promise.all([
      rail.boundingBox(),
      region.boundingBox(),
      component.getByRole("tabpanel", { name: tabName }).boundingBox(),
    ]);
    if (railBox === null || regionBox === null || viewportBox === null) {
      throw new Error("expected the admin rail, the region and the viewport to be laid out");
    }
    return { railBottom: railBox.y + railBox.height, regionBottom: regionBox.y + regionBox.height, viewportBottom: viewportBox.y + viewportBox.height };
  };

  // SHORT body (Journal on the stub's three entries) — the rail sits ON the pane's bottom edge, and the
  // span between the body and it is the HUD's ground, not a void the rail floats above.
  await component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Journal" }).click();
  // Settle the swap BEFORE measuring — geometry read mid-transition is the DEF-14 flake class.
  await expect(component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Journal" })).toHaveAttribute("aria-selected", "true");
  const short = await footOf("Journal");
  expect(short.railBottom).toBeCloseTo(short.regionBottom, 0);
  expect(short.viewportBottom).toBeLessThanOrEqual(short.railBottom);
  // The span between them is the GROUND, and it is PAINTED — a treatment that failed to compile would
  // leave exactly the bare void this fix exists to kill, with every geometry assertion still green.
  const ground = component.locator('[data-slot="rpg-hud-ground"]');
  await expect(ground).toBeVisible();
  await expect.poll(() => ground.evaluate((el) => getComputedStyle(el).backgroundImage), { intervals: [20, 50, 100] }).toContain("linear-gradient");

  // TALL body (Status: roster + orbs + the veiled ledger) — the viewport shrinks and scrolls, and the rail
  // has NOT moved: the two states differ by no layout jump at all.
  await component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Status" }).click();
  await expect(component.getByRole("tablist", { name: "Game state" }).getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  const tall = await footOf("Status");
  expect(tall.railBottom).toBeCloseTo(short.railBottom, 0);
  expect(tall.railBottom).toBeCloseTo(tall.regionBottom, 0);
});

test("HUD-1 §5.2: the primary binding edge paints FLUSH at the pane's top edge, full-bleed — like the generic band's", async ({ mount, page }) => {
  // The claimant owns the pane's TOP EDGE. Under the shell's panel-body padding the HUD's edge landed 8px
  // down and 8px shy of both inline edges while the generic band's inset one paints at row 0 across the
  // full width (2026-08-01 side-eye, measured off the real screenshots). shell.css drops that padding under
  // a claim; this pins the geometry, in the real `.shell-panel` anatomy the story now mounts.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const pane = component.locator(".shell-panel");
  const band = component.locator('[data-slot="rpg-hud-band"]');
  await expect(band).toBeVisible();
  const [paneBox, bandBox, width] = await Promise.all([
    pane.boundingBox(),
    band.boundingBox(),
    band.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth)),
  ]);
  if (paneBox === null || bandBox === null) {
    throw new Error("expected the pane and the HUD's band to be laid out");
  }
  // Row 0 of the pane, and both inline edges reached (the pane's own 1px hairline frame is the only slack).
  expect(bandBox.y).toBeCloseTo(paneBox.y, 0);
  expect(bandBox.x - paneBox.x).toBeLessThanOrEqual(1);
  expect(paneBox.x + paneBox.width - (bandBox.x + bandBox.width)).toBeLessThanOrEqual(1);
  expect(width).toBe(2);
});

// ── HUD-1 H2, THE VOICE PASS (F6 defects 1 + 3) ─────────────────────────────────────────────────────
// Everything below is a COMPUTED read. The whole class of defect H2 fixes is invisible to a class-string
// assertion: "the meta strip reads as an action bar" and "the selection is invisible across the split" are
// statements about resolved colour, resolved text-transform and resolved geometry, and every one of them
// stayed green through the rendered defects the 2026-08-01 audit photographed.

/** The colour the browser resolves for one of OUR tokens — via a probe element, so the assertion compares
 *  two BROWSER-RESOLVED colours rather than a token string against a serialised `oklch()` (those never match
 *  textually, and a test comparing strings is asserting our authoring, not the pixels). */
function resolvedToken(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, token);
}

test("HUD-1 §4: the admin rail is a TAB GROUP — its own name on screen, in the kicker voice, as the rail's edge", async ({ mount, page }) => {
  // F6 defect 3: the meta strip read as an action bar because nothing said it was a second set of TABS of
  // the same panel. The fix is the rail's own NAME, visible — and its hairline rule IS the rail's top edge,
  // so naming the group costs one line and not a second divider.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const kicker = component.locator('[data-slot="rpg-hud-rail-kicker"]');
  await expect(kicker).toBeVisible();
  await expect(kicker).toContainText("Chat");

  const caption = kicker.locator('[data-slot="text"]');
  const [transform, size, micro] = await Promise.all([
    caption.evaluate((el) => getComputedStyle(el).textTransform),
    caption.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-micro")) * 16),
  ]);
  // The kicker VOICE, resolved: micro-caps off the type scale — not a size picked at this call site.
  expect(transform).toBe("uppercase");
  expect(size).toBeCloseTo(micro, 0);

  // The kicker's rule replaces the rail's own track: one line at the rail's top edge, never two.
  const adminList = component.getByRole("tablist", { name: "Chat" });
  const gameList = component.getByRole("tablist", { name: "Game state" });
  await expect.poll(() => adminList.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  await expect.poll(() => gameList.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderBottomWidth))).toBeGreaterThan(0);
  // …and the rule the kicker draws instead is really painted (a Separator that failed to lay out would
  // leave an unbounded word floating over the rail with every other assertion green).
  const ruleWidth = (await kicker.locator('[data-slot="separator"]').boundingBox())?.width ?? 0;
  expect(ruleWidth).toBeGreaterThan(0);
});

test("HUD-1 §4: HOST-ONLY cells wear the crown gold at rest — and only at rest", async ({ mount, page }) => {
  // "Host-only reads without a label" (panel-redesign §6 P3). The flag is DECLARED by each tab's owner
  // (`ContextTabDef.crown`), so this also proves the resolve carried a chat-owned flag and an rpg-owned one
  // through the same seam to one renderer.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const rail = component.getByRole("tablist", { name: "Chat" });
  const highlight = await resolvedToken(page, "--color-highlight");

  const glyphColor = async (tabName: string): Promise<string> =>
    rail
      .getByRole("tab", { name: tabName })
      .locator("svg")
      .first()
      .evaluate((el) => getComputedStyle(el).color);

  // THE CROWN INHERITS THE RECEDE (side-eye 08-01). The landing tab is `rpg.status`, so the ADMIN rail is
  // the receded one — and while it recedes its crowns recede with it. Full gold on a quiet strip made the
  // crown the brightest pixel in the rail that does NOT hold the selection.
  const receded = await glyphColor("Preview");
  expect(receded).not.toBe(highlight);
  expect(receded).toBe(await glyphColor("This chat"));

  // Give the admin rail the selection and its crowns light up — the gold marks a class of CELL, within its
  // rail's own voice.
  await rail.getByRole("tab", { name: "This chat" }).click();
  await expect(rail.getByRole("tab", { name: "This chat" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => glyphColor("Preview"), { intervals: [20, 50, 100, 200] }).toBe(highlight);
  expect(await glyphColor("Game")).toBe(highlight);
  // A non-host cell in the SAME (owning) rail is untouched — the gold marks a class of cell, not the rail.
  expect(await glyphColor("This chat")).not.toBe(highlight);

  // ACTIVE beats crowned: once the cell is the answer to "where am I", the accent state colour owns it —
  // a gold glyph inside an accent cell argues with the one treatment that means "selected".
  await rail.getByRole("tab", { name: "Preview" }).click();
  await expect(rail.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  expect(await glyphColor("Preview")).not.toBe(highlight);
});

test("HUD-1 §4: the NON-OWNING rail recedes and the owning one lifts — the selection is legible across the split", async ({ mount, page }) => {
  // F6 defect 1, structurally: ONE component knows both rails' state, so the rail holding the selection can
  // carry a resting surface fill and foreground captions while the other has neither. Measured as resolved
  // colour on both rails, in both directions — a one-directional check would pass on a stuck rail.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const gameList = component.getByRole("tablist", { name: "Game state" });
  const adminList = component.getByRole("tablist", { name: "Chat" });
  const fill = (list: ReturnType<typeof component.getByRole>): Promise<string> => list.evaluate((el) => getComputedStyle(el).backgroundColor);
  const captionColor = (list: ReturnType<typeof component.getByRole>, tabName: string, word: string): Promise<string> =>
    list
      .getByRole("tab", { name: tabName })
      .getByText(word)
      .evaluate((el) => getComputedStyle(el).color);

  // The landing is `rpg.status` (the game rail's `defaultTab`), so the GAME rail owns.
  const transparent = "rgba(0, 0, 0, 0)";
  expect(await fill(gameList)).not.toBe(transparent);
  expect(await fill(adminList)).toBe(transparent);
  const owningCaption = await captionColor(gameList, "Quests", "Quests");
  const recededCaption = await captionColor(adminList, "This chat", "This chat");
  expect(owningCaption).not.toBe(recededCaption);

  // Cross the split — and BOTH rails answer. (The caption compared on each side belongs to a tab that is
  // NOT the selected one, so this is the rail's voice changing, never the active cell's own treatment.)
  // POLLED, not read once: the cells carry a colour TRANSITION, so a synchronous read lands mid-interpolation
  // on a value that is neither state (the first run of this test caught itself at oklab L=0.919, between
  // muted-foreground's 0.74 and foreground's 0.955) — the settled colour is the assertion.
  await adminList.getByRole("tab", { name: "This chat" }).click();
  await expect(adminList.getByRole("tab", { name: "This chat" })).toHaveAttribute("aria-selected", "true");
  expect(await fill(adminList)).not.toBe(transparent);
  expect(await fill(gameList)).toBe(transparent);
  await expect.poll(() => captionColor(adminList, "Preview", "Preview"), { intervals: [20, 50, 100, 200] }).toBe(owningCaption);
  await expect.poll(() => captionColor(gameList, "Quests", "Quests"), { intervals: [20, 50, 100, 200] }).toBe(recededCaption);
});

test("HUD-1 §7.3: the band's LAST line ECHOES the selection — named rail, named tab, announced by neither", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const echo = component.locator('[data-slot="rpg-hud-echo"]');
  const band = component.locator('[data-slot="rpg-hud-band"]');

  await expect(echo).toHaveText("Game state · Status");
  // It reads as the mock's kicker (caps) and it is the band's LAST line — the echo sits below the composite
  // it annotates, never floating above it.
  await expect.poll(() => echo.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
  const [echoBox, headerBox] = await Promise.all([echo.boundingBox(), band.locator('[data-slot="rpg-takeover-header"]').boundingBox()]);
  if (echoBox === null || headerBox === null) {
    throw new Error("expected the band's composite and its echo to be laid out");
  }
  expect(echoBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);

  // It is a VISUAL aid, not a second announcement: the rails already tell AT what is selected.
  await expect(echo).toHaveAttribute("aria-hidden", "true");

  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "This chat" }).click();
  await expect(echo).toHaveText("Chat · This chat");
});

// ── HUD-1 H3, THE WAYSTONE COMPACT + THE VERTICAL BUDGET (F6 defect 4's second half) ─────────────────

/** The tracker read of a game whose story has set NO scene — the exact state F6 measured burning ~140px of
 *  band on a dial and the words "No ambient set". Everything else about the game is unchanged. */
function ambientLessTrackerView(): unknown {
  return { ...(trackerView(false) as Record<string, unknown>), ambient: null };
}

test("HUD-1 §7.3: with no ambient set the band COMPRESSES to one row — a smaller stone with the cues beside it", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: ambientLessTrackerView() });
  const component = await mount(<RpgTakeoverReferenceStory />);
  const header = component.locator('[data-slot="rpg-takeover-header"]');
  await expect(header).toHaveAttribute("data-compact", "true");

  const stone = component.locator('[data-slot="waystone"]');
  const [stoneBox, headerBox] = await Promise.all([stone.boundingBox(), header.boundingBox()]);
  if (stoneBox === null || headerBox === null) {
    throw new Error("expected the compressed band and its stone to be laid out");
  }
  // ONE STEP DOWN, resolved: at this 30rem pane the mapping's full step is 120px and the compact step 96px
  // (packages/ui/src/charts/meter/variants.ts — the one sizing home; the step RELATION itself is pinned in
  // tests/ui/charts/meter/waystone.ct.tsx).
  expect(Math.round(stoneBox.width)).toBe(96);
  // ONE ROW, and a cheap one: the WHOLE compressed band now occupies less height than the full form's stone
  // alone (120px at this width) — against the 138px F6 measured for this exact state. It can only be that
  // short because the copy, the cues and the satellites sit BESIDE the stone instead of stacked under it.
  const fullStoneStep = 120;
  expect(headerBox.height).toBeLessThan(fullStoneStep);
  // …and the satellites really are in that row: past the stone's right edge, level with it.
  const orbBox = await component.locator('[data-slot="rpg-takeover-header"] [data-slot="ring-gauge"]').first().boundingBox();
  if (orbBox === null) {
    throw new Error("expected the band's pool orbs to be laid out");
  }
  expect(orbBox.x).toBeGreaterThan(stoneBox.x + stoneBox.width);
  expect(orbBox.y).toBeLessThan(stoneBox.y + stoneBox.height);
  expect(orbBox.y + orbBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
});

test("HUD-1 §7.1: the HUD's chrome stays inside its vertical budget at the 30rem × 900px reference", async ({ mount, page }) => {
  // THE MOTIVATING MEASUREMENT (F6 defect 4): on an ambient-less game the band alone was 138px — 68% of the
  // pane's chrome — while a ~400px dead zone sat under a short body. The budget is a RATIO against the pane,
  // never a px count, and it is asserted at the geometry §7.1 names: a 30rem docked panel, 900px tall.
  await stubTakeover(page, { tracker: ambientLessTrackerView() });
  const component = await mount(<RpgTakeoverReferenceStory />);
  const region = component.locator("[data-context-region]");
  await expect(region).toBeVisible();
  await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);

  const rails = await component.locator('[data-slot="rpg-hud-rail"]').all();
  // Both rails are really there — a budget met by a rail that failed to render is not a budget met.
  expect(rails).toHaveLength(2);
  const [regionBox, bandBox] = await Promise.all([region.boundingBox(), component.locator('[data-slot="rpg-hud-band"]').boundingBox()]);
  if (regionBox === null || bandBox === null) {
    throw new Error("expected the region and the band to be laid out");
  }
  const railBoxes = await Promise.all(rails.map((rail) => rail.boundingBox()));
  const railHeight = railBoxes.reduce((total, box) => total + (box?.height ?? 0), 0);
  expect(regionBox.height).toBeCloseTo(900, -1);

  // MEASURED 2026-08-01 at this reference: region 900 · band 141.75 · rails 116.375 · chrome 258.125 —
  // 28.7% of the pane, and the band is 54.9% of the chrome (it was 68%).
  const chrome = bandBox.height + railHeight;
  expect(chrome / regionBox.height).toBeLessThanOrEqual(0.3);
  // …and the band is no longer the chrome's dominant tenant: the state it was WORST at (nothing set) is now
  // its cheapest form, so the 68% F6 measured is a line it may not cross back over.
  expect(bandBox.height / chrome).toBeLessThan(0.65);
});

test("HUD-1 §7.1 (AMENDED): the AMBIENT-SET band's chrome stays inside the SET arm's budget — and the viewport keeps the majority", async ({ mount, page }) => {
  // THE SECOND ARM (side-eye 08-01 P1). The budget CT above pins the COMPACT arm and stubs `ambientLess`, so
  // the arm the panel actually lands on — a game with a scene set, the DEFAULT — was unguarded, and it
  // measured 41.2% against a law written as a flat ≤30%. §7.1 is amended to a two-arm law because the single
  // arm is unsatisfiable here without deleting the composite: at this reference the two rails alone cost
  // 116.375px, leaving 153.6px of the 270px ceiling — and the SET band's floor is 18px of padding + the
  // 120px stone row + 8px + the 13px echo ≈ 159px with ZERO satellites. The only way under is to shrink the
  // stone below the focal step F16 grew it to, which is the signature element the amendment protects.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverReferenceStory />);
  const region = component.locator("[data-context-region]");
  await expect(region).toBeVisible();
  await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);
  // The composite is really the full arm — a budget met by a band that collapsed to its compact form would
  // be measuring the other law.
  await expect(component.locator('[data-slot="rpg-takeover-header"]')).toHaveAttribute("data-compact", "false");

  const rails = await component.locator('[data-slot="rpg-hud-rail"]').all();
  expect(rails).toHaveLength(2);
  const [regionBox, bandBox] = await Promise.all([region.boundingBox(), component.locator('[data-slot="rpg-hud-band"]').boundingBox()]);
  if (regionBox === null || bandBox === null) {
    throw new Error("expected the region and the band to be laid out");
  }
  const railBoxes = await Promise.all(rails.map((rail) => rail.boundingBox()));
  const railHeight = railBoxes.reduce((total, box) => total + (box?.height ?? 0), 0);
  expect(regionBox.height).toBeCloseTo(900, -1);

  // MEASURED 2026-08-01 at this reference: region 900 · band 254.6 · rails 116.4 · chrome 371 — 41.2%.
  const chrome = bandBox.height + railHeight;
  expect(chrome / regionBox.height).toBeLessThanOrEqual(0.45);
  // THE RULE THAT SURVIVES BOTH ARMS, and the reason the budget exists at all: the VIEWPORT owns the
  // majority of the pane. A set band may cost more than an unset one; it may never cost more than the body.
  expect(chrome / regionBox.height).toBeLessThan(0.5);
});

test("side-eye 08-01: a POOLLESS pinned tracker is a DISC, not a full ring — shape follows the datum", async ({ mount, page }) => {
  // The band drew `max ?? value` as the ring's domain, so a tracker with NO ceiling rendered a permanently
  // FULL arc — the exact "lie of shape" DESIGN §2/§8.1 bans for the wallet. The eligibility rule: ceilinged
  // pool ⇒ arc; max-less quantity ⇒ the wallet's disc.
  const grit = { key: "grit", label: "Grit", value: 5, max: null, color: null };
  await stubTakeover(page, {
    tracker: {
      ...(trackerView(false) as Record<string, unknown>),
      trackerOrbs: [{ key: "vitality", label: "Vitality", value: 24, max: 30, color: null }, grit],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  const band = component.locator('[data-slot="rpg-hud-band"]');

  // The ceilinged pool keeps its arc…
  await expect(band.locator('[data-slot="ring-gauge"]')).toHaveCount(1);
  // …and the poolless one wears the disc, with its quantity as the datum (no invented `/5`).
  const disc = band.locator('[data-slot="coin-figure"]');
  await expect(disc).toHaveCount(1);
  await expect(disc).toContainText("Grit");
  await expect(band.getByText("5/5")).toHaveCount(0);
});

test("side-eye 08-01: at the panel's 17rem FLOOR the game rail wraps to rows of three — no 3-character captions", async ({ mount, page }) => {
  // Six cells on one `auto-cols-fr` row at 272px gave ~44px each and clipped four of the six captions to
  // ~3 characters (an icon-only rail wearing text, F6 defect 2 again). Below the `xs` container step the
  // rail lays out as rows of three. Asserted as RENDERED GEOMETRY: two rows, three columns, and every
  // caption's scrollWidth inside its own box (the definition of "not clipped").
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverFloorStory />);
  const list = component.getByRole("tablist", { name: "Game state" });
  await expect(list.getByRole("tab")).toHaveCount(6);

  const boxes = await Promise.all((await list.getByRole("tab").all()).map((tab) => tab.boundingBox()));
  const tops = new Set(boxes.map((box) => Math.round(box?.y ?? 0)));
  expect(tops.size).toBe(2);
  const firstRow = boxes.filter((box) => Math.round(box?.y ?? 0) === Math.min(...tops));
  expect(firstRow).toHaveLength(3);

  // No caption is truncated: the text's own scroll width fits the box it renders in.
  const clipped = await list.locator('[data-slot="rpg-hud-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

test("side-eye 08-01: at 320px the SIX-cell game rail wraps too — the caption that clips there is why", async ({ mount, page }) => {
  // The wrap fires at the `xs` step, not at the 272px floor, because that is where the measurement says the
  // words stop fitting: unwrapped at a 320px pane, "Inventory" wanted 48px of caption inside a 36px cell.
  // (The ADMIN rail, 3-4 cells, never wraps at any width — it is not spending vertical budget it doesn't
  // need to.)
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const game = component.getByRole("tablist", { name: "Game state" });
  await expect(game.getByRole("tab")).toHaveCount(6);
  const clipped = await game.locator('[data-slot="rpg-hud-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);

  const gameRows = new Set((await Promise.all((await game.getByRole("tab").all()).map((tab) => tab.boundingBox()))).map((box) => Math.round(box?.y ?? 0)));
  expect(gameRows.size).toBe(2);
  const admin = component.getByRole("tablist", { name: "Chat" });
  const adminRows = new Set((await Promise.all((await admin.getByRole("tab").all()).map((tab) => tab.boundingBox()))).map((box) => Math.round(box?.y ?? 0)));
  expect(adminRows.size).toBe(1);
});

// ── SIDE-EYE 08-01: THE PANEL STOPS INVENTING READINGS ────────────────────────────────────────────────

/** The same roster actor with NO tracker readings written — the state a fresh game is in before the story
 *  has touched anyone's pools (the defs exist; the values do not). */
function unwrittenTrackerView(): unknown {
  const base = trackerView(false) as { readonly actors: readonly Record<string, unknown>[] };
  const actor = base.actors[0] as Record<string, unknown>;
  return {
    ...base,
    actors: [{ ...actor, volatile: { ...(actor["volatile"] as Record<string, unknown>), trackerValues: {} } }],
    trackerOrbs: [],
  };
}

test("side-eye 08-01: an UNSET pool reads as an em dash, never a synthesized 0/max", async ({ mount, page }) => {
  // The panel was the lying surface (the reminder already renders unset carriage honestly): `?? 0` turned a
  // tracker nobody had written into "0/40" over an empty bar — and because TEXT is the datum, a screen
  // reader announced the invention as the character's reading.
  await stubTakeover(page, { tracker: unwrittenTrackerView() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  const row = component.locator('[data-slot="meter-row"]').first();
  await expect(row).toHaveAttribute("data-unset", "true");
  // The ceiling is a real fact (the def carries it); the READING is not — so the numerator is a dash.
  await expect(row).toContainText("—/30");
  await expect(component.getByText("0/30")).toHaveCount(0);
  // …and the decoration agrees with the text: an EMPTY rail, not a bar computed off the invented zero.
  const fillWidth = await row.locator('[data-slot="track-bar-fill"]').evaluate((el) => el.getBoundingClientRect().width);
  expect(fillWidth).toBe(0);
});

test("side-eye 08-01: the pack grid ends on the LAST ITEM — no empty ghost socket", async ({ mount, page }) => {
  // The grid shipped one dashed `aria-hidden` cell called a "growth affordance": 150×28px with no word in
  // it and nothing to click. The host's real add row sits directly beneath the grid.
  await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  await expect(component.locator('[data-slot="rpg-pack-cell"]')).toHaveCount(PACKED_ITEMS.length);
  await expect(component.locator('[data-slot="rpg-pack-ghost"]')).toHaveCount(0);
  // The growth affordance that DOES exist is a named control, not a box.
  await expect(component.getByRole("button", { name: "Add item" })).toBeVisible();
});

test("side-eye 08-01: a cast card's tracked readings are named by WHOSE they are", async ({ mount, page }) => {
  // Two cast members carrying the same tracker gave a name-navigating reader two buttons called "Trust
  // value" and no way to tell Sera's from Mara's — the card's own name was in the DOM, not in the control's.
  const trust = { ...VITALITY, key: "trust", label: "Trust", shape: "text", max: null, appliesTo: "npcs" };
  const base = trackerView(false) as Record<string, unknown>;
  const cast = base["cast"] as readonly Record<string, unknown>[];
  await stubTakeover(page, {
    tracker: {
      ...base,
      cast: [...cast, { ...cast[0], key: "mara-npc", name: "Mara the elder", appearance: "", thoughts: "" }],
      castTrackers: {
        sera: [{ def: trust, value: { value: "wary", items: null } }],
        "mara-npc": [{ def: trust, value: { value: "warm", items: null } }],
      },
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  await expect(component.getByRole("button", { name: "Sera Trust" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Mara the elder Trust" })).toBeVisible();
  // The old subjectless name is gone (it named two different readings).
  await expect(component.getByRole("button", { name: "Trust value" })).toHaveCount(0);
});
