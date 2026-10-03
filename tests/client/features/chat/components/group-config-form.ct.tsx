// CT: the group-config form (group-config-form.tsx, P3). Reworked onto `createAutosaveEntityForm` — each
// control debounces a WHOLE rebuilt config through `save` (the story renders the last saved config into the
// `group-config-saved` readout). The factory OBLIGATIONS (seed-on-load · key-remount · reseed-guard ·
// onFieldUnmount) are pinned once at the factory level (tests/client/forms/editor/create-autosave-entity-form.ct.tsx).
// This consumer CT proves the GROUP-CONFIG wiring: the output discriminator switches the DU arm (+
// re-derives the coupled speakerTags default), the scopedCards↔cardScope mapping seam, the narrator arm
// omits cardScope, and the Advanced disclosure reveals policy / member-visibility / auto-mode.

import { DEFAULT_GROUP_CONFIG, GROUP_POLICY_LABELS, groupConfigSchema, SMART_UTILITY_SWITCH_LABEL } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { UTILITY_RUNNING_ROUTES, utilityBindings, withRunningRerank } from "../../../../support/node/utility-role.ts";
import { CommittedGroupConfigTabStory, GroupConfigFormStory, GroupConfigSwitchStory } from "../_ct-stories.tsx";

const SAVED = '[data-testid="group-config-saved"]';
/** Escapes an id for an exact token match inside a space-separated `aria-describedby` list. */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/gu;
function idTokenPattern(id: string): RegExp {
  return new RegExp(`(^|\\s)${id.replace(REGEX_SPECIALS, "\\$&")}(\\s|$)`, "u");
}
const MODEL_ROLES_DOOR = "Open Model roles";

