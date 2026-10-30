import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { ASSET_LIST_LIMIT_MAX, blobUrl } from "@orb/contracts/assets";
import { characterHandleSchema } from "@orb/contracts/character";
import type { ChatSummary, MessageView } from "@orb/contracts/chat";
import { CHAT_LIST_MAX_LIMIT, CHAT_MESSAGE_LIST_MAX_LIMIT, forkResultSchema, listMessagesInputSchema } from "@orb/contracts/chat";
import type { PluginCommandView } from "@orb/contracts/plugin";
import { streamAttachInputSchema } from "@orb/contracts/stream";
import type { AssetId, CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { controlledPanel, publishSurfaceInventory, settledBox } from "@orb/testkit/browser/spec";
import type { SurfaceCoverageDisposition, SurfaceCoverageInventory } from "@orb/testkit/iso";
import { parseSurfaceProviderEvidence } from "@orb/testkit/iso";
import { attachNativeFile, isTrpcRequestFor, matchesTrpcRequestInput, readTrpcOutput, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Response, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHAT_CONTEXT_TABLIST_NAME } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import {
  MESSAGE_ACTIONS_MENU_NAME,
  MESSAGE_EDIT_NAME,
  MESSAGE_FORK_NAME,
  MESSAGE_REACTION_ADD_NAME,
  MESSAGE_REATTRIBUTE_NAME,
} from "#client/features/chat/lib/message-action-names.ts";
import { resolveIsGroupChat } from "#client/features/chat/lib/roster.ts";
import { pluginCommandShownName, sharedPluginNames } from "#client/features/plugin/lib/plugin-command-copy.ts";
import { PLUGIN_PANELS_SHEET_LABEL } from "#client/features/plugin/lib/plugin-copy.ts";
import { CHAT_PLUGINS_OPEN_LABEL } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";
import { renderMessageForDisplay } from "#client/lib/message-render.ts";
import { CHAT_PLUGINS_TAB_LABEL } from "#client/lib/registry-contracts.ts";
import { gotoChatsList, messageRow, openChatsList, openDetailPanel, waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import { holdTrpcProcedure } from "./trpc.ts";

const DRAFT = "A direction retained while inspecting the room controls.";
const EMPTY_SEARCH = "surface-walk-no-chat-with-this-name-7f4a6d";
const MENU_DEPTH_LIMIT = 8;
const DISCLOSURE_LIMIT = 100;
const WHEEL_STEP_RATIO = 0.65;
const SCROLL_EPSILON = 2;
const MAX_READING_POSITION_STEPS = 10_000;

interface Coverage {
  readonly name: string;
  readonly kind: string;
  readonly status: SurfaceCoverageDisposition;
  readonly detail: string;
}

interface MessageOperationProof {
  readonly label: string;
  readonly message: MessageView;
  readonly viewerIsHost: boolean;
  readonly viewerOwnsMessage: boolean;
  readonly detail: string;
}

type Journey = SurfaceFlow & {
  readonly coverage: Coverage[];
  readonly expected: SurfaceCoverageInventory["expected"][number][];
  readonly messageOperations?: MessageOperationProof[];
};

function expectChat(flow: Journey, name: string, kind: string): void {
  if (!flow.expected.some((subject) => subject.id === name && subject.kind === kind)) {
    flow.expected.push({ id: name, kind });
  }
}

function record(flow: Journey, name: string, status: Coverage["status"], detail: string): void {
  const kind = flow.expected.find((subject) => subject.id === name)?.kind ?? "chat-state";
  expectChat(flow, name, kind);
  flow.coverage.push({ name, kind, status, detail });
}

async function checkpoint(flow: Journey, name: string, scope: Locator, witness: Locator): Promise<void> {
  await flow.checkpoint({ name, scope, state: "loaded", witnesses: [witness], checks: SURFACE_CHECKS });
  record(flow, name, "observed", "Actual mounted production subject; checkpoint collected in the selected pass");
}

async function publish(flow: Journey, name: string): Promise<void> {
  await attachNativeFile(flow.info, flow.info, name, {
    body: JSON.stringify(
      { dataMode: flow.run.dataMode, chatStyle: flow.chatStyle, fontScale: flow.fontScale, coverage: flow.coverage, messageOperations: flow.messageOperations },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await publishSurfaceInventory(flow.info, {
    name,
    expected: flow.expected,
    observations: flow.coverage.map(({ name: id, kind, status: disposition, detail: reason }) => ({ id, kind, disposition, reason })),
  });
}

async function readChats(flow: Journey): Promise<readonly ChatSummary[]> {
  const rooms: ChatSummary[] = [];
  let page = await flow.client.chat.listChats.query({ limit: CHAT_LIST_MAX_LIMIT });
  rooms.push(...page.items);
  while (page.nextCursor !== null) {
    page = await flow.client.chat.listChats.query({ limit: CHAT_LIST_MAX_LIMIT, cursor: page.nextCursor });
    rooms.push(...page.items);
  }
  const originalIds = new Set(flow.run.subjects.chats.map(({ id }) => id));
  const original = rooms.filter(({ id }) => originalIds.has(id));
  record(
    flow,
    "chat-data-inventory",
    "observed",
    `${String(original.length)} original readable, non-archived library rooms; ${String(rooms.length - original.length)} post-provenance rooms excluded`,
  );
  return original;
}

function displayTitle(room: ChatSummary): string {
  return deriveChatTitle(room.title, room.participantNames);
}

function subjectCoverage(flow: Journey, rooms: readonly ChatSummary[]): void {
  for (const room of rooms) {
    expectChat(flow, `original-room/${room.id}`, "chat-library-subject");
    record(
      flow,
      `original-room/${room.id}`,
      "observed",
      "Original snapshot ID present in the actual production keyset; eligible for native selection, not a claim that this room's controls were traversed",
    );
  }
  record(
    flow,
    "chat-subject-selection",
    "observed",
    `${String(rooms.length)} original readable subjects admitted, including duplicate display titles; native row qualifiers and committed message identities establish each selected room`,
  );
}

async function roomRow(flow: Journey, room: ChatSummary): Promise<Locator> {
  const label = displayTitle(room);
  const storedTitle = room.title?.trim() ?? "";
  const search = storedTitle.length > 0 ? storedTitle : (room.participantPortraits.at(0)?.name.trim() ?? "");
  const matches: ChatSummary[] = [];
  let result = await flow.client.chat.listChats.query({ ...(search === "" ? {} : { search }), limit: CHAT_LIST_MAX_LIMIT });
  matches.push(...result.items);
  while (result.nextCursor !== null) {
    result = await flow.client.chat.listChats.query({ ...(search === "" ? {} : { search }), limit: CHAT_LIST_MAX_LIMIT, cursor: result.nextCursor });
    matches.push(...result.items);
  }
  const index = matches.findIndex(({ id }) => id === room.id);
  expect(index, "The selected identity must belong to the actual production search result").toBeGreaterThanOrEqual(0);
  const list = flow.page.getByRole("list", { name: "Chats list", exact: true });
  const virtualRow = list.locator(`[data-slot="virtual-list-row"][aria-posinset="${String(index + 1)}"]`);
  await flow.action(`chat-search-${room.id}`, {
    action: async () => {
      await flow.page.getByRole("textbox", { name: "Search chats", exact: true }).fill(EMPTY_SEARCH);
      await expect(flow.page.getByText("No matches", { exact: true })).toBeVisible();
      await flow.page.getByRole("textbox", { name: "Search chats", exact: true }).fill(search);
    },
    ready: async () => {
      await expect(flow.page.getByRole("textbox", { name: "Search chats", exact: true })).toHaveValue(search);
      await expect(list).toBeVisible();
      await expect(list.locator('[data-slot="virtual-list-row"]').first()).toHaveAttribute("aria-setsize", /[1-9]\d*/u);
    },
  });
  // The ordinal comes from the production keyset order, never a positional fallback among duplicate names.
  await scrollViewport(flow, list, -(await list.evaluate((node) => node.scrollHeight)));
  for (let step = 0; step <= matches.length * 4 && !(await virtualRow.isVisible()); step += 1) {
    const before = await list.evaluate((node) => ({ position: node.scrollTop, size: node.querySelector("[aria-setsize]")?.getAttribute("aria-setsize") }));
    await scrollViewport(flow, list, await list.evaluate((node) => node.clientHeight * 0.65));
    await expect
      .poll(async () => {
        const after = await list.evaluate((node) => ({ position: node.scrollTop, size: node.querySelector("[aria-setsize]")?.getAttribute("aria-setsize") }));
        return (await virtualRow.isVisible()) || JSON.stringify(after) !== JSON.stringify(before);
      })
      .toBe(true);
  }
  await expect(virtualRow).toBeVisible();
  const loaded = Number(await virtualRow.getAttribute("aria-setsize"));
  expect(loaded).toBeLessThanOrEqual(matches.length);
  await expect(virtualRow.getByRole("button", { name: /^Chat actions for /u })).toHaveCount(room.viewerRole === "host" ? 1 : 0);
  await expect(virtualRow.getByRole("button", { name: label, exact: true })).toHaveCount(1);
  await attachNativeFile(flow.info, flow.info, `chat-${room.id}-native-row-identity`, {
    body: JSON.stringify({
      original: flow.run.subjects.chats.some(({ id }) => id === room.id),
      chatId: room.id,
      search,
      label,
      index,
      loaded,
      nativeRow: await virtualRow.ariaSnapshot(),
    }),
    contentType: "application/json",
  });
  return virtualRow;
}

async function enterChatsList(flow: Journey): Promise<void> {
  if (flow.page.url() === "about:blank") {
    await gotoChatsList(flow.page);
  } else {
    await openChatsList(flow.page);
  }
}

async function openRoom(flow: Journey, room: ChatSummary, inspectList = false): Promise<void> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const showList = flow.page.getByRole("button", { name: "Show list panel", exact: true });
  if (await showList.isVisible()) {
    await showList.click();
    record(
      flow,
      "extra-list-navigation",
      "visited",
      "Explicit LIST navigation state follows the requested pane intent; room capture restores requested composition",
    );
  }
  const root = await roomRow(flow, room);
  const row = root.getByRole("button", { name: displayTitle(room), exact: true });
  if (inspectList) {
    await listMenu(flow, room, root);
  }
  const canon = await flow.client.chat.listMessages.query({ chatId: room.id });
  const tail = canon.messages.at(-1);
  await flow.action(`chat-open-${room.id}`, {
    action: async () => {
      await row.click();
    },
    ready: async () => {
      await expect(flow.page.getByRole("group", { name: "Message composer", exact: true })).toBeVisible();
      await expect(flow.page.locator('[data-slot="chat-header-pending"]')).toHaveCount(0);
      await expect
        .poll(async () =>
          tail === undefined ? (await flow.page.locator('[data-slot="message-row"]').count()) === 0 : await messageRow(flow.page, tail.id).isVisible(),
        )
        .toBe(true);
    },
  });
  await flow.requestPanes();
  if (flow.requestedPanes.kind === "desktop" && flow.requestedPanes.panes.context) {
    await contextReady(flow);
  }
  await checkpoint(flow, `chat-room-${room.id}`, flow.page.locator("body"), flow.page.getByRole("group", { name: "Message composer", exact: true }));
}

async function listMenu(flow: Journey, room: ChatSummary, root: Locator): Promise<void> {
  await root.hover();
  const menu = root.getByRole("button", { name: /^Chat actions for /u });
  if ((await menu.count()) === 0) {
    record(flow, `chat-list-${room.id}-menu`, "not-applicable", "This actual library subject has no host lifecycle menu");
    return;
  }
  await inspectTrigger(flow, menu, `chat-list-${room.id}-menu`);
}

async function emptySearch(flow: Journey): Promise<void> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const showList = flow.page.getByRole("button", { name: "Show list panel", exact: true });
  if (await showList.isVisible()) {
    await showList.click();
  }
  const search = flow.page.getByRole("textbox", { name: "Search chats", exact: true });
  const empty = flow.page.locator('[data-slot="empty-state-root"]').filter({ has: flow.page.getByText("No matches", { exact: true }) });
  await flow.action("chat-empty-search", {
    action: async () => {
      await search.fill(EMPTY_SEARCH);
    },
    ready: async () => {
      await expect(empty).toBeVisible();
    },
  });
  await flow.checkpoint({ name: "chat-empty-search", scope: empty, state: "empty", witnesses: [empty], checks: SURFACE_CHECKS });
  await flow.action("chat-search-recovery", {
    action: async () => {
      await flow.page.getByRole("button", { name: "Clear the search", exact: true }).click();
    },
    ready: async () => {
      await expect(search).toHaveValue("");
      await expect(flow.page.getByRole("list", { name: "Chats list", exact: true })).toBeVisible();
    },
  });
  record(flow, "chat-search-empty-recovery", "observed", "Server-filtered empty result followed by actual clear-search recovery");
}

async function messageLeafName(item: Locator): Promise<string> {
  const snapshot = await item.ariaSnapshot();
  const label = /^- menuitem(?:checkbox|radio)? "([^"]+)"/u.exec(snapshot)?.at(1);
  if (label === undefined) {
    throw new Error(`The actual message leaf has no identifiable accessible name: ${snapshot}`);
  }
  return label;
}

async function accountMessageLeaves(flow: Journey, menu: Locator, name: string, message: MessageView): Promise<void> {
  const chat = await flow.client.chat.getChat.query({ chatId: message.chatId });
  for (const item of await menu.locator("[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]").all()) {
    const label = await messageLeafName(item);
    const id = `${name}/leaf/${label}`;
    expectChat(flow, id, "message-menu-leaf");
    if (await item.isDisabled()) {
      await disabledControl(item);
      record(flow, id, "not-applicable", `Actual ${message.role} leaf disabled; accessible name and visible reason retained in native menu snapshot`);
      continue;
    }
    const proof = flow.messageOperations?.find(
      (candidate) =>
        candidate.label === label &&
        candidate.message.role === message.role &&
        candidate.viewerIsHost === chat.viewerIsHost &&
        (label !== MESSAGE_REATTRIBUTE_NAME || (candidate.viewerOwnsMessage && message.authorUserId === chat.viewerUserId)),
    );
    record(
      flow,
      id,
      proof === undefined ? "unvisited" : "observed",
      proof === undefined
        ? `Enabled ${message.role} leaf has no same-case operation proof for this role and authority; original ${message.id} remains untouched`
        : `Original ${message.id} observed only; same-case ${proof.message.role} operation on disposable ${proof.message.chatId}/${proof.message.id}: ${proof.detail}`,
    );
  }
}

async function inspectMenu(
  flow: Journey,
  menu: Locator,
  name: string,
  options: { readonly depth: number; readonly message?: MessageView | undefined },
): Promise<void> {
  const { depth, message } = options;
  await expect(menu).toBeVisible();
  const items = menu.locator('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]');
  await expect(items.first()).toBeVisible();
  await attachNativeFile(flow.info, flow.info, `${name}-items`, { body: await menu.ariaSnapshot(), contentType: "text/plain" });
  const enabled = menu.locator('[role^="menuitem"]:not([aria-disabled="true"]):not([disabled])');
  await menuTerminal(flow, menu, enabled, name);
  const submenus = menu.locator('[role="menuitem"][aria-haspopup="menu"]:not([aria-disabled="true"]):not([disabled])');
  const count = await submenus.count();
  if (depth >= MENU_DEPTH_LIMIT) {
    record(flow, `${name}-submenus`, "unvisited", `${String(count)} nested menus beyond the explicit traversal safety bound`);
    return;
  }
  for (let index = 0; index < count; index += 1) {
    const trigger = submenus.nth(index);
    await flow.action(`${name}-submenu-${String(index)}`, {
      action: async () => {
        await trigger.focus();
        await trigger.press("ArrowRight");
      },
      ready: async () => {
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
      },
    });
    const child = flow.page.getByRole("menu").last();
    await inspectMenu(flow, child, `${name}-${String(index)}`, { depth: depth + 1, message });
    await child.press("Escape");
    await expect(trigger).toBeFocused();
  }
  if (message !== undefined) {
    await accountMessageLeaves(flow, menu, name, message);
    return;
  }
  record(
    flow,
    `${name}-activation`,
    "unvisited",
    "Leaf commands inspected and terminal focus proved; activation may generate, mutate canon, export private data, or invoke an owner plugin",
  );
}

async function menuTerminal(flow: Journey, menu: Locator, enabled: Locator, name: string): Promise<void> {
  if ((await enabled.count()) === 0) {
    record(flow, `${name}-terminal`, "not-applicable", "Every actual menu item is disabled; no enabled terminal focus target");
    return;
  }
  await menu.press("End");
  await expect(enabled.last()).toBeFocused();
  await checkpoint(flow, `${name}-terminal`, menu, enabled.last());
}

async function disabledControl(control: Locator): Promise<void> {
  await expect(control).toBeDisabled();
}

async function inspectTrigger(
  flow: Journey,
  trigger: Locator,
  name: string,
  options: { readonly drill?: boolean; readonly message?: MessageView } = {},
): Promise<void> {
  const { drill = true, message } = options;
  if (await trigger.isDisabled()) {
    await disabledControl(trigger);
    record(flow, name, "not-applicable", "Actual control is disabled; retained with its description in the composer checkpoint");
    return;
  }
  await flow.action(`${name}-open`, {
    action: async () => {
      await trigger.click();
    },
    ready: async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(flow.page.getByRole("menu")).toHaveCount(1);
    },
  });
  const menu = flow.page.getByRole("menu");
  await inspectMenu(flow, menu, name, { depth: 0, message });
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  record(flow, name, "visited", "Native menu traversal, terminal item focus, dismissal and trigger focus restoration completed");
  if (drill) {
    await safeMenuDrills(flow, trigger, name);
  }
}

