// Activating a preset tells itself where it is done: no toast repeats it, and focus is on the element that now states the result. On the
// library's radio the pressed control stays and is now checked; on the editor's header the Activate button leaves, so focus lands on the
// status that now reads Active.
// @subject packages/client/src/features/preset/components/preset-editor-header.tsx
// @subject packages/client/src/features/preset/components/preset-library-row.tsx

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import { watchToastMounts } from "@orb/testkit/browser/spec";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { absenceWindow, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { PRESET_ACTIVATE_NAME, PRESET_ACTIVE_RADIOGROUP_NAME, PRESET_ACTIVE_STATUS, PRESET_EDITOR_NAME } from "#client/features/preset/lib/preset-names.ts";
import type { PresetActivationStory } from "./_preset-activation-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-activation-stories/PresetActivationStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.updateUserSettingsSection",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const STREAM_ROUTES: TrpcRoutes<"stream.attach" | "stream.detach"> = {
  "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
};
const TOAST_WINDOW_MS = 300;
const PRESET_NAME = "Activation target preset";

/** Carries the server's own `settingsChanged` event to the page, so the settings write that activates a preset reaches the rows. */
async function forwardSettingsEvent(page: Page, root: ServerTestHarness): Promise<AsyncDisposable & { readonly listening: Promise<void> }> {
  const listening = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const stop = new AbortController();
  let started = false;
  await routeOrbSocket(page, {
    awaitRooms: [{ channel: "user" }],
    frames: async (signal): Promise<readonly StreamFrame[]> => {
      started = true;
      const events = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, AbortSignal.any([signal, stop.signal]));
      listening.resolve();
      try {
        for await (const event of events) {
          if (event.type === "settingsChanged") {
            return [{ channel: "user", event }];
          }
        }
        return [];
      } catch (error) {
        if (!stop.signal.aborted) {
          throw error;
        }
        return [];
      } finally {
        joined.resolve();
      }
    },
  });
  return {
    listening: listening.promise,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      stop.abort();
      if (started) {
        await joined.promise;
      }
    },
  };
}

test.use({ viewport: { width: 1280, height: 900 } });

test("pressing a row's radio activates its preset: the radio is checked and still focused, and no toast says so", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
  const preset = await caller.preset.create({ name: PRESET_NAME, kind: "generation" });
  await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...STREAM_ROUTES });
  await using events = await forwardSettingsEvent(page, root);
  const toasts = await watchToastMounts(page);
  await mount<typeof PresetActivationStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
  const radio = page
    .getByRole("radiogroup", { name: PRESET_ACTIVE_RADIOGROUP_NAME, exact: true })
    .locator('[data-slot="list-row-root"]')
    .filter({ has: page.getByRole("button", { name: preset.name, exact: true }) })
    .getByRole("radio");
  await events.listening;
  await expect(radio).toHaveAccessibleName(`Activate ${preset.name} for generation`);
  await expect(radio).not.toBeChecked();

  await radio.click();

  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
  await absenceWindow(page, TOAST_WINDOW_MS);
  expect(await toasts()).toBe(0);
  expect((await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(preset.id);
});

test("pressing the editor header's Activate leaves focus on the status that now reads Active, and no toast says so", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
  const preset = await caller.preset.create({ name: PRESET_NAME, kind: "generation" });
  await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...STREAM_ROUTES });
  await using events = await forwardSettingsEvent(page, root);
  const toasts = await watchToastMounts(page);
  await mount<typeof PresetActivationStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
  await events.listening;
  await page.getByRole("button", { name: preset.name, exact: true }).click();
  const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
  await expect(editor).toBeVisible();
  const activate = editor.getByRole("button", { name: PRESET_ACTIVATE_NAME, exact: true });
  const status = editor.getByRole("status").filter({ hasText: new RegExp(`^${RegExp.escape(PRESET_ACTIVE_STATUS)}$`, "u") });
  await expect(status).toHaveCount(0);

  await activate.focus();
  await page.keyboard.press("Enter");

  await expect(activate).toHaveCount(0);
  await expect(status).toBeFocused();
  await expect(status).toMatchAriaSnapshot(`- status: ${PRESET_ACTIVE_STATUS}`);
  await absenceWindow(page, TOAST_WINDOW_MS);
  expect(await toasts()).toBe(0);
  expect((await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(preset.id);
});
