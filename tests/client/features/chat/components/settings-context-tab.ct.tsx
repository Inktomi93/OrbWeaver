// CT: the consolidated "This chat" CONTEXT tab (settings-context-tab.tsx, panel-redesign) mounted DIRECTLY
// as the component — its OWN section-composition contract, distinct from chats-section.ct's registry-resolve
// matrix. Pins: Field overrides + Injections + (host+group) Group behavior render as real h3 sections; the
// "Group behavior" section is ABSENT for a non-host and ABSENT for a solo roster while "Field overrides"
// persists; the section headings are real h3s with the right accessible names (the settings-modal idiom).
// The committed arm routeTrpc-stubs `chat.getGroupConfig` (the Group-behavior section's suspense read) +
// `chat.setRoomOverrides` + `chat.listChatInjections` (the folded-in Injections section's read); the draft
// arm is store-backed (no network).

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_CHAT_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { HOST_BAND, openContextSections } from "../../../../support/node/open-context-sections.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { setNumber } from "../../../../support/node/set-number.ts";
import { CommittedSettingsTabStory } from "../_ct-stories.tsx";

// The getChat stub the host-only Tool-use section suspends on (⑦). `toolRecurseLimit` is the current cap the
// control displays; `viewerIsHost` mirrors the story's isHost. Minimal — the section only reads the cap.
const CHAT_DETAIL = { id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] };

// The Macro-picks section's own suspense read (#24) — this tab is its production mount, so every committed
// arm must stub it or the section's boundary would swallow the failure and the tab's composition contract
// would silently stop covering it. Empty declarations = the section's teaching empty state.
const EMPTY_PICKS = { macros: [], values: {} };

// The two injections the #821 fence releases — one at-depth, one before-prompt, both carrying content (so
// both rows arrive COLLAPSED, which is the settled state the reserve is measured against).
const HELD_INJECTIONS = [
  { id: "injection_ct_1", position: "in_chat", depth: 2, role: "system", content: "The tavern is on fire." },
  { id: "injection_ct_2", position: "before_prompt", depth: 0, role: "system", content: "Keep replies under 120 words." },
];

// The Macro-picks section's SECOND suspense read (`chat.getVariablePicks`, macro-picks-section.tsx:289 —
// the pane is one section over TWO knob families, read in parallel by `useSuspenseQueries`). #629: this
// file stubbed only the first, so the section threw on `null` in EVERY test here and sat in its
// QueryBoundary's error arm — invisible, because the "Macro picks" heading is the Section kicker OUTSIDE
// the boundary and that is all the assertions read. NON-EMPTY on purpose: an empty declaration renders
// the teaching gloss whether or not the reads landed, so only a declared knob's rendered CONTROL proves
// the section's real body is alive in this composition.
const POV_VARIABLE = {
  name: "pov",
  question: "Narration POV",
  options: [
    { label: "First", value: "first person" },
    { label: "Third", value: "third person" },
  ],
  defaultValue: "third person",
  multiSelect: false,
  separator: ", ",
  randomPick: false,
};
const VARIABLE_PICKS = { variables: [POV_VARIABLE], values: {} };

// `settings.getUserSettings` — read by FOUR consumers under this tab, and the reason this stub is spelled
// from the contract rather than by hand. `UserSettingsView.config` is ALWAYS the parsed+defaulted
// `UserSettings` (server/domain/settings/contract/views.ts:11 — "never a raw blob"), and the consumers here
// split on whether they tolerate a hole: `useChatBehaviorPrefs` and `useSlotState` read `config.chat` /
// `config.seeds` through a `??` fallback, but `BackgroundTileGrid` (background-source-field.tsx:130, the
// Background section's grid) reads `data.config.appearance.backgroundLibrary` STRAIGHT — so a hand-written
// partial config threw on `undefined.backgroundLibrary` and put that section in its QueryBoundary's error
// arm. That is what #1014 was: a stubbed-but-CONTRACT-INCOMPLETE payload, invisible to `trpc.unstubbed()`
// (the read was stubbed) and caught only by the #629 no-error-arm pin below. `DEFAULT_USER_SETTINGS` is
// the contract's own `userSettingsSchema.parse({})`, and its defaults are exactly the arm these tests were
// already asserting: `seeds.defaultPresetId: null` (this room's host runs the built-in preset, so the
// Documents section resolves the built-in prompt config) and an EMPTY `appearance.backgroundLibrary` (the
// Background grid renders None + the seeded plates).
const USER_SETTINGS = { config: DEFAULT_USER_SETTINGS };

// The Documents section's own suspense read (S2, D-4) — this tab is its production mount, so every
// committed arm must stub it or the section's boundary would swallow the failure and the tab's composition
// contract would silently stop covering it (the EMPTY_PICKS precedent one line up). One row, so the
// heading's count chip has something to count; the row's own behavior is chat-documents-section.ct's.
const ACTIVE_DOCUMENTS = [
  {
    id: "document_00000000000000000001",
    name: "The Crimson Court",
    mime: "text/markdown",
    origin: "text",
    sourceUrl: null,
    byteSize: 25_088,
    charCount: 4200,
    chunkCount: 12,
    embeddedCount: 12,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    hidden: false,
    sources: ["chat"],
  },
];

// The World books section's own suspense read (#640) — this tab is its production mount, so every arm must
// stub it or the section's boundary swallows the failure and the tab's composition contract silently stops
// covering it (the ACTIVE_DOCUMENTS precedent two blocks up). `worldInfo.listForChat` is member-read and NOT
// owner-filtered, so host and member arms get the identical rows.
const ROOM_BOOKS = [{ id: "worldbook_ct_0000000000001", name: "Ashfall Canon", description: null, createdAt: 1_700_000_000_000, role: null }];

// The picker's own read (`worldInfo.listBooks` — the caller's whole library, unpaged). Only the tests that
// OPEN the picker need it: a closed FormDialog never mounts its body, which is why the arms above can stay
// green with `trpc.unstubbed()` empty. Two books: one already attached (subtracted by `attachableBooks`) and
// one genuinely offerable, so the offer set is a real subtraction rather than a pass-through.
const OWNED_BOOKS = [
  { id: "worldbook_ct_0000000000001", name: "Ashfall Canon", description: null, createdAt: 1_700_000_000_000 },
  { id: "worldbook_ct_0000000000002", name: "Session Notes", description: "Running notes", createdAt: 1_700_000_000_001 },
];