async function dismissMenu(menu: Locator, trigger: Locator): Promise<void> {
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function inspectImagineModes(flow: Journey, dialog: Locator, id: string): Promise<void> {
  const modes = dialog.getByRole("group", { name: "Mode", exact: true }).getByRole("button");
  await expect(modes.first()).toBeVisible();
  for (const [index, mode] of (await modes.all()).entries()) {
    await flow.action(`${id}-mode-${String(index)}`, {
      action: async () => {
        await mode.click();
      },
      ready: async () => {
        await expect(mode).toHaveAttribute("aria-pressed", "true");
      },
    });
    await checkpoint(flow, `${id}-mode-${String(index)}`, dialog, mode);
  }
  record(
    flow,
    `${id}-spend`,
    "excluded",
    "Read the chat first invokes priced extractPrompt; Generate invokes generateImage. Neither is submitted against original canon",
  );
}

function safeDialogWitness(dialog: Locator, label: string): Locator {
  switch (label) {
    case "Rename":
      return dialog.getByRole("textbox", { name: "Chat title", exact: true });
    case "Corrections…":
      return dialog.getByRole("textbox", { name: "Correction instruction", exact: true });
    case "Imagine — modes & preview…":
      return dialog.getByRole("textbox", { name: "Image prompt", exact: true });
    case "View wire trace…":
      return dialog.getByText(/No prompt was captured|Static prefix|Authored text/u).first();
    default:
      return dialog.getByRole("button", { name: "Cancel", exact: true });
  }
}

async function safeDialogDrill(flow: Journey, command: Locator, request: { readonly label: string; readonly id: string }): Promise<void> {
  const { label, id } = request;
  const destructive = label === "Delete" || label === "Delete chat";
  const dialog = destructive ? flow.page.getByRole("alertdialog") : flow.page.getByRole("dialog");
  const witness = safeDialogWitness(dialog, label);
  await flow.action(id, {
    action: async () => {
      await command.click();
    },
    ready: async () => {
      await expect(dialog).toBeVisible();
      await expect(witness).toBeVisible();
      await expect(dialog.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
    },
  });
  await checkpoint(flow, id, dialog, witness);
  if (label === "Imagine — modes & preview…") {
    await inspectImagineModes(flow, dialog, id);
  }
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const close = (await cancel.isVisible()) ? cancel : dialog.getByRole("button", { name: "Close", exact: true });
  await close.click();
  await expect(dialog).toBeHidden();
}

async function safeSelectionDrill(flow: Journey, command: Locator, id: string): Promise<void> {
  const bar = flow.page.locator('[data-slot="selection-bar-root"]');
  await flow.action(id, {
    action: async () => {
      await command.click();
    },
    ready: async () => {
      await expect(bar).toBeVisible();
      await expect(bar.getByText("0 selected", { exact: true })).toBeVisible();
    },
  });
  await checkpoint(flow, id, bar, bar);
  await bar.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(bar).toBeHidden();
}

async function safeDraftDrill(flow: Journey, command: Locator, id: string): Promise<void> {
  const input = flow.page.getByRole("textbox", { name: "Message", exact: true });
  const original = await input.inputValue();
  try {
    await flow.action(id, {
      action: async () => {
        await command.click();
      },
      ready: async () => {
        await expect(input).toHaveValue("");
      },
    });
    await checkpoint(flow, id, flow.page.getByRole("group", { name: "Message composer", exact: true }), input);
  } finally {
    await input.fill(original);
    await expect(input).toHaveValue(original);
  }
}

async function safeEditDrill(flow: Journey, command: Locator, request: { readonly id: string; readonly trigger: Locator }): Promise<void> {
  const messageId = await request.trigger.evaluate((node) => node.closest("[data-message-id]")?.getAttribute("data-message-id"));
  if (messageId === null || messageId === undefined) {
    throw new Error("The message action trigger has no committed row identity");
  }
  const row = flow.page.locator(`[data-message-id=${JSON.stringify(messageId)}]`);
  await expect(row).toHaveCount(1);
  const input = row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true });
  await flow.action(request.id, {
    action: async () => {
      await command.click();
    },
    ready: async () => {
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
    },
  });
  await checkpoint(flow, request.id, row, input);
  await row.getByRole("button", { name: "Cancel edit", exact: true }).click();
  await expect(input).toBeHidden();
}

async function pluginContextReady(flow: Journey): Promise<void> {
  const plugins = flow.page
    .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
    .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
  await expect(plugins).toHaveAttribute("aria-selected", "true");
  await contextReady(flow);
}

async function safePanelsDrill(flow: Journey, command: Locator, id: string): Promise<void> {
  const opensContext = await flow.page.getByRole("menu", { name: "Plugin actions", exact: true }).isVisible();
  const sheet = flow.page.getByRole("dialog", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true });
  const scope = opensContext ? activeContext(flow) : sheet;
  await flow.action(id, {
    action: async () => {
      await command.click();
    },
    ready: async () => {
      if (opensContext) {
        await pluginContextReady(flow);
      }
      await expect(scope).toBeVisible();
      await expect(scope).toContainText(/\S/u);
      await expect(scope.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
    },
  });
  await checkpoint(flow, id, scope, scope);
  if (!opensContext) {
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
  }
  await expect(sheet).toBeHidden();
  await flow.requestPanes();
  await closeContextOverlay(flow, `${id}-return-to-content`);
}

async function runSafeCommand(
  flow: Journey,
  command: Locator,
  request: { readonly label: string; readonly id: string; readonly trigger: Locator },
): Promise<void> {
  switch (request.label) {
    case "Select messages…":
      await safeSelectionDrill(flow, command, request.id);
      return;
    case "Clear input":
      await safeDraftDrill(flow, command, request.id);
      return;
    case MESSAGE_EDIT_NAME:
      await safeEditDrill(flow, command, request);
      return;
    case CHAT_PLUGINS_OPEN_LABEL:
      await safePanelsDrill(flow, command, request.id);
      return;
    default:
      await safeDialogDrill(flow, command, request);
  }
}

async function safeMenuDrills(flow: Journey, trigger: Locator, name: string): Promise<void> {
  const labels = [
    "Rename",
    "Delete",
    "Delete chat",
    "Corrections…",
    "Imagine — modes & preview…",
    "View wire trace…",
    "Select messages…",
    "Clear input",
    MESSAGE_EDIT_NAME,
    CHAT_PLUGINS_OPEN_LABEL,
  ] as const;
  await trigger.click();
  const menu = flow.page.getByRole("menu");
  await expect(menu).toBeVisible();
  const available: string[] = [];
  for (const label of labels) {
    const command = menu.getByRole("menuitem", { name: label, exact: true });
    if ((await command.count()) > 0 && !(await command.isDisabled())) {
      available.push(label);
    }
  }
  await dismissMenu(menu, trigger);
  for (const label of available) {
    await trigger.click();
    await expect(menu).toBeVisible();
    const command = menu.getByRole("menuitem", { name: label, exact: true });
    const id = `${name}-safe-drill-${label}`;
    expectChat(flow, id, "menu-operation");
    await runSafeCommand(flow, command, { label, id, trigger });
    record(
      flow,
      id,
      "visited",
      "Actual production command opened its existing dialog/mode and was dismissed without confirming a write, generation, export or plugin invocation",
    );
  }
}

async function composerMenus(flow: Journey, room: ChatSummary): Promise<void> {
  const composer = flow.page.getByRole("group", { name: "Message composer", exact: true });
  const input = composer.getByRole("textbox", { name: "Message", exact: true });
  const original = await input.inputValue();
  try {
    for (const [phase, value] of [
      ["empty", ""],
      ["directed", DRAFT],
    ] as const) {
      await flow.action(`composer-${room.id}-${phase}`, {
        action: async () => {
          await input.fill(value);
        },
        ready: async () => {
          await expect(input).toHaveValue(value);
        },
      });
      await composerCheckpoint(flow, composer, input, `composer-${room.id}-${phase}`);
      await attachNativeFile(flow.info, flow.info, `composer-${room.id}-${phase}-controls`, { body: await composer.ariaSnapshot(), contentType: "text/plain" });
      const triggers = composer.locator('button[aria-haspopup="menu"]');
      const count = await triggers.count();
      for (let index = 0; index < count; index += 1) {
        expectChat(flow, `composer-${room.id}-${phase}-menu-${String(index)}`, "menu");
      }
      for (let index = 0; index < count; index += 1) {
        await inspectTrigger(flow, triggers.nth(index), `composer-${room.id}-${phase}-menu-${String(index)}`);
      }
      await expect(input).toHaveValue(value);
    }
  } finally {
    await input.fill(original);
    await expect(input).toHaveValue(original);
  }
  record(
    flow,
    "generation-and-plugin-invocation",
    "unvisited",
    "Generation, arbitrary contributed commands and canon-editing leaf actions are not executed against owner subjects",
  );
}

async function composerCheckpoint(flow: Journey, composer: Locator, input: Locator, name: string): Promise<void> {
  const groups = await composer.getByRole("group").all();
  const actions = await Promise.all(groups.map(async (region) => ({ region, actions: await region.getByRole("button").all() })));
  await flow.checkpoint({ name, scope: composer, state: "loaded", witnesses: [input], checks: SURFACE_CHECKS }, actions);
  record(
    flow,
    `${name}-groups`,
    "observed",
    `${String(groups.length)} actual tool/generation/send groups with action-group geometry; no paid generation invoked`,
  );
}

function activeContext(flow: Journey): Locator {
  return flow.page.locator('[data-slot="context-bracket"] > [role="region"]:not([inert]):visible');
}

