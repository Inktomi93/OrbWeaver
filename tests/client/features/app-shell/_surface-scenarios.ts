// The census's selected production states; witnesses are body content, never just shell or section chrome.
import type { ConfigGroupId, ModalSlotId, SectionId } from "@orb/client/state";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { Page } from "@playwright/test";
import { YOU_SHEET_ACCOUNT_NAME } from "#client/features/app-shell/lib/app-shell-names.ts";
import { CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { CHAT_LIST_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { COMMAND_PALETTE_NAME } from "#client/features/chat/lib/command-palette-names.ts";
import { CONFIG_THEME_GROUP_NAME } from "#client/features/config/lib/config-control-names.ts";
import { backgroundStateLabel } from "#client/features/credentials/lib/connections-copy.ts";
import {
  DATABANK_ADD_METHOD_NAME,
  DATABANK_ATTACH_GROUP_NAME,
  DATABANK_LIST_NAME,
  DATABANK_RECENT_DOCUMENTS_NAME,
} from "#client/features/databank/lib/databank-names.ts";
import {
  CORPUS_MODEL_ROUTES_NAME,
  CORPUS_NONE_FOUND_TEXT,
  CORPUS_READINESS_RAIL_NAME,
  CORPUS_STAGE_LABELS,
  CORPUS_UNDERSTANDING_HEADING,
} from "#client/features/discovery/lib/corpus-control-names.ts";
import { IMAGE_DETAIL_EMPTY_TEXT, IMAGE_EDIT_EMPTY_TEXT, IMAGINE_EMPTY_TEXT } from "#client/features/imagery/lib/imagine-names.ts";
import { EXTENSIONS_OPEN_PLUGINS_ACTION } from "#client/features/plugin/lib/extensions-copy.ts";
import { PLUGIN_NO_COMMAND_SELECTED_TEXT } from "#client/features/plugin/lib/plugin-command-copy.ts";
import { PLUGIN_DIALOG_GONE_BODY, PLUGIN_DIALOG_GONE_TITLE } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import { PRESET_ACTIVE_RADIOGROUP_NAME } from "#client/features/preset/lib/preset-names.ts";
import { REFINERY_START_SESSION_PICKER_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import { ROSTER_START_CHAT_LEAD } from "#client/features/roster-preset/lib/roster-names.ts";
import { ADMIN_APPROVALS_NOTE, ADMIN_CREATE_USER_NAME, ADMIN_MAX_IMAGE_DOWNLOAD_NAME } from "#client/features/user-admin/lib/user-admin-names.ts";
import { IMPORT_FOLDER_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import { START_NEW_CHAT_NAME } from "#client/lib/chat-launch-names.ts";

type Witnesses = SurfaceAuditRequest["witnesses"];
type Scenario = Omit<Exclude<SurfaceAuditRequest, { readonly state: "error" }>, "checks" | "requireBothFormKeys">;
type ModalScenario = Pick<Scenario, "state" | "witnesses">;

const SECTION_WITNESSES = {
  home: (page): Witnesses => [
    page
      .locator('[data-home-tile="chat.recents"]')
      .getByRole("button", { name: /^Resume / })
      .first(),
    page.getByRole("list", { name: "Character quick-picks", exact: true }).getByRole("listitem").first(),
    page.getByRole("list", { name: DATABANK_RECENT_DOCUMENTS_NAME, exact: true }).getByRole("listitem").first(),
    page.locator('[data-home-tile="rosterPreset.rosters"]').getByRole("listitem").first(),
  ],
  chats: (page): Witnesses => [
    page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("button", { name: START_NEW_CHAT_NAME }),
  ],
  characters: (page): Witnesses => [
    page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("heading", { name: "Pick up where you left off", exact: true }),
  ],
  corpus: (page): Witnesses => [
    page.getByText(CORPUS_UNDERSTANDING_HEADING, { exact: true }),
    page
      .getByRole("list", { name: CORPUS_READINESS_RAIL_NAME, exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByText(CORPUS_STAGE_LABELS.keywords, { exact: true }) })
      .getByText(CORPUS_NONE_FOUND_TEXT, { exact: true }),
    page.getByRole("list", { name: CORPUS_MODEL_ROUTES_NAME, exact: true }).getByRole("listitem").first(),
  ],
  config: (page): Witnesses => [
    page.locator('[data-slot="config-content"]').getByRole("radiogroup", { name: CONFIG_THEME_GROUP_NAME, exact: true }).getByRole("radio").first(),
    page.locator('[data-slot="config-content"]').getByRole("switch", { name: "Color quoted speech", exact: true }),
  ],
  extensions: (page): Witnesses => [
    page.locator(".shell-content").getByRole("heading", { name: /plugins? (?:is|are) waiting for your OK$/ }),
    page.locator(".shell-content").getByRole("button").first(),
  ],
  databank: (page): Witnesses => [page.getByRole("list", { name: DATABANK_LIST_NAME, exact: true }).getByRole("listitem").first()],
  presets: (page): Witnesses => [page.getByRole("radiogroup", { name: PRESET_ACTIVE_RADIOGROUP_NAME, exact: true }).getByRole("radio").first()],
  refinery: (page): Witnesses => [
    page.getByRole("combobox", { name: REFINERY_START_SESSION_PICKER_NAME, exact: true }),
    page.locator(".shell-content").getByRole("option").first(),
  ],
} satisfies Record<SectionId, (page: Page) => Witnesses>;

const GROUP_WITNESSES = {
  personas: (page): Witnesses => [page.getByRole("button", { name: "New persona", exact: true })],
  appearance: (page): Witnesses => [page.getByRole("radiogroup", { name: CONFIG_THEME_GROUP_NAME, exact: true }).getByRole("radio").first()],
  "chat-behavior": (page): Witnesses => [page.getByRole("switch", { name: "Enter to send", exact: true })],
  workloads: (page): Witnesses => [
    page.getByRole("tablist", { name: "Filter jobs", exact: true }),
    page.getByRole("button", { name: /^New schedule/ }).first(),
  ],
  backup: (page): Witnesses => [
    page.getByRole("group", { name: "Include", exact: true }).getByRole("checkbox").first(),
    page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }),
  ],
  connections: (page): Witnesses => [
    // The row shows the background state; its switch lives in the editor the row opens.
    page.locator('[data-slot="config-content"]').getByText(backgroundStateLabel(true), { exact: true }).first(),
    page.getByRole("combobox", { name: "Chat connection", exact: true }),
    page.getByText("No keys yet", { exact: true }),
    page.getByText("A key is saved when you add a connection that needs one.", { exact: true }),
  ],
  automation: (page): Witnesses => [
    page.getByRole("textbox", { name: "Runs per hour", exact: true }),
    page.getByText("These rules watch your library and act on their own. No chat has to be open.", { exact: true }),
  ],
  admin: (page): Witnesses => [
    page.getByRole("textbox", { name: ADMIN_MAX_IMAGE_DOWNLOAD_NAME, exact: true }),
    page.getByRole("button", { name: ADMIN_CREATE_USER_NAME, exact: true }),
    page.getByText(ADMIN_APPROVALS_NOTE, { exact: true }),
  ],
  about: (page): Witnesses => [page.getByRole("button", { name: "Copy version for a bug report", exact: true })],
  regex: (page): Witnesses => [page.locator('[data-collection="regex"][data-slot="config-collection-landing"]').getByRole("listitem").first()],
  worldInfo: (page): Witnesses => [page.locator('[data-collection="worldInfo"][data-slot="config-collection-landing"]').getByRole("listitem").first()],
  rosterPreset: (page): Witnesses => [
    page.locator('[data-collection="rosterPreset"][data-slot="config-collection-landing"] [data-slot="list-row-body"]').first(),
  ],
  plugins: (page): Witnesses => [page.getByRole("group", { name: / plugin$/ }).first()],
} satisfies Record<ConfigGroupId, (page: Page) => Witnesses>;

const MODAL_SCENARIOS = {
  command: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("combobox", { name: COMMAND_PALETTE_NAME, exact: true }),
      page.getByRole("dialog").getByRole("group", { name: "Recent threads", exact: true }).getByRole("option").first(),
    ],
  }),
  newChat: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("combobox", { name: "Choose characters", exact: true }),
      page.getByRole("dialog").getByRole("option").first(),
    ],
  }),
  you: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [page.getByRole("dialog").getByRole("group", { name: YOU_SHEET_ACCOUNT_NAME, exact: true }).getByRole("button").first()],
  }),
  addDocument: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("group", { name: DATABANK_ADD_METHOD_NAME, exact: true }),
      page.getByRole("dialog").getByRole("group", { name: DATABANK_ATTACH_GROUP_NAME, exact: true }),
    ],
  }),
  reauth: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("textbox", { name: "Handle", exact: true }),
      page.getByRole("dialog").getByLabel("Password", { exact: true }),
    ],
  }),
  imagine: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText(IMAGINE_EMPTY_TEXT, { exact: true })] }),
  imageDetail: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText(IMAGE_DETAIL_EMPTY_TEXT, { exact: true })] }),
  imageEdit: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText(IMAGE_EDIT_EMPTY_TEXT, { exact: true })] }),
  pluginDialog: (page): ModalScenario => ({
    state: "empty",
    witnesses: [
      page.getByRole("dialog").getByText(PLUGIN_DIALOG_GONE_TITLE, { exact: true }),
      page.getByRole("dialog").getByText(PLUGIN_DIALOG_GONE_BODY, { exact: true }),
      page.getByRole("dialog").getByRole("button", { name: EXTENSIONS_OPEN_PLUGINS_ACTION, exact: true }),
    ],
  }),
  pluginCommandArgs: (page): ModalScenario => ({
    state: "empty",
    witnesses: [page.getByRole("dialog").getByText(PLUGIN_NO_COMMAND_SELECTED_TEXT, { exact: true })],
  }),
  savedRosters: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(`^${RegExp.escape(ROSTER_START_CHAT_LEAD)} `, "u") })
        .first(),
    ],
  }),
} satisfies Record<ModalSlotId, (page: Page) => ModalScenario>;

export function sectionScenario(page: Page, section: SectionId): Scenario {
  return {
    name: `section ${section}`,
    scope: page.locator("body"),
    state: section === "extensions" ? ("empty" as const) : ("loaded" as const),
    witnesses: SECTION_WITNESSES[section](page),
  };
}

export function groupScenario(page: Page, group: ConfigGroupId): Scenario {
  return {
    name: `settings group ${group}`,
    scope: page.locator('[data-slot="config-content"]'),
    state: "loaded" as const,
    witnesses: GROUP_WITNESSES[group](page),
  };
}

export function modalScenario(page: Page, modal: ModalSlotId): Scenario {
  return { name: `modal ${modal}`, scope: page.getByRole("dialog"), ...MODAL_SCENARIOS[modal](page) };
}