// The Regex section's reads (#1742) — this tab is its production mount, so EVERY arm stubs them or the
// #629 unfed-read census below reds. The section is CLOSED by default, so only the KICKER's non-suspending
// count read fires until a test opens it; the body's reads are here too because three tests do open it.
// Host and member read DIFFERENT procs (`chat.listEffectiveRegex` is host-gated, D19), which is why both
// are stubbed in every arm — a member-only gap would otherwise hide behind the host stub.
const CT_SCRIPT = {
  id: "regex_script_ct_0001",
  name: "Strip OOC",
  enabled: true,
  updatedAt: 1_700_000_000_000,
  findRegex: "\\(OOC:[^)]*\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: "none",
};
const EFFECTIVE_REGEX = {
  enabled: true,
  tiers: [
    { scope: "global", allowed: true, rows: [{ script: CT_SCRIPT, position: 0, runsAt: 1, attachedElsewhere: false }] },
    { scope: "preset", allowed: true, rows: [] },
    { scope: "chat", allowed: true, rows: [] },
  ],
  effective: [{ scriptId: CT_SCRIPT.id, runsAt: 1 }],
};
const REGEX_READS = {
  "chat.listEffectiveRegex": () => EFFECTIVE_REGEX,
  "regex.listForChat": () => [],
  "regex.listScripts": () => [CT_SCRIPT],
  "regex.listRoomDisplayScripts": () => [],
} as const;

test("committed host + group: BOTH sections render as h3 headings", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND, "Macro picks");

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
  // Macro picks (#24) — member-reachable, so it renders for host and non-host alike. The heading is the
  // Section kicker, which renders OUTSIDE the boundary, so it is NOT evidence the section works (#629) —
  // the declared variable's rendered control is.
  await expect(component.getByRole("heading", { name: "Macro picks", level: 3 })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "Narration POV" })).toBeVisible();
});

// #629 — THE FILE'S OWN HONESTY PIN, and the one test here that would have caught the year's quietest
// class: a section whose reads are unstubbed renders its heading and an error body, so a heading-only
// assertion passes while the subject never mounts. Two claims, both about the WHOLE composition rather
// than one section, so a section added to the tab tomorrow with an unfed read reds HERE:
//   1. no boundary anywhere in the tab fell into `QueryErrorState` ("Couldn't load …" — the house's ONE
//      read-error surface, query-error-state.tsx), and
//   2. the mounted tree requested nothing this file failed to stub (`trpc.unstubbed()`, route-trpc.ts).
// Both arms run for the HOST tree (every section) and the MEMBER tree (the permission-omitted subset —
// a different read set, so a member-only gap could hide behind a host-only stub).
for (const arm of [
  { isHost: true, showGroup: true, label: "host + group (every section)" },
  { isHost: false, showGroup: false, label: "member (the permission-omitted subset)" },
] as const) {
  test(`#629 ${arm.label}: every section renders its real body — no unfed read, no error arm`, async ({ mount, page }) => {
    const trpc = await routeTrpc(page, {
      "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
      "chat.setRoomOverrides": () => ({}),
      "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
      "worldInfo.listForChat": () => ROOM_BOOKS,
      "chat.listChatInjections": () => [],
      "chat.getUserMacroPicks": () => EMPTY_PICKS,
      "chat.getVariablePicks": () => VARIABLE_PICKS,
      "settings.getUserSettings": () => USER_SETTINGS,
      ...REGEX_READS,
      "chat.getChat": () => CHAT_DETAIL,
    });

    const component = await mount(<CommittedSettingsTabStory isHost={arm.isHost} showGroup={arm.showGroup} />);
    await openContextSections(component, "Injections", "Documents", "World books", "Regex", "Macro picks", ...(arm.isHost ? [HOST_BAND] : []));

    // Barrier on a SETTLED body of the last-declared section in this arm, so the assertions below are not
    // read while boundaries are still in their skeleton fallback (a pending boundary shows neither the
    // error text nor the control, and would pass both arms vacuously).
    // #640 moved the member arm's last-declared section: World books now sits after Documents, so the barrier
    // is that section's own settled row rather than the documents rack's.
    const settled = arm.isHost ? component.getByRole("textbox", { name: "Tool rounds per turn" }) : component.getByText("Ashfall Canon");
    await expect(settled).toBeVisible();

    // Cause first, symptom second: an unfed read names ITSELF here, instead of surfacing three sections
    // later as "a control is missing".
    expect(trpc.unstubbed()).toEqual([]);
    await expect(component.getByText("Couldn't load", { exact: false })).toHaveCount(0);
    await expect(component.getByRole("combobox", { name: "Narration POV" })).toBeVisible();
  });
}

// The Group-behavior section's suspense read (chat.getGroupConfig) held pending: the QueryBoundary
// fallback must be the shape-matched skeleton (house loading law, UIP-309 / UI-Arch §4.3 rule 7), never
// the old spinner/text void.
//
// #629 — THIS TEST WAS ASSERTING THE OPPOSITE OF ITS CLAIM, AND PASSING. It hung the read with a bare
// `page.route` registered BEFORE routeTrpc, "so it wins the match". Playwright matches routes in REVERSE
// registration order, so routeTrpc — registered second — won every time: `chat.getGroupConfig` was never
// in its route table, it got the lenient `null` fulfil, and the section sat in its ERROR arm. The
// "a skeleton is visible" assertion then passed on a DIFFERENT section's boundary (`.first()` over the
// whole tab), and "Loading group settings…" being absent was vacuously true of an error body. Found by
// the reporter's unfed-read census, which recorded getGroupConfig reaching routeTrpc at all.
//
// `trpcHold()` is the supported valve (route-trpc.ts, written for exactly this): it holds the REQUEST, so
// `hold.requested` is a deterministic barrier — the read is provably in flight and the boundary provably
// in its fallback — and the pending arm is a stable state, never a flash to be caught. The hold suspends
// the whole BATCH (one HTTP response per batch), so sibling sections skeleton too; every assertion below
// is therefore scoped to the Group-behavior section itself rather than to the tab.
test("committed host + group: the Group-behavior section shows a skeleton (never a spinner void) while loading", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.getGroupConfig": hold,
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);

  // The barrier: the request has REACHED the stub and is being held, so what follows reads a settled
  // pending state rather than racing a fallback that may already have resolved.
  await hold.requested;

  // The Group-behavior section itself — `.last()`, because the enclosing "Host controls" <section> also
  // contains this text and comes first in document order. Scoping is the whole point: the old `.first()`
  // over the tab could be satisfied by any other section's boundary.
  const groupSection = component.locator("section").filter({ hasText: "Group behavior" }).last();
  await expect(groupSection.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
  const busy = groupSection.locator('[aria-busy="true"]').first();
  await expect(busy).toBeVisible();
  await expect(busy.locator('[data-slot="skeleton"]').first()).toBeVisible();
  // The old text-only fallback is gone.
  await expect(component.getByText("Loading group settings…")).toHaveCount(0);
  // …and this is the LOADING arm, not the ERROR arm wearing its clothes — the exact substitution that hid
  // here for weeks (#629). `renderError` for this boundary is QueryErrorState label="group settings".
  await expect(component.getByText("Couldn't load group settings.")).toHaveCount(0);

  // Release: the fallback must be TRANSIENT. A pending arm that never resolves would satisfy every
  // assertion above and still be a broken section.
  hold.release({ ...DEFAULT_GROUP_CONFIG });
  await expect(groupSection.getByRole("switch", { name: "Label each speaker" })).toBeVisible();
  await expect(busy).toHaveCount(0);
});