async function contextReady(flow: Journey): Promise<void> {
  await expect(activeContext(flow)).toHaveCount(1);
  await expect(activeContext(flow)).toBeVisible();
  await expect(activeContext(flow)).toContainText(/\S/u);
  await expect(activeContext(flow).locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
}

async function closeContextOverlay(flow: Journey, name: string): Promise<void> {
  const panel = flow.page.locator('.shell-panel[data-panel-side="context"]');
  if ((await panel.getAttribute("data-panel-mode")) !== "overlay") {
    return;
  }
  const close = flow.page.getByRole("button", { name: "Close details", exact: true }).or(flow.page.getByRole("button", { name: "Hide details", exact: true }));
  await flow.action(name, {
    action: async () => {
      await close.click();
    },
    ready: async () => {
      await expect(panel).toHaveAttribute("data-panel-mode", "collapsed");
      await expect(flow.page.locator(".shell-content")).toHaveJSProperty("inert", false);
    },
  });
  await flow.topology();
}

async function disclosures(flow: Journey, region: Locator, name: string): Promise<void> {
  const opened: Locator[] = [];
  for (let index = 0; index < DISCLOSURE_LIMIT; index += 1) {
    const closed = region.locator('[data-slot="collapsible-trigger"][aria-expanded="false"]:not([aria-haspopup]):visible');
    if ((await closed.count()) === 0) {
      break;
    }
    const rootIndex = await closed.first().evaluate(
      (node, scope) => {
        const host = node.closest('[data-slot="collapsible-root"]');
        if (host === null) {
          throw new Error("The native disclosure has no semantic host");
        }
        return [...scope.querySelectorAll('[data-slot="collapsible-root"]')].indexOf(host);
      },
      await region.elementHandle(),
    );
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    const trigger = region.locator('[data-slot="collapsible-root"]').nth(rootIndex).locator('[data-slot="collapsible-trigger"]').first();
    expectChat(flow, `${name}-disclosure-${String(index)}`, "disclosure");
    await flow.action(`${name}-disclosure-${String(index)}`, {
      action: async () => {
        await trigger.click();
      },
      ready: async () => {
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toHaveAttribute("aria-controls", /.+/u);
        const panel = await controlledPanel(trigger);
        await expect(panel).toBeVisible();
        await expect(panel).not.toBeEmpty();
        await expect(panel.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
      },
    });
    opened.push(trigger);
    const panel = await controlledPanel(trigger);
    await checkpoint(flow, `${name}-disclosure-${String(index)}`, panel, panel);
    await nativeDetails(flow, panel, `${name}-disclosure-${String(index)}`);
  }
  const remaining = await region.locator('[data-slot="collapsible-trigger"][aria-expanded="false"]:visible').count();
  record(
    flow,
    `${name}-disclosures`,
    remaining > 0 ? "unvisited" : "observed",
    `${String(opened.length)} nested disclosures opened; ${String(remaining)} remain beyond the traversal bound`,
  );
  await attachNativeFile(flow.info, flow.info, `${name}-body`, { body: await region.ariaSnapshot(), contentType: "text/plain" });
  for (const trigger of opened.toReversed()) {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await nativeDetails(flow, region, name);
}

async function nativeDetails(flow: Journey, region: Locator, name: string, depth = 0): Promise<void> {
  const candidates = region.locator("details");
  const indices = await candidates.evaluateAll(
    (nodes, scope) =>
      nodes.flatMap((node, index) => {
        const parent = node.parentElement?.closest("details") ?? null;
        const nested = parent !== null && parent !== scope && scope.contains(parent);
        return !nested && node.getClientRects().length > 0 ? [index] : [];
      }),
    await region.elementHandle(),
  );
  if (depth >= MENU_DEPTH_LIMIT && indices.length > 0) {
    record(flow, `${name}-nested-details`, "unvisited", `${String(indices.length)} native details beyond the explicit traversal bound`);
    return;
  }
  for (const index of indices) {
    const detail = candidates.nth(index);
    const id = `${name}-details-${String(index)}`;
    expectChat(flow, id, "native-details");
    const wasOpen = await detail.evaluate((node) => node.hasAttribute("open"));
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
    await expect(detail).toHaveAttribute("open", /.*/u);
    await checkpoint(flow, id, detail, detail);
    await nativeDetails(flow, detail, id, depth + 1);
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
  }
}

async function contextCells(flow: Journey, cells: Locator, name: string): Promise<void> {
  const count = await cells.count();
  for (let index = 0; index < count; index += 1) {
    expectChat(flow, `${name}-${String(index)}`, "context-cell");
  }
  for (let index = 0; index < count; index += 1) {
    const cell = cells.nth(index);
    if (await cell.isDisabled()) {
      record(flow, `${name}-${String(index)}`, "not-applicable", "Production contribution is disabled");
      continue;
    }
    await flow.action(`${name}-${String(index)}`, {
      action: async () => {
        await cell.click();
      },
      ready: async () => {
        await contextReady(flow);
        const selected = (await cell.getAttribute("role")) === "tab" ? "aria-selected" : "aria-current";
        await expect(cell).toHaveAttribute(selected, "true");
      },
    });
    const region = activeContext(flow);
    await checkpoint(flow, `${name}-${String(index)}`, region, region);
    await disclosures(flow, region, `${name}-${String(index)}`);
  }
  record(flow, name, count === 0 ? "not-applicable" : "observed", `${String(count)} actual visible navigation cells; omitted capabilities are not synthesized`);
}

async function sidecar(flow: Journey, room: ChatSummary): Promise<void> {
  const move = activeContext(flow).getByRole("button", { name: /^Move to sidecar:/u });
  if ((await move.count()) === 0) {
    record(flow, `sidecar-${room.id}`, "not-applicable", "No rendered enabled plugin chat panel offers a sidecar placement");
    return;
  }
  const label = await move.first().getAttribute("aria-label");
  if (label === null) {
    throw new Error("The plugin placement control has no accessible label");
  }
  const restoreLabel = label.replace("Move to sidecar:", "Move to Context:");
  const restore = activeContext(flow).getByRole("button", { name: restoreLabel, exact: true });
  await flow.action(`sidecar-${room.id}-opt-in`, {
    action: async () => {
      await move.first().click();
    },
    ready: async () => {
      await expect(restore).toBeVisible();
    },
  });
  try {
    const coarse = await flow.page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-coarse"]);
    if (coarse) {
      await inspectSidecarSheet(flow, room, restoreLabel);
    } else {
      await inspectSidecarColumn(flow, room);
    }
  } finally {
    const sheet = flow.page.getByRole("dialog", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true });
    if (await sheet.isVisible()) {
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
    }
    await openDetailPanel(flow.page);
    await flow.page
      .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
      .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })
      .click();
    await contextReady(flow);
    await restore.click();
    await expect(activeContext(flow).getByRole("button", { name: label, exact: true })).toBeVisible();
  }
}

async function inspectSidecarColumn(flow: Journey, room: ChatSummary): Promise<void> {
  const column = flow.page.locator('[data-slot="chat-thread-flank"]');
  const edge = flow.page.getByRole("button", { name: /^(?:Show|Hide) plugin panels$/u });
  await expect(edge).toHaveCount(1);
  await settledBox(edge);
  const initiallyOpen = (await edge.getAttribute("aria-expanded")) === "true";
  try {
    if (!initiallyOpen) {
      await flow.action(`sidecar-${room.id}-column-open`, {
        action: async () => {
          await edge.click();
        },
        ready: async () => {
          await sidecarColumnReady(column, edge);
        },
      });
    }
    await sidecarColumnReady(column, edge);
    const body = await controlledPanel(edge);
    await checkpoint(flow, `sidecar-${room.id}-column`, body, body.locator('[data-slot="plugin-flank"]'));
  } finally {
    const open = (await edge.getAttribute("aria-expanded")) === "true";
    if (open !== initiallyOpen) {
      await edge.click();
    }
  }
}

async function sidecarColumnReady(column: Locator, edge: Locator): Promise<void> {
  await expect(edge).toHaveAttribute("aria-expanded", "true");
  await expect(column).toBeVisible();
  await expect(column).not.toHaveAttribute("data-collapsed", "true");
  await expect(column.locator('[data-slot="plugin-flank"]')).toBeVisible();
}

async function inspectSidecarSheet(flow: Journey, room: ChatSummary, restoreLabel: string): Promise<void> {
  await closeContextOverlay(flow, `sidecar-${room.id}-return-to-content`);
  await flow.page.getByRole("button", { name: "Message tools", exact: true }).click();
  const item = flow.page.getByRole("menuitem", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true });
  await expect(item).toBeVisible();
  const sheet = flow.page.getByRole("dialog", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true });
  await flow.action(`sidecar-${room.id}-sheet-open`, {
    action: async () => {
      await item.click();
    },
    ready: async () => {
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("button", { name: restoreLabel, exact: true })).toBeVisible();
    },
  });
  await checkpoint(flow, `sidecar-${room.id}-sheet`, sheet, sheet.getByRole("button", { name: restoreLabel, exact: true }));
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden();
  await openDetailPanel(flow.page);
  await flow.page
    .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
    .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })
    .click();
}

async function inspectPlugins(flow: Journey, plugins: Locator, room: ChatSummary): Promise<void> {
  await plugins.click();
  await pluginContextReady(flow);
  await sidecar(flow, room);
  const surfaces = await flow.client.plugin.listSurfaces.query();
  record(
    flow,
    `plugin-${room.id}-registrations`,
    "observed",
    `${String(surfaces.filter((surface) => surface.anchor === "chat-flank").length)} actual registered chat-flank surfaces; visibility/publication remains the product's decision`,
  );
  record(
    flow,
    `plugin-${room.id}-guest-execution`,
    "unvisited",
    "Host Context/sidecar chrome is traversed; a registered plugin's external guest startup is not independently established by its attribution shell",
  );
}

async function context(flow: Journey, room: ChatSummary): Promise<void> {
  await openDetailPanel(flow.page);
  const headerMenus = flow.page.locator('[data-slot="context-bracket-header"] button[aria-haspopup="menu"]');
  const menuCount = await headerMenus.count();
  for (let index = 0; index < menuCount; index += 1) {
    expectChat(flow, `context-${room.id}-header-menu-${String(index)}`, "menu");
  }
  for (let index = 0; index < menuCount; index += 1) {
    await inspectTrigger(flow, headerMenus.nth(index), `context-${room.id}-header-menu-${String(index)}`);
  }
  await contextCells(flow, flow.page.getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true }).getByRole("tab"), `context-${room.id}-tabs`);
  await contextCells(flow, flow.page.locator('[data-slot="context-rail"]').getByRole("button"), `context-${room.id}-game`);
  const plugins = flow.page
    .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
    .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
  if (await plugins.isVisible()) {
    await inspectPlugins(flow, plugins, room);
  }
  record(
    flow,
    `context-${room.id}-leaf-operations`,
    "unvisited",
    "Context navigation/disclosures are inspected without changing room configuration, generating previews that spend, managing memberships, or editing canon",
  );
  await flow.requestPanes();
}

async function readCanon(flow: Journey, chatId: ChatId): Promise<readonly MessageView[]> {
  const messages: MessageView[] = [];
  let page = await flow.client.chat.listMessages.query({ chatId, limit: CHAT_MESSAGE_LIST_MAX_LIMIT });
  messages.push(...page.messages);
  while (page.messages.length === CHAT_MESSAGE_LIST_MAX_LIMIT) {
    const first = page.messages.at(0);
    if (first === undefined) {
      throw new Error("A full message page has no first sequence");
    }
    page = await flow.client.chat.listMessages.query({ chatId, limit: CHAT_MESSAGE_LIST_MAX_LIMIT, cursor: { kind: "before", seq: first.seq } });
    messages.unshift(...page.messages);
  }
  return messages;
}

async function wheel(flow: Journey, delta: number): Promise<void> {
  const viewport = flow.page.locator('[data-slot="message-list-scroll"]');
  await scrollViewport(flow, viewport, delta);
}

async function scrollViewport(flow: Journey, viewport: Locator, delta: number): Promise<void> {
  if (flow.page.context().browser()?.browserType().name() === "webkit" && flow.info.project.use.isMobile === true) {
    await test.step(
      "Programmatic positioning: mobile WebKit; not touch or wheel evidence",
      async () => {
        await viewport.evaluate((node, distance) => node.scrollBy({ top: distance, behavior: "instant" }), delta);
      },
      { params: { delta } },
    );
    return;
  }
  await viewport.hover();
  await flow.page.mouse.wheel(0, delta);
}

async function mountedMessageSignature(viewport: Locator): Promise<string> {
  return await viewport.locator("[data-message-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-message-id")).join("|"));
}

async function reachMessage(flow: Journey, message: MessageView, direction: -1 | 1): Promise<Locator> {
  const row = messageRow(flow.page, message.id);
  const viewport = flow.page.locator('[data-slot="message-list-scroll"]');
  for (let step = 0; step < MAX_READING_POSITION_STEPS && !(await row.isVisible()); step += 1) {
    const signature = await mountedMessageSignature(viewport);
    const before = await viewport.evaluate((element) => {
      const clip = element.getBoundingClientRect();
      const anchor = [...element.querySelectorAll<HTMLElement>("[data-message-id]")]
        .flatMap((node) => {
          const id = node.getAttribute("data-message-id");
          const box = node.getBoundingClientRect();
          return id === null || box.bottom <= clip.top || box.top >= clip.bottom ? [] : [{ id, top: box.top }];
        })
        .toSorted((a, b) => Math.abs(a.top - clip.top) - Math.abs(b.top - clip.top))
        .at(0);
      return { position: element.scrollTop, height: element.clientHeight, anchor: anchor ?? null };
    });
    const earlier = flow.page.getByRole("button", { name: "Earlier messages", exact: true });
    const canPage = direction < 0 && before.position <= SCROLL_EPSILON && (await earlier.isVisible()) && (await earlier.isEnabled());
    if (canPage) {
      await flow.action(`reading-earlier-before-${signature.split("|").at(0) ?? message.id}`, {
        action: async () => {
          await earlier.click();
        },
        ready: async () => {
          await expect.poll(async () => await mountedMessageSignature(viewport)).not.toBe(signature);
        },
      });
    } else {
      await wheel(flow, direction * before.height * WHEEL_STEP_RATIO);
    }
    try {
      await expect
        .poll(async () => {
          const position = await viewport.evaluate((element) => element.scrollTop);
          if ((await row.isVisible()) || (position - before.position) * direction > 0 || (await mountedMessageSignature(viewport)) !== signature) {
            return true;
          }
          // Row measurements can compensate scrollTop without reversing the reader's visible movement.
          const anchor = before.anchor;
          if (anchor === null) {
            return false;
          }
          const after = await viewport.locator(`[data-message-id=${JSON.stringify(anchor.id)}]`).boundingBox();
          return after !== null && (anchor.top - after.y) * direction > SCROLL_EPSILON;
        })
        .toBe(true);
    } catch (error) {
      await attachNativeFile(flow.info, flow.info, "reading-progress-failure", {
        body: JSON.stringify({
          target: { id: message.id, seq: message.seq },
          direction,
          before,
          signature,
          current: await viewport.evaluate((element) => {
            const clip = element.getBoundingClientRect();
            const hit = document.elementFromPoint(clip.x + clip.width / 2, clip.y + clip.height / 2);
            return {
              position: element.scrollTop,
              height: element.clientHeight,
              size: element.scrollHeight,
              active: document.activeElement?.outerHTML,
              hit: hit?.outerHTML.slice(0, 500),
              rows: [...element.querySelectorAll<HTMLElement>("[data-message-id]")].map((node) => ({
                id: node.getAttribute("data-message-id"),
                rect: node.getBoundingClientRect().toJSON(),
              })),
            };
          }),
        }),
        contentType: "application/json",
      });
      throw error;
    }
  }
  await expect(row).toBeVisible();
  return row;
}

