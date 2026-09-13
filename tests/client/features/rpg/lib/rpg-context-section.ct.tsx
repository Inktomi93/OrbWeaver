// CT: the rpg CP-4 LITE takeover (features/rpg — the `rpgContextTabs` contributions rendered through the REAL
// chats SectionContextHost via the contributor seam, over the stubbed network). Drives the production path:
// `chat.getChat` supplies the participants + the rpg POINTER (the takeover APPLICABILITY gate, §4.1); `rpg.getGame`
// carries the mode/read-only trim; `rpg.getTrackerView` feeds every tab. Asserts the four things the W3b brief
// pins: (1) the 4 game tabs render (in the "Game" strip) when `chat.rpg !== null`, with the meta strip below;
// (2) a tab body renders real tracker data; (3) an editable block fires its mutation (the mutation COUNT, per
// [assert-the-mutation-fired] — not the UI reaction); (4) the read-only pill shows + disables edits when
// `trackersReadOnly`. The participants/view stubs return only what the panel reads (a partial shape, the chats-
// section.ct ROSTER_STUB posture); every value crosses the routeTrpc JSON boundary as a plain object.

import type { RpgExtractionMode, RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import { actorRefKey, carriesTracker } from "@orb/contracts/rpg";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { ariaTreeFindings } from "../../../../support/browser/accessible-names.ts";
import { hitBoxes, resolveSpacingPx, touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ctSnapPath } from "../../../../support/node/snap-out.ts";
import { RpgTakeoverDockedStory, RpgTakeoverFloorStory, RpgTakeoverNotifyStory, RpgTakeoverReferenceStory, RpgTakeoverStory } from "../_ct-stories.tsx";

const GAME_ID = "rpg_game_ct_keystone";
const PERSONA_ID = "persona_ct_keystone";

/** Any non-empty title, used with `not.toHaveAttribute`, which also passes when the attribute is absent. */
const ANY_TITLE = /./;
const SAFE_SANDBOX = /^(?!.*allow-scripts)(?!.*allow-same-origin).*$/u;
const NONEMPTY_ID = /.+/u;

/** The Vitality meter's two editable cells — the reading and this carrier's ceiling. `subject`-qualified
 *  names are the `MeterRow` rule (two npc cards must not both offer a button called "Vitality value"), so
 *  the participant row's pair carries the actor's name and the takeover's does not; this matches both. */
const VITALITY_CELLS = /^(Mara )?Vitality (value|max)$/;

// A `chat.getChat` stub carrying the rpg POINTER (fires the takeover) + the host gate + the viewer identity.
// `viewerActivePersonaId` is what the resync control's opt-in restamp stamps TO (null ⇒ nothing to stamp to).
function gameChat(viewerActivePersonaId: string | null = PERSONA_ID): unknown {
  return {
    participants: [{ kind: "human", role: "host", userId: "user_ct", characterId: null }],
    viewerUserId: "user_ct",
    viewerIsHost: true,
    viewerActivePersonaId,
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

/** The two tracker defs the stubbed participant actor carries (meters, party-class, band-PINNED). */
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
} satisfies RpgTrackerDef;
const RESOLVE = { ...VITALITY, key: "resolve", label: "Resolve", max: 10, sort: 1 } satisfies RpgTrackerDef;

// A `rpg.getTrackerView` stub — one participant actor with trackers + a condition, ambient + orbs, cast, a goal, beats.
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
        presence: false,
        identity: null,
        sheet: { className: "Warden", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
        // The trackers this actor CARRIES, resolved server-side (the one carrier predicate) and paired with
        // the readings on its volatile row — the panel renders exactly these, never a re-derivation.
        trackers: [VITALITY, RESOLVE],
        volatile: {
          trackerValues: { vitality: { value: 24, items: null }, resolve: { value: 7, items: null } },
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [],
          wallet: [],
          status: "",
        },
      },
      // A scene NPC is an ACTOR ROW since R2 — her identity half rides beside her tracked state on ONE row, so
      // a departure (a presence drop) can no longer destroy half of her. This stub's cast carries no trackers,
      // so the Scene renders her row without tracked values.
      {
        actorRef: { kind: "npc", npcKey: "sera" },
        name: "Sera",
        presence: true,
        identity: {
          name: "Sera",
          emoji: "🕯️",
          mood: "guarded",
          // RV-11 — the standing guides the extraction round writes every beat. `outfit` is deliberately
          // UNWRITTEN here: the Scene npcs card must show the two that exist and no line at all for the third.
          appearance: "tall, silver-haired, a burn scar down one forearm",
          thoughts: "weighing whether to trust you with the key",
          relationship: { kind: "ally", label: "" },
        },
        sheet: { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
        trackers: [],
        volatile: null,
      },
    ],
    cast: ["npc:sera"],
    trackerDefs: [VITALITY, RESOLVE],
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
  lies: readonly { readonly character: string; readonly type: string; readonly truth: string; readonly reason: string; readonly messageId: MessageId }[] = [],
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
function configView(macros: readonly unknown[] = [], presetNames: readonly string[] = [], gmPresetId: string | null = null): unknown {
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
    // #1032 — the GM-VOICE knob. Default null (the born "your own preset" arm every other pin here drives).
    gmPresetId,
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
    // The §1.3 extraction-depth trio the scalar form now edits (`toHostConsoleForm` reads all three).
    extractionContext: "window",
    extractionWindowTokens: 4096,
    reconcileEveryBeats: 10,
    // The P4/P5 knobs the scalar form projects (`toHostConsoleForm`).
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

/**
 * THE CHAT PANEL'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * The rpg takeover mounts INSIDE the chat context panel, so its sibling meta tabs fire five chat-side reads
 * that no rpg test is about: the macro/variable pick planes, the active databank set, the assembly preview
 * and the shape trace. Unfed they resolved `routeTrpc`'s null, which is not a view — so five pipelines ran
 * INERT under every mount here, including the error-arm mounts at the foot of the file.
 *
 * Every value is the honest EMPTY-but-real default for a room with no picks, no attachments and no history:
 * a zero-token budget over an empty wire, and a shape trace with no rows (hence `no-stable-prefix` and NO
 * `cacheBreakpointFromEnd` — that field is present only on the `placed` decision, assemble.ts:400-402).
 * They are DEFAULTS: a test whose subject is one of these lists the key after the spread and wins.
 */
const EMPTY_ASSEMBLE_TRACE = {
  staticSections: [],
  dynamicSections: [],
  worldInfoIncluded: 0,
  worldInfoDropped: 0,
  worldInfoActivated: [],
  matchedKeys: [],
  compactSummaryIncluded: false,
  memoryIncluded: false,
  guidedInstructionIncluded: false,
  staticCacheBusters: [],
  chatInjectionsIncluded: 0,
  afterHistorySections: [],
};
const CHAT_PANEL_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // The chat context BAND's preset chip (#860): the non-game arms of this file (the Game DOOR on a plain
  // chat) render chat's own band, which resolves the viewer's active preset against the library. Empty is
  // the honest companion to the settings default (`defaultPresetId: null` — "Built-in preset").
  "preset.list": [],
  // The two PICK planes the Macro-picks section composes. Both reads or neither — feeding one leaves that
  // section's boundary in its error arm, which is the trap `rules-section.ct.tsx` already documents.
  "chat.getUserMacroPicks": { macros: [], values: {} },
  "chat.getVariablePicks": { variables: [], values: {} },
  // The databank set active for THIS room — empty is honest for a room with nothing attached.
  "databank.listActiveForChat": [],
  // The #1742 Regex section's four reads (#1788). A CASCADE row like `settings.getUserSettings` below, and
  // the loudest one: the section's HEADING CHIP reads `chat.listEffectiveRegex` through a plain `useQuery`
  // that sits OUTSIDE every disclosure, so it fires on any mount that reaches the "This chat" tab — and an
  // unfed read took the tab's error arm, which cost the CHAT RAIL its `This chat` cell and reds four
  // rail-selection pins that never mention regex. Off-and-empty (the shared support projection), because
  // this file counts cells and measures rail geometry: a populated feed would add script rows to a band
  // these tests take boxes in.
  ...REGEX_READS_EMPTY,
  // This room's attached lorebooks. NOT in the #649 census the ledger carried: this row is UNBUDGETED and
  // the ratchet REDS it, measured on the UNMODIFIED source at HEAD in this lane's before-run, so it is a
  // pre-existing red rather than one this feed introduced. Empty is honest for a room with no books.
  "worldInfo.listForChat": [],
  // The Preview tab's `AssemblyPreview` (domain/chat/contract/views.ts:247) at its zero floor.
  "chat.previewAssembly": {
    prompt: { static: "", dynamic: "", afterHistory: [], sendHistory: true, trace: EMPTY_ASSEMBLE_TRACE },
    trace: EMPTY_ASSEMBLE_TRACE,
    budget: { ceilingTokens: 8192, ceilingEstimated: false, totalTokens: 0, sources: [], sections: [] },
  },
  // The viewer's settings row. A CASCADE row, not a census one: it does not appear in the #649 ledger for
  // this file because it was UNREACHABLE while the reads above answered null — the panel's meta tabs died in
  // their boundary before any settings reader mounted. Feeding them made this one fire, and the ratchet
  // named it on the very next run. Production defaults, so nothing this file asserts moves.
  "settings.getUserSettings": { userId: "user_ct_rpg", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 },
  // The Diagnostics tab's `ShapeTrace` over an empty wire history.
  "chat.getShapeTrace": {
    multiCharacter: false,
    stageCounts: { withTail: 0, injected: 0, squashed: 0, named: 0 },
    squashMerges: 0,
    breakpointDecision: "no-stable-prefix",
    rows: [],
  },
};

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
    /** Fail the resync dialog's opt-in restamp (the ordering probe — a failed stamp must abort the rebuild). */
    readonly restampFails?: boolean;
    /** EDITSNAP-OK — make every hand door answer with this errors-as-data REFUSAL instead of `{ok:true}`. */
    readonly handDoorRefusal?: { readonly ok: false; readonly reason: string };
    /** RESYNC-OR — the resync's verdict (`ResyncResult`). Default: a rebuild that landed. */
    readonly resyncVerdict?: { readonly ok: true; readonly rebuilt: boolean } | { readonly ok: false; readonly reason: string };
    /** POPLOUD — the born-state round's verdict (`PopulateResult`). Default: a fill that landed. */
    readonly populateVerdict?: { readonly ok: true; readonly populated: boolean } | { readonly ok: false; readonly reason: string };
    /** GRANTS-EDITOR — a LIVE getTrackerView that re-resolves per read (so a persisted grant flips carriage on
     *  the post-write refetch), and the patchSheet handler that mutates the store it reads. Both default to the
     *  static arms above, so every existing caller is unchanged. */
    readonly liveTracker?: () => unknown;
    readonly patchSheet?: (input: unknown) => unknown;
    /** #878 F7 — the viewer's TYPE SCALE. At `>= 1.25` (what the `reading` appearance preset sets) the
     *  satellite row leaves the head band for the game tab's own scroll region. Default: the schema's born
     *  1, so every other pin in this file keeps the orbs in the band. */
    readonly fontScale?: number;
    /** #1032 — the preset LIBRARY the GM-voice knob picks from. Default: the ambient empty list (the
     *  band's honest "Built-in preset" arm), so every existing caller is unchanged. */
    readonly presets?: readonly { readonly id: string; readonly name: string }[];
  } = {},
): ReturnType<typeof routeTrpc> {
  const readOnly = opts.readOnly ?? false;
  return routeTrpc(page, {
    ...CHAT_PANEL_AMBIENT_ROUTES,
    // RESYNC-OR — the resync answers with a `ResyncResult` VERDICT, never a bare `undefined`: it is a model
    // call that can fail at the PROVIDER, and the client reads the verdict to tell "rebuilt" from "the round
    // never ran". A stub returning `undefined` would be testing a contract the server no longer has.
    "rpg.resyncFromStory": () => opts.resyncVerdict ?? { ok: true, rebuilt: true },
    "chat.reattributePersona": () => (opts.restampFails === true ? trpcError({ message: "restamp blew up" }) : undefined),
    "chat.getChat": () => opts.chat ?? gameChat(),
    "rpg.getGame": () => opts.game ?? gameView(readOnly),
    "rpg.getTrackerView": () => (opts.liveTracker !== undefined ? opts.liveTracker() : (opts.tracker ?? trackerView(readOnly))),
    // EDITSNAP-OK — the four HAND DOORS answer with a `HandDoorResult` VERDICT, never a bare `undefined`. The
    // stub says so: the client now reads `ok` (a refusal is errors-as-data on a RESOLVED mutation, so it is
    // the only channel a refusal has), and a stub that lies about the wire shape would be testing a contract
    // the server does not have. `handDoorRefusal` below drives the refused arm.
    "rpg.editSnapshot": () => opts.handDoorRefusal ?? { ok: true },
    "rpg.patchActor": () => opts.handDoorRefusal ?? { ok: true },
    "rpg.dismissActor": () => opts.handDoorRefusal ?? { ok: true },
    "rpg.promoteActor": () => opts.handDoorRefusal ?? { ok: true },
    "rpg.patchSheet": opts.patchSheet ?? ((): undefined => undefined),
    // POPLOUD — the born-state round answers with a `PopulateResult` VERDICT, never a bare `undefined`: like
    // the resync it is a model call that can fail at the PROVIDER, and the client reads the verdict to tell
    // "filled" from "the round never ran". A stub returning `undefined` would test a contract the server no
    // longer has.
    "rpg.populateFromCharacter": () => opts.populateVerdict ?? { ok: true, populated: true },
    "rpg.updateConfig": () => undefined,
    "rpg.upsertQuest": () => undefined,
    "rpg.editQuestObjective": () => undefined,
    "rpg.deleteQuest": () => undefined,
    // The Journal tab's own reads + the RV-6 hand-authoring verbs (all host-gated server-side).
    "rpg.listJournal": () => JOURNAL_ENTRIES,
    "rpg.listCheckpoints": () => [],
    "rpg.addJournalEntry": () => "rpg_journal_ct_new",
    "rpg.editJournalEntry": () => undefined,
    "rpg.deleteJournalEntry": () => undefined,
    ...(opts.fontScale === undefined
      ? {}
      : {
          "settings.getUserSettings": {
            userId: "user_ct_rpg",
            schemaVersion: 1,
            config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: opts.fontScale } },
            updatedAt: 0,
          },
        }),
    "rpg.getConfigView": () => opts.config ?? configView(),
    "rpg.revealHidden": () => opts.reveal ?? revealView(),
    // The chat panel's own reads (the meta strip's tabs suspend on these when opened) + the transcript
    // read the Scene choice echo / card archive projects (fetched only when the play-style knobs gate on).
    "chat.listChatInjections": () => [],
    "chat.listMessages": () => opts.messages ?? { messages: [] },
    "chat.send": () => undefined,
    ...(opts.presets === undefined ? {} : { "preset.list": opts.presets }),
  });
}

test("the takeover renders the 5 LIVE game tabs + the locked Map (in the Game strip) when chat.rpg !== null, meta strip below", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The redesign's top strip (panel-redesign §4) as the tracked-field unification §3 left it: 5 live game
  // tabs — Quests + Journal are LIVE lite tabs (the owner correction), and SHEET IS GONE (the sheet is a
  // STATE of Status now: expanding a participant entry IS the sheet).
  const gameStrip = component.getByRole("toolbar", { name: "Game state" });
  await Promise.all(["Status", "Inventory", "Scene", "Quests", "Journal"].map((label) => expect(gameStrip.getByRole("button", { name: label })).toBeVisible()));
  await expect(gameStrip.getByRole("button", { name: "Sheet" })).toHaveCount(0);
  // Map is the ONE PHASE-locked tab: visible, wearing the lock + its reason on `title` (never hidden, and
  // never `aria-disabled` — see the RV-7 CT: it opens onto the body that states when maps arrive).
  const mapTab = gameStrip.getByRole("button", { name: "Map" });
  await expect(mapTab).toBeVisible();
  await expect(mapTab).toHaveAttribute("title", "Maps unlock with the map arc");
  // The chat meta set sits in the "Chat" strip below (the bracket's bottom row) — plus the crown GM-console
  // "Game" tab (host-only, `strip:"meta"` — a member never sees it; this stub's viewer IS host).
  const metaStrip = component.getByRole("toolbar", { name: "Chat" });
  await expect(metaStrip.getByRole("button", { name: "This chat" })).toBeVisible();
  await expect(metaStrip.getByRole("button", { name: "Game" })).toBeVisible();
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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  // All four orb datums (the visually-hidden `label value/max`) render — including the pinned 4th.
  await Promise.all(["Vitality 24/30", "Resolve 7/10", "Supplies 12/20", "Fatigue 5/8"].map((datum) => expect(component.getByText(datum)).toBeVisible()));
});