test("committed non-host: Group behavior is ABSENT, Field overrides persists (read-only)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // The §8.1 host-only omit is at SECTION level — the overrides field is present but disabled for a member.
  // The field is a collapse-until-needed row: expand Main prompt, then the (disabled) editor is reachable.
  await component.getByRole("button", { name: "Main prompt" }).click();
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeDisabled();
});

test("committed host + SOLO (non-group): Group behavior is ABSENT, Field overrides persists", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  // A host of a NON-group chat: showGroup=false (resolveIsGroupChat is false at <2 cast) — the section is
  // omitted even though the viewer is host (the gate is host AND group, both required).
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, HOST_BAND);

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // Host copy — the overrides field is editable for the host (expand the collapse row to reach the editor).
  await component.getByRole("button", { name: "Main prompt" }).click();
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeEnabled();
});

// ⑦ — the per-chat tool-call recursion cap control (Phase A L3 client half). Host-only (the §8.1
// permission-OMIT): the host sees + edits it; a member never sees the section (the Group-section precedent).
const UPDATE_TOOL_LIMIT = "chat.setToolRecurseLimit";

function stubToolUse(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_TOOL_LIMIT]: () => ({}),
  });
}

test("⑦ host: the Tool-use section renders the cap control seeded from getChat.toolRecurseLimit", async ({ mount, page }) => {
  await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Tool rounds per turn" })).toHaveValue("7"); // CHAT_DETAIL.toolRecurseLimit
});

test("⑦ host: editing the cap fires chat.setToolRecurseLimit with the new limit", async ({ mount, page }) => {
  const trpc = await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);
  await setNumber(component.getByRole("textbox", { name: "Tool rounds per turn" }), "10");
  await expect.poll(() => (trpc.lastInput(UPDATE_TOOL_LIMIT) as { limit?: number } | undefined)?.limit, { intervals: [20, 50, 100] }).toBe(10);
});

test("⑦ member: the Tool-use section is ABSENT (host-only omit — a member sees no control)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toHaveCount(0);
  // Role-agnostic on purpose: an ABSENCE assertion keyed to `spinbutton` would go blind the day the control
  // becomes an @orb/ui NumberField (Base UI renders those as a TEXTBOX, never a spinbutton).
  await expect(component.getByLabel("Tool rounds per turn")).toHaveCount(0);
});

// #1742 — THE REGEX SECTION'S PLACE IN THIS TAB, and the disclosure it retired. Three claims, all about the
// COMPOSITION rather than the section's own behavior (that is `regex-section.ct.tsx`):
//   1. it is a real h3 disclosure, CLOSED, sitting with the member-readable racks — after World books, before
//      Macro picks (the run of headings is read in document order, so a re-ordering reds here);
//   2. `Host controls › Appearance` is GONE — its one control moved into the section, and a tab that kept
//      both would have two homes for the display-script switch;
//   3. the closed kicker says `off` under a master off, which is the #1742 §7.4 rule: a bare count would
//      hide the master's state on the panel's face.
test("host: Regex is a closed h3 disclosure between World books and Macro picks, and Appearance is GONE", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  const trigger = component.getByRole("button", { name: /^Regex/u });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // `innerText` applies the kicker voice's own text-transform, so the run of names reads UPPERCASE here.
  // POLLED, never one-shot: the sections settle as their count reads land (the DEF-14 class).
  const sectionNames = async (): Promise<readonly string[]> =>
    (await component.getByRole("heading", { level: 3 }).allInnerTexts()).map((text) => text.trim().toUpperCase().split(/\s/u)[0] ?? "");
  await expect.poll(sectionNames, { intervals: [20, 50, 100, 250] }).toContain("REGEX");
  const names = await sectionNames();
  expect(names).toContain("WORLD");
  expect(names.indexOf("REGEX")).toBe(names.indexOf("WORLD") + 1);
  expect(names.indexOf("MACRO")).toBe(names.indexOf("REGEX") + 1);
  await expect(component.getByRole("heading", { name: "Appearance", level: 3 })).toHaveCount(0);
});

test("host: the closed Regex kicker says `off` when the room's master is off (never a bare count)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.listEffectiveRegex": () => ({ ...EFFECTIVE_REGEX, enabled: false, effective: [] }),
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("button", { name: /^Regex/u })).toHaveText(/off/u);
});

// D121-E — the "share my display scripts" host switch. It MOVED (#1742): it used to be the whole body of
// `Host controls › Appearance`, and it now closes the Regex section's `On screen` group, beside the display
// scripts it governs. So these three pins walk to `Regex`, not to `HOST_BAND` — the switch's behavior is
// unchanged and its host-only omit (the §8.1 permission-OMIT, the Tool-use precedent) is unchanged with it.
const UPDATE_HOST_DISPLAY_SCRIPTS = "chat.setHostDisplayScripts";

function stubHostDisplayScripts(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_HOST_DISPLAY_SCRIPTS]: () => ({}),
  });
}

test("host: the display-scripts switch renders seeded from getChat.hostDisplayScripts (off)", async ({ mount, page }) => {
  await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, "Regex");
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).not.toBeChecked();
});

test("host: toggling the switch fires chat.setHostDisplayScripts with the new state", async ({ mount, page }) => {
  const trpc = await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, "Regex");
  await component.getByRole("switch", { name: "Show my display scripts to everyone" }).click();
  await expect.poll(() => (trpc.lastInput(UPDATE_HOST_DISPLAY_SCRIPTS) as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(true);
});

test("member: the display-scripts switch is ABSENT (host-only omit — a member sees no control)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).toHaveCount(0);
});

// B1 — the per-room "Offer choices" host switch (Host controls group). Two things are pinned that the
// display-scripts precedent above does not have to care about: the room's value is TRI-STATE (a room that
// has never been pinned inherits the host's per-user default, so the switch's seated state is a function of
// TWO reads, not one), and the write is a host-only mutation like its neighbours.
const UPDATE_OFFER_CHOICES = "chat.setOfferChoices";
const OFFER_CHOICES_SWITCH = { name: "Offer choices" } as const;

/** The tab's stubs with the two reads the offer-choices switch resolves from made explicit. */
function stubOfferChoices(page: Page, room: boolean | null, userDefault: boolean): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    // Same contract rule as USER_SETTINGS: `config.chat` is a WHOLE `ChatSettings`, so the arm's one knob
    // rides the contract defaults rather than replacing the section with a one-key object.
    "settings.getUserSettings": () => ({ config: { ...USER_SETTINGS.config, chat: { ...DEFAULT_CHAT_SETTINGS, offerChoices: userDefault } } }),
    ...REGEX_READS,
    "chat.getChat": () => ({ ...CHAT_DETAIL, offerChoices: room }),
    [UPDATE_OFFER_CHOICES]: () => ({}),
  });
}

