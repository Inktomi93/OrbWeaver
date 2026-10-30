import { readFile } from "node:fs/promises";
import { ALSO_OPEN_TILE_ID, CHAT_RECENTS_TILE_ID, HOME_JUMP_TILE_ID, HOME_TILE_IDS, QUICK_PICKS_TILE_ID, ROSTERS_TILE_ID } from "@orb/client/state";
import { HOME_QUICK_PICKS_LIMIT } from "@orb/contracts/character";
import type { StartChatInput } from "@orb/contracts/chat";
import { HOME_RECENT_CHATS_LIMIT, startChatSchema } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { parsePresetFile, presetDetailSchema, presetImportOutcomeSchema } from "@orb/contracts/preset";
import type { ApplyAsCopyResult, RefineryRun, RefineryStage } from "@orb/contracts/refinery";
import { applyAsCopyResultSchema, applyFieldsResultSchema, REFINERY_STAGE_PAYLOADS, REFINERY_STAGES, refineryRunViewSchema } from "@orb/contracts/refinery";
import { applyRosterPresetInputSchema, HOME_ROSTER_PREVIEW_LIMIT } from "@orb/contracts/roster-preset";
import { streamAttachInputSchema } from "@orb/contracts/stream";
import type { CharacterId, ChatId, RefinerySessionId, RosterPresetId } from "@orb/kit/ids";
import { controlledPanel, publishSurfaceInventory } from "@orb/testkit/browser/spec";
import type { SurfaceCoverageDisposition, SurfaceCoverageInventory, SurfaceProviderEvidence } from "@orb/testkit/iso";
import { parseSurfaceProviderEvidence } from "@orb/testkit/iso";
import { CORPUS_STRUCTURED_REPLIES } from "@orb/testkit/node/composed";
import { attachNativeFile, isTrpcRequestFor, matchesTrpcRequestInput, readTrpcOutput, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Request, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHARACTERS_SECTION_LABEL } from "#client/features/character/lib/characters-section-label.ts";
import { CHATS_SECTION_LABEL } from "#client/features/chat/lib/chats-section-label.ts";
import { homeAlsoOpenVisible } from "#client/features/chat/lib/home-also-open-visibility.ts";
import { splitHearth } from "#client/features/chat/lib/home-hearth.ts";
import { DATABANK_SECTION_LABEL } from "#client/features/databank/lib/databank-section-label.ts";
import { CORPUS_SEARCH_TARGETS, CORPUS_SEARCH_TOP_N, CORPUS_TARGET_REST_HINTS } from "#client/features/discovery/lib/corpus-search-targets.ts";
import { CORPUS_SECTION_LABEL } from "#client/features/discovery/lib/corpus-section-label.ts";
import { homeSectionJumpVisible } from "#client/features/home/lib/section-jump-visibility.ts";
import { EXTENSIONS_SECTION_LABEL } from "#client/features/plugin/lib/extensions-section-label.ts";
import { PRESETS_SECTION_LABEL } from "#client/features/preset/lib/presets-section-label.ts";
import { homeRostersVisible } from "#client/features/roster-preset/lib/home-rosters-visibility.ts";
import { rosterCountsSuffix } from "#client/features/roster-preset/lib/roster-copy.ts";
import { ANALYTICS_DEFAULT_SORT, ANALYTICS_SORT_OPTIONS } from "#client/features/stats/lib/analytics-view-model.ts";
import { BLANK_CHAT_NAME, START_TEMP_CHAT_NAME } from "#client/lib/chat-launch-names.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";
import { CORPUS_MODE_LABELS, CORPUS_MODES } from "#client/lib/corpus-modes.ts";
import { LEADERBOARD_ROW_ATTR } from "#client/lib/leaderboard-row-attr.ts";
import { rowActionsName } from "#client/lib/row-qualifiers.ts";
import type { SectionId } from "#client/state/section-ids.ts";
import { SECTION_IDS } from "#client/state/section-ids.ts";
import { messageRow, waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";

const MAX_DEPTH = 8;
const MAX_DISCLOSURES = 100;
const MAX_SCROLL_REGIONS = 32;
const SCROLL_TOLERANCE = 2;
const MAX_SCROLL_ADVANCES = 64;
const SEARCH_MISS = "surface-walk-no-result-6af7c21";
const EMPTY_FIELD_QUERY = "6af7c21a4c29f6d0e87b1935d2a48cf0";

type OwnedSection = Exclude<SectionId, "chats" | "characters" | "config">;

interface Observation {
  readonly id: string;
  readonly kind: string;
  readonly status: SurfaceCoverageDisposition;
  readonly reason: string;
}

interface Journey {
  readonly flow: SurfaceFlow;
  readonly observations: Observation[];
  readonly expected: SurfaceCoverageInventory["expected"][number][];
  readonly presetMenus: { readonly id: string; readonly family: string; readonly leaves: readonly string[] }[];
}

interface ScrollGeometry {
  readonly position: number;
  readonly extent: number;
  readonly total: number;
  readonly maximum: number;
  readonly virtual: boolean;
  readonly snap: string;
  readonly terminal: { readonly start: number; readonly end: number; readonly position: string | null } | null;
  readonly port: { readonly start: number; readonly end: number };
}

function usesProgrammaticScroll(journey: Journey): boolean {
  return journey.flow.page.context().browser()?.browserType().name() === "webkit" && journey.flow.info.project.use.isMobile === true;
}

function expectSubject(journey: Journey, id: string, kind: string): void {
  if (!journey.expected.some((subject) => subject.id === id && subject.kind === kind)) {
    journey.expected.push({ id, kind });
  }
}

function observe(journey: Journey, id: string, status: SurfaceCoverageDisposition, reason: string): void {
  const kind = journey.expected.find((subject) => subject.id === id)?.kind ?? "surface";
  expectSubject(journey, id, kind);
  journey.observations.push({ id, kind, status, reason });
}

function pane(journey: Journey, side: "list" | "context"): Locator {
  return journey.flow.page.locator(`.shell-panel[data-panel-side="${side}"]`);
}

function content(journey: Journey): Locator {
  return journey.flow.page.locator("main");
}

async function ready(scope: Locator): Promise<void> {
  await expect(scope).toBeVisible();
  await expect(scope.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
  // Native field values are not child text, including legitimately empty editor fields.
  if (await scope.evaluate((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
    return;
  }
  await expect(scope).not.toBeEmpty();
  await expect(scope).toContainText(/\S/u);
}

async function checkpoint(journey: Journey, id: string, scope: Locator, witness: Locator = scope): Promise<void> {
  await ready(scope);
  const errors = scope.locator('[data-slot="query-error"]:visible');
  const error = (await errors.count()) > 0;
  await journey.flow.checkpoint({ name: id, scope, state: error ? "error" : "loaded", witnesses: [error ? errors.first() : witness], checks: SURFACE_CHECKS });
  observe(
    journey,
    id,
    error ? "failed" : "visited",
    error ? "Actual production query-error state; not a loaded-content acceptance" : "Actual selected production body rendered without a loading skeleton",
  );
  expect(error, `${id}: unexpected production read failure; the error-state checkpoint and failed inventory observation retain its diagnostics`).toBe(false);
}

async function enter(journey: Journey, section: OwnedSection): Promise<void> {
  await journey.flow.page.goto("/");
  await waitForAppReady(journey.flow.page);
  const label = sectionLabel(section);
  const rail = journey.flow.page.getByRole("navigation", { name: "Primary", exact: true });
  const direct = rail.getByRole("button", { name: label, exact: true });
  await journey.flow.action(`rail/${section}`, {
    action: async () => {
      if (await direct.isVisible()) {
        await direct.click();
      } else {
        await rail.getByRole("button", { name: "You", exact: true }).click();
        await journey.flow.page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
      }
    },
    ready: async () => {
      await expect(journey.flow.page.getByRole("dialog")).toHaveCount(0);
      await expect(journey.flow.page.locator(".shell-grid")).toHaveAttribute("data-section", section);
    },
  });
  await journey.flow.requestPanes();
  observe(journey, `rail/${section}`, "visited", "Native Primary/You navigation completed with requested pane intent applied before surface capture");
  const requested = (await content(journey).isVisible()) ? content(journey) : pane(journey, "list");
  await checkpoint(journey, `${section}/requested-pane-composition`, requested);
}

function sectionLabel(section: OwnedSection): string | RegExp {
  switch (section) {
    case "corpus":
      return CORPUS_SECTION_LABEL;
    case "databank":
      return DATABANK_SECTION_LABEL;
    case "extensions":
      return EXTENSIONS_SECTION_LABEL;
    case "presets":
      return PRESETS_SECTION_LABEL;
    case "home":
    case "refinery":
      return new RegExp(`^${RegExp.escape(section)}$`, "iu");
  }
}

async function reveal(journey: Journey, side: "list" | "context"): Promise<boolean> {
  const region = pane(journey, side);
  const available = await region.getAttribute("data-panel-available");
  if (available === "false") {
    return false;
  }
  await expect(region).toHaveAttribute("data-panel-available", "true");
  if (side === "list") {
    await dismissContext(journey);
  }
  if ((await region.getAttribute("data-panel-mode")) === "collapsed") {
    if (side === "list") {
      await switchListScreen(journey);
    } else {
      await journey.flow.page.getByRole("button", { name: "Show details", exact: true }).click();
    }
    observe(
      journey,
      `extra-pane/${side}`,
      "visited",
      "Explicit navigation/inspection pane state in addition to the requested composition captured at rail entry",
    );
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "collapsed");
  await expect(region).toBeVisible();
  return true;
}

async function switchListScreen(journey: Journey): Promise<void> {
  const control = journey.flow.page.locator(".shell-topbar-lead > button");
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName(/\S/u);
  await control.click();
}

async function tabBodies(journey: Journey, scope: Locator, prefix: string, depth = 0): Promise<void> {
  const lists = await scope.getByRole("tablist").all();
  if (depth >= MAX_DEPTH) {
    observe(journey, `${prefix}/nested-tabs`, "unvisited", `${String(lists.length)} tablists exceed the explicit traversal bound`);
    return;
  }
  for (const [listIndex, list] of lists.entries()) {
    const tabs = await list.getByRole("tab").all();
    const expected = await Promise.all(tabs.map((tab) => tab.ariaSnapshot()));
    for (const index of tabs.keys()) {
      expectSubject(journey, `${prefix}/tabs-${String(listIndex)}/${String(index)}`, "tab");
    }
    await attachNativeFile(journey.flow.info, journey.flow.info, `${prefix}-tabs-${String(listIndex)}-expected`, {
      body: JSON.stringify(expected),
      contentType: "application/json",
    });
    for (const [index, tab] of tabs.entries()) {
      const id = `${prefix}/tabs-${String(listIndex)}/${String(index)}`;
      if (await tab.isDisabled()) {
        observe(journey, id, "skipped", "Production tab is disabled; no body acceptance claimed");
        continue;
      }
      await journey.flow.action(id, {
        action: async () => {
          await tab.click();
        },
        ready: async () => {
          await expect(tab).toHaveAttribute("aria-selected", "true");
          await ready(await controlledPanel(tab));
        },
      });
      const body = await controlledPanel(tab);
      await inspect(journey, body, id);
      await tabBodies(journey, body, id, depth + 1);
    }
  }
}

async function disclosures(journey: Journey, scope: Locator, prefix: string): Promise<void> {
  const opened: Locator[] = [];
  for (let index = 0; index < MAX_DISCLOSURES; index += 1) {
    const closed = scope.locator('[data-slot="collapsible-trigger"][aria-expanded="false"]:not([aria-haspopup]):visible');
    if ((await closed.count()) === 0) {
      break;
    }
    const rootIndex = await closed.first().evaluate(
      (node, container) => {
        const host = node.closest('[data-slot="collapsible-root"]');
        if (host === null) {
          throw new Error("The production disclosure has no semantic host");
        }
        return [...container.querySelectorAll('[data-slot="collapsible-root"]')].indexOf(host);
      },
      await scope.elementHandle(),
    );
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    const host = scope.locator('[data-slot="collapsible-root"]').nth(rootIndex);
    const remembered = host.locator('[data-slot="collapsible-trigger"]').first();
    const id = `${prefix}/disclosure-${String(index)}`;
    expectSubject(journey, id, "disclosure");
    await journey.flow.action(`${prefix}/disclosure-${String(index)}`, {
      action: async () => {
        await remembered.click();
      },
      ready: async () => {
        await expect(remembered).toHaveAttribute("aria-expanded", "true");
        await expect(remembered).toHaveAttribute("aria-controls", /.+/u);
        const body = await controlledPanel(remembered);
        await ready(body);
      },
    });
    opened.push(remembered);
    const body = await controlledPanel(remembered);
    await checkpoint(journey, `${prefix}/disclosure-${String(index)}`, body);
    await nativeDetails(journey, body, `${prefix}/disclosure-${String(index)}`);
  }
  const remaining = await scope.locator('[data-slot="collapsible-trigger"][aria-expanded="false"]:not([aria-haspopup]):visible').count();
  observe(
    journey,
    `${prefix}/disclosures`,
    remaining === 0 ? "visited" : "unvisited",
    `${String(opened.length)} nested disclosures opened; ${String(remaining)} remain beyond the safety bound`,
  );
  for (const trigger of opened.toReversed()) {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await nativeDetails(journey, scope, prefix);
}

async function nativeDetails(journey: Journey, scope: Locator, prefix: string, depth = 0): Promise<void> {
  const candidates = scope.locator("details");
  const indices = await candidates.evaluateAll(
    (nodes, container) =>
      nodes.flatMap((node, index) => {
        const parent = node.parentElement?.closest("details") ?? null;
        const nested = parent !== null && parent !== container && container.contains(parent);
        return !nested && node.getClientRects().length > 0 ? [index] : [];
      }),
    await scope.elementHandle(),
  );
  if (depth >= MAX_DEPTH && indices.length > 0) {
    observe(journey, `${prefix}/nested-details`, "unvisited", `${String(indices.length)} native details exceed the traversal bound`);
    return;
  }
  for (const index of indices) {
    const detail = candidates.nth(index);
    const id = `${prefix}/details-${String(index)}`;
    expectSubject(journey, id, "native-details");
    const wasOpen = await detail.evaluate((node) => node.hasAttribute("open"));
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
    await expect(detail).toHaveAttribute("open", /.*/u);
    await checkpoint(journey, id, detail);
    await nativeDetails(journey, detail, id, depth + 1);
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
  }
}

async function menuBody(journey: Journey, menu: Locator, prefix: string, depth: number): Promise<void> {
  await checkpoint(journey, prefix, menu);
  await attachNativeFile(journey.flow.info, journey.flow.info, `${prefix}-items`, { body: await menu.ariaSnapshot(), contentType: "text/plain" });
  const items = menu.locator('[role^="menuitem"]:not([aria-disabled="true"]):not([disabled])');
  await terminalMenu(journey, menu, items, prefix);
  const submenus = await menu.locator('[role="menuitem"][aria-haspopup="menu"]:not([aria-disabled="true"]):not([disabled])').all();
  if (depth >= MAX_DEPTH) {
    observe(journey, `${prefix}/submenus`, "unvisited", `${String(submenus.length)} nested menus beyond the traversal bound`);
    return;
  }
  for (const [index, trigger] of submenus.entries()) {
    await trigger.focus();
    await trigger.press("ArrowRight");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const child = journey.flow.page.getByRole("menu").last();
    await menuBody(journey, child, `${prefix}/${String(index)}`, depth + 1);
    await child.press("Escape");
    await expect(trigger).toBeFocused();
  }
  const leaves = (await menu.locator('[role^="menuitem"]:not([aria-haspopup]):not([aria-disabled="true"])').allTextContents()).map((label) => label.trim());
  if (prefix.startsWith("presets/")) {
    const family = await presetMenuFamily(journey, menu, prefix);
    journey.presetMenus.push({ id: prefix, family, leaves });
  }
  observe(journey, `${prefix}/leaf-actions`, "unvisited", `Actual enabled commands awaiting named execution: ${leaves.join("; ")}`);
}

async function presetMenuFamily(journey: Journey, menu: Locator, prefix: string): Promise<string> {
  if (prefix.startsWith("presets/library/")) {
    return "library";
  }
  for (const name of ["Add", "Section actions"]) {
    if ((await menu.and(journey.flow.page.getByRole("menu", { name, exact: true })).count()) === 1) {
      return name;
    }
  }
  return "unclassified";
}

async function terminalMenu(journey: Journey, menu: Locator, items: Locator, prefix: string): Promise<void> {
  if ((await items.count()) === 0) {
    observe(journey, `${prefix}/terminal`, "skipped", "All actual items are disabled");
    return;
  }
  await menu.press("End");
  await expect(items.last()).toBeFocused();
  await checkpoint(journey, `${prefix}/terminal`, menu, items.last());
}

async function menus(journey: Journey, scope: Locator, prefix: string): Promise<void> {
  if (prefix.startsWith("corpus/labels") && (await scope.getByRole("textbox", { name: "Filter tags", exact: true }).count()) === 1) {
    await labelMenus(journey, scope, prefix);
    return;
  }
  const triggers = await scope.locator('button[aria-haspopup="menu"]:visible').all();
  for (const index of triggers.keys()) {
    expectSubject(journey, `${prefix}/menu-${String(index)}`, "menu");
  }
  for (const [index, trigger] of triggers.entries()) {
    await inspectMenuTrigger(journey, trigger, `${prefix}/menu-${String(index)}`);
  }
}

async function inspectMenuTrigger(journey: Journey, trigger: Locator, id: string): Promise<void> {
  if (await trigger.isDisabled()) {
    observe(journey, id, "skipped", "Actual menu trigger is disabled");
    return;
  }
  await journey.flow.action(id, {
    action: async () => {
      await trigger.click();
    },
    ready: async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(journey.flow.page.getByRole("menu")).toHaveCount(1);
    },
  });
  const menu = journey.flow.page.getByRole("menu");
  await menuBody(journey, menu, id, 0);
  if ((await menu.and(journey.flow.page.getByRole("menu", { name: "All Corpus tabs", exact: true })).count()) === 1) {
    await contextMenuTabs(journey, trigger, menu, id);
    return;
  }
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function contextMenuTabs(journey: Journey, trigger: Locator, menu: Locator, id: string): Promise<void> {
  const names = (await menu.getByRole("menuitemradio").allTextContents()).map((label) => label.trim());
  expect(names.length).toBeGreaterThan(0);
  for (const [index, name] of names.entries()) {
    if (index > 0) {
      await trigger.click();
      await ready(menu);
    }
    const tab = pane(journey, "context").getByRole("tab", { name, exact: true });
    await journey.flow.action(`${id}/activate/${name}`, {
      action: async () => {
        await menu.getByRole("menuitemradio", { name, exact: true }).click();
      },
      ready: async () => {
        await expect(menu).toBeHidden();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await ready(await controlledPanel(tab));
        await expect(trigger).toBeFocused();
      },
    });
    observe(
      journey,
      `${id}/leaf-${String(index)}`,
      "visited",
      `Actual overflow radio ${name} activated its registry-owned tab and loaded body; focus returned to the native trigger`,
    );
  }
  observe(
    journey,
    `${id}/leaf-actions`,
    "visited",
    `All ${String(names.length)} actual native overflow tab radios activated with loaded-panel and focus-return witnesses`,
  );
}

async function labelMenus(journey: Journey, scope: Locator, prefix: string): Promise<void> {
  const roster = await scope.locator('button[aria-haspopup="menu"]:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({
      triggerId: node.id,
      tagId: node.closest("[data-label-row]")?.getAttribute("data-label-row") ?? null,
    })),
  );
  await attachNativeFile(journey.flow.info, journey.flow.info, `${prefix}-native-menu-roster`, {
    body: JSON.stringify(roster),
    contentType: "application/json",
  });
  const tags = await journey.flow.client.tag.listTagsWithUsage.query();
  const filter = scope.getByRole("textbox", { name: "Filter tags", exact: true });
  const priorFilter = await filter.inputValue();
  for (const index of roster.keys()) {
    expectSubject(journey, `${prefix}/menu-${String(index)}`, "menu");
  }
  try {
    for (const [index, entry] of roster.entries()) {
      const id = `${prefix}/menu-${String(index)}`;
      if (entry.tagId === null) {
        await inspectMenuTrigger(journey, scope.locator(`[id=${JSON.stringify(entry.triggerId)}]`), id);
        continue;
      }
      const tag = tags.find(({ id: tagId }) => tagId === entry.tagId);
      if (tag === undefined || !journey.flow.run.subjects.tags.some(({ id: tagId }) => tagId === tag.id)) {
        throw new Error("The native Labels menu census must retain an admitted original tag identity");
      }
      const row = scope.locator(`[data-label-row=${JSON.stringify(tag.id)}]`);
      await journey.flow.action(`${id}/reveal-original`, {
        action: async () => {
          await filter.fill(tag.name);
        },
        ready: async () => {
          await expect(filter).toHaveValue(tag.name);
          await expect(row).toBeVisible();
        },
      });
      await row.hover();
      const trigger = row.locator('button[aria-haspopup="menu"]');
      await expect(trigger).toHaveCount(1);
      await expect(trigger).toHaveCSS("opacity", "1");
      await inspectMenuTrigger(journey, trigger, id);
    }
    await disposableLabelDelete(journey, scope, prefix);
    for (const [index, entry] of roster.entries()) {
      if (entry.tagId !== null) {
        observe(
          journey,
          `${prefix}/menu-${String(index)}/leaf-actions`,
          "excluded",
          `Original tag ${entry.tagId} Delete remains read-only; exact native Delete is separately committed and verified on a production-created disposable tag`,
        );
      }
    }
    const overflow = scope.getByRole("button", { name: "More tag actions", exact: true });
    const overflowId = await overflow.getAttribute("id");
    const overflowIndex = roster.findIndex((entry) => entry.triggerId === overflowId);
    expect(overflowIndex).toBeGreaterThanOrEqual(0);
    await overflow.click();
    await expect(journey.flow.page.getByRole("menu").getByRole("menuitem")).toHaveText(["Prune unused tags"]);
    const prune = journey.flow.page.getByRole("menu").getByRole("menuitem", { name: "Prune unused tags", exact: true });
    await expect(prune).toBeVisible();
    await prune.click();
    const confirm = journey.flow.page.getByRole("alertdialog");
    await expect(confirm).toHaveCount(1);
    await ready(confirm);
    await checkpoint(journey, `${prefix}/prune/confirm`, confirm);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(overflow).toBeFocused();
    observe(journey, `${prefix}/prune/open-cancel`, "visited", "Native whole-library prune decision opened and Cancel restored the actual overflow trigger");
    observe(
      journey,
      `${prefix}/menu-${String(overflowIndex)}/leaf-actions`,
      "excluded",
      "Whole-library Prune commit would delete admitted original unused tags; its real decision/cancel is visited, but no disposable-only prune scope exists",
    );
  } finally {
    await filter.fill(priorFilter);
    await expect(filter).toHaveValue(priorFilter);
  }
}

async function disposableLabelDelete(journey: Journey, scope: Locator, prefix: string): Promise<void> {
  const tag = await journey.flow.client.tag.createTag.mutate({ input: { name: `Surface menu ${crypto.randomUUID()}` } });
  expect(journey.flow.run.subjects.tags.some(({ id }) => id === tag.id)).toBe(false);
  try {
    await scope.getByRole("textbox", { name: "Filter tags", exact: true }).fill(tag.name);
    const row = scope.locator(`[data-label-row=${JSON.stringify(tag.id)}]`);
    await expect(row).toBeVisible();
    await row.hover();
    await row.locator('button[aria-haspopup="menu"]').click();
    const menu = journey.flow.page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["Delete"]);
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const confirm = journey.flow.page.getByRole("alertdialog", { name: `Delete "${tag.name}"?`, exact: true });
    await expect(confirm).toBeVisible();
    await checkpoint(journey, `${prefix}/disposable/Delete/confirm`, confirm);
    await journey.flow.action(`${prefix}/disposable/${tag.id}/Delete`, {
      action: async () => {
        await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      },
      ready: async () => {
        await expect(confirm).toBeHidden();
        await expect.poll(async () => (await journey.flow.client.tag.listTagsWithUsage.query()).some(({ id }) => id === tag.id)).toBe(false);
        await expect(row).toHaveCount(0);
      },
    });
    observe(
      journey,
      `${prefix}/disposable/Delete`,
      "visited",
      `Native row menu/confirm deleted production-created ${tag.id}; canonical owner read and native row absence agree`,
    );
  } finally {
    if ((await journey.flow.client.tag.listTagsWithUsage.query()).some(({ id }) => id === tag.id)) {
      await journey.flow.client.tag.removeTag.mutate({ tagId: tag.id });
    }
  }
}

async function loadNativePages(
  journey: Journey,
  request: { readonly list: Locator; readonly total: number; readonly readLoaded: () => Promise<number>; readonly id: string },
): Promise<void> {
  const { list, total, readLoaded, id } = request;
  let loaded = await readLoaded();
  while (loaded < total) {
    const before = loaded;
    await journey.flow.action(`${id}/page-after-${String(before)}`, {
      action: async () => {
        await list.hover();
        await nativeWheel(journey, list, "y", await list.evaluate((node) => node.scrollHeight));
      },
      ready: async () => {
        await expect.poll(readLoaded).toBeGreaterThan(before);
      },
    });
    loaded = await readLoaded();
  }
  expect(loaded, "The native loaded population must equal the production census before a whole-list tail witness").toBe(total);
  observe(
    journey,
    id,
    "visited",
    `${String(loaded)} actual rows loaded through ${usesProgrammaticScroll(journey) ? "CSSOM positioning, not wheel or touch proof" : "native scrolling"} against the exact production query census`,
  );
}

async function loadCorpusCatalog(journey: Journey): Promise<void> {
  const list = pane(journey, "list").getByRole("list", { name: "Distilled catalog", exact: true });
  if ((await list.count()) === 0) {
    return;
  }
  const census = await journey.flow.client.discovery.browseCharacters.query({});
  await loadNativePages(journey, {
    list,
    total: census.totalCount,
    id: "corpus/native-catalog-pages",
    readLoaded: async () => Number(await list.locator("[aria-setsize]").first().getAttribute("aria-setsize")),
  });
}

async function loadRefineryPicker(journey: Journey): Promise<void> {
  const list = content(journey).getByRole("listbox");
  if ((await list.count()) === 0) {
    return;
  }
  const census = await journey.flow.client.character.list.query({});
  await loadNativePages(journey, {
    list,
    total: census.totalCount,
    id: "refinery/native-picker-pages",
    readLoaded: async () => await list.getByRole("option").count(),
  });
}

async function scrollWindows(journey: Journey, scope: Locator, prefix: string): Promise<void> {
  const regions = await scope.evaluate((root) => {
    const pathOf = (node: Element): string => {
      const parts: string[] = [];
      let cursor = node;
      while (cursor !== root) {
        const parent = cursor.parentElement;
        if (parent === null) {
          throw new Error("A scroll subject left its declared scope");
        }
        parts.unshift(`:nth-child(${String([...parent.children].indexOf(cursor) + 1)})`);
        cursor = parent;
      }
      return parts.join(" > ");
    };
    const axesOf = (node: HTMLElement): string[] => {
      const style = getComputedStyle(node);
      const axes: string[] = [];
      if (/auto|scroll/u.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2 && node.clientHeight > 0) {
        axes.push("y");
      }
      if (/auto|scroll/u.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2 && node.clientWidth > 0) {
        axes.push("x");
      }
      return axes;
    };
    const nodes = [root, ...root.querySelectorAll("*")];
    return nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement)) {
        return [];
      }
      return axesOf(node).map((axis) => ({ axis, path: pathOf(node) }));
    });
  });
  for (const [index, region] of regions.slice(0, MAX_SCROLL_REGIONS).entries()) {
    const viewport = region.path === "" ? scope : scope.locator(`:scope > ${region.path}`);
    for (const ratio of [0, 0.5, 1]) {
      expectSubject(journey, `${prefix}/scroll-${String(index)}-${String(ratio)}`, "scroll-window");
    }
    for (const ratio of [0, 0.5, 1]) {
      await scrollWindow(journey, viewport, { axis: region.axis, ratio, id: `${prefix}/scroll-${String(index)}-${String(ratio)}` });
    }
  }
  observe(
    journey,
    `${prefix}/scroll-regions`,
    regions.length > MAX_SCROLL_REGIONS ? "unvisited" : "visited",
    `${String(regions.length)} native overflowing regions; beginning/interior/tail windows, not a claim of every virtualized row`,
  );
}

