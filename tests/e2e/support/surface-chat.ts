import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { ASSET_LIST_LIMIT_MAX, blobUrl } from "@orb/contracts/assets";
import { characterHandleSchema } from "@orb/contracts/character";
import type { ChatSummary, MessageView } from "@orb/contracts/chat";
import { CHAT_LIST_MAX_LIMIT, CHAT_MESSAGE_LIST_MAX_LIMIT, forkResultSchema, listMessagesInputSchema, REACTION_EMOJIS } from "@orb/contracts/chat";
import type { PluginCommandView, PluginConfirmButtonNode, PluginSurfaceNode, PluginView } from "@orb/contracts/plugin";
import { pluginChildNodes } from "@orb/contracts/plugin";
import { streamAttachInputSchema } from "@orb/contracts/stream";
import type { AssetId, CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { controlledPanel, settledBox, usesProgrammaticScroll } from "@orb/testkit/browser/spec";
import type { SurfaceWitnessDisposition } from "@orb/testkit/iso";
import { nonEmpty, parseSurfaceProviderEvidence, present } from "@orb/testkit/iso";
import { attachNativeFile, isTrpcRequestFor, matchesTrpcRequestInput, readTrpcOutput, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Response, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHAT_CONTEXT_TABLIST_NAME } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import { CHAT_DELETE_NAME, CHAT_SELECT_MESSAGES_NAME } from "#client/features/chat/lib/chat-options-names.ts";
import { chatTitleQualifiers } from "#client/features/chat/lib/chat-summary-row.ts";
import {
  CHAT_ARCHIVE_NAME,
  CHAT_CANCEL_EDIT_NAME,
  CHAT_CLEAR_SEARCH_NAME,
  CHAT_COMPOSER_NAME,
  CHAT_CONTINUE_REPLY_NAME,
  CHAT_CORRECTION_INSTRUCTION_NAME,
  CHAT_DELETE_MESSAGE_TITLE,
  CHAT_EARLIER_MESSAGES_NAME,
  CHAT_EXPORT_TRANSCRIPT_NAME,
  CHAT_LIST_EMPTY_TITLE,
  CHAT_LIST_NAME,
  CHAT_MESSAGE_INPUT_NAME,
  CHAT_NEXT_GREETING_NAME,
  CHAT_REATTRIBUTE_CONFIRM_NAME,
  CHAT_REATTRIBUTE_CONFIRM_TITLE,
  CHAT_SAVE_EDIT_NAME,
  CHAT_SAVED_REPLIES_DOOR_NAME,
  CHAT_SAVED_REPLIES_NAME,
  CHAT_SAVED_REPLY_NAME,
  CHAT_SEARCH_NAME,
  CHAT_SEND_NAME,
  CHAT_STOP_NAME,
  CHAT_STOPPING_NAME,
  chatRowActionsName,
  reactionChoiceName,
  reactionPillName,
  savedReplyOptionName,
  WIRE_AUTHORED_TEXT_HEADING,
  WIRE_NO_PROMPT_TITLE,
  WIRE_STATIC_PREFIX_HEADING,
} from "#client/features/chat/lib/chat-surface-names.ts";
import { COMPOSER_CLEAR_INPUT_NAME, COMPOSER_CORRECTIONS_NAME, COMPOSER_IMAGINE_NAME } from "#client/features/chat/lib/composer-menu-names.ts";
import {
  MESSAGE_ACTIONS_MENU_NAME,
  MESSAGE_COPY_NAME,
  MESSAGE_EDIT_NAME,
  MESSAGE_FORK_NAME,
  MESSAGE_HIDE_FROM_AI_NAME,
  MESSAGE_REACTION_ADD_NAME,
  MESSAGE_REAPPLY_CONTINUATION_NAME,
  MESSAGE_REATTRIBUTE_NAME,
  MESSAGE_UNDO_CONTINUATION_NAME,
  MESSAGE_UNHIDE_FROM_AI_NAME,
  MESSAGE_VIEW_WIRE_TRACE_NAME,
} from "#client/features/chat/lib/message-action-names.ts";
import { resolveIsGroupChat } from "#client/features/chat/lib/roster.ts";
import { IMAGINE_MODE_NAME, IMAGINE_PROMPT_NAME } from "#client/features/imagery/lib/imagine-names.ts";
import {
  humanizeId,
  PLUGIN_ACTIONS_NAME,
  PLUGIN_COMMAND_ARGS_TITLE,
  placedItemLabel,
  pluginCommandActionLabel,
  pluginCommandShownName,
  pluginUndoName,
  sharedPluginNames,
} from "#client/features/plugin/lib/plugin-command-copy.ts";
import { CHAT_PLUGINS_OPEN_LABEL, movePluginPanelLabel, PLUGIN_DIALOG_TITLE, pluginSurfaceName } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import { CHAT_TITLE_FIELD_NAME, RENAME_CHAT_NAME } from "#client/lib/chat-rename-names.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";
import { COPIED_TO_CLIPBOARD_NOTICE } from "#client/lib/clipboard-names.ts";
import { LIST_PANEL_NOUN, panelEdgeName } from "#client/lib/context-pane-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { MESSAGE_TOOLS_LABEL, SIDECAR_PANELS_LABEL, SIDECAR_PANELS_NOUN } from "#client/lib/flank-names.ts";
import { renderMessageForDisplay } from "#client/lib/message-render.ts";
import { CHAT_PLUGINS_TAB_LABEL } from "#client/lib/registry-contracts.ts";
import { deleteConfirmTitle, ROW_DELETE_NAME, ROW_RENAME_NAME, ROW_STAR_NAME, ROW_UNSTAR_NAME } from "#client/lib/row-menu-names.ts";
import { NO_MATCHES_TITLE } from "#client/lib/search-empty-names.ts";
import { SELECTION_CLEAR_NAME, selectionCountLabel } from "../../../packages/ui/src/primitives/selection-bar/selection-bar-names.ts";
import { TOAST_CLOSE_NAME } from "../../../packages/ui/src/primitives/toast/toast-names.ts";
import { gotoChatsList, messageRow, openChatsList, waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import type { SurfaceWalk } from "./surface-walker.ts";
import {
  checkpoint,
  createSurfaceWalk,
  dismissContext,
  expectSubject,
  isInert,
  menuLeafItems,
  NAME_HOLE,
  namePattern,
  observe,
  openContext,
  pane,
  pressOverflowed,
  publishWalk,
  skip,
  walkMenuTrigger,
  walkScope,
} from "./surface-walker.ts";
import { holdTrpcProcedure } from "./trpc.ts";

// The showcase plugins the walks drive; `satisfies` makes a renamed or retired slug a `tsc` error here.
const ARCADE_SLUG = "pocket-arcade" satisfies ShowcaseSlug;
const ORACLE_SLUG = "oracle-deck" satisfies ShowcaseSlug;
const POLISH_SLUG = "draft-polish" satisfies ShowcaseSlug;
const DRAFT = "A direction retained while inspecting the room controls.";
const EMPTY_SEARCH = "surface-walk-no-chat-with-this-name-7f4a6d";
const WHEEL_STEP_RATIO = 0.65;
const SCROLL_EPSILON = 2;
const MAX_READING_POSITION_STEPS = 10_000;

type ShowcaseSlug = (typeof SHOWCASE_PLUGIN_SLUGS)[number];

interface MessageOperationProof {
  readonly label: string;
  readonly message: MessageView;
  readonly viewerIsHost: boolean;
  readonly viewerOwnsMessage: boolean;
  readonly detail: string;
}

type Journey = SurfaceWalk & {
  readonly messageOperations?: MessageOperationProof[];
};

async function publish(flow: Journey, name: string): Promise<void> {
  await attachNativeFile(flow.info, flow.info, name, {
    body: JSON.stringify(
      {
        dataMode: flow.run.dataMode,
        chatStyle: flow.chatStyle,
        fontScale: flow.fontScale,
        coverage: flow.observations,
        messageOperations: flow.messageOperations,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await publishWalk(flow, name);
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
  observe(
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
    expectSubject(flow, `original-room/${room.id}`, "chat-library-subject");
    observe(
      flow,
      `original-room/${room.id}`,
      "observed",
      "Original snapshot ID present in the actual production keyset; eligible for native selection, not a claim that this room's controls were traversed",
    );
  }
  observe(
    flow,
    "chat-subject-selection",
    "observed",
    `${String(rooms.length)} original readable subjects admitted, including duplicate display titles; native row qualifiers and committed message identities establish each selected room`,
  );
}

async function roomRow(flow: Journey, room: ChatSummary): Promise<{ readonly row: Locator; readonly title: Locator }> {
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
  const list = flow.page.getByRole("list", { name: CHAT_LIST_NAME, exact: true });
  const virtualRow = list.locator(`[data-slot="virtual-list-row"][aria-posinset="${String(index + 1)}"]`);
  await flow.action(`chat-search-${room.id}`, {
    action: async () => {
      await flow.page.getByRole("textbox", { name: CHAT_SEARCH_NAME, exact: true }).fill(EMPTY_SEARCH);
      await expect(flow.page.getByText(NO_MATCHES_TITLE, { exact: true })).toBeVisible();
      await flow.page.getByRole("textbox", { name: CHAT_SEARCH_NAME, exact: true }).fill(search);
    },
    ready: async () => {
      await expect(flow.page.getByRole("textbox", { name: CHAT_SEARCH_NAME, exact: true })).toHaveValue(search);
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
  await expect(virtualRow.getByRole("button", { name: namePattern(chatRowActionsName(NAME_HOLE)) })).toHaveCount(room.viewerRole === "host" ? 1 : 0);
  // A title another row on the list shares carries the list's own qualifier in the row's name; the qualifier is a stamp the browser formats.
  const titleQualified = chatTitleQualifiers(matches)[index] !== undefined;
  const title = virtualRow.getByRole("button", { name: titleQualified ? namePattern(`${label}${NAME_HOLE}`) : label, exact: true });
  await expect(title).toHaveCount(1);
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
  return { row: virtualRow, title };
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
  const showList = flow.page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  if (await showList.isVisible()) {
    await showList.click();
    observe(
      flow,
      "extra-list-navigation",
      "visited",
      "Explicit LIST navigation state follows the requested pane intent; room capture restores requested composition",
    );
  }
  const { row: root, title: row } = await roomRow(flow, room);
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
      await expect(flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true })).toBeVisible();
      await expect(flow.page.locator('[data-slot="chat-header-pending"]')).toHaveCount(0);
      await expect
        .poll(async () =>
          tail === undefined ? (await flow.page.locator('[data-slot="message-row"]').count()) === 0 : await messageRow(flow.page, tail.id).isVisible(),
        )
        .toBe(true);
    },
  });
  await flow.requestPanes();
  if (flow.requestedPanes.kind === "desktop" && flow.requestedPanes.panes.context && (await flow.desktopShell())) {
    await contextReady(flow);
  }
  await checkpoint(flow, `chat-room-${room.id}`, flow.page.locator("body"), flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true }));
}

async function listMenu(flow: Journey, room: ChatSummary, root: Locator): Promise<void> {
  await root.hover();
  const menu = root.getByRole("button", { name: namePattern(chatRowActionsName(NAME_HOLE)) });
  if ((await menu.count()) === 0) {
    observe(flow, `chat-list-${room.id}-menu`, "not-applicable", "This actual library subject has no host lifecycle menu");
    return;
  }
  if (await walkMenuTrigger(flow, menu, `chat-list-${room.id}-menu`)) {
    await safeMenuDrills(flow, menu, `chat-list-${room.id}-menu`);
  }
}

async function emptySearch(flow: Journey): Promise<void> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const showList = flow.page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  if (await showList.isVisible()) {
    await showList.click();
  }
  const search = flow.page.getByRole("textbox", { name: CHAT_SEARCH_NAME, exact: true });
  const empty = flow.page.locator('[data-slot="empty-state-root"]').filter({ has: flow.page.getByText(NO_MATCHES_TITLE, { exact: true }) });
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
      await flow.page.getByRole("button", { name: CHAT_CLEAR_SEARCH_NAME, exact: true }).click();
    },
    ready: async () => {
      await expect(search).toHaveValue("");
      await expect(flow.page.getByRole("list", { name: CHAT_LIST_NAME, exact: true })).toBeVisible();
    },
  });
  observe(flow, "chat-search-empty-recovery", "observed", "Server-filtered empty result followed by actual clear-search recovery");
}

