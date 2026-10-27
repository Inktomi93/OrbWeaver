import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { StreamFrame } from "@orb/contracts/stream";
import { holdServed, routeOrbSocket, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { RosterMemberSaveStory } from "./_member-save-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const STORY = "tests/client/features/roster-preset/surfaces/_member-save-stories/RosterMemberSaveStory";
const OPENED_NAME = "Baseline roster";
const SAVED_NAME = "Saved baseline roster";

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

async function seedRoster(caller: Caller): Promise<{
  readonly input: ReturnType<typeof createRosterPresetSchema.parse>;
  readonly roster: Awaited<ReturnType<Caller["rosterPreset"]["create"]>>;
}> {
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const template = (await caller.rosterPreset.list()).find((row) => row.rules.length > 0 && row.anchorPersonaId !== null);
  if (template === undefined) {
    throw new Error("The corpus needs a rule-carrying roster with an anchor persona");
  }
  const original = await caller.rosterPreset.get({ presetId: template.id });
  const input = createRosterPresetSchema.parse({
    ...original,
    name: OPENED_NAME,
    description: "The original roster description.",
    game: original.game ?? {},
    groupConfig: original.groupConfig ?? { policy: "list", cardScope: "scoped", output: "per-speaker" },
    members: original.members.map((member) => ({ ...member, kind: "character" })),
  });
  const roster = await caller.rosterPreset.create({ input });
  return { input, roster };
}

async function firstRosterFrame(events: ReturnType<Root["app"]["liveBuses"]["user"]["subscribeUserEvents"]>): Promise<readonly StreamFrame[]> {
  for await (const event of events) {
    if (event.type === "rosterPresetsChanged") {
      return [{ channel: "user", event }];
    }
  }
  return [];
}

async function routeMember(
  page: Page,
  caller: Caller,
  root: Root,
  options: { readonly resources: AsyncDisposableStack; readonly delayed?: boolean },
): Promise<{
  readonly calls: Awaited<ReturnType<typeof routeTrpc>>;
  readonly held: ReturnType<typeof holdServed>;
  readonly listening: Promise<void>;
}> {
  const held = holdServed();
  let holdNext = options.delayed ?? false;
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "rosterPreset.count", "rosterPreset.get", "automation.listRulePresets"]),
    ...serveCorpusProcedures(caller, ["rosterPreset.update"], () => {
      const holdRequest = holdNext;
      holdNext = false;
      return holdRequest ? held : undefined;
    }),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  options.resources.defer(async () => {
    stop.abort();
    held.fail();
    if (started) {
      await joined.promise;
    }
  });
  await routeOrbSocket(page, {
    awaitAttaches: 1,
    frames: async (signal) => {
      started = true;
      const events = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, AbortSignal.any([signal, stop.signal]));
      listening.resolve();
      try {
        return await firstRosterFrame(events);
      } catch (error) {
        if (!(stop.signal.aborted || signal.aborted)) {
          throw error;
        }
        return [];
      } finally {
        joined.resolve();
      }
    },
  });
  return { calls, held, listening: listening.promise };
}

test("a successful own save acknowledges the saved baseline and preserves every non-metadata field", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using resources = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const { roster } = await seedRoster(caller);
  const wire = await routeMember(page, caller, root, { resources });
  const component = await mount<typeof RosterMemberSaveStory>(STORY, { presetId: roster.id });
  const editor = page.locator('[data-slot="roster-member-editor"]');
  const save = editor.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill(` ${SAVED_NAME} `);
  await editor.getByRole("textbox", { name: "Description", exact: true }).fill("The saved description.");
  await expect(save).toBeEnabled();
  await wire.listening;
  await save.click();
  await expect(editor.getByRole("heading", { name: SAVED_NAME, exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(editor.locator('[data-slot="roster-editor-conflict"]')).toHaveCount(0);
  const saved = await caller.rosterPreset.get({ presetId: roster.id });
  expect(saved).toMatchObject({
    name: SAVED_NAME,
    description: "The saved description.",
    members: roster.members,
    rules: roster.rules,
    game: roster.game,
    groupConfig: roster.groupConfig,
    anchorPersonaId: roster.anchorPersonaId,
  });
  expect(wire.calls.count("rosterPreset.update")).toBe(1);
  await component.unmount();
});

test("typing during an own save remains dirty against the acknowledged result without a false conflict", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using resources = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const { roster } = await seedRoster(caller);
  const wire = await routeMember(page, caller, root, { resources, delayed: true });
  const component = await mount<typeof RosterMemberSaveStory>(STORY, { presetId: roster.id });
  const editor = page.locator('[data-slot="roster-member-editor"]');
  const name = editor.getByRole("textbox", { name: "Name", exact: true });
  const description = editor.getByRole("textbox", { name: "Description", exact: true });
  const save = editor.getByRole("button", { name: "Save", exact: true });
  await name.fill(SAVED_NAME);
  await wire.listening;
  await save.click();
  await wire.held.requested;
  await expect(save).toBeDisabled();
  await name.fill("Typed during save");
  await description.fill("Description typed while the first save was pending.");
  wire.held.release();
  await expect(editor.getByRole("heading", { name: SAVED_NAME, exact: true })).toBeVisible();
  await expect(name).toHaveValue("Typed during save");
  await expect(description).toHaveValue("Description typed while the first save was pending.");
  await expect(save).toBeEnabled();
  await expect(editor.locator('[data-slot="roster-editor-conflict"]')).toHaveCount(0);
  expect((await caller.rosterPreset.get({ presetId: roster.id })).description).toBe(roster.description);
  expect(wire.calls.count("rosterPreset.update")).toBe(1);
  await save.click();
  await expect(editor.getByRole("heading", { name: "Typed during save", exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  expect(wire.calls.count("rosterPreset.update")).toBe(2);
  await component.unmount();
});

test("a real external writer remains a conflict and abandoning the draft reopens the persisted version", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using resources = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const { roster, input } = await seedRoster(caller);
  const wire = await routeMember(page, caller, root, { resources });
  const component = await mount<typeof RosterMemberSaveStory>(STORY, { presetId: roster.id });
  const editor = page.locator('[data-slot="roster-member-editor"]');
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Local unsaved roster");
  await wire.listening;
  const externalName = "Roster saved in another window";
  await caller.rosterPreset.update({ presetId: roster.id, input: { ...input, name: externalName, description: "The external description." } });
  await expect(editor.getByRole("heading", { name: externalName, exact: true })).toBeVisible();
  const conflict = editor.locator('[data-slot="roster-editor-conflict"]');
  await expect(conflict).toContainText("changed elsewhere");
  await expect(conflict).toContainText(externalName);
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Local unsaved roster");
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Back to Rosters", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: externalName, exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(externalName);
  await expect(editor.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("The external description.");
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(editor.locator('[data-slot="roster-editor-conflict"]')).toHaveCount(0);
  expect(wire.calls.count("rosterPreset.update")).toBe(0);
  expect((await caller.rosterPreset.get({ presetId: roster.id })).name).toBe(externalName);
  await component.unmount();
});
