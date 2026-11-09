// The generic walk over a rendered scope: tabs, disclosures, selects, menus, dialogs, scroll windows and a control
// census. It only opens, reads and dismisses. Activating a leaf or submitting a form belongs to a bespoke outcome journey.

import type { DisclosureWalkHooks, DistributiveOmit } from "@orb/testkit/browser/spec";
import { controlledPanel, diagnosticTarget, publishSurfaceInventory, usesProgrammaticScroll, walkDisclosures } from "@orb/testkit/browser/spec";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { SurfaceCoverageInventory, SurfaceSkipReason, SurfaceWitnessDisposition } from "@orb/testkit/iso";
import { attachNativeFile, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { HIDDEN_AT } from "@orb/ui/lib";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CONTEXT_SHEET_BACK_NAME, contextPaneLabel, PANEL_CLOSE_FALLBACK_NAME, panelCloseName } from "#client/lib/context-pane-names.ts";
import { contextToggleLabel } from "#client/lib/context-toggle-label.ts";
import { TRAIL_OVERFLOW_LABEL } from "#client/lib/overflow-names.ts";
import type { SurfaceFlow } from "./surface-flow.ts";

const MAX_DEPTH = 8;
const MAX_DISCLOSURES = 100;
const MAX_DIALOG_DEPTH = 2;
const MAX_SCROLL_REGIONS = 32;
const SCROLL_TOLERANCE = 2;
const MAX_SCROLL_ADVANCES = 64;
const MENU_LEAF_KIND = "menu-leaf";
const LOADING = '[data-slot="skeleton"]:visible';
const QUERY_ERROR = '[data-slot="query-error"]:visible';
const VIRTUAL_ROW_SLOT = "virtual-list-row";
const ROW = `[data-slot="${VIRTUAL_ROW_SLOT}"], [data-slot="list-row-root"]`;
const VIRTUAL_SCROLL_SLOT = "virtual-list-scroll";
const CONTROL_SELECTOR = 'button, input:not([type="hidden"]), textarea, [role="radio"], [role="combobox"], [role="switch"], [role="checkbox"], select, a[href]';

/** A surface a walk meets that needs its own traversal rather than the generic one. */
export interface SurfaceWalkHooks {
  /** Takes over the menus of `scope`; true means the hook walked them. */
  readonly menus?: (scope: Locator, prefix: string) => Promise<boolean>;
  /** Hears the enabled leaf names of a walked menu, so a journey can settle them against its operation proofs. */
  readonly menuLeaves?: (menu: Locator, prefix: string, leaves: readonly string[]) => Promise<void>;
}

/** One native case's coverage: what it expects and what it witnessed, published once as the surface inventory. */
export interface SurfaceWalk extends SurfaceFlow {
  readonly expected: SurfaceCoverageInventory["expected"][number][];
  readonly observations: SurfaceCoverageInventory["observations"][number][];
  readonly hooks: SurfaceWalkHooks;
  readonly seenControls: Set<string>;
}

export function createSurfaceWalk(flow: SurfaceFlow, expected: SurfaceWalk["expected"] = [], hooks: SurfaceWalkHooks = {}): SurfaceWalk {
  return { ...flow, expected: [...expected], observations: [], hooks, seenControls: new Set() };
}

export async function publishWalk(walk: SurfaceWalk, name: string): Promise<void> {
  await publishSurfaceInventory(walk.info, { name, expected: walk.expected, observations: walk.observations });
}

export function expectSubject(walk: SurfaceWalk, id: string, kind: string): void {
  if (!walk.expected.some((subject) => subject.id === id && subject.kind === kind)) {
    walk.expected.push({ id, kind });
  }
}

type Outcome = DistributiveOmit<SurfaceWalk["observations"][number], "id" | "kind">;

function recordSubject(walk: SurfaceWalk, subject: SurfaceWalk["expected"][number], outcome: Outcome): void {
  const kind = walk.expected.find(({ id }) => id === subject.id)?.kind ?? subject.kind;
  expectSubject(walk, subject.id, kind);
  walk.observations.push({ id: subject.id, kind, ...outcome });
}

export function observe(walk: SurfaceWalk, id: string, disposition: SurfaceWitnessDisposition, reason: string): void {
  recordSubject(walk, { id, kind: "surface" }, { disposition, reason });
}

/** Record an outcome under exactly this kind; {@link observe} infers the kind from the first subject expected under the id. */
export function recordAs(walk: SurfaceWalk, subject: SurfaceWalk["expected"][number], outcome: Outcome): void {
  expectSubject(walk, subject.id, subject.kind);
  walk.observations.push({ ...subject, ...outcome });
}

/** Leave an available subject unexercised for a listed reason; the walk report counts and lists every skip. */
export function skip(walk: SurfaceWalk, id: string, why: SurfaceSkipReason, reason: string): void {
  recordSubject(walk, { id, kind: "surface" }, { disposition: "skipped", skip: why, reason });
}

export function pane(walk: SurfaceFlow, side: "list" | "context"): Locator {
  return walk.page.locator(`.shell-panel[data-panel-side="${side}"]`);
}

export function content(walk: SurfaceFlow): Locator {
  return walk.page.locator("main");
}

