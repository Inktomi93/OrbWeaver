// @subject packages/client/src/features/preset/components/readout/preset-readout.tsx
// The Presets readout pane reads through the shared boundary: a held read shows the loading state, a failed one the shared error
// block with a Retry that refetches. The panels whose estimates need no read keep them on screen, and a host-gated read a
// member may not make says so as the typed refusal it is.

import type { ChatId } from "@orb/kit/ids";
import {
  heldThenFailing,
  holdServed,
  routeAuthConfig,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  PRESET_ACTIONS_PREVIEW_READ_LABEL,
  PRESET_BOUND_COSTS_READ_LABEL,
  PRESET_CAPABILITY_CONNECTION_NAME,
  PRESET_HIDE_PREVIEW_NAME,
  PRESET_READOUT_ACTIVE_LABEL,
  PRESET_READOUT_BUDGET_LABEL,
  PRESET_READOUT_NOT_HOST_INSPECTED,
  PRESET_READOUT_NOT_HOST_PRICED,
  PRESET_READOUT_PRICING_STATUS,
  PRESET_READOUT_READ_LABEL,
  PRESET_READOUT_STAGE_UNREAD,
  PRESET_SHOW_PREVIEW_NAME,
  PRESET_TRANSFORMS_READ_LABEL,
  PRESET_USAGE_READ_LABEL,
  presetActionReadoutName,
} from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PresetReadoutStory } from "./_preset-readout-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-readout-stories/PresetReadoutStory";
const REFUSAL = "No chat model resolves for this role";
const READOUT_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  "preset.listUsage",
  "regex.listForPreset",
  "chat.previewAssembly",
  "chat.previewActionTemplates",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

async function setup(
  root: Harness,
  page: Page,
): Promise<{ readonly host: Caller; readonly chatId: ChatId; readonly presetId: Awaited<ReturnType<Caller["preset"]["create"]>>["id"] }> {
  const host = await root.internalCallerFor(root.ownerId);
  const preset = await host.preset.create({ name: "Readout witness", kind: "generation" });
  const room = (await host.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no chat to bind the readout to");
  }
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  return { host, chatId: room.id, presetId: preset.id };
}

test("a held used-by read shows the loading state, a failed one the error block, and Retry shows the binding", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["preset.listUsage"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "data", chatId: null });
  const usage = page.locator('[data-slot="preset-usage"]');
  await read.hold.requested;
  await expect(usage.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(usage.getByText(queryFailedLabel(PRESET_USAGE_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await usage.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(usage.getByText(queryFailedLabel(PRESET_USAGE_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(usage.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("the open preset's own read failing shows the readout error block, and Retry shows the panel", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["preset.get"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "data", chatId: null });
  await read.hold.requested;
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(PRESET_READOUT_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(PRESET_READOUT_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="preset-usage"]')).toBeVisible();
});

test("the active-preset readout holds, fails and retries through the same boundary", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["preset.list"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId: null, view: "data", chatId: null });
  await read.hold.requested;
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(PRESET_READOUT_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(PRESET_READOUT_ACTIVE_LABEL, { exact: true })).toBeVisible();
});

test("Transforms keeps its pipeline while the attached scripts are held, says it could not read them on failure, and Retry counts them", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["regex.listForPreset"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "transforms", chatId: null });
  const stages = page.locator("[data-pipeline-step]");
  await read.hold.requested;
  await expect(stages.first()).toBeVisible();
  await expect(stages.filter({ hasText: "…" }).first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(PRESET_TRANSFORMS_READ_LABEL), { exact: true })).toBeVisible();
  await expect(stages.filter({ hasText: PRESET_READOUT_STAGE_UNREAD }).first()).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(PRESET_TRANSFORMS_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(stages.filter({ hasText: PRESET_READOUT_STAGE_UNREAD })).toHaveCount(0);
  await expect(stages.filter({ hasText: "…" })).toHaveCount(0);
});

test("Prompt keeps its estimates while pricing is held, a host-only refusal is said as one, and any other failure offers Retry", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId, chatId } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["chat.previewAssembly"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "prompt", chatId });
  await read.hold.requested;
  await expect(page.getByText(PRESET_READOUT_PRICING_STATUS, { exact: true })).toBeVisible();
  await expect(page.getByText(PRESET_READOUT_BUDGET_LABEL, { exact: true })).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(PRESET_BOUND_COSTS_READ_LABEL), { exact: true })).toBeVisible();
  await expect(page.getByText(PRESET_READOUT_BUDGET_LABEL, { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(PRESET_BOUND_COSTS_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(page.getByText(PRESET_READOUT_PRICING_STATUS, { exact: true })).toHaveCount(0);
});

test("Prompt keeps the assembled preview open and focused while the pricing lands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId, chatId } = await setup(root, page);
  const read = heldThenFailing();
  read.recover();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["chat.previewAssembly"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "prompt", chatId });
  await read.hold.requested;
  await page.getByRole("button", { name: PRESET_SHOW_PREVIEW_NAME, exact: true }).click();
  const hide = page.getByRole("button", { name: PRESET_HIDE_PREVIEW_NAME, exact: true });
  await expect(hide).toBeFocused();
  read.hold.release();
  await expect(page.getByText(PRESET_READOUT_PRICING_STATUS, { exact: true })).toHaveCount(0);
  await expect(hide).toBeFocused();
});