async function readMessage(flow: Journey, message: MessageView): Promise<void> {
  const row = await reachMessage(flow, message, 1);
  const viewport = flow.page.locator('[data-slot="message-list-scroll"]');
  const bounds = await viewport.boundingBox();
  const box = await row.boundingBox();
  if (bounds === null || box === null) {
    throw new Error("The actual transcript subject has no rendered geometry");
  }
  await flow.action(`reading-${message.id}-start`, {
    action: async () => {
      await wheel(flow, box.y - bounds.y);
    },
    ready: async () => {
      await expect(row).toBeVisible();
      await readingPosition(viewport, row, bounds.y, "start");
    },
  });
  await checkpoint(flow, `reading-${message.role}-${message.id}-start`, viewport, row);
  if (box.height > bounds.height * 2) {
    await flow.action(`reading-${message.id}-interior`, {
      action: async () => {
        await wheel(flow, bounds.height * WHEEL_STEP_RATIO);
      },
      ready: async () => {
        await expect.poll(async () => (await row.boundingBox())?.y ?? bounds.y).toBeLessThan(bounds.y - SCROLL_EPSILON);
      },
    });
    await checkpoint(flow, `reading-${message.role}-${message.id}-interior`, viewport, row);
    await readingChrome(flow, row, viewport, { name: `${message.id}-interior`, message });
    const interior = await row.boundingBox();
    if (interior === null) {
      throw new Error("The long message unmounted inside its reading window");
    }
    await flow.action(`reading-${message.id}-tail`, {
      action: async () => {
        await wheel(flow, interior.y + interior.height - bounds.y - bounds.height);
      },
      ready: async () => {
        await readingPosition(viewport, row, bounds.y + bounds.height, "tail");
      },
    });
    await checkpoint(flow, `reading-${message.role}-${message.id}-tail`, viewport, row);
  } else {
    record(
      flow,
      `reading-${message.role}-${message.id}-long-interior`,
      "not-applicable",
      "Actual rendered message does not span two viewport heights in this style/device/pane cell",
    );
  }
  await attachNativeFile(flow.info, flow.info, `reading-${message.id}-chrome`, { body: await row.ariaSnapshot(), contentType: "text/plain" });
  await readingChrome(flow, row, viewport, { name: `${message.id}-boundary`, message });
}

async function readingChrome(flow: Journey, row: Locator, viewport: Locator, subject: { readonly name: string; readonly message: MessageView }): Promise<void> {
  const { name, message } = subject;
  const header = row.locator('[data-slot="message-name-row"]');
  const bounds = await viewport.boundingBox();
  const headers = await header.evaluateAll((elements) =>
    elements.map((element) => ({
      sticky: element.hasAttribute("data-sticky"),
      pinned: element.hasAttribute("data-pinned"),
      placement: element.getAttribute("data-placement"),
      rect: element.getBoundingClientRect().toJSON(),
    })),
  );
  await attachNativeFile(flow.info, flow.info, `reading-${name}-identity`, {
    body: JSON.stringify(
      {
        headers,
        avatars: await row.locator('[data-slot="avatar-root"]').count(),
        attribution: await row.locator('[data-slot="message-attribution"]').count(),
        images: await row.locator("img").count(),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  const menu = row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true });
  if ((await menu.count()) === 0) {
    record(flow, `reading-${name}-actions`, "not-applicable", "This actual row exposes no message action menu in the current style/role/position");
    return;
  }
  const box = await menu.boundingBox();
  if (bounds === null || box === null || box.y < bounds.y || box.y + box.height > bounds.y + bounds.height) {
    record(
      flow,
      `reading-${name}-actions`,
      "not-applicable",
      "The actual row has no action-menu hit target in this reading window; its source style/position is retained in the identity evidence",
    );
    return;
  }
  const position = await viewport.evaluate((element) => element.scrollTop);
  try {
    await row.hover();
    await inspectTrigger(flow, menu, `reading-${name}-actions`, { drill: false, message });
  } finally {
    await scrollViewport(flow, viewport, position - (await viewport.evaluate((element) => element.scrollTop)));
    await expect.poll(async () => Math.abs((await viewport.evaluate((element) => element.scrollTop)) - position)).toBeLessThanOrEqual(SCROLL_EPSILON);
  }
}

async function independentMessageMenu(flow: Journey, message: MessageView): Promise<void> {
  const row = await reachMessage(flow, message, 1);
  await row.scrollIntoViewIfNeeded();
  const trigger = row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true });
  if ((await trigger.count()) === 0) {
    record(flow, `message-${message.id}-independent-menu`, "not-applicable", "This actual committed tail has no message menu");
    return;
  }
  await inspectTrigger(flow, trigger, `message-${message.id}-independent-menu`, { message });
}

async function readingPosition(viewport: Locator, row: Locator, edge: number, position: "start" | "tail"): Promise<void> {
  await expect
    .poll(async () => {
      const box = await row.boundingBox();
      if (box === null) {
        return false;
      }
      const state = await viewport.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }));
      const target = position === "start" ? box.y : box.y + box.height;
      return Math.abs(target - edge) <= SCROLL_EPSILON || state.top <= SCROLL_EPSILON || state.top + state.height >= state.total - SCROLL_EPSILON;
    })
    .toBe(true);
}

function addRoleWitnesses(flow: Journey, witnesses: Map<MessageView["id"], MessageView>, messages: readonly MessageView[]): void {
  for (const role of ["user", "assistant"] as const) {
    const roleMessages = messages.filter((message) => message.role === role);
    const longest = roleMessages.toSorted((a, b) => b.content.length - a.content.length).at(0);
    if (longest === undefined) {
      record(flow, `reading-${role}`, "not-applicable", "No original message with this role in the selected readable transcript");
      continue;
    }
    for (const message of [roleMessages.at(0), longest, roleMessages.at(-1)]) {
      if (message !== undefined) {
        witnesses.set(message.id, message);
      }
    }
  }
}

function capabilityStatus(visited: boolean, available: boolean): Coverage["status"] {
  if (visited) {
    return "observed";
  }
  return available ? "unvisited" : "not-applicable";
}

async function groupSubject(flow: Journey, candidates: readonly ChatSummary[]): Promise<ChatSummary | undefined> {
  for (const candidate of candidates.filter((room) => room.participantNames.length > 1)) {
    const detail = await flow.client.chat.getChat.query({ chatId: candidate.id });
    if (resolveIsGroupChat(detail.participants)) {
      record(
        flow,
        "group-host-permission-read",
        "observed",
        `Actual group detail: viewerIsHost=${String(detail.viewerIsHost)}; UI applicability is checked by the subsequent Context journey`,
      );
      return candidate;
    }
  }
  return undefined;
}

async function missingLibrarySubject(flow: Journey, population: number): Promise<void> {
  if (population > 0) {
    record(flow, "chat-common", "unvisited", "No readable original library subject; no synthetic owner room was created");
    return;
  }
  await enterChatsList(flow);
  const empty = flow.page.locator('[data-slot="empty-state-root"]').filter({ has: flow.page.getByText("No chats yet", { exact: true }) });
  await expect(empty).toBeVisible();
  await flow.checkpoint({ name: "chat-empty-library", scope: empty, state: "empty", witnesses: [empty], checks: SURFACE_CHECKS });
  record(flow, "chat-room-controls", "not-applicable", "The original account has no readable library room; no synthetic owner data was added");
}

async function chatCase(
  input: SurfaceFlow,
  name: string,
  run: (flow: Journey, rooms: readonly ChatSummary[], candidates: readonly ChatSummary[]) => Promise<SurfaceCoverageDisposition>,
): Promise<void> {
  const id = `chat/${name}`;
  const flow: Journey = { ...input, coverage: [], expected: [{ id, kind: "chat-journey" }] };
  try {
    await flow.page.goto("/");
    await waitForAppReady(flow.page);
    await flow.requestPanes();
    const rooms = await readChats(flow);
    const candidates = rooms.toSorted((a, b) => b.messageCount - a.messageCount);
    subjectCoverage(flow, rooms);
    const disposition = await run(flow, rooms, candidates);
    record(flow, id, disposition, "Independent native Chat case; every nested omission retains its own disposition");
  } finally {
    await publish(flow, `${name}-coverage`);
  }
}

/** Walk LIST/search and primary-room composer controls independently of Context and game bodies. */
export async function walkChat(input: SurfaceFlow): Promise<void> {
  await chatCase(input, "list-and-composer", async (flow, rooms, candidates) => {
    const primary = candidates.at(0);
    if (primary === undefined) {
      await missingLibrarySubject(flow, rooms.length);
      return rooms.length === 0 ? "not-applicable" : "unvisited";
    }
    await emptySearch(flow);
    expectChat(flow, `chat-room-${primary.id}`, "chat-subject");
    await openRoom(flow, primary, true);
    await composerMenus(flow, primary);
    const messages = await flow.client.chat.listMessages.query({ chatId: primary.id });
    const tail = messages.messages.at(-1);
    if (tail !== undefined) {
      await independentMessageMenu(flow, tail);
    }
    return "visited";
  });
}

/** A Context failure cannot prevent the independently registered composer/group/game cases. */
export async function walkChatContext(input: SurfaceFlow): Promise<void> {
  await chatCase(input, "context", async (flow, rooms, candidates) => {
    const primary = candidates.at(0);
    if (primary === undefined) {
      return rooms.length === 0 ? "not-applicable" : "unvisited";
    }
    expectChat(flow, `chat-room-${primary.id}`, "chat-subject");
    await openRoom(flow, primary);
    await context(flow, primary);
    return "visited";
  });
}

/** Resolve a real group through the production roster predicate, then traverse its controls. */
export async function walkChatGroup(input: SurfaceFlow): Promise<void> {
  await chatCase(input, "group", async (flow, rooms, candidates) => {
    const group = await groupSubject(flow, candidates);
    if (group === undefined) {
      return capabilityStatus(
        false,
        rooms.some((room) => room.participantNames.length > 1),
      );
    }
    expectChat(flow, `chat-room-${group.id}`, "chat-subject");
    await openRoom(flow, group, true);
    await composerMenus(flow, group);
    await context(flow, group);
    return "visited";
  });
}

/** Inspect an original engaged game without creating one or invoking paid generation. */
export async function walkChatGame(input: SurfaceFlow): Promise<void> {
  await chatCase(input, "game", async (flow, rooms, candidates) => {
    const game = candidates.find((candidate) => candidate.isGame);
    if (game === undefined) {
      return capabilityStatus(
        false,
        rooms.some((room) => room.isGame),
      );
    }
    expectChat(flow, `chat-room-${game.id}`, "chat-subject");
    await openRoom(flow, game, true);
    await composerMenus(flow, game);
    await context(flow, game);
    return "visited";
  });
}

/** Read original transcript boundaries and long role interiors under the coordinator's actual style. */
export async function walkChatReading(input: SurfaceFlow): Promise<void> {
  const messageOperations: MessageOperationProof[] = [];
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-reading", kind: "chat-journey" }], messageOperations };
  try {
    await flow.page.goto("/");
    await waitForAppReady(flow.page);
    await flow.requestPanes();
    const rooms = await readChats(flow);
    const candidates = rooms.toSorted((a, b) => b.messageCount - a.messageCount);
    subjectCoverage(flow, rooms);
    const room = candidates.at(0);
    if (room === undefined) {
      record(flow, "chat-reading", "unvisited", "No readable original transcript subject");
      return;
    }
    const messages = await readCanon(flow, room.id);
    record(flow, "reading-room-scope", "observed", `Selected original room ${room.id}; other library rooms are not claimed as reading witnesses`);
    const first = messages.at(0);
    if (first === undefined) {
      record(flow, "chat-reading", "not-applicable", "Selected original room has no readable committed messages");
      return;
    }
    messageOperations.push(...(await runChatMessageOperations(input)));
    expect(await readCanon(flow, room.id), "Disposable operation proofs must leave the entire original reading canon untouched").toEqual(messages);
    const witnesses = new Map([[first.id, first]]);
    addRoleWitnesses(flow, witnesses, messages);
    const last = messages.at(-1);
    if (last !== undefined) {
      witnesses.set(last.id, last);
    }
    for (const message of witnesses.values()) {
      expectChat(flow, `reading-${message.role}-${message.id}-start`, "reading-subject");
    }
    await openRoom(flow, room);
    await reachMessage(flow, first, -1);
    for (const message of [...witnesses.values()].toSorted((a, b) => a.seq - b.seq)) {
      await readMessage(flow, message);
    }
    record(
      flow,
      "reading-data",
      "observed",
      `${String(messages.length)} original canon rows read; ${String(witnesses.size)} identity-scoped boundary/role witnesses`,
    );
    record(flow, "chat-reading", "visited", "Original-role reading witnesses completed; delayed media and arrival remain explicitly separate");
  } finally {
    await publish(flow, "chat-reading-coverage");
  }
}

async function commandRoom(flow: Journey, chatId: ChatId, search: string): Promise<ChatSummary> {
  const result = await flow.client.chat.listChats.query({ search, limit: CHAT_LIST_MAX_LIMIT, includeArchived: true });
  const room = result.items.find(({ id }) => id === chatId);
  if (room === undefined) {
    throw new Error("The disposable command subject is absent from its identity-scoped production read");
  }
  return room;
}