async function messageLeafName(item: Locator): Promise<string> {
  const snapshot = await item.ariaSnapshot();
  // A name holding ": " makes the YAML quote the whole node, `- 'menuitem "Imagine: modes"'`, with `'` doubled inside.
  const match = /^- (?<quote>'?)menuitem(?:checkbox|radio)? "(?<name>[^"]+)"\k<quote>/u.exec(snapshot);
  const name = match?.groups?.["name"];
  if (name === undefined) {
    throw new Error(`The actual message leaf has no identifiable accessible name: ${snapshot}`);
  }
  return match?.groups?.["quote"] === "'" ? name.replaceAll("''", "'") : name;
}

function disabledLeafItems(menu: Locator): Locator {
  return menu.locator('[role^="menuitem"]:not([aria-haspopup])[aria-disabled="true"], [role^="menuitem"]:not([aria-haspopup])[disabled]');
}

// Settles the walker's leaf rows of a message menu against this case's operation proofs; a leaf without one stays skipped.
async function accountMessageLeaves(flow: Journey, menu: Locator, prefix: string, message: MessageView): Promise<void> {
  const chat = await flow.client.chat.getChat.query({ chatId: message.chatId });
  for (const [index, item] of (await menuLeafItems(menu).all()).entries()) {
    const label = await messageLeafName(item);
    const id = `${prefix}/leaf-${String(index)}`;
    const proof = flow.messageOperations?.find(
      (candidate) =>
        candidate.label === label &&
        candidate.message.role === message.role &&
        candidate.viewerIsHost === chat.viewerIsHost &&
        (label !== MESSAGE_REATTRIBUTE_NAME || (candidate.viewerOwnsMessage && message.authorUserId === chat.viewerUserId)),
    );
    if (proof === undefined) {
      skip(
        flow,
        id,
        "not-activated",
        `Enabled ${message.role} leaf ${label} has no same-case operation proof for this role and authority; original ${message.id} remains untouched`,
      );
    } else {
      observe(
        flow,
        id,
        "observed",
        `${label}: original ${message.id} observed only; same-case ${proof.message.role} operation on disposable ${proof.message.chatId}/${proof.message.id}: ${proof.detail}`,
      );
    }
  }
  for (const item of await disabledLeafItems(menu).all()) {
    const id = `${prefix}/disabled/${await messageLeafName(item)}`;
    expectSubject(flow, id, "message-menu-leaf");
    await disabledControl(item);
    observe(flow, id, "not-applicable", `Actual ${message.role} leaf disabled; accessible name and visible reason retained in native menu snapshot`);
  }
}

/** The walk of one message's menu: the same inventory, with its leaves settled against the message operation proofs. */
function messageMenuWalk(flow: Journey, message: MessageView): Journey {
  return { ...flow, hooks: { menuLeaves: async (menu, prefix): Promise<void> => await accountMessageLeaves(flow, menu, prefix, message) } };
}

async function disabledControl(control: Locator): Promise<void> {
  await expect(control).toBeDisabled();
}

async function inspectImagineModes(flow: Journey, dialog: Locator, id: string): Promise<void> {
  const modes = dialog.getByRole("group", { name: IMAGINE_MODE_NAME, exact: true }).getByRole("button");
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
  observe(
    flow,
    `${id}-spend`,
    "excluded",
    "Read the chat first invokes priced extractPrompt; Generate invokes generateImage. Neither is submitted against original canon",
  );
}

// Every command whose existing dialog or mode the walk opens and dismisses, by the name production prints for it. The
// commands a menu really offers are enumerated from the page; a name in this set decides how its drill proves itself.
const SAFE_DRILL_NAMES: ReadonlySet<string> = new Set([
  ROW_RENAME_NAME,
  ROW_DELETE_NAME,
  CHAT_DELETE_NAME,
  COMPOSER_CORRECTIONS_NAME,
  COMPOSER_IMAGINE_NAME,
  MESSAGE_VIEW_WIRE_TRACE_NAME,
  CHAT_SELECT_MESSAGES_NAME,
  COMPOSER_CLEAR_INPUT_NAME,
  MESSAGE_EDIT_NAME,
  CHAT_PLUGINS_OPEN_LABEL,
]);
const DESTRUCTIVE_NAMES: ReadonlySet<string> = new Set([ROW_DELETE_NAME, CHAT_DELETE_NAME]);

function safeDialogWitness(dialog: Locator, label: string): Locator {
  switch (label) {
    case ROW_RENAME_NAME:
      return dialog.getByRole("textbox", { name: CHAT_TITLE_FIELD_NAME, exact: true });
    case COMPOSER_CORRECTIONS_NAME:
      return dialog.getByRole("textbox", { name: CHAT_CORRECTION_INSTRUCTION_NAME, exact: true });
    case COMPOSER_IMAGINE_NAME:
      return dialog.getByRole("textbox", { name: IMAGINE_PROMPT_NAME, exact: true });
    case MESSAGE_VIEW_WIRE_TRACE_NAME:
      return dialog
        .getByText(WIRE_NO_PROMPT_TITLE, { exact: true })
        .or(dialog.getByText(WIRE_STATIC_PREFIX_HEADING, { exact: true }))
        .or(dialog.getByText(WIRE_AUTHORED_TEXT_HEADING, { exact: true }))
        .first();
    default:
      return dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  }
}

async function safeDialogDrill(flow: Journey, command: Locator, request: { readonly label: string; readonly id: string }): Promise<void> {
  const { label, id } = request;
  const destructive = DESTRUCTIVE_NAMES.has(label);
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
  if (label === COMPOSER_IMAGINE_NAME) {
    await inspectImagineModes(flow, dialog, id);
  }
  const cancel = dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  const close = (await cancel.isVisible()) ? cancel : dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true });
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
      await expect(bar.getByText(selectionCountLabel(0), { exact: true })).toBeVisible();
    },
  });
  await checkpoint(flow, id, bar, bar);
  await bar.getByRole("button", { name: SELECTION_CLEAR_NAME, exact: true }).click();
  await expect(bar).toBeHidden();
}

