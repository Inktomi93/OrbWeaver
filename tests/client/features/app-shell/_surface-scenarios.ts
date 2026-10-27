// The census's selected production states; witnesses are body content, never just shell or section chrome.
import type { ConfigGroupId, ModalSlotId, SectionId } from "@orb/client/state";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { Page } from "@playwright/test";

type Witnesses = SurfaceAuditRequest["witnesses"];
type Scenario = Omit<SurfaceAuditRequest, "checks" | "requireBothFormKeys">;
type ModalScenario = Pick<SurfaceAuditRequest, "state" | "witnesses">;

const SECTION_WITNESSES = {
  home: (page): Witnesses => [
    page
      .locator('[data-home-tile="chat.recents"]')
      .getByRole("button", { name: /^Resume / })
      .first(),
    page.getByRole("list", { name: "Character quick-picks", exact: true }).getByRole("listitem").first(),
    page.getByRole("list", { name: "Recent documents", exact: true }).getByRole("listitem").first(),
    page.locator('[data-home-tile="rosterPreset.rosters"]').getByRole("listitem").first(),
  ],
  chats: (page): Witnesses => [
    page.getByRole("list", { name: "Chats list", exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("button", { name: /Start a new chat/i }),
  ],
  characters: (page): Witnesses => [
    page.getByRole("list", { name: "Character library", exact: true }).getByRole("listitem").first(),
    page.locator(".shell-content").getByRole("heading", { name: "Pick up where you left off", exact: true }),
  ],
  corpus: (page): Witnesses => [
    page.getByText("Library understanding", { exact: true }),
    page
      .getByRole("list", { name: "Analysis passes", exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByText("Keywords", { exact: true }) })
      .getByText("none found", { exact: true }),
    page.getByRole("list", { name: "Model routes", exact: true }).getByRole("listitem").first(),
  ],
  config: (page): Witnesses => [
    page.locator('[data-slot="config-content"]').getByRole("radiogroup", { name: "Theme", exact: true }).getByRole("radio").first(),
    page.locator('[data-slot="config-content"]').getByRole("switch", { name: "Color quoted speech", exact: true }),
  ],
  extensions: (page): Witnesses => [
    page.locator(".shell-content").getByRole("heading", { name: /plugins? (?:is|are) waiting for your OK$/ }),
    page.locator(".shell-content").getByRole("button").first(),
  ],
  databank: (page): Witnesses => [page.getByRole("list", { name: "Documents", exact: true }).getByRole("listitem").first()],
  presets: (page): Witnesses => [page.getByRole("radiogroup", { name: "Active preset for generation", exact: true }).getByRole("radio").first()],
  refinery: (page): Witnesses => [
    page.getByRole("combobox", { name: "Start a refinery session", exact: true }),
    page.locator(".shell-content").getByRole("option").first(),
  ],
} satisfies Record<SectionId, (page: Page) => Witnesses>;

const GROUP_WITNESSES = {
  personas: (page): Witnesses => [page.getByRole("button", { name: "New persona", exact: true })],
  appearance: (page): Witnesses => [page.getByRole("radiogroup", { name: "Theme", exact: true }).getByRole("radio").first()],
  "chat-behavior": (page): Witnesses => [page.getByRole("switch", { name: "Enter to send", exact: true })],
  workloads: (page): Witnesses => [
    page.getByRole("tablist", { name: "Filter jobs", exact: true }),
    page.getByRole("button", { name: /^New schedule/ }).first(),
  ],
  backup: (page): Witnesses => [
    page.getByRole("group", { name: "Include", exact: true }).getByRole("checkbox").first(),
    page.getByRole("button", { name: "Import a folder…", exact: true }),
  ],
  connections: (page): Witnesses => [
    page.locator('[data-slot="config-content"]').getByRole("switch").first(),
    page.getByRole("combobox", { name: "Chat connection", exact: true }),
    page.getByText("No keys yet", { exact: true }),
    page.getByText("A key is saved when you add a connection that needs one.", { exact: true }),
  ],
  automation: (page): Witnesses => [
    page.getByRole("textbox", { name: "Runs per hour", exact: true }),
    page.getByText("These rules watch your library and act on their own — no chat has to be open.", { exact: true }),
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
      page.getByRole("dialog").getByRole("combobox", { name: "Command palette", exact: true }),
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
    witnesses: [page.getByRole("dialog").getByRole("group", { name: "Account and settings", exact: true }).getByRole("button").first()],
  }),
  addDocument: (page): ModalScenario => ({
    state: "loaded",
    witnesses: [
      page.getByRole("dialog").getByRole("group", { name: "How to add the document", exact: true }),
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
