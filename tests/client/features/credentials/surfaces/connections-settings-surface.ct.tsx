// CT: Settings → Connections → Model roles, the LIVE-vs-DRAFT contract (the 2026-08-01 owner incident).
// The pane is autosaved, so what it renders is FORM state: for two hours it showed a full
// "OpenRouter · Claude Sonnet 5 · Protocol Auto" row under a "Saved" chip while `roleDefaults` was NULL in
// the DB and every turn resolved the owner fallback. A row must therefore disclose, per row, whether it is
// showing the persisted connection or an unsaved draft — and name what a turn resolves meanwhile.
//
// Drives the PRODUCTION path: the real surface over the real data layer, with the reads + the
// `settings.updateUserSettingsSection` write stubbed at the network (routeTrpc). The write is GATED (held
// open) so the drafting states are observable rather than inferred. The bus is absent in CT, so the
// story's "refetch settings" button stands in for the `settingsChanged` refetch that `busDriven: true`
// mutations rely on.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ConnectionsSettingsStory } from "../_ct-stories";

const SYNC_CHIP = '[data-slot="role-row-sync"]';
const AUTOSAVE_STATUS = '[data-slot="autosave-status"]';
const COMMAND_ITEM = '[data-slot="command-item"]';
/** The held write's route matcher (top-level per biome's useTopLevelRegex). */
const SAVE_ROUTE = /updateUserSettingsSection/;

const LIVE_MODEL = "anthropic/claude-sonnet-5";
const DRAFT_MODEL = "openai/gpt-5";
/** What a SECOND device persists under a live pane — never this session's own pick. */
const FOREIGN_MODEL = "anthropic/claude-opus-5";

/** The per-source facade the model cell + status dot read (connection.getModelsForSource). */
const OR_MODELS = {
  state: "ok",
  models: [
    { id: LIVE_MODEL, label: "Claude Sonnet 5", origin: "catalog" },
    { id: DRAFT_MODEL, label: "GPT-5", origin: "catalog" },
  ],
  fetchedAt: 1_700_000_000_000,
  defaultModelId: LIVE_MODEL,
  allowsFreeText: false,
};

/** The settings stub's handle: the recorder plus a FOREIGN-write hook (another device/tab moving the stored
 *  row under a live pane — the case that decides whether the disclosure names the CURRENT persisted pair). */
interface SettingsStub {
  readonly recorder: TrpcRecorder;
  readonly setStored: (next: Record<string, unknown>) => void;
}

/** A stateful stub of the user-settings tier: the write stores the patch, the read serves it back — so the
 *  "did the pane go back to LIVE after the save landed?" arm runs against a real echo, not a scripted one. */
async function stubSettings(page: Page, roleDefaults: Record<string, unknown>): Promise<SettingsStub> {
  let stored = roleDefaults;
  const view = (): unknown => ({
    userId: "user_ct_connections",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, routing: { roleDefaults: stored } },
    updatedAt: 0,
  });
  const recorder = await routeTrpc(page, {
    "settings.getUserSettings": () => view(),
    "sessions.me": () => ({ userId: "user_ct_connections", handle: "owner", globalRole: "owner" }),
    "credentials.list": () => [],
    "connection.getModelsForSource": () => OR_MODELS,
    "settings.updateUserSettingsSection": (input: unknown): unknown => {
      stored = (input as { readonly patch: { readonly roleDefaults: Record<string, unknown> } }).patch.roleDefaults;
      return view();
    },
  });
  return {
    recorder,
    setStored: (next: Record<string, unknown>): void => {
      stored = next;
    },
  };
}

/** Hold `updateUserSettingsSection` open; the returned fn lets it through. Registered AFTER routeTrpc so it
 *  wins the route, then `fallback()`s into the stub once released. */