async function scrollWindow(
  journey: Journey,
  viewport: Locator,
  request: { readonly axis: string; readonly ratio: number; readonly id: string },
): Promise<void> {
  const { axis, ratio, id } = request;
  const before = await scrollGeometry(viewport, axis);
  const deliveries: Awaited<ReturnType<typeof nativeWheel>>[] = [];
  try {
    if (interiorInapplicable(before, ratio)) {
      observe(
        journey,
        id,
        "not-applicable",
        `Measured scroll range ${String(before.maximum)}px has no interior outside both ${String(SCROLL_TOLERANCE)}px edge neighborhoods; start/end remain independently required`,
      );
      return;
    }
    await journey.flow.action(id, {
      action: async () => {
        await viewport.hover();
        for (let step = 0; step < MAX_SCROLL_ADVANCES; step += 1) {
          const state = await scrollGeometry(viewport, axis);
          if (interiorInapplicable(state, ratio) || windowReached(state, ratio)) {
            break;
          }
          const delta = state.maximum * ratio - state.position;
          deliveries.push(await nativeWheel(journey, viewport, axis, delta));
        }
      },
      ready: async () => {
        let previous = "";
        await expect
          .poll(async () => {
            const state = await scrollGeometry(viewport, axis);
            const signature = JSON.stringify(state);
            const settled = signature === previous;
            previous = signature;
            return settled && (interiorInapplicable(state, ratio) || windowReached(state, ratio));
          })
          .toBe(true);
      },
    });
  } finally {
    await attachNativeFile(journey.flow.info, journey.flow.info, `${id}-scroll-geometry`, {
      body: JSON.stringify({
        requestedRatio: ratio,
        before,
        after: await scrollGeometry(viewport, axis),
        deliveries,
        input: usesProgrammaticScroll(journey) ? "programmatic-positioning; not wheel or touch proof" : "native-wheel",
        subject: await viewport.evaluate((node) => ({
          tag: node.tagName,
          slot: node.getAttribute("data-slot"),
          className: node.getAttribute("class"),
          overflow: getComputedStyle(node).overflow,
          ancestors: [
            ...(function* () {
              let parent = node.parentElement;
              while (parent !== null) {
                yield {
                  tag: parent.tagName,
                  slot: parent.getAttribute("data-slot"),
                  overflow: getComputedStyle(parent).overflow,
                  position: parent.scrollTop,
                  height: parent.clientHeight,
                  total: parent.scrollHeight,
                };
                parent = parent.parentElement;
              }
            })(),
          ],
        })),
        coverage: "current loaded extent; not a whole-database census",
      }),
      contentType: "application/json",
    });
  }
  const after = await scrollGeometry(viewport, axis);
  if (interiorInapplicable(after, ratio)) {
    observe(
      journey,
      id,
      "not-applicable",
      `Settled scroll range ${String(after.maximum)}px has no distinct interior outside both ${String(SCROLL_TOLERANCE)}px edge neighborhoods; no interior checkpoint accepted`,
    );
    return;
  }
  await checkpoint(journey, id, viewport);
}