// THE INHERIT ARM, and it is the one worth having: a room nobody has pinned (`offerChoices: null`) must show
// the host's OWN default, because that is genuinely what its next turn will do. A switch that hard-coded
// `false` here would look right in every other test and lie to exactly the user who set a default.
for (const arm of [
  { room: null, userDefault: true, checked: true, label: "never pinned + host default ON ⇒ on (inherit)" },
  { room: null, userDefault: false, checked: false, label: "never pinned + host default OFF ⇒ off (inherit)" },
  { room: false, userDefault: true, checked: false, label: "pinned OFF beats a host default of ON" },
  { room: true, userDefault: false, checked: true, label: "pinned ON beats a host default of OFF" },
] as const) {
  test(`host: the offer-choices switch seats from room-over-default — ${arm.label}`, async ({ mount, page }) => {
    await stubOfferChoices(page, arm.room, arm.userDefault);
    const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
    await openContextSections(component, HOST_BAND);
    const control = component.getByRole("switch", OFFER_CHOICES_SWITCH);
    // Barrier on the SETTLED control before reading its state — a boundary still in its skeleton renders no
    // switch at all, and an unbarriered state read would be vacuous. `aria-checked` rather than a branched
    // `toBeChecked()`: ONE unconditional assertion, and it names the value the arm expects.
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute("aria-checked", String(arm.checked));
  });
}

test("host: toggling the offer-choices switch fires chat.setOfferChoices with the new state", async ({ mount, page }) => {
  const trpc = await stubOfferChoices(page, false, false);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);
  await component.getByRole("switch", OFFER_CHOICES_SWITCH).click();
  await expect.poll(() => (trpc.lastInput(UPDATE_OFFER_CHOICES) as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(true);
});

test("member: the offer-choices switch is ABSENT (host-only omit — this key steers the room's model)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await openContextSections(component, "World books");
  // Barrier on the member tree's last settled section before the absence read (the #629 lesson).
  await expect(component.getByText("Ashfall Canon")).toBeVisible();
  await expect(component.getByRole("switch", OFFER_CHOICES_SWITCH)).toHaveCount(0);
});

// B7 — the two reaction switches (the Reactions section of the host band): the plane's master
// (`reactionsEnabled`, per-user default ON) + the react-tool opt-in (`charactersCanReact`, per-user
// default OFF). The offer-choices shape verbatim — tri-state room value over the host's own default,
// through the ONE contracts resolvers — with the OPPOSITE default directions pinned, because that
// asymmetry is the design (B6 shipped ON and stays disableable; an autonomous AI reacting is opt-in).
const UPDATE_REACTIONS_ENABLED = "chat.setReactionsEnabled";
const UPDATE_CHARACTERS_CAN_REACT = "chat.setCharactersCanReact";
const REACTIONS_SWITCH = { name: "Reactions", exact: true } as const;
const CHAR_REACT_SWITCH = { name: "Characters can react" } as const;

/** The tab's stubs with the reads BOTH reaction switches resolve from made explicit. */
function stubReactionToggles(
  page: Page,
  args: {
    readonly room: { readonly reactionsEnabled: boolean | null; readonly charactersCanReact: boolean | null };
    readonly userDefaults: { readonly reactionsEnabled: boolean; readonly charactersCanReact: boolean };
  },
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => ({ config: { ...USER_SETTINGS.config, chat: { ...DEFAULT_CHAT_SETTINGS, ...args.userDefaults } } }),
    ...REGEX_READS,
    "chat.getChat": () => ({ ...CHAT_DETAIL, ...args.room }),
    [UPDATE_REACTIONS_ENABLED]: () => true,
    [UPDATE_CHARACTERS_CAN_REACT]: () => true,
  });
}

// THE SHIPPED-DEFAULTS ARM leads (both rooms never pinned, both user defaults untouched): the master
// seats ON and the opt-in seats OFF — the asymmetry a single shared default constant would erase.
for (const arm of [
  {
    room: { reactionsEnabled: null, charactersCanReact: null },
    userDefaults: { reactionsEnabled: true, charactersCanReact: false },
    master: true,
    optIn: false,
    label: "shipped defaults ⇒ master ON, opt-in OFF",
  },
  {
    room: { reactionsEnabled: null, charactersCanReact: null },
    userDefaults: { reactionsEnabled: false, charactersCanReact: true },
    master: false,
    optIn: true,
    label: "flipped user defaults inherit (never pinned)",
  },
  {
    room: { reactionsEnabled: false, charactersCanReact: true },
    userDefaults: { reactionsEnabled: true, charactersCanReact: false },
    master: false,
    optIn: true,
    label: "pinned room values beat both defaults",
  },
] as const) {
  test(`host: the reaction switches seat from room-over-default — ${arm.label}`, async ({ mount, page }) => {
    await stubReactionToggles(page, { room: arm.room, userDefaults: arm.userDefaults });
    const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
    await openContextSections(component, HOST_BAND);
    const master = component.getByRole("switch", REACTIONS_SWITCH);
    await expect(master).toBeVisible();
    await expect(master).toHaveAttribute("aria-checked", String(arm.master));
    await expect(component.getByRole("switch", CHAR_REACT_SWITCH)).toHaveAttribute("aria-checked", String(arm.optIn));
  });
}

