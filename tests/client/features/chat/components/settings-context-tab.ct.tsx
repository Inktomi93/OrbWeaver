// CT: the consolidated "This chat" CONTEXT tab (settings-context-tab.tsx, panel-redesign) mounted DIRECTLY
// as the component — its OWN section-composition contract, distinct from chats-section.ct's registry-resolve
// matrix. Pins: Field overrides + Injections + (host+group) Group behavior render as real h3 sections; the
// "Group behavior" section is ABSENT for a non-host and ABSENT for a solo roster while "Field overrides"
// persists; the section headings are real h3s with the right accessible names (the settings-modal idiom).
// The committed arm routeTrpc-stubs `chat.getGroupConfig` (the Group-behavior section's suspense read) +
// `chat.setRoomOverrides` + `chat.listChatInjections` (the folded-in Injections section's read); the draft
// arm is store-backed (no network).

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { setNumber } from "../../../../support/ct/set-number.ts";
import { CommittedSettingsTabStory } from "../_ct-stories.tsx";

// The getChat stub the host-only Tool-use section suspends on (⑦). `toolRecurseLimit` is the current cap the
// control displays; `viewerIsHost` mirrors the story's isHost. Minimal — the section only reads the cap.
const CHAT_DETAIL = { id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] };

// The Macro-picks section's own suspense read (#24) — this tab is its production mount, so every committed
// arm must stub it or the section's boundary would swallow the failure and the tab's composition contract
// would silently stop covering it. Empty declarations = the section's teaching empty state.
const EMPTY_PICKS = { macros: [], values: {} };

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

// The Documents section's SECOND, non-suspending read (`useSlotState`, chat-documents-section.tsx:67 →
// `settings.getUserSettings` for the host's active preset, to say whether that preset places `{{databank}}`).
// Found by the #629 pin below, not by anyone reading the file: it was unstubbed in EVERY arm here, and the
// stub's lenient `null` fulfil is NOT `undefined`, so the section skipped its own "resolving" arm and
// resolved the built-in prompt config — the right answer, reached by accident. Declared now: this room's
// host runs the built-in preset (`defaultPresetId: null`), which is the arm these tests were already in.
const USER_SETTINGS = { config: { seeds: { defaultPresetId: null } } };

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

// The Lorebooks section's own suspense read (#640) — this tab is its production mount, so every arm must
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
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

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
      "chat.getChat": () => CHAT_DETAIL,
    });

    const component = await mount(<CommittedSettingsTabStory isHost={arm.isHost} showGroup={arm.showGroup} />);

    // Barrier on a SETTLED body of the last-declared section in this arm, so the assertions below are not
    // read while boundaries are still in their skeleton fallback (a pending boundary shows neither the
    // error text nor the control, and would pass both arms vacuously).
    // #640 moved the member arm's last-declared section: Lorebooks now sits after Documents, so the barrier
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
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

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
    "chat.getChat": () => CHAT_DETAIL,
  });

  // A host of a NON-group chat: showGroup=false (resolveIsGroupChat is false at <2 cast) — the section is
  // omitted even though the viewer is host (the gate is host AND group, both required).
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

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
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_TOOL_LIMIT]: () => ({}),
  });
}

test("⑦ host: the Tool-use section renders the cap control seeded from getChat.toolRecurseLimit", async ({ mount, page }) => {
  await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Tool rounds per turn" })).toHaveValue("7"); // CHAT_DETAIL.toolRecurseLimit
});

test("⑦ host: editing the cap fires chat.setToolRecurseLimit with the new limit", async ({ mount, page }) => {
  const trpc = await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
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
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toHaveCount(0);
  // Role-agnostic on purpose: an ABSENCE assertion keyed to `spinbutton` would go blind the day the control
  // becomes an @orb/ui NumberField (Base UI renders those as a TEXTBOX, never a spinbutton).
  await expect(component.getByLabel("Tool rounds per turn")).toHaveCount(0);
});

// D121-E — the "share my display scripts" host switch (Host controls group). Host-only (the §8.1
// permission-OMIT): the host sees + toggles it; a member never sees the control (the Tool-use precedent).
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
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_HOST_DISPLAY_SCRIPTS]: () => ({}),
  });
}

test("host: the display-scripts switch renders seeded from getChat.hostDisplayScripts (off)", async ({ mount, page }) => {
  await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).not.toBeChecked();
});

