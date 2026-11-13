// The census's selected production states; witnesses are body content, never just shell or section chrome.
import type { ConfigGroupId, ModalSlotId, SectionId } from "@orb/client/state";
import { configSettingLabel } from "@orb/client/state";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { Page } from "@playwright/test";
import { OWNER_RULE_RATE_FIELD_NAME, OWNER_RULES_INTRO } from "#client/features/automation/lib/automation-names.ts";
import { CHARACTER_LANDING_RESUME_TITLE, CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-style-model.ts";
import { CHAT_MESSAGE_HANDLING_SUBCATEGORY } from "#client/features/chat/lib/chat-behavior-message-handling-model.ts";
import { CHAT_LIST_NAME, HOME_QUICK_PICKS_NAME, NEW_CHAT_CHARACTERS_FIELD_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { COMMAND_PALETTE_NAME, COMMAND_RECENT_THREADS_NAME } from "#client/features/chat/lib/command-palette-names.ts";
import { CONFIG_THEME_GROUP_NAME } from "#client/features/config/lib/config-control-names.ts";
import { backgroundStateLabel } from "#client/features/credentials/lib/connections-copy.ts";
import { SAVED_KEYS_EMPTY_DESCRIPTION, SAVED_KEYS_EMPTY_TITLE } from "#client/features/credentials/lib/credentials-names.ts";
import { DATABANK_ADD_METHOD_NAME, DATABANK_LIST_NAME, DATABANK_RECENT_DOCUMENTS_NAME } from "#client/features/databank/lib/databank-names.ts";
import { CORPUS_MODEL_ROUTES_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { PERSONA_NEW_NAME } from "#client/features/persona/lib/persona-copy.ts";
import { PRESET_ACTIVE_RADIOGROUP_NAME } from "#client/features/preset/lib/preset-names.ts";
import { IMPORT_FOLDER_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import { EXPORT_INCLUDE_LEGEND, SCHEDULE_NEW_NAME, WORKLOAD_FILTER_TABS_NAME } from "#client/features/workloads/lib/workloads-names.ts";

type Witnesses = SurfaceAuditRequest["witnesses"];
type Scenario = Omit<Exclude<SurfaceAuditRequest, { readonly state: "error" }>, "checks" | "requireBothFormKeys">;
type ModalScenario = Pick<Scenario, "state" | "witnesses">;

const SECTION_WITNESSES = {
  home: (page): Witnesses => [
    page
      .locator('[data-home-tile="chat.recents"]')
      .getByRole("button", { name: /^Resume / })
      .first(),
    page.getByRole("list", { name: HOME_QUICK_PICKS_NAME, exact: true }).getByRole("listitem").first(),
    page.getByRole("list", { name: DATABANK_RECENT_DOCUMENTS_NAME, exact: true }).getByRole("listitem").first(),
    page.locator('[data-home-tile="rosterPreset.rosters"]').getByRole("listitem").first(),
  ],
  chats: (page): Witnesses => [
    page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("button", { name: /Start a new chat/i }),
  ],
  characters: (page): Witnesses => [
    page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("heading", { name: CHARACTER_LANDING_RESUME_TITLE, exact: true }),
  ],
  corpus: (page): Witnesses => [
    page.getByText("Library understanding", { exact: true }),
    page
      .getByRole("list", { name: "Analysis passes", exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByText("Keywords", { exact: true }) })
      .getByText("none found", { exact: true }),
    page.getByRole("list", { name: CORPUS_MODEL_ROUTES_NAME, exact: true }).getByRole("listitem").first(),
  ],
  config: (page): Witnesses => [
    page.locator('[data-slot="config-content"]').getByRole("radiogroup", { name: CONFIG_THEME_GROUP_NAME, exact: true }).getByRole("radio").first(),
    page
      .locator('[data-slot="config-content"]')
      .getByRole("switch", { name: configSettingLabel(APPEARANCE_MESSAGE_STYLE_SUBCATEGORY, "colorQuotedSpeech"), exact: true }),
  ],
  extensions: (page): Witnesses => [
    page.locator(".shell-content").getByRole("heading", { name: /plugins? (?:is|are) waiting for your OK$/ }),
    page.locator(".shell-content").getByRole("button").first(),
  ],
  databank: (page): Witnesses => [page.getByRole("list", { name: DATABANK_LIST_NAME, exact: true }).getByRole("listitem").first()],
  presets: (page): Witnesses => [page.getByRole("radiogroup", { name: PRESET_ACTIVE_RADIOGROUP_NAME, exact: true }).getByRole("radio").first()],
  refinery: (page): Witnesses => [
    page.getByRole("combobox", { name: "Start a refinery session", exact: true }),
    page.locator(".shell-content").getByRole("option").first(),
  ],
} satisfies Record<SectionId, (page: Page) => Witnesses>;

const GROUP_WITNESSES = {
  personas: (page): Witnesses => [page.getByRole("button", { name: PERSONA_NEW_NAME, exact: true })],
  appearance: (page): Witnesses => [page.getByRole("radiogroup", { name: CONFIG_THEME_GROUP_NAME, exact: true }).getByRole("radio").first()],
  "chat-behavior": (page): Witnesses => [page.getByRole("switch", { name: configSettingLabel(CHAT_MESSAGE_HANDLING_SUBCATEGORY, "enterSends"), exact: true })],
  workloads: (page): Witnesses => [
    page.getByRole("tablist", { name: WORKLOAD_FILTER_TABS_NAME, exact: true }),
    page.getByRole("button", { name: SCHEDULE_NEW_NAME }).first(),
  ],
  backup: (page): Witnesses => [
    page.getByRole("group", { name: EXPORT_INCLUDE_LEGEND, exact: true }).getByRole("checkbox").first(),
    page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }),
  ],
  connections: (page): Witnesses => [
    // The row shows the background state; its switch lives in the editor the row opens.
    page.locator('[data-slot="config-content"]').getByText(backgroundStateLabel(true), { exact: true }).first(),
    page.getByRole("combobox", { name: "Chat connection", exact: true }),
    page.getByText(SAVED_KEYS_EMPTY_TITLE, { exact: true }),
    page.getByText(SAVED_KEYS_EMPTY_DESCRIPTION, { exact: true }),
  ],
  automation: (page): Witnesses => [
    page.getByRole("textbox", { name: OWNER_RULE_RATE_FIELD_NAME, exact: true }),
    page.getByText(OWNER_RULES_INTRO, { exact: true }),
  ],
  admin: (page): Witnesses => [
    page.getByRole("textbox", { name: "Max generated-image download (MB)", exact: true }),
    page.getByRole("button", { name: "Create user", exact: true }),
    page.getByText(
      "Accounts awaiting approval can't sign in until you enable them. New sign-ins through your identity provider land here when approval is required.",
      { exact: true },
    ),
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
      page.getByRole("dialog").getByRole("group", { name: COMMAND_RECENT_THREADS_NAME, exact: true }).getByRole("option").first(),
    ],
  }),
  newChat: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("combobox", { name: NEW_CHAT_CHARACTERS_FIELD_NAME, exact: true }),
      page.getByRole("dialog").getByRole("option").first(),
    ],
  }),
  you: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [page.getByRole("dialog").getByRole("group", { name: "Account and settings", exact: true }).getByRole("button").first()],
  }),
  addDocument: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("group", { name: DATABANK_ADD_METHOD_NAME, exact: true }),
      page.getByRole("dialog").getByRole("group", { name: "Use this document in", exact: true }),
    ],
  }),
  reauth: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("textbox", { name: "Handle", exact: true }),
      page.getByRole("dialog").getByLabel("Password", { exact: true }),
    ],
  }),
  imagine: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText("Nothing to imagine.", { exact: true })] }),
  imageDetail: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText("No image selected.", { exact: true })] }),
  imageEdit: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText("No image to edit.", { exact: true })] }),
  pluginDialog: (page): ModalScenario => ({
    state: "empty",
    witnesses: [
      page.getByRole("dialog").getByText("That dialog is no longer available", { exact: true }),
      page.getByRole("dialog").getByText("Its plugin was disabled or removed while it was open.", { exact: true }),
      page.getByRole("dialog").getByRole("button", { name: "Open Plugins", exact: true }),
    ],
  }),
  pluginCommandArgs: (page): ModalScenario => ({ state: "empty", witnesses: [page.getByRole("dialog").getByText("No command selected.", { exact: true })] }),
  savedRosters: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page
        .getByRole("dialog")
        .getByRole("button", { name: /^Start a chat with / })
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