test("host: each reaction switch fires ITS OWN verb with the new state", async ({ mount, page }) => {
  const trpc = await stubReactionToggles(page, {
    room: { reactionsEnabled: null, charactersCanReact: null },
    userDefaults: { reactionsEnabled: true, charactersCanReact: false },
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);
  await component.getByRole("switch", REACTIONS_SWITCH).click();
  await expect.poll(() => (trpc.lastInput(UPDATE_REACTIONS_ENABLED) as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(false);
  await component.getByRole("switch", CHAR_REACT_SWITCH).click();
  await expect.poll(() => (trpc.lastInput(UPDATE_CHARACTERS_CAN_REACT) as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(true);
});

test("member: NEITHER reaction switch exists (host-only omit — one gates their writes, one the room's prompt)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await openContextSections(component, "World books");
  // Barrier on the member tree's last settled section before the absence reads (the #629 lesson).
  await expect(component.getByText("Ashfall Canon")).toBeVisible();
  await expect(component.getByRole("switch", REACTIONS_SWITCH)).toHaveCount(0);
  await expect(component.getByRole("switch", CHAR_REACT_SWITCH)).toHaveCount(0);
});

// The at-a-glance kicker-count chips (panel-redesign): a "N set" chip on Field overrides (count of set
// override fields, from the roomOverrides prop) and a "N" chip on Injections (from listChatInjections).
test("count chips: Field overrides shows 'N set' and Injections shows its count when non-empty", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [
      { id: "inj_1", position: "in_prompt", role: "system", depth: 0, content: "a" },
      { id: "inj_2", position: "in_chat", role: "system", depth: 3, content: "b" },
    ],
    // #629: this arm stubbed NEITHER Macro-picks read, so the section error-armed here too.
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  // Two set override fields (mainPrompt + scenario) → "2 set"; two injections → "2".
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} roomOverrides={{ mainPrompt: "hi", scenario: "there" }} />);

  await expect(component.getByRole("heading", { name: "Field overrides 2 set", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections 2", level: 3 })).toBeVisible();
});

test("count chips: no chip when nothing is set (a '0' chip would be noise)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  // The heading names are the bare labels — no trailing count (substring match would still hit "Field
  // overrides", so assert the exact name has no chip suffix via the accessible name).
  await expect(component.getByRole("heading", { name: "Field overrides", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections", exact: true, level: 3 })).toBeVisible();
});

// ── SIDE-EYE 08-01 F8: THE PANE'S OWN VOICE, AND THE D-1 HOST-OPS GROUP ───────────────────────────────

test("F8: the section names speak the INSTRUMENT tier's kicker voice, not the form tier's h3 title", async ({ mount, page }) => {
  // The tab lives in the CONTEXT panel viewport, which UI-Density-Law §3.1 names as INSTRUMENT tier —
  // beside rpg sections that all name themselves in micro-caps over a hairline. These shipped at the FORM
  // heading (16px/500), so one pane spoke two dialects. COMPUTED, not by class string: `voice` re-spells
  // every axis, so the only honest check is what the browser resolved.
  //
  // #830 — THE RULING SURVIVES, ITS INPUT CHANGED, and this pin moved with it. Every section name is now
  // the visible label of a disclosure BUTTON, so it wears `interactiveKicker`: the same instrument register
  // (uppercase, tracked, muted) at the readable LABEL step, because `kicker`'s 10.5px is under the 11px
  // functional floor for interactive text and design-audit reds it (measured, six P2s). F8's claim is
  // unchanged — this pane is not wearing the FORM tier's 16px/500 h3 — but the assertion now reads the
  // element that actually PAINTS the name (the label inside the trigger) instead of the <h3> wrapper, whose
  // own classes survive whatever sits inside it and would keep this pin green while the pixels moved.
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  const heading = component.getByRole("heading", { name: "Field overrides", exact: true, level: 3 });
  await expect(heading).toBeVisible();

  // The interactive-kicker step and the form-tier step, both RESOLVED from their tokens in this document —
  // never px literals (a token retune must move the assertion with it, not break it).
  const [label, title] = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const root = getComputedStyle(document.documentElement);
    const out = [px(root.getPropertyValue("--text-label").trim()), px(root.getPropertyValue("--text-title").trim())];
    probe.remove();
    return out;
  });
  const name = heading.locator('[data-slot="text"]').first();
  const style = (): Promise<{ readonly size: string; readonly transform: string; readonly tag: string }> =>
    name.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { size: computed.fontSize, transform: computed.textTransform, tag: el.tagName };
    });
  // Polled: type resolution settles with the stylesheet, and a one-shot read samples whatever the first
  // frame had (the DEF-14 class).
  await expect.poll(() => style().then((s) => s.size), { intervals: [20, 50, 100, 200] }).toBe(label);
  // Settled snapshot: the poll above just proved this element's type resolution has SETTLED, and nothing in this
  // test mutates it afterwards — these are the same read, sampled once it is provably stable.
  const settled = await style();
  expect(settled.size).not.toBe(title);
  expect(settled.transform).toBe("uppercase");
  // …and the NAME is still carried by a real h3 (the outline the settings idiom bought is not what was
  // wrong, and wrapping it in a disclosure button must not have cost it).
  await expect(heading).toHaveJSProperty("tagName", "H3");
});

test("D-1: the host-ops trio sits under a 'Host controls' group — and a member sees neither the group nor its rows", async ({ mount, page }) => {
  // The merge had stacked five unrelated concerns in one flat list (the fidelity audit's structural root of
  // "a whole menu got garbled together"). Background / Group behavior / Tool use are now one named group,
  // which is also exactly the permission line.
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await openContextSections(component, HOST_BAND);

  await expect(component.getByRole("heading", { name: "Host controls", exact: true, level: 3 })).toBeVisible();
  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  // CONTAINMENT is the claim — a heading rendered anywhere near them would prove nothing.
  await Promise.all(
    ["Background", "Group behavior", "Tool use"].map((name) => expect(group.getByRole("heading", { name, exact: true, level: 3 })).toBeVisible()),
  );
  // The member-reachable sections stay OUTSIDE it (Macro picks is play state any member may set).
  await expect(group.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toHaveCount(0);
});

// BG-C honest echo (owner-reported 08-03): the Background row read "None" in a chat whose card-carried
// background was VISIBLY painting — the picker echoed only the chat-set field and was blind to the cascade's
// card arm (the S4 override-echoed-as-default class). The row must name the EFFECTIVE source + where it came
// from. Asserted through the rendered text a user reads, never through the resolver.
const SOLO_ROSTER_WITH_CARD_BG = [
  { id: "p_human", kind: "human", characterId: null, displayName: "You" },
  {
    id: "p_birdie",
    kind: "character",
    characterId: "character_birdie",
    displayName: "Birdie Mae Holloway",
    backgroundOverride: { kind: "asset", externalUrl: "", assetId: "asset_birdie_bg", assetHash: "hash_birdie_bg", mime: "image/jpeg", provenanceUrl: "" },
  },
];

test("BG-C: with no chat-set background, the Background row names the CARD-carried source that is painting", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => ({ ...CHAT_DETAIL, participants: SOLO_ROSTER_WITH_CARD_BG }),
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, HOST_BAND);

  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  // The gloss DESCRIBES the carried source rather than naming it: the card author's library entry name is
  // not on this wire (it lives in THEIR appearance library). It used to read the plate's catalog label, which
  // only existed because `kind:"seeded"` carried a slug into a catalog this surface could look up; that kind
  // retired 2026-09-18, and a shipped plate is one of the author's own owned backgrounds now.
  await expect(group.getByText("an uploaded image", { exact: false })).toBeVisible();
  await expect(group.getByText("from Birdie Mae Holloway's card", { exact: false })).toBeVisible();
});

test("BG-C: a room with NO carried background gets no provenance gloss (never an invented origin)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, HOST_BAND);

  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(group.getByText("card", { exact: false })).toHaveCount(0);
});

test("D-1: a member's tab has no Host controls group at all (PERMISSION-omit, never an empty group)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Host controls", exact: true, level: 3 })).toHaveCount(0);
  await expect(component.getByRole("heading", { name: "Background", exact: true, level: 3 })).toHaveCount(0);
});

