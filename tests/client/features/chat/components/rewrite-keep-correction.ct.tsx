// @subject packages/client/src/features/chat/components/rewrite-dialog.tsx
// The Rewrite dialog keeps its correction as one of the chat's injections, over the real composed server: the host opens
// it from the composer's own menu, the kept correction shows in the room's injections list with its remove control,
// and the same words cannot be kept twice. Its disabled Keep control passes the design audit's inactive-control-legibility rule.
import { contextToggleLabel, MESSAGE_TOOLS_LABEL } from "@orb/client/lib";
import { readSurfaceDesignAudit, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_CONTEXT_TAB_LABELS } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import {
  CHAT_INJECTIONS_SECTION_LABEL,
  CHAT_REMOVE_INJECTION_NAME,
  CHAT_REMOVE_INJECTION_TITLE,
  injectionRowLabel,
} from "#client/features/chat/lib/chat-settings-names.ts";
import { CHAT_CORRECTION_INSTRUCTION_NAME, CHAT_CORRECTION_SAVED_NOTE, CHAT_SAVE_CORRECTION_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { COMPOSER_CORRECTIONS_NAME } from "#client/features/chat/lib/composer-menu-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// The This-chat tab's reads and writes, past the room's own set.
const THIS_CHAT_PROCEDURES = [
  "chat.getGroupConfig",
  "chat.listForks",
  "chat.listChatInjections",
  "chat.saveCorrection",
  "chat.setChatInjection",
  "chat.deleteChatInjection",
  "chat.setRoomOverrides",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "automation.listRules",
] as const;
const CORRECTION = "Mira lost her left hand at the siege.";

test("a kept correction lands in the injections list once, and leaves through its remove control", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  // Corrections rewrites the tail reply, so the room must end on one.
  const chatId = await findHostedRoom(host, async (id) => (await host.chat.listMessages({ chatId: id })).messages.at(-1)?.role === "assistant");
  const before = await host.chat.listChatInjections({ chatId });
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      ...THIS_CHAT_PROCEDURES,
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });

  await page.locator('[data-slot="composer-utilities"]').getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).click();
  await page.getByRole("menuitem", { name: COMPOSER_CORRECTIONS_NAME }).click();
  const dialog = page.getByRole("dialog");
  const keep = dialog.getByRole("button", { name: CHAT_SAVE_CORRECTION_NAME, exact: true });
  // Nothing typed is nothing to keep.
  await expect(keep).toBeDisabled();
  const { audit } = await readSurfaceDesignAudit(page);
  expect(
    audit.findings.filter(({ rule }) => rule === "inactive-control-legibility").map(({ selector, value }) => `${selector} ${value}`),
    "the design audit finds the disabled Keep control legible",
  ).toEqual([]);
  const instruction = dialog.getByRole("textbox", { name: CHAT_CORRECTION_INSTRUCTION_NAME, exact: true });
  await instruction.fill(CORRECTION);
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(dialog.getByRole("status")).toHaveText(CHAT_CORRECTION_SAVED_NOTE);
  await expect.poll(async () => (await host.chat.listChatInjections({ chatId })).length).toBe(before.length + 1);
  // The same words, padded, are the kept correction: the control stays off rather than keeping a second copy.
  await instruction.fill(`  ${CORRECTION} `);
  await expect(keep).toBeDisabled();
  await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The room's own details pane, opened the way a desktop host opens it.
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const settings = page.getByRole("tab", { name: CHAT_CONTEXT_TAB_LABELS.settings, exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_INJECTIONS_SECTION_LABEL)}`, "u") }).click();
  // A kept correction is an ordinary row: its collapsed face shows the player's words, and its panel holds Remove.
  await expect(page.getByText(CORRECTION, { exact: true })).toBeVisible();
  const ordinal = (await host.chat.listChatInjections({ chatId })).findIndex((row) => row.content === CORRECTION) + 1;
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(injectionRowLabel(ordinal))} `, "u") }).click();
  // Only an open row shows its panel, so the one Remove on the page is the kept correction's.
  const remove = page.getByRole("button", { name: CHAT_REMOVE_INJECTION_NAME, exact: true });
  await expect(remove).toHaveCount(1);
  await remove.click();
  const confirm = page.getByRole("alertdialog", { name: CHAT_REMOVE_INJECTION_TITLE, exact: true });
  await confirm.getByRole("button", { name: DIALOG_VERBS.remove, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(CORRECTION, { exact: true })).toHaveCount(0);
  expect(await host.chat.listChatInjections({ chatId })).toEqual(before);
});