async function commandMenu(flow: Journey, room: ChatSummary): Promise<Locator> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const show = flow.page.getByRole("button", { name: "Show list panel", exact: true });
  if (await show.isVisible()) {
    await show.click();
  }
  const row = await roomRow(flow, room);
  await row.hover();
  const trigger = row.getByRole("button", { name: /^Chat actions for /u });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = await controlledPanel(trigger);
  await expect(menu).toHaveCount(1);
  await expect(menu).toBeVisible();
  return menu;
}

async function commandMenuOwner(menu: Locator): Promise<Locator> {
  const ownerId = await menu.getAttribute("aria-labelledby");
  if (ownerId === null) {
    throw new Error("The lifecycle menu has no native trigger relationship");
  }
  return menu.page().locator(`[id=${JSON.stringify(ownerId)}]`);
}

async function commandExports(flow: Journey, room: ChatSummary): Promise<void> {
  let menu = await commandMenu(flow, room);
  const exportTrigger = menu.getByRole("menuitem", { name: "Export transcript", exact: true });
  await exportTrigger.focus();
  await exportTrigger.press("ArrowRight");
  await expect(exportTrigger).toHaveAttribute("aria-expanded", "true");
  const submenu = await controlledPanel(exportTrigger);
  const labels = await submenu.getByRole("menuitem").allTextContents();
  for (const label of labels) {
    expectChat(flow, `commands/export/${label.trim()}`, "menu-operation");
  }
  await submenu.press("Escape");
  await expect(exportTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(exportTrigger).toBeFocused();
  const owner = await commandMenuOwner(menu);
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(owner).toBeFocused();
  for (const raw of labels) {
    const label = raw.trim();
    const id = `commands/export/${label}`;
    menu = await commandMenu(flow, room);
    const downloadOwner = await commandMenuOwner(menu);
    const trigger = menu.getByRole("menuitem", { name: "Export transcript", exact: true });
    await trigger.focus();
    await trigger.press("ArrowRight");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const exportMenu = await controlledPanel(trigger);
    const leaf = exportMenu.getByRole("menuitem", { name: label, exact: true });
    await flow.action(id, {
      action: async () => {
        const pending = flow.page.waitForEvent("download");
        await leaf.click();
        const download = await pending;
        expect(await download.failure()).toBeNull();
        const path = flow.info.outputPath(`${crypto.randomUUID()}${extname(download.suggestedFilename())}`);
        await download.saveAs(path);
        expect((await stat(path)).size).toBeGreaterThan(0);
        await flow.info.attach(`disposable-${download.suggestedFilename()}`, { path });
      },
      ready: async () => {
        await expect(flow.page.getByRole("list", { name: "Chats list", exact: true })).toBeVisible();
      },
    });
    record(flow, id, "visited", `Actual native download from disposable room ${room.id}; nonempty original response saved in private native output`);
    if ((await exportMenu.and(flow.page.locator("[data-open]")).count()) > 0) {
      await exportMenu.press("Escape");
    }
    if ((await menu.and(flow.page.locator("[data-open]")).count()) > 0) {
      await menu.press("Escape");
    }
    await expect(menu).toBeHidden();
    await expect(downloadOwner).toBeFocused();
  }
}

async function commandEdit(flow: Journey, room: ChatSummary): Promise<void> {
  const message = (await readCanon(flow, room.id)).at(-1);
  if (message === undefined) {
    throw new Error("The disposable command subject has no editable committed message");
  }
  const id = "commands/message-edit-save";
  expectChat(flow, id, "menu-operation");
  await openRoom(flow, room);
  const row = messageRow(flow.page, message.id);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
  await flow.page.getByRole("menu").getByRole("menuitem", { name: MESSAGE_EDIT_NAME, exact: true }).click();
  const editor = row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true });
  const edited = "This explicitly disposable command witness was edited through the production message menu.";
  await expect(editor).toBeFocused();
  await editor.fill(edited);
  await flow.action(id, {
    action: async () => {
      await row.getByRole("button", { name: "Save edit", exact: true }).click();
    },
    ready: async () => {
      await expect(editor).toBeHidden();
      await expect(row).toContainText(edited);
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id: messageId }) => messageId === message.id)?.content).toBe(edited);
    },
  });
  await checkpoint(flow, id, row, row);
  record(flow, id, "visited", `Native Edit/Save changed disposable message ${message.id}; persisted content and rendered row agree`);
}

/** Execute lifecycle commands against an explicitly disposable production-created room, never an original reading subject. */
export async function walkChatCommands(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-commands", kind: "chat-journey" }] };
  const title = `Surface commands ${crypto.randomUUID()}`;
  let createdId: ChatId | undefined;
  try {
    const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [], opening: "none", title });
    expect(flow.run.subjects.chats.some(({ id }) => id === chat.id)).toBe(false);
    createdId = chat.id;
    await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
    await flow.client.chat.commitMessage.mutate({
      chatId: chat.id,
      content: "A disposable command witness, not original owner history.",
      timeZone: UTC_TIME_ZONE,
    });
    let room = await commandRoom(flow, chat.id, title);
    let menu = await commandMenu(flow, room);
    const labels = await menu.locator('[role="menuitem"]:not([aria-haspopup="menu"])').allTextContents();
    for (const label of labels) {
      const id = `commands/lifecycle/${label.trim()}`;
      expectChat(flow, id, "menu-operation");
      record(flow, id, "unvisited", "Native available command seeded before execution; only its completed operation can supersede this disposition");
    }
    await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const dialog = flow.page.getByRole("dialog", { name: "Rename chat", exact: true });
    const renamed = `${title} renamed`;
    await dialog.getByRole("textbox", { name: "Chat title", exact: true }).fill(renamed);
    await flow.action("commands/rename-save", {
      action: async () => {
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
      },
      ready: async () => {
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await commandRoom(flow, chat.id, title)).title).toBe(renamed);
        await expect(flow.page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button", { name: renamed, exact: true })).toBeVisible();
      },
    });
    record(flow, "commands/lifecycle/Rename", "visited", "Native rename Save persisted and repainted the disposable subject");
    for (const [label, starred] of [
      ["Star", true],
      ["Unstar", false],
    ] as const) {
      room = await commandRoom(flow, chat.id, title);
      const starMenu = await commandMenu(flow, room);
      expectChat(flow, `commands/lifecycle/${label}`, "menu-operation");
      await flow.action(`commands/${label}`, {
        action: async () => {
          await starMenu.getByRole("menuitem", { name: label, exact: true }).click();
        },
        ready: async () => {
          await expect(starMenu).toBeHidden();
          await expect.poll(async () => (await commandRoom(flow, chat.id, title)).starred).toBe(starred);
          const row = flow.page
            .getByRole("list", { name: "Chats list", exact: true })
            .locator('[data-slot="virtual-list-row"]')
            .filter({ has: flow.page.getByRole("button", { name: renamed, exact: true }) });
          await row.hover();
          await row.getByRole("button", { name: /^Chat actions for /u }).click();
          await expect(flow.page.getByRole("menu").getByRole("menuitem", { name: starred ? "Unstar" : "Star", exact: true })).toBeVisible();
          await flow.page.getByRole("menu").press("Escape");
        },
      });
      record(flow, `commands/lifecycle/${label}`, "visited", "Native star command persisted and its inverse became available in the actual subject menu");
    }
    room = await commandRoom(flow, chat.id, title);
    await commandExports(flow, room);
    await commandEdit(flow, room);
    menu = await commandMenu(flow, await commandRoom(flow, chat.id, title));
    await flow.action("commands/archive", {
      action: async () => {
        await menu.getByRole("menuitem", { name: "Archive", exact: true }).click();
      },
      ready: async () => {
        await expect.poll(async () => (await commandRoom(flow, chat.id, title)).archived).toBe(true);
        await expect(flow.page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
      },
    });
    record(flow, "commands/lifecycle/Archive", "visited", "Native archive persisted and removed the exact disposable subject from the non-archived list");
    await flow.client.chat.archive.mutate({ chatId: chat.id, archived: false });
    menu = await commandMenu(flow, await commandRoom(flow, chat.id, title));
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const confirm = flow.page.getByRole("alertdialog", { name: `Delete "${renamed}"?`, exact: true });
    await expect(confirm).toBeVisible();
    await flow.action("commands/delete-confirm", {
      action: async () => {
        await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      },
      ready: async () => {
        await expect(confirm).toBeHidden();
        await expect(flow.page.getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
        await expect
          .poll(async () =>
            (await flow.client.chat.listChats.query({ search: title, includeArchived: true, limit: CHAT_LIST_MAX_LIMIT })).items.some(
              ({ id }) => id === chat.id,
            ),
          )
          .toBe(false);
      },
    });
    record(
      flow,
      "commands/lifecycle/Delete",
      "visited",
      "Native destructive confirmation deleted only the disposable subject; production read and rendered list prove removal",
    );
    record(flow, "chat-commands", "visited", "Disposable lifecycle, download and message Edit/Save operations completed; no original subject was mutated");
  } finally {
    try {
      if (createdId !== undefined) {
        const remaining = await flow.client.chat.listChats.query({ search: title, includeArchived: true, limit: CHAT_LIST_MAX_LIMIT });
        if (remaining.items.some(({ id }) => id === createdId)) {
          await flow.client.chat.delete.mutate({ chatId: createdId });
        }
      }
    } finally {
      await publish(flow, "chat-command-coverage");
    }
  }
}

async function messageOperationMenu(flow: Journey, message: MessageView): Promise<Locator> {
  const row = messageRow(flow.page, message.id);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  const trigger = row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true });
  try {
    await trigger.click();
  } catch (error) {
    await attachNativeFile(flow.info, flow.info, "message-menu-pointer-failure", {
      body: JSON.stringify({
        chatId: message.chatId,
        messageId: message.id,
        role: message.role,
        row: await row.ariaSnapshot(),
        facts: await trigger.evaluate((element) => {
          const target = element.getBoundingClientRect();
          const elementFacts = (node: Element) => {
            const style = getComputedStyle(node);
            return {
              tag: node.tagName,
              slot: node.getAttribute("data-slot"),
              rect: node.getBoundingClientRect().toJSON(),
              position: style.position,
              zIndex: style.zIndex,
              pointerEvents: style.pointerEvents,
              html: node.outerHTML.slice(0, 1000),
            };
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            target: elementFacts(element),
            hits: document.elementsFromPoint(target.x + target.width / 2, target.y + target.height / 2).map(elementFacts),
          };
        }),
      }),
      contentType: "application/json",
    });
    throw error;
  }
  const menu = await controlledPanel(trigger);
  await expect(menu).toBeVisible();
  const identity = `message-operations/${message.role}/${message.id}`;
  await attachNativeFile(flow.info, flow.info, identity.replaceAll("/", "-"), {
    body: JSON.stringify({
      chatId: message.chatId,
      messageId: message.id,
      role: message.role,
      authorUserId: message.authorUserId,
      selectedVariantId: message.selectedVariantId,
      hasContinuation: message.hasContinuation,
      menu: await menu.ariaSnapshot(),
    }),
    contentType: "application/json",
  });
  for (const item of await menu.getByRole("menuitem").all()) {
    const label = (await item.textContent())?.trim() ?? "";
    const name = `${identity}/${label}`;
    expectChat(flow, name, "message-menu-operation");
    const disabled = await item.isDisabled();
    const completion = flow.coverage.some((entry) => entry.name === name && entry.status === "visited") ? "visited" : "observed";
    record(
      flow,
      name,
      disabled ? "not-applicable" : completion,
      disabled
        ? "Actual rendered item is disabled; native menu snapshot retains its visible reason"
        : "Actual enabled leaf; operation completion is recorded separately against this exact message identity",
    );
  }
  return menu;
}

async function messageOperationDone(flow: Journey, message: MessageView, label: string, detail: string): Promise<void> {
  const chat = await flow.client.chat.getChat.query({ chatId: message.chatId });
  flow.messageOperations?.push({ label, message, viewerIsHost: chat.viewerIsHost, viewerOwnsMessage: message.authorUserId === chat.viewerUserId, detail });
  record(flow, `message-operations/${message.role}/${message.id}/${label}`, "visited", detail);
}

async function messageSavedReply(flow: Journey): Promise<void> {
  const character = await flow.client.character.create.mutate({
    input: {
      handle: characterHandleSchema.parse(`surface-message-${crypto.randomUUID()}`),
      name: "Disposable saved reply character",
      description: "Disposable greeting recovery witness.",
      greetings: [{ text: "Disposable first card greeting." }, { text: "Disposable second card greeting." }],
    },
  });
  try {
    const title = `Surface saved replies ${crypto.randomUUID()}`;
    const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [character.id], opening: "first-message", title });
    try {
      await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
      const room = await commandRoom(flow, chat.id, title);
      const message = (await readCanon(flow, chat.id)).at(-1);
      if (message === undefined) {
        throw new Error("The production card opening has no committed greeting");
      }
      await openRoom(flow, room);
      await closeContextOverlay(flow, "message-operations-greeting");
      let menu = await messageOperationMenu(flow, message);
      await expect(menu.getByRole("menuitem", { name: "Saved replies…", exact: true })).toHaveCount(0);
      await menu.getByRole("menuitem", { name: MESSAGE_EDIT_NAME, exact: true }).click();
      const row = messageRow(flow.page, message.id);
      const custom = "Disposable authored greeting retained beside card alternates.";
      await row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true }).fill(custom);
      await row.getByRole("button", { name: "Save edit", exact: true }).click();
      await expect(row).toContainText(custom);
      const saved = (await readCanon(flow, chat.id)).find(({ id }) => id === message.id);
      if (saved === undefined) {
        throw new Error("The edited greeting disappeared");
      }
      await messageOperationDone(flow, saved, MESSAGE_EDIT_NAME, "Native greeting Edit/Save persisted the exact authored content and repainted its row");
      await row.getByRole("button", { name: "Next greeting", exact: true }).click();
      await expect(row).toContainText("Disposable first card greeting.");
      await expect.poll(async () => (await readCanon(flow, chat.id)).find(({ id }) => id === message.id)?.variantCount).toBe(2);
      const variants = await flow.client.chat.listMessageVariants.query({ chatId: chat.id, messageId: message.id });
      const stored = variants.find(({ variantId }) => variantId === saved.selectedVariantId);
      if (stored === undefined) {
        throw new Error("The production greeting step lost the authored sibling");
      }
      const current = (await readCanon(flow, chat.id)).find(({ id }) => id === message.id);
      if (current === undefined) {
        throw new Error("The stepped greeting disappeared");
      }
      menu = await messageOperationMenu(flow, current);
      await menu.getByRole("menuitem", { name: "Saved replies…", exact: true }).click();
      const dialog = flow.page.getByRole("dialog", { name: "Saved replies", exact: true });
      await dialog.getByRole("combobox", { name: "Saved reply", exact: true }).click();
      await flow.page.getByRole("option", { name: `Reply ${String(stored.idx + 1)}`, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await readCanon(flow, chat.id)).find(({ id }) => id === message.id)?.selectedVariantId).toBe(saved.selectedVariantId);
      await expect(row).toContainText(custom);
      await checkpoint(flow, "message-operations/saved-reply-restored", row, row);
      await messageOperationDone(
        flow,
        current,
        "Saved replies…",
        "Absent with one stored greeting; native card step preserved authored prose as a sibling, and Saved replies restored its exact persisted variant and rendered content",
      );
    } finally {
      await flow.client.chat.delete.mutate({ chatId: chat.id });
    }
  } finally {
    await flow.client.character.remove.mutate({ characterId: character.id });
  }
}