// D-4 (databank-surface-spec §11) — the per-chat DOCUMENTS rack mounts in THIS tab, directly after
// Injections. Placement is the ruling, so the assertion is ORDER, not mere presence: it is the same family
// ("extra content entering this room's prompt"), and it sits ABOVE the host-only band because unlike
// Background/Group/Tool-use it is member-READABLE.
test("D-4: the Documents section renders directly after Injections, for a host AND for a member", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  // The count chip rides the heading's accessible name, exactly as Injections' does.
  await expect(component.getByRole("heading", { name: "Documents 1", level: 3 })).toBeVisible();

  // `allTextContents`, not `allInnerTexts`: the kicker voice is `text-transform: uppercase`, and innerText
  // reports the TRANSFORMED text — every label would come back shouting and match nothing.
  const named = await component.getByRole("heading", { level: 3 }).allTextContents();
  const at = (label: string): number => named.findIndex((text) => text.trim().startsWith(label));
  expect(at("Documents")).toBe(at("Injections") + 1);
  // Above the host-only band — a member sees it, so it cannot live inside Host controls.
  expect(at("Documents")).toBeLessThan(at("Host controls"));
});

test("D-4: a MEMBER gets the Documents section too (member-readable), with no add affordance", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await openContextSections(component, "Documents");

  await expect(component.getByRole("heading", { name: "Documents 1", level: 3 })).toBeVisible();
  await expect(component.getByText("The Crimson Court")).toBeVisible();
  await expect(component.getByRole("button", { name: "Add from your bank" })).toHaveCount(0);
});

// ── #640: THE WORLD BOOKS RACK — the chat-attach affordance that did not exist ─────────────────────────
// `chat_books` rows were written ONLY by the server (the attach verb, ST import, the host-handoff repoint),
// so a host could not put a book in their own room and the automation rule-preset's lorebook picker was
// uncompletable in every fresh room. Placement is again the ruling, so the first assertion is ORDER.

const ATTACH_BOOK = "worldInfo.attachToChat";
const DETACH_BOOK = "worldInfo.detachFromChat";

function stubLorebooks(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "worldInfo.listBooks": () => OWNED_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
    [ATTACH_BOOK]: () => null,
    [DETACH_BOOK]: () => ({ detached: true }),
  });
}

test("#640: the World books section renders directly after Documents, above the host-only band", async ({ mount, page }) => {
  await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "World books 1", level: 3 })).toBeVisible();

  // `allTextContents`, not `allInnerTexts`: the kicker voice is uppercase and innerText reports the
  // TRANSFORMED text (the D-4 test's own note).
  const named = await component.getByRole("heading", { level: 3 }).allTextContents();
  const at = (label: string): number => named.findIndex((text) => text.trim().startsWith(label));
  expect(at("World books")).toBe(at("Documents") + 1);
  // Member-readable, so it cannot live inside Host controls.
  expect(at("World books")).toBeLessThan(at("Host controls"));
});

test("#640: the rack SAYS what attaching permits — write reach, not just a reference", async ({ mount, page }) => {
  // Attachment IS the room's consent (`engine/arm-executors.ts`: a rule may only write into a book attached
  // here), so a host granting it has to read that in words. A quiet row would be the affordance lie.
  await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, "World books");

  const section = component.locator("section").filter({ hasText: "Ashfall Canon" }).last();
  await expect(section.getByText("can write new entries into", { exact: false })).toBeVisible();
  // …and it does NOT claim attachment is the only gate: books stay owner-owned (D23), so the sentence is
  // scoped to the host's OWN books rather than to any book a rule might name.
  await expect(section.getByText("one of your own books", { exact: false })).toBeVisible();
});

test("#640 host: attaching from the picker fires attachToChat with THAT book and this room", async ({ mount, page }) => {
  const trpc = await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, "World books");

  await component.getByRole("button", { name: "Attach a world book" }).click();
  // The offer set is a real SUBTRACTION: the already-attached book is not offered back, the other one is.
  await expect(page.getByRole("button", { name: "Attach Ashfall Canon to this chat" })).toHaveCount(0);
  await page.getByRole("button", { name: "Attach Session Notes to this chat" }).click();

  await expect
    .poll(() => trpc.lastInput(ATTACH_BOOK), { intervals: [20, 50, 100] })
    .toMatchObject({ bookId: "worldbook_ct_0000000000002", chatId: "chat_ct_keystone" });
});

test("#640 host: the row's overflow menu detaches THIS book from THIS room", async ({ mount, page }) => {
  const trpc = await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, "World books");

  await component.getByRole("button", { name: "Actions for Ashfall Canon" }).click();
  await page.getByRole("menuitem", { name: "Detach from this chat" }).click();

  await expect
    .poll(() => trpc.lastInput(DETACH_BOOK), { intervals: [20, 50, 100] })
    .toMatchObject({ bookId: "worldbook_ct_0000000000001", chatId: "chat_ct_keystone" });
});