test("renders the output discriminator + the always-visible toggles (seeded from config)", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await expect(component.getByRole("button", { name: "Per-speaker" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Narrator" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Label each speaker" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Nudge the group to stay in character" })).toBeVisible();
});

test("switching output to narrator rebuilds the arm + re-derives the coupled speakerTags default", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Narrator" }).click();

  // The whole object is rebuilt onto the narrator arm; speakerTags' default couples to narrator (true).
  await expect(component.locator(SAVED)).toContainText('"output":"narrator"');
  await expect(component.locator(SAVED)).toContainText('"speakerTags":true');
  // The narrator arm is `.strict()` — the whole-object rebuild MUST drop cardScope entirely.
  await expect(component.locator(SAVED)).not.toContainText("cardScope");
});

// `speakerTags` only reaches the narrator round's nudge, so a per-speaker room shows the switch disabled and
// wired to its field's own description (the reason), and the narrator arm hands it back.
test("Label each speaker is disabled and explained in a per-speaker room, and live in a narrator room", async ({ mount, page }) => {
  const component = await mount(<GroupConfigFormStory />);
  const labelSpeakers = component.getByRole("switch", { name: "Label each speaker" });

  await expect(labelSpeakers).toBeDisabled();
  // A `has` locator resolves inside the outer element, so it is spelled from `page`: the mounted component's
  // own locators carry the mount root, which no field contains.
  const field = component.locator('[data-slot="field-root"]').filter({ has: page.getByRole("switch", { name: "Label each speaker" }) });
  const description = field.locator('[data-slot="field-description"]');
  await expect(description).toBeVisible();
  const descriptionId = (await description.getAttribute("id")) ?? "";
  expect(descriptionId).not.toBe("");
  await expect(labelSpeakers).toHaveAttribute("aria-describedby", idTokenPattern(descriptionId));

  await component.getByRole("button", { name: "Narrator" }).click();
  await expect(labelSpeakers).toBeEnabled();
  await labelSpeakers.click();
  await expect(component.locator(SAVED)).toContainText('"speakerTags":false');
});

test("toggling group-nudge commits the whole config", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  // DEFAULT groupNudge is true → toggle off.
  await component.getByRole("switch", { name: "Nudge the group to stay in character" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":false');
});

test("the Advanced disclosure reveals policy · member-visibility · auto-mode", async ({ mount, page }) => {
  // The speaker-order control reads the Utility role once Advanced opens.
  await routeTrpc(page, UTILITY_RUNNING_ROUTES);
  const component = await mount(<GroupConfigFormStory />);

  // Hidden at rest (progressive disclosure).
  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toHaveCount(0);

  await component.getByRole("button", { name: "Advanced" }).click();

  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "How much of each member the others see" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Let characters reply to each other" })).toBeVisible();
  // Card-scope shows on the per-speaker default (narrator has no per-speaker card scope).
  await expect(component.getByRole("switch", { name: "Each character sees only their own card" })).toBeVisible();
});

test("the scopedCards toggle maps to the per-speaker cardScope arm", async ({ mount, page }) => {
  await routeTrpc(page, UTILITY_RUNNING_ROUTES);
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("switch", { name: "Each character sees only their own card" }).click();

  // The flat `scopedCards` boolean projects back onto the wire `cardScope: "scoped"` (per-speaker arm).
  await expect(component.locator(SAVED)).toContainText('"cardScope":"scoped"');
});

// Self-responses govern every round the app picks speakers for, not only the auto-mode chain, so the switch
// stands on its own with auto mode off (the default) and still saves.
test("the self-response switch shows with auto mode off and saves", async ({ mount, page }) => {
  await routeTrpc(page, UTILITY_RUNNING_ROUTES);
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await expect(component.getByRole("switch", { name: "Let characters reply to each other" })).toHaveAttribute("aria-checked", "false");
  const selfResponses = component.getByRole("switch", { name: "Let a character reply to itself" });
  await expect(selfResponses).toBeVisible();

  await selfResponses.click();
  await expect(component.locator(SAVED)).toContainText('"allowSelfResponses":true');
  await expect(component.locator(SAVED)).toContainText('"autoMode":false');
});

// Smart picks with the Rerank model by default, so it needs no Utility model; the Utility-model arbiter is an
// opt-in inside Smart, and only that opt-in offers the door to Model roles when no Utility model runs.
const SMART_OPTION = { name: GROUP_POLICY_LABELS.smart };
const POLICY_COMBOBOX = { name: "Who speaks each round" };
const UTILITY_UPGRADE = { name: SMART_UTILITY_SWITCH_LABEL };
const HEALED_STATUS = '[data-slot="narrator-healed-smart"]';

test("Smart can be chosen with no Utility model, and offers no door until the Utility opt-in is on", async ({ mount, page }) => {
  await routeTrpc(page, { ...UTILITY_RUNNING_ROUTES, "connection.listBindings": withRunningRerank(utilityBindings("unset")) });
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("combobox", POLICY_COMBOBOX).click();
  await page.getByRole("option", SMART_OPTION).click();
  await expect(component.locator(SAVED)).toContainText('"smartPicker":"reranker"');
  await expect(component.getByRole("button", { name: MODEL_ROLES_DOOR })).toHaveCount(0);

  await component.getByRole("switch", UTILITY_UPGRADE).click();
  await expect(component.locator(SAVED)).toContainText('"smartPicker":"utility"');
  await expect(component.getByRole("button", { name: MODEL_ROLES_DOOR })).toBeVisible();
});

test("with a running Rerank model Smart can be chosen, and the choice saves", async ({ mount, page }) => {
  await routeTrpc(page, { ...UTILITY_RUNNING_ROUTES, "connection.listBindings": withRunningRerank(utilityBindings("running")) });
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("combobox", POLICY_COMBOBOX).click();
  await page.getByRole("option", SMART_OPTION).click();
  await expect(component.locator(SAVED)).toContainText('"policy":"smart"');
  // Ready: nothing to fix, so no door.
  await expect(component.getByRole("button", { name: MODEL_ROLES_DOOR })).toHaveCount(0);
});

test("switching a Smart room to Narrator saves Natural and disables Smart; switching back does not restore it", async ({ mount, page }) => {
  await routeTrpc(page, { ...UTILITY_RUNNING_ROUTES, "connection.listBindings": withRunningRerank(utilityBindings("running")) });
  const component = await mount(<GroupConfigFormStory config={groupConfigSchema.parse({ output: "per-speaker", policy: "smart" })} />);
  const healed = component.locator(HEALED_STATUS);
  await expect(healed).toHaveCount(0);

  await component.getByRole("button", { name: "Narrator" }).click();
  await expect(component.locator(SAVED)).toContainText('"output":"narrator"');
  await expect(component.locator(SAVED)).toContainText('"policy":"natural"');
  // The heal is said, not silent: a status line under the output toggle.
  await expect(healed).toBeVisible();
  await expect(healed).toHaveAttribute("role", "status");

  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("combobox", POLICY_COMBOBOX).click();
  await expect(page.getByRole("option", SMART_OPTION)).toBeDisabled();
  await page.keyboard.press("Escape");

  await component.getByRole("button", { name: "Per-speaker" }).click();
  await expect(component.locator(SAVED)).toContainText('"output":"per-speaker"');
  await expect(component.locator(SAVED)).toContainText('"policy":"natural"');
});

test("Smart's default Rerank picker with no Rerank model bound offers the door to Model roles", async ({ mount, page }) => {
  await routeTrpc(page, UTILITY_RUNNING_ROUTES);
  const component = await mount(<GroupConfigFormStory config={groupConfigSchema.parse({ output: "per-speaker", policy: "smart" })} />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await expect(component.getByRole("button", { name: MODEL_ROLES_DOOR })).toBeVisible();
});

test("a per-speaker room already on Smart's Utility opt-in with no Utility model offers the door to Model roles", async ({ mount, page }) => {
  await routeTrpc(page, { ...UTILITY_RUNNING_ROUTES, "connection.listBindings": utilityBindings("unset") });
  const component = await mount(<GroupConfigFormStory config={groupConfigSchema.parse({ output: "per-speaker", policy: "smart", smartPicker: "utility" })} />);

  await component.getByRole("button", { name: "Advanced" }).click();
  const door = component.getByRole("button", { name: MODEL_ROLES_DOOR });
  await expect(door).toBeVisible();
  // The door sits under the switch that asks for the Utility model, not under the speaker-order select.
  const switchBox = await component.getByRole("switch", UTILITY_UPGRADE).boundingBox();
  const doorBox = await door.boundingBox();
  expect(doorBox?.y ?? 0).toBeGreaterThan(switchBox?.y ?? Number.POSITIVE_INFINITY);
});

// F1 SWITCH pin (stickler review 2026-07-16-merge-block-28523122): this form mounts under
// ContextTabsPanel, which keys by TAB id only. Switching chats with the Group tab open must remount the
// form on the new chat's identity (keyed ABOVE the hook owner) — else chat A's frozen FormApi survives and
// its config autosaves into chat B. A seeds groupNudge=true, B seeds groupNudge=false (a field the test
// never touches — the decisive tell of WHICH seed is live). Dirty A by toggling the per-speaker card scope,
// switch to B, then toggle it on B: the saved config's UNTOUCHED groupNudge must read B's false, never A's
// frozen true.
test("SWITCH pin — switching chats reseeds the form on the new chat, never the previous chat's frozen config", async ({ mount }) => {
  const component = await mount(<GroupConfigSwitchStory />);

  // Chat A (groupNudge=true). Dirty it via a DIFFERENT field so the FormApi is non-default → the leg-3-style
  // teardown/persistence hazard is live: toggle the card scope. The save carries A's groupNudge=true.
  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("switch", { name: "Each character sees only their own card" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":true');

  // Switch to chat B (groupNudge=false). The remount closes Advanced; toggle the card scope on B, and the whole
  // saved config must carry B's OWN untouched groupNudge=false. A leaked A instance would save true here.
  await component.getByRole("button", { name: "switch chat" }).click();
  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("switch", { name: "Each character sees only their own card" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":false');
});

// ── #1501 · THE ADAPTER MUST NOT SWALLOW THE REJECTION ────────────────────────────────────────────
// `CommittedGroupConfigTab` wired the mutation in as
// `setGroupConfig.mutateAsync(...).catch(() => undefined)`, which made EVERY rejection resolve. The shared
// autosave form decides saved-vs-failed by exactly that: `create-autosave-entity-form.tsx`'s `onSubmit`
// re-baselines to the submitted value, clears the crash draft and reports "saved" on resolve. So a rejected
// write was recorded as the new saved truth and the edit's only durable copy was dropped — a silent lie
// about persistence, on a room's generation behaviour.
//
// THE OBSERVABLE IS THE FORM'S OWN TEARDOWN FLUSH, which is the mechanism that made this cost something
// real: on unmount the session flushes an edit that is still unsaved. With the rejection swallowed the
// baseline had already moved, so there was nothing to flush and the edit died with the tab. This is the
// wire-visible difference, and it is exactly the user-facing consequence (the edit survives, or it does
// not). The pure-form stories above cannot see any of it — they carry a local `save` and never touch the
// adapter.
test("a REJECTED save is not recorded as saved — leaving the tab re-sends the edit (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getGroupConfig": () => DEFAULT_GROUP_CONFIG,
    "chat.setGroupConfig": () => trpcError({ message: "group config write failed" }),
  });
  const component = await mount(<CommittedGroupConfigTabStory />);

  await component.getByRole("button", { name: "Narrator" }).click();
  await expect.poll(() => trpc.count("chat.setGroupConfig"), { intervals: [20, 50, 100, 200] }).toBe(1);

  await component.getByRole("button", { name: "Leave the tab" }).click();
  // The edit was never persisted, so the ONE teardown flush must re-send it. A swallowed rejection makes
  // this stay at 1 forever, with the edit gone.
  await expect.poll(() => trpc.count("chat.setGroupConfig"), { intervals: [20, 50, 100, 200] }).toBe(2);
  await expect.poll(() => (trpc.lastInput("chat.setGroupConfig") as { config?: { output?: string } } | undefined)?.config?.output).toBe("narrator");
});

// The other direction, so a fix that simply always re-flushes cannot pass: a save that LANDED is the new
// baseline, and leaving the tab sends nothing more.
test("a SUCCESSFUL save IS the new baseline — leaving the tab sends nothing more (#1501, the other direction)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getGroupConfig": () => DEFAULT_GROUP_CONFIG,
    "chat.setGroupConfig": () => DEFAULT_GROUP_CONFIG,
  });
  const component = await mount(<CommittedGroupConfigTabStory />);

  await component.getByRole("button", { name: "Narrator" }).click();
  await expect.poll(() => trpc.count("chat.setGroupConfig"), { intervals: [20, 50, 100, 200] }).toBe(1);

  await component.getByRole("button", { name: "Leave the tab" }).click();
  await expect.poll(() => trpc.count("chat.setGroupConfig"), { intervals: [20, 50, 100, 200] }).toBe(1);
});
