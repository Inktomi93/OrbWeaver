// The generic walk over a rendered scope: tabs, disclosures, selects, menus, dialogs, scroll windows and a control
// census. It only opens, reads and dismisses. Activating a leaf or submitting a form belongs to a bespoke outcome journey.

import type { DisclosureWalkHooks, DistributiveOmit } from "@orb/testkit/browser/spec";
import { controlledPanel, diagnosticTarget, publishSurfaceInventory, usesProgrammaticScroll, walkDisclosures } from "@orb/testkit/browser/spec";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { SurfaceCoverageDisposition, SurfaceCoverageInventory } from "@orb/testkit/iso";
import { attachNativeFile, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { HIDDEN_AT } from "@orb/ui/lib";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { contextToggleLabel } from "#client/lib/context-toggle-label.ts";
import type { SurfaceFlow } from "./surface-flow.ts";

const MAX_DEPTH = 8;
const MAX_DISCLOSURES = 100;
const MAX_DIALOG_DEPTH = 2;
const MAX_SCROLL_REGIONS = 32;
const SCROLL_TOLERANCE = 2;
const MAX_SCROLL_ADVANCES = 64;
const LOADING = '[data-slot="skeleton"]:visible';
const QUERY_ERROR = '[data-slot="query-error"]:visible';
const VIRTUAL_ROW_SLOT = "virtual-list-row";
const ROW = `[data-slot="${VIRTUAL_ROW_SLOT}"], [data-slot="list-row-root"]`;
const VIRTUAL_SCROLL_SLOT = "virtual-list-scroll";
export const CONTROL_SELECTOR =
  'button, input:not([type="hidden"]), textarea, [role="radio"], [role="combobox"], [role="switch"], [role="checkbox"], select, a[href]';

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

function recordSubject(walk: SurfaceWalk, subject: SurfaceWalk["expected"][number], disposition: SurfaceCoverageDisposition, reason: string): void {
  const kind = walk.expected.find(({ id }) => id === subject.id)?.kind ?? subject.kind;
  expectSubject(walk, subject.id, kind);
  walk.observations.push({ id: subject.id, kind, disposition, reason });
}

export function observe(walk: SurfaceWalk, id: string, disposition: SurfaceCoverageDisposition, reason: string): void {
  recordSubject(walk, { id, kind: "surface" }, disposition, reason);
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
    error ? "failed" : "observed",
    error ? "Actual production query-error state; not a loaded-content acceptance" : "Actual selected production body rendered without a loading skeleton",
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
  recordSubject(walk, { id, kind: "checkpoint" }, "observed", `The declared ${state.state} subject witnesses rendered`);
}

/** Close an overlaid Context, the sheet a phone or narrow shell lays over the content. */
export async function dismissContext(walk: SurfaceFlow): Promise<void> {
  const region = pane(walk, "context");
  if ((await region.getAttribute("data-panel-mode")) === "overlay") {
    await walk.page.getByRole("button", { name: /^(?:Close (?:.+ details|details|panel)|Hide details)$/u }).click();
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "overlay");
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
      await walk.page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
    }
    observe(walk, `extra-pane/${side}`, "visited", "Explicit navigation/inspection pane state in addition to the requested composition captured at rail entry");
  }
  await expect(region).not.toHaveAttribute("data-panel-mode", "collapsed");
  await expect(region).toBeVisible();
  return true;
}

export function disclosureHooks(walk: SurfaceWalk): DisclosureWalkHooks {
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
        observe(walk, id, "skipped", "Production tab is disabled; no body acceptance claimed");
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
    if (await select.isDisabled()) {
      observe(walk, id, "skipped", "Actual select is disabled");
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
  const leaves = (await menu.locator('[role^="menuitem"]:not([aria-haspopup]):not([aria-disabled="true"])').allTextContents()).map((label) => label.trim());
  await walk.hooks.menuLeaves?.(menu, prefix, leaves);
  observe(walk, `${prefix}/leaf-actions`, "skipped", `Enabled commands read, not run; a bespoke journey owns activation: ${leaves.join("; ")}`);
}

async function walkMenuTerminal(walk: SurfaceWalk, menu: Locator, items: Locator, prefix: string): Promise<void> {
  if ((await items.count()) === 0) {
    observe(walk, `${prefix}/terminal`, "skipped", "All actual items are disabled");
    return;
  }
  await menu.press("End");
  await expect(items.last()).toHaveAttribute("data-highlighted", "");
  await checkpoint(walk, `${prefix}/terminal`, menu, items.last());
}

/** Open one menu trigger, read its tree and restore the focus it took. */
export async function walkMenuTrigger(walk: SurfaceWalk, trigger: Locator, id: string): Promise<void> {
  if (await trigger.isDisabled()) {
    observe(walk, id, "skipped", "Actual menu trigger is disabled");
    return;
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
    return;
  }
  await menu.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
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
    // Every row of a list repeats one menu; the first stands for its siblings.
    const inRow = await trigger.evaluate((node, selector) => node.closest(selector) !== null, ROW);
    if (inRow && rowSampled) {
      observe(walk, id, "skipped", `Sibling row menu, represented by the first row of the list: ${await trigger.ariaSnapshot()}`);
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
    observe(walk, id, "skipped", "The actual door is disabled; no click or body acceptance claimed");
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
      observe(walk, `${prefix}/nested-dialogs`, "skipped", `${String(triggers.length)} dialog doors inside a dialog beyond the traversal bound`);
    }
    return;
  }
  for (const index of triggers.keys()) {
    expectSubject(walk, `${prefix}/dialog-${String(index)}`, "dialog");
  }
  const body = walk.page.getByRole("dialog").or(walk.page.getByRole("alertdialog")).last();
  for (const [index, trigger] of triggers.entries()) {
    await walkDoor(walk, { id: `${prefix}/dialog-${String(index)}`, trigger, body }, depth);
  }
}