test("the crown HOST console (Game tab, host) renders getConfigView — scalars, the TRACKER defs, hints", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  // The Game tab lives in the meta strip (host-only crown console).
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  // The crown header + the sections the config read feeds.
  await expect(component.getByText("Host console — host only")).toBeVisible();
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

// ── #1032, the viewgap WIRE batch: the GM-VOICE knob ──────────────────────────────────────────────────
// `RpgConfigView.gmPresetId` is the ONE per-room preset binding there is. The view served it, the write door
// took it, the turn assembled it, and the console had no control — a host could not reach it from anywhere.

test("the GM-voice knob renders the preset library and shows the game's current pick", async ({ mount, page }) => {
  await stubTakeover(page, {
    presets: [
      { id: "preset_gm_ct", name: "Grim Narrator" },
      { id: "preset_other_ct", name: "Warm Companion" },
    ],
    config: configView([], [], "preset_gm_ct"),
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  const trigger = component.locator('[data-slot="rpg-gm-voice"]').getByRole("combobox", { name: "GM voice preset" });
  // The pinned preset's NAME, not its id — the trigger mirrors the picked option's label.
  await expect(trigger).toContainText("Grim Narrator");
});

test("picking a preset writes the knob through updateConfig; picking the shown value writes nothing", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, {
    presets: [
      { id: "preset_gm_ct", name: "Grim Narrator" },
      { id: "preset_other_ct", name: "Warm Companion" },
    ],
    config: configView([], [], "preset_gm_ct"),
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  const trigger = component.locator('[data-slot="rpg-gm-voice"]').getByRole("combobox", { name: "GM voice preset" });
  // Re-picking what is already shown is not an edit — a knob that writes on every open would repaint the
  // whole room's reads for nothing.
  await trigger.click();
  await page.getByRole("option", { name: "Grim Narrator", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(0);

  await trigger.click();
  await page.getByRole("option", { name: "Warm Companion", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ gmPresetId: "preset_other_ct" });
});

test("choosing `Your own preset` CLEARS the knob to null (the augment arm), never an empty string", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, {
    presets: [{ id: "preset_gm_ct", name: "Grim Narrator" }],
    config: configView([], [], "preset_gm_ct"),
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.locator('[data-slot="rpg-gm-voice"]').getByRole("combobox", { name: "GM voice preset" }).click();
  await page.getByRole("option", { name: "Your own preset", exact: true }).click();
  await expect.poll(() => trpc.lastInput("rpg.updateConfig")).toMatchObject({ gmPresetId: null });
});

// A game can point at a preset the viewer cannot read (a delete, or a handoff whose heal has not run). The
// picker must not display "Your own preset" there — that would be a lie about what the next turn assembles.
test("a DANGLING pick shows as its own degraded option, never silently as the default arm", async ({ mount, page }) => {
  await stubTakeover(page, {
    presets: [{ id: "preset_other_ct", name: "Warm Companion" }],
    config: configView([], [], "preset_gone_ct"),
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  const trigger = component.locator('[data-slot="rpg-gm-voice"]').getByRole("combobox", { name: "GM voice preset" });
  await expect(trigger).toContainText("preset_gone_ct");
  await expect(trigger).not.toContainText("Your own preset");
});

test("the GM console BAND toggle fires updateConfig (host) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  // Band visibility is a control ON THE DEF ROW (the band section is gone — one home). It speaks BAND
  // vocabulary, never "pin" (owner 08-01: "pin" belongs to the hand-lock), and the write is the same
  // whole-list `updateConfig` every axis makes.
  await component.locator('[data-slot="rpg-game-tab"]').getByRole("button", { name: "Show Trust as a band orb" }).click();
  await expect.poll(() => trpc.count("rpg.updateConfig"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("a tab body renders real tracker data (Status: participant row + pool meters + condition + orbs)", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  // The header scene banner + a pool orb datum (the visually-hidden `label value/max`) — these ride the
  // `.shell-panel-header` BAND above both strips (the W3c header-contributor seam), not the tab body.
  await expect(component.getByText("The Rusted Lantern — Common Room")).toBeVisible();
  // The band's when-line shows the model's weather LABEL, not the canonical bin name it renders the sky from.
  await expect(component.getByText("steady rain on the shutters", { exact: false })).toBeVisible();
  await expect(component.getByText("Vitality 24/30")).toBeVisible();
  // The freshness indicator rides the same band — the getGame stub defaults `cheap` with no live turn,
  // so the last successfully recorded state is surfaced in real panel geometry.
  await expect(component.getByText("Last recorded beat")).toBeVisible();
  // The participant row: name + className + the pool MeterRow value text + the condition chip.
  await expect(component.getByText("Mara")).toBeVisible();
  await expect(component.getByText("Warden")).toBeVisible();
  await expect(component.getByText("poisoned")).toBeVisible();
});

// ── #1383 the Status region is a LIST OF PEOPLE, and it must announce like one ────────────────────────
// Measured on main b767bedfc (`--aria '[aria-label="Chats details"]'`): `region "Status"` was one FLAT
// tree — `button "Open Traveler"`, then bare `text: HP`, `button "HP value"`, `text: /`, `button "HP max"`
// … repeated per character with ZERO group boundary, giving 4x "Add condition", 4x "Status line",
// 3x "HP value", 3x "HP max". On an EDITING surface a reader heard "button, 17" four times and could not
// tell whose sheet was being edited.
//
// TWO HALVES, PINNED SEPARATELY because they fix different readers:
//   • the per-character `role="group"` — what a SCOPE-AWARE walk needs. `ariaTreeFindings`' duplicate
//     probe is scope-aware by construction, so the group alone would silence it; that is why the probe is
//     the FLOOR here and not the whole test.
//   • the subject-qualified names — what a SCOPE-BLIND `getByRole(name)` (an agent, a name-navigating
//     screen-reader rotor) needs. Those are asserted BY NAME below, and the bare pre-fix names are pinned
//     to zero, so restoring either half alone reds this.
//
// The name ORACLE is Playwright's own role engine / `ariaSnapshot` — never a hand-rolled attribute read
// (there is no browser API that computes an accessible name, and the aria-label-vs-labelledby precedence
// is exactly where a hand-rolled key goes wrong).

/** Two characters carrying the SAME trackers and the same editable planes — the collision shape #1383
 *  measured. The stock fixture has ONE character (plus an npc Status filters out), which cannot
 *  express a collision at all. */
function twoCharacterTrackerView(): unknown {
  const base = trackerView(false) as Record<string, unknown>;
  const actors = base["actors"] as Record<string, unknown>[];
  const mara = actors.find((a) => a["name"] === "Mara") as Record<string, unknown>;
  const bryn = { ...mara, actorRef: { kind: "character", characterId: "character_ct_bryn" }, name: "Bryn" };
  return { ...base, actors: [...actors, bryn] };
}

test("#1383 Status: every character block is a NAMED GROUP and no control name collides across the participants", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: twoCharacterTrackerView() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  const tab = component.locator('[data-slot="rpg-status-tab"]');
  // SETTLED barrier: both cards have painted their control sets before any name is read or counted.
  await expect(tab.locator('[data-slot="rpg-status-card"]')).toHaveCount(2);

  // HALF 1 — the boundary a reader navigates by.
  await expect(component.getByRole("group", { name: "Mara", exact: true })).toBeVisible();
  await expect(component.getByRole("group", { name: "Bryn", exact: true })).toBeVisible();

  // HALF 2 — every control says WHOSE, so a scope-blind name lookup resolves exactly one control.
  for (const name of [
    "Mara Vitality value",
    "Bryn Vitality value",
    "Mara Vitality max",
    "Bryn Vitality max",
    "Mara Status line",
    "Bryn Status line",
    "Add condition to Mara",
    "Add condition to Bryn",
    "Remove poisoned from Mara",
    "Remove poisoned from Bryn",
  ]) {
    await expect(tab.getByRole("button", { name, exact: true }), `"${name}" must name exactly one control`).toHaveCount(1);
  }
  // …and the pre-fix names, which named two controls each, now name none.
  for (const bare of ["Vitality value", "Vitality max", "Status line", "Add condition", "Remove poisoned"]) {
    await expect(tab.getByRole("button", { name: bare, exact: true }), `the bare "${bare}" must be gone`).toHaveCount(0);
  }

  // THE FLOOR — the house tree probe over Playwright's own accessible-name computation: no interactive
  // control is nameless, and no two same-role controls share a name under the same scope chain.
  const findings = ariaTreeFindings(await tab.ariaSnapshot());
  expect(findings, "the Status region must carry no nameless or ambiguous control").toEqual([]);
});

/** Two characters carrying the SAME display name. Legal by construction — #1366 keys distinct SPELLINGS
 *  distinctly, so identical spellings remain a thing the participants can hold — and the shape #1531 measured: the
 *  whole #1383 repair is built on `actor.name`, so an identical name collapses BOTH halves at once. */
function sameNameTrackerView(): unknown {
  const base = trackerView(false) as Record<string, unknown>;
  const actors = base["actors"] as Record<string, unknown>[];
  const mara = actors.find((a) => a["name"] === "Mara") as Record<string, unknown>;
  const twin = { ...mara, actorRef: { kind: "character", characterId: "character_ct_mara_twin" } };
  return { ...base, actors: [...actors, twin] };
}

// #1531 — the #1383 repair's own blind spot. Two entries named "Mara" published two groups with ONE
// accessible name and a byte-identical control set under each, which is exactly the state #1383 exists to
// prevent, reached by legal participants instead of by a missing feature. The qualifier is participant POSITION
// because it is the one disambiguator a reader can hear (an actor key read aloud is not) and it tells them
// there is more than one. The UNCONTENDED case is fenced by the #1383 test above, which asserts the bare
// `group "Mara"` for distinct-name participants — qualifying unconditionally reds it.
test("#1531 Status: two SAME-NAMED characters still resolve to distinct group and control names", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: sameNameTrackerView() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  const tab = component.locator('[data-slot="rpg-status-tab"]');
  // SETTLED barrier: both cards have painted their control sets before any name is read or counted.
  await expect(tab.locator('[data-slot="rpg-status-card"]')).toHaveCount(2);

  // HALF 1 — two boundaries, two names. Before the fix both were "Mara".
  await expect(component.getByRole("group", { name: "Mara (1 of 2)", exact: true })).toBeVisible();
  await expect(component.getByRole("group", { name: "Mara (2 of 2)", exact: true })).toBeVisible();
  await expect(component.getByRole("group", { name: "Mara", exact: true }), "the colliding bare name must be gone").toHaveCount(0);

  // HALF 2 — every control, including the card's own door, resolves to exactly one node by name.
  for (const name of [
    "Open Mara (1 of 2)",
    "Open Mara (2 of 2)",
    "Mara (1 of 2) Vitality value",
    "Mara (2 of 2) Vitality value",
    "Mara (1 of 2) Status line",
    "Mara (2 of 2) Status line",
    "Add condition to Mara (1 of 2)",
    "Add condition to Mara (2 of 2)",
  ]) {
    await expect(tab.getByRole("button", { name, exact: true }), `"${name}" must name exactly one control`).toHaveCount(1);
  }
  // …and the names that named TWO controls each now name none.
  for (const collided of ["Open Mara", "Mara Vitality value", "Mara Status line", "Add condition to Mara"]) {
    await expect(tab.getByRole("button", { name: collided, exact: true }), `the colliding "${collided}" must be gone`).toHaveCount(0);
  }

  // THE FLOOR — the house tree probe over Playwright's own accessible-name computation.
  const findings = ariaTreeFindings(await tab.ariaSnapshot());
  expect(findings, "same-named participants must still carry no nameless or ambiguous control").toEqual([]);
});

test("#1383 Status: a meter's fields carry the label, so the loose `HP` / `/` text nodes leave the a11y tree", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: twoCharacterTrackerView() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  const tab = component.locator('[data-slot="rpg-status-tab"]');
  await expect(tab.locator('[data-slot="rpg-status-card"]')).toHaveCount(2);
  const snapshot = await tab.ariaSnapshot();

  // The label is VISIBLE — it just no longer announces a second time as an orphan node beside the fields
  // whose names already carry it verbatim, and the `/` between two named fields is punctuation.
  await expect(tab.getByText("Vitality").first()).toBeVisible();
  expect(snapshot, "the meter's label must not appear as a loose text node").not.toContain("text: Vitality");
  expect(snapshot, "the slash between two named fields is punctuation, not a reading").not.toContain("text: /");
});

test("an editable pool value fires the patchActor mutation (host, writable) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  // The pool value is editable DISPLAY-AT-REST (§12.4.1): static text on a button; the inline field
  // appears on click. Reveal it, change it, commit on blur.
  const vitalityRest = component.getByRole("button", { name: "Vitality value" }).first();
  await expect(vitalityRest).toBeVisible();
  await vitalityRest.click();
  const vitality = component.getByRole("textbox", { name: "Vitality value" });
  await vitality.fill("18");
  await vitality.blur();

  // Assert the MUTATION fired (the count), not the UI reaction (the save-catch could hide a throw). The
  // per-actor plane is op-shaped (R1), so a participant's tracker edit rides `patchActor`, never `editSnapshot`.
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBe(0);
});

test("read-only trackers: the pill shows BUT the host still hand-edits (D108 — trackersReadOnly gates the MODEL write path only)", async ({ mount, page }) => {
  await stubTakeover(page, { readOnly: true });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  // The pin (§12.3 — aria-labelled) sits in the ambient strip beside the locked `location` field, and it
  // NAMES that field: the Scene tab renders five of these pins and a reader navigating by name has to be
  // able to tell which plane each one hands back (side-eye 08-01).
  const pin = component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Release the location to the model" });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

// EDITSNAP-OK — the four hand doors refuse LEGIBLY as DATA (`{ok:false, reason}`) on a RESOLVED mutation:
// no throw, so `errorToast` cannot fire, the sticky error slot stays null, and every call site is
// fire-and-forget because these writes reconcile through `invalidates`. The result was total silence — the
// panel simply repainted its pre-write state. `editSnapshot` also rejects the WHOLE patch on ONE bad plane,
// which is how a five-plane scene write was lost to a single over-length label. The refusal now rides the
// mutation FACTORY (one home, so every call site is covered by construction) and the server's own `reason`
// is the message — it names the plane or the datum, which is the only part that makes it actionable.
test("EDITSNAP-OK: a hand door's errors-as-data REFUSAL surfaces the server's reason (it used to vanish)", async ({ mount, page }) => {
  const reason = "not snapshot-state planes: ambient — writable planes are location, weather, clock";
  const trpc = await stubTakeover(page, { handDoorRefusal: { ok: false, reason } });
  const component = await mount(<RpgTakeoverNotifyStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();
  await component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Release the location to the model" }).click();

  // The write really was attempted (the refusal is a 200, not a transport failure) …
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // … and the host is TOLD, with the server's own reason intact rather than a generic "couldn't save".
  await expect(component.getByTestId("rpg-notified")).toContainText(reason);
});

test("EDITSNAP-OK: an APPLIED hand write stays silent — `ok:true` is not an occasion for a toast", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverNotifyStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();
  await component.locator('[data-slot="ambient-strip"]').getByRole("button", { name: "Release the location to the model" }).click();

  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect(component.getByTestId("rpg-notified")).toHaveText("");
});

// THE TIME CLEAR KEEPS THE DAY. `clock` fuses a calendar counter with a time of day, so the first cut of
// "Clear time" wrote `{clock: null}` and took `day 3` with it — off the band, out of the steering reminder's
// structured line and out of `{{expr::rpg.scene.day}}` — with no host-side door to put it back (the Date
// field writes `calendarDate`; `update_scene.day` is the MODEL's door). The receipt has to be the PAYLOAD:
// the panel repaints identically either way, so a mutation COUNT would have passed on the destructive write.
test("Clear time nulls the TIME and keeps the day counter (the clock's two facts move independently)", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  const strip = component.locator('[data-slot="ambient-strip"]');
  // The stub's clock is `day 3 · 21:00`, so the Time field rests on its derived label.
  const rest = strip.getByRole("button", { name: "Time value" });
  await expect(rest).toContainText("night");
  await rest.click();
  await component.getByRole("button", { name: "Clear time" }).click();

  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder, so this reads a frozen payload, not a race.
  expect(trpc.lastInput("rpg.editSnapshot")).toMatchObject({ patch: { clock: { day: 3, hour: null, minute: null } } });
});

// RV-11 — the Scene npcs card reads the standing guides. The extraction round wrote appearance/outfit/thoughts
// on every beat into a plane NOTHING projected; this proves the panel end of the wire (the reminder is the
// model end) and that an unwritten guide contributes no line at all.
test("RV-11: the Scene npcs card shows the standing guides, omits the unwritten one, and an edit fires editSnapshot", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  const card = component.locator('[data-slot="npc-card"]');
  // The model-written emoji leads the name — the same written-never-rendered class the guides are in.
  await expect(card).toContainText("🕯️");
  await expect(card).toContainText("tall, silver-haired, a burn scar down one forearm");
  await expect(card).toContainText("weighing whether to trust you with the key");
  // The stub leaves `outfit` unwritten — no label, no placeholder, no line.
  await expect(card.locator('[data-slot="npc-guides"]')).not.toContainText("outfit");

  // The host may correct what the story wrote: since R2 a guide is an OP on her actor row (an identity write),
  // so the receipt is the patchActor payload — ONE datum, addressed to her, naming no sibling plane.
  await card.getByRole("button", { name: "Sera appearance: tall, silver-haired, a burn scar down one forearm" }).click();
  const field = component.getByRole("textbox", { name: "Sera appearance" });
  await field.fill("shaven-headed, a fresh scar");
  await field.blur();
  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already settled the recorder — the call IS recorded, so reading its payload is a read of SETTLED state, not a race. (Polling the payload would just re-read the same frozen object.)
  expect(trpc.lastInput("rpg.patchActor")).toMatchObject({
    targetRef: { kind: "npc", npcKey: "sera" },
    ops: [{ op: "setIdentityText", field: "appearance", text: "shaven-headed, a fresh scar" }],
  });
});

// The npc's whole volatile half, as `getTrackerView` projects it on her ONE actor row (R2) — a pack, a
// purse, conditions and a status the story wrote onto her `npc:sera` plane.
const SERA_VOLATILE = {
  trackerValues: { trust: { value: 3, items: null } },
  conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: 2 }],
  inventory: [{ id: "item_ct_key", name: "bone key", description: "", quantity: 1, location: "", type: "" }],
  wallet: [{ name: "gold", amount: 40 }],
  status: "guarding the stair",
};
const TRUST_METER = { ...VITALITY, key: "trust", label: "Trust", appliesTo: "npcs", max: 10, sort: 0, pinned: false };

// The plane-loss defect, killed STRUCTURALLY (R1). The Scene npcs edit used to build a whole-`actorState`
// IMAGE from the PARTICIPANT half of the view only, so a `npc:` target was never "found" and an EMPTY volatile got
// minted — authoring `hp: null`, `inventory: []`, `wallet: []`, `status: ""` over the NPC's real row (AUTHORED
// values the server's additive policy cannot save: it preserves rows a write OMITS, never fields it NAMES).
// The op door cannot express that mistake: the wire payload carries the ONE datum the human touched and names
// no sibling plane at all. The receipt is the WIRE payload, not a UI reaction.
test("editing an npc's tracker sends ONE op naming only that datum (her other planes are unmentionable)", async ({ mount, page }) => {
  const base = trackerView(false) as { actors: Record<string, unknown>[] };
  const trpc = await stubTakeover(page, {
    tracker: {
      ...(base as Record<string, unknown>),
      // Her carried tracker + its reading ride her OWN row — there is no second cast-value projection.
      actors: base.actors.map((a) => ((a["name"] as string) === "Sera" ? { ...a, trackers: [TRUST_METER], volatile: SERA_VOLATILE } : a)),
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  // The npc card's meter is editable display-at-rest (§12.4.1) — reveal, retype, commit on blur.
  const card = component.locator('[data-slot="npc-card"]');
  await card.getByRole("button", { name: "Trust value" }).click();
  const trust = component.getByRole("textbox", { name: "Trust value" });
  await trust.fill("5");
  await trust.blur();

  await expect.poll(() => trpc.count("rpg.patchActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // The call addresses HER, by ref — no image, no participant half, nothing to be partial about.
  await expect
    .poll(
      async () =>
        (trpc.lastInput("rpg.patchActor") as { readonly targetRef: Record<string, unknown>; readonly ops: readonly Record<string, unknown>[] }).targetRef,
    )
    .toEqual({ kind: "npc", npcKey: "sera" });
  await expect
    .poll(
      async () => (trpc.lastInput("rpg.patchActor") as { readonly targetRef: Record<string, unknown>; readonly ops: readonly Record<string, unknown>[] }).ops,
    )
    .toEqual([{ op: "setTracker", key: "trust", value: { value: 5 } }]);
  // The planes the empty mint used to clear are not on the wire AT ALL — the server keeps them by construction.
  await Promise.all(
    ["inventory", "wallet", "status", "conditions"].map(async (plane) =>
      expect
        .poll(async () =>
          JSON.stringify(trpc.lastInput("rpg.patchActor") as { readonly targetRef: Record<string, unknown>; readonly ops: readonly Record<string, unknown>[] }),
        )
        .not.toContain(plane),
    ),
  );
});

// ── R2: the KNOWN-CHARACTERS disclosure — the offstage NPC made visible, editable and dismissable ────────
// Departure used to DESTROY an npc's identity while her tracked state survived on a plane NO surface
// projected: the host could not see her, edit her, or remove her, and the model could still be told to wound
// her. Departure is a presence drop now, and this section is where the retained person lives.
test("R2: an OFFSTAGE npc is listed, editable and dismissable — never on the On-stage list", async ({ mount, page }) => {
  const base = trackerView(false) as { actors: Record<string, unknown>[]; cast: readonly string[] };
  const sera = base.actors.find((a) => a["name"] === "Sera") as Record<string, unknown>;
  const trpc = await stubTakeover(page, {
    tracker: {
      ...(base as Record<string, unknown>),
      // Sera stays on stage; Vesna is TRACKED but absent from the presence plane — the offstage row.
      actors: [
        ...base.actors,
        {
          ...sera,
          actorRef: { kind: "npc", npcKey: "vesna" },
          name: "Sister Vesna",
          presence: false,
          identity: { ...(sera["identity"] as Record<string, unknown>), name: "Sister Vesna", mood: "guarded", appearance: "", thoughts: "" },
        },
      ],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  // Collapsed by default — a memory, not the scene — but the COUNT is on screen without opening it.
  const section = component.locator('[data-slot="rpg-known-characters"]');
  await expect(section).toContainText("Known characters — 1");
  await expect(component.getByText("Sister Vesna")).toBeHidden();
  // She is NOT on the On-stage list (the two blocks are a partition of one actor list, by `presence`).
  await expect(component.getByText("On stage — 1")).toBeVisible();

  await section.getByRole("button", { name: "Show known characters" }).click();
  await expect(section.getByText("Sister Vesna")).toBeVisible();

  // DISMISS is two-step by design: it is the one gesture in this panel that destroys durable state, and it
  // sits beside ordinary edits. The confirm names her, because a list of cards makes "are you sure?" ambiguous.
  // …and each control is NAMED BY WHOSE it is (the side-eye 08-01 rule): N cards otherwise offer N buttons
  // all called "Dismiss", with the card's name in the DOM and not in the control's.
  await section.getByRole("button", { name: "Dismiss Sister Vesna" }).click();
  await expect(section).toContainText("Forget Sister Vesna and everything tracked on them?");
  await section.getByRole("button", { name: "Confirm dismissing Sister Vesna" }).click();

  await expect.poll(() => trpc.count("rpg.dismissActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the poll above (see the `patchActor` payload read for the same reasoning).
  expect(trpc.lastInput("rpg.dismissActor")).toMatchObject({ targetRef: { kind: "npc", npcKey: "vesna" } });
});

// ── R4: PROMOTION — the recurring stranger earns a character card ────────────────────────────────────────────
// The other durable per-actor gesture, and Dismiss's opposite: dismissal forgets the person, promotion keeps
// her forever. It lives beside Dismiss in the SAME disclosure because both are library acts on a known
// character, not moves in the NOW window the on-stage cards are.
//
// The confirm is not ceremony — it is where the panel says out loud what does NOT carry. The volatile plane
// (trackers, pack, purse, conditions, status), the scene presence and the hand pins all follow her across the
// re-key; her MOOD and her RELATIONSHIP stance do not, because a participant has no home for them (R2: a
// stance is an npc's datum). A host who learns that after the fact learns it as a bug.
test("R4: an offstage npc can be PROMOTED to the room's characters — two-step, named by whose it is, and honest about the stance", async ({ mount, page }) => {
  const base = trackerView(false) as { actors: Record<string, unknown>[]; cast: readonly string[] };
  const sera = base.actors.find((a) => a["name"] === "Sera") as Record<string, unknown>;
  const trpc = await stubTakeover(page, {
    tracker: {
      ...(base as Record<string, unknown>),
      actors: [
        ...base.actors,
        {
          ...sera,
          actorRef: { kind: "npc", npcKey: "vesna" },
          name: "Sister Vesna",
          presence: false,
          identity: { ...(sera["identity"] as Record<string, unknown>), name: "Sister Vesna", mood: "guarded", appearance: "", thoughts: "" },
        },
      ],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  const section = component.locator('[data-slot="rpg-known-characters"]');
  await section.getByRole("button", { name: "Show known characters" }).click();

  await section.getByRole("button", { name: "Promote Sister Vesna to the room's characters" }).click();
  // The confirm NAMES what survives and what does not — the whole reason this gesture asks twice.
  await expect(section).toContainText("Sister Vesna");
  await expect(section).toContainText("mood");
  await expect(section).toContainText("stance");
  await section.getByRole("button", { name: "Confirm promoting Sister Vesna" }).click();

  await expect.poll(() => trpc.count("rpg.promoteActor"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the poll above (see the `patchActor` payload read for the same reasoning). The panel names the ACTOR and nothing else — the card's name/handle are the SERVER's derivation off the actor's own identity row, never a client-authored image (the R1 lesson applied to the promotion door).
  expect(trpc.lastInput("rpg.promoteActor")).toEqual({ chatId: "chat_ct_keystone", targetRef: { kind: "npc", npcKey: "vesna" } });
});

test("the host New-quest affordance fires upsertQuest (create) — the mutation COUNT", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Quests" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Quests" }).click();

  // The per-card destructive action names its target; the confirm names the consequence (never a bare click).
  await component.getByRole("button", { name: "Delete quest: Keep the bone key" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.deleteQuest"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("quest objective gestures send objective-ID operations, never a stale whole-list image", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Quests" }).click();

  await component.getByRole("checkbox", { name: "Hold the door" }).click();
  await component.getByRole("button", { name: "Add objective to Keep the bone key" }).click();
  const add = component.getByRole("textbox", { name: "Add objective to Keep the bone key" });
  await add.fill("Open the reliquary");
  await add.press("Enter");
  await component.getByRole("button", { name: "Remove objective: Hold the door" }).click();

  await expect.poll(() => trpc.count("rpg.editQuestObjective")).toBe(3);
  await expect
    .poll(() => trpc.inputs("rpg.editQuestObjective"))
    .toEqual([
      { chatId: "chat_ct_keystone", questId: "q1", op: { kind: "setCompleted", objectiveId: "o1", completed: false } },
      { chatId: "chat_ct_keystone", questId: "q1", op: { kind: "add", text: "Open the reliquary" } },
      { chatId: "chat_ct_keystone", questId: "q1", op: { kind: "delete", objectiveId: "o1" } },
    ]);
});

// RV-6 — hand journal authoring. The three verbs are host-gated (`resolveHost`), so the host arm is the
// composer + per-row edit/delete, and a member gets the chronicle read-only (PERMISSION-omit).
test("the host New-entry composer fires addJournalEntry with the chosen type and title (body born empty)", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

  await component.getByRole("button", { name: "Delete entry: Sera's debt" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.count("rpg.deleteJournalEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.deleteJournalEntry"), { intervals: [20, 50, 100] }).toMatchObject({ entryId: "rpg_journal_ct_1" });
});

test("a MEMBER reads the chronicle with NO authoring affordances (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Quests" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

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

// The microline is a DEPARTURE, not a presence (side-eye 2026-08-06 P3). The anti-drift rule clears an
// override equal to the default at WRITE time — so the read treated "a stored max exists" as "it differs",
// and any actor the story wrote a max onto without changing it printed `Vitality ceiling 30 — default: 30`
// under its bar, once per meter per actor. A value equal to the default IS the default, however it got there.
test("a stored ceiling EQUAL to the game default states nothing — the note is for divergence only", async ({ mount, page }) => {
  const tracker = trackerView(false) as Record<string, unknown>;
  const actors = (tracker["actors"] as Record<string, unknown>[]).map((a) => ({
    ...a,
    volatile: {
      ...(a["volatile"] as Record<string, unknown>),
      // max 30 === the def's default 30 (the shape a model write leaves behind).
      trackerValues: { vitality: { value: 24, items: null, max: 30 }, resolve: { value: 7, items: null } },
    },
  }));
  await stubTakeover(page, { tracker: { ...tracker, actors } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  // Barrier on the settled bar before asserting the ABSENCE beside it.
  await expect(component.getByRole("button", { name: "Vitality max" }).first()).toBeVisible();
  await expect(component.getByText("Vitality ceiling 30 — default: 30")).toHaveCount(0);
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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  const archive = component.locator('[data-slot="rpg-card-archive"]');
  await expect(archive).toContainText("Cards — 1");
  await archive.getByRole("button", { name: "Open card: Zandik's letter" }).click();

  // The archive lightbox renders the card through the SAME chrome (title + null-origin sandboxed iframe);
  // the card's HTML never lands in the main DOM.
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  const frame = dialog.locator('iframe[data-slot="sandbox-frame"]');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute("sandbox", SAFE_SANDBOX);
  await expect(page.locator("div", { hasText: "secret page" })).toHaveCount(0);
});

// The card-row TREATMENT (owner: the bare "✦ title" lines read as dead text). One row component serves both
// homes — the row IS the card's title bar: ✦ title · provenance · origin TurnRef · the expand glyph, on a
// real bordered instrument row whose accessible name says what a click does.
test("RV-2: an archived-card row wears the artifact chrome — title, turn ref, expand glyph, named action", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame(), messages: CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();
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

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

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
  await withCardsOn.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();
  await expect(withCardsOn.locator('[data-slot="rpg-card-archive"]')).toContainText("No cards yet");
});

test("RV-2: a game with immersiveHtml OFF has no card section at all (applicability, not a disabled twin)", async ({ mount, page }) => {
  // The default stub's game carries `immersiveHtml: false`.
  await stubTakeover(page, { messages: CARD_MESSAGES });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();
  await expect(component.locator('[data-slot="rpg-card-archive"]')).toHaveCount(0);
});

test("the band's host-only VEILED count (P3) renders off rpg.revealHidden — crown-gold cue, absent at zero", async ({ mount, page }) => {
  await stubTakeover(page, {
    reveal: revealView([
      {
        character: "Sera",
        type: "lie",
        truth: "she pocketed the key",
        reason: "claims she never touched it",
        messageId: castId<MessageId>("message_ct_beat_t41"),
      },
      { character: "Niko", type: "ofilter", truth: "the dart was poisoned", reason: "", messageId: castId<MessageId>("message_ct_beat_t43") },
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
      {
        character: "Sera",
        type: "lie",
        truth: "she pocketed the key",
        reason: "claims she never touched it",
        messageId: castId<MessageId>("message_ct_beat_t41"),
      },
    ]),
  });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

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
      ...CHAT_PANEL_AMBIENT_ROUTES,
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
      ...CHAT_PANEL_AMBIENT_ROUTES,
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
      ...CHAT_PANEL_AMBIENT_ROUTES,
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

/** A participant list whose one actor carries everything Sheet-the-tab used to show — title, level, wallet, attribute
 *  values — plus a packed item (the RV-5 surface). */
function richTracker(): unknown {
  return {
    ...(trackerView(false) as Record<string, unknown>),
    actors: [
      {
        actorRef: { kind: "character", characterId: "character_ct_mara" },
        name: "Mara",
        // A PARTICIPANT actor: `presence` is the presence plane's business, and she carries NO `identity` half —
        // her name is chat's and her standing prose is the sheet's (R2). A stub that mirrors the
        // wire is the discipline; a stale one is a dead shape the next CT copies.
        presence: false,
        identity: null,
        // `flavor` (RV-11) — host-written sheet prose that reached no reader until the takeover grew its gloss line.
        sheet: {
          className: "Warden",
          attributes: { str: 14 },
          flavor: "Sworn to a house that no longer exists.",
          level: 3,
          trackerGrants: [],
          trackerRevokes: [],
        },
        trackers: [VITALITY, RESOLVE],
        volatile: {
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

// The party purse SUMS the party's wallets and deliberately EXCLUDES npcs (an NPC's coin is hers, not
// the party's — a first-class path since R2, when `update_inventory.walletDeltas` on a cast target became
// reachable and her pack became a selectable subject). The carried NOTE's grammar is "N OF the total is on X",
// so pairing it with an EXCLUDED purse states the opposite of what the total counted, and the reader has no
// way to tell which number is lying.
test("R2: the purse's carried note is coherent with the party-total exclusion — omitted for a CAST subject", async ({ mount, page }) => {
  const base = richTracker() as { readonly actors: readonly Record<string, unknown>[] };
  const mara = base.actors[0] as Record<string, unknown>;
  const purse = (amount: number): Record<string, unknown> => ({
    ...(mara["volatile"] as Record<string, unknown>),
    wallet: [{ name: "gold", amount }],
  });
  await stubTakeover(page, {
    tracker: {
      ...(base as Record<string, unknown>),
      actors: [
        { ...mara, volatile: purse(50) },
        {
          ...mara,
          actorRef: { kind: "npc", npcKey: "sera" },
          name: "Sera",
          presence: true,
          identity: { name: "Sera", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
          volatile: purse(30),
        },
      ],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

  // The PARTY subject: the total is the party's own 50, and no carried note (she carries all of it).
  const purseLine = component.locator('[data-slot="rpg-purse-line"]');
  await expect(purseLine).toContainText("50 gold");
  await expect(purseLine).not.toContainText("30");

  // Flip to the CAST subject: the total is UNCHANGED (her 30 was never in it) and the note stays away — the
  // old pairing rendered "50 gold — 30 on Sera", claiming 30 of the 50 was hers when none of it was.
  await component.getByRole("combobox", { name: "Whose pack" }).click();
  await page.getByRole("option", { name: "Sera" }).click();
  await expect(purseLine).toContainText("50 gold");
  await expect(purseLine).not.toContainText("on Sera");
  await expect(purseLine).not.toContainText("30");
});

test("Status: expanding a participant entry TAKES OVER the panel with the character — everything Sheet-the-tab held", async ({ mount, page }) => {
  await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  // The participant list is the list of people; the name IS the door (a named button, not a mystery row).
  await expect(component.locator('[data-slot="rpg-status-tab"]')).toBeVisible();
  await component.getByRole("button", { name: "Open Mara" }).click();

  // The takeover REPLACES the participant list (one place at a time — not an accordion under the row).
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

  // The breadcrumb is the way back — and it lands on the participant list, not on a blank panel.
  await detail.getByRole("button", { name: "Back to the characters" }).click();
  await expect(component.locator('[data-slot="rpg-status-tab"]')).toBeVisible();
  await expect(component.locator('[data-slot="rpg-character-detail"]')).toHaveCount(0);
});

// #1774 / vocabulary-map:146 — the breadcrumb's VISIBLE word and its ACCESSIBLE NAME must name the same
// thing. They disagreed: the accname said "Back to the characters" while the button read "Roster", which
// is (a) WCAG 2.5.3 label-in-name — a voice user saying the visible word addresses nothing — and (b) map
// row 50's reserved word for the SAVED TEMPLATE spent on the room's characters. Asserted through the
// affordance, not the source: the node is FOUND by its accessible name and its TEXT is read off the render.
test("#1774 the takeover breadcrumb's visible label is the word its accessible name uses — Characters, never the reserved Roster", async ({ mount, page }) => {
  await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const back = component.locator('[data-slot="rpg-character-detail"]').getByRole("button", { name: "Back to the characters" });
  await expect(back).toBeVisible();
  await expect(back).toHaveText("Characters");
  await expect(back).not.toContainText("Roster");
});

test("Status takeover: a sheet edit fires patchSheet and a tracker edit fires patchActor — the mutation COUNTs", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
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
    await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
    await component.getByRole("button", { name: "Open Mara" }).click();

    const detail = component.locator('[data-slot="rpg-character-detail"]');
    await expect(detail).toBeVisible();
    const back = detail.getByRole("button", { name: "Back to the characters" });
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

  const mapTab = component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Map" });
  // NOT aria-disabled: the lock is a glyph + a reason, not a refusal the tab does not honour.
  await expect(mapTab).not.toHaveAttribute("aria-disabled", "true");
  await expect(mapTab).toHaveAttribute("title", "Maps unlock with the map arc");
  // THE LOCK IS IN THE NAME (side-eye 2026-08-06 ARIA). `aria-disabled="false"` + a reason that lives only
  // on `title` left the lock imperceptible to AT — the glyph is decorative and `title` is a DESCRIPTION many
  // readers announce late or not at all. The visible caption stays the name's prefix (WCAG 2.5.3).
  await expect(mapTab).toHaveAttribute("aria-label", "Map — locked");
  // The live cells are unchanged — the suffix is the LOCK's, not every tab's.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Scene" })).toHaveAttribute("aria-label", "Scene");

  // MOUSE — a plain click (Playwright would refuse this outright on an aria-disabled control).
  await mapTab.click();
  const map = component.locator('[data-slot="rpg-map-tab"]');
  await expect(map).toBeVisible();
  await expect(map).toContainText("Maps unlock with the map arc");
  // NO TICKET ID anywhere in the locked body (side-eye 2026-08-06 P3): "arrives with MA-3" was the one line
  // here addressed to the roadmap rather than the player. Asserted as an ABSENCE so the chip cannot return.
  await expect(map).not.toContainText("MA-3");

  // KEYBOARD — leave and come back with Enter, so the path is proven independently of the click above.
  await component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Scene" }).click();
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
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

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
  await expect
    .poll(async () => (trpc.lastInput("rpg.patchActor") as { readonly ops: readonly Record<string, unknown>[]; readonly autoLock?: boolean }).ops)
    .toEqual([{ op: "patchItem", id: "item_ct_key", patch: { location: "sewn into the lining" } }]);
  await expect
    .poll(async () => (trpc.lastInput("rpg.patchActor") as { readonly ops: readonly Record<string, unknown>[]; readonly autoLock?: boolean }).autoLock)
    .toBeUndefined();
});

// R4c — the journal `label` was write-only rot: model-writable, stored, returned on the view, rendered NOWHERE
// (the chronicle printed the generic type word for every custom entry).
test("a CUSTOM journal entry renders its own label; an entry without one falls back to the type word", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();

  const chronicle = component.locator('[data-slot="rpg-journal-tab"]');
  await expect(chronicle).toContainText("prophecy");
  await expect(chronicle).not.toContainText("CUSTOM");
  // The label-less entries still read as their type ("Character" for `npc`).
  await expect(chronicle).toContainText("Character");
});

test("RV-5: a MEMBER reads the pack with no authoring affordances (PERMISSION-omit, never a disabled twin)", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: richTracker(), chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

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
  await component.locator('[data-slot="rpg-inventory-tab"]').screenshot({ path: ctSnapPath("pack-grid-after") });
});

/** The bare-name tile: `Map of the sunken road` carries neither prose line, so its tile text is EXACTLY the
 *  name — a stray empty element would show up as extra text here. */
const BARE_TILE_TEXT_RE = /^Map of the sunken road$/u;

// INV-READ (owner ruling 2026-08-03, "render them"): `description` is model-written on every item — the
// extraction guidance asks for it by name — and on the GRID tile it existed only inside the hover `title`.
// A hover string is not a reader: invisible on touch, not a datum to a screen reader, uncopyable. Both arms
// are pinned here because the ABSENT arm is the half that goes wrong (a blank labelled row is the failure
// mode the panel's empty-state law exists to stop).
test("INV-READ: the GRID tile READS the item description as text, and an undescribed item shows no empty slot", async ({ mount, page }) => {
  await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

  const cells = component.locator('[data-slot="rpg-pack-cell"]');
  // POPULATED — the text is IN the tile, not only on its `title` attribute (which `toContainText` cannot see).
  const key = cells.filter({ hasText: "Bone key" });
  await expect(key).toContainText("cold to the touch");
  await expect(key).toContainText("belt pouch");
  // A long model-authored description wraps into the card rather than spilling or truncating the datum away.
  const dagger = cells.filter({ hasText: "Iron dagger" });
  await expect(dagger).toContainText("a long model-authored description that runs on well past any tile width");

  // ABSENT — `Rope, 30 ft` has a location and NO description: the tile renders the location and simply omits
  // the other line. Asserted on the tile's own text nodes so a stray empty element would show up as a gap.
  const rope = cells.filter({ hasText: "Rope, 30 ft" });
  await expect(rope).toContainText("pack");
  // `Map of the sunken road` has NEITHER — its tile is the bare name, no blank prose lines at all.
  const map = cells.filter({ hasText: "Map of the sunken road" });
  await expect(map).toHaveText(BARE_TILE_TEXT_RE);
});

test("clicking a GRID tile edits that item in place — the same click-to-edit grammar, one write path", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

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

// ── #78: THE PACK'S LOCK IS VISIBLE, PER ITEM, AND RELEASABLE ────────────────────────────────────────────
// A hand add pins the fields it claimed ON THE ITEM (`…volatile.inventory.<id>.<field>`), and the panel showed
// NOTHING for it: no chip, no hint, no release. The host could not see that the story had been fenced off the
// item, let alone hand it back. (The section pin it did render read `actorState.<key>.inventory` — a path with
// no `volatile` segment, which the server has never written, so it could not fire either.)
const MARA_PACK_BASE = "actorState.character:character_ct_mara.volatile.inventory.item_ct_key";

test("#78: a hand-pinned ITEM carries its own pin and ONE click releases it — the pack itself stays the story's", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, {
    tracker: { ...(richTracker() as Record<string, unknown>), lockedPaths: [`${MARA_PACK_BASE}.name`, `${MARA_PACK_BASE}.quantity`] },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

  // The SECTION pin is absent: an item pin is not a plane pin, and claiming otherwise would offer a Release
  // that hands back more than the host ever took.
  await expect(component.getByRole("button", { name: "Release the pack to the model" })).toHaveCount(0);
  // The GRID tile — the default lens — SHOWS the state (the tile is itself the editor's trigger, so the
  // release control lives one tap in, beside the item's other gestures).
  await expect(component.locator('[data-slot="rpg-pack-cell"]').filter({ hasText: "Bone key" })).toContainText("Pinned");

  // The pixels, banked beside the pack-grid shot the density CT takes: a rendered claim owes a rendered
  // receipt, and the whole defect was that a fenced-off pack looked exactly like a free one.
  await component.locator('[data-slot="rpg-inventory-tab"]').screenshot({ path: ctSnapPath("pack-item-pin") });

  // …and the tile's own editor — the popover the tile already opens for every other per-item gesture —
  // carries the Release, so the grid lens is not a dead end for a host who never switches lenses.
  await component.getByRole("button", { name: "Edit Bone key" }).click();
  const tileEditor = page.locator('[data-slot="rpg-pack-tile-editor"]');
  await expect(tileEditor.getByRole("button", { name: "Release Bone key to the model" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The LIST lens is the edit lens, and there the pin is the one-tap Release, named by whose it is.
  await component.getByRole("button", { name: "Show as a list" }).click();
  const pin = component.locator('[data-slot="rpg-pack-row"]').getByRole("button", { name: "Release Bone key to the model" });
  await expect(pin).toBeVisible();
  await component.locator('[data-slot="rpg-inventory-tab"]').screenshot({ path: ctSnapPath("pack-item-pin-list") });
  await pin.click();

  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the poll. Releasing the ITEM hands back EVERY pin it carries — a per-field residue would leave a pin the panel no longer renders and the host can never reach.
  expect(trpc.lastInput("rpg.editSnapshot")).toMatchObject({ patch: {}, releaseLocks: [`${MARA_PACK_BASE}.name`, `${MARA_PACK_BASE}.quantity`] });
});

test("#78: a LEGACY plane-wide pack lock still renders its section Release (no snapshot is rewritten to fix it)", async ({ mount, page }) => {
  // Snapshots written before the granularity change carry `…volatile.inventory` — the whole plane. Stored
  // locks are never migrated (the dev corpus is the owner's), so the READ side keeps honoring the old path and
  // the section keeps the affordance that lets a host let it go.
  const trpc = await stubTakeover(page, {
    tracker: { ...(richTracker() as Record<string, unknown>), lockedPaths: ["actorState.character:character_ct_mara.volatile.inventory"] },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

  const pin = component.getByRole("button", { name: "Release the pack to the model" });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect.poll(() => trpc.count("rpg.editSnapshot"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above settled the recorder — the call IS recorded, so this reads a frozen payload.
  expect(trpc.lastInput("rpg.editSnapshot")).toMatchObject({ releaseLocks: ["actorState.character:character_ct_mara.volatile.inventory"] });
});

// The P4 card knobs were STORED, wired into the reminder + the §4.8 lenient wrap, and had NO editor —
// the D107 dead-switch class (owner dogfood 2026-07-31: "we are missing the toggle to enable/disable the
// interactive html part of the prompt"). The stub game carries both OFF.
test("the Game tab toggles immersive HTML, and the interactivity sub-toggle is DISABLED (not hidden) while it is off", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

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
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

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
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const populate = component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" });
  await expect(populate).toBeEnabled();
  await populate.click();
  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

/** The disabled reason the born-state button carries on a writer-less connection. */
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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  // Still PRESENT (the affordance is real and the reason is stated) — and refusing, so no call is ever made.
  const populate = component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" });
  await expect(populate).toBeDisabled();
  await expect(populate).toHaveAttribute("title", NO_WRITER_REASON);
  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50] }).toBe(0);
});

// POPLOUD — THE BORN-STATE DOOR IS LOUD. `populateFromCharacter` returned `void`, so a card round that never
// RAN (the provider refused the structured request — live on the default hosted backend) was byte-identical to
// a card that established nothing: the button settled, the panel didn't move, the host was told success. The
// same silent fork RESYNC-OR closed on the sibling verb. These pin the two endings with no other observable;
// the third (a real fill) announces itself by repainting the panel.

/** Open the Status takeover's born-state control on the NOTIFY story (the `rpg-notified` sink) and fire it. */
async function firePopulate(component: Locator): Promise<void> {
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();
  await component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" }).click();
}

test("POPLOUD: a provider refusal is TOLD to the host, with the server's own reason (it used to vanish)", async ({ mount, page }) => {
  const reason = "the model call failed, so nothing was filled: openrouter structured item 0 failed";
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker(), populateVerdict: { ok: false, reason } });
  const component = await mount(<RpgTakeoverNotifyStory />);

  await firePopulate(component);

  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.getByTestId("rpg-notified")).toContainText(reason);
});

test("POPLOUD: a round that filled NOTHING says so — not silence, and not an error either", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker(), populateVerdict: { ok: true, populated: false } });
  const component = await mount(<RpgTakeoverNotifyStory />);

  await firePopulate(component);

  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.getByTestId("rpg-notified")).toContainText("Nothing to fill");
});

test("POPLOUD: a fill that LANDED stays quiet — the repainted panel is the feedback", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { game: d20Game(), tracker: richTracker(), populateVerdict: { ok: true, populated: true } });
  const component = await mount(<RpgTakeoverNotifyStory />);

  await firePopulate(component);

  await expect.poll(() => trpc.count("rpg.populateFromCharacter"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.locator('[data-slot="rpg-populate-control"]').getByRole("button", { name: "Fill from card" })).toBeEnabled(); // settled
  await expect(component.getByTestId("rpg-notified")).toHaveText("");
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
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

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
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  // The colliding def states the CONSEQUENCE (the game def is the one that resolves) — the shadow rule is
  // real and invisible everywhere else; the non-colliding sibling stays unglossed (no blanket noise).
  const section = component.locator('[data-slot="rpg-game-macros"]');
  await expect(section).toContainText("Overrides preset");
  await expect(section.getByText("Overrides preset", { exact: false })).toHaveCount(1);
});

test("WAVE MU: the macro editor COMPLETES against both planes — the game's defs and the preset's names", async ({ mount, page }) => {
  await stubTakeover(page, { config: configView([gameMacro("waystone", "how the stone reads")], ["narrator"]) });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  // Open the existing def's editor (the row title is the edit affordance; the dialog portals to body).
  await component.locator('[data-slot="rpg-game-macros"]').getByText("{{waystone}}").click();
  const body = page.getByRole("textbox", { name: "Template" });
  await body.click();

  // The GAME plane completes with its own definition's description.
  await body.pressSequentially("{{wayst");
  await expect(page.getByRole("option", { name: "{{waystone}}" })).toBeVisible();
  await expect(page.getByRole("listbox")).toContainText("how the stone reads");

  // The PRESET plane completes too — by NAME, glossed with the one thing this view knows about it (the
  // config view carries `presetMacroNames`, never the preset's bodies).
  await body.fill("");
  await body.pressSequentially("{{narr");
  await expect(page.getByRole("option", { name: "{{narrator}}" })).toBeVisible();
  await expect(page.getByRole("listbox")).toContainText("From your active preset.");
});

test("WAVE MU: a shadowed preset name is offered ONCE, as the GAME's definition (the resolver's precedence)", async ({ mount, page }) => {
  await stubTakeover(page, { config: configView([gameMacro("tone", "the game's own tone")], ["tone"]) });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();
  await component.locator('[data-slot="rpg-game-macros"]').getByText("{{tone}}").click();

  const body = page.getByRole("textbox", { name: "Template" });
  await body.click();
  await body.pressSequentially("{{tone");
  // ONE row, carrying the GAME's description — advertising the preset's would promise a definition the
  // turn will not use (`shadowPresetUserMacros` drops it server-side).
  await expect(page.getByRole("option", { name: "{{tone}}" })).toHaveCount(1);
  await expect(page.getByRole("listbox")).toContainText("the game's own tone");
  await expect(page.getByRole("listbox")).not.toContainText("From your active preset.");
});

test("WAVE MU: with no macros the section says what empty MEANS (never a blank that reads as unbuilt)", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await expect(component.locator('[data-slot="rpg-game-macros"]')).toContainText("No game macros yet");
});

test("WAVE MU: a MEMBER never reaches the macro editor — the whole crown console is host-gated (PERMISSION-omit)", async ({ mount, page }) => {
  await stubTakeover(page, { chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false } });
  const component = await mount(<RpgTakeoverStory />);

  // The console tab itself is omitted for a member (never a disabled twin), so the section cannot be reached.
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" })).toHaveCount(0);
  await expect(component.locator('[data-slot="rpg-game-macros"]')).toHaveCount(0);
});

// ── HUD-1: the pane IS the HUD ───────────────────────────────────────────────────────────────────────
// The claim is over the WHOLE pane, so the assertions below are about OWNERSHIP and GEOMETRY, not content:
// the shell's band is empty (the claimant paints its own top edge), the shell's `.ctx-tab-strip` never
// renders, and the HUD spends its own vertical budget (§7.1 — the dead-zone rule).

test("HUD-1: the rpg HUD CLAIMS the pane — the shell's band is empty and its generic strip never renders", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await expect(component.getByRole("toolbar", { name: "Game state" })).toBeVisible();

  // The claimant renders inside the single-writer region host…
  await expect(component.locator("[data-context-bracket]")).toHaveCount(1);
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
  const inventory = component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Inventory" });

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
  const rail = component.getByRole("toolbar", { name: "Game state" });
  await expect(rail.getByRole("button", { name: "Inventory" })).not.toHaveAttribute("title", ANY_TITLE);
  await expect(rail.getByRole("button", { name: "Map" })).toHaveAttribute("title", "Maps unlock with the map arc");
});

test("HUD-1: the ACTIVE cell's caption takes the cell's accent state colour (the Text primitive must not win)", async ({ mount, page }) => {
  // Every `voice` re-spells its own colour (`gloss` painted `text-muted-foreground`; `label`, which the
  // caption rides since the #102 readable-floor fix, paints `text-foreground`) — so without `text-inherit`
  // the caption keeps the voice's ink while the glyph and the cell tint go accent, which reads as "nothing
  // is selected". Asserted as the COMPUTED colour against the cell's own `data-active:text-primary`.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const rail = component.getByRole("toolbar", { name: "Game state" });
  await rail.getByRole("button", { name: "Scene" }).click();
  await expect(rail.getByRole("button", { name: "Scene" })).toHaveAttribute("aria-current", "true");

  const activeCaption = rail.getByRole("button", { name: "Scene" }).getByText("Scene");
  const restingCaption = rail.getByRole("button", { name: "Quests" }).getByText("Quests");
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

test("HUD-1 §3.6 fence 6: the ACTIVE region is NAMED by its cell — two rails off one root break Base UI's own association", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const scene = component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Scene" });
  await scene.click();
  await expect(scene).toHaveAttribute("aria-current", "true");

  const panel = component.locator('[data-slot="tabs-panel"]:visible');
  await expect(scene).toHaveAttribute("id", NONEMPTY_ID);
  const cellId = await scene.getAttribute("id");
  await expect(panel).toHaveAttribute("aria-labelledby", cellId ?? "missing-cell-id");
  const labelledBy = await panel.getAttribute("aria-labelledby");
  // …and the id actually resolves to the cell, so the name is a real one, not a dangling reference.
  // (#112: the cell is a BUTTON now, not a tab — the rails announce as toolbars, see the HUD's ARIA note.)
  await expect(component.locator(`[id="${labelledBy ?? ""}"]`)).toHaveAttribute("data-slot", "tabs-tab");
});

// ── #112: NO RAIL EVER ANNOUNCES AS A CHOOSER WITH NOTHING CHOSEN ─────────────────────────────────────
// The HUD deals two rails off ONE Tabs root with ONE shared selection (§7.1 puts the viewport between them,
// so one DOM tablist is ruled out). While both rails were `tablist`s, whichever one did not hold the
// selection announced as a tab group with ZERO selected tabs — measured in BOTH directions. The rails are
// named TOOLBARS now and the cells are plain buttons carrying `aria-current`; the quiet rail simply has no
// current cell, which is the truth.
//
// The first assertion is deliberately phrased against the OLD world (it counts tab groups with nothing
// selected) so it is a real defect proof: it reds on the pre-fix source and can only go green by the rails
// ceasing to make a claim they cannot keep.

/** Every element that ANNOUNCES as a tab group but holds no selected tab — the #112 defect, counted. */
function zeroSelectedTabGroups(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () => Array.from(document.querySelectorAll('[role="tablist"]')).filter((list) => list.querySelector('[role="tab"][aria-selected="true"]') === null).length,
  );
}

/** The accessible name of every cell in the HUD that claims to be the current one. */
function currentCellNames(page: import("@playwright/test").Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="context-rail"] [aria-current="true"]')).map(
      (el) => el.getAttribute("aria-label") ?? el.textContent ?? "",
    ),
  );
}

for (const direction of [
  { rail: "Game state", cell: "Status", other: "Chat" },
  { rail: "Chat", cell: "This chat", other: "Game state" },
] as const) {
  test(`#112 selection in the ${direction.rail} rail: no tab group is left empty, and only that rail has a current cell`, async ({ mount, page }) => {
    await stubTakeover(page);
    const component = await mount(<RpgTakeoverReferenceStory />);
    const owning = component.getByRole("toolbar", { name: direction.rail });
    const quiet = component.getByRole("toolbar", { name: direction.other });
    await expect(owning).toBeVisible();
    await expect(quiet).toBeVisible();

    await owning.getByRole("button", { name: direction.cell }).click();
    await expect(owning.getByRole("button", { name: direction.cell })).toHaveAttribute("aria-current", "true");

    // THE DEFECT PIN — nothing in the document announces as a chooser with nothing chosen.
    expect(await zeroSelectedTabGroups(page)).toBe(0);
    // …and the fact is carried exactly once, by the rail that actually holds the view.
    expect(await currentCellNames(page)).toEqual([direction.cell]);
    await expect(quiet.locator('[aria-current="true"]')).toHaveCount(0);
    // The quiet rail is still a NAMED group of real controls — it did not lose its voice to gain honesty.
    await expect(quiet.getByRole("button").first()).toBeVisible();
  });
}

test("#112: the rail keeps ONE tab stop with arrow keys inside it — the toolbar's contract, not a lost one", async ({ mount, page }) => {
  // Arm B's stated cost was Base UI's roving focus. It is not paid: the composite that provides it is the
  // LIST, not the `tab` role, so dropping the role leaves the keyboard model untouched. Receipted as a real
  // traversal — reach the rail by Tab, walk it by Arrow, and prove one more Tab LEAVES it (six cells, one
  // stop) rather than stepping to the next cell.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverReferenceStory />);
  const rail = component.getByRole("toolbar", { name: "Game state" });
  await expect(rail.getByRole("button")).toHaveCount(6);

  expect(await tabInto(page, '[data-slot="context-rail"] [role="toolbar"]')).toBe(true);
  const focused = (): Promise<string> => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  const first = await focused();
  expect(first).not.toBe("");

  await page.keyboard.press("ArrowRight");
  await expect.poll(focused).not.toBe(first);
  // Still inside the SAME rail — the arrow walked the group, it did not escape it.
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="toolbar"]')?.getAttribute("aria-label") ?? "")).toBe("Game state");

  // One Tab leaves the whole rail: six cells share a single stop (the #107 tab-budget law still holds).
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-slot="context-rail"]') !== null)).toBe(false);
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
  const region = component.locator("[data-context-bracket]");
  await expect(region).toBeVisible();
  // The RAIL BLOCK (kicker + cells + the floor under them — #861), not the bare toolbar: the block is what
  // sits on the pane's edge; the cells end one `row` step above it by design.
  const rail = railBlock(component, page, "Chat");

  // Measure only once the swap has SETTLED: Base UI keeps the outgoing panel mounted through its exit
  // transition, so a mid-swap read sees two viewports (the DEF-14 flake class). The panel is addressed by
  // its accessible name — which it has because the cell labels it (the fence-6 CT above).
  const footOf = async (tabName: string): Promise<{ readonly railBottom: number; readonly regionBottom: number; readonly viewportBottom: number }> => {
    await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);
    const [railBox, regionBox, viewportBox] = await Promise.all([
      rail.boundingBox(),
      region.boundingBox(),
      component.getByRole("region", { name: tabName }).boundingBox(),
    ]);
    if (railBox === null || regionBox === null || viewportBox === null) {
      throw new Error("expected the admin rail, the region and the viewport to be laid out");
    }
    return { railBottom: railBox.y + railBox.height, regionBottom: regionBox.y + regionBox.height, viewportBottom: viewportBox.y + viewportBox.height };
  };

  // SHORT body (Journal on the stub's three entries) — the rail sits ON the pane's bottom edge, and the
  // span between the body and it is the HUD's ground, not a void the rail floats above.
  await component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Journal" }).click();
  // Settle the swap BEFORE measuring — geometry read mid-transition is the DEF-14 flake class.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Journal" })).toHaveAttribute("aria-current", "true");
  const short = await footOf("Journal");
  expect(short.railBottom).toBeCloseTo(short.regionBottom, 0);
  expect(short.viewportBottom).toBeLessThanOrEqual(short.railBottom);
  // The span between them is the GROUND, and it is PAINTED — a treatment that failed to compile would
  // leave exactly the bare void this fix exists to kill, with every geometry assertion still green.
  const ground = component.locator('[data-slot="context-bracket-ground"]');
  await expect(ground).toBeVisible();
  await expect.poll(() => ground.evaluate((el) => getComputedStyle(el).backgroundImage), { intervals: [20, 50, 100] }).toContain("linear-gradient");

  // TALL body (Status: participants + orbs + the veiled ledger) — the viewport shrinks and scrolls, and the rail
  // has NOT moved: the two states differ by no layout jump at all.
  await component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Status" }).click();
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Status" })).toHaveAttribute("aria-current", "true");
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
  // The edge is the BRACKET ROOT's since #860 (the shell's column paints the binding for every room, from
  // the primary token); the Waystone band sits inside its band slot beneath it.
  const band = component.locator("[data-context-bracket]");
  await expect(component.locator('[data-slot="rpg-hud-band"]')).toBeVisible();
  const [paneBox, bandBox, width] = await Promise.all([
    pane.boundingBox(),
    band.boundingBox(),
    band.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth)),
  ]);
  if (paneBox === null || bandBox === null) {
    throw new Error("expected the pane and the bracket to be laid out");
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

test("HUD-1 §4 (#102 variant A): BOTH rails are TAB GROUPS — each wears its own name on screen, as the rail's edge", async ({ mount, page }) => {
  // F6 defect 3: the meta strip read as an action bar because nothing said it was a second set of TABS of
  // the same panel. The fix is the rail's own NAME, visible — and its hairline rule IS the rail's top edge,
  // so naming the group costs one line and not a second divider.
  //
  // AND THE GAME RAIL WEARS IT TOO (owner pick on #102, 2026-08-17). HUD-1 gave the kicker to the admin
  // rail alone on the grounds that the band's echo already named the game rail; the mockup measured that
  // echo binding 1:2.5 toward the MEDALLIONS and up to 524px from the rail it named, so the name moved
  // down onto its group and the echo was deleted. Two kickers, one anatomy, asserted on both.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const kickers = component.locator('[data-slot="context-rail-kicker"]');
  await expect(kickers).toHaveCount(2);
  const kicker = kickers.nth(1);
  await expect(kicker).toBeVisible();
  await expect(kicker).toContainText("Chat");
  await expect(kickers.nth(0)).toContainText("Game state");

  const caption = kicker.locator('[data-slot="text"]');
  const [transform, size, micro] = await Promise.all([
    caption.evaluate((el) => getComputedStyle(el).textTransform),
    caption.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-micro")) * 16),
  ]);
  // The kicker VOICE, resolved: micro-caps off the type scale — not a size picked at this call site.
  expect(transform).toBe("uppercase");
  expect(size).toBeCloseTo(micro, 0);

  // The kicker's rule replaces the rail's own track: one line at the rail's edge, never two. Both rails
  // are kicker'd now, so NEITHER draws the `TabsList` border it would otherwise carry.
  const adminList = component.getByRole("toolbar", { name: "Chat" });
  const gameList = component.getByRole("toolbar", { name: "Game state" });
  await expect.poll(() => adminList.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  await expect.poll(() => gameList.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe("0px");
  // …and the rule each kicker draws instead is really painted: since #860 it is the kicker row's own
  // bottom hairline (the mock's `.kick`), spanning the rail's full width (a rule that failed to lay out
  // would leave an unbounded word floating over the rail with every other assertion green).
  const rules = await kickers.evaluateAll((els) =>
    els.map((el) => ({
      border: getComputedStyle(el).borderBottomWidth,
      width: el.getBoundingClientRect().width,
      railWidth: el.parentElement?.getBoundingClientRect().width ?? 0,
    })),
  );
  expect(rules).toHaveLength(2);
  expect(rules.every((rule) => rule.border === "1px" && rule.width > 0 && Math.abs(rule.width - rule.railWidth) <= 1)).toBe(true);
});

test("HUD-1 §4: HOST-ONLY cells wear the crown gold at rest — and only at rest", async ({ mount, page }) => {
  // "Host-only reads without a label" (panel-redesign §6 P3). The flag is DECLARED by each tab's owner
  // (`ContextTabDef.crown`), so this also proves the resolve carried a chat-owned flag and an rpg-owned one
  // through the same seam to one renderer.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const rail = component.getByRole("toolbar", { name: "Chat" });
  const highlight = await resolvedToken(page, "--color-highlight");

  const glyphColor = async (tabName: string): Promise<string> =>
    rail
      .getByRole("button", { name: tabName })
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
  await rail.getByRole("button", { name: "This chat" }).click();
  await expect(rail.getByRole("button", { name: "This chat" })).toHaveAttribute("aria-current", "true");
  await expect.poll(() => glyphColor("Preview"), { intervals: [20, 50, 100, 200] }).toBe(highlight);
  expect(await glyphColor("Game")).toBe(highlight);
  // A non-host cell in the SAME (owning) rail is untouched — the gold marks a class of cell, not the rail.
  expect(await glyphColor("This chat")).not.toBe(highlight);

  // ACTIVE beats crowned: once the cell is the answer to "where am I", the accent state colour owns it —
  // a gold glyph inside an accent cell argues with the one treatment that means "selected".
  await rail.getByRole("button", { name: "Preview" }).click();
  await expect(rail.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-current", "true");
  expect(await glyphColor("Preview")).not.toBe(highlight);
});

test("HUD-1 §4: the NON-OWNING rail recedes and the owning one lifts — the selection is legible across the split", async ({ mount, page }) => {
  // F6 defect 1, structurally: ONE component knows both rails' state, so the rail holding the selection can
  // carry a resting surface fill and foreground captions while the other has neither. Measured as resolved
  // colour on both rails, in both directions — a one-directional check would pass on a stuck rail.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const gameList = component.getByRole("toolbar", { name: "Game state" });
  const adminList = component.getByRole("toolbar", { name: "Chat" });
  // The fill rides the RAIL BLOCK (kicker + cells), not the bare toolbar, since #860.
  //
  // THE RECEDED RAIL IS BARE GROUND AGAIN — and this pin's PREMISE, not its ruling, is what changed
  // (#875 F2, owner-ruled 2026-08-30). #861's fix gave it "a quieter step of the same fill" and this test
  // pinned that as `both painted`. Side-eye then decoded the framebuffer: the quieter step composited to
  // **1.001:1** against the pane — it was never on screen, and the pin was green over an invisible fill.
  // The owner-approved artboard draws NO `.rail.recede` fill at all, so the fill is the mock's again
  // (`--raised` = `surface-raised` on the owning rail only) and the ownership axis is carried by the
  // things that MEASURE: the owning fill, the kicker voices, the `pb-row` floor, the top hairline.
  // So: the owning rail is painted, the receded one is the pane, and they DIFFER. The composited
  // ordering — including the kicker inversion #861 actually filed — is pinned in pixels by the
  // framebuffer arms of `tests/client/features/app-shell/components/context-bracket.ct.tsx`.
  const fill = (list: ReturnType<typeof component.getByRole>): Promise<string> =>
    list.evaluate((el) => getComputedStyle(el.closest('[data-slot="context-rail"]') ?? el).backgroundColor);
  const captionColor = (list: ReturnType<typeof component.getByRole>, tabName: string, word: string): Promise<string> =>
    list
      .getByRole("button", { name: tabName })
      .getByText(word)
      .evaluate((el) => getComputedStyle(el).color);

  // The landing is `rpg.status` (the game rail's `defaultTab`), so the GAME rail owns.
  const transparent = "rgba(0, 0, 0, 0)";
  const gameFill = await fill(gameList);
  const adminFill = await fill(adminList);
  expect(gameFill).not.toBe(transparent);
  expect(adminFill).toBe(transparent);
  expect(adminFill).not.toBe(gameFill);
  const owningCaption = await captionColor(gameList, "Quests", "Quests");
  const recededCaption = await captionColor(adminList, "This chat", "This chat");
  expect(owningCaption).not.toBe(recededCaption);

  // Cross the split — and BOTH rails answer. (The caption compared on each side belongs to a tab that is
  // NOT the selected one, so this is the rail's voice changing, never the active cell's own treatment.)
  // POLLED, not read once: the cells carry a colour TRANSITION, so a synchronous read lands mid-interpolation
  // on a value that is neither state (the first run of this test caught itself at oklab L=0.919, between
  // muted-foreground's 0.74 and foreground's 0.955) — the settled colour is the assertion.
  await adminList.getByRole("button", { name: "This chat" }).click();
  await expect(adminList.getByRole("button", { name: "This chat" })).toHaveAttribute("aria-current", "true");
  // …the fills SWAP: the admin rail wears the owning step now and the game rail the receded one.
  await expect.poll(() => fill(adminList), { intervals: [20, 50, 100, 200] }).toBe(gameFill);
  await expect.poll(() => fill(gameList), { intervals: [20, 50, 100, 200] }).toBe(adminFill);
  await expect.poll(() => captionColor(adminList, "Preview", "Preview"), { intervals: [20, 50, 100, 200] }).toBe(owningCaption);
  await expect.poll(() => captionColor(gameList, "Quests", "Quests"), { intervals: [20, 50, 100, 200] }).toBe(recededCaption);
});

/** The rail Stack that owns a named toolbar — the kicker and the cells are siblings inside it, so the
 *  block, not the list, is what a proximity measurement has to be taken against. */
function railBlock(component: Locator, page: Page, railName: string): Locator {
  return component.locator('[data-slot="context-rail"]').filter({ has: page.getByRole("toolbar", { name: railName }) });
}

test("#102 variant A: the OWNING rail names the selection in its OWN kicker — the floating band echo is gone", async ({ mount, page }) => {
  // THE RE-RULE (owner pick on #102, 2026-08-17). HUD-1 §7.3 put this sentence in the band's last line; the
  // tracker mockup measured it 8px under the medallion row and 20px above the rail it named — 1:2.5 the
  // WRONG way — and with a CHAT tab selected it read "CHAT · MEMBERS" 524px above the rail it meant. The
  // MECHANISM survives (the owning rail names the winner in one kicker line); it prints ON that rail now.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  // The band's floating line is DELETED, not duplicated — half a migration is the rot.
  await expect(component.locator('[data-slot="rpg-hud-echo"]')).toHaveCount(0);

  const gameKicker = railBlock(component, page, "Game state").locator('[data-slot="context-rail-kicker"]');
  const chatKicker = railBlock(component, page, "Chat").locator('[data-slot="context-rail-kicker"]');

  // The landing is `rpg.status` — the GAME rail owns, so the GAME kicker carries the selection and the
  // quiet rail carries only its own name.
  await expect(gameKicker).toHaveText("Game state · Status");
  await expect(chatKicker).toHaveText("Chat");
  // It reads as the mock's kicker (caps), same voice the admin rail has worn since HUD-1…
  await expect.poll(() => gameKicker.locator('[data-slot="text"]').evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
  // …and it is a VISUAL aid, not a second announcement: the rails already tell AT what is selected.
  await expect(gameKicker).toHaveAttribute("aria-hidden", "true");

  // Cross the split and the sentence MOVES — it is never printed by a rail that does not own the view.
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "This chat" }).click();
  await expect(chatKicker).toHaveText("Chat · This chat");
  await expect(gameKicker).toHaveText("Game state");
});

test("#102 variant A: the game kicker binds DOWNWARD — 4px above its own cells, further from the medallions", async ({ mount, page }) => {
  // THE MEASURED DEFECT, inverted. Live at a 383px panel the echo sat 8.0px under the satellite row and
  // 20.0px above the game rail (1:2.5 pointing UP at the orbs, which wear the same 10.5px caps voice).
  // Variant A's anatomy: `gap-tight` (4px) between the kicker and its cells, and the rail block buys
  // `spacing-tight` of its own above the kicker so the label lands ~12px below the medallions — 3:1 the
  // right way. 383×800 is the LIVE panel geometry the mockup was measured at.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory width={383} height={800} />);
  const satellites = component.locator('[data-slot="rpg-band-satellites"]');
  await expect(satellites).toBeVisible();

  const gameRail = railBlock(component, page, "Game state");
  const gameKicker = gameRail.locator('[data-slot="context-rail-kicker"]');
  await expect(gameKicker).toBeVisible();

  const [satBox, bandBox, kickerBox, cellsBox, tight] = await Promise.all([
    satellites.boundingBox(),
    component.locator('[data-slot="rpg-hud-band"]').boundingBox(),
    gameKicker.boundingBox(),
    component.getByRole("toolbar", { name: "Game state" }).boundingBox(),
    resolveSpacingPx(page, "--spacing-tight"),
  ]);
  if (satBox === null || bandBox === null || kickerBox === null || cellsBox === null) {
    throw new Error("expected the band, its satellites and the game rail's kicker + cells to be laid out");
  }
  // THE MOCK'S ANATOMY (#860, `RpgRoom.dc.html` — the kicker's padding is INSIDE its row, and its hairline
  // rule is the seam between the word and the cells): measured word-to-neighbour, the label sits the band's
  // bottom padding + its own top padding under the orbs, and its bottom padding + the rule + the cell row's
  // top padding over the cells. The binding still points DOWN — the word is nearer its cells than the
  // medallions — which is the whole #102 finding; the 3:1 magnitude the HUD's lead bought is not the mock's
  // and is not re-asserted. `tight` is what the kicker pays below its word — resolved from the document.
  const kickerWord = gameKicker.locator('[data-slot="text"]').first();
  const wordBox = await kickerWord.boundingBox();
  if (wordBox === null) {
    throw new Error("expected the kicker's word to be laid out");
  }
  const below = cellsBox.y - (wordBox.y + wordBox.height);
  const above = wordBox.y - (satBox.y + satBox.height);
  expect(below).toBeGreaterThanOrEqual(tight);
  expect(above).toBeGreaterThan(below);
  // The kicker IS the rail's top edge: the rail block starts where its kicker starts, directly under the band.
  const railTop = (await gameRail.boundingBox())?.y ?? 0;
  expect(kickerBox.y).toBeCloseTo(railTop, 0);
  expect(railTop).toBeGreaterThan(bandBox.y + bandBox.height - 1);

  // CD1/CD2 (UI-Density-Law §3.2): a read-only grouping's name is a caps label + a hairline rule and
  // NOTHING ELSE — no fill, no radius, no top rule on the STATE rail (the band's own seam is that line);
  // the one hairline it carries is the rule under the word, the seam with its cells.
  await expect
    .poll(
      async () =>
        (
          await gameKicker.evaluate((el) => {
            const style = getComputedStyle(el);
            return { border: style.borderTopWidth + style.borderBottomWidth, radius: style.borderRadius, background: style.backgroundColor };
          })
        ).border,
    )
    .toBe("0px1px");
  await expect
    .poll(
      async () =>
        (
          await gameKicker.evaluate((el) => {
            const style = getComputedStyle(el);
            return { border: style.borderTopWidth + style.borderBottomWidth, radius: style.borderRadius, background: style.backgroundColor };
          })
        ).radius,
    )
    .toBe("0px");
  await expect
    .poll(
      async () =>
        (
          await gameKicker.evaluate((el) => {
            const style = getComputedStyle(el);
            return { border: style.borderTopWidth + style.borderBottomWidth, radius: style.borderRadius, background: style.backgroundColor };
          })
        ).background,
    )
    .toBe("rgba(0, 0, 0, 0)");
});

test("#102: the HUD's NON-VIEWPORT SPEND is pinned — measured as the pane minus its own panel, gaps included", async ({ mount, page }) => {
  // The header's recorded objection to a second kicker was VERTICAL BUDGET (§7.1 caps chrome at 30%), and
  // the owner pick answered it on its own terms rather than overruling it: the deleted echo line and its
  // 8px gap pay for the kicker row.
  //
  // THIS TEST USED TO SUM THREE ELEMENT HEIGHTS AND CALL IT "chrome" (side-eye #102, 2026-08-17), which is
  // the number the pane does NOT spend. The HUD column carries a `gap-block` seam between all five of its
  // children — band ↔ game rail ↔ viewport ↔ ground ↔ admin rail — so FOUR 12px gaps, 48px, sat outside
  // every reading this file took. Measured live at 383×800: band 209.5 + rails 70.3 + 66.3 = 346.1 of
  // element (the old figure) against a real 394.0px of non-viewport spend, 49.3% of the pane — the gaps
  // were a third of the miss. The honest measurement is the one the viewport actually feels: the pane's
  // height minus the panel it leaves AND minus the GROUND, which counts every gap, margin and rounding by
  // construction and cannot be defeated by adding a sixth child. The ground is subtracted because it is not
  // spend: §7.1's residual absorbs whatever a SHORT body leaves and measures ZERO under a tall one (which
  // is why the live reading needed no such term — its body filled the viewport), so counting it would make
  // this number a function of the stubbed body's length rather than of the HUD's chrome.
  //
  // THE NUMBERS, with their provenance:
  //   · 347.0px element / (the echo era, live-measured — the pre-#102 ratchet this test was born holding)
  //   · 346.1px element · 394.0px REAL — the #102 kicker swap; the swap is still a wash, which is the
  //     claim the owner pick owed and it survives intact.
  //   · 400.3px REAL — today's caption raise (`voice="gloss"` → `"label"`, the 10.5px→13px readable-floor
  //     fix on the pane's primary navigation). It costs ~3px a rail and it is DELIBERATE: ten sub-11px
  //     interactive captions were the review's largest remaining legibility finding. The §7.1 30% cap is
  //     asserted separately, at its own stated 30rem×900 reference, and is unaffected.
  // The fence is the post-change real number: no future change may spend more without saying why here.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory width={383} height={800} />);
  // SETTLED, not in-flight: the band renders behind a QueryBoundary whose `fallback={null}` collapses it,
  // and a spend measured mid-query is a measurement of the fallback.
  await expect(component.locator('[data-slot="rpg-band-satellites"]')).toBeVisible();
  await expect(component.locator('[data-slot="context-rail"]')).toHaveCount(2);
  const [paneHeight, panelBox, groundBox, row] = await Promise.all([
    component.locator("[data-context-bracket]").evaluate((el) => el.getBoundingClientRect().height),
    component.locator('[data-slot="tabs-panel"]:visible').boundingBox(),
    component.locator('[data-slot="context-bracket-ground"]').boundingBox(),
    resolveSpacingPx(page, "--spacing-row"),
  ]);
  if (panelBox === null || groundBox === null) {
    throw new Error("expected the active viewport panel and the ground to be laid out");
  }
  const spend = paneHeight - panelBox.height - groundBox.height;
  //   · 401px was the fence the HUD's own column earned (400.3 real, with four 12px seams).
  //   · THE CONTEXT BRACKET (#860) has no column seam at all (each slot pays its own padding, the mock's
  //     anatomy), the receded rail wears a floor under its cells (#861) and both kickers carry their own
  //     rows — MEASURED at 383×800 on the bracket: see the report of the lane that re-measured it. The
  //     fence is the post-change real number, rounded up one px; no future change may spend more without
  //     saying why here.
  expect(spend).toBeLessThanOrEqual(384);
  // …and the element sum is the spend minus exactly the band SLOT's own box (its two `row` pads and the
  // 2px binding edge on the bracket root): with the seams gone there is nothing else between the pane and
  // its elements, and this pins that nothing has crept back in.
  const rails = await component.locator('[data-slot="context-rail"]').all();
  const [bandBox, ...railBoxes] = await Promise.all([
    component.locator('[data-slot="rpg-hud-band"]').boundingBox(),
    ...rails.map((rail) => rail.boundingBox()),
  ]);
  if (bandBox === null) {
    throw new Error("expected the band to be laid out");
  }
  const elementSum = bandBox.height + railBoxes.reduce((total, box) => total + (box?.height ?? 0), 0);
  expect(spend - elementSum).toBeCloseTo(2 * row + 2, 0);
});

test("#860: the bracket column has NO seam of its own — each slot pays its own padding, and the call site says so", async ({ mount, page }) => {
  // The HUD column used to carry a declared `gap-block` seam (#102 — the 12px the pane was measured
  // against). The context bracket (the mock's anatomy) lays its five slots edge to edge: the band's
  // padding, the kickers' own rows and the viewport's re-paid pane padding are the only spacing, so the
  // column's gap is ZERO — declared as `gap-0` against the tabs primitive's `gap-block` base (#146 made
  // that merge deterministic). Asserted BOTH ways: the computed pixels and the declaration, so a primitive
  // change that re-opened a seam could not pass on the pixels alone.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory width={383} height={800} />);
  await expect(component.locator('[data-slot="context-rail"]')).toHaveCount(2);
  const column = component.locator("[data-context-bracket]");
  const [rowGap, declared] = await Promise.all([
    column.evaluate((el) => Number.parseFloat(getComputedStyle(el).rowGap)),
    column.evaluate((el) => ({ block: el.classList.contains("gap-block"), zero: el.classList.contains("gap-0") })),
  ]);
  expect(rowGap).toBe(0);
  expect(declared.block).toBe(false);
  expect(declared.zero).toBe(true);
});

test("#102: the rails activate MANUALLY — an arrow moves focus without committing a selection, Enter commits", async ({ mount, page }) => {
  // THE DEFECT (side-eye #102): `@orb/ui`'s TabsList seals `activateOnFocus={true}`, so two ArrowRights
  // across the game rail committed TWO selections and mounted every query-backed panel they crossed. The
  // rail overrides the seal. Asserted through the user-visible affordance the HUD actually exposes —
  // `aria-current`, not the primitive's prop — so this reds on the pre-fix source rather than failing to
  // compile against it.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory width={383} height={800} />);
  const rail = component.getByRole("toolbar", { name: "Game state" });
  const status = rail.getByRole("button", { name: "Status" });
  await expect(status).toHaveAttribute("aria-current", "true");

  await status.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  // Focus MOVED two cells…
  await expect(rail.getByRole("button", { name: "Scene" })).toBeFocused();
  // …and NOTHING was committed on the way: the landing tab still holds the view, and neither cell it
  // crossed nor the one it landed on claims it.
  await expect(status).toHaveAttribute("aria-current", "true");
  await expect(rail.getByRole("button", { name: "Inventory" })).not.toHaveAttribute("aria-current", "true");
  await expect(rail.getByRole("button", { name: "Scene" })).not.toHaveAttribute("aria-current", "true");
  // Enter is what commits — the cell is a native button, so this is the browser's own click path.
  await page.keyboard.press("Enter");
  await expect(rail.getByRole("button", { name: "Scene" })).toHaveAttribute("aria-current", "true");
  await expect(status).not.toHaveAttribute("aria-current", "true");
});

test("#102: every rail caption sits at the READABLE step, and still fits at the docked and floor widths", async ({ mount, page }) => {
  // THE DEFECT: all ten captions rode `voice="gloss"` — the 10.5px `micro` step, under the 11px readable
  // floor at BOTH pointers, on the pane's PRIMARY NAVIGATION. They are `voice="label"` (13px) now. The
  // assertion is the resolved TOKEN, never a px literal, plus the floor itself as a second, independent
  // statement of what the fix is for.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverDockedStory />);
  await expect(component.locator('[data-slot="context-rail"]')).toHaveCount(2);
  // Barrier on the SETTLED rails (both rails' cells resolved) before measuring — the admin rail's participant
  // cell arrives with its own query. The count is a FLOOR, not an identity: the six game cells plus the
  // admin set this stub produces. What the test is about is that NONE of them is under the floor.
  const game = component.getByRole("toolbar", { name: "Game state" });
  await expect(game.getByRole("button", { name: "Map" })).toBeVisible();
  const captions = component.locator('[data-slot="context-cell-caption"]');
  await expect.poll(() => captions.count(), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(9);
  const [sizes, label] = await Promise.all([
    captions.evaluateAll((els) => els.map((el) => Number.parseFloat(getComputedStyle(el).fontSize))),
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-label")) * 16),
  ]);
  for (const size of sizes) {
    expect(size).toBeCloseTo(label, 0);
    expect(size).toBeGreaterThanOrEqual(11);
  }
  // …and the wider word does not buy an ellipsis at the most common mount (384px docked): the rail's
  // `minmax(max-content,1fr)` tracks scroll instead of clipping, which is the arm that exists for this.
  const clipped = await captions.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

// A FENCE, not a defect proof — stated honestly: this test PASSES on the pre-fix 10.5px source too (a
// smaller word obviously fits where a bigger one does). Its job is the other direction: the readable-floor
// raise must not re-buy the three-character-stub defect at the panel's narrowest real mount, and it also
// pins the two-row premise the wrapped-marker test below rests on.
test("#102: the readable caption survives the WRAPPED floor width too — rows of three, no clipped word", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverFloorStory />);
  const game = component.getByRole("toolbar", { name: "Game state" });
  await expect(game.getByRole("button", { name: "Inventory" })).toBeVisible();
  const captions = component.locator('[data-slot="context-cell-caption"]');
  const clipped = await captions.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
  // The six game cells really are on TWO rows here (the `@max-xs` wrap arm) — the premise item 7 rests on.
  const rows = await game.locator('[data-slot="tabs-tab"]').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().y))).size);
  expect(rows).toBe(2);
});

test("#102: the kicker's SELECTION half moves exactly one axis off the group's name — colour, per the mock", async ({ mount, page }) => {
  // Measured, the two halves were byte-identical on all five computed axes (10.5px / 600 / 0.84px / the same
  // muted ink / caps), so "GAME STATE · STATUS" read as one flat string instead of a name plus what it
  // holds. Exactly ONE axis moves and the other four are asserted EQUAL, because a breadcrumb that changes
  // size or weight mid-line stops being one typographic line. The HUD moved WEIGHT; the owner-ruled mock
  // (#860, `.kick .sel { color: var(--fg) }`) moves COLOUR — the datum steps up to the foreground while the
  // name keeps the kicker's muted ink, which is also what makes the owning kicker the brighter one (#861).
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory width={383} height={800} />);
  const gameKicker = railBlock(component, page, "Game state").locator('[data-slot="context-rail-kicker"]');
  await expect(gameKicker).toHaveText("Game state · Status");
  const read = (locator: Locator): Promise<{ size: number; weight: number; tracking: string; color: string; transform: string }> =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        size: Number.parseFloat(style.fontSize),
        weight: Number.parseFloat(style.fontWeight),
        tracking: style.letterSpacing,
        color: style.color,
        transform: style.textTransform,
      };
    });
  const [name, selection] = await Promise.all([
    read(gameKicker.locator('[data-slot="text"]')),
    read(gameKicker.locator('[data-slot="context-rail-selection"]')),
  ]);
  expect(selection.color).not.toBe(name.color);
  expect(selection.weight).toBe(name.weight);
  expect(selection.size).toBeCloseTo(name.size, 1);
  expect(selection.tracking).toBe(name.tracking);
  expect(selection.transform).toBe(name.transform);
});

test("#102: the kicker's hairline IS the rail's edge — the rule bleeds to the full width, only the word is inset", async ({ mount, page }) => {
  // The header has always claimed "that kicker's hairline rule IS the rail's own edge". It was not: the
  // kicker row carried `px-block`, which inset the Separator as well as the word, so the rule stopped a
  // block short of the full-bleed cell row underneath it. Since #860 the rule is the kicker ROW's own bottom
  // hairline (the mock's `.kick`), so it spans the rail by construction; the word keeps its inset. Measured
  // at the panel's 272px floor, in the axis the defect lives in — the rule's END edge against the RAIL's.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverFloorStory />);
  const gameRail = railBlock(component, page, "Game state");
  const kicker = gameRail.locator('[data-slot="context-rail-kicker"]');
  await expect(kicker).toBeVisible();
  const [ruleBox, railBox, wordBox, block, rule] = await Promise.all([
    kicker.boundingBox(),
    gameRail.boundingBox(),
    kicker.locator('[data-slot="text"]').first().boundingBox(),
    resolveSpacingPx(page, "--spacing-block"),
    kicker.evaluate((el) => getComputedStyle(el).borderBottomWidth),
  ]);
  if (ruleBox === null || railBox === null || wordBox === null) {
    throw new Error("expected the kicker's rule, its word and the rail block to be laid out");
  }
  expect(rule).toBe("1px");
  // The rule ends where the rail ends (the full-bleed edge), not a block short of it.
  expect(ruleBox.x + ruleBox.width).toBeCloseTo(railBox.x + railBox.width, 0);
  // …and the WORD keeps the band's inline rhythm, which is the half that should stay inset.
  expect(wordBox.x - railBox.x).toBeCloseTo(block, 0);
});

test("#102: in the WRAPPED rail the active cell drops its edge bar — a bar between two rows points at the wrong one", async ({ mount, page }) => {
  // At the 272px floor the six game cells fold to two rows of three, and the active FIRST-ROW cell painted
  // its inward-facing 2px bar along the seam above row TWO — a marker aimed at the cell below it instead of
  // at the viewport it selects. In the wrapped state the active treatment is the cell's own fill + accent
  // ink, which is a whole-cell mark with no direction to be wrong about. The border BOX is kept (transparent)
  // so folding the rail moves no cell.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverFloorStory />);
  const game = component.getByRole("toolbar", { name: "Game state" });
  const active = game.getByRole("button", { name: "Status" });
  await expect(active).toHaveAttribute("aria-current", "true");
  const cells = game.locator('[data-slot="tabs-tab"]');
  // The wrap really is in effect (this assertion is meaningless on a one-row rail).
  expect(await cells.evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().y))).size)).toBe(2);
  // …and the active cell is on the FIRST of those rows, i.e. exactly the cell whose bottom edge is an
  // internal seam.
  const [activeY, firstY] = await Promise.all([
    active.evaluate((el) => Math.round(el.getBoundingClientRect().y)),
    cells.first().evaluate((el) => Math.round(el.getBoundingClientRect().y)),
  ]);
  expect(activeY).toBe(firstY);
  const transparent = "rgba(0, 0, 0, 0)";
  await expect
    .poll(
      async () =>
        (
          await active.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.borderBottomColor, width: style.borderBottomWidth, fill: style.backgroundColor, ink: style.color };
          })
        ).color,
    )
    .toBe(transparent);
  // The 2px box survives, so no cell changes height when the rail folds…
  await expect
    .poll(
      async () =>
        (
          await active.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.borderBottomColor, width: style.borderBottomWidth, fill: style.backgroundColor, ink: style.color };
          })
        ).width,
    )
    .toBe("2px");
  // …and the cell is still unmistakably the selected one, by fill and by ink.
  await expect
    .poll(
      async () =>
        (
          await active.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.borderBottomColor, width: style.borderBottomWidth, fill: style.backgroundColor, ink: style.color };
          })
        ).fill,
    )
    .not.toBe(transparent);
  const resting = await game.getByRole("button", { name: "Scene" }).evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect
    .poll(
      async () =>
        (
          await active.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.borderBottomColor, width: style.borderBottomWidth, fill: style.backgroundColor, ink: style.color };
          })
        ).fill,
    )
    .not.toBe(resting);
  await expect
    .poll(
      async () =>
        (
          await active.evaluate((el) => {
            const style = getComputedStyle(el);
            return { color: style.borderBottomColor, width: style.borderBottomWidth, fill: style.backgroundColor, ink: style.color };
          })
        ).ink,
    )
    .not.toBe(await game.getByRole("button", { name: "Scene" }).evaluate((el) => getComputedStyle(el).color));
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
  // ONE ROW, and a cheap one: the compressed band stays under the 138px F6 measured for this exact state,
  // and it can only be that short because the copy, the cues and the satellites sit BESIDE the stone
  // instead of stacked under it.
  //
  // THE BUDGET MOVED ONE LINE, DELIBERATELY (#875 F3, 2026-08-30). It used to be "less than the full
  // form's stone alone (120px)"; the band now carries the ROOM'S NAME as its first line — an `h2` at the
  // band voice, like the chat and character bands — because with the topbar correctly yielding to a docked
  // pane (#846) a game room otherwise had NO heading anywhere on screen and `--aria` returned one flat
  // text node. A name has to live somewhere and the head band's contract is naming the artifact; the other
  // two bands pay the same line and were never budgeted against it. Measured after: 130.2px. The ceiling
  // is the F6 number this test exists to hold, not the stone step.
  const compressedBandCeiling = 138;
  expect(headerBox.height).toBeLessThan(compressedBandCeiling);
  // …and the satellites really are in that row: past the stone's right edge, level with it.
  const orbBox = await component.locator('[data-slot="rpg-takeover-header"] [data-slot="ring-gauge"]').first().boundingBox();
  if (orbBox === null) {
    throw new Error("expected the band's pool orbs to be laid out");
  }
  await expect
    .poll(
      async () => (await component.locator('[data-slot="rpg-takeover-header"] [data-slot="ring-gauge"]').first().boundingBox())?.x ?? Number.NEGATIVE_INFINITY,
    )
    .toBeGreaterThan(stoneBox.x + stoneBox.width);
  await expect
    .poll(
      async () => (await component.locator('[data-slot="rpg-takeover-header"] [data-slot="ring-gauge"]').first().boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThan(stoneBox.y + stoneBox.height);
  expect(orbBox.y + orbBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
});

// ── #878 F7: AT A LARGE TYPE SCALE THE ORBS LEAVE THE BAND FOR THE VIEWPORT ────────────────────────────
// The `reading` preset measured band 299 + rails 256 of a 740px pane — 184px of viewport (24.9%). The
// satellite row is the part of the band that is a GLANCE rather than the artifact's identity, so it moves
// into the tab body and scrolls with the content. ONE derivation decides the home, and this pin drives BOTH
// arms: a one-directional check passes on a row that is stuck in either place.
const READING_FONT_SCALE = 1.25;

test("#878 F7: the satellite row lives in the BAND at the default type scale and in the VIEWPORT at the reading scale", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverReferenceStory />);
  const band = component.locator('[data-slot="rpg-hud-band"]');
  await expect(band.locator('[data-slot="rpg-band-satellites"]')).toHaveCount(1);
  // …and NOWHERE else — exactly one row on screen, never two homes for one glance.
  await expect(component.locator('[data-slot="rpg-band-satellites"]')).toHaveCount(1);
});

