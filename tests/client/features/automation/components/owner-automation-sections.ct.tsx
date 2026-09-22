// CT: C5's OWNER-GLOBAL surface — the Automation config group's two contributed sections (owner-automation-sections.tsx +
// rule-row.tsx + rule-preset-picker.tsx). It drives the REAL tRPC path over the stubbed network
// (`routeTrpc`), which is the only way to prove the three things that make this a DIFFERENT surface from the
// chat Rules section rather than a copy of it:
//
//   1. it reads `listOwnerRules` — an id-LESS procedure, because the plane is single-owned;
//   2. its picker offers ONLY the presets that declare `scope: "global"` and mints them with `chatId: null`
//      (a global preset offered in a room, or a chat preset offered here, is an affordance whose own mint
//      refuses by name — the #655 class this catalogue has already paid for once);
//   3. it owns the OWNER rate ceiling, which has no per-chat equivalent.
//
// The mount is 560px — the config CONTENT pane at its docked width, which is these sections' narrowest REAL
// host. They never render in the 384px docked context pane, so measuring them there would be a mount that
// does not exist.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { OwnerAutomationSectionsStory } from "../_ct-stories.tsx";

/** A FIXED epoch, never `Date.now()` (test-determinism): the row renders relative time. */
const A_PAST_INSTANT = 1_760_000_000_000;

/** The copy this surface is asserted through — hoisted because a locator regex is rebuilt per call. */
const ROW_GLOSS = /no room required/u;
const PANE_LINE = /watch your library/u;
const EMPTY_LINE = /Nothing is watching your library yet/u;

/** The viewer's settings row — spread FIRST into every `routeTrpc` call. Not this file's subject, but unfed
 *  it resolves `routeTrpc`'s null and every appearance/tier reader falls to its default branch. */
const VIEWER_SETTINGS_ROUTE: TrpcRoutes<"sessions.me" | "settings.getUserSettings"> = {
  // The host's viewer projection (`useSettingsViewerView`) — the group body resolves each section's `when` off it.
  "sessions.me": { userId: "user_ct_owner", handle: "ct_owner", globalRole: "owner" },
  "settings.getUserSettings": { userId: "user_ct_owner", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: A_PAST_INSTANT, configUnreadable: null },
};

/** One minted owner-global rule — `chatId: null` IS the scope, and it is what the row's mutations carry back
 *  as the list address. */
const GLOBAL_RULE = {
  id: "automationrule_ctg1",
  chatId: null,
  name: "Living library",
  description: "When a character's card changes, quietly generate a fresh portrait of them — no room required.",
  enabled: false,
  position: 0,
  trigger: { bus: "domain", type: "character.updated" },
  predicateCel: "has(event.character) && event.character.contentChanged",
  actions: [{ type: "generate_image", mode: "character_multimodal", n: 1, useAvatarReference: false, reuse: "prefer", quiet: true, confirmFirst: false }],
  actionsCorrupt: false,
  rulePresetId: "livingLibrary",
  rulePresetKnobs: null,
  matchAutomationEvents: false,
  suggestOnRefusal: true,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
} satisfies TrpcWireOutput<"automation.listOwnerRules">[number];

/** The catalogue as the picker reads it: one GLOBAL row and one CHAT row, so the partition is provable
 *  rather than vacuous (a catalogue of only global rows could not show that filtering happens). */
const PRESETS = [
  {
    id: "livingLibrary",
    scope: "global",
    title: "Living library",
    summary: "When a character's card changes, quietly generate a fresh portrait of them — no room required.",
    ruleCount: 1,
    confirmFirst: false,
    spends: true,
    knobs: [],
  },
  {
    id: "diceChips",
    scope: "chat",
    title: "Offer chips after a beat",
    summary: "Every few beats, offer a short row of things you might say next.",
    ruleCount: 1,
    confirmFirst: false,
    spends: false,
    knobs: [],
  },
] satisfies TrpcWireOutput<"automation.listRulePresets">;

const OWNER_BASE_ROUTES = [
  "sessions.me",
  "settings.getUserSettings",
  "automation.listOwnerRules",
  "automation.getOwnerBudgets",
  "automation.listRulePresets",
  "automation.listFires",
] as const;
type OwnerBaseRoute = (typeof OWNER_BASE_ROUTES)[number];
const OWNER_OPTIONAL_ROUTES = ["automation.createRuleFromPreset", "automation.setRuleEnabled", "automation.setOwnerBudgets"] as const;
type OwnerOptionalRoute = (typeof OWNER_OPTIONAL_ROUTES)[number];
type OwnerRouteOverrides = Partial<TrpcRoutes<OwnerOptionalRoute | "automation.listOwnerRules" | "automation.getOwnerBudgets">>;