async function messageEdit(flow: Journey, message: MessageView): Promise<MessageView> {
  const menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: MESSAGE_EDIT_NAME, exact: true }).click();
  const row = messageRow(flow.page, message.id);
  const content = `Disposable ${message.role} content saved through the actual row editor.`;
  await row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true }).fill(content);
  await row.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(row).toContainText(content);
  await expect.poll(async () => (await readCanon(flow, message.chatId)).find(({ id }) => id === message.id)?.content).toBe(content);
  const saved = (await readCanon(flow, message.chatId)).find(({ id }) => id === message.id);
  if (saved === undefined) {
    throw new Error("The edited disposable row disappeared");
  }
  await messageOperationDone(flow, saved, MESSAGE_EDIT_NAME, "Native Edit/Save persisted the exact authored content and repainted the disposable row");
  return saved;
}

async function messageFork(flow: Journey, message: MessageView, forks: ChatId[]): Promise<void> {
  const parent = (await readCanon(flow, message.chatId)).filter(({ seq }) => seq <= message.seq);
  const paragraphs = await messageRow(flow.page, message.id).locator("p").allTextContents();
  const menu = await messageOperationMenu(flow, message);
  const pending = flow.page.waitForResponse((response) => isTrpcRequestFor(response.url(), "chat.forkChat"));
  await menu.getByRole("menuitem", { name: MESSAGE_FORK_NAME, exact: true }).click();
  const fork = await readTrpcOutput(await pending, "chat.forkChat", forkResultSchema);
  forks.push(fork.chat.id);
  expect(fork.chat.id).not.toBe(message.chatId);
  expect(flow.run.subjects.chats.some(({ id }) => id === fork.chat.id)).toBe(false);
  const copied = await readCanon(flow, fork.chat.id);
  expect(copied.map(({ content, role }) => ({ content, role }))).toEqual(parent.map(({ content, role }) => ({ content, role })));
  const tail = copied.at(-1);
  if (tail === undefined) {
    throw new Error("The response-owned fork has no copied message");
  }
  await expect(messageRow(flow.page, tail.id).locator("p")).toHaveText(paragraphs);
  await checkpoint(flow, `message-operations/${message.role}/fork-selected`, flow.page.locator("body"), messageRow(flow.page, tail.id));
  await messageOperationDone(
    flow,
    message,
    MESSAGE_FORK_NAME,
    `Native response owns fork ${fork.chat.id}; exact copied prefix and selected rendered fork row verified`,
  );
}

async function messageVisibilityAndReaction(flow: Journey, message: MessageView): Promise<void> {
  for (const [label, hidden] of [
    ["Hide from AI", true],
    ["Unhide from AI", false],
  ] as const) {
    const menu = await messageOperationMenu(flow, message);
    await flow.action(`message-operations/${label}`, {
      action: async () => {
        await menu.getByRole("menuitem", { name: label, exact: true }).click();
      },
      ready: async () => {
        await expect(menu).toBeHidden();
        await expect.poll(async () => (await readCanon(flow, message.chatId)).find(({ id }) => id === message.id)?.excludedFromPrompt).toBe(hidden);
        const inverse = await messageOperationMenu(flow, message);
        await expect(inverse.getByRole("menuitem", { name: hidden ? "Unhide from AI" : "Hide from AI", exact: true })).toBeVisible();
        await inverse.press("Escape");
      },
    });
    await messageOperationDone(flow, message, label, "Native visibility command persisted and its inverse rendered on the same disposable message");
  }
  let menu = await messageOperationMenu(flow, message);
  const reaction = menu.getByRole("menuitem", { name: MESSAGE_REACTION_ADD_NAME, exact: true });
  if ((await reaction.count()) === 0) {
    record(flow, "message-operations/reactions", "not-applicable", "This actual room menu has no reaction door");
    await menu.press("Escape");
    return;
  }
  await reaction.click();
  const picker = flow.page.getByRole("dialog", { name: MESSAGE_REACTION_ADD_NAME, exact: true });
  const choice = picker.getByRole("button", { name: /^React with /u }).first();
  await expect(choice).toBeVisible();
  const name = await choice.getAttribute("aria-label");
  if (name === null) {
    throw new Error("The actual emoji choice has no native name");
  }
  await choice.click();
  await expect(picker).toBeHidden();
  const pill = messageRow(flow.page, message.id).getByRole("button", { name: `${name} — 1 so far`, exact: true });
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await checkpoint(flow, "message-operations/reaction-added", messageRow(flow.page, message.id), pill);
  menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: MESSAGE_REACTION_ADD_NAME, exact: true }).click();
  await expect(picker.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name, exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(pill).toHaveCount(0);
  await messageOperationDone(
    flow,
    message,
    MESSAGE_REACTION_ADD_NAME,
    "Actual rendered emoji choice added a pressed reaction pill; reopening retained selection and toggling removed it",
  );
}

async function expectClipboardContent(flow: Journey, content: string): Promise<void> {
  await expect.poll(async () => await flow.page.evaluate(async () => await navigator.clipboard.readText())).toBe(content);
}

async function messageCopyAndDelete(flow: Journey, message: MessageView): Promise<void> {
  const chromium = flow.page.context().browser()?.browserType().name() === "chromium";
  if (chromium) {
    await flow.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  const previousCopy = flow.page.locator('[data-slot="toast-root"]').filter({ has: flow.page.getByText("Copied to clipboard.", { exact: true }) });
  for (const notification of await previousCopy.all()) {
    await notification.getByRole("button", { name: "Close notification", exact: true }).click();
  }
  await expect(previousCopy).toHaveCount(0);
  let menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect(flow.page.getByText("Copied to clipboard.", { exact: true })).toBeVisible();
  if (chromium) {
    await expectClipboardContent(flow, message.content);
  }
  await messageOperationDone(flow, message, "Copy", "Native clipboard write completed with the production success acknowledgement");
  menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const confirm = flow.page.getByRole("alertdialog", { name: "Delete this message?", exact: true });
  await expect(confirm).toBeVisible();
  await flow.action("message-operations/delete", {
    action: async () => {
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    },
    ready: async () => {
      await expect(confirm).toBeHidden();
      await expect(messageRow(flow.page, message.id)).toHaveCount(0);
      await expect.poll(async () => (await readCanon(flow, message.chatId)).some(({ id }) => id === message.id)).toBe(false);
    },
  });
  await messageOperationDone(flow, message, "Delete", "Native destructive confirmation removed the exact disposable message from rendered and persisted canon");
}

/** Execute row commands on disposable canon; original reading-menu inventories retain their own dispositions. */
export async function walkChatMessageOperations(input: SurfaceFlow): Promise<void> {
  await runChatMessageOperations(input);
}

async function runChatMessageOperations(input: SurfaceFlow): Promise<MessageOperationProof[]> {
  const messageOperations: MessageOperationProof[] = [];
  const flow: Journey = { ...input, coverage: [], expected: [], messageOperations };
  const previous = (await flow.client.connection.listBindings.query()).find(({ task }) => task === "chat");
  if (previous === undefined) {
    throw new Error("The production binding catalogue has no chat task");
  }
  const forks: ChatId[] = [];
  const persona = await flow.client.persona.create.mutate({
    input: { name: "Disposable operation persona", description: "Explicitly disposable restamp witness." },
  });
  try {
    await flow.client.connection.setBinding.mutate({ task: "chat", connectionId: flow.run.generation.connection.id });
    await disposableRoom(flow, { name: "message operations", content: "Disposable message operation witness.", attachments: [] }, async (room, messages) => {
      const user = messages.at(-1);
      if (user === undefined) {
        throw new Error("The disposable room has no committed user message");
      }
      await flow.client.persona.setActivePersona.mutate({ chatId: room.id, personaId: null });
      expect((await flow.client.chat.getChat.query({ chatId: room.id })).viewerActivePersonaId).toBeNull();
      await openRoom(flow, room);
      await closeContextOverlay(flow, "message-operations-content");
      let menu = await messageOperationMenu(flow, user);
      await expect(menu.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_NAME, exact: true })).toBeDisabled();
      await menu.press("Escape");
      await flow.client.persona.setActivePersona.mutate({ chatId: room.id, personaId: persona.id });
      await closeContextOverlay(flow, "message-operations-persona");
      menu = await messageOperationMenu(flow, user);
      await menu.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_NAME, exact: true }).click();
      const confirm = flow.page.getByRole("alertdialog", { name: "Reattribute from here?", exact: true });
      await expect(confirm).toContainText(persona.name);
      await confirm.getByRole("button", { name: "Reattribute", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id }) => id === user.id)?.personaId).toBe(persona.id);
      await expect(messageRow(flow.page, user.id)).toHaveAccessibleName(persona.name);
      await messageOperationDone(
        flow,
        user,
        MESSAGE_REATTRIBUTE_NAME,
        "Disabled without a persona; native confirmation restamped this viewer's user line to the disposable active persona and repainted its name",
      );
      const editedUser = await messageEdit(flow, user);
      await messageVisibilityAndReaction(flow, editedUser);
      await messageFork(flow, editedUser, forks);
      await openRoom(flow, room);
      await closeContextOverlay(flow, "message-operations-generation");
      const composer = flow.page.getByRole("group", { name: "Message composer", exact: true });
      await composer.getByRole("textbox", { name: "Message", exact: true }).fill("Produce a disposable assistant operation witness.");
      await composer.getByRole("button", { name: "Send message", exact: true }).click();
      await expect.poll(async () => (await readCanon(flow, room.id)).some(({ role }) => role === "assistant")).toBe(true);
      const assistant = (await readCanon(flow, room.id)).find(({ role }) => role === "assistant");
      if (assistant === undefined) {
        throw new Error("Native Send has no durable assistant reply");
      }
      const paragraphs = messageRow(flow.page, assistant.id).locator("p");
      await expect(paragraphs.first()).toContainText(/\S/u);
      const originalParagraphs = await paragraphs.allTextContents();
      menu = await messageOperationMenu(flow, assistant);
      for (const label of ["Undo last continuation", "Re-apply continuation"]) {
        await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeDisabled();
      }
      record(
        flow,
        `message-operations/assistant/${assistant.id}/Saved replies…`,
        "not-applicable",
        "Generated assistant row has no card-opening binding; actual menu snapshot has no Saved replies door",
      );
      await menu.press("Escape");
      menu = await messageOperationMenu(flow, assistant);
      await safeDialogDrill(flow, menu.getByRole("menuitem", { name: "View wire trace…", exact: true }), {
        label: "View wire trace…",
        id: "message-operations/wire-trace",
      });
      await messageOperationDone(
        flow,
        assistant,
        "View wire trace…",
        "Native host-only wire viewer opened the actual generated variant record and rendered its loaded body",
      );
      await composer.getByRole("button", { name: "Continue the reply", exact: true }).click();
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id }) => id === assistant.id)?.hasContinuation).toBe(true);
      const continued = (await readCanon(flow, room.id)).find(({ id }) => id === assistant.id);
      if (continued === undefined) {
        throw new Error("The continued reply disappeared");
      }
      expect(continued.content).not.toBe(assistant.content);
      await expect.poll(async () => await paragraphs.allTextContents()).not.toEqual(originalParagraphs);
      const continuedParagraphs = await paragraphs.allTextContents();
      for (const [label, content, rendered] of [
        ["Undo last continuation", assistant.content, originalParagraphs],
        ["Re-apply continuation", continued.content, continuedParagraphs],
      ] as const) {
        menu = await messageOperationMenu(flow, continued);
        await menu.getByRole("menuitem", { name: label, exact: true }).click();
        await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id }) => id === assistant.id)?.content).toBe(content);
        await expect(paragraphs).toHaveText(rendered);
        await messageOperationDone(
          flow,
          continued,
          label,
          "Native row restore command changed the same selected variant to the exact stored continuation snapshot and repainted canon",
        );
      }
      const editedAssistant = await messageEdit(flow, continued);
      await messageVisibilityAndReaction(flow, editedAssistant);
      await messageFork(flow, editedAssistant, forks);
      await openRoom(flow, room);
      await closeContextOverlay(flow, "message-operations-delete-assistant");
      await messageCopyAndDelete(flow, editedAssistant);
      await messageCopyAndDelete(flow, editedUser);
    });
    await messageSavedReply(flow);
  } finally {
    try {
      await flow.client.connection.setBinding.mutate({ task: "chat", connectionId: previous.binding?.connectionId ?? null });
      for (const chatId of forks) {
        await flow.client.chat.delete.mutate({ chatId });
      }
      await flow.client.persona.remove.mutate({ personaId: persona.id });
    } finally {
      await publish(flow, "chat-message-operation-coverage");
    }
  }
  return messageOperations;
}

/** The text the transcript paints for plain authored prose: the production display pipeline over the viewer's own
 *  library scripts. The disposable room broadcasts none, which this asserts rather than composing the two tiers. */