test("#878 F7: at the reading type scale the row is in the tab body, the band sheds it, and the viewport grows", async ({ mount, page }) => {
  await stubTakeover(page, { fontScale: READING_FONT_SCALE });
  const component = await mount(<RpgTakeoverReferenceStory />);
  const band = component.locator('[data-slot="rpg-hud-band"]');
  const row = component.locator('[data-slot="rpg-band-satellites"]');
  // STILL EXACTLY ONE — the move is a MOVE, not a second mount.
  await expect(row).toHaveCount(1);
  await expect(band.locator('[data-slot="rpg-band-satellites"]')).toHaveCount(0);
  // …and it is inside the settled viewport panel, so it scrolls with the tab's content.
  const panel = component.locator('[data-slot="tabs-panel"]:visible:not([inert])');
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('[data-slot="rpg-band-satellites"]')).toHaveCount(1);
  // The Waystone is UNCHANGED and still in the band — the ruling moved the orbs, nothing else.
  await expect(band.locator('[data-slot="waystone"]')).toHaveCount(1);
});

test("HUD-1 §7.1: the HUD's chrome stays inside its vertical budget at the 30rem × 900px reference", async ({ mount, page }) => {
  // THE MOTIVATING MEASUREMENT (F6 defect 4): on an ambient-less game the band alone was 138px — 68% of the
  // pane's chrome — while a ~400px dead zone sat under a short body. The budget is a RATIO against the pane,
  // never a px count, and it is asserted at the geometry §7.1 names: a 30rem docked panel, 900px tall.
  await stubTakeover(page, { tracker: ambientLessTrackerView() });
  const component = await mount(<RpgTakeoverReferenceStory />);
  const region = component.locator("[data-context-bracket]");
  await expect(region).toBeVisible();
  await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);

  const rails = await component.locator('[data-slot="context-rail"]').all();
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
  //
  // RE-MEASURED 2026-08-30 (#875 F3): 32.9%. The band grew by ONE LINE — the room's NAME, an `h2` at the
  // band voice, which #875 F3 required because a docked game room had no heading anywhere (the topbar
  // yields, #846) and the band printed the scene LOCATION where the other two bands print the artifact.
  // The ceiling moves by that line and no further; it is still a RATIO, still the same reference, and the
  // band-share clause below (the thing F6 was actually about) is unchanged and still holds.
  const chrome = bandBox.height + railHeight;
  expect(chrome / regionBox.height).toBeLessThanOrEqual(0.34);
  // …and the band is no longer the chrome's dominant tenant: the state it was WORST at (nothing set) is now
  // its cheapest form, so the 68% F6 measured is a line it may not cross back over.
  expect(bandBox.height / chrome).toBeLessThan(0.65);
});