test("#640 member: the rows are visible, and there is NO attach and NO detach (permission-OMIT, not disabled)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await openContextSections(component, "World books");

  await expect(component.getByRole("heading", { name: "World books 1", level: 3 })).toBeVisible();
  await expect(component.getByText("Ashfall Canon")).toBeVisible();
  await expect(component.getByRole("button", { name: "Attach a world book" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Actions for Ashfall Canon" })).toHaveCount(0);
  // The member gloss says why books they cannot touch are shaping their turns.
  await expect(component.getByText("Only the host attaches or removes one.", { exact: false })).toBeVisible();
});

test("#640: a room with NO books attached says so rather than rendering an empty block", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => [],
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  await openContextSections(component, "World books");

  await expect(component.getByText("No world books are attached to this chat yet.")).toBeVisible();
  // A "0" chip would be noise — the heading stays the bare label (the count-chip rule).
  await expect(component.getByRole("heading", { name: "World books", exact: true, level: 3 })).toBeVisible();
  // …and the way out is still offered, which is the whole point of the row.
  await expect(component.getByRole("button", { name: "Attach a world book" })).toBeVisible();
});

// ── #821: THE GEOMETRIC FENCE — a section resolving must not move the sections above it ───────────────
// The measured defect: Injections' one-line fallback stood in for ~830px of open editors, and because that
// resolve arrives in a SECOND wave ~260ms after the rest of the tab has painted, Documents and World books —
// already settled and already being read — were shoved bodily out of the viewport (0.30837 paid CLS at 4×
// CPU on a phone, side-eye 2026-08-30 §3 row 9). The invariant that has to hold is not "the skeleton is
// pretty", it is: when Injections lands, the sections around it do not move.
//
// `trpcHold` is the valve (the #815 technique, rules-section.ct.tsx): it holds the REQUEST, so the
// boundary is provably in its fallback and `hold.requested` is a deterministic barrier — never a flash to
// be caught. It holds the whole BATCH, so the sibling sections skeleton too.
//
// THE SUBJECT IS THE SECTION *BELOW*, and that choice is the whole test. Field overrides sits ABOVE
// Injections, so it cannot move no matter how badly the reserve lies — a fence on it is un-failable by
// construction. DOCUMENTS is the section the measured defect actually shoved off the viewport, and it
// moves by exactly the reserve's error. ONE injection is released so the cold-cache reserve (a single
// collapse row) is the honest comparison; on the pre-#821 source that same release moved Documents by
// ~280px, because an 89px line stood in for a ~370px open editor.
// THE BUDGET, and the term inside it (measured in this test, 380px mount, one injection):
//   ·  2.6px — the reserve's own error. The section BODY goes 188.25 → 202.75 while its heading grows
//              17.1 (below), so the body itself SHRINKS ~2.6px on settle. That is the #821 term, and it
//              agrees to the pixel with the 0/1/2/5-row reserve pins in injections-manager.ct.tsx.
//   · CLOSED (#829) — THE COUNT CHIP. `HeadingWithCount`'s Badge used to more than double the kicker's
//              own line box when it appeared (13.125 → 30.25) on THREE sections (Injections, Documents,
//              World books), each shifting everything below it by ~17.1px on settle. The Badge's
//              `size="inline"` arm (built for exactly this — see badge/variants.ts) inherits the
//              kicker's own type axes instead of establishing its own flex box, so the arrival is now a
//              paint, not a layout; pinned directly by the #829 test below. The number here is left at
//              20 rather than tightened to the ~3px residual: this file exercises one mount width
//              (380px) and the standing rule (`.claude/rules/lane-standing-facts.md`, "a point measurement never
//              proves a range property") requires a width matrix before a fence's budget is narrowed.
// Pre-#821 the reserve term alone was ~280px (an 89px line standing in for a ~370px open editor), so this
// budget is failable by an order of magnitude on the source it was written against.
const SETTLE_SHIFT_BUDGET_PX = 20;

test("#821: resolving Injections does not move the sections around it", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": hold,
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  // #830 — Injections is a disclosure that starts CLOSED (the pane opens as an index), so the press is
  // what mounts its boundary and fires the held read. The barrier below is unchanged and still deterministic.
  await openContextSections(component, "Injections");
  await hold.requested;

  // The barrier: the Injections boundary is in its fallback (aria-busy is the loading region's own mark),
  // so what follows reads a settled PENDING frame rather than racing a resolve.
  const injections = component.locator("section").filter({ hasText: "Injections" }).first();
  await expect(injections.locator('[aria-busy="true"]').first()).toBeVisible();

  // DOCUMENT position, not the viewport's — a scroll is not a layout shift (the #815 lesson).
  // Matched by PREFIX: the hold suspends the whole batch, so before the release the Documents heading is
  // the bare kicker (no count chip — the chip needs the read) and after it is "Documents 1".
  const documents = component.getByRole("heading", { name: /^Documents/u, level: 3 });
  const fieldOverrides = component.getByRole("heading", { name: "Field overrides", level: 3 });
  const documentTop = (locator: typeof documents): Promise<number> =>
    locator.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
  // #830 — the press that mounts the boundary also FOLDS the section open, and that fold is an animation.
  // A one-shot read here samples a mid-fold frame, and the fence would then measure the disclosure rather
  // than the reserve (measured: a 160px "shift" that was entirely the fold still running). So settle first:
  // the same top value twice in a row is the pending frame this fence is about.
  const settledDocumentTop = async (): Promise<number> => {
    let previous = -1;
    await expect
      .poll(
        async () => {
          const now = await documentTop(documents);
          const stable = now === previous;
          previous = now;
          return stable;
        },
        { intervals: [60, 60, 60, 60, 120, 120] },
      )
      .toBe(true);
    return previous;
  };
  const documentsBefore = await settledDocumentTop();
  const overridesBefore = await documentTop(fieldOverrides);

  hold.release([HELD_INJECTIONS[0]]);

  // The release must actually land — a fallback that never resolves would satisfy a position fence forever.
  await expect(component.getByRole("heading", { name: "Injections 1", level: 3 })).toBeVisible();
  await expect(injections.locator('[aria-busy="true"]')).toHaveCount(0);

  // THE ASSERTION: the section BELOW moved by less than half a text line. Pre-#821 this is ~280px.
  await expect.poll(async () => Math.abs((await documentTop(documents)) - documentsBefore)).toBeLessThanOrEqual(SETTLE_SHIFT_BUDGET_PX);
  // …and the section ABOVE is pinned exactly. A FENCE, not a defect proof: content below a section cannot
  // move it, so this is green on both sources — it REDs the day the reserve grows upward instead.
  await expect.poll(async () => documentTop(fieldOverrides)).toBe(overridesBefore);
});

// The reserve is fed by the count the heading's own non-suspending read already holds. On a re-open that
// count is in cache and the reserve is exact; this pin proves the WIRING — the fallback is the section's
// own collapse-row skeleton (intro painted for real, cards below it), not a fixed one-line bar.
test("#821: the Injections fallback is the section's own shape, not a line", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": hold,
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  // #830 — Injections is a disclosure that starts CLOSED (the pane opens as an index), so the press is
  // what mounts its boundary and fires the held read. The barrier below is unchanged and still deterministic.
  await openContextSections(component, "Injections");
  await hold.requested;

  const injections = component.locator("section").filter({ hasText: "Injections" }).first();
  const busy = injections.locator('[aria-busy="true"]').first();
  await expect(busy).toBeVisible();
  // The section's OWN intro line is painted for real inside the fallback — it depends on no read, so
  // reserving a placeholder for it would be one more thing to shift on arrival.
  await expect(busy.getByText("Ad-hoc context spliced into this chat's prompt. Changes save automatically.")).toBeVisible();
  // …and this is the LOADING arm, not the ERROR arm wearing its clothes (#629).
  await expect(component.getByText("Couldn't load injections.")).toHaveCount(0);

  hold.release(HELD_INJECTIONS);
  await expect(component.getByRole("heading", { name: "Injections 2", level: 3 })).toBeVisible();
  await expect(injections.locator('[aria-busy="true"]')).toHaveCount(0);
});

