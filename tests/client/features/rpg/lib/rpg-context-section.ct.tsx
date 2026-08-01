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
import { RpgTakeoverStory } from "../_ct-stories";

const GAME_ID = "rpg_game_ct_keystone";

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
// knob (the freshness-indicator driver). Defaults `cheap` (the two-call arm — the lagging label) unless overridden.
function gameView(trackersReadOnly: boolean, extractionMode: RpgExtractionMode = "cheap"): unknown {
  return {
    id: GAME_ID,
    chatId: "chat_ct_keystone",
    mode: "lite",
    status: "active",
    trackersReadOnly,
    extractionMode,
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
function configView(): unknown {
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
    // The P4/P5 knobs the scalar form projects (`toGmConsoleForm`).
    immersiveHtml: false,
    immersiveHtmlInteractive: false,
    cardKeepLastX: 3,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
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
  } = {},
): ReturnType<typeof routeTrpc> {
  const readOnly = opts.readOnly ?? false;
  return routeTrpc(page, {
    "chat.getChat": () => opts.chat ?? gameChat(),
    "rpg.getGame": () => opts.game ?? gameView(readOnly),
    "rpg.getTrackerView": () => opts.tracker ?? trackerView(readOnly),
    "rpg.editSnapshot": () => undefined,
    "rpg.patchSheet": () => undefined,
    "rpg.updateConfig": () => undefined,
    "rpg.upsertQuest": () => undefined,
    "rpg.deleteQuest": () => undefined,
    // The Journal tab's own reads + the RV-6 hand-authoring verbs (all host-gated server-side).
    "rpg.listJournal": () => JOURNAL_ENTRIES,
    "rpg.listCheckpoints": () => [],
    "rpg.addJournalEntry": () => "rpg_journal_ct_new",
    "rpg.editJournalEntry": () => undefined,
    "rpg.deleteJournalEntry": () => undefined,
    "rpg.getConfigView": () => configView(),
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
  const gameStrip = component.getByRole("tablist", { name: "Game" });
  await Promise.all(["Status", "Inventory", "Scene", "Quests", "Journal"].map((label) => expect(gameStrip.getByRole("tab", { name: label })).toBeVisible()));
  await expect(gameStrip.getByRole("tab", { name: "Sheet" })).toHaveCount(0);
  // Map is the ONE PHASE-locked tab: visible + aria-disabled with its reason on title (never hidden).
  const mapTab = gameStrip.getByRole("tab", { name: "Map" });
  await expect(mapTab).toBeVisible();
  await expect(mapTab).toHaveAttribute("aria-disabled", "true");
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

test("an editable pool value fires the editSnapshot mutation (host, writable) — the mutation COUNT", async ({ mount, page }) => {
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

  // Assert the MUTATION fired (the count), not the UI reaction (the save-catch could hide a throw).
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
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

  // The pin (§12.3 — aria-labelled) sits in the ambient strip beside the locked `location` field.
  const pin = component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Pinned by hand — click to release to the model" });
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
// stored as an override on their value plane (`editSnapshot`), never the game-wide def (`updateConfig`).
test("a tracker max edit writes THIS CHARACTER's ceiling override (editSnapshot, never updateConfig) + drags the reading", async ({ mount, page }) => {
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
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(0);
  // 20 ≠ the def's 30 ⇒ a genuine override is STORED, and because it is below the reading (24) the value is
  // dragged down in the SAME commit (never a silent truncate).
  await expect
    .poll(() => trpc.lastInput("rpg.editSnapshot"), { intervals: [20, 50, 100] })
    .toMatchObject({ patch: { actorState: [{ trackerValues: { vitality: { max: 20, value: 20 } } }] } });
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
    .poll(() => trpc.lastInput("rpg.editSnapshot"), { intervals: [20, 50, 100] })
    .toMatchObject({ patch: { actorState: [{ trackerValues: { vitality: { max: null } } }] } });
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
    extractionMode: "cheap",
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

test("Status takeover: a sheet edit fires patchSheet and a tracker edit fires editSnapshot — the mutation COUNTs", async ({ mount, page }) => {
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

  // A tracker READING on the same surface writes through editSnapshot (the volatile plane).
  await component.getByRole("button", { name: "Vitality value" }).click();
  const vit = component.getByRole("textbox", { name: "Vitality value" });
  await vit.fill("18");
  await vit.blur();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
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

// RV-7 — the PHASE-locked Map is `aria-disabled` (its reason stays keyboard-reachable), which means it still
// OPENS. It used to open onto nothing; now it states the promise.
test("RV-7: the locked Map tab opens onto a real coming-soon presentation, not a blank viewport", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The tab is `aria-disabled`, NOT `disabled` — a deliberate PHASE choice (the reason must stay reachable).
  // Playwright's actionability treats `aria-disabled` as un-clickable where the browser does not, so the drive
  // here is the KEYBOARD path the choice exists to preserve: focus the tab, press Enter, read the viewport.
  const mapTab = component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Map" });
  await mapTab.focus();
  await page.keyboard.press("Enter");
  const map = component.locator('[data-slot="rpg-map-tab"]');
  await expect(map).toBeVisible();
  await expect(map).toContainText("Maps unlock with the map arc");
  await expect(map).toContainText("arrives with MA-3");
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
test("RV-5: the pack adds an item and edits its LOCATION in place — the editSnapshot writes + the lock path", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  // ADD (a name is required first — no "Item 3" orphans).
  await component.getByRole("textbox", { name: "New item name" }).fill("Rope");
  await component.getByRole("button", { name: "Add item" }).click();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(1);

  // EDIT — the list lens carries every datum, `location` included.
  await component.getByRole("button", { name: "Show as a list" }).click();
  const row = component.locator('[data-slot="rpg-pack-row"]').first();
  await expect(row).toContainText("belt pouch");
  await row.getByRole("button", { name: "Bone key location" }).click();
  const location = component.getByRole("textbox", { name: "Bone key location" });
  await location.fill("sewn into the lining");
  await location.blur();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(2);
  // The hand edit PINS the plane it touched (#10) — the pack's Release lives on the section kicker.
  await expect
    .poll(() => trpc.lastInput("rpg.editSnapshot"), { intervals: [20, 50, 100] })
    .toMatchObject({ lockPaths: ["actorState.character:character_ct_mara.inventory"] });
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
  const rope = cells.filter({ hasText: "Rope, 30 ft" });
  const ropeBox = await rope.boundingBox();
  expect(ropeBox?.height ?? 0).toBeLessThan(56);
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
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(1);
  // The hand edit PINS the plane it touched (#10) — the grid writes the same lock path the list row does.
  await expect
    .poll(() => trpc.lastInput("rpg.editSnapshot"), { intervals: [20, 50, 100] })
    .toMatchObject({ lockPaths: ["actorState.character:character_ct_mara.inventory"] });

  await editor.getByRole("button", { name: "Bone key quantity" }).click();
  const quantity = page.getByRole("textbox", { name: "Bone key quantity" });
  await quantity.fill("4");
  await quantity.blur();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(2);
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

test("a MEMBER's grid tile is a card, not a door (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: packedTracker(), chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Inventory" }).click();

  // The member READS everything the host does — and has no tile trigger at all.
  await expect(component.locator('[data-slot="rpg-pack-cell"]').filter({ hasText: "Healing potion" })).toContainText("×12");
  await expect(component.getByRole("button", { name: "Edit Bone key" })).toHaveCount(0);
});