async function safeDraftDrill(flow: Journey, command: Locator, id: string): Promise<void> {
  const input = flow.page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
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
    await checkpoint(flow, id, flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true }), input);
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
  await row.getByRole("button", { name: CHAT_CANCEL_EDIT_NAME, exact: true }).click();
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
  const opensContext = await flow.page.getByRole("menu", { name: PLUGIN_ACTIONS_NAME, exact: true }).isVisible();
  const sheet = flow.page.getByRole("dialog", { name: SIDECAR_PANELS_LABEL, exact: true });
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
    await sheet.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  }
  await expect(sheet).toBeHidden();
  await flow.requestPanes();
  await dismissContext(flow);
}

async function runSafeCommand(
  flow: Journey,
  command: Locator,
  request: { readonly label: string; readonly id: string; readonly trigger: Locator },
): Promise<void> {
  switch (request.label) {
    case CHAT_SELECT_MESSAGES_NAME:
      await safeSelectionDrill(flow, command, request.id);
      return;
    case COMPOSER_CLEAR_INPUT_NAME:
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
  await trigger.click();
  const menu = flow.page.getByRole("menu");
  await expect(menu).toBeVisible();
  const available: string[] = [];
  for (const item of await menu.locator('[role="menuitem"]:not([aria-disabled="true"]):not([disabled])').all()) {
    const label = await messageLeafName(item);
    if (SAFE_DRILL_NAMES.has(label)) {
      available.push(label);
    }
  }
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  for (const label of available) {
    await trigger.click();
    await expect(menu).toBeVisible();
    const command = menu.getByRole("menuitem", { name: label, exact: true });
    const id = `${name}-safe-drill-${label}`;
    expectSubject(flow, id, "menu-operation");
    await runSafeCommand(flow, command, { label, id, trigger });
    observe(
      flow,
      id,
      "visited",
      "Actual production command opened its existing dialog/mode and was dismissed without confirming a write, generation, export or plugin invocation",
    );
  }
}

async function composerMenus(flow: Journey, room: ChatSummary): Promise<void> {
  const composer = flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true });
  const input = composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
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
      const triggers = await composer.locator('button[aria-haspopup="menu"]').all();
      for (const index of triggers.keys()) {
        expectSubject(flow, `composer-${room.id}-${phase}-menu-${String(index)}`, "menu");
      }
      for (const [index, trigger] of triggers.entries()) {
        const id = `composer-${room.id}-${phase}-menu-${String(index)}`;
        // A narrow row moves Draft your line into Message tools and leaves its own door mounted but inert.
        if (await isInert(trigger)) {
          skip(flow, id, "hidden-here", "Inert in this layout; the Message tools menu holds this door's submenu in its place");
          continue;
        }
        // Impersonate and Response are disabled while the composer is busy; the walk already recorded that skip.
        if (await walkMenuTrigger(flow, trigger, id)) {
          await safeMenuDrills(flow, trigger, id);
        }
      }
      await expect(input).toHaveValue(value);
    }
  } finally {
    await input.fill(original);
    await expect(input).toHaveValue(original);
  }
  skip(
    flow,
    "generation-and-plugin-invocation",
    "another-case",
    "Generation, contributed commands and canon edits run in the disposable generation, oracle, arcade and message-operation cases, never on owner subjects",
  );
}

async function composerCheckpoint(flow: Journey, composer: Locator, input: Locator, name: string): Promise<void> {
  const groups = await composer.getByRole("group").all();
  const actions = await Promise.all(groups.map(async (region) => ({ region, actions: await region.getByRole("button").all() })));
  await flow.checkpoint({ name, scope: composer, state: "loaded", witnesses: [input], checks: SURFACE_CHECKS }, actions);
  observe(
    flow,
    `${name}-groups`,
    "observed",
    `${String(groups.length)} actual tool/generation/send groups with action-group geometry; no paid generation invoked`,
  );
}

// The Chat tablist is the bracket's one strip in a plain and a game room alike, so it means the pane is open.
async function openChatContext(flow: Journey): Promise<void> {
  await openContext(flow);
  await expect(flow.page.getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true }).first()).toBeVisible();
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

// The game rail is a toolbar of aria-current cells, which the generic walk does not step; each cell's body is walked.
async function walkRailCells(flow: Journey, prefix: string): Promise<void> {
  const cells = await pane(flow, "context").locator('[data-slot="context-rail"]').getByRole("button").all();
  for (const [index, cell] of cells.entries()) {
    const id = `${prefix}-${String(index)}`;
    if (await cell.isDisabled()) {
      skip(flow, id, "disabled", "Production rail cell is disabled; no body acceptance claimed");
      continue;
    }
    await flow.action(id, {
      action: async () => {
        await cell.click();
      },
      ready: async () => {
        await contextReady(flow);
        await expect(cell).toHaveAttribute("aria-current", "true");
      },
    });
    await walkScope(flow, activeContext(flow), id);
  }
}

// The placement action's words before the panel it names, for each destination.
function placementPrefix(toSidecar: boolean): string {
  return movePluginPanelLabel(NAME_HOLE, NAME_HOLE, toSidecar).split(NAME_HOLE).at(0) ?? "";
}

async function sidecar(flow: Journey, room: ChatSummary): Promise<void> {
  const move = activeContext(flow).getByRole("button", { name: namePattern(movePluginPanelLabel(NAME_HOLE, NAME_HOLE, true)) });
  if ((await move.count()) === 0) {
    observe(flow, `sidecar-${room.id}`, "not-applicable", "No rendered enabled plugin chat panel offers a sidecar placement");
    return;
  }
  const label = await move.first().getAttribute("aria-label");
  if (label === null) {
    throw new Error("The plugin placement control has no accessible label");
  }
  const restoreLabel = label.replace(placementPrefix(true), placementPrefix(false));
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
    const sheet = flow.page.getByRole("dialog", { name: SIDECAR_PANELS_LABEL, exact: true });
    if (await sheet.isVisible()) {
      await sheet.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
    }
    await openChatContext(flow);
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
  const edge = flow.page.getByRole("button", { name: namePattern(panelEdgeName(SIDECAR_PANELS_NOUN, false), panelEdgeName(SIDECAR_PANELS_NOUN, true)) });
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
  await dismissContext(flow);
  await flow.page.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }).click();
  const item = flow.page.getByRole("menuitem", { name: SIDECAR_PANELS_LABEL, exact: true });
  await expect(item).toBeVisible();
  const sheet = flow.page.getByRole("dialog", { name: SIDECAR_PANELS_LABEL, exact: true });
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
  await sheet.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  await expect(sheet).toBeHidden();
  await openChatContext(flow);
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
  observe(
    flow,
    `plugin-${room.id}-registrations`,
    "observed",
    `${String(surfaces.filter((surface) => surface.anchor === "chat-flank").length)} actual registered chat-flank surfaces; visibility/publication remains the product's decision`,
  );
  skip(
    flow,
    `plugin-${room.id}-guest-execution`,
    "another-case",
    "Host Context/sidecar chrome is traversed here; guest startup runs in the maintained arcade guest case",
  );
}