test("HUD-1 §7.1 (AMENDED): the AMBIENT-SET band's chrome stays inside the SET arm's budget — and the viewport keeps the majority", async ({ mount, page }) => {
  // THE SECOND ARM (side-eye 08-01 P1). The budget CT above pins the COMPACT arm and stubs `ambientLess`, so
  // the arm the panel actually lands on — a game with a scene set, the DEFAULT — was unguarded, and it
  // measured 41.2% against a law written as a flat ≤30%. §7.1 is amended to a two-arm law because the single
  // arm is unsatisfiable here without deleting the composite: at this reference the two rails alone cost
  // 116.375px (2026-08-17: ~137px, both rails kicker'd under #102 variant A), leaving ~134px of the 270px
  // ceiling — and the SET band's floor is 18px of padding + the 120px stone row ≈ 138px with ZERO
  // satellites. The only way under is to shrink the stone below the focal step F16 grew it to, which is the
  // signature element the amendment protects.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverReferenceStory />);
  const region = component.locator("[data-context-bracket]");
  await expect(region).toBeVisible();
  await expect.poll(() => component.locator('[data-slot="tabs-panel"]:visible').count(), { intervals: [20, 50, 100, 200] }).toBe(1);
  // The composite is really the full arm — a budget met by a band that collapsed to its compact form would
  // be measuring the other law.
  await expect(component.locator('[data-slot="rpg-takeover-header"]')).toHaveAttribute("data-compact", "false");

  const rails = await component.locator('[data-slot="context-rail"]').all();
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
  const list = component.getByRole("toolbar", { name: "Game state" });
  await expect(list.getByRole("button")).toHaveCount(6);

  const boxes = await Promise.all((await list.getByRole("button").all()).map((tab) => tab.boundingBox()));
  const tops = new Set(boxes.map((box) => Math.round(box?.y ?? 0)));
  expect(tops.size).toBe(2);
  const firstRow = boxes.filter((box) => Math.round(box?.y ?? 0) === Math.min(...tops));
  expect(firstRow).toHaveLength(3);

  // No caption is truncated: the text's own scroll width fits the box it renders in.
  const clipped = await list.locator('[data-slot="context-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

test("side-eye 08-01: at 320px the SIX-cell game rail wraps too — the caption that clips there is why", async ({ mount, page }) => {
  // The wrap fires at the `xs` step, not at the 272px floor, because that is where the measurement says the
  // words stop fitting: unwrapped at a 320px pane, "Inventory" wanted 48px of caption inside a 36px cell.
  // (The ADMIN rail, 3-4 cells, never wraps at any width — it is not spending vertical budget it doesn't
  // need to.)
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  const game = component.getByRole("toolbar", { name: "Game state" });
  await expect(game.getByRole("button")).toHaveCount(6);
  const clipped = await game.locator('[data-slot="context-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);

  const gameRows = new Set((await Promise.all((await game.getByRole("button").all()).map((tab) => tab.boundingBox()))).map((box) => Math.round(box?.y ?? 0)));
  expect(gameRows.size).toBe(2);
  const admin = component.getByRole("toolbar", { name: "Chat" });
  const adminRows = new Set((await Promise.all((await admin.getByRole("button").all()).map((tab) => tab.boundingBox()))).map((box) => Math.round(box?.y ?? 0)));
  expect(adminRows.size).toBe(1);
});

// ── SIDE-EYE 08-01: THE PANEL STOPS INVENTING READINGS ────────────────────────────────────────────────

/** The same participant actor with NO tracker readings written — the state a fresh game is in before the story
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
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

  const row = component.locator('[data-slot="meter-row"]').first();
  await expect(row).toHaveAttribute("data-unset", "true");
  // The ceiling is a real fact (the def carries it); the READING is not — so the numerator is a dash.
  await expect(row).toContainText("—/30");
  await expect(component.getByText("0/30")).toHaveCount(0);
  // …and the decoration agrees with the text: an EMPTY rail, not a bar computed off the invented zero.
  await expect.poll(async () => await row.locator('[data-slot="track-bar-fill"]').evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
});

test("side-eye 08-01: the pack grid ends on the LAST ITEM — no empty ghost socket", async ({ mount, page }) => {
  // The grid shipped one dashed `aria-hidden` cell called a "growth affordance": 150×28px with no word in
  // it and nothing to click. The host's real add row sits directly beneath the grid.
  await stubTakeover(page, { tracker: packedTracker() });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Inventory" }).click();

  await expect(component.locator('[data-slot="rpg-pack-cell"]')).toHaveCount(PACKED_ITEMS.length);
  await expect(component.locator('[data-slot="rpg-pack-ghost"]')).toHaveCount(0);
  // The growth affordance that DOES exist is a named control, not a box.
  await expect(component.getByRole("button", { name: "Add item" })).toBeVisible();
});

test("side-eye 08-01: a npc card's tracked readings are named by WHOSE they are", async ({ mount, page }) => {
  // Two npcs carrying the same tracker gave a name-navigating reader two buttons called "Trust
  // value" and no way to tell Sera's from Mara's — the card's own name was in the DOM, not in the control's.
  const trust = { ...VITALITY, key: "trust", label: "Trust", shape: "text", max: null, appliesTo: "npcs" };
  const base = trackerView(false) as { actors: Record<string, unknown>[]; cast: readonly string[] } & Record<string, unknown>;
  const sera = base.actors.find((a) => a["name"] === "Sera") as Record<string, unknown>;
  const reading = (value: string): Record<string, unknown> => ({
    trackerValues: { trust: { value, items: null } },
    conditions: [],
    inventory: [],
    wallet: [],
    status: "",
  });
  await stubTakeover(page, {
    tracker: {
      ...base,
      actors: [
        ...base.actors.map((a) => (a === sera ? { ...sera, trackers: [trust], volatile: reading("wary") } : a)),
        {
          ...sera,
          actorRef: { kind: "npc", npcKey: "mara-npc" },
          name: "Mara the elder",
          identity: { ...(sera["identity"] as Record<string, unknown>), name: "Mara the elder", appearance: "", thoughts: "" },
          trackers: [trust],
          volatile: reading("warm"),
        },
      ],
      cast: [...base.cast, "npc:mara-npc"],
    },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Scene" }).click();

  await expect(component.getByRole("button", { name: "Sera Trust" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Mara the elder Trust" })).toBeVisible();
  // The old subjectless name is gone (it named two different readings).
  await expect(component.getByRole("button", { name: "Trust value" })).toHaveCount(0);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// RESYNC × PERSONA — the host half of the reattribution pair (stickler Q3 §3.2 arm 2).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The rebuild re-reads the story and re-extracts the tracked planes, so it bakes whatever name the
// transcript resolves to. Opting in re-stamps the host's own rows FIRST, then rebuilds — the ORDER is the
// whole feature (a rebuild that ran first would re-bake the old name), so it is what these pin.

test("the resync's opt-in restamp: checked ⇒ the stamp write fires with the all-my-rows scope, then the rebuild", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("checkbox", { name: "Restamp my messages first" }).click();
  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect
    .poll(() => trpc.lastInput("chat.reattributePersona"), { intervals: [20, 50, 100] })
    .toMatchObject({
      scope: { kind: "mine" },
      personaId: PERSONA_ID,
    });
  await expect.poll(() => trpc.count("rpg.resyncFromStory"), { intervals: [20, 50, 100] }).toBe(1);
});

test("a FAILED restamp aborts the rebuild — the rebuild never runs on the stamps the host asked to replace", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { restampFails: true });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("checkbox", { name: "Restamp my messages first" }).click();
  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect.poll(() => trpc.count("chat.reattributePersona"), { intervals: [20, 50, 100] }).toBe(1);
  // The button settles back out of its pending state — the sequence is over, and the rebuild never fired.
  await expect(component.getByRole("button", { name: "Resync from story" })).toBeEnabled();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the button left `Resyncing…` above, so the whole sequence has finished
  expect(trpc.count("rpg.resyncFromStory")).toBe(0);
});

test("unchecked ⇒ the rebuild ALONE — the resync never restamps anything the host didn't ask it to", async ({ mount, page }) => {
  const trpc = await stubTakeover(page);
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect.poll(() => trpc.count("rpg.resyncFromStory"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the restamp would precede the rebuild the poll above awaited
  expect(trpc.count("chat.reattributePersona")).toBe(0);
});

// RESYNC-OR — THE RESYNC DOOR IS LOUD. The verb returned `void`, so all three endings looked identical to the
// host: the button settled and the panel didn't move. That was live — OpenRouter 400'd the structured request
// on the DEFAULT hosted model (`response_format: json_schema` is unservable for this schema on anthropic), the
// compose op swallowed it to an empty delta, and the client reported success. These pin the two endings that
// have no other observable; the third (a real rebuild) announces itself by repainting the panel.
test("RESYNC-OR: a provider refusal is TOLD to the host, with the server's own reason (it used to vanish)", async ({ mount, page }) => {
  const reason = "the model call failed, so nothing was rebuilt: openrouter structured item 0 failed";
  const trpc = await stubTakeover(page, { resyncVerdict: { ok: false, reason } });
  const component = await mount(<RpgTakeoverNotifyStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect.poll(() => trpc.count("rpg.resyncFromStory"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.getByTestId("rpg-notified")).toContainText(reason);
});

test("RESYNC-OR: a rebuild that found NOTHING says so — not silence, and not an error either", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { resyncVerdict: { ok: true, rebuilt: false } });
  const component = await mount(<RpgTakeoverNotifyStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect.poll(() => trpc.count("rpg.resyncFromStory"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.getByTestId("rpg-notified")).toContainText("Nothing to rebuild");
});

test("RESYNC-OR: a rebuild that LANDED stays quiet — the repainted panel is the feedback", async ({ mount, page }) => {
  const trpc = await stubTakeover(page, { resyncVerdict: { ok: true, rebuilt: true } });
  const component = await mount(<RpgTakeoverNotifyStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await component.getByRole("button", { name: "Resync from story" }).click();

  await expect.poll(() => trpc.count("rpg.resyncFromStory"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(component.getByRole("button", { name: "Resync from story" })).toBeEnabled(); // settled
  await expect(component.getByTestId("rpg-notified")).toHaveText("");
});

test("with no persona in this chat the option is DISABLED and says why (never hidden)", async ({ mount, page }) => {
  await stubTakeover(page, { chat: gameChat(null) });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  await expect(component.getByRole("checkbox", { name: "Restamp my messages first" })).toBeDisabled();
  await expect(component.getByText("Pick a persona for this chat first — there's nothing to re-stamp to.")).toBeVisible();
});

// ── GLYPHFIX 08-03: the square glyph-button ramp, at the panel's own FLOOR ─────────────────────────────
// 13 rpg icon buttons wore `className="!size-N !p-0"` — an `!important` override of Button's sealed `sm`
// control height, which is how they escaped the `ui-size-via-variant` gate for a day. They now ride the
// primitive's `glyph-*` size arms. The @orb/ui CT proves the arm's box in isolation; THIS proves the pixels
// at the NARROWEST REAL HOST — the 272px docked context panel (`clamp(17rem, 30vw, 30rem)`'s floor), where
// a control that lost its box would clip or collapse and a 720px story would hide it.
test("GLYPHFIX: at the 272px panel floor the quest glyph buttons are SQUARE, token-sized and inside their row", async ({ mount, page }) => {
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverFloorStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Quests" }).click();

  const del = component.getByRole("button", { name: "Delete quest: Keep the bone key" });
  await expect(del).toBeVisible();
  const measured = await del.evaluate((el) => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-glyph-sm)";
    el.ownerDocument.body.append(probe);
    const token = probe.getBoundingClientRect().width;
    probe.remove();
    const box = el.getBoundingClientRect();
    const row = (el.parentElement as HTMLElement).getBoundingClientRect();
    const after = getComputedStyle(el, "::before");
    return {
      token,
      width: box.width,
      height: box.height,
      overflowsRow: box.right > row.right + 1,
      hit: Number.parseFloat(after.width),
      shrink: getComputedStyle(el).flexShrink,
    };
  });
  // The box is EXACTLY its token — resolved from the live document, never a hardcoded px.
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).token,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).width,
    )
    .toBeCloseTo(measured.token, 1);
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).height,
    )
    .toBeCloseTo(measured.token, 1);
  // …and it did not collapse or get squeezed out of the 272px row (the `shrink-0` the arm now owns).
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).shrink,
    )
    .toBe("0");
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).overflowsRow,
    )
    .toBe(false);
  // The hit area still exceeds the visible box (the ::before the arm carries — it was an ::after until #1843
  // moved it off the CTA ring's unlayered layer, and this reader was not swept with it: a ghost glyph has no
  // ::after at all, so `parseFloat("auto")` was NaN and the poll could never pass, #2301), even on this
  // fine-pointer run.
  await expect
    .poll(
      async () =>
        (
          await del.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-glyph-sm)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            const box = el.getBoundingClientRect();
            const row = (el.parentElement as HTMLElement).getBoundingClientRect();
            const after = getComputedStyle(el, "::before");
            return {
              token,
              width: box.width,
              height: box.height,
              overflowsRow: box.right > row.right + 1,
              hit: Number.parseFloat(after.width),
              shrink: getComputedStyle(el).flexShrink,
            };
          })
        ).hit,
    )
    .toBeGreaterThan(measured.height);
});

/** The default config's ONE tracker def re-shaped to a `meter` — the arm that renders the colour SWATCH
 *  (`def.shape === "meter"`), which the default `text` def never mounts. */
function meterTrackerConfig(): unknown {
  const base = configView() as Record<string, unknown>;
  const def = (base["trackers"] as readonly Record<string, unknown>[])[0] as Record<string, unknown>;
  return { ...base, trackers: [{ ...def, shape: "meter", write: "delta", max: 30 }] };
}

test("GLYPHFIX: at the 272px floor the tracker-def row's SWATCH and its three glyph toggles all hold their boxes", async ({ mount, page }) => {
  // The rest of the same debt, on the row the panel packs tightest: a TrackBar that was
  // `className="!w-block shrink-0"` (now `width="swatch"`) and three `!size-6 !p-0` toggles (now
  // `size="glyph-md"`), all in ONE 272px row beside an editable label. A collapsed swatch or a squeezed
  // toggle is invisible to every static gate — this reads them back computed against their own tokens.
  await stubTakeover(page, { config: meterTrackerConfig() });
  const component = await mount(<RpgTakeoverFloorStory />);
  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Game" }).click();

  const row = component.locator('[data-slot="rpg-tracker-row"]').first();
  const swatch = row.locator('[data-slot="track-bar"]').first();
  await expect(swatch).toBeAttached();
  const measured = await swatch.evaluate((el) => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-block)";
    el.ownerDocument.body.append(probe);
    const token = probe.getBoundingClientRect().width;
    probe.remove();
    return { token, width: el.getBoundingClientRect().width, shrink: getComputedStyle(el).flexShrink };
  });
  await expect
    .poll(
      async () =>
        (
          await swatch.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-block)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            return { token, width: el.getBoundingClientRect().width, shrink: getComputedStyle(el).flexShrink };
          })
        ).token,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await swatch.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-block)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            return { token, width: el.getBoundingClientRect().width, shrink: getComputedStyle(el).flexShrink };
          })
        ).width,
    )
    .toBeCloseTo(measured.token, 1);
  await expect
    .poll(
      async () =>
        (
          await swatch.evaluate((el) => {
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-block)";
            el.ownerDocument.body.append(probe);
            const token = probe.getBoundingClientRect().width;
            probe.remove();
            return { token, width: el.getBoundingClientRect().width, shrink: getComputedStyle(el).flexShrink };
          })
        ).shrink,
    )
    .toBe("0");

  // The three glyph-md toggles on the same row: square, at --spacing-glyph-md, inside the row's box.
  const toggles = await Promise.all(
    ["Show Trust as a band orb", "Lock Trust — the story can no longer write it", "Remove Trust"].map(async (name) =>
      row.getByRole("button", { name }).evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.width = "var(--spacing-glyph-md)";
        el.ownerDocument.body.append(probe);
        const token = probe.getBoundingClientRect().width;
        probe.remove();
        const box = el.getBoundingClientRect();
        const band = (el.parentElement as HTMLElement).getBoundingClientRect();
        return { token, width: box.width, height: box.height, overflows: box.right > band.right + 1 };
      }),
    ),
  );
  for (const t of toggles) {
    expect(t.token).toBeGreaterThan(0);
    expect(t.width).toBeCloseTo(t.token, 1);
    expect(t.height).toBeCloseTo(t.token, 1);
    expect(t.overflows).toBe(false);
  }
});

