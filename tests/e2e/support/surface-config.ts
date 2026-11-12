import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { LIBRARY_PAGE_SIZE_DEFAULT, LIBRARY_PAGE_SIZE_MIN } from "@orb/contracts/settings";
import { controlledPanel, diagnosticTarget } from "@orb/testkit/browser/spec";
import type { SurfaceWitnessDisposition } from "@orb/testkit/iso";
import { abortProcedure, attachNativeFile, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { LIBRARY_SETTINGS_SUBCATEGORY } from "#client/features/character/lib/library-settings-nav.ts";
import {
  CONFIG_ADVANCED_THEME_TOOLS_NAME,
  CONFIG_BACK_TO_LOOKS_NAME,
  CONFIG_CUSTOM_CSS_NAME,
  CONFIG_IMPORT_THEME_FILE_NAME,
  CONFIG_MORE_LIBRARY_ACTIONS_NAME,
  CONFIG_SEARCH_NAME,
  CONFIG_THEME_NAME_FIELD_NAME,
  CONFIG_THEME_PREVIEW_NAME,
  collectionEmptyTitle,
  collectionFilterName,
  configSearchEmptyText,
  newThemeName,
} from "#client/features/config/lib/config-control-names.ts";
import { CONFIG_SECTION_LABEL } from "#client/features/config/lib/config-copy.ts";
import { CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import { PERSONA_NAME_FIELD_NAME } from "#client/features/persona/lib/persona-copy.ts";
import {
  REGEX_FIND_PATTERN_NAME,
  REGEX_NAME_FIELD_NAME,
  REGEX_NEW_SCRIPT_NAME,
  REGEX_REPLACE_WITH_NAME,
  REGEX_RESULT_NAME,
  REGEX_SAMPLE_TEXT_NAME,
  REGEX_SCRIPT_NAME_FIELD_NAME,
  REGEX_TEXT_AFTER_STREAM_NAME,
  REGEX_TEXT_GOING_IN_NAME,
} from "#client/features/regex/lib/regex-names.ts";
import { ROSTER_NAME_FIELD_NAME } from "#client/features/roster-preset/lib/roster-names.ts";
import { ADMIN_SAVE_LABEL, adminSaveName } from "#client/features/user-admin/lib/admin-model.ts";
import { IMPORT_FOLDER_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import {
  WORLD_INFO_BOOK_DESCRIPTION_NAME,
  WORLD_INFO_BOOK_DETAILS_NAME,
  WORLD_INFO_BOOK_NAME_FIELD_NAME,
  WORLD_INFO_DEPTH_SWITCH_NAME,
  WORLD_INFO_DUPLICATE_BOOK_NOTICE,
  WORLD_INFO_EDIT_DETAILS_NAME,
  WORLD_INFO_ENTRY_CONTENT_NAME,
  WORLD_INFO_ENTRY_DEPTH_NAME,
  WORLD_INFO_ENTRY_NOTE_NAME,
  WORLD_INFO_ENTRY_PLACEMENT_NAME,
  WORLD_INFO_ENTRY_ROLE_NAME,
  WORLD_INFO_ENTRY_TITLE_NAME,
  WORLD_INFO_GROUP_LABEL,
  WORLD_INFO_IMPORT_BOOK_NAME,
  WORLD_INFO_NEW_BOOK_NAME,
  WORLD_INFO_NEW_ENTRY_NAME,
  WORLD_INFO_NO_ENTRIES_TITLE,
} from "#client/features/world-info/lib/world-info-names.ts";
import { contextPaneLabel, LIST_PANEL_NOUN, panelCloseName, panelEdgeName, sectionBackName } from "#client/lib/context-pane-names.ts";
import { contextToggleLabel } from "#client/lib/context-toggle-label.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { ADD_CONNECTION_PATH } from "#client/lib/injection-copy.ts";
import { ROW_DELETE_NAME, ROW_EXPORT_NAME } from "#client/lib/row-menu-names.ts";
import { rowActionsName } from "#client/lib/row-qualifiers.ts";
import type { ConfigGroupId } from "#client/state/config-group-ids.ts";
import { CONFIG_GROUP_IDS } from "#client/state/config-group-ids.ts";
import { ALERTS_REGION_NAME } from "../../../packages/ui/src/primitives/toast/toast-names.ts";
import { waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import type { SurfaceWalk } from "./surface-walker.ts";
import {
  controlIdentity,
  createSurfaceWalk,
  expectSubject,
  NAME_HOLE,
  namePattern,
  observe,
  openContext,
  publishWalk,
  recordAs,
  skip,
  checkpoint as walkCheckpoint,
  walkScope,
} from "./surface-walker.ts";

const APPEARANCE_PARENT_BUDGET_MS = 60_000;
const APPEARANCE_SECTION_BUDGET_MS = 120_000;
const THEME_BUILDER_BUDGET_MS = 300_000;
const THEME_BUILDER_VISIT = "Theme unminted builder/color pickers/advanced CSS/reference/preview/Back";
const CONTENT = '[data-slot="config-content"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const LIST = '[data-slot="config-list"]';
const EDITOR = '[data-slot="world-info-member-editor"]';

const CONFIG_SUBJECT_KINDS = ["category", "subsection", "disclosure", "control", "action"] as const;
type ConfigSubjectKind = (typeof CONFIG_SUBJECT_KINDS)[number];

/** Expect a Config subject under its own kind, then record what happened to it. */
function note(
  walk: SurfaceWalk,
  { id, kind }: { readonly id: string; readonly kind: ConfigSubjectKind },
  disposition: SurfaceWitnessDisposition,
  reason: string,
): void {
  recordAs(walk, { id, kind }, { disposition, reason });
}

// Config bodies also report pending saves through aria-busy, which the walker's skeleton wait does not read.
async function checkpoint(walk: SurfaceWalk, name: string, scope: Locator, witness: Locator = scope): Promise<void> {
  await expect(scope.locator('[aria-busy="true"]:visible')).toHaveCount(0);
  await walkCheckpoint(walk, `config/${name}`, scope, witness);
}

async function closeContext(flow: SurfaceFlow): Promise<void> {
  const context = flow.page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "overlay") {
    await flow.page
      .getByRole("button", { name: panelCloseName(contextPaneLabel(CONFIG_SECTION_LABEL)), exact: true })
      .or(flow.page.getByRole("button", { name: contextToggleLabel(false), exact: true }))
      .click();
  }
}

async function map(flow: SurfaceFlow): Promise<Locator> {
  await closeContext(flow);
  const list = flow.page.locator(LIST);
  const panel = flow.page.locator('.shell-panel[data-panel-side="list"]');
  // A phone's topbar Back is named for the level it pops to: a world book from an entry, the group from a member, Settings from
  // the group. Each press pops one level, so the walk climbs until the list is the screen.
  const back = flow.page.getByRole("banner").getByRole("button", { name: namePattern(sectionBackName(NAME_HOLE)) });
  while ((await panel.getAttribute("data-panel-mode")) === "collapsed" && (await back.isVisible())) {
    await back.click();
  }
  const show = flow.page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  if ((await panel.getAttribute("data-panel-mode")) === "collapsed") {
    await show.click();
  }
  await expect(panel).not.toHaveAttribute("data-panel-mode", "collapsed");
  await expect(panel).not.toHaveAttribute("aria-hidden", "true");
  await expect(list).toBeVisible();
  return list;
}

async function category(flow: SurfaceFlow, id: ConfigGroupId): Promise<Locator> {
  const list = await map(flow);
  const group = list.locator(`[data-slot="config-group"][data-config-group="${id}"]`);
  const band = group.locator('[data-slot="config-band"]');
  await band.scrollIntoViewIfNeeded();
  const label = await band.locator('[data-slot="band-label"]').textContent();
  if (label === null) {
    throw new Error(`Config band ${id} did not render its canonical label`);
  }
  const collection = (await group.getAttribute("data-collection")) !== null;
  await flow.action(`config-open-${id}`, {
    action: async (): Promise<void> => {
      await band.click();
    },
    ready: async (): Promise<void> => {
      const content = flow.page.locator(CONTENT);
      await expect(content).toHaveAccessibleName(collection ? CONFIG_SECTION_LABEL : `${label.trim()} settings`);
      await expect(content).toBeVisible();
      if (collection) {
        const landing = content.locator(`[data-slot="config-collection-landing"][data-collection="${id}"]`);
        await landing.getByRole("heading", { name: label.trim(), exact: true }).waitFor({ state: "visible" });
      }
    },
  });
  return group;
}

async function folderChooser(flow: SurfaceWalk, name: string, element: Locator, trigger: Locator): Promise<void> {
  const key = await controlIdentity(element);
  await expect(trigger).toHaveAccessibleName(IMPORT_FOLDER_NAME);
  const chooser = flow.page.waitForEvent("filechooser");
  await trigger.click();
  const input = (await chooser).element();
  expect(await input.evaluate(diagnosticTarget)).toBe(key);
  await expect(element).toHaveAttribute("hidden", "");
  await expect(element).toHaveAttribute("webkitdirectory", "");
  note(
    flow,
    { id: key, kind: "control" },
    "not-applicable",
    "Hidden transport is reached through its witnessed visible FolderPicker button, not a user-facing control.",
  );
  note(
    flow,
    { id: `${name}/open-native-folder-chooser`, kind: "action" },
    "visited",
    "The actual visible trigger emitted its matching native directory chooser; no files were supplied or imported.",
  );
}

/** Every visible folder picker under `scope` emits its own hidden directory chooser. */
async function folderChoosers(flow: SurfaceWalk, name: string, scope: Locator): Promise<void> {
  for (const element of await scope.locator('input[hidden][type="file"][webkitdirectory]').all()) {
    const trigger = element.locator("xpath=preceding-sibling::button[1]");
    if (await trigger.isVisible()) {
      await folderChooser(flow, name, element, trigger);
    }
  }
}

async function themeBuilder(flow: SurfaceWalk): Promise<string> {
  await category(flow, "appearance");
  const content = flow.page.locator(CONTENT);
  const before = (await flow.client.settings.listThemes.query()).map(({ id }) => id);
  await content.getByRole("button", { name: namePattern(newThemeName(undefined), newThemeName(NAME_HOLE)) }).click();
  const title = content.getByRole("textbox", { name: CONFIG_THEME_NAME_FIELD_NAME, exact: true });
  await expect(title).toBeVisible();
  const editor = title.locator("xpath=ancestor::section[1]");
  await expect(editor).toHaveCount(1);
  const target = await controlIdentity(editor);
  await checkpoint(flow, "theme-unminted-editor", editor, title);
  await content.getByRole("button", { name: CONFIG_ADVANCED_THEME_TOOLS_NAME, exact: true }).click();
  await expect(content.getByRole("heading", { name: CONFIG_CUSTOM_CSS_NAME, exact: true })).toBeVisible();
  await expect(content.getByRole("heading", { name: CONFIG_THEME_PREVIEW_NAME, exact: true })).toBeVisible();
  // The walk opens each color picker as a dialog door and dismisses it, so nothing mints the theme.
  await walkScope(flow, editor, "config/theme-builder");
  await content.getByRole("button", { name: CONFIG_BACK_TO_LOOKS_NAME, exact: true }).click();
  expect((await flow.client.settings.listThemes.query()).map(({ id }) => id)).toEqual(before);
  note(flow, { id: THEME_BUILDER_VISIT, kind: "action" }, "visited", "No fields changed; production mint-on-first-edit leaves no new theme.");
  return target;
}

async function connectionAuthoring(flow: SurfaceWalk): Promise<void> {
  await category(flow, "connections");
  const content = flow.page.locator(CONTENT);
  await content.getByRole("button", { name: ADD_CONNECTION_PATH.leaf, exact: true }).click();
  const dialog = flow.page.getByRole("dialog");
  const provider = dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true });
  await expect(provider).toBeVisible();
  await checkpoint(flow, "add-connection-empty-draft", dialog, provider);
  await provider.click();
  const catalog = await controlledPanel(provider);
  await checkpoint(flow, "add-connection-provider-roster", catalog);
  await attachNativeFile(flow.info, flow.info, "config-provider-options", { body: await catalog.ariaSnapshot(), contentType: "text/plain" });
  await flow.page.keyboard.press("Escape");
  await expect(catalog).toBeHidden();
  await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(dialog).toBeHidden();
  note(
    flow,
    { id: "Connections Add connection/provider roster/Cancel", kind: "action" },
    "visited",
    "The empty draft and provider roster rendered; Cancel left no connection.",
  );
  note(
    flow,
    { id: "Connections List models, Check sign-in, submit connection/key, role rebinding/reindex, saved-key replace/revoke", kind: "action" },
    "excluded",
    "No live provider contact, credential mutation, paid execution, or original role/index changes. Provider choices are inspected without selection or submission.",
  );
}

async function personas(flow: SurfaceWalk): Promise<void> {
  await category(flow, "personas");
  const content = flow.page.locator(CONTENT);
  const rows = await flow.client.persona.list.query();
  const index = rows.findIndex((candidate) => flow.run.subjects.personas.some(({ id }) => id === candidate.id));
  const original = rows[index];
  if (original === undefined) {
    skip(flow, "Original persona editor", "no-subject", "No original persona in source provenance; no synthetic identity is represented as original evidence.");
    return;
  }
  const expanders = content.locator('[data-persona-row] [data-slot="list-row-body"]');
  await expect(expanders).toHaveCount(rows.length);
  const expand = expanders.nth(index);
  if ((await expand.getAttribute("aria-expanded")) !== "true") {
    await expand.click();
  }
  const editor = content.getByRole("group").filter({ has: flow.page.locator('[data-slot="persona-editor-identity"]') });
  await expect(editor.getByRole("textbox", { name: PERSONA_NAME_FIELD_NAME, exact: true })).toHaveValue(original.name);
  await walkScope(flow, editor, "config/persona-original-editor");
  await teacher(flow, "persona-original");
  note(
    flow,
    { id: "Original persona editor/placement/world-book catalog/connected-character picker", kind: "action" },
    "visited",
    "One provenance-owned persona sampled; description, placement and junctions remain unchanged.",
  );
  note(
    flow,
    { id: "Original persona favorite/default/delete/avatar/description/placement/world-book/connect/disconnect", kind: "action" },
    "excluded",
    "Original identity and attachments stay read-only; no account-default or relationship changes.",
  );
}

// Config's own fold and row disclosures are plain aria-expanded buttons, which the walker's collapsible walk does not open.
const CONFIG_DISCLOSURE = 'button[aria-expanded="false"]:not([aria-haspopup])';
const PERSONA_ROW_BODY = '[data-persona-row] [data-slot="list-row-body"]';

async function remainingDisclosures(flow: SurfaceWalk, name: string, scope: Locator, seen: ReadonlySet<string>): Promise<void> {
  for (const button of await scope.locator(CONFIG_DISCLOSURE).all()) {
    const target = await controlIdentity(button);
    if (seen.has(target)) {
      continue;
    }
    if ((await button.locator("xpath=ancestor::*[@data-persona-row]").count()) > 0) {
      note(
        flow,
        { id: target, kind: "disclosure" },
        "excluded",
        "Original persona rows use the separately named provenance-bounded sample, not an unbounded owner-data walk.",
      );
    } else {
      note(
        flow,
        { id: target, kind: "disclosure" },
        "unvisited",
        `${name}: closed disclosure was hidden or disabled when traversal ended; it is not counted complete.`,
      );
    }
  }
}

async function disclosures(flow: SurfaceWalk, name: string, scope: Locator): Promise<void> {
  const seen = new Set<string>();
  for (;;) {
    let next: Locator | undefined;
    for (const button of await scope.locator(`${CONFIG_DISCLOSURE}:not(${PERSONA_ROW_BODY})`).all()) {
      const key = await controlIdentity(button);
      if (!seen.has(key) && (await button.isVisible()) && (await button.isEnabled())) {
        seen.add(key);
        next = flow.page.locator(key);
        break;
      }
    }
    if (next === undefined) {
      await remainingDisclosures(flow, name, scope, seen);
      return;
    }
    const target = await controlIdentity(next);
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(next).toHaveAttribute("aria-expanded", "true");
    await checkpoint(flow, `${name}/disclosure-${String(seen.size)}`, scope, next);
    // It stays open, so the walk of the whole scope that follows reads its body once rather than once per disclosure.
    note(flow, { id: target, kind: "disclosure" }, "visited", `${name}: opened and left open for the scope walk`);
  }
}

async function teacher(flow: SurfaceWalk, name: string): Promise<void> {
  const context = flow.page.locator(CONTEXT);
  await openContext(flow);
  await expect(context.locator('[data-slot="teacher-about"], [data-slot="teacher-roster"], [role="tab"]').first()).toBeVisible();
  // The walk steps the teacher's tabs itself; a single About body renders without a tab strip.
  await walkScope(flow, context, `config/${name}/teacher`);
  await closeContext(flow);
}

async function groupDetails(flow: SurfaceWalk, id: ConfigGroupId): Promise<void> {
  if (id === "connections") {
    await connectionAuthoring(flow);
  } else if (id === "personas") {
    await personas(flow);
  } else if (id === "admin") {
    await sameLabelCensusControl(flow);
  }
}

// Each Admin section's Save names its section but shows the same visible label, so the census must still tell them apart by structure.
async function sameLabelCensusControl(flow: SurfaceWalk): Promise<void> {
  const saveName = namePattern(adminSaveName(ADMIN_SAVE_LABEL, NAME_HOLE));
  const saves = flow.page.locator(CONTENT).getByRole("button", { name: saveName });
  const buttons = await saves.all();
  expect(buttons.length, "The actual Admin sections must supply repeated Save controls for this census control").toBeGreaterThanOrEqual(2);
  const targets: string[] = [];
  for (const button of buttons) {
    expect(await button.evaluate((node) => node.id), "This positive control must exercise id-less production buttons").toBe("");
    await expect(button).toHaveText(ADMIN_SAVE_LABEL);
    targets.push(await controlIdentity(button));
  }
  expect(new Set(targets).size, "The actual same-label controls must not coalesce in the census Set").toBe(buttons.length);
  for (const target of targets) {
    const resolved = flow.page.locator(target);
    await expect(resolved).toHaveCount(1);
    await expect(resolved).toHaveAccessibleName(saveName);
  }
  await attachNativeFile(flow.info, flow.info, "config-same-label-structural-census-control", {
    body: JSON.stringify({ count: buttons.length, targets }),
    contentType: "application/json",
  });
  note(
    flow,
    { id: "Actual Admin id-less same-label Save controls retain distinct census targets", kind: "control" },
    "visited",
    "No Save was activated; each maintained structural target resolves to exactly one real production control.",
  );
}

async function collectionDetails(flow: SurfaceWalk, id: ConfigGroupId): Promise<void> {
  if (id === "worldInfo") {
    await worldInfo(flow);
  } else if (id === "regex") {
    await regex(flow);
  } else if (id === "rosterPreset") {
    await rosterJourney(flow);
  } else {
    throw new Error(`Registered collection ${id} has no member journey; its landing is not coverage`);
  }
}

async function themeFileChooser(flow: SurfaceWalk, section: Locator): Promise<void> {
  const trigger = section.getByRole("button", { name: CONFIG_IMPORT_THEME_FILE_NAME, exact: true });
  const transport = section.locator('input[data-slot="file-trigger-input"]');
  await expect(transport).toHaveCount(1);
  await expect(transport).toHaveAttribute("aria-hidden", "true");
  await expect(transport).toHaveAttribute("tabindex", "-1");
  await expect(trigger).toBeVisible();
  const target = await controlIdentity(transport);
  const chooser = flow.page.waitForEvent("filechooser");
  await trigger.click();
  const input = (await chooser).element();
  expect(await input.evaluate(diagnosticTarget)).toBe(target);
  note(
    flow,
    { id: target, kind: "control" },
    "not-applicable",
    "The sr-only aria-hidden non-tabstop FileTrigger input is the exact transport emitted by its witnessed visible theme import button.",
  );
  note(
    flow,
    { id: "Open actual theme import file chooser", kind: "action" },
    "visited",
    "The actual visible trigger emitted its matching native file chooser; no file was supplied and no import is claimed.",
  );
}

async function appearanceJourney(flow: SurfaceWalk, names: readonly string[]): Promise<void> {
  const sectionBudgetMs = budget(APPEARANCE_SECTION_BUDGET_MS);
  const builderBudgetMs = budget(THEME_BUILDER_BUDGET_MS);
  const parentBudgetMs = budget(APPEARANCE_PARENT_BUDGET_MS);
  const categoryBudgetMs = parentBudgetMs + names.length * sectionBudgetMs + builderBudgetMs;
  // This family is open: every runtime-contributed section adds a bounded subjourney, not a copied test registry.
  flow.info.setTimeout(categoryBudgetMs);
  await attachNativeFile(flow.info, flow.info, "config-appearance-runtime-scope-budget", {
    body: JSON.stringify({ names, sectionBudgetMs, builderBudgetMs, parentBudgetMs, categoryBudgetMs }),
    contentType: "application/json",
  });
  expectSubject(flow, THEME_BUILDER_VISIT, "action");
  for (const label of names) {
    await test.step(
      `Appearance section: ${label}`,
      async (): Promise<void> => {
        const startedAt = performance.now();
        const list = await map(flow);
        const group = list.locator('[data-slot="config-group"][data-config-group="appearance"]');
        const row = group.getByRole("button", { name: label, exact: true }).and(group.locator('[data-slot="list-row-body"]'));
        const heading = await row.locator('xpath=ancestor::*[@data-slot="list-row-root"][1]').locator('[data-slot="list-row-full-title"]').textContent();
        if (heading === null) {
          throw new Error(`${label} lost its registry-supplied full section name`);
        }
        await row.scrollIntoViewIfNeeded();
        await row.click();
        const content = flow.page.locator(CONTENT);
        const title = content.getByRole("heading", { name: heading, exact: true });
        const section = title.locator("xpath=ancestor::section[1]");
        await expect(section).toHaveCount(1);
        await expect(section).toBeVisible();
        await flow.requestPanes();
        await checkpoint(flow, `appearance-${label}-landing`, section, title);
        if ((await section.getByRole("button", { name: CONFIG_IMPORT_THEME_FILE_NAME, exact: true }).count()) > 0) {
          await themeFileChooser(flow, section);
        }
        await disclosures(flow, `appearance-${label}`, section);
        await walkScope(flow, section, `config/appearance/${label}`);
        await teacher(flow, `appearance-${label}`);
        note(flow, { id: `appearance: ${label}`, kind: "subsection" }, "visited", "The registry-named section landed and its body was walked");
        await attachNativeFile(flow.info, flow.info, `config-appearance-${label}-phase-cost`, {
          body: JSON.stringify({ label, scope: await controlIdentity(section), budgetMs: sectionBudgetMs, elapsedMs: performance.now() - startedAt }),
          contentType: "application/json",
        });
      },
      { timeout: sectionBudgetMs },
    );
  }
  await test.step(
    "Appearance Looks builder leaf",
    async (): Promise<void> => {
      const startedAt = performance.now();
      const scope = await themeBuilder(flow);
      await attachNativeFile(flow.info, flow.info, "config-appearance-builder-phase-cost", {
        body: JSON.stringify({ scope, budgetMs: builderBudgetMs, elapsedMs: performance.now() - startedAt }),
        contentType: "application/json",
      });
    },
    { timeout: builderBudgetMs },
  );
  await test.step(
    "Appearance parent navigation and teaching",
    async (): Promise<void> => {
      const startedAt = performance.now();
      const list = await map(flow);
      const group = list.locator('[data-slot="config-group"][data-config-group="appearance"]');
      const actual = await group.locator('[data-slot="list-row-body"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")));
      expect(actual, "The runtime section union must retain every registered Appearance navigation row").toEqual(names);
      const folds = group.locator('[data-slot="config-fold-rows"]');
      const foldNames = await folds.evaluateAll((nodes) =>
        nodes.map((node) => document.getElementById(node.getAttribute("aria-labelledby") ?? "")?.textContent),
      );
      await category(flow, "appearance");
      const content = flow.page.locator(CONTENT);
      for (const label of foldNames) {
        if (label === undefined) {
          throw new Error("Appearance fold lost its production navigation label");
        }
        const trigger = content.locator("button[aria-expanded]:not([aria-haspopup])").filter({ hasText: label });
        await expect(trigger).toHaveCount(1);
        await trigger.scrollIntoViewIfNeeded();
        if ((await trigger.getAttribute("aria-expanded")) === "true") {
          await trigger.click();
        }
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await checkpoint(flow, "appearance-parent-fold", content, trigger);
        note(flow, { id: `appearance: ${label}`, kind: "disclosure" }, "visited", "The fold reopened from its production navigation label");
      }
      await teacher(flow, "appearance-parent");
      note(flow, { id: "appearance", kind: "category" }, "visited", "Every registered section, the Looks builder and the parent folds were walked");
      await attachNativeFile(flow.info, flow.info, "config-appearance-parent-phase-cost", {
        body: JSON.stringify({ scope: CONTENT, budgetMs: parentBudgetMs, elapsedMs: performance.now() - startedAt }),
        contentType: "application/json",
      });
    },
    { timeout: parentBudgetMs },
  );
}

async function groupJourney(flow: SurfaceWalk, id: ConfigGroupId): Promise<void> {
  const group = await category(flow, id);
  const rows = group.locator('[data-slot="list-row-body"]');
  const names: string[] = [];
  for (const row of await rows.all()) {
    const label = await row.getAttribute("aria-label");
    if (label === null) {
      throw new Error(`Config subsection in ${id} has no production accessible name`);
    }
    names.push(label);
    expectSubject(flow, `${id}: ${label}`, "subsection");
  }
  if (id === "appearance") {
    await appearanceJourney(flow, names);
    return;
  }
  const content = flow.page.locator(CONTENT);
  // The content pane stacks every section of the group, so it is walked once; each row only proves its landing.
  for (const label of names) {
    const list = await map(flow);
    const currentGroup = list.locator(`[data-slot="config-group"][data-config-group="${id}"]`);
    const row = currentGroup.getByRole("button", { name: label, exact: true }).and(currentGroup.locator('[data-slot="list-row-body"]'));
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(content).toBeVisible();
    await flow.requestPanes();
    await checkpoint(flow, `${id}-${label}-landing`, content);
    await teacher(flow, `${id}-${label}`);
  }
  await disclosures(flow, id, content);
  await walkScope(flow, content, `config/${id}`);
  await folderChoosers(flow, id, content);
  for (const label of names) {
    note(flow, { id: `${id}: ${label}`, kind: "subsection" }, "visited", "The row landed on its section and the group's content was walked");
  }
  await groupDetails(flow, id);
  if ((await group.getAttribute("data-collection")) !== null) {
    await collectionDetails(flow, id);
  }
  note(flow, { id, kind: "category" }, "visited", "Every subsection landed and the group's content and teaching were walked");
}

async function regex(flow: SurfaceWalk): Promise<void> {
  const name = `Surface regex ${flow.pass} ${flow.ids.uuid()}`;
  try {
    await category(flow, "regex");
    const content = flow.page.locator(CONTENT);
    await content.getByRole("button", { name: REGEX_NEW_SCRIPT_NAME, exact: true }).click();
    const create = content.getByRole("form", { name: REGEX_NEW_SCRIPT_NAME, exact: true });
    await create.getByRole("textbox", { name: REGEX_SCRIPT_NAME_FIELD_NAME, exact: true }).fill(name);
    await create.getByRole("button", { name: DIALOG_VERBS.create, exact: true }).click();
    const editor = content.locator('[data-slot="regex-member-editor"]');
    await expect(editor.getByRole("textbox", { name: REGEX_NAME_FIELD_NAME, exact: true })).toHaveValue(name);
    await editor.getByRole("textbox", { name: REGEX_FIND_PATTERN_NAME, exact: true }).fill("/surface/g");
    await editor.getByRole("textbox", { name: REGEX_REPLACE_WITH_NAME, exact: true }).fill("walk");
    await expect
      .poll(async () => (await flow.client.regex.listScripts.query()).find((script) => script.name === name))
      .toMatchObject({ findRegex: "/surface/g", replaceString: "walk" });
    await editor.getByRole("textbox", { name: REGEX_SAMPLE_TEXT_NAME, exact: true }).fill("surface surface");
    await expect(editor.getByRole("textbox", { name: REGEX_RESULT_NAME, exact: true })).toHaveValue("walk walk");
    await editor.getByRole("textbox", { name: REGEX_TEXT_GOING_IN_NAME, exact: true }).fill("surface surface");
    await expect(editor.getByRole("textbox", { name: REGEX_TEXT_AFTER_STREAM_NAME, exact: true })).toBeVisible();
    await walkScope(flow, content, "config/regex-editor-and-real-testers");
    await teacher(flow, "regex-member-scopes");
    note(
      flow,
      { id: "Regex disposable create/autosave/real-engine sample and pipeline", kind: "action" },
      "visited",
      "The created script autosaved and both testers ran the real engine",
    );
  } finally {
    for (const script of (await flow.client.regex.listScripts.query()).filter((candidate) => candidate.name === name)) {
      await flow.client.regex.removeScript.mutate({ scriptId: script.id });
    }
  }
}

async function rosterJourney(flow: SurfaceWalk): Promise<void> {
  const original = (await flow.client.rosterPreset.list.query()).find((candidate) => flow.run.subjects.rosters.some(({ id }) => id === candidate.id));
  if (original === undefined) {
    skip(
      flow,
      "Roster original member editor",
      "no-subject",
      "No original owned roster in the source provenance; landing is not presented as member coverage.",
    );
    return;
  }
  await category(flow, "rosterPreset");
  const content = flow.page.locator(CONTENT);
  await content.locator('[data-slot="collection-control-row"]').getByRole("textbox").fill(original.name);
  await content.getByRole("button", { name: original.name, exact: true }).click();
  const editor = content.locator('[data-slot="roster-member-editor"]');
  await expect(editor.getByRole("textbox", { name: ROSTER_NAME_FIELD_NAME, exact: true })).toHaveValue(original.name);
  await walkScope(flow, content, "config/roster-original-member-seats-rules");
  await teacher(flow, "roster-original-teaching");
  note(
    flow,
    { id: "Roster original member seats/rules/campaign/teaching", kind: "action" },
    "visited",
    "The original roster's editor and teaching were walked read-only",
  );
  note(
    flow,
    { id: "Roster Start chat, Save, RPG campaign, Delete original", kind: "action" },
    "excluded",
    "Original source subject is read-only; this journey does not create a room or replace its stored cast/rules.",
  );
}

async function originalEntry(flow: SurfaceWalk, editor: Locator, title: string): Promise<void> {
  await editor.getByText(title, { exact: true }).click();
  await expect(editor.getByRole("textbox", { name: WORLD_INFO_ENTRY_TITLE_NAME, exact: true })).toHaveValue(title);
  await walkScope(flow, flow.page.locator(CONTENT), "config/world-info-original-entry");
}

async function openBook(flow: SurfaceWalk, name: string): Promise<Locator> {
  await category(flow, "worldInfo");
  const content = flow.page.locator(CONTENT);
  await content.getByRole("textbox", { name: collectionFilterName(WORLD_INFO_GROUP_LABEL), exact: true }).fill(name);
  await content.getByRole("button", { name, exact: true }).click();
  const editor = content.locator(EDITOR);
  await expect(editor.getByRole("heading", { name, exact: true })).toBeVisible();
  return editor;
}

async function worldInfo(flow: SurfaceWalk): Promise<void> {
  const originals = (await flow.client.worldInfo.listBooks.query()).filter((book) => flow.run.subjects.worldBooks.some(({ id }) => id === book.id));
  const original = originals[0];
  if (original !== undefined) {
    const editor = await openBook(flow, original.name);
    await walkScope(flow, flow.page.locator(CONTENT), "config/world-info-original-book");
    await teacher(flow, "world-info-original-attachments");
    const entries = await flow.client.worldInfo.listEntries.query({ bookId: original.id });
    const entry = entries[0];
    if (entry !== undefined) {
      await originalEntry(flow, editor, entry.title);
    }
  } else {
    skip(
      flow,
      "World Info original source book/entry",
      "no-subject",
      "Provenance contains no original owned world book; no synthetic book is presented as original evidence.",
    );
  }

  const name = `Surface ${flow.pass} ${flow.ids.uuid()}`;
  try {
    await category(flow, "worldInfo");
    const content = flow.page.locator(CONTENT);
    await content.getByRole("button", { name: WORLD_INFO_NEW_BOOK_NAME, exact: true }).click();
    const create = content.getByRole("form", { name: WORLD_INFO_NEW_BOOK_NAME, exact: true });
    await create.getByRole("textbox", { name: WORLD_INFO_BOOK_NAME_FIELD_NAME, exact: true }).fill(name);
    await checkpoint(flow, "world-info-create-controls", create);
    await create.getByRole("button", { name: DIALOG_VERBS.create, exact: true }).click();
    const editor = content.locator(EDITOR);
    await expect(editor.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(editor.getByText(WORLD_INFO_NO_ENTRIES_TITLE, { exact: true })).toBeVisible();
    await flow.checkpoint({
      name: "config-world-info-empty-book",
      scope: editor,
      witnesses: [editor.getByText(WORLD_INFO_NO_ENTRIES_TITLE, { exact: true })],
      state: "empty",
      checks: SURFACE_CHECKS,
    });
    const verbs = editor.locator('[data-slot="config-member-verbs"], [data-slot="config-drill-header"]');
    await verbs.getByRole("button", { name: WORLD_INFO_EDIT_DETAILS_NAME, exact: true }).click();
    const details = flow.page.getByRole("dialog", { name: WORLD_INFO_BOOK_DETAILS_NAME, exact: true });
    const description = "Disposable native surface-walk book";
    await details.getByRole("textbox", { name: WORLD_INFO_BOOK_DESCRIPTION_NAME, exact: true }).fill(description);
    await checkpoint(flow, "world-info-details", details);
    await details.getByRole("button", { name: DIALOG_VERBS.save, exact: true }).click();
    await expect(editor.getByText(description, { exact: true })).toBeVisible();
    await verbs.getByRole("button", { name: WORLD_INFO_NEW_ENTRY_NAME, exact: true }).click();
    const title = editor.getByRole("textbox", { name: WORLD_INFO_ENTRY_TITLE_NAME, exact: true });
    const entryName = `${name} entry`;
    await title.fill(entryName);
    await editor.getByRole("textbox", { name: WORLD_INFO_ENTRY_CONTENT_NAME, exact: true }).fill("Disposable lore, never attached to an original subject.");
    await editor.getByRole("textbox", { name: WORLD_INFO_ENTRY_NOTE_NAME, exact: true }).fill("Native entry autosave readback");
    const book = (await flow.client.worldInfo.listBooks.query()).find((candidate) => candidate.name === name);
    if (book === undefined) {
      throw new Error("The UI-created world book was not persisted");
    }
    await expect
      .poll(async () => (await flow.client.worldInfo.listEntries.query({ bookId: book.id }))[0])
      .toMatchObject({
        title: entryName,
        content: "Disposable lore, never attached to an original subject.",
        description: "Native entry autosave readback",
      });
    const injection = editor.getByRole("switch", { name: WORLD_INFO_DEPTH_SWITCH_NAME, exact: true });
    await injection.click();
    await expect(editor.getByRole("textbox", { name: WORLD_INFO_ENTRY_DEPTH_NAME, exact: true })).toBeVisible();
    await expect(editor.getByRole("combobox", { name: WORLD_INFO_ENTRY_ROLE_NAME, exact: true })).toBeVisible();
    await walkScope(flow, content, "config/world-info-disposable-entry-injection");
    await injection.click();
    await expect(editor.getByRole("combobox", { name: WORLD_INFO_ENTRY_PLACEMENT_NAME, exact: true })).toBeVisible();
    await walkScope(flow, content, "config/world-info-disposable-entry-placement");
    await editor.getByRole("button", { name: `Delete ${entryName}`, exact: true }).click();
    const confirmation = flow.page.getByRole("alertdialog");
    await checkpoint(flow, "world-info-delete-entry-confirmation", confirmation);
    await confirmation.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
    await expect(editor.getByText(WORLD_INFO_NO_ENTRIES_TITLE, { exact: true })).toBeVisible();
    await expect.poll(async () => (await flow.client.worldInfo.listEntries.query({ bookId: book.id })).length).toBe(0);
    await category(flow, "worldInfo");
    await content.getByRole("textbox", { name: collectionFilterName(WORLD_INFO_GROUP_LABEL), exact: true }).fill(name);
    const actions = content.getByRole("button", { name: rowActionsName(name), exact: true });
    await actions.focus();
    await actions.press("Enter");
    const menu = flow.page.getByRole("menu");
    const download = flow.page.waitForEvent("download");
    await menu.getByRole("menuitem", { name: ROW_EXPORT_NAME, exact: true }).click();
    const exported = await download;
    const path = join(flow.run.runRoot, `world-info-${flow.pass}-${basename(exported.suggestedFilename())}`);
    await exported.saveAs(path);
    expect(await exported.failure()).toBeNull();
    expect((await stat(path)).size).toBeGreaterThan(0);
    await flow.info.attach("config-world-info-native-export", { path });
    await content.getByRole("button", { name: CONFIG_MORE_LIBRARY_ACTIONS_NAME, exact: true }).click();
    const chooser = flow.page.waitForEvent("filechooser");
    await flow.page.getByRole("menuitem", { name: WORLD_INFO_IMPORT_BOOK_NAME, exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(
      flow.page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByText(WORLD_INFO_DUPLICATE_BOOK_NOTICE, { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await flow.client.worldInfo.listBooks.query()).filter((candidate) => candidate.name === name).length).toBe(1);
    note(
      flow,
      { id: "World Info disposable create/details/autosave/injection/delete/export/native file reimport dedup", kind: "action" },
      "visited",
      "Every step read back from the server; the reimport was refused as a duplicate",
    );
  } finally {
    for (const book of (await flow.client.worldInfo.listBooks.query()).filter((candidate) => candidate.name === name)) {
      await flow.client.worldInfo.removeBook.mutate({ bookId: book.id });
    }
  }
}

async function librarySetting(flow: SurfaceWalk): Promise<void> {
  const original = (await flow.client.settings.getUserSettings.query()).config.library.pageSize;
  const next = original === LIBRARY_PAGE_SIZE_MIN ? LIBRARY_PAGE_SIZE_DEFAULT : LIBRARY_PAGE_SIZE_MIN;
  const setting = LIBRARY_SETTINGS_SUBCATEGORY.settings?.find((candidate) => candidate.id === "rows-per-page");
  if (setting === undefined) {
    throw new Error("The production Library setting no longer exists; update its native journey disposition");
  }
  try {
    await category(flow, "appearance");
    const list = await map(flow);
    await list
      .locator('[data-slot="config-group"][data-config-group="appearance"]')
      .getByRole("button", { name: LIBRARY_SETTINGS_SUBCATEGORY.label, exact: true })
      .click();
    const content = flow.page.locator(CONTENT);
    const field = content.getByRole("textbox", { name: setting.label, exact: true });
    await field.fill(String(next));
    await field.press("Tab");
    await expect.poll(async () => (await flow.client.settings.getUserSettings.query()).config.library.pageSize).toBe(next);
    await expect(field).toHaveValue(String(next));
    await checkpoint(flow, "library-setting-changed", content, field);
    await field.fill(String(original));
    await field.press("Tab");
    await expect.poll(async () => (await flow.client.settings.getUserSettings.query()).config.library.pageSize).toBe(original);
    await expect(field).toHaveValue(String(original));
    note(
      flow,
      { id: "Rows per page native change/readback/native restore", kind: "action" },
      "visited",
      "The change and its restore both read back from the server",
    );
  } finally {
    await flow.client.settings.updateUserSettingsSection.mutate({ section: "library", patch: { pageSize: original } });
  }
}

async function worldInfoRecovery(flow: SurfaceWalk): Promise<void> {
  const lift = await abortProcedure(flow.page, "worldInfo.countBooks");
  try {
    await flow.page.goto("/config?to=worldInfo");
    await waitForAppReady(flow.page);
    const content = flow.page.locator(CONTENT);
    const retry = content.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
    await expect(retry).toBeVisible();
    await flow.checkpoint({ name: "config-world-info-real-read-failure", scope: content, witnesses: [retry], state: "error", checks: SURFACE_CHECKS });
    await lift();
    await retry.focus();
    await retry.press("Enter");
    const count = await flow.client.worldInfo.countBooks.query();
    const witness =
      count === 0
        ? content.getByText(collectionEmptyTitle(WORLD_INFO_GROUP_LABEL), { exact: true })
        : content.getByRole("textbox", { name: collectionFilterName(WORLD_INFO_GROUP_LABEL), exact: true });
    await flow.checkpoint({
      name: "config-world-info-read-recovered",
      scope: content,
      witnesses: [witness],
      state: count === 0 ? "empty" : "loaded",
      checks: SURFACE_CHECKS,
    });
    note(
      flow,
      { id: "World Info aborted real census read/keyboard Retry/recovered library", kind: "action" },
      "visited",
      "The aborted read showed Retry and the keyboard recovered it",
    );
  } finally {
    await lift();
  }
}

async function configCase(input: SurfaceFlow, name: string, operation: (walk: SurfaceWalk) => Promise<void>): Promise<void> {
  const walk = createSurfaceWalk(input, [{ id: name, kind: "action" }]);
  try {
    await walk.page.goto("/config");
    await waitForAppReady(walk.page);
    await operation(walk);
    observe(walk, name, "visited", "Independent native Config case completed; nested omissions retain their own dispositions");
  } catch (error) {
    observe(walk, name, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await attachNativeFile(walk.info, walk.info, "config-itinerary", {
      body: JSON.stringify({ name, registeredCategories: CONFIG_GROUP_IDS, observations: walk.observations }, null, 2),
      contentType: "application/json",
    });
    await publishWalk(walk, `Config ${name}`);
  }
}

/** Traverse the canonical Settings map and search recovery independently of category editors. */
export async function walkConfigMap(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "map-search", async (walk): Promise<void> => {
    for (const id of CONFIG_GROUP_IDS) {
      expectSubject(walk, `map: ${id}`, "control");
    }
    const list = await map(walk);
    const actual = await list.locator('[data-slot="config-group"]').evaluateAll((groups) => groups.map((group) => group.getAttribute("data-config-group")));
    expect(
      actual.toSorted((left, right) => String(left).localeCompare(String(right))),
      "The owner must reach every registered production Config category",
    ).toEqual(CONFIG_GROUP_IDS.toSorted((left, right) => left.localeCompare(right)));
    for (const id of CONFIG_GROUP_IDS) {
      note(walk, { id: `map: ${id}`, kind: "control" }, "observed", "The registered category renders its band on the map");
    }
    await checkpoint(walk, "map", list, list.getByRole("combobox", { name: CONFIG_SEARCH_NAME, exact: true }));
    const search = list.getByRole("combobox", { name: CONFIG_SEARCH_NAME, exact: true });
    const miss = "surface-walk-no-matching-setting";
    await search.fill(miss);
    const empty = list.getByRole("status").filter({ hasText: configSearchEmptyText(miss) });
    await expect(empty).toBeVisible();
    await walk.checkpoint({ name: "config-search-empty", scope: list, witnesses: [empty], state: "empty", checks: SURFACE_CHECKS });
    await search.fill("");
    await expect(list.locator('[data-slot="config-group"]')).toHaveCount(CONFIG_GROUP_IDS.length);
  });
}

/** Traverse one actual registered category; another category's failure cannot hide it. */
export async function walkConfigCategory(flow: SurfaceFlow, id: ConfigGroupId): Promise<void> {
  await configCase(flow, `category-${id}`, async (walk): Promise<void> => {
    expectSubject(walk, id, "category");
    await groupJourney(walk, id);
  });
}

/** Exercise a real failed read and keyboard Retry without depending on another category case. */
export async function walkConfigRecovery(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "read-recovery", worldInfoRecovery);
}

/** Change, read back and restore the named user setting in its own native case. */
export async function walkConfigSettings(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "reversible-setting", librarySetting);
}