/** The body is visible, finished loading and carries text. */
export async function ready(scope: Locator): Promise<void> {
  await expect(scope).toBeVisible();
  await expect(scope.locator(LOADING)).toHaveCount(0);
  // Native field values are not child text, including legitimately empty editor fields.
  if (await scope.evaluate((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
    return;
  }
  await expect(scope).not.toBeEmpty();
  await expect(scope).toContainText(/\S/u);
}

/** Checkpoint a loaded subject. An unexpected read failure is captured as the error state, then fails the case. */
export async function checkpoint(walk: SurfaceWalk, id: string, scope: Locator, witness: Locator = scope): Promise<void> {
  await expect(scope.locator(LOADING)).toHaveCount(0);
  const errors = scope.locator(QUERY_ERROR);
  const error = (await errors.count()) > 0;
  await walk.checkpoint({ name: id, scope, state: error ? "error" : "loaded", witnesses: [error ? errors.first() : witness], checks: SURFACE_CHECKS });
  recordSubject(
    walk,
    { id, kind: "checkpoint" },
    {
      disposition: error ? "failed" : "observed",
      reason: error
        ? "Actual production query-error state; not a loaded-content acceptance"
        : "Actual selected production body rendered without a loading skeleton",
    },
  );
  expect(error, `${id}: unexpected production read failure; the error-state checkpoint and failed inventory observation retain its diagnostics`).toBe(false);
}

/** Checkpoint a declared empty or error state, or several witnesses of a loaded one. */
export async function checkpointState(
  walk: SurfaceWalk,
  id: string,
  scope: Locator,
  state: DistributiveOmit<SurfaceAuditRequest, "name" | "scope" | "checks">,
): Promise<void> {
  await walk.checkpoint({ name: id, scope, ...state, checks: SURFACE_CHECKS });
  recordSubject(walk, { id, kind: "checkpoint" }, { disposition: "observed", reason: `The declared ${state.state} subject witnesses rendered` });
}

/** A stand-in for a value the walk does not know, passed to a production name builder. */
export const NAME_HOLE = "\0";

/** Match a production name built with {@link NAME_HOLE} in place of each unknown value. */
export function namePattern(...names: readonly string[]): RegExp {
  const alternatives = names.map((name) =>
    name
      .split(NAME_HOLE)
      .map((part) => RegExp.escape(part))
      .join(".+"),
  );
  return new RegExp(`^(?:${alternatives.join("|")})$`, "u");
}

/** Close an overlaid Context, the sheet a phone or narrow shell lays over the content. */
export async function dismissContext(walk: SurfaceFlow): Promise<void> {
  const region = pane(walk, "context");
  if ((await region.getAttribute("data-panel-mode")) === "overlay") {
    // A phone sheet carries its own dismiss beside the topbar's back, so both name it; the sheet's own one is pressed.
    // Its name carries the section, which a walk does not track. A desktop sheet is closed from its edge control.
    const own = region.getByRole("button", { name: namePattern(panelCloseName(contextPaneLabel(NAME_HOLE)), PANEL_CLOSE_FALLBACK_NAME) });
    const exit = (await own.count()) > 0 ? own : walk.page.getByRole("button", { name: namePattern(CONTEXT_SHEET_BACK_NAME, contextToggleLabel(false)) });
    await exit.click();
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "overlay");
}

/** An action of an overflow row: its inline control, and the More trigger whose menu holds it under `name` once the row runs out of room. */
export interface OverflowedAction {
  readonly inline: Locator;
  readonly overflow: Locator;
  readonly name: string;
}

/** Press an overflow row's action where the row seats it: inline while it fits, else through its row's More menu. */
export async function pressOverflowed(page: Page, { inline, overflow, name }: OverflowedAction): Promise<void> {
  await expect(inline.or(overflow).first()).toBeVisible();
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  await overflow.click();
  await page.getByRole("menu").getByRole("menuitem", { name, exact: true }).click();
}

/** Open a collapsed Context through the shell's door: the desktop edge control, or the phone topbar's toggle wherever its trail seats it. */
export async function openContext(walk: SurfaceFlow): Promise<void> {
  if ((await pane(walk, "context").getAttribute("data-panel-mode")) !== "collapsed") {
    return;
  }
  const name = contextToggleLabel(true);
  await pressOverflowed(walk.page, {
    inline: walk.page.getByRole("button", { name, exact: true }),
    overflow: walk.page.getByRole("button", { name: TRAIL_OVERFLOW_LABEL, exact: true }),
    name,
  });
  // A sheet slides in; a press on its controls before it settles can land on a box that is still moving.
  const region = pane(walk, "context");
  await expect(region).not.toHaveAttribute("data-panel-mode", "collapsed");
  await expect.poll(async () => await region.evaluate((node) => node.getAnimations().length)).toBe(0);
}

/** Open a menu an overflow row holds: its inline trigger while it fits, else its submenu inside the row's More menu. */
export async function openOverflowedMenu(page: Page, { inline, overflow, name }: OverflowedAction): Promise<Locator> {
  await expect(inline.or(overflow).first()).toBeVisible();
  if (await inline.isVisible()) {
    await inline.click();
    return page.getByRole("menu");
  }
  await overflow.click();
  const submenu = page.getByRole("menu").getByRole("menuitem", { name, exact: true });
  await submenu.focus();
  await page.keyboard.press("ArrowRight");
  await expect(submenu).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("menu").last();
}

/** Close every open menu level, innermost first. */
export async function closeMenus(page: Page): Promise<void> {
  const menus = page.getByRole("menu");
  for (let level = await menus.count(); level > 0; level -= 1) {
    await page.keyboard.press("Escape");
  }
  await expect(menus).toHaveCount(0);
}

/** An `inert` control is out of reach here: its row moved it into an overflow menu, or an open sheet covers it. */
export async function isInert(control: Locator): Promise<boolean> {
  return await control.evaluate((node) => node.closest("[inert]") !== null);
}

export async function switchListScreen(walk: SurfaceWalk): Promise<void> {
  const control = walk.page.locator(".shell-topbar-lead > button");
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName(/\S/u);
  await control.click();
}

/** Bring a side pane up through the shell's own door; false means this section declares no such pane. */
export async function reveal(walk: SurfaceWalk, side: "list" | "context"): Promise<boolean> {
  const region = pane(walk, side);
  const available = await region.getAttribute("data-panel-available");
  if (available === "false") {
    return false;
  }
  await expect(region).toHaveAttribute("data-panel-available", "true");
  if (side === "list") {
    await dismissContext(walk);
  }
  if ((await region.getAttribute("data-panel-mode")) === "collapsed") {
    if (side === "list") {
      await switchListScreen(walk);
    } else {
      await openContext(walk);
    }
    observe(walk, `extra-pane/${side}`, "visited", "Explicit navigation/inspection pane state in addition to the requested composition captured at rail entry");
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "collapsed");
  await expect(region).toBeVisible();
  return true;
}

function disclosureHooks(walk: SurfaceWalk): DisclosureWalkHooks {
  return {
    limit: MAX_DISCLOSURES,
    depthLimit: MAX_DEPTH,
    completed: "visited",
    id: (path, kind, index) => `${path}/${kind}-${String(index)}`,
    expect: (id, kind) => expectSubject(walk, id, kind),
    action: async (id, step) => walk.action(id, step),
    checkpoint: async (id, scope): Promise<void> => {
      await checkpoint(walk, id, scope);
      await walkOpenBody(walk, scope, id);
    },
    record: (id, disposition, detail) => observe(walk, id, disposition, detail),
    ready,
    opened: async (scope, path): Promise<void> => {
      await attachNativeFile(walk.info, walk.info, `${path}-body`, { body: await scope.ariaSnapshot(), contentType: "text/plain" });
    },
    summary: (path) => ({ disclosures: `${path}/disclosures`, nestedDetails: `${path}/nested-details` }),
  };
}

/** What sits inside a body the walk has already opened and checkpointed. */
async function walkOpenBody(walk: SurfaceWalk, scope: Locator, id: string, depth = 0): Promise<void> {
  await walkSelects(walk, scope, id);
  await walkMenus(walk, scope, id);
  await walkDialogs(walk, scope, id, depth);
  await controlCensus(walk, scope, id);
}

/** Walk one rendered scope with everything it holds; this is the coverage a journey no longer scripts by hand. */
export async function walkScope(walk: SurfaceWalk, scope: Locator, id: string, depth = 0): Promise<void> {
  await ready(scope);
  await checkpoint(walk, id, scope);
  await walkDisclosures(scope, id, disclosureHooks(walk));
  await walkTabs(walk, scope, id, depth);
  await walkOpenBody(walk, scope, id, depth);
  await walkScrollWindows(walk, scope, id);
  observe(walk, id, "visited", "Generic walk completed: tabs, disclosures, selects, menus, dialogs, scroll windows and control census");
}

async function walkTabs(walk: SurfaceWalk, scope: Locator, prefix: string, depth: number): Promise<void> {
  const lists = await scope.getByRole("tablist").all();
  if (depth >= MAX_DEPTH) {
    observe(walk, `${prefix}/nested-tabs`, "unvisited", `${String(lists.length)} tablists exceed the explicit traversal bound`);
    return;
  }
  for (const [listIndex, list] of lists.entries()) {
    const tabs = await list.getByRole("tab").all();
    const expected = await Promise.all(tabs.map((tab) => tab.ariaSnapshot()));
    for (const index of tabs.keys()) {
      expectSubject(walk, `${prefix}/tabs-${String(listIndex)}/${String(index)}`, "tab");
    }
    await attachNativeFile(walk.info, walk.info, `${prefix}-tabs-${String(listIndex)}-expected`, {
      body: JSON.stringify(expected),
      contentType: "application/json",
    });
    for (const [index, tab] of tabs.entries()) {
      const id = `${prefix}/tabs-${String(listIndex)}/${String(index)}`;
      if (await tab.isDisabled()) {
        skip(walk, id, "disabled", "Production tab is disabled; no body acceptance claimed");
        continue;
      }
      await walk.action(id, {
        action: async () => {
          await tab.click();
        },
        ready: async () => {
          await expect(tab).toHaveAttribute("aria-selected", "true");
          await ready(await controlledPanel(tab));
        },
      });
      await walkScope(walk, await controlledPanel(tab), id, depth + 1);
    }
  }
}

async function walkSelects(walk: SurfaceWalk, scope: Locator, prefix: string): Promise<void> {
  const selects = await scope.locator('[data-slot="select-trigger"]:visible').all();
  for (const index of selects.keys()) {
    expectSubject(walk, `${prefix}/select-${String(index)}`, "select");
  }
  for (const [index, select] of selects.entries()) {
    const id = `${prefix}/select-${String(index)}`;
    if (await isInert(select)) {
      skip(walk, id, "hidden-here", "Inert in this layout; its row's overflow menu or the covering sheet stands in");
      continue;
    }
    if (await select.isDisabled()) {
      skip(walk, id, "disabled", "Actual select is disabled");
      continue;
    }
    await walk.action(id, {
      action: async () => {
        await select.click();
      },
      ready: async () => {
        await expect(await controlledPanel(select)).toBeVisible();
      },
    });
    const options = await controlledPanel(select);
    await checkpoint(walk, id, options);
    await attachNativeFile(walk.info, walk.info, `${id}-options`, { body: await options.ariaSnapshot(), contentType: "text/plain" });
    await walk.page.keyboard.press("Escape");
    await expect(options).toBeHidden();
    observe(walk, id, "visited", `Options read and dismissed without a change: ${await select.ariaSnapshot()}`);
  }
}

async function walkMenuBody(walk: SurfaceWalk, menu: Locator, prefix: string, depth: number): Promise<void> {
  await checkpoint(walk, prefix, menu);
  await attachNativeFile(walk.info, walk.info, `${prefix}-items`, { body: await menu.ariaSnapshot(), contentType: "text/plain" });
  const items = menu.locator('[role^="menuitem"]:not([aria-disabled="true"]):not([disabled])');
  await walkMenuTerminal(walk, menu, items, prefix);
  const submenus = await menu.locator('[role="menuitem"][aria-haspopup="menu"]:not([aria-disabled="true"]):not([disabled])').all();
  if (depth >= MAX_DEPTH) {
    observe(walk, `${prefix}/submenus`, "unvisited", `${String(submenus.length)} nested menus beyond the traversal bound`);
    return;
  }
  for (const [index, trigger] of submenus.entries()) {
    await trigger.focus();
    await trigger.press("ArrowRight");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const child = walk.page.getByRole("menu").last();
    await walkMenuBody(walk, child, `${prefix}/${String(index)}`, depth + 1);
    await child.press("Escape");
    await expect(trigger).toBeFocused();
  }
  const leaves = (await menuLeafItems(menu).allTextContents()).map((label) => label.trim());
  // One row per leaf, so the walk report lists each command the walk read and did not run; a hook may settle them later.
  for (const [index, leaf] of leaves.entries()) {
    recordSubject(
      walk,
      { id: `${prefix}/leaf-${String(index)}`, kind: MENU_LEAF_KIND },
      { disposition: "skipped", skip: "not-activated", reason: `Enabled command ${leaf} read, not run` },
    );
  }
  await walk.hooks.menuLeaves?.(menu, prefix, leaves);
}

/** The enabled leaves of one menu, in the order whose index names each `<prefix>/leaf-<i>` row a hook settles. */
export function menuLeafItems(menu: Locator): Locator {
  return menu.locator('[role^="menuitem"]:not([aria-haspopup]):not([aria-disabled="true"])');
}

async function walkMenuTerminal(walk: SurfaceWalk, menu: Locator, items: Locator, prefix: string): Promise<void> {
  if ((await items.count()) === 0) {
    skip(walk, `${prefix}/terminal`, "disabled", "All actual items are disabled");
    return;
  }
  // The key goes where the open left focus, as a keyboard user's does; `menu.press` would move focus to the popup first.
  await menu.page().keyboard.press("End");
  await expect(items.last()).toHaveAttribute("data-highlighted", "");
  await checkpoint(walk, `${prefix}/terminal`, menu, items.last());
}

/** Open one menu trigger, read its tree and restore the focus it took. Resolves false when the walk recorded
 *  the trigger as a disabled skip, so a caller drilling the same menu follows that record instead of reading
 *  the trigger again after the room has moved on. */
export async function walkMenuTrigger(walk: SurfaceWalk, trigger: Locator, id: string): Promise<boolean> {
  if (await trigger.isDisabled()) {
    skip(walk, id, "disabled", "Actual menu trigger is disabled");
    return false;
  }
  await walk.action(id, {
    action: async () => {
      // A row reveals its actions on hover or focus; the keyboard reaches them on every pointer.
      await trigger.focus();
      await trigger.press("Enter");
    },
    ready: async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(walk.page.getByRole("menu")).toHaveCount(1);
    },
  });
  const menu = walk.page.getByRole("menu");
  await walkMenuBody(walk, menu, id, 0);
  const radios = await menu.getByRole("menuitemradio").allTextContents();
  if (await overflowsContextTabs(walk, radios)) {
    await walkOverflowTabs(walk, { trigger, menu, id, names: radios.map((name) => name.trim()) });
    return true;
  }
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  return true;
}

async function overflowsContextTabs(walk: SurfaceWalk, radios: readonly string[]): Promise<boolean> {
  if (radios.length === 0) {
    return false;
  }
  const tabs = (await pane(walk, "context").getByRole("tab").allTextContents()).map((name) => name.trim());
  return radios.every((name) => tabs.includes(name.trim()));
}

// A Context strip overflowing into a menu keeps one menu item per tab; each must reach the same registry-owned body.
async function walkOverflowTabs(
  walk: SurfaceWalk,
  { trigger, menu, id, names }: { readonly trigger: Locator; readonly menu: Locator; readonly id: string; readonly names: readonly string[] },
): Promise<void> {
  for (const [index, name] of names.entries()) {
    if (index > 0) {
      await trigger.click();
      await ready(menu);
    }
    const tab = pane(walk, "context").getByRole("tab", { name, exact: true });
    await walk.action(`${id}/activate/${name}`, {
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
      walk,
      `${id}/leaf-${String(index)}`,
      "visited",
      `Actual overflow radio ${name} activated its tab and loaded body; focus returned to the native trigger`,
    );
  }
  observe(
    walk,
    `${id}/leaf-actions`,
    "visited",
    `All ${String(names.length)} actual native overflow tab radios activated with loaded-panel and focus-return witnesses`,
  );
}

async function walkMenus(walk: SurfaceWalk, scope: Locator, prefix: string): Promise<void> {
  if ((await walk.hooks.menus?.(scope, prefix)) === true) {
    return;
  }
  const triggers = await scope.locator('button[aria-haspopup="menu"]:visible').all();
  for (const index of triggers.keys()) {
    expectSubject(walk, `${prefix}/menu-${String(index)}`, "menu");
  }
  let rowSampled = false;
  for (const [index, trigger] of triggers.entries()) {
    const id = `${prefix}/menu-${String(index)}`;
    if (await isInert(trigger)) {
      skip(walk, id, "hidden-here", `Inert in this layout; its row's overflow menu or the covering sheet stands in: ${await trigger.ariaSnapshot()}`);
      continue;
    }
    // Every row of a list repeats one menu; the first stands for its siblings.
    const inRow = await trigger.evaluate((node, selector) => node.closest(selector) !== null, ROW);
    if (inRow && rowSampled) {
      skip(walk, id, "sibling-sample", `Sibling row menu, represented by the first row of the list: ${await trigger.ariaSnapshot()}`);
      continue;
    }
    rowSampled ||= inRow;
    await walkMenuTrigger(walk, trigger, id);
  }
}

/** A control that opens a body it can leave again. */
export interface SurfaceDoor {
  readonly id: string;
  readonly trigger: Locator;
  readonly body: Locator;
  /** Leaves the body; Escape when absent. */
  readonly exit?: Locator;
}

/** Open a door, walk what it opens, leave through its exit and require focus back on the door. */
export async function walkDoor(walk: SurfaceWalk, door: SurfaceDoor, depth = 0): Promise<void> {
  const { id, trigger, body, exit } = door;
  if ((await trigger.count()) === 0) {
    observe(walk, id, "not-applicable", "The subject exposes no corresponding door");
    return;
  }
  if (await trigger.isDisabled()) {
    skip(walk, id, "disabled", "The actual door is disabled; no click or body acceptance claimed");
    return;
  }
  await walk.action(`${id}/open`, {
    action: async () => {
      await trigger.click();
    },
    ready: async () => {
      await ready(body);
    },
  });
  await walkScope(walk, body, id, depth + 1);
  await walk.action(`${id}/close-without-submit`, {
    action: async () => {
      if (exit === undefined) {
        await body.press("Escape");
      } else {
        await exit.click();
      }
    },
    ready: async () => {
      await expect(body).toBeHidden();
      await expect.soft(trigger, `${id}: focus returns to the door that opened it`).toBeFocused();
    },
  });
}

async function walkDialogs(walk: SurfaceWalk, scope: Locator, prefix: string, depth: number): Promise<void> {
  const triggers = await scope.locator('button[aria-haspopup="dialog"]:visible').all();
  if (depth >= MAX_DIALOG_DEPTH) {
    if (triggers.length > 0) {
      skip(walk, `${prefix}/nested-dialogs`, "traversal-bound", `${String(triggers.length)} dialog doors inside a dialog beyond the traversal bound`);
    }
    return;
  }
  for (const index of triggers.keys()) {
    expectSubject(walk, `${prefix}/dialog-${String(index)}`, "dialog");
  }
  const body = walk.page.getByRole("dialog").or(walk.page.getByRole("alertdialog")).last();
  for (const [index, trigger] of triggers.entries()) {
    const id = `${prefix}/dialog-${String(index)}`;
    if (await isInert(trigger)) {
      skip(walk, id, "hidden-here", "Inert in this layout; its row's overflow menu or the covering sheet stands in");
      continue;
    }
    await walkDoor(walk, { id, trigger, body }, depth);
  }
}

/** Step a group of pressed-state mode buttons, walking `body` under each mode. */
export async function walkChoices(walk: SurfaceWalk, group: Locator, body: Locator, prefix: string): Promise<void> {
  const choices = await group.getByRole("button").all();
  for (const [index, choice] of choices.entries()) {
    const id = `${prefix}/${String(index)}`;
    if (await choice.isDisabled()) {
      skip(walk, id, "disabled", "Production mode is disabled");
      continue;
    }
    await walk.action(id, {
      action: async () => {
        await choice.click();
      },
      ready: async () => {
        await expect(choice).toHaveAttribute("aria-pressed", "true");
      },
    });
    await walkScope(walk, body, id);
  }
}

/** The structural address of a control, stable across same-label siblings and virtual rows. */
export async function controlIdentity(element: Locator): Promise<string> {
  const target = await element.evaluate(diagnosticTarget);
  const index = await element.evaluate((node, slot) => node.closest(`[data-slot="${slot}"]`)?.getAttribute("data-index") ?? null, VIRTUAL_ROW_SLOT);
  if (index === null) {
    return target;
  }
  const row = element.locator(`xpath=ancestor::*[@data-slot="${VIRTUAL_ROW_SLOT}"][1]`);
  const viewport = element.locator(`xpath=ancestor::*[@data-slot="${VIRTUAL_SCROLL_SLOT}"][1]`);
  const [rowTarget, scrollTarget] = await Promise.all([row.evaluate(diagnosticTarget), viewport.evaluate(diagnosticTarget)]);
  return `${scrollTarget} [data-slot="${VIRTUAL_ROW_SLOT}"][data-index=${JSON.stringify(index)}]${target.slice(rowTarget.length)}`;
}

interface CensusInput {
  readonly hidden: typeof HIDDEN_AT;
  readonly coarse: string;
  readonly fine: string;
  readonly census: string;
  readonly rowSlot: string;
  readonly scrollSlot: string;
}

interface CensusedControl {
  readonly target: string;
  readonly unavailable: string | null;
  readonly visible: boolean;
  readonly label: string;
}

// Runs in the page. It reads the whole list in one pass: a list that re-renders mid-census cannot leave a stale index,
// and a surface with many repeated censuses spends one call each, not several per control.
function readControls(nodes: readonly Element[], input: CensusInput, targetOf: (node: Node | null) => string): CensusedControl[] {
  const { hidden, coarse, fine, census, rowSlot, scrollSlot } = input;
  function pairedControl(field: HTMLInputElement): Element | null {
    let owner = field.previousElementSibling;
    while (owner?.matches('input[type="hidden"]')) {
      owner = owner.previousElementSibling;
    }
    if (owner === null) {
      return null;
    }
    const selector = [
      ["radio", '[role="radio"]'],
      ["checkbox", '[role="switch"]'],
      ["number", '[data-slot="number-field-input"]'],
      ["text", '[role="combobox"]'],
    ].find(([type]) => type === field.type)?.[1];
    if (selector === undefined) {
      return null;
    }
    return owner.matches(selector) ? owner : owner.querySelector(selector);
  }
  function pointerArm(node: Element): string | null {
    const coarseArm = node.closest(`.${CSS.escape(hidden.coarse)}`);
    if (matchMedia(coarse).matches && coarseArm !== null && getComputedStyle(coarseArm).display === "none") {
      return "The production hiddenAt=coarse arm is absent for this actual coarse pointer; its alternative remains in the control census.";
    }
    const fineArm = node.closest(`.${CSS.escape(hidden.fine)}`);
    if (matchMedia(fine).matches && fineArm !== null && getComputedStyle(fineArm).display === "none") {
      return "The production hiddenAt=fine arm is absent for this actual fine pointer; its alternative remains in the control census.";
    }
    return null;
  }
  function transport(node: Element): string | null {
    if (node instanceof HTMLInputElement && node.type === "file" && node.closest('[data-slot="file-trigger"]') !== null) {
      return "Hidden file transport behind its visible trigger.";
    }
    if (!(node instanceof HTMLInputElement && node.matches('[aria-hidden="true"][tabindex="-1"]'))) {
      return null;
    }
    const control = pairedControl(node);
    if (control === null || !control.matches(census)) {
      return null;
    }
    const box = control.getBoundingClientRect();
    return box.width * box.height > 0
      ? "Native aria-hidden, non-tabstop form transport paired with a rendered radio/switch/number field/combobox; the actual accessible control remains in the census."
      : null;
  }
  // The same address controlIdentity gives a control, so a journey's settled control and the census meet on one key.
  function identity(node: Element): string {
    const target = targetOf(node);
    const row = node.closest(`[data-slot="${rowSlot}"]`);
    const index = row?.getAttribute("data-index") ?? null;
    if (row === null || index === null) {
      return target;
    }
    return `${targetOf(node.closest(`[data-slot="${scrollSlot}"]`))} [data-slot="${rowSlot}"][data-index=${JSON.stringify(index)}]${target.slice(targetOf(row).length)}`;
  }
  return nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return {
      target: identity(node),
      unavailable: pointerArm(node) ?? transport(node),
      // An inert control has moved into its row's overflow menu or sits under a sheet; it is not witnessed here.
      visible: box.width > 0 && box.height > 0 && node.checkVisibility({ visibilityProperty: true }) && node.closest("[inert]") === null,
      label: `${node.getAttribute("role") ?? node.tagName.toLowerCase()} ${JSON.stringify(node.getAttribute("aria-label") ?? node.textContent.trim())}`,
    };
  });
}