// ── THE PHONE VERTICAL BUDGET (side-eye 2026-08-07 finding 2) ────────────────────────────────────────
// MEASURED on the LIVE stack at 320×568 (iPhone SE, real touch emulation, the seeded d20 game): the claimed
// CONTEXT pane is 464px tall and the HUD spent 446 of it on chrome — a 227px band (76px stone row + a 100px
// satellite row + the selection echo) and a 105px game rail wrapped to two rows of three. The active
// tabpanel was left EIGHTEEN pixels against a 558px body, a 31:1 ratio: Status, Inventory, Scene, Quests and
// Journal were all unusable, and opening the weather picker painted its chips entirely outside the strip.
//
// The pane is composed for the phone now instead of hidden into it: the satellite orbs (whose numbers are
// tracker rows in Status) stand down at a coarse pointer, each rail's kicker sheds its selection half while
// keeping the group's name (#102 variant A — the band's floating echo used to be dropped whole here), and
// the six game cells stay ONE scrollable row. This fences the BUDGET, not the pixel — the assertion is the share of
// the pane the reading surface gets, so it survives a token retune of the band's padding.
//
// The heights are the PRODUCTION panes, not story convenience: 464 is what a 320×568 phone leaves after the
// topbar and the mobile bar; 520 is the 375×667 equivalent. `hasTouch: true` is what flips
// `matchMedia("(pointer: coarse)")` in chromium — `page.emulateMedia` has no `pointer` feature.