function ownerRoutes(overrides: OwnerRouteOverrides = {}): TrpcRoutes<OwnerBaseRoute> & OwnerRouteOverrides {
  return {
    ...VIEWER_SETTINGS_ROUTE,
    "automation.listOwnerRules": [GLOBAL_RULE],
    "automation.getOwnerBudgets": { maxFiresPerHour: 120 },
    "automation.listRulePresets": PRESETS,
    "automation.listFires": [],
    ...overrides,
  };
}

test("the pane lists the OWNER's library-wide rules off the id-less read", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes());
  const surface = await mount(<OwnerAutomationSectionsStory />);

  await expect(surface.getByText("Living library")).toBeVisible();
  // The row's gloss is the CATALOGUE's own sentence (what `createRuleFromPreset` stores as `description`) —
  // the same "the row is the surface" shape the chat list uses, from the shared `rule-row.tsx`.
  await expect(surface.getByText(ROW_GLOSS)).toBeVisible();
  // The pane's own line says what is DIFFERENT about these rules.
  await expect(surface.getByText(PANE_LINE)).toBeVisible();
  // …and it read the OWNER lane, never a chat's. `listRules` takes a chatId and this surface has none.
  // Settled snapshot: the three assertions above are web-first and already barriered on the SETTLED rendered list
  // (the row and both copy lines are visible), which is downstream of every read this surface makes — there
  // is no later call these counts could still be waiting for.
  await expect.poll(async () => trpc.count("automation.listOwnerRules")).toBeGreaterThan(0);
  // Settled snapshot: same settle. A count of ZERO is the assertion, and it can only be falsified by a call that
  // has ALREADY happened — polling a zero would wait for something that must never arrive.
  await expect.poll(async () => trpc.count("automation.listRules")).toBe(0);
  // Settled snapshot: same settle. An unstubbed read answers `null`, which is not a view, so a suspending reader
  // throws into its boundary while the copy outside it still renders (#629) — and that copy is what the
  // visible-assertions above already proved rendered.
  expect(trpc.unstubbed()).toEqual([]);
});

test("the picker offers ONLY the global half of the catalogue, and mints with no chat", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes({ "automation.createRuleFromPreset": [GLOBAL_RULE] }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  await surface.getByRole("button", { name: "Add a rule" }).click();
  // EXACT, because the mounted ROW's own controls are named "Test Living library" and "More actions for
  // Living library" — a substring match resolves three elements and reds on strict mode rather than on the
  // thing under test.
  const catalogueRow = page.getByRole("button", { name: "Living library", exact: true });
  // The GLOBAL row is offered…
  await expect(catalogueRow).toBeVisible();
  // …and the CHAT row is not. A preset declares its own scope and the mint refuses a mismatch by name, so
  // offering it here would be a card that cannot be added.
  await expect(page.getByRole("button", { name: "Offer chips after a beat" })).toHaveCount(0);

  await catalogueRow.click();
  await page.getByRole("button", { name: "Add rule" }).click();

  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  // `chatId: null` IS the lane — the mint carries it explicitly rather than omitting the field, so a caller
  // can never silently mint a global rule by forgetting one.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already barriered on the call having been recorded; its input cannot change.
  expect(trpc.lastInput("automation.createRuleFromPreset")).toMatchObject({ chatId: null, presetId: "livingLibrary" });
});

test("a row's lifecycle actions address the OWNER list, not a chat's", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes({ "automation.setRuleEnabled": null }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  // The enable switch is the CONSENT act, and it is the shared row's — the pane adds no second control.
  await surface.getByRole("switch", { name: "Enable Living library" }).click();
  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(1);
  // The wire input is `{ruleId, enabled}` — the scope rides the mutation VARS to address the cached list and
  // is stripped server-side, which is why it must not appear here.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already barriered on the call having been recorded; its input cannot change.
  expect(trpc.lastInput("automation.setRuleEnabled")).toMatchObject({ ruleId: GLOBAL_RULE.id, enabled: true });
});