async function displayedText(flow: Journey, chatId: ChatId, text: string): Promise<string> {
  expect(await flow.client.regex.listRoomDisplayScripts.query({ chatId })).toEqual([]);
  return renderMessageForDisplay(text, {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
    displayScripts: await flow.client.regex.listScripts.query(),
  });
}

async function disposableRoom(
  flow: Journey,
  request: { readonly name: string; readonly content: string; readonly attachments: readonly AssetId[] },
  run: (room: ChatSummary, messages: readonly MessageView[]) => Promise<void>,
): Promise<void> {
  const { name, content, attachments } = request;
  const title = `Surface walk ${name} ${crypto.randomUUID()}`;
  const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [], opening: "none", title });
  expect(flow.run.subjects.chats.some(({ id }) => id === chat.id)).toBe(false);
  try {
    await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
    await flow.client.chat.commitMessage.mutate({ chatId: chat.id, content, attachmentAssetIds: [...attachments], timeZone: UTC_TIME_ZONE });
    const result = await flow.client.chat.listChats.query({ search: title, limit: CHAT_LIST_MAX_LIMIT });
    const room = result.items.find(({ id }) => id === chat.id);
    if (room === undefined) {
      throw new Error("The newly committed disposable control room is absent from its production library read");
    }
    record(flow, `${name}-subject`, "observed", `Explicit disposable journey CRUD room ${chat.id}; never an original snapshot reading witness`);
    await run(room, await readCanon(flow, room.id));
  } finally {
    await flow.client.chat.delete.mutate({ chatId: chat.id });
    await expect
      .poll(async () => (await flow.client.chat.listChats.query({ search: title, limit: CHAT_LIST_MAX_LIMIT })).items.some(({ id }) => id === chat.id))
      .toBe(false);
  }
}

/** Run real Send, visible streaming and Stop against the root's bounded text peer on a disposable room. */
export async function walkChatGeneration(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-generation", kind: "chat-journey" }] };
  const previous = (await flow.client.connection.listBindings.query()).find(({ task }) => task === "chat");
  if (previous === undefined) {
    throw new Error("The production connection binding catalogue has no chat task");
  }
  const previousId = previous.binding?.connectionId ?? null;
  try {
    await flow.client.connection.setBinding.mutate({ task: "chat", connectionId: flow.run.generation.connection.id });
    await disposableRoom(flow, { name: "generation", content: "A disposable native Send and Stop witness.", attachments: [] }, async (room) => {
      await openRoom(flow, room);
      await closeContextOverlay(flow, "generation-content");
      const composer = flow.page.getByRole("group", { name: "Message composer", exact: true });
      const textbox = composer.getByRole("textbox", { name: "Message", exact: true });
      const stop = composer.getByRole("button", { name: "Stop generating", exact: true });
      const ghost = flow.page.locator('[data-slot="ghost-message-row"]');
      const prompt = `Complete the disposable native witness ${crypto.randomUUID()}.`;
      await textbox.fill(prompt);
      await flow.action("generation/send-completion", {
        action: async () => {
          await composer.getByRole("button", { name: "Send message", exact: true }).click();
        },
        ready: async () => {
          await expect
            .poll(async () =>
              (await readCanon(flow, room.id)).some((message) => message.role === "assistant" && message.content === flow.run.generation.completionText),
            )
            .toBe(true);
          await expect(stop).toBeHidden();
          await expect(ghost).toHaveCount(0);
          await expect(textbox).toHaveValue("");
        },
      });
      const completed = (await readCanon(flow, room.id)).find(
        (message) => message.role === "assistant" && message.content === flow.run.generation.completionText,
      );
      if (completed === undefined) {
        throw new Error("The completed native turn has no durable assistant message");
      }
      await expect(messageRow(flow.page, completed.id)).toContainText(await displayedText(flow, room.id, flow.run.generation.completionText));
      record(
        flow,
        "generation/completion",
        "visited",
        "Native Send produced the exact scripted reply in persisted canon and the rendered assistant row; no midstream paint claim for the immediate reply",
      );
      const cursor = Math.max(
        0,
        ...parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).map(({ requestId }) => requestId),
      );
      await textbox.fill(flow.run.generation.cancelCue);
      try {
        await flow.action("generation/send-held-stream", {
          action: async () => {
            await composer.getByRole("button", { name: "Send message", exact: true }).click();
          },
          ready: async () => {
            await expect(stop).toBeVisible();
            await expect(ghost.locator('[data-slot="ghost-stream-body"]')).toContainText(flow.run.generation.completionText);
          },
        });
        const heldRequests = parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).filter(
          ({ requestId, event, request }) => requestId > cursor && event === "held" && request === "POST /v1/chat/completions",
        );
        expect(heldRequests, "This Send must own exactly one fresh physical held request").toHaveLength(1);
        const held = heldRequests.at(0);
        if (held === undefined) {
          throw new Error("This Send has no fresh physical held request");
        }
        await attachNativeFile(flow.info, flow.info, "generation-current-held-request", {
          body: JSON.stringify({ cursor, ...held }),
          contentType: "application/json",
        });
        await checkpoint(flow, "generation-visible-held-stream", flow.page.locator("body"), ghost);
        await flow.action("generation/stop-held-stream", {
          action: async () => {
            await stop.click();
          },
          ready: async () => {
            await expect(stop).toBeHidden();
            await expect(composer.getByRole("button", { name: "Stopping…", exact: true })).toBeHidden();
            await expect(ghost).toHaveCount(0);
            await expect
              .poll(async () =>
                parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).some(
                  ({ requestId, event, request }) => requestId === held.requestId && request === held.request && (event === "aborted" || event === "cancelled"),
                ),
              )
              .toBe(true);
          },
        });
        record(
          flow,
          "generation/cancel",
          "visited",
          "Native Stop removed the actual visible held stream and the physical provider recorded stream cancellation",
        );
      } finally {
        await flow.client.chat.abort.mutate({ chatId: room.id });
      }
      await checkpoint(flow, "generation-after-stop", flow.page.locator("body"), composer);
      record(
        flow,
        "chat-generation",
        "visited",
        "Disposable native completion and visible streaming cancellation completed through the production turn lifecycle",
      );
    });
  } finally {
    try {
      await flow.client.connection.setBinding.mutate({ task: "chat", connectionId: previousId });
      expect((await flow.client.connection.listBindings.query()).find(({ task }) => task === "chat")?.binding?.connectionId ?? null).toBe(previousId);
      await flow.info.attach("generation-physical-request-receipt", { path: flow.run.generation.requestEvidencePath, contentType: "text/plain" });
    } finally {
      await publish(flow, "chat-generation-coverage");
    }
  }
}

/** Enter a maintained guest's actual opaque frame and operate its native controls, not just host chrome. */
export async function walkChatArcade(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-arcade", kind: "plugin-operation" }] };
  try {
    const plugin = (await flow.client.plugin.list.query()).find(({ slug, status }) => slug === "pocket-arcade" && status === "enabled");
    if (plugin === undefined) {
      record(flow, "chat-arcade", "not-applicable", "This dataset has no enabled Pocket Arcade install; no guest execution is claimed");
      return;
    }
    const surface = (await flow.client.plugin.listSurfaces.query()).find(
      (candidate) => candidate.pluginId === plugin.id && candidate.anchor === "chat-flank" && candidate.tier === "frame",
    );
    if (surface === undefined) {
      throw new Error("The enabled maintained arcade has no registered chat frame; inspect its grant/startup evidence");
    }
    await disposableRoom(flow, { name: "arcade", content: "A disposable room for the maintained guest frame.", attachments: [] }, async (room) => {
      await openRoom(flow, room);
      await openDetailPanel(flow.page);
      await flow.page
        .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
        .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })
        .click();
      await pluginContextReady(flow);
      const frame = activeContext(flow).locator("iframe").filter({ visible: true });
      const arcade = frame.and(flow.page.getByTitle(new RegExp(`^${RegExp.escape(plugin.name)}(?: — ${RegExp.escape(surface.title)})?$`, "u")));
      await expect(arcade).toHaveCount(1);
      await expect(arcade).toBeVisible();
      const guest = arcade.contentFrame();
      const board = guest.locator("#board");
      const cells = board.locator(".cell");
      await expect(guest.getByRole("button", { name: "New game", exact: true })).toBeVisible();
      await expect.poll(async () => await cells.count()).toBeGreaterThan(0);
      await guest.getByRole("button", { name: "New game", exact: true }).click();
      const before = await cells.allTextContents();
      await flow.action("arcade/native-pad", {
        action: async () => {
          await guest.getByRole("button", { name: "▲", exact: true }).click();
          await guest.getByRole("button", { name: "◀", exact: true }).click();
          await guest.getByRole("button", { name: "▼", exact: true }).click();
          await guest.getByRole("button", { name: "▶", exact: true }).click();
        },
        ready: async () => {
          await expect.poll(async () => await cells.allTextContents()).not.toEqual(before);
        },
      });
      await attachNativeFile(flow.info, flow.info, "arcade-native-guest", {
        body: JSON.stringify(
          { pluginId: plugin.id, surfaceId: surface.id, before, after: await cells.allTextContents(), sandbox: await arcade.getAttribute("sandbox") },
          null,
          2,
        ),
        contentType: "application/json",
      });
      await checkpoint(flow, "arcade-guest-result", activeContext(flow), arcade);
      record(
        flow,
        "chat-arcade",
        "visited",
        "The real routed opaque guest loaded, New game and four native pad controls changed its rendered board; no host bridge or copied game algorithm",
      );
    });
  } finally {
    await publish(flow, "chat-arcade-coverage");
  }
}

async function runPlacedCommand(flow: Journey, command: PluginCommandView): Promise<void> {
  const placement = command.placements.find(({ target }) => target === "composer-action");
  if (placement === undefined) {
    throw new Error("The maintained command has no actual composer placement");
  }
  const shownName = pluginCommandShownName(command.pluginName, command.slug, sharedPluginNames(await flow.client.plugin.listCommands.query()));
  const trigger = flow.page.getByRole("button", { name: "Plugin actions", exact: true });
  await trigger.click();
  const menu = await controlledPanel(trigger);
  const item = menu.getByRole("menuitem", {
    name: new RegExp(`^${RegExp.escape(shownName)} · .+ · ${RegExp.escape(placement.label)}$`, "u"),
  });
  await expect(item).toHaveCount(1);
  await item.click();
}

/** Run maintained declared commands and verify the real guest's persisted publication and rendered dialog. */
export async function walkChatOracle(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-oracle", kind: "plugin-operation" }] };
  try {
    const plugin = (await flow.client.plugin.list.query()).find(({ slug, status }) => slug === "oracle-deck" && status === "enabled");
    if (plugin === undefined) {
      record(flow, "chat-oracle", "not-applicable", "This dataset has no enabled Oracle Deck install; no command invocation is claimed");
      return;
    }
    const commands = (await flow.client.plugin.listCommands.query()).filter(({ pluginId }) => pluginId === plugin.id);
    const draw = commands.find(({ name }) => name === "draw");
    const reveal = commands.find(({ name }) => name === "reveal");
    const surfaces = (await flow.client.plugin.listSurfaces.query()).filter(({ pluginId }) => pluginId === plugin.id);
    const deck = surfaces.find(({ anchor }) => anchor === "page");
    const revealSurface = surfaces.find(({ anchor }) => anchor === "dialog");
    if (draw === undefined || reveal === undefined || deck === undefined || revealSurface === undefined) {
      throw new Error("The enabled maintained deck is missing its real Draw/Reveal registrations");
    }
    await disposableRoom(flow, { name: "oracle", content: "A disposable room for maintained local plugin commands.", attachments: [] }, async (room) => {
      await openRoom(flow, room);
      await closeContextOverlay(flow, "oracle-content");
      const dialog = flow.page.getByRole("dialog", { name: "Plugin", exact: true });
      await runPlacedCommand(flow, reveal);
      await expect(dialog.getByRole("button", { name: "Retire this deck", exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Retire this deck", exact: true }).click();
      const confirmation = flow.page.getByRole("alertdialog", { name: "Retire the deck?", exact: true });
      await confirmation.getByRole("button", { name: "Retire this deck", exact: true }).click();
      await expect(confirmation).toBeHidden();
      await expect.poll(async () => (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: deck.id }))?.["dealt"]).toBe(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toBeHidden();
      await runPlacedCommand(flow, draw);
      const args = flow.page.getByRole("dialog", { name: "Run command", exact: true });
      await args.getByRole("textbox", { name: "Count", exact: true }).fill("1");
      await flow.action("oracle/draw-command", {
        action: async () => {
          await args.getByRole("button", { name: "Run draw", exact: true }).click();
        },
        ready: async () => {
          await expect(args).toBeHidden();
          await expect.poll(async () => (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: deck.id }))?.["dealt"]).toBe(1);
        },
      });
      await flow.action("oracle/reveal-command", {
        action: async () => {
          await runPlacedCommand(flow, reveal);
        },
        ready: async () => {
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("group", { name: `${plugin.name} — ${revealSurface.title}`, exact: true })).toBeVisible();
          await expect
            .poll(async () => (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: revealSurface.id }))?.["seed"])
            .toEqual(expect.any(String));
          await expect
            .poll(async () => (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: revealSurface.id }))?.["seed"])
            .not.toBe("—");
        },
      });
      const seed = (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: revealSurface.id }))?.["seed"];
      if (typeof seed !== "string" || seed === "—") {
        throw new Error("The native Reveal command has no published session seed");
      }
      await expect(dialog).toContainText(seed);
      await checkpoint(flow, "oracle-command-result", dialog, dialog.getByRole("button", { name: "Retire this deck", exact: true }));
      await attachNativeFile(flow.info, flow.info, "oracle-command-publication", {
        body: JSON.stringify(
          {
            pluginId: plugin.id,
            deck: await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: deck.id }),
            reveal: await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: revealSurface.id }),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toBeHidden();
      record(
        flow,
        "chat-oracle",
        "visited",
        "Native placed Draw with typed Count and Reveal executed the actual maintained guest, changed copied plugin state and rendered its seed/commitment dialog; no provider execution",
      );
    });
  } finally {
    await publish(flow, "chat-oracle-coverage");
  }
}