// `diagnosticTarget` is a module function, which a serialized page function cannot close over.
const READ_CONTROLS = `(nodes, input) => {
  ${diagnosticTarget.toString()}
  return (${readControls.toString()})(nodes, input, diagnosticTarget);
}`;

/** Inventory every control under `scope`; a hidden one stays listed and never counts as witnessed. */
async function controlCensus(walk: SurfaceWalk, scope: Locator, prefix: string): Promise<void> {
  await attachNativeFile(walk.info, walk.info, `${prefix}-controls`, { body: await scope.ariaSnapshot(), contentType: "text/plain" });
  const input: CensusInput = {
    hidden: HIDDEN_AT,
    coarse: MEDIA_QUERIES["pointer-coarse"],
    fine: MEDIA_QUERIES["pointer-fine"],
    census: CONTROL_SELECTOR,
    rowSlot: VIRTUAL_ROW_SLOT,
    scrollSlot: VIRTUAL_SCROLL_SLOT,
  };
  // A string page function is evaluated, never called, so the census calls the evaluated handle itself.
  const read = await walk.page.evaluateHandle<(nodes: readonly Element[], census: CensusInput) => CensusedControl[]>(READ_CONTROLS);
  const controls = await scope.locator(CONTROL_SELECTOR).evaluateAll((nodes, handles) => handles.read(nodes, handles.input), { read, input });
  await read.dispose();
  for (const { target, unavailable, visible, label } of controls) {
    if (walk.seenControls.has(target)) {
      continue;
    }
    if (unavailable !== null) {
      walk.seenControls.add(target);
      recordSubject(walk, { id: target, kind: "control" }, { disposition: "not-applicable", reason: unavailable });
    } else if (visible) {
      walk.seenControls.add(target);
      recordSubject(walk, { id: target, kind: "control" }, { disposition: "observed", reason: `${prefix}: ${label}` });
    } else {
      recordSubject(
        walk,
        { id: target, kind: "control" },
        { disposition: "skipped", skip: "hidden-here", reason: `${prefix}: hidden in this layout; not counted as witnessed` },
      );
    }
  }
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

async function walkScrollWindows(walk: SurfaceWalk, scope: Locator, prefix: string): Promise<void> {
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
      expectSubject(walk, `${prefix}/scroll-${String(index)}-${String(ratio)}`, "scroll-window");
    }
    for (const ratio of [0, 0.5, 1]) {
      await walkScrollWindow(walk, viewport, { axis: region.axis, ratio, id: `${prefix}/scroll-${String(index)}-${String(ratio)}` });
    }
  }
  observe(
    walk,
    `${prefix}/scroll-regions`,
    regions.length > MAX_SCROLL_REGIONS ? "unvisited" : "visited",
    `${String(regions.length)} native overflowing regions; beginning/interior/tail windows, not a claim of every virtualized row`,
  );
}

