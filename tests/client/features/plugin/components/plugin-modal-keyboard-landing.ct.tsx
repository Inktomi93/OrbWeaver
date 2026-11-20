// A plugin's two house modals, opened from the command palette by keyboard: a command that declares arguments opens the argument
// form, and a command whose run asks for a dialog opens it as the outcome of the press. A real guest registers both through the
// production host, so the palette rows, the run and the outcome are all production. The Plugin pages section opened from the rail
// lands focus on its list while the list is on screen, and on the page pane when the list is collapsed.
// @subject packages/client/src/features/app-shell/components/modal-host.tsx
import { spawn } from "node:child_process";
import { testId } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { COMMAND_MODAL_TITLE } from "#client/features/chat/lib/command-palette-names.ts";
import { humanizeId, PLUGIN_COMMAND_ARGS_TITLE, pluginCommandActionLabel } from "#client/features/plugin/lib/plugin-command-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { dialogBodyAnchor } from "../../../components/_dialog-landing.ts";
import type { PluginRoomShellStory } from "../_ct-stories.tsx";

const STORY = "tests/client/features/plugin/_ct-stories/PluginRoomShellStory";
// One command per argument kind the form renders, each landing focus on its one argument by that control's own role.
const ARG_COMMANDS = [
  { command: "weigh", field: "grams", type: "number", role: "textbox" },
  { command: "label_it", field: "label", type: "string", role: "textbox" },
  { command: "choose", field: "colour", type: "enum", role: "combobox" },
  { command: "flip", field: "swap", type: "boolean", role: "switch" },
] as const;
const ENUM_VALUES = ["red", "blue"];
const DIALOG_COMMAND = "open_ledger";
const DIALOG_TITLE = "Ledger";
const DIALOG_TEXT = "The ledger balances.";
const SOURCE = `const host = orb.host(1);
${ARG_COMMANDS.map(({ command, field, type }) => `host.ui.registerCommand({ name: "${command}", describe: "Run ${command}", args: [{ name: "${field}", type: "${type}", describe: "The ${field}"${type === "enum" ? `, enumValues: ${JSON.stringify(ENUM_VALUES)}` : ""} }], onRun: async () => {} });`).join("\n")}
host.ui.registerCommand({ name: "${DIALOG_COMMAND}", describe: "Open the ledger", onRun: async () => { await host.ui.openDialog("ledger_dialog"); } });
host.ui.register({ id: "ledger_page", anchor: "page", title: "Ledger page", tier: "static", spec: { kind: "text", value: "The ledger page." } });
host.ui.register({ id: "ledger_dialog", anchor: "dialog", title: "${DIALOG_TITLE}", tier: "static", spec: { kind: "text", value: "${DIALOG_TEXT}" } });`;

async function openRoomWithGuest(
  page: Page,
  root: Awaited<ReturnType<typeof createCorpusHarness>>,
  corpus: Parameters<typeof createShellAmbientReads>[0],
  show: (chatId: ChatId) => Promise<unknown>,
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus needs a room");
  }
  const manifest = pluginManifestSchema.parse({
    id: "landing-witness",
    name: "Landing witness",
    description: "A native guest with an argument command and a dialog.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, SOURCE, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "plugin.listCommands",
      "plugin.invokeUiCommand",
      "plugin.listSurfaces",
      "plugin.getSurfaceState",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  await show(room.id);
  await expect.poll(() => rpc.count("plugin.listCommands")).toBeGreaterThan(0);
}

/** Presses a control with the keyboard alone: focus it, then Enter. */
async function pressByKeyboard(control: Locator): Promise<void> {
  await control.focus();
  await control.press("Enter");
}

async function pickFromPalette(page: Page, command: string): Promise<void> {
  await page.keyboard.press("Control+KeyK");
  const palette = page.getByRole("dialog", { name: COMMAND_MODAL_TITLE, exact: true });
  await expect(palette.getByRole("combobox")).toBeFocused();
  await page.keyboard.type(command);
  await expect(palette.getByRole("option", { name: new RegExp(`^${RegExp.escape(pluginCommandActionLabel(command))}`, "u") })).toBeVisible();
  await page.keyboard.press("Enter");
}

for (const { command, field, type, role } of ARG_COMMANDS) {
  test(`a command whose first argument is a ${type} opens the argument form with focus on it`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
    await seedShellState(page, { activeSection: "chats" });
    await openRoomWithGuest(page, root, corpus, (chatId) => mount<typeof PluginRoomShellStory>(STORY, { chatId }));
    await pickFromPalette(page, command);
    await expect(page.getByRole("dialog").getByRole("heading", { name: PLUGIN_COMMAND_ARGS_TITLE, exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole(role, { name: humanizeId(field), exact: true })).toBeFocused();
  });
}

test("the argument form tabs from its field to Cancel and then the named run, Escape abandons it, and Enter in the field runs it", async ({
  corpus,
  mount,
  page,
}) => {
  const { command, field } = ARG_COMMANDS[1];
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await seedShellState(page, { activeSection: "chats" });
  await openRoomWithGuest(page, root, corpus, (chatId) => mount<typeof PluginRoomShellStory>(STORY, { chatId }));
  await pickFromPalette(page, command);
  const dialog = page.getByRole("dialog", { name: PLUGIN_COMMAND_ARGS_TITLE, exact: true });
  const input = dialog.getByRole("textbox", { name: humanizeId(field), exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: pluginCommandActionLabel(command), exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await pickFromPalette(page, command);
  await expect(input).toBeFocused();
  await input.fill("Harbour");
  await input.press("Enter");
  await expect(dialog).toHaveCount(0);
});

test("a command whose run opens a plugin dialog lands focus on that dialog's body", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await seedShellState(page, { activeSection: "chats" });
  await openRoomWithGuest(page, root, corpus, (chatId) => mount<typeof PluginRoomShellStory>(STORY, { chatId }));
  await pickFromPalette(page, DIALOG_COMMAND);
  await expect(page.getByRole("dialog").getByText(DIALOG_TEXT, { exact: true })).toBeVisible();
  await expect(dialogBodyAnchor(page)).toBeFocused();
});

test("the Plugin pages rail button by keyboard lands focus on the pages list while it is on screen", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await seedShellState(page, { activeSection: "chats" });
  await openRoomWithGuest(page, root, corpus, (chatId) => mount<typeof PluginRoomShellStory>(STORY, { chatId }));

  await pressByKeyboard(page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.extensions, exact: true }));

  await expect(page.getByTestId(testId("extensionsSwitcher"))).toBeFocused();
});

test("the Plugin pages rail button by keyboard lands focus on the page pane when the list is collapsed", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { extensions: { list: "collapsed" } } });
  await openRoomWithGuest(page, root, corpus, (chatId) => mount<typeof PluginRoomShellStory>(STORY, { chatId }));

  await pressByKeyboard(page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.extensions, exact: true }));

  await expect(page.getByTestId(testId("extensionsContent"))).toBeFocused();
});