async function nativeWheel(
  journey: Journey,
  viewport: Locator,
  axis: string,
  delta: number,
): Promise<{ target: string; defaultPrevented: boolean; reached: boolean } | null> {
  if (usesProgrammaticScroll(journey)) {
    await test.step("Programmatic positioning (mobile WebKit; not wheel or touch evidence)", async () => {
      await viewport.evaluate((node, input) => node.scrollBy(input.axis === "x" ? input.delta : 0, input.axis === "y" ? input.delta : 0), { axis, delta });
      await viewport.evaluate(async () => await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    });
    return null;
  }
  const delivery = await viewport.evaluateHandle((node) => {
    let facts: { target: string; defaultPrevented: boolean; reached: boolean } | null = null;
    const listener = (event: WheelEvent): void => {
      queueMicrotask(() => {
        const target = event.target;
        facts = {
          target: target instanceof Element ? `${target.tagName}[data-slot=${String(target.getAttribute("data-slot"))}]` : "non-element",
          defaultPrevented: event.defaultPrevented,
          reached: event.composedPath().includes(node),
        };
      });
    };
    node.ownerDocument.addEventListener("wheel", listener, { once: true });
    return {
      read: () => facts,
      stop: () => {
        node.ownerDocument.removeEventListener("wheel", listener);
      },
    };
  });
  try {
    await journey.flow.page.mouse.wheel(axis === "x" ? delta : 0, axis === "y" ? delta : 0);
    await viewport.evaluate(async () => await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return await delivery.evaluate((state) => state.read());
  } finally {
    await delivery.evaluate((state) => state.stop());
    await delivery.dispose();
  }
}

function interiorInapplicable(state: ScrollGeometry, ratio: number): boolean {
  return ratio === 0.5 && state.maximum <= 2 * SCROLL_TOLERANCE;
}

async function scrollGeometry(viewport: Locator, axis: string): Promise<ScrollGeometry> {
  return await viewport.evaluate((node, horizontal) => {
    const box = node.getBoundingClientRect();
    const measurement = horizontal
      ? { position: node.scrollLeft, extent: node.clientWidth, total: node.scrollWidth, start: box.left + node.clientLeft }
      : { position: node.scrollTop, extent: node.clientHeight, total: node.scrollHeight, start: box.top + node.clientTop };
    const edges = (rectangle: DOMRect): { start: number; end: number } =>
      horizontal ? { start: rectangle.left, end: rectangle.right } : { start: rectangle.top, end: rectangle.bottom };
    const terminal = [...node.querySelectorAll("[aria-posinset][aria-setsize]")].find(
      (row) => row.closest('[data-slot="virtual-list-scroll"]') === node && row.getAttribute("aria-posinset") === row.getAttribute("aria-setsize"),
    );
    return {
      position: measurement.position,
      extent: measurement.extent,
      total: measurement.total,
      maximum: measurement.total - measurement.extent,
      virtual: node.matches('[data-slot="virtual-list-scroll"]'),
      snap: getComputedStyle(node).scrollSnapType,
      terminal: terminal === undefined ? null : { ...edges(terminal.getBoundingClientRect()), position: terminal.getAttribute("aria-posinset") },
      port: { start: measurement.start, end: measurement.start + measurement.extent },
    };
  }, axis === "x");
}

function windowReached(state: ScrollGeometry, ratio: number): boolean {
  if (ratio === 0) {
    return state.position <= SCROLL_TOLERANCE;
  }
  if (ratio === 1) {
    const edge = state.terminal === null ? !state.virtual : state.terminal.end <= state.port.end + SCROLL_TOLERANCE && state.terminal.end > state.port.start;
    return state.maximum - state.position <= SCROLL_TOLERANCE && edge;
  }
  const midpoint = state.total / 2;
  return (
    state.position > SCROLL_TOLERANCE &&
    state.maximum - state.position > SCROLL_TOLERANCE &&
    state.position < midpoint &&
    state.position + state.extent > midpoint
  );
}

async function inspect(journey: Journey, scope: Locator, id: string): Promise<void> {
  await checkpoint(journey, id, scope);
  await disclosures(journey, scope, id);
  await menus(journey, scope, id);
  await scrollWindows(journey, scope, id);
}

async function context(journey: Journey, prefix: string): Promise<void> {
  if (!(await reveal(journey, "context"))) {
    observe(journey, `${prefix}/context`, "skipped", "Production section declares no Context pane");
    return;
  }
  const region = pane(journey, "context");
  await inspect(journey, region, `${prefix}/context`);
  await tabBodies(journey, region, `${prefix}/context`);
  await dismissContext(journey);
}

async function pressableChoices(journey: Journey, group: Locator, body: Locator, prefix: string): Promise<void> {
  const choices = await group.getByRole("button").all();
  for (const [index, radio] of choices.entries()) {
    if (await radio.isDisabled()) {
      observe(journey, `${prefix}/${String(index)}`, "skipped", "Production mode is disabled");
      continue;
    }
    await journey.flow.action(`${prefix}/${String(index)}`, {
      action: async () => {
        await radio.click();
      },
      ready: async () => {
        await expect(radio).toHaveAttribute("aria-pressed", "true");
      },
    });
    await inspect(journey, body, `${prefix}/${String(index)}`);
  }
}

async function home(journey: Journey): Promise<void> {
  await enter(journey, "home");
  const main = content(journey);
  await ready(main);
  const rooms = await journey.flow.client.chat.listChats.query({ limit: HOME_RECENT_CHATS_LIMIT });
  const rosters = await journey.flow.client.rosterPreset.count.query();
  const mobile = await journey.flow.page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["shell-mobile"]);
  const expected = HOME_TILE_IDS.filter((id) => {
    if (id === ALSO_OPEN_TILE_ID) {
      return homeAlsoOpenVisible(rooms.items.length);
    }
    if (id === ROSTERS_TILE_ID) {
      return homeRostersVisible(rosters);
    }
    if (id === HOME_JUMP_TILE_ID) {
      return homeSectionJumpVisible(mobile);
    }
    return true;
  });
  await expect
    .poll(
      async () =>
        await main
          .locator("[data-home-tile]:visible")
          .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-home-tile")).toSorted((left, right) => (left ?? "").localeCompare(right ?? ""))),
    )
    .toEqual([...expected].toSorted((left, right) => left.localeCompare(right)));
  for (const id of HOME_TILE_IDS) {
    if (!expected.includes(id)) {
      observe(journey, `home/tile/${id}`, "not-applicable", "The same settled production capability predicate omits this contribution");
      continue;
    }
    const tile = main.locator(`[data-home-tile=${JSON.stringify(id)}]:visible`);
    await journey.flow.action(`home/tile/${id}/reveal`, {
      action: async () => {
        await tile.scrollIntoViewIfNeeded();
      },
      ready: async () => {
        await expect
          .poll(
            async () =>
              await tile.evaluate((node) => {
                const box = node.getBoundingClientRect();
                return box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
              }),
          )
          .toBe(true);
      },
    });
    await inspect(journey, tile, `home/tile/${id}`);
  }
  await inspect(journey, main, "home/whole-scroller");
  await attachNativeFile(journey.flow.info, journey.flow.info, "home-registry-admission", {
    body: JSON.stringify({ registered: HOME_TILE_IDS, expected, inputs: { roomCount: rooms.items.length, rosterCount: rosters, mobile } }, null, 2),
    contentType: "application/json",
  });
  await homeNavigation(journey);
  await journey.flow.requestPanes();
}

interface HomeOperation {
  readonly id: string;
  readonly snapshot: string;
}

async function returnHome(journey: Journey): Promise<void> {
  await journey.flow.page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("button", { name: "Home", exact: true }).click();
  await expect(journey.flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
  await ready(content(journey));
  await journey.flow.requestPanes();
}

async function homeOperation(journey: Journey, operations: readonly HomeOperation[], button: Locator, run: (id: string) => Promise<void>): Promise<void> {
  const snapshot = await button.ariaSnapshot();
  const matches = operations.filter((candidate) => candidate.snapshot === snapshot);
  expect(matches, "The native Home action must retain a unique original rendered identity").toHaveLength(1);
  const operation = matches.at(0);
  if (operation === undefined) {
    throw new Error("The selected Home action has no admitted native identity");
  }
  await run(operation.id);
  observe(
    journey,
    operation.id,
    "visited",
    "Native Home action completed its actual navigation/creation/readiness witness; created clone subjects are cleaned through production delete",
  );
  await returnHome(journey);
}

async function homeSectionDoor(journey: Journey, button: Locator, label: string, id: string): Promise<void> {
  const destination = journey.flow.page.getByRole("main");
  const selected = journey.flow.page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("button", { name: label, exact: true });
  await journey.flow.action(id, {
    action: async () => {
      await button.focus();
      await button.press("Enter");
    },
    ready: async () => {
      await expect(selected).toHaveAttribute("aria-current", "page");
      await ready(destination);
    },
  });
  await journey.flow.requestPanes();
  await checkpoint(journey, id, destination);
}

async function homeCreatedRoom(journey: Journey, id: string, activate: () => Promise<void>, presetId?: RosterPresetId): Promise<void> {
  const originalIds = new Set(journey.flow.run.subjects.chats.map((room) => room.id));
  const created = new Set<ChatId>();
  const starts: StartChatInput[] = [];
  const applied = new Set<ChatId>();
  const onResponse = (response: Response): void => {
    if (!response.ok() || presetId === undefined) {
      return;
    }
    matchesTrpcRequestInput(response.request(), "rosterPreset.applyToChat", {
      schema: applyRosterPresetInputSchema,
      matches: (input) => {
        if (input.presetId === presetId) {
          const chatId = applyRosterPresetInputSchema.parse(input).chatId;
          applied.add(chatId);
          if (!originalIds.has(chatId)) {
            created.add(chatId);
          }
        }
        return true;
      },
    });
  };
  const onRequest = (request: Request): void => {
    matchesTrpcRequestInput(request, "chat.startChat", {
      schema: startChatSchema,
      matches: (input) => {
        starts.push(startChatSchema.parse(input));
        return true;
      },
    });
    matchesTrpcRequestInput(request, "stream.attach", {
      schema: streamAttachInputSchema,
      matches: (input) => {
        const parsed = streamAttachInputSchema.parse(input);
        if (parsed.ref.channel === "chat" && !originalIds.has(parsed.ref.chatId)) {
          created.add(parsed.ref.chatId);
        }
        return true;
      },
    });
  };
  journey.flow.page.on("request", onRequest);
  journey.flow.page.on("response", onResponse);
  try {
    await journey.flow.action(id, {
      action: activate,
      ready: async () => {
        await expect.poll(() => starts.length).toBe(1);
        await expect.poll(() => created.size).toBe(1);
        await expect(journey.flow.page.getByRole("group", { name: "Message composer", exact: true })).toBeVisible();
      },
    });
    const chatId = [...created].at(0);
    const input = starts.at(0);
    if (chatId === undefined || input === undefined) {
      throw new Error("The Home creation has no native request/room identity");
    }
    if (presetId !== undefined) {
      await homeRosterApplied(applied, chatId);
    }
    const detail = await journey.flow.client.chat.getChat.query({ chatId });
    expect(detail.viewerIsHost).toBe(true);
    expect(detail.temporary).toBe(input.temporary === true);
    expect(input.characterIds.every((characterId) => journey.flow.run.subjects.characters.some(({ id: original }) => original === characterId))).toBe(true);
    await attachNativeFile(journey.flow.info, journey.flow.info, `${id}-created-identity`, {
      body: JSON.stringify({ chatId, input, original: false }),
      contentType: "application/json",
    });
    await journey.flow.requestPanes();
    await checkpoint(journey, `${id}/created`, content(journey), journey.flow.page.getByRole("group", { name: "Message composer", exact: true }));
  } finally {
    journey.flow.page.off("request", onRequest);
    journey.flow.page.off("response", onResponse);
    for (const chatId of created) {
      expect(originalIds.has(chatId)).toBe(false);
      await journey.flow.client.chat.delete.mutate({ chatId });
    }
  }
}

async function homeRosterApplied(applied: ReadonlySet<ChatId>, chatId: ChatId): Promise<void> {
  await expect.poll(() => applied.has(chatId), "The native roster polish must finish before disposing its room").toBe(true);
}

async function homeChatDoors(journey: Journey, operations: readonly HomeOperation[]): Promise<void> {
  const rooms = await journey.flow.client.chat.listChats.query({ limit: HOME_RECENT_CHATS_LIMIT });
  const { hearth, rest } = splitHearth(rooms.items);
  const recents = content(journey).locator(`[data-home-tile=${JSON.stringify(CHAT_RECENTS_TILE_ID)}]`);
  const resume = recents.getByRole("button", { name: /^Resume /u });
  if (hearth !== undefined && (await resume.count()) === 1) {
    await homeOperation(journey, operations, resume, async (id) => {
      await homeResume(journey, resume, hearth.id, id);
    });
  }
  for (const [index, room] of rest.entries()) {
    const tile = content(journey).locator(`[data-home-tile=${JSON.stringify(ALSO_OPEN_TILE_ID)}]`);
    const row = tile
      .getByRole("listitem")
      .nth(index)
      .getByRole("button", { name: deriveChatTitle(room.title, room.participantNames), exact: true });
    if ((await row.count()) === 1) {
      await homeOperation(journey, operations, row, async (id) => {
        await homeResume(journey, row, room.id, id);
      });
    }
  }
}

async function homeResume(journey: Journey, button: Locator, chatId: ChatId, id: string): Promise<void> {
  expect(journey.flow.run.subjects.chats.some((room) => room.id === chatId)).toBe(true);
  const page = await journey.flow.client.chat.listMessages.query({ chatId });
  const tail = page.messages.at(-1);
  const witness = tail === undefined ? journey.flow.page.getByRole("group", { name: "Message composer", exact: true }) : messageRow(journey.flow.page, tail.id);
  await journey.flow.action(id, {
    action: async () => {
      await button.click();
    },
    ready: async () => {
      await expect(journey.flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "chats");
      await expect(witness).toBeVisible();
    },
  });
  await journey.flow.requestPanes();
  await checkpoint(journey, id, content(journey), witness);
}

async function homeQuickPickDoors(journey: Journey, operations: readonly HomeOperation[]): Promise<void> {
  const picks = await journey.flow.client.character.list.query({ limit: HOME_QUICK_PICKS_LIMIT });
  for (const character of picks.items) {
    const tile = content(journey).locator(`[data-home-tile=${JSON.stringify(QUICK_PICKS_TILE_ID)}]`);
    const pick = tile.getByRole("button", { name: character.name, exact: true });
    if ((await pick.count()) === 1 && character.lastChatId === null) {
      await homeOperation(journey, operations, pick, async (id) => {
        await homeCreatedRoom(journey, id, async () => {
          await pick.click();
        });
      });
    } else if (
      (await pick.count()) === 1 &&
      character.lastChatId !== null &&
      journey.flow.run.subjects.chats.some((room) => room.id === character.lastChatId)
    ) {
      const chatId = character.lastChatId;
      await homeOperation(journey, operations, pick, async (id) => {
        await homeResume(journey, pick, chatId, id);
      });
    }
    const start = tile.getByRole("button", { name: `New chat with ${character.name}`, exact: true });
    if ((await start.count()) === 1) {
      await homeOperation(journey, operations, start, async (id) => {
        await homeCreatedRoom(journey, id, async () => {
          await start.click();
        });
      });
    }
  }
}

async function homeCreationDoors(journey: Journey, operations: readonly HomeOperation[]): Promise<void> {
  await homeQuickPickDoors(journey, operations);
  const rosters = await journey.flow.client.rosterPreset.list.query({ limit: HOME_ROSTER_PREVIEW_LIMIT });
  for (const roster of rosters) {
    const start = content(journey)
      .locator(`[data-home-tile=${JSON.stringify(ROSTERS_TILE_ID)}]`)
      .getByRole("button", { name: `Start a chat with ${roster.name}${rosterCountsSuffix(roster)}`, exact: true });
    if ((await start.count()) === 1) {
      await homeOperation(journey, operations, start, async (id) => {
        await homeCreatedRoom(
          journey,
          id,
          async () => {
            await start.click();
          },
          roster.id,
        );
      });
    }
  }
  const temporary = content(journey).getByRole("button", { name: START_TEMP_CHAT_NAME, exact: true });
  if ((await temporary.count()) === 1) {
    await homeOperation(journey, operations, temporary, async (id) => {
      await homeCreatedRoom(journey, id, async () => {
        await temporary.click();
        const picker = journey.flow.page.getByRole("dialog", { name: "New chat", exact: true });
        await ready(picker);
        await picker.getByRole("button", { name: BLANK_CHAT_NAME, exact: true }).click();
      });
    });
  }
}

async function homeNavigation(journey: Journey): Promise<void> {
  const operations: HomeOperation[] = [];
  for (const tileId of HOME_TILE_IDS) {
    const buttons = content(journey)
      .locator(`[data-home-tile=${JSON.stringify(tileId)}]`)
      .getByRole("button");
    for (const [index, button] of (await buttons.all()).entries()) {
      const id = `home/native/${tileId}/${String(index)}`;
      operations.push({ id, snapshot: await button.ariaSnapshot() });
      expectSubject(journey, id, "home-operation");
      observe(journey, id, "unvisited", "Registered rendered Home action awaits a source-backed native operation witness; no blind dynamic command execution");
    }
  }
  const jumpLabels = await content(journey)
    .getByRole("button", { name: /^Go to /u })
    .allTextContents();
  for (const raw of jumpLabels) {
    const label = raw.trim();
    const button = content(journey).getByRole("button", { name: `Go to ${label}`, exact: true });
    await homeOperation(journey, operations, button, async (id) => {
      await homeSectionDoor(journey, button, label, id);
    });
  }
  for (const door of [
    { name: "All chats", label: CHATS_SECTION_LABEL },
    { name: "All characters", label: CHARACTERS_SECTION_LABEL },
    { name: "All documents", label: DATABANK_SECTION_LABEL },
    { name: `Open ${DATABANK_SECTION_LABEL}`, label: DATABANK_SECTION_LABEL },
  ]) {
    const button = content(journey).getByRole("button", { name: door.name, exact: true });
    if ((await button.count()) === 1) {
      await homeOperation(journey, operations, button, async (id) => {
        await homeSectionDoor(journey, button, door.label, id);
      });
    }
  }
  const rosters = content(journey).getByRole("button", { name: "All rosters", exact: true });
  if ((await rosters.count()) === 1) {
    await homeOperation(journey, operations, rosters, async (id) => {
      await homeSavedRosters(journey, rosters, id);
    });
  }
  await homeChatDoors(journey, operations);
  await homeCreationDoors(journey, operations);
  const add = content(journey).getByRole("button", { name: "Add your first document", exact: true });
  if ((await add.count()) === 1) {
    await homeOperation(journey, operations, add, async (id) => {
      await add.click();
      const dialog = journey.flow.page.getByRole("dialog", { name: "Add a document", exact: true });
      await inspect(journey, dialog, id);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
    });
  }
  const last = new Map(journey.observations.map((observation) => [observation.id, observation.status]));
  const missing = operations.filter((operation) => last.get(operation.id) !== "visited");
  observe(
    journey,
    "home/navigation-leaves",
    missing.length === 0 ? "visited" : "unvisited",
    `${String(operations.length - missing.length)} of ${String(operations.length)} actual registered/rendered Home actions completed native witnesses; omissions remain individual expected subjects`,
  );
}

async function homeSavedRosters(journey: Journey, trigger: Locator, id: string): Promise<void> {
  const rosters = await journey.flow.client.rosterPreset.list.query();
  const originalIds = new Set(journey.flow.run.subjects.rosters.map((roster) => roster.id));
  const dialog = journey.flow.page.getByRole("dialog", { name: "Saved rosters", exact: true });
  const rows = dialog.locator('[data-slot="roster-row"]');
  await journey.flow.action(`${id}/open-saved-rosters`, {
    action: async () => {
      await trigger.click();
    },
    ready: async () => {
      await ready(dialog);
      await expect(rows).toHaveCount(rosters.length);
      await expect(journey.flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
    },
  });
  await inspect(journey, dialog, `${id}/saved-rosters`);
  for (const roster of rosters.filter((candidate) => originalIds.has(candidate.id))) {
    const row = rows.filter({
      has: journey.flow.page.getByRole("button", { name: `Start a chat with ${roster.name}${rosterCountsSuffix(roster)}`, exact: true }),
    });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(roster.name);
    const remove = row.getByRole("button", { name: `Delete ${roster.name}`, exact: true });
    const confirm = journey.flow.page.getByRole("alertdialog", { name: "Delete this roster?", exact: true });
    const operation = `${id}/roster/${roster.id}/delete-cancel`;
    expectSubject(journey, operation, "roster-operation");
    await journey.flow.action(operation, {
      action: async () => {
        await remove.click();
      },
      ready: async () => {
        await expect(confirm).toBeVisible();
        await expect(confirm).toContainText(roster.name);
        await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
      },
    });
    await checkpoint(journey, operation, confirm);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(remove).toBeFocused();
    observe(
      journey,
      operation,
      "visited",
      "Original saved roster opened its identity-named destructive confirmation, cancelled without mutation, and recovered row-action focus",
    );
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(journey.flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
  observe(
    journey,
    `${id}/saved-rosters-actions`,
    "observed",
    "Actual saved-roster rows and native confirmation/cancel actions inspected; Start is exercised separately by Home roster launch journeys, Add/Save mutations are not claimed here",
  );
}

async function corpusTarget(journey: Journey, target: (typeof CORPUS_SEARCH_TARGETS)[number]): Promise<void> {
  const select = journey.flow.page.getByRole("combobox", { name: "Search target", exact: true });
  await select.click();
  const option = journey.flow.page.getByRole("option", { name: target.label, exact: true });
  await journey.flow.action(`corpus/explore/target/${target.id}`, {
    action: async () => {
      await option.click();
    },
    ready: async () => {
      await expect(select).toContainText(target.label);
      await ready(pane(journey, "list"));
    },
  });
  if (target.id === "characters") {
    await loadCorpusCatalog(journey);
  }
  await inspect(journey, pane(journey, "list"), `corpus/explore/target/${target.id}`);
  if (target.kind !== "fields") {
    observe(
      journey,
      `corpus/explore/target/${target.id}/query`,
      journey.flow.run.generation.canonicalSyntheticEmbedding ? "unvisited" : "excluded",
      journey.flow.run.generation.canonicalSyntheticEmbedding
        ? "The canonical synthetic embedding boundary is admitted, but this target's query execution has not been exercised"
        : "This owner run admits only the maintained text stand-in; owner-provider query embedding execution is refused by the production-composed external boundary. Existing owner embeddings remain original, and no synthetic vectors replace them",
    );
    return;
  }
  const subject = journey.flow.run.subjects.characters.at(0);
  if (subject === undefined) {
    observe(journey, "corpus/text/query", "skipped", "No original character is available as a lexical query subject");
    return;
  }
  const character = await journey.flow.client.character.get.query({ characterId: subject.id });
  const search = journey.flow.page.getByRole("combobox", { name: "Search your corpus", exact: true });
  const result = await journey.flow.client.search.fields.query({ query: character.name, topN: CORPUS_SEARCH_TOP_N });
  const resultWitness =
    result.hits.length === 0
      ? pane(journey, "list").getByText(new RegExp(`^Nothing.*${RegExp.escape(character.name)}`, "u"))
      : pane(journey, "list")
          .getByRole("status")
          .filter({ hasText: new RegExp(`^${String(result.hits.length)} results? in ${RegExp.escape(target.label)}$`, "u") });
  await journey.flow.action("corpus/text/query", {
    action: async () => {
      await search.fill(character.name);
    },
    ready: async () => {
      await expect(search).toHaveValue(character.name);
      await expect(resultWitness).toBeVisible();
      await ready(pane(journey, "list"));
    },
  });
  await inspect(journey, pane(journey, "list"), "corpus/text/results");
  const emptyResult = await journey.flow.client.search.fields.query({ query: EMPTY_FIELD_QUERY, topN: CORPUS_SEARCH_TOP_N });
  expect(emptyResult.hits, "The lexical empty-state control must actually have zero production hits").toHaveLength(0);
  await attachNativeFile(journey.flow.info, journey.flow.info, "corpus-lexical-empty-control", {
    body: JSON.stringify({ query: EMPTY_FIELD_QUERY, hits: emptyResult.hits.length }),
    contentType: "application/json",
  });
  const empty = pane(journey, "list").getByText(new RegExp(RegExp.escape(EMPTY_FIELD_QUERY), "u"));
  await journey.flow.action("corpus/text/empty-query", {
    action: async () => {
      await search.fill(EMPTY_FIELD_QUERY);
    },
    ready: async () => {
      await expect(empty).toBeVisible();
    },
  });
  await journey.flow.checkpoint({ name: "corpus/text/empty", scope: pane(journey, "list"), state: "empty", witnesses: [empty], checks: SURFACE_CHECKS });
  await journey.flow.action("corpus/text/recover-browse", {
    action: async () => {
      await search.fill("");
    },
    ready: async () => {
      await expect(search).toHaveValue("");
      await expect(pane(journey, "list").getByText(CORPUS_TARGET_REST_HINTS[target.id], { exact: true })).toBeVisible();
    },
  });
}

async function corpusMember(journey: Journey, mode: (typeof CORPUS_MODES)[number]): Promise<void> {
  if (mode === "explore") {
    for (const target of CORPUS_SEARCH_TARGETS) {
      expectSubject(journey, `corpus/explore/target/${target.id}`, "search-target");
    }
    for (const target of CORPUS_SEARCH_TARGETS) {
      await corpusTarget(journey, target);
    }
    return;
  }
  if (mode === "labels") {
    const rows = await journey.flow.client.tag.listTagsWithUsage.query();
    const subject = rows.find((item) => journey.flow.run.subjects.tags.some(({ id }) => id === item.id));
    if (subject === undefined) {
      observe(journey, "corpus/labels/member", "skipped", "No original readable tag subject");
      return;
    }
    await reveal(journey, "list");
    const filter = pane(journey, "list").getByRole("textbox", { name: "Filter tags", exact: true });
    const row = pane(journey, "list").locator(`[data-label-row=${JSON.stringify(subject.id)}]`);
    await journey.flow.action(`corpus/labels/member/${subject.id}/reveal-original`, {
      action: async () => {
        await filter.fill(subject.name);
      },
      ready: async () => {
        await expect(filter).toHaveValue(subject.name);
        await expect(row).toBeVisible();
      },
    });
    await journey.flow.action(`corpus/labels/member/${subject.id}/open`, {
      action: async () => {
        await row.getByRole("button", { name: subject.name, exact: true }).click();
      },
      ready: async () => {
        await expect(content(journey).getByRole("textbox", { name: "Name", exact: true })).toHaveValue(subject.name);
      },
    });
    await inspect(journey, content(journey), `corpus/labels/member/${subject.id}`);
    return;
  }
  await reveal(journey, "list");
  const defaultSort = ANALYTICS_SORT_OPTIONS.find(({ id }) => id === ANALYTICS_DEFAULT_SORT);
  if (defaultSort === undefined) {
    throw new Error("The production leaderboard default must be in its actual sort vocabulary");
  }
  await expect(pane(journey, "list").getByRole("button", { name: `Sort by ${defaultSort.label}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  const leaderboard = await journey.flow.client.stats.leaderboard.query({ sort: ANALYTICS_DEFAULT_SORT });
  if (leaderboard.rows.length === 0) {
    await ready(pane(journey, "list").getByText("No characters have any rolled-up activity yet.", { exact: true }));
    observe(
      journey,
      "corpus/insights/character",
      "not-applicable",
      "Canonical leaderboard has zero rows and the actual native empty state is visible; no existing activity subject is fabricated",
    );
    return;
  }
  const subject = leaderboard.rows.find(({ characterId }) => journey.flow.run.subjects.characters.some(({ id }) => id === characterId));
  if (subject === undefined) {
    throw new Error("The actual leaderboard page has no admitted original character identity");
  }
  const search = pane(journey, "list").getByRole("textbox", { name: "Search characters", exact: true });
  const row = pane(journey, "list").locator(`[${LEADERBOARD_ROW_ATTR}=${JSON.stringify(subject.characterId)}]`);
  await journey.flow.action(`corpus/insights/character/${subject.characterId}/reveal-original`, {
    action: async () => {
      await search.fill(subject.name);
    },
    ready: async () => {
      await expect(search).toHaveValue(subject.name);
      await expect(row).toBeVisible();
    },
  });
  await attachNativeFile(journey.flow.info, journey.flow.info, "corpus-insights-original-subject", {
    body: JSON.stringify({ subject, native: await row.ariaSnapshot(), sort: ANALYTICS_DEFAULT_SORT }),
    contentType: "application/json",
  });
  const stats = await journey.flow.client.stats.character.query({ characterId: subject.characterId });
  if (stats === null) {
    throw new Error("The canonical leaderboard subject has no readable character stats");
  }
  const statsBody = content(journey).locator('[data-slot="analytics-content"]:visible');
  await journey.flow.action(`corpus/insights/character/${subject.characterId}/open`, {
    action: async () => {
      await row.getByRole("button").click();
    },
    ready: async () => {
      await expect(statsBody.locator('[data-shell-identity="defer"]')).toHaveText(stats.name);
    },
  });
  await inspect(journey, statsBody, `corpus/insights/character/${subject.characterId}`);
  observe(
    journey,
    "corpus/insights/character",
    "visited",
    `Original ${subject.characterId} selected from the actual ranked leaderboard and remounted through its native search/identity attribute; canonical stats name witnessed in Content`,
  );
}

async function corpus(journey: Journey): Promise<void> {
  await enter(journey, "corpus");
  for (const mode of CORPUS_MODES) {
    expectSubject(journey, `corpus/mode/${mode}`, "mode");
  }
  await reveal(journey, "list");
  for (const mode of CORPUS_MODES) {
    const radio = journey.flow.page
      .getByRole("radiogroup", { name: "Corpus mode", exact: true })
      .getByRole("radio", { name: CORPUS_MODE_LABELS[mode], exact: true });
    await journey.flow.action(`corpus/mode/${mode}`, {
      action: async () => {
        await radio.click();
      },
      ready: async () => {
        await expect(radio).toHaveAttribute("aria-checked", "true");
        await ready(pane(journey, "list"));
      },
    });
    observe(journey, `corpus/mode/${mode}`, "visited", "Native production mode switch selected and its finder rendered");
    if (mode === "explore") {
      await loadCorpusCatalog(journey);
    }
    await inspect(journey, pane(journey, "list"), `corpus/${mode}/finder`);
    await context(journey, `corpus/${mode}/whole`);
    await corpusMember(journey, mode);
    await context(journey, `corpus/${mode}/selected`);
    await journey.flow.requestPanes();
    await reveal(journey, "list");
  }
  observe(
    journey,
    "corpus/mutations",
    "excluded",
    "Original card/tag field edits, tag merges and bulk index/rebuild commits remain outside this original-data reading itinerary; they are not counted as executed. The supported Labels menu Delete is separately committed on a production-created tag, and whole-library Prune decision/Cancel is witnessed without deleting original tags; background jobs and owner-provider embedding execution remain disabled by this run's declared posture",
  );
}

async function presets(journey: Journey): Promise<void> {
  await enter(journey, "presets");
  await reveal(journey, "list");
  await inspect(journey, pane(journey, "list"), "presets/library");
  await context(journey, "presets/no-selection");
  const rows = await journey.flow.client.preset.list.query();
  const originals = rows.filter((item) => journey.flow.run.subjects.presets.some(({ id }) => id === item.id));
  const subject = originals.find((item) => originals.filter((candidate) => candidate.name === item.name).length === 1);
  if (subject === undefined) {
    observe(journey, "presets/editor", "unvisited", "No unambiguously named original preset; no built-in fork or synthetic replacement created");
    await disposablePreset(journey);
    return;
  }
  const row = pane(journey, "list").getByRole("button", { name: subject.name, exact: true });
  const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
  await journey.flow.action("presets/open-original", {
    action: async () => {
      await row.click();
    },
    ready: async () => {
      await ready(editor);
    },
  });
  await presetViews(journey, editor, `presets/${subject.id}`);
  await journey.flow.requestPanes();
  await inspect(journey, editor, `presets/${subject.id}/requested-panes`);
  observe(
    journey,
    "presets/original-mutations",
    "excluded",
    "Original preset fields, activation, reset, import and copy-on-write remain untouched; a separate explicitly disposable preset proves persistence",
  );
  await disposablePreset(journey);
  const commands = await walkPresetCommands(journey.flow, subject.id);
  for (const expected of commands.expected) {
    expectSubject(journey, expected.id, expected.kind);
  }
  journey.observations.push(...commands.observations);
  settlePresetMenus(journey, commands.proofs);
}

async function presetViews(journey: Journey, editor: Locator, prefix: string): Promise<void> {
  const tabs = await editor.getByRole("tablist", { name: "Preset sections", exact: true }).getByRole("tab").all();
  for (const index of tabs.keys()) {
    expectSubject(journey, `${prefix}/view-${String(index)}`, "preset-view");
  }
  await attachNativeFile(journey.flow.info, journey.flow.info, `${prefix}-expected-views`, {
    body: JSON.stringify(await Promise.all(tabs.map((tab) => tab.ariaSnapshot()))),
    contentType: "application/json",
  });
  for (const [index, tab] of tabs.entries()) {
    const id = `${prefix}/view-${String(index)}`;
    await journey.flow.action(id, {
      action: async () => {
        await tab.click();
      },
      ready: async () => {
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await ready(await controlledPanel(tab));
      },
    });
    const body = await controlledPanel(tab);
    await inspect(journey, body, id);
    await presetDrills(journey, body, id);
    await context(journey, `${id}/readout`);
  }
}

async function presetDrills(journey: Journey, body: Locator, prefix: string): Promise<void> {
  const controls = body.getByRole("button", { name: /^Edit /u });
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = controls.nth(index);
    const id = `${prefix}/drill-${String(index)}`;
    const drill = body.getByRole("region", { name: / — (?:section|template) editor$/u });
    await journey.flow.action(id, {
      action: async () => {
        await trigger.click();
      },
      ready: async () => {
        await expect(drill).toHaveCount(1);
        await ready(drill);
      },
    });
    await inspect(journey, drill, id);
    const back = drill.getByRole("button", { name: /^Back to (?:rack|actions)$/u });
    await journey.flow.action(`${id}/return`, {
      action: async () => {
        await back.click();
      },
      ready: async () => {
        await expect(drill).toHaveCount(0);
        await expect(trigger).toBeFocused();
      },
    });
  }
  observe(
    journey,
    `${prefix}/drill-inventory`,
    count === 0 ? "not-applicable" : "visited",
    `${String(count)} actual rack/template edit doors traversed without editing original fields`,
  );
}

type ListedPreset = Awaited<ReturnType<SurfaceFlow["client"]["preset"]["list"]["query"]>>[number];

async function expectPresetIdentity(journey: Journey, name: string): Promise<void> {
  const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
  const identities = [
    editor.locator('[data-shell-identity="defer"]'),
    journey.flow.page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title'),
  ];
  await expect
    .poll(async () => {
      const visible = await Promise.all(
        identities.map(async (identity) => {
          if (!(await identity.isVisible())) {
            return null;
          }
          return (await identity.textContent())?.trim() ?? null;
        }),
      );
      return visible.filter((identity): identity is string => identity !== null);
    })
    .toEqual([name]);
}

async function createDisposablePreset(journey: Journey, onCreated: (created: ListedPreset) => void): Promise<ListedPreset> {
  await reveal(journey, "list");
  const before = new Set((await journey.flow.client.preset.list.query()).map(({ id }) => id));
  const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
  let created: ListedPreset | undefined;
  await journey.flow.action("presets/disposable/create", {
    action: async () => {
      const [response] = await Promise.all([
        journey.flow.page.waitForResponse((item) => new URL(item.url()).origin === journey.flow.run.origin && isTrpcRequestFor(item.url(), "preset.create")),
        pane(journey, "list").getByRole("button", { name: "New", exact: true }).click(),
      ]);
      created = await readTrpcOutput(response, "preset.create", presetDetailSchema);
      expect(
        journey.flow.run.subjects.presets.some(({ id }) => id === created?.id),
        "Disposable mutation must never select an original preset",
      ).toBe(false);
      onCreated(created);
    },
    ready: async () => {
      await expect.poll(async () => (await journey.flow.client.preset.list.query()).filter(({ id }) => !before.has(id)).length).toBe(1);
      const committed = created;
      if (committed === undefined || !(await journey.flow.client.preset.list.query()).some(({ id }) => id === committed.id)) {
        throw new Error("Native New left no committed disposable identity");
      }
      await ready(editor);
      await expectPresetIdentity(journey, committed.name);
    },
  });
  if (created === undefined) {
    throw new Error("The native create did not leave its one disposable preset");
  }
  return created;
}

async function renameDisposablePreset(journey: Journey, created: ListedPreset): Promise<string> {
  const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
  await editor.getByRole("button", { name: "Rename preset", exact: true }).click();
  const dialog = journey.flow.page.getByRole("dialog", { name: "Rename preset", exact: true });
  const field = dialog.getByRole("textbox", { name: "Preset name", exact: true });
  await expect(field).toHaveValue(created.name);
  const renamed = `Surface walk ${created.id}`;
  await field.fill(renamed);
  await journey.flow.action("presets/disposable/rename", {
    action: async () => {
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    },
    ready: async () => {
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await journey.flow.client.preset.get.query({ id: created.id })).name).toBe(renamed);
      await expectPresetIdentity(journey, renamed);
    },
  });
  return renamed;
}

async function runDisposablePreset(flow: SurfaceFlow): Promise<{ readonly expected: Journey["expected"]; readonly observations: Journey["observations"] }> {
  const journey = sectionJourney(flow, "presets");
  const createdIds = new Set<ListedPreset["id"]>();
  await enter(journey, "presets");
  try {
    const created = await createDisposablePreset(journey, ({ id }) => createdIds.add(id));
    const renamed = await renameDisposablePreset(journey, created);
    const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
    await journey.flow.page.reload();
    await waitForAppReady(journey.flow.page);
    await journey.flow.requestPanes();
    await reveal(journey, "list");
    const row = pane(journey, "list").getByRole("button", { name: renamed, exact: true });
    await expect(row).toBeVisible();
    await expect.poll(async () => (await journey.flow.client.preset.get.query({ id: created.id })).name).toBe(renamed);
    await journey.flow.action("presets/disposable/reload-reselect", {
      action: async () => {
        await row.click();
      },
      ready: async () => {
        await ready(editor);
        await expectPresetIdentity(journey, renamed);
      },
    });
    await inspect(journey, editor, "presets/disposable/persisted");
    observe(
      journey,
      "presets/disposable/reload",
      "visited",
      "Reload starts a new document lifetime; the persisted native library row is reselected and its production identity is witnessed without fabricating a same-document reload duration",
    );
    observe(
      journey,
      "presets/disposable/persistence",
      "visited",
      `Native create/name edit/reload over newly created ${created.id}; originals and active-generation selection untouched`,
    );
    return { expected: journey.expected, observations: journey.observations };
  } finally {
    for (const id of createdIds) {
      expect(journey.flow.run.subjects.presets.some(({ id: originalId }) => originalId === id)).toBe(false);
      await journey.flow.client.preset.remove.mutate({ id });
      await expect.poll(async () => (await journey.flow.client.preset.list.query()).some(({ id: remaining }) => remaining === id)).toBe(false);
    }
    observe(journey, "presets/disposable/cleanup", "visited", "Production remove verified the explicitly disposable preset is gone");
  }
}

async function disposablePreset(journey: Journey): Promise<void> {
  const result = await runDisposablePreset(journey.flow);
  journey.expected.push(...result.expected);
  journey.observations.push(...result.observations);
}

interface PresetCommandRun {
  readonly journey: Journey;
  readonly presetId: ListedPreset["id"];
  readonly proofs: Map<string, string>;
  readonly created: Set<ListedPreset["id"]>;
}

function rememberPresetCommand(run: PresetCommandRun, command: string, reason: string): void {
  run.proofs.set(command, reason);
  observe(run.journey, `presets/commands/${command}`, "visited", reason);
}

function presetLibraryRow(journey: Journey, name: string): Locator {
  return pane(journey, "list")
    .locator('[data-slot="list-row-root"]')
    .filter({ has: journey.flow.page.getByRole("button", { name, exact: true }) });
}

async function openPresetRowMenu(journey: Journey, name: string): Promise<Locator> {
  await reveal(journey, "list");
  const row = presetLibraryRow(journey, name);
  await expect(row).toHaveCount(1);
  await row.hover();
  await row.locator('button[aria-haspopup="menu"]').click();
  const menu = journey.flow.page.getByRole("menu");
  await expect(menu).toHaveCount(1);
  return menu;
}

/** Execute the real disposable command segment; the enclosing rail owns its final inventory publication. */
async function walkPresetCommands(
  flow: SurfaceFlow,
  sourceId: ListedPreset["id"],
): Promise<{
  readonly expected: Journey["expected"];
  readonly observations: Journey["observations"];
  readonly proofs: ReadonlyMap<string, string>;
}> {
  const journey = sectionJourney(flow, "presets");
  if (!flow.run.subjects.presets.some(({ id }) => id === sourceId)) {
    throw new Error("Preset command copies require an admitted original source");
  }
  const source = await flow.client.preset.get.query({ id: sourceId });
  const created = new Set<ListedPreset["id"]>();
  const proofs = new Map<string, string>();
  try {
    await enter(journey, "presets");
    const menu = await openPresetRowMenu(journey, source.name);
    await journey.flow.action("presets/commands/library/Duplicate", {
      action: async () => {
        const [response] = await Promise.all([
          flow.page.waitForResponse((item) => new URL(item.url()).origin === flow.run.origin && isTrpcRequestFor(item.url(), "preset.create")),
          menu.getByRole("menuitem", { name: "Duplicate", exact: true }).click(),
        ]);
        const copied = await readTrpcOutput(response, "preset.create", presetDetailSchema);
        expect(flow.run.subjects.presets.some(({ id }) => id === copied.id)).toBe(false);
        created.add(copied.id);
      },
      ready: async () => {
        const id = [...created][0];
        if (id === undefined) {
          throw new Error("The committed native copy has no canonical identity");
        }
        const copied = await flow.client.preset.get.query({ id });
        await expect(
          flow.page.getByRole("region", { name: "Preset editor", exact: true }).getByRole("heading", { name: copied.name, exact: true }),
        ).toBeVisible();
      },
    });
    const copiedId = [...created][0];
    if (copiedId === undefined) {
      throw new Error("Native Duplicate left no captured preset identity");
    }
    const copied = await flow.client.preset.get.query({ id: copiedId });
    expect((await journey.flow.client.preset.get.query({ id: copied.id })).config).toEqual(
      (await journey.flow.client.preset.get.query({ id: source.id })).config,
    );
    const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
    await expect(editor.getByRole("heading", { name: copied.name, exact: true })).toBeAttached();
    const name = await renameDisposablePreset(journey, copied);
    const run: PresetCommandRun = { journey, presetId: copied.id, proofs, created };
    rememberPresetCommand(run, "library/Duplicate", `Native Duplicate of original ${source.id} created separate ${copied.id}, with the same canonical config`);
    await presetSectionCommands(run);
    const exported = await exportDisposablePreset(run, name);
    await deleteDisposablePreset(run, name);
    created.delete(copied.id);
    const imported = await importDisposablePreset(run, exported);
    expect(imported.config).toEqual(exported.config);
    await deleteDisposablePreset({ ...run, presetId: imported.id }, imported.name);
    created.delete(imported.id);
    return { expected: journey.expected, observations: journey.observations, proofs };
  } finally {
    for (const id of created) {
      await journey.flow.client.preset.remove.mutate({ id });
    }
    await journey.flow.requestPanes();
    await attachNativeFile(flow.info, flow.info, "preset-command-segment", {
      body: JSON.stringify({ expected: journey.expected, observations: journey.observations, proofs: [...proofs] }),
      contentType: "application/json",
    });
  }
}

function settlePresetMenus(journey: Journey, proofs: ReadonlyMap<string, string>): void {
  for (const pending of journey.presetMenus) {
    const missing = pending.leaves.filter((leaf) => !proofs.has(`${pending.family}/${leaf}`));
    for (const [index, leaf] of pending.leaves.entries()) {
      const proof = proofs.get(`${pending.family}/${leaf}`);
      observe(
        journey,
        `${pending.id}/leaf-${String(index)}`,
        proof === undefined ? "unvisited" : "excluded",
        proof === undefined
          ? `No execution witness exists for actual original command ${leaf}`
          : `Original snapshot command ${leaf} remains read-only; separate production-created subject execution: ${proof}`,
      );
    }
    observe(
      journey,
      `${pending.id}/leaf-actions`,
      missing.length === 0 ? "excluded" : "unvisited",
      missing.length === 0
        ? `Every actual command has a named disposable execution witness; original mutation boundary retained: ${pending.leaves.join("; ")}`
        : `Actual commands still without execution witnesses: ${missing.join("; ")}`,
    );
  }
}

async function presetSectionCommands(run: PresetCommandRun): Promise<void> {
  const { journey, presetId } = run;
  const editor = journey.flow.page.getByRole("region", { name: "Preset editor", exact: true });
  const prompt = editor.getByRole("tab", { name: "Prompt", exact: true });
  await prompt.click();
  const body = await controlledPanel(prompt);
  const add = body.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const addMenu = journey.flow.page.getByRole("menu");
  await ready(addMenu);
  await expect(addMenu.getByRole("menuitem")).not.toHaveCount(0);
  const options = (await addMenu.getByRole("menuitem").allTextContents()).map((label) => label.trim());
  await journey.flow.page.getByRole("menu").press("Escape");
  let literalId: string | null = null;
  for (const label of options) {
    const before = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
    await add.click();
    await journey.flow.action(`presets/commands/Add/${label}`, {
      action: async () => {
        await journey.flow.page.getByRole("menu").getByRole("menuitem", { name: label, exact: true }).click();
      },
      ready: async () => {
        await expect.poll(async () => (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.length).toBe(before.length + 1);
        await ready(body.getByRole("region", { name: / — section editor$/u }));
      },
    });
    const added = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.filter(
      (candidate) => !before.some(({ id }) => id === candidate.id),
    );
    expect(added).toHaveLength(1);
    const section = added.at(0);
    if (section === undefined) {
      throw new Error("Native Add left no new section identity");
    }
    const drill = body.getByRole("region", { name: `${section.name} — section editor`, exact: true });
    await expect(drill).toBeVisible();
    if (section.type === "literal") {
      literalId = section.id;
    }
    rememberPresetCommand(run, `Add/${label}`, `${presetId}/${section.id}: native Add ${label} persisted one new section and opened its real editor`);
    await drill.getByRole("button", { name: "Back to rack", exact: true }).click();
    await expect(drill).toBeHidden();
  }
  if (literalId === null) {
    throw new Error("The actual Add menu must offer its authorable literal section");
  }
  const sections = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
  const marker = sections.find((section) => section.type === "marker" && section.marker !== "chat_history");
  if (marker === undefined) {
    throw new Error("The copied preset has no structural section for the actual marker menu");
  }
  for (const id of [marker.id, literalId]) {
    const section = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.find((candidate) => candidate.id === id);
    if (section === undefined) {
      throw new Error("Disposable section left its canonical preset");
    }
    const trigger = body.getByRole("button", { name: `Edit ${section.name}`, exact: true });
    await expect(trigger).toHaveCount(1);
    await trigger.click();
    const drill = body.getByRole("region", { name: / — section editor$/u });
    await expect(drill).toHaveCount(1);
    const uniqueName = `Surface section ${crypto.randomUUID()}`;
    await drill.getByRole("textbox", { name: "Name", exact: true }).fill(uniqueName);
    await expect
      .poll(async () => (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.find((candidate) => candidate.id === id)?.name)
      .toBe(uniqueName);
    await moveDisposableSection(run, drill, id);
    await moveDisposableSection(run, drill, id);
    if (id === literalId) {
      await duplicateAndDeleteSection(run, drill, id);
    } else {
      await drill.getByRole("button", { name: "Back to rack", exact: true }).click();
    }
  }
}

async function moveDisposableSection(run: PresetCommandRun, drill: Locator, sectionId: string): Promise<void> {
  const { journey, presetId } = run;
  await drill.getByRole("button", { name: "Section actions", exact: true }).click();
  const item = journey.flow.page.getByRole("menu").getByRole("menuitem", { name: /^Move (?:above|below) the conversation$/u });
  await expect(item).toHaveCount(1);
  const label = (await item.textContent())?.trim();
  if (label === undefined) {
    throw new Error("The actual Move command has no label");
  }
  const before = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
  await journey.flow.action(`presets/commands/${sectionId}/${label}`, {
    action: async () => {
      await item.click();
    },
    ready: async () => {
      await expect
        .poll(async () => (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.map(({ id }) => id))
        .not.toEqual(before.map(({ id }) => id));
      await expect(drill).toBeVisible();
    },
  });
  const sections = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
  const pivot = sections.findIndex((section) => section.type === "marker" && section.marker === "chat_history");
  const position = sections.findIndex(({ id }) => id === sectionId);
  expect(pivot).toBeGreaterThanOrEqual(0);
  expect(position).toBeGreaterThanOrEqual(0);
  expect(label.includes("above") ? position < pivot : position > pivot).toBe(true);
  rememberPresetCommand(
    run,
    `Section actions/${label}`,
    `${presetId}/${sectionId}: ${label} persisted the section on the named side of the real conversation pivot`,
  );
}

async function duplicateAndDeleteSection(run: PresetCommandRun, drill: Locator, sectionId: string): Promise<void> {
  const { journey, presetId } = run;
  const before = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
  await drill.getByRole("button", { name: "Section actions", exact: true }).click();
  await journey.flow.action(`presets/commands/${sectionId}/Duplicate`, {
    action: async () => {
      await journey.flow.page.getByRole("menu").getByRole("menuitem", { name: "Duplicate", exact: true }).click();
    },
    ready: async () => {
      await expect.poll(async () => (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.length).toBe(before.length + 1);
      await expect(drill).toBeVisible();
    },
  });
  const after = (await journey.flow.client.preset.get.query({ id: presetId })).config.sections;
  const duplicated = after.filter((section) => !before.some(({ id }) => id === section.id));
  expect(duplicated).toHaveLength(1);
  const original = before.find(({ id }) => id === sectionId);
  const copy = duplicated.at(0);
  if (original === undefined || copy === undefined) {
    throw new Error("Native section Duplicate did not retain both identities");
  }
  const { id: originalId, ...originalFields } = original;
  const { id: copyId, ...copyFields } = copy;
  expect(copyId).not.toBe(originalId);
  expect(copyFields).toEqual(originalFields);
  rememberPresetCommand(run, "Section actions/Duplicate", `${presetId}/${sectionId}: native Duplicate persisted ${copyId} with the same section fields`);
  await drill.getByRole("button", { name: "Section actions", exact: true }).click();
  await journey.flow.page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true }).click();
  const confirm = journey.flow.page.getByRole("alertdialog", { name: "Delete this section?", exact: true });
  await checkpoint(journey, `presets/commands/${sectionId}/Delete/confirm`, confirm);
  await journey.flow.action(`presets/commands/${sectionId}/Delete`, {
    action: async () => {
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    },
    ready: async () => {
      await expect(confirm).toBeHidden();
      const expectedIds = after.filter(({ id }) => id !== sectionId).map(({ id }) => id);
      await expect.poll(async () => (await journey.flow.client.preset.get.query({ id: presetId })).config.sections.map(({ id }) => id)).toEqual(expectedIds);
      await expect(drill).toBeHidden();
    },
  });
  rememberPresetCommand(
    run,
    "Section actions/Delete",
    `${presetId}/${sectionId}: confirmed native Delete removed exactly the disposable original section; duplicate remains`,
  );
}

async function exportDisposablePreset(run: PresetCommandRun, name: string): Promise<{ readonly path: string; readonly config: PromptConfig }> {
  const { journey, presetId } = run;
  const menu = await openPresetRowMenu(journey, name);
  const path = journey.flow.info.outputPath(`preset-${presetId}.json`);
  const expected = await journey.flow.client.preset.get.query({ id: presetId });
  await journey.flow.action(`presets/commands/${presetId}/Export`, {
    action: async () => {
      const downloading = journey.flow.page.waitForEvent("download");
      await menu.getByRole("menuitem", { name: "Export", exact: true }).click();
      await (await downloading).saveAs(path);
    },
    ready: async () => {
      const parsed = parsePresetFile(JSON.parse(await readFile(path, "utf8")));
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      expect(parsed.name).toBe(name);
      expect(parsed.config).toEqual(expected.config);
      await expect(menu).toBeHidden();
    },
  });
  await journey.flow.info.attach("native-preset-export", { path, contentType: "application/json" });
  rememberPresetCommand(run, "library/Export", `${presetId}: real native download parsed through parsePresetFile and matched the entire persisted config`);
  return { path, config: expected.config };
}

async function deleteDisposablePreset(run: PresetCommandRun, name: string): Promise<void> {
  const { journey, presetId } = run;
  expect(journey.flow.run.subjects.presets.some(({ id }) => id === presetId)).toBe(false);
  const menu = await openPresetRowMenu(journey, name);
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const confirm = journey.flow.page.getByRole("alertdialog", { name: `Delete "${name}"?`, exact: true });
  await checkpoint(journey, `presets/commands/${presetId}/Delete/confirm`, confirm);
  await journey.flow.action(`presets/commands/${presetId}/Delete`, {
    action: async () => {
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    },
    ready: async () => {
      await expect(confirm).toBeHidden();
      await expect.poll(async () => (await journey.flow.client.preset.list.query()).some(({ id }) => id === presetId)).toBe(false);
      await expect(presetLibraryRow(journey, name)).toHaveCount(0);
    },
  });
  rememberPresetCommand(run, "library/Delete", `${presetId}: confirmed native Delete removed the separately created preset from the actual library`);
}

async function importDisposablePreset(
  run: PresetCommandRun,
  exported: Awaited<ReturnType<typeof exportDisposablePreset>>,
): Promise<Awaited<ReturnType<SurfaceFlow["client"]["preset"]["get"]["query"]>>> {
  const { journey } = run;
  const importedIds: ListedPreset["id"][] = [];
  await reveal(journey, "list");
  await pane(journey, "list").getByRole("button", { name: "Import a preset", exact: true }).click();
  const dialog = journey.flow.page.getByRole("dialog", { name: "Import a preset", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(exported.path);
  await expect(dialog.getByRole("button", { name: "Import preset", exact: true })).toBeEnabled();
  await journey.flow.action("presets/commands/import-export-roundtrip", {
    action: async () => {
      const [response] = await Promise.all([
        journey.flow.page.waitForResponse(
          (item) => new URL(item.url()).origin === journey.flow.run.origin && isTrpcRequestFor(item.url(), "preset.importFile"),
        ),
        dialog.getByRole("button", { name: "Import preset", exact: true }).click(),
      ]);
      const outcome = await readTrpcOutput(response, "preset.importFile", presetImportOutcomeSchema);
      if (!(outcome.ok && outcome.created) || outcome.presetId === undefined) {
        throw new Error("The native roundtrip import did not create a separate preset");
      }
      expect(journey.flow.run.subjects.presets.some(({ id }) => id === outcome.presetId)).toBe(false);
      run.created.add(outcome.presetId);
      importedIds.push(outcome.presetId);
    },
    ready: async () => {
      await expect(dialog).toBeHidden();
      expect(importedIds).toHaveLength(1);
    },
  });
  const importedId = importedIds[0];
  if (importedId === undefined) {
    throw new Error("The native import left no captured preset identity");
  }
  const imported = await journey.flow.client.preset.get.query({ id: importedId });
  observe(
    journey,
    "presets/commands/import-export-roundtrip",
    "visited",
    `Real native exported file imported as separate ${imported.id}; no original-name collision or synthetic response`,
  );
  return await journey.flow.client.preset.get.query({ id: imported.id });
}

async function databankAdd(journey: Journey): Promise<void> {
  const add = pane(journey, "list").getByRole("button", { name: "Add", exact: true });
  const dialog = journey.flow.page.getByRole("dialog", { name: "Add a document", exact: true });
  await journey.flow.action("databank/add-open", {
    action: async () => {
      await add.click();
    },
    ready: async () => {
      await ready(dialog);
    },
  });
  await pressableChoices(journey, dialog.locator('[aria-label="How to add the document"]'), dialog, "databank/add/method");
  await inspect(journey, dialog, "databank/add/ceremony");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function databankLibrary(journey: Journey): Promise<void> {
  const back = journey.flow.page.getByRole("button", { name: `Back to ${DATABANK_SECTION_LABEL}`, exact: true });
  if (await back.isVisible()) {
    await back.click();
  }
  await reveal(journey, "list");
  await expect(pane(journey, "list").getByRole("textbox", { name: "Search documents", exact: true })).toBeVisible();
}

async function databankMaintenance(journey: Journey, empty: boolean): Promise<void> {
  await databankLibrary(journey);
  const trigger = pane(journey, "list").getByRole("button", { name: "Databank maintenance", exact: true });
  for (const name of ["Rebuild all documents", "Re-read all documents"]) {
    await trigger.click();
    const menu = journey.flow.page.getByRole("menu");
    const item = menu.getByRole("menuitem", { name, exact: true });
    await expect(item).toBeEnabled({ enabled: !empty });
    if (empty) {
      await checkpoint(journey, `databank/library/maintenance/${name}/empty`, menu);
      await menu.press("Escape");
    } else {
      await databankMaintenanceConfirmation(journey, item, name);
    }
  }
  observe(
    journey,
    empty ? "databank/library/menu-0/leaf-actions" : "databank/library/maintenance/confirmations",
    empty ? "not-applicable" : "visited",
    empty
      ? "Both production maintenance items are disabled over the actually empty bank"
      : "Both enabled maintenance commands opened their real confirmation and were cancelled; no job acceptance claimed",
  );
}

async function databankMaintenanceConfirmation(journey: Journey, item: Locator, name: string): Promise<void> {
  await item.click();
  const dialog = journey.flow.page.getByRole("alertdialog", { name: `${name}?`, exact: true });
  await checkpoint(journey, `databank/library/maintenance/${name}/confirmation`, dialog);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function databankDisposable(journey: Journey): Promise<void> {
  const name = `Surface disposable document ${journey.flow.info.project.name}`;
  const renamed = `${name} renamed`;
  const text = `Disposable local surface journey source: ${journey.flow.info.project.name}. This document is created by Paste text and removed after persistence checks.`;
  const editor = journey.flow.page.locator('[data-slot="databank-detail-editor"]');
  await databankLibrary(journey);
  await pane(journey, "list").getByRole("button", { name: "Add", exact: true }).click();
  const add = journey.flow.page.getByRole("dialog", { name: "Add a document", exact: true });
  await add.getByRole("button", { name: "Paste text", exact: true }).click();
  await add.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await add.getByRole("textbox", { name: "Text", exact: true }).fill(text);
  await journey.flow.action("databank/disposable/paste", {
    action: async () => {
      await add.getByRole("button", { name: "Add", exact: true }).click();
    },
    ready: async () => {
      await expect(add).toBeHidden();
      await expect(editor.getByRole("heading", { name, exact: true })).toBeAttached();
    },
  });
  const found = (await journey.flow.client.databank.list.query({ search: name })).items.filter((item) => item.name === name);
  expect(found).toHaveLength(1);
  const document = found[0];
  if (document === undefined) {
    throw new Error("Native Paste did not create the disposable document");
  }
  expect(journey.flow.run.subjects.documents.some(({ id }) => id === document.id)).toBe(false);
  await attachNativeFile(journey.flow.info, journey.flow.info, "databank-disposable-identity", {
    body: JSON.stringify({ id: document.id, name, provenance: "production-native-paste-disposable", original: false }),
    contentType: "application/json",
  });
  try {
    const stored = await journey.flow.client.databank.get.query({ id: document.id, includeText: true });
    expect(stored.extractedText).toBe(text);
    observe(
      journey,
      "databank/ingestion",
      "visited",
      "Native Paste text persisted a separately labelled disposable document; indexing completion is judged separately",
    );
    await inspect(journey, content(journey), "databank/disposable/detail");
    await editor.getByRole("button", { name: "View source text", exact: true }).click();
    await expect(editor.getByText(text, { exact: true })).toBeVisible();
    await inspect(journey, content(journey), "databank/disposable/source-text");
    await context(journey, "databank/disposable");
    await reveal(journey, "context");
    const everywhere = pane(journey, "context").getByRole("switch", { name: "Use in every chat", exact: true });
    await expect(everywhere).toBeChecked();
    await everywhere.click();
    await expect(everywhere).not.toBeChecked();
    await expect.poll(async () => (await journey.flow.client.databank.listGlobal.query()).includes(document.id)).toBe(false);
    await dismissContext(journey);
    await databankLibrary(journey);
    const search = pane(journey, "list").getByRole("textbox", { name: "Search documents", exact: true });
    await search.fill(name);
    const actions = (): Locator => pane(journey, "list").getByRole("button", { name: rowActionsName(name), exact: true });
    await pane(journey, "list").getByRole("button", { name, exact: true }).focus();
    await actions().click();
    await checkpoint(journey, "databank/disposable/row-menu", journey.flow.page.getByRole("menu"));
    await attachNativeFile(journey.flow.info, journey.flow.info, "databank-disposable-row-commands", {
      body: await journey.flow.page.getByRole("menu").ariaSnapshot(),
      contentType: "text/plain",
    });
    await journey.flow.page.getByRole("menuitem", { name: "Feed every chat", exact: true }).click();
    await expect.poll(async () => (await journey.flow.client.databank.listGlobal.query()).includes(document.id)).toBe(true);
    await actions().click();
    await journey.flow.page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const rename = journey.flow.page.getByRole("dialog", { name: "Rename document", exact: true });
    await rename.getByRole("textbox", { name: "Document name", exact: true }).fill(renamed);
    await rename.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await journey.flow.client.databank.get.query({ id: document.id })).name).toBe(renamed);
    await journey.flow.page.reload();
    await waitForAppReady(journey.flow.page);
    await databankLibrary(journey);
    await pane(journey, "list").getByRole("textbox", { name: "Search documents", exact: true }).fill(renamed);
    await pane(journey, "list").getByRole("button", { name: renamed, exact: true }).click();
    await expect(editor.getByRole("heading", { name: renamed, exact: true })).toBeAttached();
    await reveal(journey, "context");
    await expect(everywhere).toBeChecked();
    await dismissContext(journey);
    await editor.getByRole("button", { name: "View source text", exact: true }).click();
    await expect(editor.getByText(text, { exact: true })).toBeVisible();
    await inspect(journey, content(journey), "databank/disposable/reloaded");
    observe(journey, "databank/disposable/persistence", "visited", "Native rename and Context/row global writes survived reload and production reads");
    await databankMaintenance(journey, false);
    await databankLibrary(journey);
    await pane(journey, "list").getByRole("textbox", { name: "Search documents", exact: true }).fill(renamed);
    await pane(journey, "list").getByRole("button", { name: renamed, exact: true }).focus();
    await pane(journey, "list")
      .getByRole("button", { name: rowActionsName(renamed), exact: true })
      .click();
    await journey.flow.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const confirm = journey.flow.page.getByRole("alertdialog", { name: `Delete "${renamed}"?`, exact: true });
    await checkpoint(journey, "databank/disposable/delete-confirm", confirm);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect.poll(async () => (await journey.flow.client.databank.list.query({ search: renamed })).items.some(({ id }) => id === document.id)).toBe(false);
    await expect(pane(journey, "list").getByText("No matches", { exact: true })).toBeVisible();
    observe(
      journey,
      "databank/disposable/cleanup",
      "visited",
      "Native Delete confirmation removed the disposable document; production list and rendered search verify absence",
    );
  } finally {
    const remaining = await journey.flow.client.databank.list.query({ search: "Surface disposable document" });
    if (remaining.items.some(({ id }) => id === document.id)) {
      await journey.flow.client.databank.remove.mutate({ id: document.id });
      observe(
        journey,
        "databank/disposable/failure-cleanup",
        "visited",
        "Production remove cleaned the disposable after a driver failure; native delete acceptance is not claimed",
      );
    }
  }
  observe(
    journey,
    "databank/external-ingestion",
    "excluded",
    "The authorized root refuses file extraction, remote link fetching and embedding execution; Paste canon persistence is separate and no index completion is claimed",
  );
}

async function databank(journey: Journey): Promise<void> {
  await enter(journey, "databank");
  await databankLibrary(journey);
  await checkpoint(journey, "databank/library", pane(journey, "list"));
  await databankAdd(journey);
  let listed = await journey.flow.client.databank.list.query({});
  const documents = [...listed.items];
  while (listed.nextCursor !== null) {
    listed = await journey.flow.client.databank.list.query({ cursor: listed.nextCursor });
    documents.push(...listed.items);
  }
  const originals = documents.filter((item) => journey.flow.run.subjects.documents.some(({ id }) => id === item.id));
  observe(
    journey,
    "databank/document-census",
    "observed",
    `${String(documents.length)} actual readable owner documents; ${String(originals.length)} admitted original snapshot documents`,
  );
  await databankMaintenance(journey, documents.length === 0);
  const subject = originals.find((item) => originals.filter((candidate) => candidate.name === item.name).length === 1);
  if (subject === undefined) {
    observe(
      journey,
      "databank/document",
      originals.length === 0 ? "not-applicable" : "unvisited",
      originals.length === 0
        ? "The production API confirms zero original readable documents; no disposable document is presented as original"
        : "Available original documents have ambiguous native names; no guessed document is selected",
    );
    if (documents.length === 0) {
      await checkpoint(journey, "databank/original-empty-library", pane(journey, "list"), pane(journey, "list").getByText("No documents yet", { exact: true }));
    }
    await databankDisposable(journey);
    return;
  }
  await databankDisposable(journey);
  const search = pane(journey, "list").getByRole("textbox", { name: "Search documents", exact: true });
  const matches = await journey.flow.client.databank.list.query({ search: subject.name });
  expect(matches.items.filter(({ id }) => id === subject.id)).toHaveLength(1);
  const row = pane(journey, "list").getByRole("list", { name: "Documents", exact: true }).getByRole("button", { name: subject.name, exact: true });
  await journey.flow.action(`databank/reveal/${subject.id}`, {
    action: async () => {
      await search.fill(SEARCH_MISS);
      await expect(pane(journey, "list").getByText("No matches", { exact: true })).toBeVisible();
      await search.fill(subject.name);
    },
    ready: async () => {
      await expect(search).toHaveValue(subject.name);
      await expect(row).toHaveCount(1);
      await expect(row).toBeVisible();
    },
  });
  await attachNativeFile(journey.flow.info, journey.flow.info, `databank-${subject.id}-native-row-identity`, {
    body: JSON.stringify({ documentId: subject.id, search: subject.name, nativeRow: await row.ariaSnapshot() }),
    contentType: "application/json",
  });
  const editor = journey.flow.page.locator('[data-slot="databank-detail-editor"]');
  await journey.flow.action(`databank/open/${subject.id}`, {
    action: async () => {
      await row.click();
    },
    ready: async () => {
      await ready(editor);
      await expect(editor.getByRole("heading", { name: subject.name, exact: true })).toBeAttached();
    },
  });
  await inspect(journey, content(journey), `databank/${subject.id}/detail`);
  const source = editor.getByRole("button", { name: "View source text", exact: true });
  const stored = await journey.flow.client.databank.get.query({ id: subject.id, includeText: true });
  await journey.flow.action(`databank/${subject.id}/source`, {
    action: async () => {
      await source.click();
    },
    ready: async () => {
      await expect(editor.getByRole("button", { name: "Hide source text", exact: true })).toBeVisible();
      await expect(editor.getByText("Loading the source text…", { exact: true })).toHaveCount(0);
    },
  });
  await inspect(journey, content(journey), `databank/${subject.id}/source-text`);
  observe(
    journey,
    `databank/${subject.id}/source-read`,
    "visited",
    `Actual extracted source length ${String(stored.extractedText?.length ?? 0)}; no source bytes duplicated in coverage metadata`,
  );
  await context(journey, `databank/${subject.id}`);
  await journey.flow.requestPanes();
  observe(journey, "databank/maintenance", "unvisited", "Reindex/re-extract, feed-everywhere and destructive original-document operations are not invoked");
}

async function refinery(journey: Journey): Promise<void> {
  await enter(journey, "refinery");
  if (!(await content(journey).isVisible())) {
    await switchListScreen(journey);
  }
  await ready(content(journey));
  await loadRefineryPicker(journey);
  await inspect(journey, content(journey), "refinery/landing");
  await reveal(journey, "list");
  await inspect(journey, pane(journey, "list"), "refinery/sessions");
  const rows = await journey.flow.client.refinery.listSessions.query();
  const originals = rows.filter((item) => journey.flow.run.subjects.refinerySessions.some(({ id }) => id === item.id));
  observe(
    journey,
    "refinery/session-census",
    "observed",
    `${String(rows.length)} actual readable owner sessions; ${String(originals.length)} admitted original snapshot sessions`,
  );
  const subject = originals.find((item) => originals.filter((candidate) => candidate.characterName === item.characterName).length === 1);
  if (subject === undefined) {
    observe(
      journey,
      "refinery/workbench",
      originals.length === 0 ? "not-applicable" : "unvisited",
      originals.length === 0
        ? "The production API confirms zero original sessions; the separately labelled disposable workbench is not an existing-session witness"
        : "Available original sessions have ambiguous native row names; no guessed subject is selected",
    );
    if (rows.length === 0) {
      const empty = pane(journey, "list").getByText("No refinery sessions yet", { exact: true });
      await checkpoint(journey, "refinery/original-empty-library", pane(journey, "list"), empty);
    }
    await disposableRefinery(journey);
    return;
  }
  const row = pane(journey, "list").getByRole("button", { name: subject.characterName, exact: true });
  await refineryWorkbench(journey, row, `refinery/${subject.id}`);
}

async function refineryWorkbench(journey: Journey, row: Locator, prefix: string): Promise<void> {
  await journey.flow.action(`${prefix}/open`, {
    action: async () => {
      await row.click();
    },
    ready: async () => {
      await expect(content(journey).getByRole("group", { name: "Session state", exact: true })).toBeVisible();
      await ready(content(journey));
    },
  });
  await inspect(journey, content(journey), `${prefix}/workbench`);
  await refineryDialogs(journey, prefix);
  await context(journey, prefix);
  await refinerySetup(journey, prefix);
  await refineryVersions(journey, prefix);
  await journey.flow.requestPanes();
  await inspect(journey, content(journey), `${prefix}/requested-panes`);
  observe(
    journey,
    "refinery/runs",
    "unvisited",
    "Score/rewrite/analyze, iterate/apply/copy and original session/card mutation are not invoked; existing run payloads are read only",
  );
}

/** Stage execution mutates only its separately attributed disposable card and session, never an admitted original. */
export async function walkRefineryExecution(flow: SurfaceFlow): Promise<void> {
  const journey = sectionJourney(flow, "refinery");
  const originalId = flow.run.subjects.characters.at(0)?.id;
  if (originalId === undefined) {
    throw new Error("Refinery execution requires an admitted owned card to copy");
  }
  const original = await flow.client.character.get.query({ characterId: originalId });
  const binding = (await flow.client.connection.listBindings.query()).find(({ task }) => task === "summarize");
  if (binding === undefined) {
    throw new Error("The production binding catalogue has no summarize task");
  }
  const previousBinding = binding.binding?.connectionId ?? null;
  // Refinery stages request structured output, which only the disposable structured connection declares.
  const connectionId = flow.run.generation.structuredConnection.id;
  const consent = (await flow.client.connection.get.query({ connectionId })).allowBackground;
  const characters = new Set<CharacterId>();
  const sessions = new Set<RefinerySessionId>();
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    expect(await flow.client.character.get.query({ characterId: originalId })).toEqual(original);
  });
  cleanup.defer(async () => {
    for (const characterId of characters) {
      expect(flow.run.subjects.characters.some(({ id }) => id === characterId)).toBe(false);
      await flow.client.character.remove.mutate({ characterId });
    }
  });
  cleanup.defer(async () => {
    for (const sessionId of sessions) {
      await flow.client.refinery.deleteSession.mutate({ sessionId });
    }
    expect((await flow.client.refinery.listSessions.query()).some(({ id }) => sessions.has(id))).toBe(false);
  });
  cleanup.defer(async () => {
    await flow.client.connection.setBinding.mutate({ task: "summarize", connectionId: previousBinding });
    await flow.client.connection.update.mutate({ connectionId, patch: { allowBackground: consent } });
    expect((await flow.client.connection.listBindings.query()).find(({ task }) => task === "summarize")?.binding?.connectionId ?? null).toBe(previousBinding);
    expect((await flow.client.connection.get.query({ connectionId })).allowBackground).toBe(consent);
  });
  cleanup.defer(async () => {
    if (flow.page.url() === "about:blank") {
      return;
    }
    await flow.page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("button", { name: "Home", exact: true }).click();
    await expect(flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
  });
  try {
    await flow.client.connection.update.mutate({ connectionId, patch: { allowBackground: true } });
    await flow.client.connection.setBinding.mutate({ task: "summarize", connectionId });
    const copy = await flow.client.character.duplicate.mutate({ characterId: originalId });
    characters.add(copy.id);
    expect(flow.run.subjects.characters.some(({ id }) => id === copy.id)).toBe(false);
    const name = `Surface refinery ${crypto.randomUUID()}`;
    await flow.client.character.update.mutate({ characterId: copy.id, input: { name } });
    const before = await flow.client.character.get.query({ characterId: copy.id });
    const session = await flow.client.refinery.startSession.mutate({ characterId: copy.id, name });
    sessions.add(session.id);
    expect(flow.run.subjects.refinerySessions.some(({ id }) => id === session.id)).toBe(false);
    await attachNativeFile(flow.info, flow.info, "refinery-execution-custody", {
      body: JSON.stringify({
        originalId,
        disposableCharacterId: copy.id,
        disposableSessionId: session.id,
        original: false,
        before,
        originalCard: session.originalCard,
      }),
      contentType: "application/json",
    });
    await flow.client.refinery.updateSession.mutate({ sessionId: session.id, patch: { selection: { fields: ["description"] } } });
    await enter(journey, "refinery");
    observe(journey, "refinery", "visited", "The native rail opened the real Refinery before selecting its separately disposable execution subject");
    await reveal(journey, "list");
    await pane(journey, "list").getByRole("textbox", { name: "Search sessions by character or name", exact: true }).fill(name);
    await flow.action("refinery/execution/open-disposable", {
      action: async () => {
        await pane(journey, "list").getByRole("button", { name, exact: true }).click();
      },
      ready: async () => {
        await expect(content(journey).getByRole("group", { name: "Session state", exact: true })).toBeVisible();
      },
    });
    const runs: RefineryRun[] = [];
    for (const stage of REFINERY_STAGES) {
      const run = await refineryStageRun(journey, session.id, stage);
      expect(run.sourceRunId).toBe(runs.at(-1)?.id ?? null);
      runs.push(run);
      expect((await flow.client.character.get.query({ characterId: copy.id })).description).toBe(before.description);
    }
    await refineryIterate(journey, session.id, runs);
    const latestRewrite = runs.findLast(({ stage }) => stage === "rewrite");
    if (latestRewrite === undefined || latestRewrite.stage !== "rewrite") {
      throw new Error("The native refinement round produced no rewrite identity");
    }
    const rewrite = REFINERY_STAGE_PAYLOADS.rewrite.parse(latestRewrite.payload);
    const description = rewrite.fields.find(({ field }) => field === "description");
    if (description === undefined || !("text" in description)) {
      throw new Error("The maintained rewrite fixture did not produce its description entry");
    }
    expect(description.text).not.toBe(before.description);
    await content(journey).getByRole("button", { name: "Keep description", exact: true }).click();
    await expect.poll(async () => (await flow.client.refinery.getSession.query({ sessionId: session.id })).rewriteDecisions[latestRewrite.id]).toEqual([true]);
    await expect(content(journey).getByRole("button", { name: "Apply 1 kept", exact: true })).toBeEnabled();
    const branch = await refineryCopy(journey, session.id, characters);
    expect(branch.description).toBe(description.text);
    expect((await flow.client.character.get.query({ characterId: copy.id })).description).toBe(before.description);
    expect(await flow.client.character.listSnapshots.query({ characterId: copy.id })).toHaveLength(0);
    expect((await flow.client.refinery.getSession.query({ sessionId: session.id })).status).toBe("active");
    await content(journey).getByRole("button", { name: "Done", exact: true }).click();
    await refineryApply(journey, session.id, copy.id, description.text);
    await content(journey).getByRole("button", { name: "Done", exact: true }).click();
    await expect(content(journey).getByRole("button", { name: "Apply 1 kept", exact: true })).toBeDisabled();
    await refineryVersionRestore(journey, session.id, copy.id, before.description);
    expect((await flow.client.character.get.query({ characterId: branch.id })).description).toBe(description.text);
    expect((await flow.client.refinery.getSession.query({ sessionId: session.id })).originalCard).toEqual(session.originalCard);
    expect((await flow.client.refinery.listRuns.query({ sessionId: session.id })).map(({ id }) => id)).toEqual(runs.map(({ id }) => id));
    await attachNativeFile(flow.info, flow.info, "refinery-execution-results", {
      body: JSON.stringify({ sessionId: session.id, characterId: copy.id, branchId: branch.id, runs }),
      contentType: "application/json",
    });
    observe(
      journey,
      "refinery/runs",
      "visited",
      "Native score/rewrite/analyze and one complete iteration persisted real parsed runs and DAG parents; Keep/copy/apply/version restore exercised only the separately disposable subjects",
    );
  } catch (error) {
    observe(
      journey,
      "refinery/runs",
      "failed",
      "Native stage execution did not complete; the original thrown failure and partial production artifacts are retained",
    );
    throw error;
  } finally {
    await attachNativeFile(flow.info, flow.info, "refinery-execution-coverage", {
      body: JSON.stringify({ observations: journey.observations, expected: journey.expected }),
      contentType: "application/json",
    });
    await publishSurfaceInventory(flow.info, {
      name: "refinery/execution",
      expected: journey.expected,
      observations: journey.observations.map(({ status, ...observation }) => ({ ...observation, disposition: status })),
    });
  }
}

async function refineryStageRun(journey: Journey, sessionId: RefinerySessionId, stage: RefineryStage): Promise<RefineryRun> {
  const { flow } = journey;
  const cursor = await refineryRequestCursor(flow);
  let produced: RefineryRun | undefined;
  const lane = content(journey).locator(`[data-lane="${stage}"]`);
  await flow.action(`refinery/execution/${stage}`, {
    action: async () => {
      const [response] = await Promise.all([
        flow.page.waitForResponse((item) => new URL(item.url()).origin === flow.run.origin && isTrpcRequestFor(item.url(), "refinery.runStage")),
        lane.getByRole("button", { name: `Run ${stage}`, exact: true }).click(),
      ]);
      produced = await readTrpcOutput(response, "refinery.runStage", refineryRunViewSchema);
    },
    ready: async () => {
      await expect(lane.getByRole("button", { name: `Re-run ${stage}`, exact: true })).toBeEnabled();
    },
  });
  if (produced === undefined) {
    throw new Error("Native stage execution did not return a run identity");
  }
  expect(produced.sessionId).toBe(sessionId);
  expect(produced.model).toBe(flow.run.generation.structuredConnection.model);
  const [request] = await refineryRequestReceipt(journey, stage, cursor, 1);
  // The scripted reply is the one keyed by the schema name production itself put on the wire.
  const fixture = request?.structuredSchema === undefined ? undefined : CORPUS_STRUCTURED_REPLIES.get(request.structuredSchema);
  if (fixture === undefined) {
    throw new Error("The stage request carried no structured schema with a maintained scripted reply");
  }
  expect(produced.payload).toEqual(REFINERY_STAGE_PAYLOADS[stage].parse(JSON.parse(fixture)));
  await checkpoint(journey, `refinery/execution/${stage}/result`, lane, refineryPayloadWitness(lane, produced));
  return produced;
}

function refineryPayloadWitness(lane: Locator, run: RefineryRun): Locator {
  switch (run.stage) {
    case "score":
      return lane.getByText(REFINERY_STAGE_PAYLOADS.score.parse(run.payload).summary, { exact: true });
    case "rewrite":
      return lane.getByRole("button", { name: "Keep description", exact: true });
    case "analyze":
      return lane.getByText(REFINERY_STAGE_PAYLOADS.analyze.parse(run.payload).soulAssessment, { exact: true });
  }
}

async function refineryRequestCursor(flow: SurfaceFlow): Promise<number> {
  return Math.max(0, ...parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).map(({ requestId }) => requestId));
}

async function refineryRequestReceipt(journey: Journey, name: string, cursor: number, count: number): Promise<readonly SurfaceProviderEvidence[]> {
  const requests = parseSurfaceProviderEvidence(await readFile(journey.flow.run.generation.requestEvidencePath, "utf8")).filter(
    ({ requestId, request, event }) => requestId > cursor && request === "POST /v1/chat/completions" && event === "request",
  );
  expect(requests, "This native act must own the expected fresh physical stage calls").toHaveLength(count);
  await attachNativeFile(journey.flow.info, journey.flow.info, `refinery-${name}-physical-requests`, {
    body: JSON.stringify({ cursor, requests }),
    contentType: "application/json",
  });
  return requests;
}

async function refineryIterate(journey: Journey, sessionId: RefinerySessionId, runs: RefineryRun[]): Promise<void> {
  const { flow } = journey;
  const cursor = await refineryRequestCursor(flow);
  await flow.action("refinery/execution/iterate", {
    action: async () => {
      await content(journey).getByRole("button", { name: "Iterate", exact: true }).click();
    },
    ready: async () => {
      await expect.poll(async () => (await flow.client.refinery.getSession.query({ sessionId })).iterationCount).toBe(1);
      await expect(content(journey).getByRole("button", { name: "Iterate", exact: true })).toBeEnabled();
    },
  });
  const stored = await flow.client.refinery.listRuns.query({ sessionId });
  expect(stored.map(({ stage }) => stage)).toEqual([...REFINERY_STAGES, "rewrite", "analyze"]);
  expect(stored.slice(0, runs.length)).toEqual(runs);
  const refined = stored.slice(runs.length);
  expect(refined.map(({ sourceRunId }) => sourceRunId)).toEqual([runs.at(-1)?.id, refined.at(0)?.id]);
  runs.push(...refined);
  await refineryRequestReceipt(journey, "iterate", cursor, 2);
  await checkpoint(journey, "refinery/execution/iterate/result", content(journey), content(journey).getByRole("button", { name: "Iterate", exact: true }));
}

async function refineryCopy(
  journey: Journey,
  sessionId: RefinerySessionId,
  characters: Set<CharacterId>,
): Promise<NonNullable<ApplyAsCopyResult["character"]>> {
  const { flow } = journey;
  const custody: { character: ApplyAsCopyResult["character"] } = { character: null };
  await flow.action("refinery/execution/save-as-copy", {
    action: async () => {
      const [response] = await Promise.all([
        flow.page.waitForResponse((item) => new URL(item.url()).origin === flow.run.origin && isTrpcRequestFor(item.url(), "refinery.applyAsCopy")),
        content(journey).getByRole("button", { name: "Save as copy", exact: true }).click(),
      ]);
      const result = await readTrpcOutput(response, "refinery.applyAsCopy", applyAsCopyResultSchema);
      custody.character = result.character;
      if (custody.character !== null) {
        characters.add(custody.character.id);
      }
      expect(result.applied).toEqual([{ field: "description", kind: "replaced" }]);
      expect(result.dropped).toEqual([]);
    },
    ready: async () => {
      await expect(content(journey)).toContainText("The live card is untouched — no snapshot was needed, nothing existing was written.");
    },
  });
  const copied = custody.character;
  if (copied === null) {
    throw new Error("Native Save as copy returned no disposable character identity");
  }
  expect((await flow.client.refinery.getSession.query({ sessionId })).characterId).not.toBe(copied.id);
  await checkpoint(journey, "refinery/execution/copy/result", content(journey), content(journey).getByRole("button", { name: "Done", exact: true }));
  return copied;
}

async function refineryApply(journey: Journey, sessionId: RefinerySessionId, characterId: CharacterId, description: string): Promise<void> {
  const { flow } = journey;
  await flow.action("refinery/execution/apply", {
    action: async () => {
      const [response] = await Promise.all([
        flow.page.waitForResponse((item) => new URL(item.url()).origin === flow.run.origin && isTrpcRequestFor(item.url(), "refinery.applyFields")),
        content(journey).getByRole("button", { name: "Apply 1 kept", exact: true }).click(),
      ]);
      const result = await readTrpcOutput(response, "refinery.applyFields", applyFieldsResultSchema);
      expect(result.snapshotId).not.toBeNull();
      expect(result.applied).toEqual([{ field: "description", kind: "replaced" }]);
      expect(result.dropped).toEqual([]);
    },
    ready: async () => {
      await expect(content(journey)).toContainText("Saved a snapshot first — undo it from the character's History tab.");
      await expect.poll(async () => (await flow.client.character.get.query({ characterId })).description).toBe(description);
    },
  });
  expect((await flow.client.refinery.getSession.query({ sessionId })).status).toBe("completed");
  expect(await flow.client.character.listSnapshots.query({ characterId })).toHaveLength(1);
  await checkpoint(journey, "refinery/execution/apply/result", content(journey), content(journey).getByRole("button", { name: "Done", exact: true }));
}

async function refineryVersionRestore(journey: Journey, sessionId: RefinerySessionId, characterId: CharacterId, description: string | null): Promise<void> {
  await reveal(journey, "context");
  const tab = pane(journey, "context").getByRole("tab", { name: "Versions", exact: true });
  await tab.click();
  const versions = await controlledPanel(tab);
  await versions.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(versions.getByText("description — this version vs live", { exact: true })).toBeVisible();
  await expect(versions.getByText("Loading that version…", { exact: true })).toHaveCount(0);
  await checkpoint(journey, "refinery/execution/version-compare", versions);
  await journey.flow.action("refinery/execution/version-restore", {
    action: async () => {
      await versions.getByRole("button", { name: "Restore", exact: true }).click();
    },
    ready: async () => {
      await expect.poll(async () => (await journey.flow.client.character.get.query({ characterId })).description).toBe(description);
      await expect(versions.getByRole("button", { name: "Restore", exact: true })).toHaveCount(2);
    },
  });
  expect(await journey.flow.client.character.listSnapshots.query({ characterId })).toHaveLength(2);
  expect((await journey.flow.client.refinery.getSession.query({ sessionId })).characterId).toBe(characterId);
  await checkpoint(journey, "refinery/execution/version-restored", versions);
  await dismissContext(journey);
}

async function disposableRefinery(journey: Journey): Promise<void> {
  const character = journey.flow.run.subjects.characters.at(0);
  if (character === undefined) {
    observe(journey, "refinery/disposable-workbench", "unvisited", "No original owned character can anchor a separately labelled disposable session");
    return;
  }
  const name = `Surface session ${crypto.randomUUID()}`;
  const session = await journey.flow.client.refinery.startSession.mutate({ characterId: character.id, name });
  expect(journey.flow.run.subjects.refinerySessions.some(({ id }) => id === session.id)).toBe(false);
  try {
    const summaries = await journey.flow.client.refinery.listSessions.query();
    const summary = summaries.find(({ id }) => id === session.id);
    if (summary === undefined) {
      throw new Error("The disposable refinery session has no actual production library identity");
    }
    const search = pane(journey, "list").getByRole("textbox", { name: "Search sessions by character or name", exact: true });
    await search.fill(name);
    const row = pane(journey, "list").getByRole("button", { name: summary.characterName, exact: true });
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    await attachNativeFile(journey.flow.info, journey.flow.info, "refinery-disposable-identity", {
      body: JSON.stringify({ sessionId: session.id, characterId: character.id, original: false, nativeRow: await row.ariaSnapshot() }),
      contentType: "application/json",
    });
    await refineryWorkbench(journey, row, `refinery/disposable/${session.id}`);
    observe(
      journey,
      "refinery/disposable-workbench",
      "visited",
      "Production-created disposable session exercised actual workbench/dialogs without changing its source character or executing paid stages; not an original-session witness",
    );
  } finally {
    await journey.flow.client.refinery.deleteSession.mutate({ sessionId: session.id });
    await expect.poll(async () => (await journey.flow.client.refinery.listSessions.query()).some(({ id }) => id === session.id)).toBe(false);
  }
}

async function readonlyDialog(journey: Journey, trigger: Locator, id: string): Promise<void> {
  if ((await trigger.count()) === 0) {
    observe(journey, id, "not-applicable", "The original subject exposes no corresponding read/edit door");
    return;
  }
  if (await trigger.isDisabled()) {
    observe(journey, id, "skipped", "The actual dialog door is disabled; no click or dialog acceptance claimed");
    return;
  }
  const dialog = journey.flow.page.getByRole("dialog");
  await journey.flow.action(`${id}/open`, {
    action: async () => {
      await trigger.click();
    },
    ready: async () => {
      await expect(dialog).toHaveCount(1);
      await ready(dialog);
    },
  });
  await inspect(journey, dialog, id);
  await journey.flow.action(`${id}/close-without-submit`, {
    action: async () => {
      await dialog.press("Escape");
    },
    ready: async () => {
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    },
  });
}

async function refineryDialogs(journey: Journey, prefix: string): Promise<void> {
  await readonlyDialog(journey, content(journey).getByRole("button", { name: "Edit scope", exact: true }), `${prefix}/scope-dialog`);
  await readonlyDialog(journey, content(journey).getByRole("button", { name: "Hand-edit", exact: true }), `${prefix}/manual-rewrite-dialog`);
  observe(
    journey,
    `${prefix}/dialog-submissions`,
    "excluded",
    "Original scope/session/card fields remain unchanged; schema draft generation, rewrite save and paid stage execution are not submitted",
  );
}

async function refinerySetup(journey: Journey, prefix: string): Promise<void> {
  for (const name of ["View Original card", "Change Score schema", "Change Analyze schema"]) {
    await reveal(journey, "context");
    const setup = pane(journey, "context").getByRole("tab", { name: "Setup", exact: true });
    await setup.click();
    await expect(setup).toHaveAttribute("aria-selected", "true");
    await readonlyDialog(journey, pane(journey, "context").getByRole("button", { name, exact: true }), `${prefix}/setup/${name}`);
  }
  await dismissContext(journey);
}

async function refineryVersions(journey: Journey, prefix: string): Promise<void> {
  await reveal(journey, "context");
  const versions = pane(journey, "context").getByRole("tab", { name: "Versions", exact: true });
  await versions.click();
  await expect(versions).toHaveAttribute("aria-selected", "true");
  const body = await controlledPanel(versions);
  await ready(body);
  const comparisons = body.getByRole("button", { name: "Compare", exact: true });
  const count = await comparisons.count();
  for (let index = 0; index < count; index += 1) {
    await journey.flow.action(`${prefix}/versions/compare-${String(index)}`, {
      action: async () => {
        await comparisons.nth(index).click();
      },
      ready: async () => {
        await expect(body.getByRole("button", { name: "Hide compare", exact: true })).toBeVisible();
        await expect(body.getByText("Loading that version…", { exact: true })).toHaveCount(0);
        await expect(body.getByText("description — this version vs live", { exact: true })).toBeVisible();
      },
    });
    await inspect(journey, body, `${prefix}/versions/compare-${String(index)}`);
    await body.getByRole("button", { name: "Hide compare", exact: true }).click();
    await expect(body.getByRole("button", { name: "Hide compare", exact: true })).toHaveCount(0);
  }
  observe(
    journey,
    `${prefix}/versions/compare-inventory`,
    count === 0 ? "not-applicable" : "visited",
    `${String(count)} existing version comparisons read; Snapshot and Restore never invoked`,
  );
  await dismissContext(journey);
}

async function dismissContext(journey: Journey): Promise<void> {
  const region = pane(journey, "context");
  if ((await region.getAttribute("data-panel-mode")) === "overlay") {
    await region.getByRole("button", { name: /^Close (?:.+ details|details|panel)$/u }).click();
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "overlay");
}

async function extensions(journey: Journey): Promise<void> {
  await enter(journey, "extensions");
  await reveal(journey, "list");
  await inspect(journey, pane(journey, "list"), "extensions/switcher");
  const [surfaces, plugins] = await Promise.all([journey.flow.client.plugin.listSurfaces.query(), journey.flow.client.plugin.list.query()]);
  const originals = surfaces.filter((surface) => surface.anchor === "page" && journey.flow.run.subjects.plugins.some(({ id }) => id === surface.pluginId));
  for (const surface of originals) {
    expectSubject(journey, `extensions/${surface.pluginId}/${surface.id}`, "plugin-page");
  }
  for (const surface of originals) {
    const plugin = plugins.find((item) => item.id === surface.pluginId);
    if (plugin === undefined) {
      throw new Error("A registered original plugin page has no owning install");
    }
    await reveal(journey, "list");
    const search = pane(journey, "list").getByRole("textbox", { name: "Search plugin pages", exact: true });
    await search.fill(surface.title);
    const row = pane(journey, "list").locator('[data-slot="list-row-body"]').filter({ hasText: surface.title }).filter({ hasText: plugin.name });
    if ((await row.count()) !== 1) {
      observe(journey, `extensions/${plugin.id}/${surface.id}`, "unvisited", "No unique native attributed page row; no guessed install selected");
      continue;
    }
    await journey.flow.action(`extensions/open/${plugin.id}/${surface.id}`, {
      action: async () => {
        await row.click();
      },
      ready: async () => {
        await ready(content(journey));
        await expect(content(journey).locator('[data-plugin-surface-scale="page"]')).toBeVisible();
      },
    });
    await inspect(journey, content(journey), `extensions/${plugin.id}/${surface.id}`);
    observe(
      journey,
      `extensions/${plugin.id}/${surface.id}/guest-actions`,
      "unvisited",
      "Host attribution/native content inspected; arbitrary guest action semantics and external execution are not inferred from shell readiness",
    );
  }
  observe(
    journey,
    "extensions/page-inventory",
    originals.length === 0 ? "skipped" : "visited",
    `${String(originals.length)} actual page registrations belonging to original installs; disabled/awaiting-consent installs are not enabled`,
  );
  await journey.flow.requestPanes();
}

const JOURNEYS = { home, corpus, extensions, databank, presets, refinery } satisfies Record<OwnedSection, (journey: Journey) => Promise<void>>;

async function platformGestures(journey: Journey): Promise<void> {
  const active = journey.flow.page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("button")
    .and(journey.flow.page.locator('[aria-current="page"]'));
  await expect(active).toHaveCount(1);
  await journey.flow.action("platform/gestures", {
    action: async () => {
      await active.focus();
      await active.press("Tab");
      await expect(active).not.toBeFocused();
      await journey.flow.page.keyboard.press("Shift+Tab");
    },
    ready: async () => {
      await expect(active).toBeFocused();
    },
  });
  observe(
    journey,
    "platform/gestures",
    "visited",
    "Native forward/reverse sequential keyboard navigation recovered the active production rail control; scroll positioning is measured separately. Touch swipe/pinch, OS keyboard and native file pickers are not claimed by this keyboard witness",
  );
}

/** Remaining native cases derive their identity from the production section vocabulary. */
export const SURFACE_SECTION_IDS = SECTION_IDS.filter((id): id is OwnedSection => id !== "chats" && id !== "characters" && id !== "config");

function sectionJourney(flow: SurfaceFlow, section: OwnedSection): Journey {
  return { flow, observations: [], presetMenus: [], expected: [{ id: section, kind: "rail" }] };
}

/** One native case owns one real rail so a failed surface cannot hide unrelated journeys. */
export async function walkSection(flow: SurfaceFlow, section: (typeof SURFACE_SECTION_IDS)[number]): Promise<void> {
  const journey = sectionJourney(flow, section);
  try {
    await JOURNEYS[section](journey);
    observe(journey, section, "visited", "Independent native rail itinerary completed; nested omissions retain their own explicit dispositions");
    observe(
      journey,
      "config/worldInfo",
      "skipped",
      "World Info is a production Config collection, not a live rail; Config owner covers its member/entry editors",
    );
    await platformGestures(journey);
  } finally {
    await attachNativeFile(flow.info, flow.info, "remaining-section-coverage", {
      body: JSON.stringify(
        { section, registered: SURFACE_SECTION_IDS, dataMode: flow.run.dataMode, pass: flow.pass, observations: journey.observations },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await publishSurfaceInventory(flow.info, {
      name: `sections/${section}`,
      expected: journey.expected,
      observations: journey.observations.map(({ status, ...observation }) => ({ ...observation, disposition: status })),
    });
  }
}