async function walkScrollWindow(
  walk: SurfaceWalk,
  viewport: Locator,
  request: { readonly axis: string; readonly ratio: number; readonly id: string },
): Promise<void> {
  const { axis, ratio, id } = request;
  const before = await scrollGeometry(viewport, axis);
  const deliveries: Awaited<ReturnType<typeof nativeWheel>>[] = [];
  try {
    if (interiorInapplicable(before, ratio)) {
      observe(
        walk,
        id,
        "not-applicable",
        `Measured scroll range ${String(before.maximum)}px has no interior outside both ${String(SCROLL_TOLERANCE)}px edge neighborhoods; start/end remain independently required`,
      );
      return;
    }
    await walk.action(id, {
      action: async () => {
        for (let step = 0; step < MAX_SCROLL_ADVANCES; step += 1) {
          // A region still laying out (a header collapsing, a page arriving) moves its range after one read.
          const state = await settledScrollGeometry(viewport, axis);
          if (interiorInapplicable(state, ratio) || windowReached(state, ratio)) {
            break;
          }
          const delta = state.maximum * ratio - state.position;
          await aimWheel(walk, viewport, axis);
          deliveries.push(await nativeWheel(walk, viewport, axis, delta));
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
    await attachNativeFile(walk.info, walk.info, `${id}-scroll-geometry`, {
      body: JSON.stringify({
        requestedRatio: ratio,
        before,
        after: await scrollGeometry(viewport, axis),
        deliveries,
        input: usesProgrammaticScroll(walk.page, walk.info) ? "programmatic-positioning; not wheel or touch proof" : "native-wheel",
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
      walk,
      id,
      "not-applicable",
      `Settled scroll range ${String(after.maximum)}px has no distinct interior outside both ${String(SCROLL_TOLERANCE)}px edge neighborhoods; no interior checkpoint accepted`,
    );
    return;
  }
  await checkpoint(walk, id, viewport);
}

interface WheelAim {
  readonly point: { readonly x: number; readonly y: number } | null;
  readonly reason: string | null;
}

interface AimInput {
  readonly horizontal: boolean;
  readonly steps: number;
}

const WHEEL_BOXES = ["none", "chains", "contained"] as const;
type WheelBox = (typeof WHEEL_BOXES)[number];

// Runs in the page: the region's port clipped by every clipping ancestor and the viewport, or null when none is left.
function visiblePort(node: Element): { left: number; right: number; top: number; bottom: number } | null {
  const box = node.getBoundingClientRect();
  const port = { left: Math.max(box.left, 0), right: Math.min(box.right, innerWidth), top: Math.max(box.top, 0), bottom: Math.min(box.bottom, innerHeight) };
  for (let ancestor = node.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const clip = ancestor.getBoundingClientRect();
      port.left = Math.max(port.left, clip.left);
      port.right = Math.min(port.right, clip.right);
      port.top = Math.max(port.top, clip.top);
      port.bottom = Math.min(port.bottom, clip.bottom);
    }
  }
  return port.right - port.left < 1 || port.bottom - port.top < 1 ? null : port;
}

// Runs in the page. A box keeps the wheel when its overscroll setting stops the chain; a scrollable one without that
// setting takes the wheel until its edge and then hands it on.
function wheelBox(element: Element, horizontal: boolean): WheelBox {
  const style = getComputedStyle(element);
  if (!/auto|scroll/u.test(horizontal ? style.overflowX : style.overflowY)) {
    return "none";
  }
  if ((horizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY) !== "auto") {
    return "contained";
  }
  const scrollable = horizontal ? element.scrollWidth > element.clientWidth + 1 : element.scrollHeight > element.clientHeight + 1;
  return scrollable ? "chains" : "none";
}

// Runs in the page: what a wheel at `hit` meets before `node`, with the first box that keeps it.
function wheelPath(node: Element, hit: Element, horizontal: boolean): { readonly kind: "own" | "chains" | "contained"; readonly box: string } {
  let kind: "own" | "chains" = "own";
  for (let cursor: Element | null = hit; cursor !== null && cursor !== node; cursor = cursor.parentElement) {
    const found = wheelBox(cursor, horizontal);
    if (found === "contained") {
      return { kind: found, box: `${cursor.tagName}[data-slot=${String(cursor.getAttribute("data-slot"))}]` };
    }
    kind = found === "chains" ? found : kind;
  }
  return { kind, box: "" };
}

// Runs in the page: sample the port centre-out and keep the best point, or say why there is none.
function wheelAim(node: Element, input: AimInput): WheelAim {
  const port = visiblePort(node);
  if (port === null) {
    return { point: null, reason: "no part of the region lies inside the viewport and its clipping ancestors" };
  }
  const centre = { x: (port.left + port.right) / 2, y: (port.top + port.bottom) / 2 };
  const points = Array.from({ length: input.steps * input.steps }, (_, index) => ({
    x: port.left + ((port.right - port.left) * ((index % input.steps) + 0.5)) / input.steps,
    y: port.top + ((port.bottom - port.top) * (Math.floor(index / input.steps) + 0.5)) / input.steps,
  })).sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y));
  const reads = points.map((point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return { point, path: hit === null || !node.contains(hit) ? null : wheelPath(node, hit, input.horizontal) };
  });
  const chosen = reads.find(({ path }) => path?.kind === "own") ?? reads.find(({ path }) => path?.kind === "chains");
  if (chosen !== undefined) {
    return { point: chosen.point, reason: null };
  }
  const outside = reads.filter(({ path }) => path === null).length;
  const keepers = [...new Set(reads.flatMap(({ path }) => (path === null ? [] : [path.box])))];
  return {
    point: null,
    reason: `of ${String(reads.length)} sampled visible points, ${String(outside)} hit another element and ${String(reads.length - outside)} sit over a nested scroller whose overscroll keeps the wheel (${keepers.join(", ")})`,
  };
}

// The page functions are module functions, which a serialized page function cannot close over.
const AIM_WHEEL = `(node, input) => {
  ${visiblePort.toString()}
  ${wheelBox.toString()}
  ${wheelPath.toString()}
  return (${wheelAim.toString()})(node, input);
}`;

const AIM_STEPS = 8;

/**
 * Put the pointer where a wheel scrolls `viewport`: inside its visible port, over no nested scroller if such a point
 * exists, else over nested scrollers that hand the wheel on at their edge. Grown text can fill a region with an inner
 * list whose overscroll containment keeps every wheel, so the centre is not the region's own point. Throws when every
 * visible point of the region sits under another element or over a containing scroller: the wheel cannot scroll it.
 */
export async function aimWheel(walk: SurfaceFlow, viewport: Locator, axis: string): Promise<void> {
  if (usesProgrammaticScroll(walk.page, walk.info)) {
    return;
  }
  // A nested region can sit scrolled out of its ancestors' ports; a user scrolls those first, as Playwright does here.
  await viewport.scrollIntoViewIfNeeded();
  const input: AimInput = { horizontal: axis === "x", steps: AIM_STEPS };
  // A string page function is evaluated, never called, so the aim calls the evaluated handle itself.
  const read = await walk.page.evaluateHandle<(node: Element, aim: AimInput) => WheelAim>(AIM_WHEEL);
  const aim = await viewport.evaluate((node, handles) => handles.read(node, handles.input), { read, input });
  await read.dispose();
  if (aim.point === null) {
    throw new Error(`A wheel cannot reach this scroll region: ${aim.reason}`);
  }
  await walk.page.mouse.move(aim.point.x, aim.point.y);
}

export async function nativeWheel(
  walk: SurfaceFlow,
  viewport: Locator,
  axis: string,
  delta: number,
): Promise<{ target: string; defaultPrevented: boolean; reached: boolean } | null> {
  if (usesProgrammaticScroll(walk.page, walk.info)) {
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
    await walk.page.mouse.wheel(axis === "x" ? delta : 0, axis === "y" ? delta : 0);
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

// Two equal reads in a row, so a range still settling is not judged on its first frame.
async function settledScrollGeometry(viewport: Locator, axis: string): Promise<ScrollGeometry> {
  let previous = "";
  let state: ScrollGeometry | undefined;
  await expect
    .poll(async () => {
      state = await scrollGeometry(viewport, axis);
      const signature = JSON.stringify(state);
      const settled = signature === previous;
      previous = signature;
      return settled;
    })
    .toBe(true);
  if (state === undefined) {
    throw new Error("The scroll geometry poll returned without a read");
  }
  return state;
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