async function context(flow: Journey, room: ChatSummary): Promise<void> {
  await openChatContext(flow);
  await walkScope(flow, pane(flow, "context"), `context-${room.id}`);
  await walkRailCells(flow, `context-${room.id}-game`);
  const plugins = flow.page
    .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
    .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
  if (await plugins.isVisible()) {
    await inspectPlugins(flow, plugins, room);
  }
  skip(
    flow,
    `context-${room.id}-leaf-operations`,
    "not-activated",
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
  if (usesProgrammaticScroll(flow.page, flow.info)) {
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
  // The wheel resolves before its smooth scroll ends, and that animation overrides any position set meanwhile.
  let previous = Number.NaN;
  await expect
    .poll(async () => {
      const position = await viewport.evaluate((node) => node.scrollTop);
      const settled = position === previous;
      previous = position;
      return settled;
    })
    .toBe(true);
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
    const earlier = flow.page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
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
          // One read of the list: a locator on the anchor would wait forever once the virtualizer unmounts it.
          const progressed = await viewport.evaluate(
            (element, { position, anchor, delta, epsilon, mounted }) => {
              const rows = [...element.querySelectorAll<HTMLElement>("[data-message-id]")];
              if ((element.scrollTop - position) * delta > 0 || rows.map((node) => node.getAttribute("data-message-id")).join("|") !== mounted) {
                return true;
              }
              // Row measurements can compensate scrollTop without reversing the reader's visible movement.
              const after = rows.find((node) => node.getAttribute("data-message-id") === anchor?.id);
              return after !== undefined && anchor !== null && (anchor.top - after.getBoundingClientRect().top) * delta > epsilon;
            },
            { position: before.position, anchor: before.anchor, delta: direction, epsilon: SCROLL_EPSILON, mounted: signature },
          );
          return progressed || (await row.isVisible());
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
                rect: ((bounds) => ({
                  x: bounds.x,
                  y: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  top: bounds.top,
                  right: bounds.right,
                  bottom: bounds.bottom,
                  left: bounds.left,
                }))(node.getBoundingClientRect()),
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
    observe(
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
      rect: ((frame) => ({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        top: frame.top,
        right: frame.right,
        bottom: frame.bottom,
        left: frame.left,
      }))(element.getBoundingClientRect()),
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
    observe(flow, `reading-${name}-actions`, "not-applicable", "This actual row exposes no message action menu in the current style/role/position");
    return;
  }
  const box = await menu.boundingBox();
  if (bounds === null || box === null || box.y < bounds.y || box.y + box.height > bounds.y + bounds.height) {
    observe(
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
    await walkMenuTrigger(messageMenuWalk(flow, message), menu, `reading-${name}-actions`);
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
    observe(flow, `message-${message.id}-independent-menu`, "not-applicable", "This actual committed tail has no message menu");
    return;
  }
  if (await walkMenuTrigger(messageMenuWalk(flow, message), trigger, `message-${message.id}-independent-menu`)) {
    await safeMenuDrills(flow, trigger, `message-${message.id}-independent-menu`);
  }
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
      observe(flow, `reading-${role}`, "not-applicable", "No original message with this role in the selected readable transcript");
      continue;
    }
    for (const message of [roleMessages.at(0), longest, roleMessages.at(-1)]) {
      if (message !== undefined) {
        witnesses.set(message.id, message);
      }
    }
  }
}

function capabilityStatus(visited: boolean, available: boolean): SurfaceWitnessDisposition {
  if (visited) {
    return "observed";
  }
  return available ? "unvisited" : "not-applicable";
}

async function groupSubject(flow: Journey, candidates: readonly ChatSummary[]): Promise<ChatSummary | undefined> {
  for (const candidate of candidates.filter((room) => room.participantNames.length > 1)) {
    const detail = await flow.client.chat.getChat.query({ chatId: candidate.id });
    if (resolveIsGroupChat(detail.participants)) {
      observe(
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
    observe(flow, "chat-common", "unvisited", "No readable original library subject; no synthetic owner room was created");
    return;
  }
  await enterChatsList(flow);
  const empty = flow.page.locator('[data-slot="empty-state-root"]').filter({ has: flow.page.getByText(CHAT_LIST_EMPTY_TITLE, { exact: true }) });
  await expect(empty).toBeVisible();
  await flow.checkpoint({ name: "chat-empty-library", scope: empty, state: "empty", witnesses: [empty], checks: SURFACE_CHECKS });
  observe(flow, "chat-room-controls", "not-applicable", "The original account has no readable library room; no synthetic owner data was added");
}

async function chatCase(
  input: SurfaceFlow,
  name: string,
  run: (flow: Journey, rooms: readonly ChatSummary[], candidates: readonly ChatSummary[]) => Promise<SurfaceWitnessDisposition>,
): Promise<void> {
  const id = `chat/${name}`;
  const flow: Journey = createSurfaceWalk(input, [{ id, kind: "chat-journey" }]);
  try {
    await flow.page.goto("/");
    await waitForAppReady(flow.page);
    await flow.requestPanes();
    const rooms = await readChats(flow);
    const candidates = rooms.toSorted((a, b) => b.messageCount - a.messageCount);
    subjectCoverage(flow, rooms);
    const disposition = await run(flow, rooms, candidates);
    observe(flow, id, disposition, "Independent native Chat case; every nested omission retains its own disposition");
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
    expectSubject(flow, `chat-room-${primary.id}`, "chat-subject");
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
    expectSubject(flow, `chat-room-${primary.id}`, "chat-subject");
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
    expectSubject(flow, `chat-room-${group.id}`, "chat-subject");
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
    expectSubject(flow, `chat-room-${game.id}`, "chat-subject");
    await openRoom(flow, game, true);
    await composerMenus(flow, game);
    await context(flow, game);
    return "visited";
  });
}

/** Read original transcript boundaries and long role interiors under the coordinator's actual style. */
export async function walkChatReading(input: SurfaceFlow): Promise<void> {
  const messageOperations: MessageOperationProof[] = [];
  const flow: Journey = { ...createSurfaceWalk(input, [{ id: "chat-reading", kind: "chat-journey" }]), messageOperations };
  try {
    const rooms = await readChats(flow);
    const candidates = rooms.toSorted((a, b) => b.messageCount - a.messageCount);
    subjectCoverage(flow, rooms);
    const room = candidates.at(0);
    if (room === undefined) {
      observe(flow, "chat-reading", "unvisited", "No readable original transcript subject");
      return;
    }
    const messages = await readCanon(flow, room.id);
    observe(flow, "reading-room-scope", "observed", `Selected original room ${room.id}; other library rooms are not claimed as reading witnesses`);
    const first = messages.at(0);
    if (first === undefined) {
      observe(flow, "chat-reading", "not-applicable", "Selected original room has no readable committed messages");
      return;
    }
    messageOperations.push(...(await runChatMessageOperations(input)));
    expect(await readCanon(flow, room.id), "Disposable operation proofs must leave the entire original reading canon untouched").toEqual(messages);
    await flow.page.goto("/");
    await waitForAppReady(flow.page);
    await flow.requestPanes();
    const witnesses = new Map([[first.id, first]]);
    addRoleWitnesses(flow, witnesses, messages);
    const last = messages.at(-1);
    if (last !== undefined) {
      witnesses.set(last.id, last);
    }
    for (const message of witnesses.values()) {
      expectSubject(flow, `reading-${message.role}-${message.id}-start`, "reading-subject");
    }
    await openRoom(flow, room);
    await reachMessage(flow, first, -1);
    for (const message of [...witnesses.values()].toSorted((a, b) => a.seq - b.seq)) {
      await readMessage(flow, message);
    }
    observe(
      flow,
      "reading-data",
      "observed",
      `${String(messages.length)} original canon rows read; ${String(witnesses.size)} identity-scoped boundary/role witnesses`,
    );
    observe(flow, "chat-reading", "visited", "Original-role reading witnesses completed; delayed media and arrival remain explicitly separate");
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

async function chatRowMenu(flow: Journey, room: ChatSummary): Promise<Locator> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const show = flow.page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  if (await show.isVisible()) {
    await show.click();
  }
  const { row } = await roomRow(flow, room);
  await row.hover();
  const trigger = row.getByRole("button", { name: namePattern(chatRowActionsName(NAME_HOLE)) });
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
  let menu = await chatRowMenu(flow, room);
  const exportTrigger = menu.getByRole("menuitem", { name: CHAT_EXPORT_TRANSCRIPT_NAME, exact: true });
  await exportTrigger.focus();
  await exportTrigger.press("ArrowRight");
  await expect(exportTrigger).toHaveAttribute("aria-expanded", "true");
  const submenu = await controlledPanel(exportTrigger);
  const labels = await submenu.getByRole("menuitem").allTextContents();
  for (const label of labels) {
    expectSubject(flow, `commands/export/${label.trim()}`, "menu-operation");
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
    menu = await chatRowMenu(flow, room);
    const downloadOwner = await commandMenuOwner(menu);
    const trigger = menu.getByRole("menuitem", { name: CHAT_EXPORT_TRANSCRIPT_NAME, exact: true });
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
        const path = flow.info.outputPath(`${flow.ids.uuid()}${extname(download.suggestedFilename())}`);
        await download.saveAs(path);
        expect((await stat(path)).size).toBeGreaterThan(0);
        await flow.info.attach(`disposable-${download.suggestedFilename()}`, { path });
      },
      ready: async () => {
        await expect(flow.page.getByRole("list", { name: CHAT_LIST_NAME, exact: true })).toBeVisible();
      },
    });
    observe(flow, id, "visited", `Actual native download from disposable room ${room.id}; nonempty original response saved in private native output`);
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
  expectSubject(flow, id, "menu-operation");
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
      await row.getByRole("button", { name: CHAT_SAVE_EDIT_NAME, exact: true }).click();
    },
    ready: async () => {
      await expect(editor).toBeHidden();
      await expect(row).toContainText(edited);
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id: messageId }) => messageId === message.id)?.content).toBe(edited);
    },
  });
  await checkpoint(flow, id, row, row);
  observe(flow, id, "visited", `Native Edit/Save changed disposable message ${message.id}; persisted content and rendered row agree`);
}