const PHONE_PANES = [
  { width: 320, height: 464 },
  { width: 375, height: 520 },
] as const;

test.describe("coarse HUD budget", () => {
  test.use({ hasTouch: true });

  for (const pane of PHONE_PANES) {
    test(`@${pane.width}: the tab body gets a real share of the pane — the chrome no longer eats it`, async ({ mount, page }) => {
      await stubTakeover(page);
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<RpgTakeoverStory width={pane.width} height={pane.height} />);
      const band = component.locator('[data-slot="rpg-hud-band"]');
      await expect(band).toBeVisible();

      const measureBand = (): Promise<{
        readonly pane: number;
        readonly band: number;
        readonly panel: number;
        readonly gameRail: number;
        readonly gameCells: number;
      }> =>
        band.evaluate((el: HTMLElement) => {
          const paneEl = el.closest(".shell-panel") as HTMLElement;
          const panel = paneEl.querySelector('[data-slot="tabs-panel"]:not([hidden])') as HTMLElement | null;
          const rails = Array.from(paneEl.querySelectorAll<HTMLElement>('[data-slot="context-rail"]'));
          const gameCells = rails[0]?.querySelector<HTMLElement>('[role="toolbar"]') ?? null;
          return {
            pane: paneEl.getBoundingClientRect().height,
            band: el.getBoundingClientRect().height,
            panel: panel?.getBoundingClientRect().height ?? 0,
            gameRail: rails[0]?.getBoundingClientRect().height ?? 0,
            gameCells: gameCells?.getBoundingClientRect().height ?? 0,
          };
        });
      // EVERY RATIO IS POLLED, AND THE FIRST SAMPLE IS GATED (#1575). This pin used to take ONE
      // `measureBand()` the instant the band became visible and assert two ratios against it
      // SYNCHRONOUSLY, so it was reading a layout that had not finished settling: under a sibling CT batch
      // (load-avg ~24) the @320 arm and the @375 arm went red on alternate runs and both passed alone. A
      // one-shot readiness sample cannot certify a surface that settles later — the band being visible says
      // nothing about the panel it shares the pane with, or about the metrics the rail is still measured
      // in. So: wait for the ACTIVE tab panel (the thing the first ratio is about) and for webfont
      // swap-in, then poll each ratio to its settled value. The thresholds below are UNCHANGED — the fix
      // is when the numbers are read, never how much slack they are given.
      await expect(component.locator('[data-slot="tabs-panel"]:not([hidden])')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      // MEASURED before: 18/464 ≈ 0.04. The floor is a FRACTION of the pane, set below the value the
      // composition affords rather than at it — this fences the collapse, it does not pin the pixel.
      await expect
        .poll(async () => {
          const m = await measureBand();
          return m.panel / m.pane;
        })
        .toBeGreaterThan(0.3);
      // …and the band is no longer the majority shareholder of a phone pane (227/464 ≈ 0.49 before).
      await expect
        .poll(async () => {
          const m = await measureBand();
          return m.band / m.pane;
        })
        .toBeLessThan(0.35);
      // The game rail is ONE row of cells, not two: 105px of two-row wrap became ~50px of scrollable row.
      // The fence is on the CELLS, which is the thing the wrap doubled — the rail BLOCK now also carries
      // the kicker row the owner pick keeps at coarse (#102 variant A), and folding a deliberate 20px of
      // NAME into a fence written against a 55px second cell row would let a real wrap regression hide
      // inside the allowance. Both are pinned: the cells stay one row, and the block's non-cell chrome
      // stays under a cell row (measured 70.25 total against 50.25 of cells).
      await expect.poll(async () => (await measureBand()).gameCells).toBeLessThan(70);
      // The same fence as before — the block's non-cell chrome stays under a cell row — expressed as the
      // RATIO so both terms come from ONE settled sample instead of one polled term compared against a
      // stale one-shot's denominator.
      await expect
        .poll(async () => {
          const m = await measureBand();
          return (m.gameRail - m.gameCells) / m.gameCells;
        })
        .toBeLessThan(1);
    });

    test(`@${pane.width}: every game tab is still REACHABLE — the single row scrolls, it does not clip`, async ({ mount, page }) => {
      await stubTakeover(page);
      const component = await mount(<RpgTakeoverStory width={pane.width} height={pane.height} />);

      // All six cells are present and each caption renders WHOLE — the `auto-cols-max` half of the fix.
      // (Six is the declared game rail: Status · Inventory · Scene · Quests · Journal · Map.)
      const cells = component.locator('[data-slot="context-rail"]').first().getByRole("button");
      await expect(cells).toHaveCount(6);
      await expect
        .poll(
          async () =>
            await component
              .locator('[data-slot="context-rail"]')
              .first()
              .evaluate((el: HTMLElement) =>
                Array.from(el.querySelectorAll<HTMLElement>('[data-slot="context-cell-caption"]'))
                  .filter((node) => node.scrollWidth - node.clientWidth > 1)
                  .map((node) => node.textContent ?? ""),
              ),
        )
        .toEqual([]);
    });

    test(`@${pane.width}: the rail keeps its NAME and its SELECTION at coarse — the mock's phone arm prints both`, async ({ mount, page }) => {
      // The deleted echo was dropped ENTIRELY at a coarse pointer, so the phone pane had no name for either
      // rail at all; the kicker kept the NAME and shed the datum (#102 variant A, 2026-08-17). The context
      // bracket's phone arms (#860, `RpgRoomMobile.dc.html`) print "GAME STATE · STATUS" whole: the datum
      // now sits 4px above the cell it names and costs the column nothing it was not already spending.
      await stubTakeover(page);
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<RpgTakeoverStory width={pane.width} height={pane.height} />);
      const gameKicker = railBlock(component, page, "Game state").locator('[data-slot="context-rail-kicker"]');
      await expect(gameKicker).toBeVisible();
      await expect(gameKicker).toHaveText("Game state · Status");
      await expect(component.locator('[data-slot="context-rail-selection"]').first()).toBeVisible();
    });
  }
});