/** Step a group of pressed-state mode buttons, walking `body` under each mode. */
export async function walkChoices(walk: SurfaceWalk, group: Locator, body: Locator, prefix: string): Promise<void> {
  const choices = await group.getByRole("button").all();
  for (const [index, choice] of choices.entries()) {
    const id = `${prefix}/${String(index)}`;
    if (await choice.isDisabled()) {
      observe(walk, id, "skipped", "Production mode is disabled");
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

/** Why a matched element is not a user-facing control here, or null when it is one. */
export async function unavailableControl(element: Locator): Promise<string | null> {
  const pointer = await element.evaluate(
    (node, { hidden, coarse, fine }) => {
      const coarseArm = node.closest(`.${CSS.escape(hidden.coarse)}`);
      if (matchMedia(coarse).matches && coarseArm !== null && getComputedStyle(coarseArm).display === "none") {
        return "The production hiddenAt=coarse arm is absent for this actual coarse pointer; its alternative remains in the control census.";
      }
      const fineArm = node.closest(`.${CSS.escape(hidden.fine)}`);
      if (matchMedia(fine).matches && fineArm !== null && getComputedStyle(fineArm).display === "none") {
        return "The production hiddenAt=fine arm is absent for this actual fine pointer; its alternative remains in the control census.";
      }
      return null;
    },
    { hidden: HIDDEN_AT, coarse: MEDIA_QUERIES["pointer-coarse"], fine: MEDIA_QUERIES["pointer-fine"] },
  );
  return (
    pointer ??
    (await element.evaluate((node, censusSelector) => {
      function pairedControl(input: HTMLInputElement): Element | null {
        let owner = input.previousElementSibling;
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
        ].find(([type]) => type === input.type)?.[1];
        if (selector === undefined) {
          return null;
        }
        return owner.matches(selector) ? owner : owner.querySelector(selector);
      }
      if (node instanceof HTMLInputElement && node.type === "file" && node.closest('[data-slot="file-trigger"]') !== null) {
        return "Hidden file transport behind its visible trigger.";
      }
      if (!(node instanceof HTMLInputElement && node.matches('[aria-hidden="true"][tabindex="-1"]'))) {
        return null;
      }
      const control = pairedControl(node);
      if (control === null || !control.matches(censusSelector)) {
        return null;
      }
      const box = control.getBoundingClientRect();
      return box.width * box.height > 0
        ? "Native aria-hidden, non-tabstop form transport paired with a rendered radio/switch/number field/combobox; the actual accessible control remains in the census."
        : null;
    }, CONTROL_SELECTOR))
  );
}

/** Inventory every control under `scope` by accessible name; a hidden one stays listed and never counts as witnessed. */
async function controlCensus(walk: SurfaceWalk, scope: Locator, prefix: string): Promise<void> {
  await attachNativeFile(walk.info, walk.info, `${prefix}-controls`, { body: await scope.ariaSnapshot(), contentType: "text/plain" });
  for (const element of await scope.locator(CONTROL_SELECTOR).all()) {
    const target = await controlIdentity(element);
    if (walk.seenControls.has(target)) {
      continue;
    }
    const unavailable = await unavailableControl(element);
    if (unavailable !== null) {
      walk.seenControls.add(target);
      recordSubject(walk, { id: target, kind: "control" }, "not-applicable", unavailable);
    } else if (await element.isVisible()) {
      walk.seenControls.add(target);
      recordSubject(walk, { id: target, kind: "control" }, "observed", `${prefix}: ${await element.ariaSnapshot()}`);
    } else {
      recordSubject(walk, { id: target, kind: "control" }, "skipped", `${prefix}: hidden here, such as a responsive arm; not counted as witnessed`);
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
        await viewport.hover();
        for (let step = 0; step < MAX_SCROLL_ADVANCES; step += 1) {
          const state = await scrollGeometry(viewport, axis);
          if (interiorInapplicable(state, ratio) || windowReached(state, ratio)) {
            break;
          }
          const delta = state.maximum * ratio - state.position;
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