/** Execute lifecycle commands against an explicitly disposable production-created room, never an original reading subject. */
export async function walkChatCommands(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-commands", kind: "chat-journey" }]);
  const title = `Surface commands ${flow.ids.uuid()}`;
  let createdId: ChatId | undefined;
  try {
    const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [], opening: "none", title });
    expect(nonEmpty(flow.run.subjects.chats).some(({ id }) => id === chat.id)).toBe(false);
    createdId = chat.id;
    await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
    await flow.client.chat.commitMessage.mutate({
      chatId: chat.id,
      content: "A disposable command witness, not original owner history.",
      timeZone: UTC_TIME_ZONE,
    });
    let room = await commandRoom(flow, chat.id, title);
    let menu = await chatRowMenu(flow, room);
    const labels = await menu.locator('[role="menuitem"]:not([aria-haspopup="menu"])').allTextContents();
    for (const label of labels) {
      const id = `commands/lifecycle/${label.trim()}`;
      expectSubject(flow, id, "menu-operation");
      observe(flow, id, "unvisited", "Native available command seeded before execution; only its completed operation can supersede this disposition");
    }
    await menu.getByRole("menuitem", { name: ROW_RENAME_NAME, exact: true }).click();
    const dialog = flow.page.getByRole("dialog", { name: RENAME_CHAT_NAME, exact: true });
    const renamed = `${title} renamed`;
    await dialog.getByRole("textbox", { name: CHAT_TITLE_FIELD_NAME, exact: true }).fill(renamed);
    await flow.action("commands/rename-save", {
      action: async () => {
        await dialog.getByRole("button", { name: DIALOG_VERBS.save, exact: true }).click();
      },
      ready: async () => {
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await commandRoom(flow, chat.id, title)).title).toBe(renamed);
        await expect(flow.page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).getByRole("button", { name: renamed, exact: true })).toBeVisible();
      },
    });
    observe(flow, "commands/lifecycle/Rename", "visited", "Native rename Save persisted and repainted the disposable subject");
    for (const [label, starred] of [
      [ROW_STAR_NAME, true],
      [ROW_UNSTAR_NAME, false],
    ] as const) {
      room = await commandRoom(flow, chat.id, title);
      const starMenu = await chatRowMenu(flow, room);
      expectSubject(flow, `commands/lifecycle/${label}`, "menu-operation");
      await flow.action(`commands/${label}`, {
        action: async () => {
          await starMenu.getByRole("menuitem", { name: label, exact: true }).click();
        },
        ready: async () => {
          await expect(starMenu).toBeHidden();
          await expect.poll(async () => (await commandRoom(flow, chat.id, title)).starred).toBe(starred);
          const row = flow.page
            .getByRole("list", { name: CHAT_LIST_NAME, exact: true })
            .locator('[data-slot="virtual-list-row"]')
            .filter({ has: flow.page.getByRole("button", { name: renamed, exact: true }) });
          await row.hover();
          await row.getByRole("button", { name: namePattern(chatRowActionsName(NAME_HOLE)) }).click();
          await expect(flow.page.getByRole("menu").getByRole("menuitem", { name: starred ? ROW_UNSTAR_NAME : ROW_STAR_NAME, exact: true })).toBeVisible();
          await flow.page.getByRole("menu").press("Escape");
        },
      });
      observe(flow, `commands/lifecycle/${label}`, "visited", "Native star command persisted and its inverse became available in the actual subject menu");
    }
    room = await commandRoom(flow, chat.id, title);
    await commandExports(flow, room);
    await commandEdit(flow, room);
    menu = await chatRowMenu(flow, await commandRoom(flow, chat.id, title));
    await flow.action("commands/archive", {
      action: async () => {
        await menu.getByRole("menuitem", { name: CHAT_ARCHIVE_NAME, exact: true }).click();
      },
      ready: async () => {
        await expect.poll(async () => (await commandRoom(flow, chat.id, title)).archived).toBe(true);
        await expect(flow.page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
      },
    });
    observe(flow, "commands/lifecycle/Archive", "visited", "Native archive persisted and removed the exact disposable subject from the non-archived list");
    await flow.client.chat.archive.mutate({ chatId: chat.id, archived: false });
    menu = await chatRowMenu(flow, await commandRoom(flow, chat.id, title));
    await menu.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
    const confirm = flow.page.getByRole("alertdialog", { name: deleteConfirmTitle(renamed), exact: true });
    await expect(confirm).toBeVisible();
    await flow.action("commands/delete-confirm", {
      action: async () => {
        await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
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
    observe(
      flow,
      "commands/lifecycle/Delete",
      "visited",
      "Native destructive confirmation deleted only the disposable subject; production read and rendered list prove removal",
    );
    observe(flow, "chat-commands", "visited", "Disposable lifecycle, download and message Edit/Save operations completed; no original subject was mutated");
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
              rect: ((bounds) => ({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
                left: bounds.left,
              }))(node.getBoundingClientRect()),
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
    expectSubject(flow, name, "message-menu-operation");
    const disabled = await item.isDisabled();
    const completion = flow.observations.some(({ id, disposition }) => id === name && disposition === "visited") ? "visited" : "observed";
    observe(
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
  observe(flow, `message-operations/${message.role}/${message.id}/${label}`, "visited", detail);
}

async function messageSavedReply(flow: Journey): Promise<void> {
  const character = await flow.client.character.create.mutate({
    input: {
      handle: characterHandleSchema.parse(`surface-message-${flow.ids.uuid()}`),
      name: "Disposable saved reply character",
      description: "Disposable greeting recovery witness.",
      greetings: [{ text: "Disposable first card greeting." }, { text: "Disposable second card greeting." }],
    },
  });
  try {
    const title = `Surface saved replies ${flow.ids.uuid()}`;
    const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [character.id], opening: "first-message", title });
    try {
      await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
      const room = await commandRoom(flow, chat.id, title);
      const message = (await readCanon(flow, chat.id)).at(-1);
      if (message === undefined) {
        throw new Error("The production card opening has no committed greeting");
      }
      await openRoom(flow, room);
      await dismissContext(flow);
      let menu = await messageOperationMenu(flow, message);
      await expect(menu.getByRole("menuitem", { name: CHAT_SAVED_REPLIES_DOOR_NAME, exact: true })).toHaveCount(0);
      await menu.getByRole("menuitem", { name: MESSAGE_EDIT_NAME, exact: true }).click();
      const row = messageRow(flow.page, message.id);
      const custom = "Disposable authored greeting retained beside card alternates.";
      await row.getByRole("textbox", { name: MESSAGE_EDIT_NAME, exact: true }).fill(custom);
      await row.getByRole("button", { name: CHAT_SAVE_EDIT_NAME, exact: true }).click();
      await expect(row).toContainText(custom);
      const saved = (await readCanon(flow, chat.id)).find(({ id }) => id === message.id);
      if (saved === undefined) {
        throw new Error("The edited greeting disappeared");
      }
      await messageOperationDone(flow, saved, MESSAGE_EDIT_NAME, "Native greeting Edit/Save persisted the exact authored content and repainted its row");
      await row.getByRole("button", { name: CHAT_NEXT_GREETING_NAME, exact: true }).click();
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
      await menu.getByRole("menuitem", { name: CHAT_SAVED_REPLIES_DOOR_NAME, exact: true }).click();
      const dialog = flow.page.getByRole("dialog", { name: CHAT_SAVED_REPLIES_NAME, exact: true });
      await dialog.getByRole("combobox", { name: CHAT_SAVED_REPLY_NAME, exact: true }).click();
      await flow.page.getByRole("option", { name: savedReplyOptionName(stored.idx + 1, false), exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await readCanon(flow, chat.id)).find(({ id }) => id === message.id)?.selectedVariantId).toBe(saved.selectedVariantId);
      await expect(row).toContainText(custom);
      await checkpoint(flow, "message-operations/saved-reply-restored", row, row);
      await messageOperationDone(
        flow,
        current,
        CHAT_SAVED_REPLIES_DOOR_NAME,
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
  await row.getByRole("button", { name: CHAT_SAVE_EDIT_NAME, exact: true }).click();
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
  expect(nonEmpty(flow.run.subjects.chats).some(({ id }) => id === fork.chat.id)).toBe(false);
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
    [MESSAGE_HIDE_FROM_AI_NAME, true],
    [MESSAGE_UNHIDE_FROM_AI_NAME, false],
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
        await expect(inverse.getByRole("menuitem", { name: hidden ? MESSAGE_UNHIDE_FROM_AI_NAME : MESSAGE_HIDE_FROM_AI_NAME, exact: true })).toBeVisible();
        await inverse.press("Escape");
      },
    });
    await messageOperationDone(flow, message, label, "Native visibility command persisted and its inverse rendered on the same disposable message");
  }
  let menu = await messageOperationMenu(flow, message);
  const reaction = menu.getByRole("menuitem", { name: MESSAGE_REACTION_ADD_NAME, exact: true });
  if ((await reaction.count()) === 0) {
    observe(flow, "message-operations/reactions", "not-applicable", "This actual room menu has no reaction door");
    await menu.press("Escape");
    return;
  }
  await reaction.click();
  const picker = flow.page.getByRole("dialog", { name: MESSAGE_REACTION_ADD_NAME, exact: true });
  const emoji = REACTION_EMOJIS[0];
  const name = reactionChoiceName(emoji);
  const choice = picker.getByRole("button", { name, exact: true });
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(picker).toBeHidden();
  const pill = messageRow(flow.page, message.id).getByRole("button", { name: reactionPillName(emoji, 1, null), exact: true });
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
  const copyNotices = flow.page.locator('[data-slot="toast-root"]').filter({ has: flow.page.getByText(COPIED_TO_CLIPBOARD_NOTICE, { exact: true }) });
  // At enlarged text a notice can lie over the row the next menu opens from, and a toast holds while the pointer rests on it, so
  // hovering through it never lets it time out. Close each one, as a reader would, before the next press.
  const dismissCopyNotices = async (): Promise<void> => {
    for (const notification of await copyNotices.all()) {
      await notification.getByRole("button", { name: TOAST_CLOSE_NAME, exact: true }).click();
    }
    await expect(copyNotices).toHaveCount(0);
  };
  await dismissCopyNotices();
  let menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: MESSAGE_COPY_NAME, exact: true }).click();
  await expect(copyNotices).toBeVisible();
  if (chromium) {
    await expectClipboardContent(flow, message.content);
  }
  await messageOperationDone(flow, message, MESSAGE_COPY_NAME, "Native clipboard write completed with the production success acknowledgement");
  await dismissCopyNotices();
  menu = await messageOperationMenu(flow, message);
  await menu.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
  const confirm = flow.page.getByRole("alertdialog", { name: CHAT_DELETE_MESSAGE_TITLE, exact: true });
  await expect(confirm).toBeVisible();
  await flow.action("message-operations/delete", {
    action: async () => {
      await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
    },
    ready: async () => {
      await expect(confirm).toBeHidden();
      await expect(messageRow(flow.page, message.id)).toHaveCount(0);
      await expect.poll(async () => (await readCanon(flow, message.chatId)).some(({ id }) => id === message.id)).toBe(false);
    },
  });
  await messageOperationDone(
    flow,
    message,
    ROW_DELETE_NAME,
    "Native destructive confirmation removed the exact disposable message from rendered and persisted canon",
  );
}