// ── THE COARSE GAME RAIL'S CELL WIDTH (side-eye 2026-08-07 §① P2) ───────────────────────────────────
// `pointer-coarse:auto-cols-max` sized the six cells at their CONTENT width, which does two things the
// budget fix above never intended. MEASURED at 430 coarse: Status 43 · Inventory 60 · Scene 41 · Quests 46 ·
// Journal 47 · Map 34 — three of six under the 44px touch floor (D62 P1 / §4b axis 3), and `TabsTab` carries
// no hit-area pseudo to make up the difference. And the six cells ended at x=302, leaving 127px of DEAD
// RAIL — word for word the "bitsy buttons bunched left" that `rpg-hud.tsx`'s own header cites a 2026-07-28
// owner ruling against ("cells as equal columns so the rail reads as a solid frame").
//
// 430 is the reviewer's measuring width and the widest common phone; the 320/375 panes above keep guarding
// the vertical budget and the caption legibility at the narrow end.

const COARSE_RAIL_PANES = [
  { width: 430, height: 700 },
  { width: 375, height: 520 },
  { width: 320, height: 464 },
] as const;

test.describe("coarse game rail cells", () => {
  test.use({ hasTouch: true });

  for (const pane of COARSE_RAIL_PANES) {
    test(`@${pane.width}: every game-rail cell clears the 44px touch floor`, async ({ mount, page }) => {
      await stubTakeover(page);
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<RpgTakeoverStory width={pane.width} height={pane.height} />);
      const rail = component.locator('[data-slot="context-rail"]').first();
      await expect(rail.getByRole("button")).toHaveCount(6);
      // BOXES, because `TabsTab` has no overflowing hit pseudo — here the box IS the target.
      await expect
        .poll(
          async () =>
            await rail.evaluate((el: HTMLElement) =>
              Array.from(el.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')).map((node) => node.getBoundingClientRect().width),
            ),
        )
        .toHaveLength(6);
      await expect
        .poll(async () =>
          (
            await rail.evaluate((el: HTMLElement) =>
              Array.from(el.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')).map((node) => node.getBoundingClientRect().width),
            )
          ).filter((w) => w < 44),
        )
        .toEqual([]);
    });

    test(`@${pane.width}: the rail reads as a solid frame — no dead strip after the last cell`, async ({ mount, page }) => {
      await stubTakeover(page);
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<RpgTakeoverStory width={pane.width} height={pane.height} />);
      const rail = component.locator('[data-slot="context-rail"]').first();
      await expect(rail.getByRole("button")).toHaveCount(6);
      // The tail gap is measured against the LIST's own box, so the assertion survives a retune of the rail's
      // inline padding. MEASURED before: 127px of 429 at 430.
      // One inter-cell gap of slack: an equal-column rail lands the last cell on the list's own right edge.
      await expect
        .poll(
          async () =>
            await rail.evaluate((el: HTMLElement) => {
              const list = el.querySelector('[role="toolbar"]') as HTMLElement;
              const cells = Array.from(list.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]'));
              const last = cells.at(-1) as HTMLElement;
              return list.getBoundingClientRect().right - last.getBoundingClientRect().right;
            }),
        )
        .toBeLessThan(12);
    });
  }
});

// ── THE COARSE RAIL IS A SCROLL BOX WITH ZERO HEADROOM (side-eye 2026-08-07 §① P2, focus ring) ───────
// `overflow-x-auto` forces `overflow-y` to `auto` (CSS: a non-`visible` value on one axis computes the other
// from `visible` to `auto`), and the list's client box is exactly the cell height — no padding. `FOCUS_RING`
// is `ring-2 ring-offset-2`, i.e. 4px painted OUTSIDE the cell's border box, so a keyboard user's focus
// indicator lands in the scroll container's clipped overflow.
//
// THE REVIEWER'S RECEIPT WAS GEOMETRIC ONLY — it could not complete a Tab traversal, and said so. This does
// the traversal: it proves the rail is keyboard-REACHABLE first, and only then judges the ring. The rail
// cells are one roving tab stop (Base UI), so the walk is bounded.

/** Tab from the document until focus lands inside `selector`; each press must settle before focus is read. */
async function tabInto(page: import("@playwright/test").Page, selector: string, maxPresses = 24): Promise<boolean> {
  for (let remaining = maxPresses; remaining > 0; remaining -= 1) {
    await page.keyboard.press("Tab");
    const landed = await page.evaluate((sel: string) => document.activeElement !== null && document.activeElement.closest(sel) !== null, selector);
    if (landed) {
      return true;
    }
  }
  return false;
}

test.describe("coarse game rail focus ring", () => {
  test.use({ hasTouch: true });

  test("@430: a Tab walk reaches a rail cell and its focus ring is not clipped by the scroll box", async ({ mount, page }) => {
    await stubTakeover(page);
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    const component = await mount(<RpgTakeoverStory width={430} height={700} />);
    const rail = component.locator('[data-slot="context-rail"]').first();
    await expect(rail.getByRole("button")).toHaveCount(6);

    // 1) REACHABILITY — the half the reviewer could not measure.
    expect(await tabInto(page, '[data-slot="context-rail"] [role="toolbar"]')).toBe(true);
    const measureRail = (): Promise<{
      readonly overflowY: string;
      readonly headroomTop: number;
      readonly headroomBottom: number;
      readonly boxShadow: string;
    }> =>
      rail.evaluate((el: HTMLElement) => {
        const list = el.querySelector('[role="toolbar"]') as HTMLElement;
        const cell = document.activeElement as HTMLElement;
        const listBox = list.getBoundingClientRect();
        const cellBox = cell.getBoundingClientRect();
        return {
          overflowY: getComputedStyle(list).overflowY,
          headroomTop: cellBox.top - listBox.top,
          headroomBottom: listBox.bottom - cellBox.bottom,
          boxShadow: getComputedStyle(cell).boxShadow,
        };
      });
    // 2) The clip CONDITION — the box really does clip its overflow, and the cell has no headroom in it.
    await expect.poll(async () => (await measureRail()).overflowY).not.toBe("visible");
    await expect
      .poll(async () => {
        const measured = await measureRail();
        return Math.min(measured.headroomTop, measured.headroomBottom);
      })
      .toBeLessThan(4);
    // 3) …so the ring MUST paint inward. A non-inset `ring-offset-2` ring would be drawn 4px outside the
    //    cell, i.e. entirely inside the clipped region, and a keyboard user would see nothing.
    await expect.poll(async () => (await measureRail()).boxShadow).not.toBe("none");
    await expect.poll(async () => (await measureRail()).boxShadow).toContain("inset");
  });
});

// The fine-pointer pane is untouched: the band keeps its satellite orbs, and the owning rail's kicker
// carries the full sentence — name AND selection — because a desktop dock has the vertical budget the
// phone does not. This is what makes the fix an ARRANGEMENT, not a deletion — the same data, composed for
// the column it is in.
test("a fine pointer keeps the band's satellites and the owning rail's FULL kicker sentence", async ({ mount, page }) => {
  await stubTakeover(page);

  const component = await mount(<RpgTakeoverStory height={720} width={360} />);
  await expect(component.locator('[data-slot="rpg-band-satellites"]')).toBeVisible();
  await expect(railBlock(component, page, "Game state").locator('[data-slot="context-rail-kicker"]')).toHaveText("Game state · Status");
  await expect(component.locator('[data-slot="context-rail-selection"]')).toBeVisible();
});

// ── The per-actor TRACKER-EXCEPTIONS editor (host grants/revokes, tracked-field-unification §5.1) ──────────
// `sheet.trackerGrants`/`trackerRevokes` gate per-actor tracker applicability server-side and were stored,
// gated + optimistically merged with NO client editor — so the owner's explicit-list-only ruling was a DEAD
// LETTER (a host could not author the list). The host editor lives in the Status character takeover. These
// pin the three things: (1) a host GRANTS a class-excluded tracker and REVOKES a class-included one, persisted
// as the whole-list `patchSheet` payload; (2) the write CHANGES APPLICABILITY — the stub re-resolves
// `carriesTracker` on the post-write refetch, so the takeover renders the SETTLED new carriage; (3) a MEMBER
// sees no editor (grants are the host's call — PERMISSION-omit).

// Mara is a CHARACTER actor ⇒ the `party` carrier class. `vitality`/`resolve` (party) reach her by class and
// can be revoked; `bound-will` (explicit EMPTY list) reaches her ONLY by a grant. All actor-subject meters,
// `satisfies`-typed (VITALITY/RESOLVE above) so they feed the ONE carrier predicate without a literal-cast.
const BOUND_WILL = { ...VITALITY, key: "bound-will", label: "Bound Will", appliesTo: [], sort: 2, pinned: false } satisfies RpgTrackerDef;
const GRANT_DEFS = [VITALITY, RESOLVE, BOUND_WILL];
const MARA_REF = { kind: "character", characterId: "character_ct_mara" } as const;
const MARA_KEY = actorRefKey({ kind: "character", characterId: castId<CharacterId>("character_ct_mara") });

/** A LIVE grants/revokes store: `tracker()` re-resolves Mara's carried set through the ONE carrier predicate on
 *  every read, `patch()` mutates the store from a whole-list `patchSheet` payload. So a persisted grant really
 *  starts carrying on the refetch — the applicability half, not just a payload assertion. */