async function gateTheSave(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(SAVE_ROUTE, async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}

test("a drafted row says so and names what a turn still resolves; it reads LIVE again only once the save lands", async ({ mount, page }) => {
  const { recorder } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  const release = await gateTheSave(page);
  await mount(<ConnectionsSettingsStory />);

  // The persisted pane: every row IS the live connection, so nothing is disclosed and the status is honest.
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("Claude Sonnet 5");
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");

  // Pick a different model — an edit, not a save.
  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();

  // THE PIN: the row immediately admits it is a draft AND names the connection turns still use. The pane
  // header may not read "Saved" while a draft is on screen (the phantom the owner debugged from).
  await expect(page.locator(SYNC_CHIP)).toHaveCount(1);
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");
  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${LIVE_MODEL}`);
  await expect(page.locator(AUTOSAVE_STATUS).first()).not.toHaveText("Saved");

  // The debounce fires into the HELD mutation: the row escalates to its saving state — still not "Saved".
  await expect(page.locator(SYNC_CHIP)).toContainText("Saving…");
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saving…");

  // Let the write through, then replay the bus-driven settings refetch.
  release();
  await expect.poll(() => recorder.count("settings.updateUserSettingsSection")).toBe(1);
  // ONESHOT-OK: the poll above settled the recorder at exactly one recorded call — this reads THAT input.
  expect(recorder.lastInput("settings.updateUserSettingsSection")).toMatchObject({
    section: "routing",
    patch: { roleDefaults: { chat: { source: "openrouter", model: DRAFT_MODEL, api: "chat-completions" } } },
  });
  await page.getByRole("button", { name: "refetch settings" }).click();

  // Persisted at last: the disclosure retires itself and the pane reads Saved — the row IS the truth again.
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");
});

// THE 2026-08-02 STUCK-CHIP REGRESSION. The pane's whole honesty is computed against `settings.
// getUserSettings`, and the write that invalidates it is `busDriven: true` — so before this pin the
// disclosure could only retire when a `settingsChanged` bus tick came back and refetched the read. With the
// user-bus stream dropped/late (a reconnect gap, a coalesced invalidate), the owner's five 200-OK saves left
// the row stuck on "Not applied yet — a turn still uses OpenRouter · anthropic/claude-sonnet-…" over a
// selection the DB already held, and the pane's status stuck on "Saving…". A confirmed write is strictly
// newer than the snapshot it was computed from: the pane must trust its own landed save. NO refetch is
// replayed here — that is the point of the test.
test("a landed save retires the disclosure with NO refetch — a persisted selection is never called 'not applied'", async ({ mount, page }) => {
  const { recorder } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");

  await expect.poll(() => recorder.count("settings.updateUserSettingsSection")).toBe(1);

  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("GPT-5");
});

// The disclosure's OTHER failure direction: naming a stale pair. "A turn still uses X" is a claim about the
// SERVER's row right now, so it must track the live read — never the snapshot the editing session mounted
// on. A second device moving the stored row under a dirty pane must re-aim the sentence at the new pair.
test("a drafted row names the CURRENT persisted pair, not the baseline its session mounted on", async ({ mount, page }) => {
  const { setStored } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  const release = await gateTheSave(page);
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${LIVE_MODEL}`);

  // Another device rewrites the row; the pane's read refetches while this session's edit is still in flight.
  setStored({ chat: { source: "openrouter", model: FOREIGN_MODEL, api: "chat-completions" } });
  await page.getByRole("button", { name: "refetch settings" }).click();

  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${FOREIGN_MODEL}`);
  // Still a draft (the held save never landed) — the disclosure re-aimed, it did not retire.
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("GPT-5");
  release();
});

// The other half of the incident — the owner picked a model and hit REFRESH — is NOT closed by a flush: a
// reload never unmounts React, and a `pagehide` handler was measured to dispatch nothing before teardown
// (create-autosave-entity-form.tsx documents the rejection). What IS closed is the honesty: a reload mid-edit
// re-seeds from the server, and the pane shows the PERSISTED row, never the lost draft dressed as saved.
test("a reload mid-edit shows the persisted connection again — the lost draft is not re-rendered as live", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");

  await page.reload();
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("Claude Sonnet 5");
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
});

test("a NEVER-SAVED pane does not read as configured — the rows name the app default, not a selection", async ({ mount, page }) => {
  // roleDefaults NULL in the DB: exactly the owner's 08:43–10:27 state.
  await stubSettings(page, {});
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("Uses the app default").first()).toBeVisible();
  // Nothing is drafted, so nothing is disclosed — and no row claims a provider/model it never had.
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chat model" })).toHaveCount(0);
});