/** Execute row commands on disposable canon; original reading-menu inventories retain their own dispositions. */
export async function walkChatMessageOperations(input: SurfaceFlow): Promise<void> {
  await runChatMessageOperations(input);
}

async function runChatMessageOperations(input: SurfaceFlow): Promise<MessageOperationProof[]> {
  const messageOperations: MessageOperationProof[] = [];
  const flow: Journey = { ...createSurfaceWalk(input), messageOperations };
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
      await dismissContext(flow);
      let menu = await messageOperationMenu(flow, user);
      await expect(menu.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_NAME, exact: true })).toBeDisabled();
      await menu.press("Escape");
      await flow.client.persona.setActivePersona.mutate({ chatId: room.id, personaId: persona.id });
      await dismissContext(flow);
      menu = await messageOperationMenu(flow, user);
      await menu.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_NAME, exact: true }).click();
      const confirm = flow.page.getByRole("alertdialog", { name: CHAT_REATTRIBUTE_CONFIRM_TITLE, exact: true });
      await expect(confirm).toContainText(persona.name);
      await confirm.getByRole("button", { name: CHAT_REATTRIBUTE_CONFIRM_NAME, exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id }) => id === user.id)?.personaId).toBe(persona.id);
      const restamped = present((await readCanon(flow, room.id)).find(({ id }) => id === user.id));
      await expect(messageRow(flow.page, user.id)).toHaveAccessibleName(`${persona.name} · #${String(restamped.position)}`);
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
      await dismissContext(flow);
      const composer = flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true });
      await composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill("Produce a disposable assistant operation witness.");
      await composer.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
      await expect.poll(async () => (await readCanon(flow, room.id)).some(({ role }) => role === "assistant")).toBe(true);
      const assistant = (await readCanon(flow, room.id)).find(({ role }) => role === "assistant");
      if (assistant === undefined) {
        throw new Error("Native Send has no durable assistant reply");
      }
      const paragraphs = messageRow(flow.page, assistant.id).locator("p");
      await expect(paragraphs.first()).toContainText(/\S/u);
      const originalParagraphs = await paragraphs.allTextContents();
      menu = await messageOperationMenu(flow, assistant);
      for (const label of [MESSAGE_UNDO_CONTINUATION_NAME, MESSAGE_REAPPLY_CONTINUATION_NAME]) {
        await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeDisabled();
      }
      observe(
        flow,
        `message-operations/assistant/${assistant.id}/${CHAT_SAVED_REPLIES_DOOR_NAME}`,
        "not-applicable",
        "Generated assistant row has no card-opening binding; actual menu snapshot has no Saved replies door",
      );
      await menu.press("Escape");
      menu = await messageOperationMenu(flow, assistant);
      await safeDialogDrill(flow, menu.getByRole("menuitem", { name: MESSAGE_VIEW_WIRE_TRACE_NAME, exact: true }), {
        label: MESSAGE_VIEW_WIRE_TRACE_NAME,
        id: "message-operations/wire-trace",
      });
      await messageOperationDone(
        flow,
        assistant,
        MESSAGE_VIEW_WIRE_TRACE_NAME,
        "Native host-only wire viewer opened the actual generated variant record and rendered its loaded body",
      );
      // A narrow utilities row hands Continue the reply to the Message tools menu.
      await pressOverflowed(flow.page, {
        inline: composer.getByRole("button", { name: CHAT_CONTINUE_REPLY_NAME, exact: true }),
        overflow: composer.getByRole("button", { name: MESSAGE_TOOLS_LABEL, exact: true }),
        name: CHAT_CONTINUE_REPLY_NAME,
      });
      await expect.poll(async () => (await readCanon(flow, room.id)).find(({ id }) => id === assistant.id)?.hasContinuation).toBe(true);
      const continued = (await readCanon(flow, room.id)).find(({ id }) => id === assistant.id);
      if (continued === undefined) {
        throw new Error("The continued reply disappeared");
      }
      expect(continued.content).not.toBe(assistant.content);
      await expect.poll(async () => await paragraphs.allTextContents()).not.toEqual(originalParagraphs);
      const continuedParagraphs = await paragraphs.allTextContents();
      for (const [label, content, rendered] of [
        [MESSAGE_UNDO_CONTINUATION_NAME, assistant.content, originalParagraphs],
        [MESSAGE_REAPPLY_CONTINUATION_NAME, continued.content, continuedParagraphs],
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
      await dismissContext(flow);
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
  const title = `Surface walk ${name} ${flow.ids.uuid()}`;
  const { chat } = await flow.client.chat.startChat.mutate({ characterIds: [], opening: "none", title });
  expect(nonEmpty(flow.run.subjects.chats).some(({ id }) => id === chat.id)).toBe(false);
  try {
    await flow.client.chat.updateTitle.mutate({ chatId: chat.id, title });
    await flow.client.chat.commitMessage.mutate({ chatId: chat.id, content, attachmentAssetIds: [...attachments], timeZone: UTC_TIME_ZONE });
    const result = await flow.client.chat.listChats.query({ search: title, limit: CHAT_LIST_MAX_LIMIT });
    const room = result.items.find(({ id }) => id === chat.id);
    if (room === undefined) {
      throw new Error("The newly committed disposable control room is absent from its production library read");
    }
    observe(flow, `${name}-subject`, "observed", `Explicit disposable journey CRUD room ${chat.id}; never an original snapshot reading witness`);
    await run(room, await readCanon(flow, room.id));
  } finally {
    // An open room refetches its transcript; deleted underneath it, that refetch is a 404 the case fails on.
    if (flow.page.url() !== "about:blank") {
      await flow.page.goto("/");
      await waitForAppReady(flow.page);
    }
    await flow.client.chat.delete.mutate({ chatId: chat.id });
    await expect
      .poll(async () => (await flow.client.chat.listChats.query({ search: title, limit: CHAT_LIST_MAX_LIMIT })).items.some(({ id }) => id === chat.id))
      .toBe(false);
  }
}

/** Run real Send, visible streaming and Stop against the root's bounded text peer on a disposable room. */
export async function walkChatGeneration(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-generation", kind: "chat-journey" }]);
  const previous = (await flow.client.connection.listBindings.query()).find(({ task }) => task === "chat");
  if (previous === undefined) {
    throw new Error("The production connection binding catalogue has no chat task");
  }
  const previousId = previous.binding?.connectionId ?? null;
  try {
    await flow.client.connection.setBinding.mutate({ task: "chat", connectionId: flow.run.generation.connection.id });
    await disposableRoom(flow, { name: "generation", content: "A disposable native Send and Stop witness.", attachments: [] }, async (room) => {
      await openRoom(flow, room);
      await dismissContext(flow);
      const composer = flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true });
      const textbox = composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
      const stop = composer.getByRole("button", { name: CHAT_STOP_NAME, exact: true });
      const ghost = flow.page.locator('[data-slot="ghost-message-row"]');
      const prompt = `Complete the disposable native witness ${flow.ids.uuid()}.`;
      await textbox.fill(prompt);
      await flow.action("generation/send-completion", {
        action: async () => {
          await composer.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
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
      observe(
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
            await composer.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
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
            await expect(composer.getByRole("button", { name: CHAT_STOPPING_NAME, exact: true })).toBeHidden();
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
        observe(
          flow,
          "generation/cancel",
          "visited",
          "Native Stop removed the actual visible held stream and the physical provider recorded stream cancellation",
        );
      } finally {
        await flow.client.chat.abort.mutate({ chatId: room.id });
      }
      await checkpoint(flow, "generation-after-stop", flow.page.locator("body"), composer);
      observe(
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

/** The first confirm button a guest's registered spec declares: its label and confirm title are the guest's own words. */
function specConfirmButton(node: PluginSurfaceNode | undefined): PluginConfirmButtonNode | undefined {
  if (node === undefined || node.kind === "confirmButton") {
    return node;
  }
  return pluginChildNodes(node)
    .map(specConfirmButton)
    .find((found) => found !== undefined);
}

/** A showcase bundle installs disabled and ungranted, so a journey over one consents and enables it, then restores that. */
async function withEnabledPlugin(flow: Journey, slug: ShowcaseSlug, id: string, run: (plugin: PluginView) => Promise<void>): Promise<void> {
  const installed = (await flow.client.plugin.list.query()).find((row) => row.slug === slug);
  if (installed === undefined) {
    observe(flow, id, "not-applicable", `This dataset has no ${slug} install; no guest execution is claimed`);
    return;
  }
  const acknowledgedNetHosts = [...(installed.netHosts ?? [])];
  const plugin = await flow.client.plugin.setGrant.mutate({
    pluginId: installed.id,
    grant: [...installed.declaredCapabilities],
    acknowledgedNetHosts,
    enable: true,
  });
  expect(plugin.status, plugin.lastError ?? "The consented plugin must start").toBe("enabled");
  try {
    await run(plugin);
  } finally {
    await flow.client.plugin.setGrant.mutate({
      pluginId: installed.id,
      grant: [...installed.grantedCapabilities],
      acknowledgedNetHosts,
      enable: installed.status === "enabled",
    });
  }
}

/** Enter a maintained guest's actual opaque frame and operate its native controls, not just host chrome. */
export async function walkChatArcade(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-arcade", kind: "plugin-operation" }]);
  try {
    await withEnabledPlugin(flow, ARCADE_SLUG, "chat-arcade", async (plugin) => {
      const surface = (await flow.client.plugin.listSurfaces.query()).find(
        (candidate) => candidate.pluginId === plugin.id && candidate.anchor === "chat-flank" && candidate.tier === "frame",
      );
      if (surface === undefined) {
        throw new Error("The enabled maintained arcade has no registered chat frame; inspect its grant/startup evidence");
      }
      await disposableRoom(flow, { name: "arcade", content: "A disposable room for the maintained guest frame.", attachments: [] }, async (room) => {
        await openRoom(flow, room);
        await openChatContext(flow);
        await flow.page
          .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })
          .getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })
          .click();
        await pluginContextReady(flow);
        const frame = activeContext(flow).locator("iframe").filter({ visible: true });
        const titles = [plugin.name, pluginSurfaceName(plugin.name, surface.title)].map((title) => `[title=${JSON.stringify(title)}]`);
        const arcade = frame.and(flow.page.locator(titles.join(", ")));
        await expect(arcade).toHaveCount(1);
        await expect(arcade).toBeVisible();
        const guest = arcade.contentFrame();
        const board = guest.locator("#board");
        const cells = board.locator(".cell");
        // Guest source cannot import, so its copy has no production home; its own markup ids are the stable handles.
        const newGame = guest.locator("button#new");
        await expect(newGame).toBeVisible();
        await expect.poll(async () => await cells.count()).toBeGreaterThan(0);
        await newGame.click();
        const before = await cells.allTextContents();
        await flow.action("arcade/native-pad", {
          action: async () => {
            await guest.locator('button[data-d="up"]').click();
            await guest.locator('button[data-d="left"]').click();
            await guest.locator('button[data-d="down"]').click();
            await guest.locator('button[data-d="right"]').click();
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
        observe(
          flow,
          "chat-arcade",
          "visited",
          "The real routed opaque guest loaded, New game and four native pad controls changed its rendered board; no host bridge or copied game algorithm",
        );
      });
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
  const trigger = flow.page.getByRole("button", { name: PLUGIN_ACTIONS_NAME, exact: true });
  await trigger.click();
  const menu = await controlledPanel(trigger);
  const item = menu.getByRole("menuitem", { name: placedItemLabel({ shownName, command, label: placement.label }), exact: true });
  await expect(item).toHaveCount(1);
  await item.click();
}

/** Run maintained declared commands and verify the real guest's persisted publication and rendered dialog. */
export async function walkChatOracle(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-oracle", kind: "plugin-operation" }]);
  try {
    await withEnabledPlugin(flow, ORACLE_SLUG, "chat-oracle", async (plugin) => {
      const commands = (await flow.client.plugin.listCommands.query()).filter(({ pluginId }) => pluginId === plugin.id);
      const draw = commands.find(({ name }) => name === "draw");
      const reveal = commands.find(({ name }) => name === "reveal");
      const surfaces = (await flow.client.plugin.listSurfaces.query()).filter(({ pluginId }) => pluginId === plugin.id);
      const deck = surfaces.find(({ anchor }) => anchor === "page");
      const revealSurface = surfaces.find(({ anchor }) => anchor === "dialog");
      const retire = specConfirmButton(revealSurface?.spec);
      if (draw === undefined || reveal === undefined || deck === undefined || revealSurface === undefined || retire === undefined) {
        throw new Error("The enabled maintained deck is missing its real Draw/Reveal registrations");
      }
      await disposableRoom(flow, { name: "oracle", content: "A disposable room for maintained local plugin commands.", attachments: [] }, async (room) => {
        await openRoom(flow, room);
        await dismissContext(flow);
        const dialog = flow.page.getByRole("dialog", { name: PLUGIN_DIALOG_TITLE, exact: true });
        await runPlacedCommand(flow, reveal);
        await expect(dialog.getByRole("button", { name: retire.label, exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: retire.label, exact: true }).click();
        const confirmation = flow.page.getByRole("alertdialog", { name: retire.confirmTitle, exact: true });
        await confirmation.getByRole("button", { name: retire.label, exact: true }).click();
        await expect(confirmation).toBeHidden();
        await expect.poll(async () => (await flow.client.plugin.getSurfaceState.query({ pluginId: plugin.id, surfaceId: deck.id }))?.["dealt"]).toBe(0);
        await dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
        await expect(dialog).toBeHidden();
        await runPlacedCommand(flow, draw);
        const args = flow.page.getByRole("dialog", { name: PLUGIN_COMMAND_ARGS_TITLE, exact: true });
        const count = draw.args.at(0);
        if (count === undefined) {
          throw new Error("The maintained Draw command declares no count argument");
        }
        await args.getByRole("textbox", { name: humanizeId(count.name), exact: true }).fill("1");
        await flow.action("oracle/draw-command", {
          action: async () => {
            await args.getByRole("button", { name: pluginCommandActionLabel(draw.name), exact: true }).click();
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
            await expect(dialog.getByRole("group", { name: pluginSurfaceName(plugin.name, revealSurface.title), exact: true })).toBeVisible();
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
        await checkpoint(flow, "oracle-command-result", dialog, dialog.getByRole("button", { name: retire.label, exact: true }));
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
        await dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
        await expect(dialog).toBeHidden();
        observe(
          flow,
          "chat-oracle",
          "visited",
          "Native placed Draw with typed Count and Reveal executed the actual maintained guest, changed copied plugin state and rendered its seed/commitment dialog; no provider execution",
        );
      });
    });
  } finally {
    await publish(flow, "chat-oracle-coverage");
  }
}

/** Execute a maintained composer replacement and its native Undo without sending or rewriting canon. */
export async function walkChatPolish(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-polish", kind: "plugin-operation" }]);
  try {
    await withEnabledPlugin(flow, POLISH_SLUG, "chat-polish", async (plugin) => {
      const command = (await flow.client.plugin.listCommands.query()).find(({ pluginId, composerDraft }) => pluginId === plugin.id && composerDraft === true);
      if (command === undefined) {
        throw new Error("The enabled maintained polish plugin has no declared composer replacement command");
      }
      await disposableRoom(flow, { name: "polish", content: "A disposable unsent draft replacement witness.", attachments: [] }, async (room) => {
        await openRoom(flow, room);
        await dismissContext(flow);
        const before = await readCanon(flow, room.id);
        const textbox = flow.page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
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
        await checkpoint(flow, "polish-visible-replacement", flow.page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true }), textbox);
        const trigger = flow.page.getByRole("button", { name: PLUGIN_ACTIONS_NAME, exact: true });
        await trigger.click();
        const menu = await controlledPanel(trigger);
        await flow.action("polish/undo", {
          action: async () => {
            await menu.getByRole("menuitem", { name: namePattern(pluginUndoName(NAME_HOLE)) }).click();
          },
          ready: async () => {
            await expect(textbox).toHaveValue(draft);
          },
        });
        expect(await readCanon(flow, room.id), "Polish and Undo must not send or rewrite committed history").toEqual(before);
        await textbox.fill("");
        observe(
          flow,
          "chat-polish",
          "visited",
          "Actual maintained composer command replaced only the visible draft, preserved inline code and restored the exact original via native Undo; canon unchanged",
        );
      });
    });
  } finally {
    await publish(flow, "chat-polish-coverage");
  }
}

async function selectHeldRoom(flow: Journey, room: ChatSummary, beforeSelect?: () => void): Promise<void> {
  await enterChatsList(flow);
  await flow.requestPanes();
  const show = flow.page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  if (await show.isVisible()) {
    await show.click();
  }
  const { title } = await roomRow(flow, room);
  beforeSelect?.();
  await title.click();
  await expect(flow.page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
  await flow.requestPanes();
}

/** Hold the actual first message transport read while typing into the production composer's stable slot. */
export async function walkChatArrival(input: SurfaceFlow): Promise<void> {
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-arrival", kind: "external-edge" }]);
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
          const inputBox = flow.page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
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
            const arrival = `A second durable, generation-free arrival ${flow.ids.uuid()}`;
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
            observe(
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
  const flow: Journey = createSurfaceWalk(input, [{ id: "chat-delayed-media", kind: "external-edge" }]);
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
      observe(
        flow,
        "chat-delayed-media",
        dimensionalImages === 0 ? "not-applicable" : "unvisited",
        `${String(ids.length)} original owned asset IDs examined; ${String(dimensionalImages)} dimensional images, none absent from the actual ambient resource scene. No replacement bytes were fabricated`,
      );
      return;
    }
    const asset = selected;
    const anchorText = "The native reading anchor immediately after the delayed original image.";
    const imageAlt = "Original snapshot image";
    const content = `![${imageAlt}](asset:${asset.assetId})\n\n${anchorText}\n\n${Array.from({ length: 32 }, (_, index) => `Reading continuation ${String(index + 1)}. This explicitly disposable prose keeps a real non-tail reading window open.`).join("\n\n")}`;
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
      const image = row.getByRole("img", { name: imageAlt, exact: true });
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
        // At enlarged text the reserved frame and its anchor paragraph can each fill most of the port, so the walk puts
        // the edge between them mid-port, where both stay in view for the shift reading.
        await port.evaluate(
          (scroller, target) => {
            const box = scroller.getBoundingClientRect();
            scroller.scrollTop += target.getBoundingClientRect().top - (box.top + box.height / 2);
          },
          await anchor.elementHandle(),
        );
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
        observe(
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
        // A held handler continues its route after the release; unrouting first leaves it continuing a route Playwright
        // already handed on, and that rejection tears the page down before this room is deleted.
        await Promise.all(joined);
        await flow.page.unroute(match, handler);
        flow.page.off("response", onResponse);
      }
    });
  } finally {
    await publish(flow, "chat-delayed-media-coverage");
  }
}