function grantsStore(): { readonly tracker: () => unknown; readonly patch: (input: unknown) => void } {
  const grants: string[] = [];
  const revokes: string[] = [];
  const defs = GRANT_DEFS;
  const carrier = (): RpgTrackerCarrier => ({ actorKey: MARA_KEY, name: "Mara", kind: "party", grants, revokes });
  return {
    tracker: (): unknown => ({
      ...(trackerView(false) as Record<string, unknown>),
      trackerDefs: defs,
      actors: [
        {
          actorRef: MARA_REF,
          name: "Mara",
          presence: false,
          identity: null,
          sheet: { className: "Warden", attributes: {}, flavor: "", level: null, trackerGrants: [...grants], trackerRevokes: [...revokes] },
          // The server's carrier verdict — the panel renders exactly this, never re-deriving carriage itself.
          trackers: defs.filter((def) => carriesTracker(def, carrier())),
          volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
        },
      ],
    }),
    patch: (input: unknown): undefined => {
      const patch = (input as { readonly patch?: { readonly trackerGrants?: string[]; readonly trackerRevokes?: string[] } }).patch ?? {};
      if (patch.trackerGrants !== undefined) {
        grants.splice(0, grants.length, ...patch.trackerGrants);
      }
      if (patch.trackerRevokes !== undefined) {
        revokes.splice(0, revokes.length, ...patch.trackerRevokes);
      }
    },
  };
}

test("host GRANTS a class-excluded tracker: whole-list patchSheet persists it, and the actor starts carrying it", async ({ mount, page }) => {
  const store = grantsStore();
  const trpc = await stubTakeover(page, { game: d20Game(), liveTracker: store.tracker, patchSheet: store.patch });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const editor = component.locator('[data-slot="rpg-tracker-grants"]');
  await expect(editor).toBeVisible();
  const row = editor.locator('[data-slot="rpg-tracker-grant-row"][data-tracker-key="bound-will"]');
  // At rest: the explicit-empty class excludes her, so she does not carry it (the outcome hint, server truth).
  await expect(row.locator('[data-slot="rpg-tracker-grant-outcome"]')).toHaveText("Doesn't carry");

  // side-eye P3 — the OUTCOME reaches the control, not just the eye. The picker's accessible DESCRIPTION is
  // the badge (aria-describedby → the visible chip), so a screen-reader/keyboard user focusing it hears the
  // resolved carriage and not only the exception state ("By class"). Asserted as the COMPUTED description, so
  // it proves the whole id→describedby→Trigger chain rather than an attribute string.
  const picker = row.getByRole("combobox", { name: "Bound Will access for Mara" });
  await expect(picker).toHaveAccessibleDescription("Doesn't carry");
  // A long host-authored label truncates in this column, so it carries its full text for mouse recovery.
  await expect(row.locator('[data-slot="rpg-tracker-grant-label"]')).toHaveAttribute("title", "Bound Will");

  // Grant it — the Select opens a listbox; pick Granted.
  await picker.click();
  await page.getByRole("option", { name: "Granted" }).click();

  // PERSISTED — the whole-list payload names the grant, revokes stays empty (disjoint by construction).
  await expect.poll(() => trpc.count("rpg.patchSheet"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => trpc.lastInput("rpg.patchSheet"), { intervals: [20, 50, 100] })
    .toMatchObject({ actorRef: { kind: "character", characterId: "character_ct_mara" }, patch: { trackerGrants: ["bound-will"], trackerRevokes: [] } });

  // APPLICABILITY — the post-write refetch re-resolves carriage from the store, so the SETTLED outcome flips.
  await expect(row.locator('[data-slot="rpg-tracker-grant-outcome"]')).toHaveText("Carries");
  // …and the flip reaches the CONTROL's description too — the badge is the description target, so the
  // announced outcome tracks the server verdict instead of going stale at the a11y layer.
  await expect(picker).toHaveAccessibleDescription("Carries");
});

test("host REVOKES a class-included tracker: patchSheet persists the revoke and the actor stops carrying it", async ({ mount, page }) => {
  const store = grantsStore();
  const trpc = await stubTakeover(page, { game: d20Game(), liveTracker: store.tracker, patchSheet: store.patch });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const row = component.locator('[data-slot="rpg-tracker-grants"] [data-slot="rpg-tracker-grant-row"][data-tracker-key="vitality"]');
  // The party class swept her in at rest.
  await expect(row.locator('[data-slot="rpg-tracker-grant-outcome"]')).toHaveText("Carries");

  await row.getByRole("combobox", { name: "Vitality access for Mara" }).click();
  await page.getByRole("option", { name: "Revoked" }).click();

  await expect
    .poll(() => trpc.lastInput("rpg.patchSheet"), { intervals: [20, 50, 100] })
    .toMatchObject({ patch: { trackerGrants: [], trackerRevokes: ["vitality"] } });
  // A revoke beats the class — she stops carrying it on the settled refetch.
  await expect(row.locator('[data-slot="rpg-tracker-grant-outcome"]')).toHaveText("Doesn't carry");
});

test("a MEMBER sees NO grants editor in the takeover — grants are the host's call (PERMISSION-omit)", async ({ mount, page }) => {
  const store = grantsStore();
  await stubTakeover(page, {
    game: d20Game(),
    liveTracker: store.tracker,
    patchSheet: store.patch,
    chat: { ...(gameChat() as Record<string, unknown>), viewerIsHost: false },
  });
  const component = await mount(<RpgTakeoverStory />);
  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();
  await component.getByRole("button", { name: "Open Mara" }).click();

  const detail = component.locator('[data-slot="rpg-character-detail"]');
  await expect(detail).toBeVisible();
  // The takeover renders (a member reads the participants) — but the host-only grants editor is absent, not disabled.
  await expect(detail.locator('[data-slot="rpg-tracker-grants"]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// side-eye 2026-08-16 (#93/#94) — the DOCKED-PANEL width and the coarse hit tree.
//
// Both defects below were invisible to the review that found them, because both were measured with
// `getBoundingClientRect`. A box is not a hit target here: `Button size="inline"` carries its ≥44px coarse
// floor on an OVERFLOWING `::after`, so `HP value`'s 27×18 box was never the claim — and the box also could
// not see that something was PAINTING OVER that pseudo. `elementFromPoint`, walked out from the centre, is
// the only instrument that states either fact (`support/browser/touch-floor.ts` says why at length).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The default participant list with ONE meter on its actor (Vitality) instead of two — see the hit-tree test below
 *  for why the second meter makes that test unfalsifiable. Everything else is `trackerView(false)` verbatim. */
function singleMeterTrackerView(): unknown {
  const base = trackerView(false) as Record<string, unknown>;
  const actors = base["actors"] as readonly Record<string, unknown>[];
  const mara = actors[0] as Record<string, unknown>;
  return {
    ...base,
    actors: [
      {
        ...mara,
        trackers: [VITALITY],
        volatile: { ...(mara["volatile"] as Record<string, unknown>), trackerValues: { vitality: { value: 24, items: null } } },
      },
      ...actors.slice(1),
    ],
    trackerDefs: [VITALITY],
    trackerOrbs: [{ key: "vitality", label: "Vitality", value: 24, max: 30, color: null }],
  };
}

test.describe("coarse touch floor — the meter row's value and its ceiling", () => {
  test.use({ hasTouch: true });

  test("no DECORATION is inside a meter value's touch pseudo — every sample in it lands on a real control", async ({ mount, page }) => {
    // THE DEFECT, measured live at 430×740 DPR3 `pointer:coarse`: `HP value` and `HP max` resolved a 45×37
    // effective target on the ONE control a player reaches for mid-session. The value itself was innocent
    // (its `::after` computed a full 44×44); `MeterRow` stacks the aria-hidden `TrackBar` directly under the
    // value row, and with no z-index that later-painting 6px rail won the bottom of the pseudo
    // (`elementFromPoint` at cy+20 returned `div[data-slot=track-bar]`). Decoration that is out of the a11y
    // tree is now out of the hit tree — the CAUSE, not the symptom: flooring the value changes nothing here.
    //
    // WHY THE CLAIM IS "NO DECORATION IN THE PSEUDO" AND NOT "≥44 ON BOTH AXES". A stacked meter list is a
    // TILED run: neighbours 36px apart CANNOT both own a 44px-tall target, so a raw floor assertion is
    // unsatisfiable here and a pitch assertion is UNFALSIFIABLE — measured, the old occluded reach (36) and
    // the pitch (36) were the same number, so a pitch pin passed on the broken source. What separates the two
    // worlds is WHAT wins the sample: before, a `[data-slot=track-bar]` div; after, only ever this control or
    // a neighbouring one. That is the law being enforced, and it is the thing that changed.
    //
    // AND THE FIXTURE CARRIES ONE METER, NOT TWO, WHICH IS THE WHOLE REASON THIS PIN BITES. With the default
    // two-meter participant list the NEIGHBOURING meter's own pseudo covers the rail's band before the rail can be
    // sampled, so the occluder is unreachable and the pin passes on the broken source (measured, twice — a
    // 5-point sweep AND a full per-pixel sweep). One meter leaves the rail as the only thing under the value,
    // which is the live 430px geometry the defect was found in. The participant list is otherwise untouched.
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stubTakeover(page, { tracker: singleMeterTrackerView() });
    const component = await mount(<RpgTakeoverStory />);
    await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

    // The rail must actually be RENDERED under the value — without it this test cannot fail for its reason.
    await expect(component.locator('[data-slot="meter-row"] [data-slot="track-bar"]').first()).toBeVisible();

    const values = component.getByRole("button", { name: VITALITY_CELLS });
    await expect.poll(async () => await values.count()).toBeGreaterThan(0);

    const floor = await touchFloorPx(page);
    const stolen = await values.evaluateAll(
      (els: HTMLElement[], reach: number): readonly string[] =>
        els
          .flatMap((el) => {
            const box = el.getBoundingClientRect();
            const cx = Math.round(box.left + box.width / 2);
            const cy = Math.round(box.top + box.height / 2);
            const half = Math.floor(reach / 2) - 1;
            // EVERY pixel row of the pseudo's own column, not five samples of it. A 6px rail inside a 44px
            // target occupies about an eighth of the column, so a coarse sample walks straight past the
            // occluder — measured: a 5-point sweep passed against the pre-fix source. Every point inside a
            // control's declared touch target must belong to SOME control; a decoration winning one is the
            // defect, and the slot name it reports is the diagnosis.
            const offsets = Array.from({ length: half * 2 + 1 }, (_unused, i) => i - half);
            return offsets.map((dy) => {
              const hit = document.elementFromPoint(cx, cy + dy);
              if (hit === null) {
                return "";
              }
              return hit.closest("button,a,[data-slot=tabs-tab],[role=switch]") === null ? (hit.getAttribute("data-slot") ?? hit.tagName.toLowerCase()) : "";
            });
          })
          .filter((slot) => slot !== ""),
      floor,
    );
    expect(stolen).toEqual([]);
  });
});

test("side-eye 2026-08-16: at the 384px DOCKED panel no game-rail caption crushes, and the rail scrolls instead", async ({ mount, page }) => {
  // THE HOLE BETWEEN TWO CORRECT ARMS. The rail's fine-pointer answer to a tight rail is the `@max-xs`
  // row-wrap; its coarse answer is `minmax(max-content,1fr)` + scroll. Neither covers a FINE pointer AT or
  // ABOVE `xs` — which is every docked desktop panel. Measured live at 1280px: rail 383px, six `auto-cols-fr`
  // cells at 59px, "Inventory" scrollWidth 48 vs clientWidth 47 ⇒ "Invento…". The fix applies the SAME track
  // sizing the coarse arm already proves correct to that fine range, so the rail degrades to scrolling and
  // never into an ellipsis.
  //
  // HONEST LABEL — a FENCE at this width, not the defect proof, and the demotion is measured: it PASSES
  // against the pre-fix source. The CT harness's font metrics are not the app's (the kit's own warning), so
  // "Inventory" fits a 59px cell here where it overflowed by 1px live. The DEFECT PROOF is the live
  // measurement (caption scrollWidth 48 / clientWidth 47 at a 1280px window) and its live re-measurement
  // after the fix; what this pin buys is that the docked width — the most common mount, and the one width
  // neither existing rail CT covered — can never regress into a wrap or a clip unnoticed.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverDockedStory />);
  const list = component.getByRole("toolbar", { name: "Game state" });
  await expect(list.getByRole("button")).toHaveCount(6);

  // ONE row at this width (the wrap arm is for the narrower FLOOR story) — so this is genuinely the range
  // neither arm covered, not the row-wrap being re-tested at a new width.
  const boxes = await Promise.all((await list.getByRole("button").all()).map((tab) => tab.boundingBox()));
  expect(new Set(boxes.map((box) => Math.round(box?.y ?? 0))).size).toBe(1);

  // NO caption is truncated — the whole point. `+1` absorbs sub-pixel rounding, exactly as the FLOOR pin does.
  const clipped = await list.locator('[data-slot="context-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
});

test("side-eye 2026-08-16: the PHASE-lock glyph keeps a gutter off the pane's own edge", async ({ mount, page }) => {
  // The rail is full-bleed by ruling (§5.2 — it is the pane's floor and reaches its edges), which makes the
  // LAST cell's inline-end edge the PANE's edge. Measured live at 1280px the Map cell's lock glyph ran
  // x 1268..1280, ending exactly on the viewport edge — it read as a clipped glyph rather than as a lock.
  // The gutter is bought INSIDE the cell so the full-bleed ruling stands. Asserted as rendered geometry
  // against the resolved token, never a hardcoded px.
  await stubTakeover(page);
  const component = await mount(<RpgTakeoverDockedStory />);
  const mapTab = component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Map" });
  await expect(mapTab).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.width = "var(--spacing-field)";
          document.body.append(probe);
          const px = probe.getBoundingClientRect().width;
          probe.remove();
          return px;
        }),
    )
    .toBeGreaterThan(0);
  const field = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-field)";
    document.body.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  });
  await expect
    .poll(
      async () =>
        await mapTab.evaluate((tab: HTMLElement): number => {
          const glyph = tab.querySelector("svg:last-of-type");
          if (glyph === null) {
            return Number.NaN;
          }
          return Math.round(tab.getBoundingClientRect().right - glyph.getBoundingClientRect().right);
        }),
    )
    .toBeGreaterThanOrEqual(Math.round(field) - 1);
});

// ── #149: THE HUD BAND RESERVES ITS BOX WHILE THE TRACKER READ IS IN FLIGHT ──────────────────────────
//
// The band suspends on `rpg.getTrackerView` behind its OWN boundary, and that boundary's fallback was
// `null` — so the band opened as a bare 2px rule and then grew ~120-192px when the read landed, shoving the
// game rail, the viewport and every tab body down. MEASURED by side-eye-tracker 2026-08-17: a
// `nonVirtualizedCls` contribution of 0.1143 on room open, and at a coarse pointer
// `[cls] shift 0.1056 unexpected … OVER BUDGET` — the one over-budget unexpected shift on the surface.
//
// The band's settled height is DATA-dependent (trackers, orbs, cast chips), so this is the box-memory class
// of fix (home tiles' `useSurfaceBox`): this device's own last measurement, or — on a first-ever open, which
// is what this test drives — an ESTIMATE at the top of the measured range. The estimate over-reserves on
// purpose: what lands is then a SHRINK, and #129-R1 ruled shrink beats push.
//
// Asserted through rendered geometry with the read HELD OPEN, which is the only state where the defect
// exists — a settled band looks identical before and after the fix.

const HUD_BAND = '[data-slot="rpg-hud-band"]';
// #885 folded the band's bespoke reservation into `QueryBoundary.reserveKey` — the reserved box is the
// boundary's own wrapper now, under the shared `data-tile-reserved` vocabulary (source "declared" is the
// renamed "estimate" arm: a declared px constant, not this device's measurement).
const HUD_BAND_RESERVATION = `${HUD_BAND} [data-tile-reserved]`;

test("#149 the band holds its box open while `getTrackerView` is in flight, and the read SHRINKS it — never pushes", async ({ mount, page }) => {
  const tracker = trpcHold();
  await stubTakeover(page, { tracker });

  const component = await mount(<RpgTakeoverStory />);
  const band = component.locator(HUD_BAND);
  await expect(band).toBeVisible();

  // IN FLIGHT: the reservation is what is holding the band open, and it says WHICH source held it — a
  // first-ever open has no measurement, so this is the declared estimate (`data-tile-reserve-source`).
  const reservation = component.locator(HUD_BAND_RESERVATION);
  await expect(reservation).toBeVisible();
  await expect(reservation).toHaveAttribute("data-tile-reserve-source", "declared");
  const pending = await band.evaluate((el) => el.getBoundingClientRect().height);

  tracker.release(trackerView(false));
  // SETTLED: the reservation is gone (the real band replaced it), and the band did not grow into the rail
  // below it. Pre-fix the pending band was chrome-only and this delta was the whole ~120-192px jump.
  await expect(reservation).toHaveCount(0);
  await expect.poll(async () => await band.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(pending);
});

// ── #1500 · THE JOURNAL'S CARD SCOPE IS A PROJECTION OVER TWO READS ──────────────────────────────
// The Journal archives the SAME cards the Scene home births, through the same `collectArchivedCards` over
// the same `chat.listMessages` cache — and it collapsed a failed transcript read into the same empty array
// as a game that has crafted nothing, so the scope said "No cards yet — the story crafts them." about a
// transcript it had failed to read. Pinned at the takeover, which is this tab's only mount.
test("Journal ▸ Cards: a FAILED transcript read never says 'No cards yet' (#1500)", async ({ mount, page }) => {
  await stubTakeover(page, { game: cardsGame(), messages: trpcError({ message: "transcript read failed" }) });
  const component = await mount(<RpgTakeoverStory />);

  await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Journal" }).click();
  await component.getByRole("button", { name: "Cards" }).click();

  await expect(component.getByText("Couldn't load the card archive.")).toBeVisible();
  await expect(component.getByText("No cards yet", { exact: false })).toHaveCount(0);
});

// ── #869 · A COARSE TAP LANDS ON THE DATUM YOU CAN SEE ────────────────────────────────────────────────
// Every editable value on a Status card is `Button size="inline"` — an ~18px text-height box whose 44px
// coarse target rides an OVERFLOWING `::after` (layout-neutral by design, so the click-to-edit swap is
// pixel-stable). Stack two of those closer than 44px and the LOWER one's pseudo, painted later, takes every
// pixel it overlaps — including the pixels the upper control paints its DATUM on.
//
// MEASURED here at 430 coarse on a just-started game (status line directly above `+ condition`, `gap-field`
// between them), against the source before the fix: `Mara Status line` owned **yExtent=23, xExtent=1** — one
// column of pixels — because `+ condition` is a full-width control whose 44x198 pseudo covered the row above
// it. Tapping the visible `—` opened the ADD-CONDITION editor. The populated card was the same defect one
// row down: `Mara Vitality value` owned yExtent=36, its bottom band resolving to `Mara Resolve value`.
//
// The #863 review filed this as an ASYMMETRIC pseudo (`inset: 6.56 -32.33 -37.44 11.67`) — that reading is
// refuted here: `top:50%` + `-translate-y-1/2` centres the pseudo exactly, and that inset pair is the same
// centring read BEFORE the transform (a floored row measures the identical numbers while owning a symmetric
// 44). The defect was PITCH. The fix is `VALUE_ROW_TOUCH_FLOOR_AT_COARSE` on the ROW (never on the value —
// a 44px rest button breaks the no-shift rule `tracker-value.tsx` states), so each pseudo fits its own band.
//
// BOTH FIXTURES RUN, because they are different geometries: the bare card is the pair the owner meets on the
// first turn of a new game, the populated one is the meter stack. Extents come from `hitExtent`'s
// `elementFromPoint` walk, never a bounding box — the box is 18px tall in every arm, pass or fail.
test.describe("#869 — the coarse tap on a visible tracker datum", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  /** A just-started game's card: no trackers written, no conditions — a status line above `+ condition`. */
  function bareCardTrackerView(): unknown {
    const base = trackerView(false) as Record<string, unknown>;
    const mara = (base["actors"] as Record<string, unknown>[]).filter((a) => a["name"] === "Mara");
    return { ...base, actors: mara.map((a) => ({ ...a, trackers: [], volatile: { ...(a["volatile"] as object), trackerValues: {}, conditions: [] } })) };
  }

  for (const arm of [
    { name: "a just-started card (status line above `+ condition`)", tracker: bareCardTrackerView, values: 2 },
    { name: "a populated card (two meter rows above `+ condition`)", tracker: (): unknown => trackerView(false), values: 6 },
  ]) {
    test(`every editable value owns the coarse touch floor on BOTH axes — ${arm.name}`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await stubTakeover(page, { tracker: arm.tracker() });
      const component = await mount(<RpgTakeoverStory width={430} height={860} />);
      await component.getByRole("toolbar", { name: "Game" }).getByRole("button", { name: "Status" }).click();

      // SETTLED barrier: the card has painted its whole control set before any geometry is read.
      await expect(component.locator('[data-slot="rpg-status-card"]')).toHaveCount(1);
      const values = component.locator('[data-slot="tracker-value-rest"]');
      await expect(values).toHaveCount(arm.values);

      const floor = await touchFloorPx(page);
      await expect
        .poll(async () => {
          const boxes = await hitBoxes(values, arm.values);
          return boxes.map((box, index) => ({ index, x: box.x, y: box.y })).filter((box) => box.x < floor || box.y < floor);
        })
        .toEqual([]);
    });
  }
});