test("Prompt says a member cannot price a room they do not host, with no Retry", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId, chatId } = await setup(root, page);
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["chat.previewAssembly"], () => trpcError({ code: "FORBIDDEN" })),
  });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "prompt", chatId });
  await expect(page.getByText(PRESET_READOUT_NOT_HOST_PRICED, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
});

test("Actions holds, fails and retries the resolved preview, and says the host-only refusal as one", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId, chatId } = await setup(root, page);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(host, READOUT_READS), ...serveCorpusProcedures(host, ["chat.previewActionTemplates"], read.intercept) });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "actions", chatId });
  await read.hold.requested;
  const resolved = page.getByRole("region", { name: new RegExp(`^${RegExp.escape(presetActionReadoutName(""))}`, "u") }).locator('[aria-busy="true"]');
  await expect(resolved).toBeVisible();
  // The builder's lead finds the region; the literal pins it.
  await expect(page.getByRole("region", { name: /^Action readout: /u }).first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(PRESET_ACTIONS_PREVIEW_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(PRESET_ACTIONS_PREVIEW_READ_LABEL), { exact: true })).toHaveCount(0);
});

test("Params says a no-chat-model refusal through the profile's failure band beside a standing Select, and Retry shows the profile", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const hold = holdServed();
  let phase: "hold" | "refuse" | "serve" = "hold";
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["preset.resolveEffective"], () => {
      if (phase === "hold") {
        phase = "refuse";
        return hold;
      }
      return phase === "refuse" ? trpcError({ code: "BAD_REQUEST", message: REFUSAL }) : undefined;
    }),
  });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "params", chatId: null });
  await hold.requested;
  const select = page.getByRole("combobox", { name: PRESET_CAPABILITY_CONNECTION_NAME, exact: true });
  await expect(select).toBeVisible();
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  hold.fail();
  await expect(page.getByText(REFUSAL, { exact: true })).toBeVisible();
  await expect(select).toBeVisible();
  phase = "serve";
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(REFUSAL, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/· chat role/u)).toBeVisible();
});

test("Params keeps the settled profile on screen while a switched connection's profile is held", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["preset.resolveEffective"], (input) =>
      input.target?.kind === "role" && input.target.task === "summarize" ? hold : undefined,
    ),
  });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "params", chatId: null });
  const signature = page.getByText(/· chat role/u);
  await expect(signature).toBeVisible();
  await page.getByRole("combobox", { name: PRESET_CAPABILITY_CONNECTION_NAME, exact: true }).click();
  await page.getByRole("option", { name: "Utility model role", exact: true }).click();
  await hold.requested;
  await expect(signature).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  hold.release();
  await expect(page.getByText(/· utility model role/u)).toBeVisible();
});

test("Params reads the Utility role after the Chat role's refusal instead of keeping the refusal", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["preset.resolveEffective"], (input) =>
      input.target?.kind === "role" && input.target.task === "chat" ? trpcError({ code: "BAD_REQUEST", message: REFUSAL }) : undefined,
    ),
  });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "params", chatId: null });
  await expect(page.getByText(REFUSAL, { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: PRESET_CAPABILITY_CONNECTION_NAME, exact: true }).click();
  await page.getByRole("option", { name: "Utility model role", exact: true }).click();
  await expect(page.getByText(REFUSAL, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/· utility model role/u)).toBeVisible();
});

test("the readout reads a newly opened preset after the previous one failed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId } = await setup(root, page);
  const other = await host.preset.create({ name: "Second witness", kind: "generation" });
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["preset.get"], (input) => (input.id === presetId ? trpcError({ code: "BAD_REQUEST" }) : undefined)),
  });
  const component = await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "data", chatId: null });
  await expect(page.getByText(queryFailedLabel(PRESET_READOUT_READ_LABEL), { exact: true })).toBeVisible();
  await component.update({ presetId: other.id, view: "data", chatId: null });
  await expect(page.getByText(queryFailedLabel(PRESET_READOUT_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="preset-usage"]')).toBeVisible();
});

test("Actions says a member cannot inspect a room they do not host, with no Retry", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { host, presetId, chatId } = await setup(root, page);
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, READOUT_READS),
    ...serveCorpusProcedures(host, ["chat.previewActionTemplates"], () => trpcError({ code: "FORBIDDEN" })),
  });
  await mount<typeof PresetReadoutStory>(STORY, { presetId, view: "actions", chatId });
  await expect(page.getByText(PRESET_READOUT_NOT_HOST_INSPECTED, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
});