test("host: toggling the switch fires chat.setHostDisplayScripts with the new state", async ({ mount, page }) => {
  const trpc = await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
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
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).toHaveCount(0);
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
  // The tab lives in the CONTEXT panel viewport, which density-pass-spec §3.1 names as INSTRUMENT tier —
  // beside rpg sections that all name themselves in micro-caps over a hairline. These shipped at the FORM
  // heading (16px/500), so one pane spoke two dialects. COMPUTED, not by class string: `voice` re-spells
  // every axis, so the only honest check is what the browser resolved.
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "databank.listActiveForChat": () => ACTIVE_DOCUMENTS,
    "worldInfo.listForChat": () => ROOM_BOOKS,
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getVariablePicks": () => VARIABLE_PICKS,
    "settings.getUserSettings": () => USER_SETTINGS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  const heading = component.getByRole("heading", { name: "Field overrides", exact: true, level: 3 });
  await expect(heading).toBeVisible();

  // The kicker step + the form-tier step, both RESOLVED from their tokens in this document — never px
  // literals (a token retune must move the assertion with it, not break it).
  const [micro, title] = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const root = getComputedStyle(document.documentElement);
    const out = [px(root.getPropertyValue("--text-micro").trim()), px(root.getPropertyValue("--text-title").trim())];
    probe.remove();
    return out;
  });
  const style = (): Promise<{ readonly size: string; readonly transform: string; readonly tag: string }> =>
    heading.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { size: computed.fontSize, transform: computed.textTransform, tag: el.tagName };
    });
  // Polled: type resolution settles with the stylesheet, and a one-shot read samples whatever the first
  // frame had (the DEF-14 class).
  await expect.poll(() => style().then((s) => s.size), { intervals: [20, 50, 100, 200] }).toBe(micro);
  // ONESHOT-OK: the poll above just proved this element's type resolution has SETTLED, and nothing in this
  // test mutates it afterwards — these are the same read, sampled once it is provably stable.
  const settled = await style();
  expect(settled.size).not.toBe(title);
  expect(settled.transform).toBe("uppercase");
  // …and it is STILL a real h3 (the outline the settings idiom bought is not what was wrong).
  expect(settled.tag).toBe("H3");
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
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

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
    backgroundOverride: { kind: "seeded", seededId: "birdie-bg", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
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
    "chat.getChat": () => ({ ...CHAT_DETAIL, participants: SOLO_ROSTER_WITH_CARD_BG }),
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(group.getByText("Hobby & Repair", { exact: false })).toBeVisible();
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
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

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
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Documents 1", level: 3 })).toBeVisible();
  await expect(component.getByText("The Crimson Court")).toBeVisible();
  await expect(component.getByRole("button", { name: "Add from your bank" })).toHaveCount(0);
});

// ── #640: THE LOREBOOKS RACK — the chat-attach affordance that did not exist ──────────────────────────
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
    "chat.getChat": () => CHAT_DETAIL,
    [ATTACH_BOOK]: () => null,
    [DETACH_BOOK]: () => ({ detached: true }),
  });
}

test("#640: the Lorebooks section renders directly after Documents, above the host-only band", async ({ mount, page }) => {
  await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Lorebooks 1", level: 3 })).toBeVisible();

  // `allTextContents`, not `allInnerTexts`: the kicker voice is uppercase and innerText reports the
  // TRANSFORMED text (the D-4 test's own note).
  const named = await component.getByRole("heading", { level: 3 }).allTextContents();
  const at = (label: string): number => named.findIndex((text) => text.trim().startsWith(label));
  expect(at("Lorebooks")).toBe(at("Documents") + 1);
  // Member-readable, so it cannot live inside Host controls.
  expect(at("Lorebooks")).toBeLessThan(at("Host controls"));
});

test("#640: the rack SAYS what attaching permits — write reach, not just a reference", async ({ mount, page }) => {
  // Attachment IS the room's consent (`engine/arm-executors.ts`: a rule may only write into a book attached
  // here), so a host granting it has to read that in words. A quiet row would be the affordance lie.
  await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  const section = component.locator("section").filter({ hasText: "Ashfall Canon" }).last();
  await expect(section.getByText("can write new entries into", { exact: false })).toBeVisible();
  // …and it does NOT claim attachment is the only gate: books stay owner-owned (D23), so the sentence is
  // scoped to the host's OWN books rather than to any book a rule might name.
  await expect(section.getByText("one of your own books", { exact: false })).toBeVisible();
});

test("#640 host: attaching from the picker fires attachToChat with THAT book and this room", async ({ mount, page }) => {
  const trpc = await stubLorebooks(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await component.getByRole("button", { name: "Attach a lorebook" }).click();
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
  });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Lorebooks 1", level: 3 })).toBeVisible();
  await expect(component.getByText("Ashfall Canon")).toBeVisible();
  await expect(component.getByRole("button", { name: "Attach a lorebook" })).toHaveCount(0);
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
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await expect(component.getByText("No lorebooks are attached to this chat yet.")).toBeVisible();
  // A "0" chip would be noise — the heading stays the bare label (the count-chip rule).
  await expect(component.getByRole("heading", { name: "Lorebooks", exact: true, level: 3 })).toBeVisible();
  // …and the way out is still offered, which is the whole point of the row.
  await expect(component.getByRole("button", { name: "Attach a lorebook" })).toBeVisible();
});