// #829: THE KICKER'S OWN LINE BOX — `HeadingWithCount`'s count chip must not resize the heading it rides in.
// Named by #821 as a separate defect from the section-fence one above (the reserve fence budgets the shift,
// this pin closes the source): pre-fix the Badge's `size="sm"` was `inline-flex` with its own type axes, so
// its arrival grew the kicker's line box 13.125px → 30.25px (measured by lane cb-this-chat-fixes, 76ee75493).
// Same `trpcHold` barrier as the fence test above — the heading's own bounding-box height, absent vs present.
test("#829: the count chip's arrival does not resize the kicker's own line box", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": hold,
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  // #830 — Injections is a disclosure that starts CLOSED (the pane opens as an index), so the press is
  // what mounts its boundary and fires the held read. The barrier below is unchanged and still deterministic.
  await openContextSections(component, "Injections");
  await hold.requested;

  const injectionsHeading = component.getByRole("heading", { name: "Injections", exact: true, level: 3 });
  await expect(injectionsHeading).toBeVisible();
  const heightOf = (locator: typeof injectionsHeading): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().height);
  const heightBefore = await heightOf(injectionsHeading);

  hold.release(HELD_INJECTIONS);
  const injectionsHeadingWithCount = component.getByRole("heading", { name: "Injections 2", level: 3 });
  await expect(injectionsHeadingWithCount).toBeVisible();
  const heightAfter = await heightOf(injectionsHeadingWithCount);

  // THE ASSERTION: identical line box, count absent or present. Pre-fix this is 13.125 vs 30.25.
  expect(heightAfter).toBeCloseTo(heightBefore, 1);
});

// ── #830: THE PANE IS AN INDEX — every section is a disclosure with a remembered posture ──────────────
// The #821 residue: with the injection rows collapsed the tab STILL settled at 2,836px desktop over
// fourteen sections (Host controls' eight alone are 1,880px), so Documents and World books were still below
// the fold and a host at the top of the pane had fourteen destinations and no map (side-eye
// `docs/reviews/side-eye/2026-08-30-this-chat-cls.md` §7, re-verified §7 "Still below the fold": Lorebooks
// settles at top 929 on a 932px mobile viewport). Each pin below asserts through the affordance a host
// touches — the kicker's own button — never through the store.

/** The tab's stubs for the disclosure pins: a document, two books, one injection, real macro picks. */
function stubIndexPane(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [HELD_INJECTIONS[0]],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
    "chat.getChat": () => CHAT_DETAIL,
  });
}

test("#830: the pane opens as an INDEX — every section is a disclosure and only Field overrides is expanded", async ({ mount, page }) => {
  await stubIndexPane(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  // Barrier on the SETTLED body of the one section that IS open, so the collapsed reads below belong to a
  // settled frame rather than to a beat where nothing has painted yet.
  await expect(component.getByRole("button", { name: "Main prompt, inheriting" })).toBeVisible();

  // ① The map: every top-level section names itself as a real, pressable door, and the count chips ride
  //    those names — which is what makes the CLOSED pane the section index the review asked for. Only the
  //    pane's teaching opening is expanded: measured on the isolated stage, opening Injections too pushes
  //    Documents and World books back below a 740px mobile fold, which is the #830 symptom by default.
  for (const [kicker, expanded] of [
    ["Field overrides", "true"],
    ["Injections 1", "false"],
    ["Documents 1", "false"],
    ["World books 1", "false"],
    ["Macro picks", "false"],
    ["Host controls", "false"],
  ] as const) {
    await expect(component.getByRole("button", { name: kicker, exact: true })).toHaveAttribute("aria-expanded", expanded);
  }

  // ② …and CLOSED means the body is not on the page at all — the height the review measured is gone, not
  //    merely scrolled past. (`Injection 1` is the injections rack's own collapsed row; `The Crimson Court`
  //    is the Documents rack's; `Tool rounds per turn` is the deepest host-band control.)
  await expect(component.getByRole("button", { name: "Injection 1" })).toHaveCount(0);
  await expect(component.getByText("The Crimson Court")).toHaveCount(0);
  await expect(component.getByLabel("Tool rounds per turn")).toHaveCount(0);
});

test("#830: pressing a kicker opens THAT section, and the posture survives a remount", async ({ mount, page }) => {
  await stubIndexPane(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("button", { name: "Main prompt, inheriting" })).toBeVisible();

  await openContextSections(component, "Documents");
  await expect(component.getByText("The Crimson Court")).toBeVisible();
  // Its NEIGHBOUR is untouched — a disclosure is per-section, never a mode.
  await expect(component.getByRole("button", { name: "World books 1", exact: true })).toHaveAttribute("aria-expanded", "false");

  // The remount is the claim: the posture is remembered for this device, so the rack the host opened is
  // open the next time the pane mounts — no second press.
  await component.unmount();
  const again = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(again.getByRole("button", { name: "Documents 1", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(again.getByText("The Crimson Court")).toBeVisible();
  // …and the section the host never touched is still at ITS default, not at the one they set next door.
  await expect(again.getByRole("button", { name: "World books 1", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("#830: the trigger IS the kicker — a real button, named by the kicker text, in the kicker's own voice", async ({ mount, page }) => {
  await stubIndexPane(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  // The button lives INSIDE the h3, so the document outline the settings idiom bought is unchanged and the
  // accessible name computes from the same content the eye reads (WCAG 2.5.3) — chip included.
  const heading = component.getByRole("heading", { name: "Documents 1", level: 3 });
  await expect(heading).toBeVisible();
  const trigger = heading.getByRole("button", { name: "Documents 1", exact: true });
  await expect(trigger).toBeVisible();

  // …and it still SPEAKS the band's instrument register, at the step an INTERACTIVE label owes: `kicker`'s
  // 10.5px is under design-audit's 11px functional floor for interactive text (six P2s, measured), so a
  // kicker that is a control wears `interactiveKicker` — same uppercase, same tracking, same muted tone, at
  // the readable label step. Resolved from the token in this document, never a px literal.
  const labelStep = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue("--text-label").trim();
    const resolved = getComputedStyle(probe).fontSize;
    probe.remove();
    return resolved;
  });
  const label = trigger.locator('[data-slot="text"]').first();
  await expect.poll(() => label.evaluate((el) => getComputedStyle(el).fontSize), { intervals: [20, 50, 100, 200] }).toBe(labelStep);
  await expect.poll(() => label.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
});

test("#830 member: the permission-OMIT layout is unchanged — five doors, and no host band", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    ...REGEX_READS,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  // Barrier on the member tree's own settled open section before the absence reads (the #629 lesson) —
  // Field overrides is the one section that opens itself, and a member gets its read-only copy.
  await expect(component.getByRole("button", { name: "Main prompt, inheriting" })).toBeVisible();

  for (const kicker of ["Field overrides", "Injections", "Documents 1", "World books 1", "Macro picks"] as const) {
    await expect(component.getByRole("button", { name: kicker, exact: true })).toBeVisible();
  }
  // The §8.1 permission-OMIT is untouched by the disclosure: a member's tab still ENDS after Macro picks —
  // the band is absent, not a closed door they can press.
  await expect(component.getByRole("button", { name: HOST_BAND, exact: true })).toHaveCount(0);
  await expect(component.getByRole("heading", { name: HOST_BAND, exact: true, level: 3 })).toHaveCount(0);
});