test("the OWNER rate ceiling autosaves the FINAL value on blur, never a mid-type partial", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes({ "automation.getOwnerBudgets": { maxFiresPerHour: 42 }, "automation.setOwnerBudgets": null }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  // An `@orb/ui` NumberField is a Base UI TEXTBOX named by its `<Field label>` — never a spinbutton, and
  // never a `data-testid` (the Root spread would park one on the wrapper div, where `toHaveValue` reads
  // nothing). The same locator convention every other numeric settings knob's CT uses.
  const field = surface.getByRole("textbox", { name: "Runs per hour" });
  await expect(field).toHaveValue("42");
  // The explicit "Save limit" button is GONE — the belt autosaves now (the ruling survives, its mechanism
  // changed: on-blur commit instead of a discrete button). Its removal is the point of this change.
  await expect(surface.getByRole("button", { name: "Save limit" })).toHaveCount(0);

  // THE MID-TYPE GUARANTEE. Focus and type a partial digit toward a larger number WITHOUT leaving the
  // field: typing `5` en route to `50` must never persist a clamp to 5. The keystrokes fire `onValueChange`
  // (draft only) — no `setOwnerBudgets` may have been recorded while the field still has focus.
  await field.focus();
  await field.press("ControlOrMeta+a");
  await field.pressSequentially("5");
  await expect(field).toHaveValue("5");
  await field.pressSequentially("0");
  await expect(field).toHaveValue("50");
  // Still mid-edit — the belt has not tightened. A count of ZERO is the assertion and it can only be
  // falsified by a call that ALREADY happened, so there is nothing to poll-wait for.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a settled count of ZERO has no positive call to poll-barrier for; the toHaveValue("50") above settled the edit, and onValueCommitted fires only on blur/Enter, so no write can be in flight while focused.
  expect(trpc.count("automation.setOwnerBudgets")).toBe(0);

  // Blur commits the FINAL value — 50, never the transient 5.
  await field.blur();
  await expect.poll(() => trpc.count("automation.setOwnerBudgets")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already barriered on the call having been recorded; its input cannot change.
  expect(trpc.lastInput("automation.setOwnerBudgets")).toMatchObject({ maxFiresPerHour: 50 });
});

test("the OWNER rate ceiling commits on Enter with the final value", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes({ "automation.getOwnerBudgets": { maxFiresPerHour: 42 }, "automation.setOwnerBudgets": null }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  const field = surface.getByRole("textbox", { name: "Runs per hour" });
  await expect(field).toHaveValue("42");

  // Enter is a commit, not just blur. Base UI treats Enter as a NAVIGATE key that does not commit on its
  // own, so the component blurs the input on Enter to route it through the same single commit path.
  await field.press("ControlOrMeta+a");
  await field.pressSequentially("7");
  await field.press("Enter");
  await expect.poll(() => trpc.count("automation.setOwnerBudgets")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already barriered on the call having been recorded; its input cannot change.
  expect(trpc.lastInput("automation.setOwnerBudgets")).toMatchObject({ maxFiresPerHour: 7 });
});

test("committing an UNCHANGED value writes nothing — the belt only saves a real change", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ownerRoutes({ "automation.getOwnerBudgets": { maxFiresPerHour: 42 }, "automation.setOwnerBudgets": null }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  const field = surface.getByRole("textbox", { name: "Runs per hour" });
  await expect(field).toHaveValue("42");

  // Focus then blur without editing: the commit fires but the settled value equals the current ceiling, so
  // the guard writes nothing. No optimistic patch and no phantom save on a bare focus/blur.
  await field.focus();
  await field.blur();

  // A bare node-side zero-read here races the guard's own async chain — it can green whether the guard
  // fired-and-was-swallowed or genuinely never fired, which makes it no test of the guard at all. The
  // decisive receipt: follow the no-op blur with a REAL edit that DOES commit, then assert the recorded
  // input LIST has exactly the one call the real edit produced — if the no-op blur had phantom-fired, the
  // list would carry two entries (or the wrong first value), not one.
  await field.focus();
  await field.press("ControlOrMeta+a");
  await field.pressSequentially("9");
  await field.blur();
  await expect.poll(() => trpc.count("automation.setOwnerBudgets")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll above already barriered on exactly one call having been recorded; the input list cannot change after that.
  expect(trpc.inputs("automation.setOwnerBudgets")).toEqual([{ maxFiresPerHour: 9 }]);
});

test("an empty lane says what to do about it — the empty state is the teaching copy", async ({ mount, page }) => {
  await routeTrpc(page, ownerRoutes({ "automation.listOwnerRules": [] }));
  const surface = await mount(<OwnerAutomationSectionsStory />);

  await expect(surface.getByText(EMPTY_LINE)).toBeVisible();
  // The picker is still the door out of the empty state — an empty list that also hid the way to fill it
  // would be the dead end this catalogue's empty states exist to avoid.
  await expect(surface.getByRole("button", { name: "Add a rule" })).toBeVisible();
});