/** Execute a maintained composer replacement and its native Undo without sending or rewriting canon. */
export async function walkChatPolish(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-polish", kind: "plugin-operation" }] };
  try {
    const plugin = (await flow.client.plugin.list.query()).find(({ slug, status }) => slug === "draft-polish" && status === "enabled");
    if (plugin === undefined) {
      record(flow, "chat-polish", "not-applicable", "This dataset has no enabled Draft Polish install; no draft replacement is claimed");
      return;
    }
    const command = (await flow.client.plugin.listCommands.query()).find(({ pluginId, composerDraft }) => pluginId === plugin.id && composerDraft === true);
    if (command === undefined) {
      throw new Error("The enabled maintained polish plugin has no declared composer replacement command");
    }
    await disposableRoom(flow, { name: "polish", content: "A disposable unsent draft replacement witness.", attachments: [] }, async (room) => {
      await openRoom(flow, room);
      await closeContextOverlay(flow, "polish-content");
      const before = await readCanon(flow, room.id);
      const textbox = flow.page.getByRole("textbox", { name: "Message", exact: true });
      const draft = "A  draft ... with `code  ...` kept intact.";
      await textbox.fill(draft);
      await flow.action("polish/replace-visible-draft", {
        action: async () => {
          await runPlacedCommand(flow, command);
        },
        ready: async () => {
          await expect(textbox).toHaveValue("A draft … with `code  ...` kept intact.");
        },
      });
      await checkpoint(flow, "polish-visible-replacement", flow.page.getByRole("group", { name: "Message composer", exact: true }), textbox);
      const trigger = flow.page.getByRole("button", { name: "Plugin actions", exact: true });
      await trigger.click();
      const menu = await controlledPanel(trigger);
      await flow.action("polish/undo", {
        action: async () => {
          await menu.getByRole("menuitem", { name: /^Undo /u }).click();
        },
        ready: async () => {
          await expect(textbox).toHaveValue(draft);
        },
      });
      expect(await readCanon(flow, room.id), "Polish and Undo must not send or rewrite committed history").toEqual(before);
      await textbox.fill("");
      record(
        flow,
        "chat-polish",
        "visited",
        "Actual maintained composer command replaced only the visible draft, preserved inline code and restored the exact original via native Undo; canon unchanged",
      );
    });
  } finally {
    await publish(flow, "chat-polish-coverage");
  }
}

async function selectHeldRoom(flow: Journey, room: ChatSummary, beforeSelect?: () => void): Promise<void> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const show = flow.page.getByRole("button", { name: "Show list panel", exact: true });
  if (await show.isVisible()) {
    await show.click();
  }
  const root = await roomRow(flow, room);
  beforeSelect?.();
  await root.getByRole("button", { name: displayTitle(room), exact: true }).click();
  await expect(flow.page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  await flow.requestPanes();
}

/** Hold the actual first message transport read while typing into the production composer's stable slot. */
export async function walkChatArrival(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-arrival", kind: "external-edge" }] };
  try {
    await disposableRoom(
      flow,
      { name: "arrival", content: "The first committed line in this explicitly disposable reading control.", attachments: [] },
      async (room, messages) => {
        const first = messages.at(0);
        if (first === undefined) {
          throw new Error("The disposable first-read control has no committed message");
        }
        const held = await holdTrpcProcedure(flow.page, "chat.listMessages", {
          schema: listMessagesInputSchema,
          matches: (request) => request.chatId === room.id,
        });
        try {
          await Promise.all([
            flow.page.waitForResponse(
              (response) =>
                response.ok() &&
                matchesTrpcRequestInput(response.request(), "stream.attach", {
                  schema: streamAttachInputSchema,
                  matches: (request) => request.ref.channel === "chat" && request.ref.chatId === room.id,
                }),
            ),
            selectHeldRoom(flow, room),
          ]);
          await held.requested;
          const inputBox = flow.page.getByRole("textbox", { name: "Message", exact: true });
          await expect(flow.page.locator('[data-slot="message-row"]')).toHaveCount(0);
          await inputBox.pressSequentially(DRAFT);
          await inputBox.press("ControlOrMeta+Home");
          for (let index = 0; index < 12; index += 1) {
            await inputBox.press("ArrowRight");
          }
          const original = await inputBox.elementHandle();
          const caret = await inputBox.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection]);
          try {
            await flow.action("chat-arrival-release-first-read", {
              action: async () => {
                await held.release();
              },
              ready: async () => {
                await expect(messageRow(flow.page, first.id)).toBeVisible();
                await expect(inputBox).toHaveValue(DRAFT);
                await expect(inputBox).toBeFocused();
                expect(await inputBox.evaluate((node, previous) => node === previous, original)).toBe(true);
                expect(await inputBox.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual(
                  caret,
                );
              },
            });
            await checkpoint(flow, "chat-arrival-first-read", flow.page.locator("body"), messageRow(flow.page, first.id));
            const arrival = `A second durable, generation-free arrival ${crypto.randomUUID()}`;
            await flow.action("chat-arrival-committed-bus-event", {
              action: async () => {
                await flow.client.chat.commitMessage.mutate({ chatId: room.id, content: arrival, timeZone: UTC_TIME_ZONE });
              },
              ready: async () => {
                await expect(flow.page.getByText(arrival, { exact: true })).toBeVisible();
                await expect(inputBox).toHaveValue(DRAFT);
                await expect(inputBox).toBeFocused();
                expect(await inputBox.evaluate((node, previous) => node === previous, original)).toBe(true);
                expect(await inputBox.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual(
                  caret,
                );
              },
            });
            record(
              flow,
              "chat-arrival",
              "visited",
              "Actual held first read and subsequent generation-free commit preserved typed text, caret, focus and exact composer node in an explicitly disposable room",
            );
          } finally {
            await original.dispose();
          }
        } finally {
          await held.release();
        }
      },
    );
  } finally {
    await publish(flow, "chat-arrival-coverage");
  }
}

interface MediaNativeFacts {
  readonly images: readonly {
    readonly src: string | null;
    readonly currentSrc: string;
    readonly complete: boolean;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    readonly loading: string;
    readonly connected: boolean;
  }[];
  readonly imageBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  readonly anchorBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  readonly portBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  readonly scroll: readonly { readonly position: number; readonly extent: number; readonly total: number }[];
}

async function mediaNativeFacts(subject: { readonly image: Locator; readonly anchor: Locator; readonly port: Locator }): Promise<MediaNativeFacts> {
  return {
    images: await subject.image.evaluateAll((nodes) =>
      nodes.map((node) => {
        if (!(node instanceof HTMLImageElement)) {
          throw new Error("The native media subject is not an image");
        }
        return {
          src: node.getAttribute("src"),
          currentSrc: node.currentSrc,
          complete: node.complete,
          naturalWidth: node.naturalWidth,
          naturalHeight: node.naturalHeight,
          loading: node.loading,
          connected: node.isConnected,
        };
      }),
    ),
    imageBox: await subject.image.boundingBox(),
    anchorBox: await subject.anchor.boundingBox(),
    portBox: await subject.port.boundingBox(),
    scroll: await subject.port.evaluateAll((nodes) => nodes.map((node) => ({ position: node.scrollTop, extent: node.clientHeight, total: node.scrollHeight }))),
  };
}

/** Reuse immutable original image bytes in an explicitly disposable room and hold their real HTTP delivery. */
export async function walkChatMedia(input: SurfaceFlow): Promise<void> {
  const flow: Journey = { ...input, coverage: [], expected: [{ id: "chat-delayed-media", kind: "external-edge" }] };
  try {
    await enterChatsList(flow);
    const ambientPaths = new Set(
      await flow.page.evaluate(() => [
        ...performance.getEntriesByType("resource").map((entry) => new URL(entry.name, document.baseURI).pathname),
        ...[...document.querySelectorAll("img")].map((image) => new URL(image.currentSrc || image.src, document.baseURI).pathname),
      ]),
    );
    const ids = flow.run.subjects.assets.map(({ id }) => id);
    let selected: Awaited<ReturnType<typeof flow.client.assets.resolveBlobRefs.query>>[number] | undefined;
    let dimensionalImages = 0;
    for (let offset = 0; offset < ids.length && selected === undefined; offset += ASSET_LIST_LIMIT_MAX) {
      const refs = await flow.client.assets.resolveBlobRefs.query({ assetIds: ids.slice(offset, offset + ASSET_LIST_LIMIT_MAX) });
      const dimensional = refs.filter((ref) => ref.mime.startsWith("image/") && ref.width !== null && ref.height !== null && ref.width > 0 && ref.height > 0);
      dimensionalImages += dimensional.length;
      selected = dimensional.find((ref) => !ambientPaths.has(blobUrl(ref.hash)));
    }
    if (selected === undefined) {
      record(
        flow,
        "chat-delayed-media",
        dimensionalImages === 0 ? "not-applicable" : "unvisited",
        `${String(ids.length)} original owned asset IDs examined; ${String(dimensionalImages)} dimensional images, none absent from the actual ambient resource scene. No replacement bytes were fabricated`,
      );
      return;
    }
    const asset = selected;
    const anchorText = "The native reading anchor immediately after the delayed original image.";
    const content = `![Original snapshot image](asset:${asset.assetId})\n\n${anchorText}\n\n${Array.from({ length: 32 }, (_, index) => `Reading continuation ${String(index + 1)}. This explicitly disposable prose keeps a real non-tail reading window open.`).join("\n\n")}`;
    await disposableRoom(flow, { name: "media", content, attachments: [] }, async (room, messages) => {
      const message = messages.at(0);
      if (message === undefined) {
        throw new Error("The disposable media control has no committed message");
      }
      const release = Promise.withResolvers<void>();
      let requested = false;
      let armed = false;
      const requests: { readonly subject: boolean; readonly resourceType: string; readonly method: string; readonly path: string }[] = [];
      const responses: { readonly status: number; readonly path: string }[] = [];
      const joined: Promise<void>[] = [];
      const path = blobUrl(asset.hash);
      const match = (url: URL): boolean => url.pathname === path;
      const onResponse = (response: Response): void => {
        if (new URL(response.url()).pathname === path) {
          responses.push({ status: response.status(), path });
        }
      };
      const row = messageRow(flow.page, message.id);
      const image = row.getByRole("img", { name: "Original snapshot image", exact: true });
      const anchor = row.getByText(anchorText, { exact: true });
      const port = flow.page.locator('[data-slot="message-list-scroll"]');
      let pending: Awaited<ReturnType<typeof mediaNativeFacts>> | undefined;
      let decoded: Awaited<ReturnType<typeof mediaNativeFacts>> | undefined;
      const handler = async (route: Route): Promise<void> => {
        requests.push({ subject: armed, resourceType: route.request().resourceType(), method: route.request().method(), path });
        if (!armed) {
          await route.continue();
          return;
        }
        const completed = Promise.withResolvers<void>();
        joined.push(completed.promise);
        requested = true;
        try {
          await release.promise;
          await route.continue();
        } finally {
          completed.resolve();
        }
      };
      flow.page.on("response", onResponse);
      await flow.page.route(match, handler);
      try {
        await selectHeldRoom(flow, room, () => {
          armed = true;
        });
        await expect(row).toBeVisible();
        await expect(row.locator(`img[src=${JSON.stringify(path)}]`)).toHaveCount(1);
        await expect(flow.page.locator(`img[src=${JSON.stringify(path)}]`), "Only the declared inline subject may consume this held URL").toHaveCount(1);
        await scrollViewport(flow, port, -(await port.evaluate((node) => node.clientHeight)) - 2 * SCROLL_EPSILON);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeInViewport();
        await anchor.scrollIntoViewIfNeeded();
        await expect(anchor).toBeInViewport();
        await expect(image).toBeInViewport();
        await expect.poll(() => requested).toBe(true);
        expect(
          requests.filter((request) => !request.subject),
          "Ambient reuse cannot establish a subject image hold",
        ).toEqual([]);
        await expect(image).toHaveAttribute("width", String(asset.width));
        await expect(image).toHaveAttribute("height", String(asset.height));
        expect(await image.evaluate((node: HTMLImageElement) => node.complete)).toBe(false);
        const before = await settledBox(image);
        const reading = await settledBox(anchor);
        pending = await mediaNativeFacts({ image, anchor, port });
        expect(before.width).toBeGreaterThan(0);
        expect(before.height).toBeGreaterThan(0);
        await flow.action("chat-delayed-media-release", {
          action: () => {
            release.resolve();
            return Promise.resolve();
          },
          ready: async () => {
            await expect.poll(async () => await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
            await image.evaluate(async (node: HTMLImageElement) => await node.decode());
            decoded = await mediaNativeFacts({ image, anchor, port });
            const after = await image.boundingBox();
            const current = await anchor.boundingBox();
            if (after === null || current === null) {
              throw new Error("The media reading anchor unmounted during image delivery");
            }
            expect(Math.max(Math.abs(after.width - before.width), Math.abs(after.height - before.height), Math.abs(current.y - reading.y))).toBeLessThanOrEqual(
              1,
            );
          },
        });
        expect(await port.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeGreaterThan(
          await port.evaluate((node) => node.clientHeight),
        );
        await checkpoint(flow, "chat-delayed-media-reserved-frame", port, anchor);
        record(
          flow,
          "chat-delayed-media",
          "visited",
          `Real delayed HTTP delivery of original asset ${asset.assetId} preserved reserved frame and non-tail reading anchor within1px; room/prose are explicitly disposable, original asset bytes unchanged`,
        );
      } finally {
        try {
          await attachNativeFile(flow.info, flow.info, "chat-delayed-media-native-facts", {
            body: JSON.stringify({
              originalAssetId: asset.assetId,
              originalHash: asset.hash,
              disposableChatId: room.id,
              admittedAmbientPaths: ambientPaths.size,
              requested,
              armed,
              requests,
              responses,
              pending,
              decoded,
              final: await mediaNativeFacts({ image, anchor, port }),
            }),
            contentType: "application/json",
          });
        } catch (error) {
          flow.info.annotations.push({ type: "media-evidence-unavailable", description: String(error) });
        }
        release.resolve();
        await flow.page.unroute(match, handler);
        await Promise.all(joined);
        flow.page.off("response", onResponse);
      }
    });
  } finally {
    await publish(flow, "chat-delayed-media-coverage");
  }
}
