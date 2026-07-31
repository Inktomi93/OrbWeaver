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
// knob (the freshness-indicator driver). Defaults `reliable` (the create default) unless overridden.
function gameView(trackersReadOnly: boolean, extractionMode: RpgExtractionMode = "reliable"): unknown {
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

// A `rpg.getTrackerView` stub — one roster actor with pools + a condition, ambient + orbs, cast, a goal, beats.
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
        sheet: { className: "Warden", attributes: {}, poolDefs: [], maxHp: null },
        volatile: {
          actorRef: { kind: "character", characterId: "character_ct_mara" },
          hp: null,
          pools: [
            { name: "Vitality", value: 24, max: 30 },
            { name: "Resolve", value: 7, max: 10 },
          ],
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
        emoji: "",
        mood: "guarded",
        // biome-ignore lint/style/useNamingConvention: `customFields` keys are DISPLAY-NAME data (a cast card's field label), not code identifiers — the fixture mirrors the wire shape.
        customFields: { Trust: "low" },
        relationship: { kind: "ally", label: "" },
      },
    ],
    // The host-defined cast-field SCHEMAS the Scene joins against `customFields` (empty here — the cast
    // member's `Trust` value renders only if a schema names it; the stub omits schemas so no meter/chip).
    castFields: [],
    widgets: [],
    quests: [{ id: "q1", name: "Keep the bone key", status: "active", description: "", objectives: [{ id: "o1", text: "Hold the door", completed: true }] }],
    recentBeats: ["The rain has not let up since dusk."],
    trackersReadOnly,
    poolOrbs: [
      { label: "Vitality", value: 24, max: 30 },
      { label: "Resolve", value: 7, max: 10 },
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

// A `rpg.getConfigView` stub — the HOST GM-console read (steering note, delivery model, cast-field schemas,
// relationship hints, the deception knobs, orb-pinning). Empty-but-valid defaults; the console renders it.
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
    extractionMode: "reliable",
    castFields: [{ key: "trust", label: "Trust", kind: "text" }],
    relationshipHints: { debtor: "owes the party a debt" },
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 6,
    pinnedOrbs: [],
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
const JOURNAL_ENTRIES = [
  { id: "rpg_journal_ct_1", type: "npc", title: "Sera's debt", content: "She owes the party a favour.", createdAt: 2000 },
  { id: "rpg_journal_ct_2", type: "location", title: "The Rusted Lantern", content: "", createdAt: 1000 },
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

test("the takeover renders the 6 LIVE game tabs + the locked Map (in the Game strip) when chat.rpg !== null, meta strip below", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The redesign's top strip (panel-redesign §4): 6 live game tabs — Quests + Journal are LIVE lite tabs
  // (the owner correction), never APPLICABILITY-omitted.
  const gameStrip = component.getByRole("tablist", { name: "Game" });
  await Promise.all(
    ["Status", "Sheet", "Inventory", "Scene", "Quests", "Journal"].map((label) => expect(gameStrip.getByRole("tab", { name: label })).toBeVisible()),
  );
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

test("the band renders EVERY server-derived orb — no client cap drops a pinned orb (orb-pinning)", async ({ mount, page }) => {
  // The server owns the auto-first-3 ∪ pinned selection + the envelope cap; the client renders them ALL. A
  // 4-orb `poolOrbs` (as if the host pinned a 4th pool) must yield 4 rendered orb data lines — a client
  // `.slice(0,3)` would silently drop the 4th (the pinning bug this pins against).
  await stubTakeover(page, {
    tracker: {
      ...(trackerView(false) as Record<string, unknown>),
      poolOrbs: [
        { label: "Vitality", value: 24, max: 30 },
        { label: "Resolve", value: 7, max: 10 },
        { label: "Supplies", value: 12, max: 20 },
        { label: "Fatigue", value: 5, max: 8 },
      ],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // All four orb datums (the visually-hidden `label value/max`) render — including the pinned 4th.
  await Promise.all(["Vitality 24/30", "Resolve 7/10", "Supplies 12/20", "Fatigue 5/8"].map((datum) => expect(component.getByText(datum)).toBeVisible()));
});

test("the crown GM console (Game tab, host) renders getConfigView — scalars, orb-pin, cast fields, hints", async ({ mount, page }) => {
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
  // The cast-field schema row (the stubbed "Trust" text field, display-at-rest — the input appears on
  // click, §12.4.1) + the relationship-hint row ("debtor").
  const castFieldRest = component.getByRole("button", { name: "Cast field 1 label" });
  await expect(castFieldRest).toContainText("Trust");
  await castFieldRest.click();
  await expect(component.getByRole("textbox", { name: "Cast field 1 label" })).toHaveValue("Trust");
  await expect(component.getByText("debtor")).toBeVisible();
});

test("the GM console pin toggle fires updateConfig (host) — the mutation COUNT", async ({ mount, page }) => {
  // A tracker with pools so the orb-pinning editor lists pool names to toggle.
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Game" }).click();

  // Pin a pool — the toggle button's accessible name is the pool name ("Vitality"), scoped to the
  // orb-pin section (its `title` carries "Pin … as a band orb", but the accessible NAME is the text).
  await component.locator('[data-slot="rpg-game-tab"]').getByRole("button", { name: "Vitality", exact: true }).click();
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
  // The freshness indicator rides the same band — the getGame stub defaults `reliable` with no live turn,
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

test("a hand-locked field shows the pin + Release affordance (§12.3 the-lock-consequence-is-visible)", async ({ mount, page }) => {
  // The tracker stub locks the ambient `location` path — the Scene ambient renders the pin + its Release
  // popover. (The pin RENDERING is the §12.3 deliverable — "the story won't change this" made visible; the
  // release-fires-editSnapshot wiring is tsc-typed off the same `releaseLocks` wire arm + live-verified.)
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Scene" }).click();

  // The pin (§12.3 — aria-labelled) sits in the ambient strip beside the locked `location` field.
  const pin = component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Pinned by hand — release to the model" });
  await expect(pin).toBeVisible();
  // Clicking it opens the Release popover (the doorway to un-pin).
  await pin.click();
  await expect(page.getByRole("button", { name: "Release to the model" }).first()).toBeVisible();
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

test("a pool max edit writes the SHEET def (patchSheet — the single max home) + drags the volatile value (§12.3)", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("tablist", { name: "Game" }).getByRole("tab", { name: "Status" }).click();

  // The pool max is a SHEET datum (poolDefs — the single source; the Status meter reads the def-resolved max).
  // Editing it here fires `patchSheet` (the def write, so a Sheet-tab read sees the SAME max — no drift), and
  // because the new max (20) is below the value (24) it ALSO fires `editSnapshot` to drag the volatile value.
  const maxRest = component.getByRole("button", { name: "Vitality max" });
  await expect(maxRest).toBeVisible();
  await maxRest.click();
  const maxField = component.getByRole("textbox", { name: "Vitality max" });
  await maxField.fill("20");
  await maxField.blur();
  // The MAX write lands on the sheet def (the authoritative home) — this is what keeps Status ↔ Sheet in sync.
  await expect.poll(() => trpc.count("rpg.patchSheet"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // The value-drag rides editSnapshot in the same gesture (max 20 < value 24 ⇒ a drag).
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // The clamp-and-tell microline (§12.3) — the value dragged to the new max.
  await expect(component.getByText("Vitality 24 → 20 — max lowered")).toBeVisible();
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
