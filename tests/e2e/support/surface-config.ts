import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { controlledPanel, diagnosticTarget, publishSurfaceInventory } from "@orb/testkit/browser/spec";
import type { SurfaceCoverageDisposition } from "@orb/testkit/iso";
import { surfaceCoverageKey } from "@orb/testkit/iso";
import { attachNativeFile, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { HIDDEN_AT } from "@orb/ui/lib";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { LIBRARY_SETTINGS_SUBCATEGORY } from "#client/features/character/lib/library-settings-nav.ts";
import { CONFIG_SECTION_LABEL } from "#client/features/config/lib/config-copy.ts";
import { ADD_CONNECTION_PATH } from "#client/lib/injection-copy.ts";
import { rowActionsName } from "#client/lib/row-qualifiers.ts";
import type { ConfigGroupId } from "#client/state/config-group-ids.ts";
import { CONFIG_GROUP_IDS } from "#client/state/config-group-ids.ts";
import { waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";

const APPEARANCE_PARENT_BUDGET_MS = 60_000;
const APPEARANCE_SECTION_BUDGET_MS = 120_000;
const THEME_BUILDER_BUDGET_MS = 300_000;
const THEME_BUILDER_VISIT = "Theme unminted builder/color pickers/advanced CSS/reference/preview/Back";
const CONTENT = '[data-slot="config-content"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const LIST = '[data-slot="config-list"]';
const EDITOR = '[data-slot="world-info-member-editor"]';
const VIRTUAL_ROW_SLOT = "virtual-list-row";
const VIRTUAL_SCROLL_SLOT = "virtual-list-scroll";
const CONTROL_SELECTOR = 'button, input:not([type="hidden"]), textarea, [role="radio"], [role="combobox"], [role="switch"], [role="checkbox"], select, a[href]';

interface Visit {
  readonly name: string;
  readonly target?: string;
  readonly kind: "category" | "subsection" | "tab" | "disclosure" | "scroll" | "control" | "action";
  readonly disposition: SurfaceCoverageDisposition;
  readonly reason?: string;
}

async function checkpoint(flow: SurfaceFlow, name: string, scope: Locator, witness: Locator = scope): Promise<void> {
  await expect(scope.locator('[aria-busy="true"]:visible, [data-slot="skeleton"]:visible')).toHaveCount(0);
  await flow.checkpoint({ name: `config-${name}`, scope, witnesses: [witness], state: "loaded", checks: SURFACE_CHECKS });
}

async function closeContext(flow: SurfaceFlow): Promise<void> {
  const context = flow.page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "overlay") {
    await context.getByRole("button", { name: `Close ${CONFIG_SECTION_LABEL} details`, exact: true }).click();
  }
}

async function map(flow: SurfaceFlow): Promise<Locator> {
  await closeContext(flow);
  const list = flow.page.locator(LIST);
  const panel = flow.page.locator('.shell-panel[data-panel-side="list"]');
  const back = flow.page.getByRole("button", { name: `Back to ${CONFIG_SECTION_LABEL}`, exact: true });
  while ((await panel.getAttribute("data-panel-mode")) === "collapsed" && (await back.isVisible())) {
    await back.click();
  }
  const show = flow.page.getByRole("button", { name: "Show list panel", exact: true });
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

async function inViewport(element: Locator, viewport: Awaited<ReturnType<Locator["boundingBox"]>>): Promise<boolean> {
  if (viewport === null || !(await element.isVisible())) {
    return false;
  }
  return await element.evaluate((node, clip) => {
    const box = node.getBoundingClientRect();
    return (
      box.right > Math.max(clip.x, 0) &&
      box.left < Math.min(clip.x + clip.width, innerWidth) &&
      box.bottom > Math.max(clip.y, 0) &&
      box.top < Math.min(clip.y + clip.height, innerHeight)
    );
  }, viewport);
}

async function unavailableControl(element: Locator): Promise<string | null> {
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

async function identity(element: Locator): Promise<string> {
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

interface ControlCensus {
  readonly name: string;
  readonly scope: Locator;
  readonly visits: Visit[];
  readonly seen: Set<string>;
}

async function controls(flow: SurfaceFlow, name: string, scope: Locator, visits: Visit[]): Promise<void> {
  await inspectControls(flow, { name, scope, visits, seen: new Set<string>() });
}

async function folderChooser(flow: SurfaceFlow, { name, visits }: Pick<ControlCensus, "name" | "visits">, element: Locator, trigger: Locator): Promise<void> {
  const key = await identity(element);
  await expect(trigger).toHaveAccessibleName("Import a folder…");
  const chooser = flow.page.waitForEvent("filechooser");
  await trigger.click();
  const input = (await chooser).element();
  expect(await input.evaluate(diagnosticTarget)).toBe(key);
  await expect(element).toHaveAttribute("hidden", "");
  await expect(element).toHaveAttribute("webkitdirectory", "");
  visits.push({
    name: `${name}: folder chooser transport`,
    target: key,
    kind: "control",
    disposition: "not-applicable",
    reason: "Hidden transport is reached through its witnessed visible FolderPicker button, not a user-facing control.",
  });
  visits.push({
    name: `${name}: open native folder chooser`,
    target: await identity(trigger),
    kind: "action",
    disposition: "visited",
    reason: "The actual visible trigger emitted its matching native directory chooser; no files were supplied or imported.",
  });
}

async function observedControl(element: Locator, key: string, { name, visits }: Pick<ControlCensus, "name" | "visits">): Promise<void> {
  const snapshot = await element.ariaSnapshot();
  visits.push({ name: `${name}: ${snapshot}`, target: key, kind: "control", disposition: "observed" });
  const action = await element.evaluate((node) => node.matches("button, a[href]"));
  if (action) {
    visits.push({
      name: `${name}: ${snapshot}`,
      kind: "action",
      disposition: "skipped",
      reason: "Control witnessed; activation is not implied by its screenshot. Only the named disposable/reversible operations below are activated.",
    });
  }
}

async function inspectControls(flow: SurfaceFlow, { name, scope, visits, seen }: ControlCensus): Promise<void> {
  await expect(scope).toBeVisible();
  const roster = await scope.ariaSnapshot();
  await attachNativeFile(flow.info, flow.info, `config-${name}-controls`, { body: roster, contentType: "text/plain" });
  const elements = scope.locator(CONTROL_SELECTOR);
  const viewport = await scope.boundingBox();
  for (const element of await elements.all()) {
    const key = await identity(element);
    if (seen.has(`control:${key}`)) {
      continue;
    }
    if (await element.evaluate((node) => node.matches('input[hidden][type="file"][webkitdirectory]'))) {
      const trigger = element.locator("xpath=preceding-sibling::button[1]");
      if (await inViewport(trigger, viewport)) {
        await folderChooser(flow, { name, visits }, element, trigger);
        seen.add(`control:${key}`);
        continue;
      }
    }
    const unavailable = await unavailableControl(element);
    if (unavailable !== null) {
      seen.add(`control:${key}`);
      visits.push({ name: `${name}: unavailable control`, target: key, kind: "control", disposition: "not-applicable", reason: unavailable });
      continue;
    }
    if (await inViewport(element, viewport)) {
      seen.add(`control:${key}`);
      await observedControl(element, key, { name, visits });
    } else {
      visits.push({
        name: `${name}: ${(await element.getAttribute("data-slot")) ?? element.toString()}`,
        target: key,
        kind: "control",
        disposition: "unvisited",
        reason: "Outside this scroll window or hidden without a verified applicability rule; not counted as witnessed.",
      });
    }
  }
  await inspectMenus(flow, { name, scope, visits, seen });
  await inspectSelects(flow, { name, scope, visits, seen });
}

async function inspectMenus(flow: SurfaceFlow, { name, scope, visits, seen }: ControlCensus): Promise<void> {
  const menus = scope.locator('button[aria-haspopup="menu"]');
  const viewport = await scope.boundingBox();
  const targets = await Promise.all((await menus.all()).map(identity));
  for (const [index, key] of targets.entries()) {
    const trigger = flow.page.locator(key);
    if (seen.has(`menu:${key}`) || !((await inViewport(trigger, viewport)) && (await trigger.isEnabled()))) {
      continue;
    }
    seen.add(`menu:${key}`);
    const label = await trigger.ariaSnapshot();
    await trigger.focus();
    await trigger.press("Enter");
    const menu = flow.page.getByRole("menu");
    await expect(menu).toBeVisible();
    await checkpoint(flow, `${name}-menu-${index}`, menu);
    for (const item of await menu.getByRole("menuitem").all()) {
      visits.push({
        name: `${name}: ${label}: ${await item.ariaSnapshot()}`,
        kind: "action",
        disposition: "excluded",
        reason:
          "Menu inspected; this generic category pass does not authorize changing original subjects, installation configuration, credentials, or external execution.",
      });
    }
    await flow.page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
}

async function inspectSelects(flow: SurfaceFlow, { name, scope, seen }: ControlCensus): Promise<void> {
  const selects = scope.locator('[data-slot="select-trigger"]');
  const viewport = await scope.boundingBox();
  for (const [index, select] of (await selects.all()).entries()) {
    const key = await identity(select);
    if (seen.has(`select:${key}`) || !((await inViewport(select, viewport)) && (await select.isEnabled()))) {
      continue;
    }
    seen.add(`select:${key}`);
    await select.click();
    const options = await controlledPanel(select);
    await expect(options).toHaveRole("listbox");
    await expect(options).toBeVisible();
    await checkpoint(flow, `${name}-options-${index}`, options);
    await attachNativeFile(flow.info, flow.info, `config-${name}-options-${index}`, { body: await options.ariaSnapshot(), contentType: "text/plain" });
    await flow.page.keyboard.press("Escape");
    await expect(options).toBeHidden();
  }
}

async function scroll(flow: SurfaceFlow, name: string, scope: Locator, visits: Visit[]): Promise<void> {
  const seen = new Set<string>();
  await scope.evaluate(async (node) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const heightTransitions = node
      .getAnimations({ subtree: true })
      .filter((animation) => animation instanceof CSSTransition && animation.transitionProperty === "height");
    await Promise.allSettled(heightTransitions.map((animation) => animation.finished));
    node.scrollTo({ top: 0, behavior: "instant" });
  });
  for (let window = 0; ; window += 1) {
    await checkpoint(flow, `${name}-window-${window}`, scope);
    visits.push({ name: `${name}: scroll window ${window}`, kind: "scroll", disposition: "visited" });
    await inspectControls(flow, { name: `${name}-window-${window}`, scope, visits, seen });
    const extent = await scope.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const visible = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
      return { top: node.scrollTop, height: Math.min(node.clientHeight, Math.max(0, visible)), viewport: node.clientHeight, total: node.scrollHeight };
    });
    expect(extent.height, `${name} must have an actual bounded viewport`).toBeGreaterThan(0);
    if (Math.ceil(extent.top + extent.viewport) >= extent.total) {
      return;
    }
    await scope.evaluate((node, top) => node.scrollTo({ top, behavior: "instant" }), extent.top + extent.height);
    await expect.poll(async () => await scope.evaluate((node) => node.scrollTop)).toBeGreaterThan(extent.top);
  }
}

async function nestedScroll(flow: SurfaceFlow, name: string, scope: Locator, visits: Visit[]): Promise<void> {
  const descendants = scope.locator("*");
  const owners = await descendants.evaluateAll((nodes) =>
    nodes.flatMap((node, index) => {
      const style = getComputedStyle(node);
      return node.clientHeight > 0 && node.scrollHeight > node.clientHeight && /auto|scroll/u.test(style.overflowY)
        ? [{ index, slot: node.getAttribute("data-slot"), id: node.id }]
        : [];
    }),
  );
  const bound = await Promise.all(owners.map(async (owner) => ({ ...owner, target: await identity(descendants.nth(owner.index)) })));
  await attachNativeFile(flow.info, flow.info, `config-${name}-nested-scroll-owners`, { body: JSON.stringify(bound), contentType: "application/json" });
  for (const owner of bound) {
    const element = flow.page.locator(owner.target);
    if (await element.isVisible()) {
      await element.scrollIntoViewIfNeeded();
      await scroll(flow, `${name}-nested-${owner.index}`, element, visits);
    } else {
      visits.push({
        name: `${name}: nested ${owner.id === "" ? (owner.slot ?? owner.index) : owner.id}`,
        kind: "scroll",
        disposition: "unvisited",
        reason: "Hidden nested scroller is not a witnessed scroll window.",
      });
    }
  }
}

async function neutralDialogs(flow: SurfaceFlow, name: string, scope: Locator, visits: Visit[]): Promise<void> {
  const triggers = scope.locator('button[aria-haspopup="dialog"]:not([data-slot="color-field-trigger"])');
  for (let index = 0; index < (await triggers.count()); index += 1) {
    const trigger = triggers.nth(index);
    if (!((await trigger.isVisible()) && (await trigger.isEnabled()))) {
      continue;
    }
    const label = await trigger.ariaSnapshot();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const dialog = flow.page.getByRole("dialog").or(flow.page.getByRole("alertdialog"));
    await expect(dialog).toBeVisible();
    await checkpoint(flow, `${name}-dialog-${index}`, dialog);
    await disclosures(flow, `${name}-dialog-${index}`, dialog, visits);
    await controls(flow, `${name}-dialog-${index}`, dialog, visits);
    await nestedScroll(flow, `${name}-dialog-${index}`, dialog, visits);
    await flow.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    visits.push({
      name: `${name}: ${label}`,
      kind: "action",
      disposition: "visited",
      reason: "Dialog opened, inspected and dismissed; submission is not claimed.",
    });
  }
}

async function themeBuilder(flow: SurfaceFlow, visits: Visit[]): Promise<string> {
  await category(flow, "appearance");
  const content = flow.page.locator(CONTENT);
  const before = (await flow.client.settings.listThemes.query()).map(({ id }) => id);
  await content.getByRole("button", { name: /^New theme(?: from .+)?…$/u }).click();
  const title = content.getByRole("textbox", { name: "Theme name", exact: true });
  await expect(title).toBeVisible();
  const editor = title.locator("xpath=ancestor::section[1]");
  await expect(editor).toHaveCount(1);
  const target = await identity(editor);
  await checkpoint(flow, "theme-unminted-editor", editor, title);
  for (const [index, color] of (await editor.locator('[data-slot="color-field-trigger"]').all()).entries()) {
    await color.scrollIntoViewIfNeeded();
    await color.click();
    const picker = flow.page.getByRole("dialog", { name: / color picker$/u });
    await checkpoint(flow, `theme-color-${index}`, picker, picker.getByRole("textbox", { name: "Hex", exact: true }));
    await flow.page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
  }
  await content.getByRole("button", { name: "Show advanced theme tools", exact: true }).click();
  await expect(content.getByRole("heading", { name: "Custom CSS", exact: true })).toBeVisible();
  // eslint-disable-next-line orb/no-hand-copied-label -- This is the theme's scoped live preview heading, not Chat's Preview context tab.
  await expect(content.getByRole("heading", { name: "Preview", exact: true })).toBeVisible();
  await appearanceSectionScroll(flow, "theme-builder-advanced-reference-preview", editor, visits);
  await nestedScroll(flow, "theme-builder", editor, visits);
  await content.getByRole("button", { name: "← Back to Looks", exact: true }).click();
  expect((await flow.client.settings.listThemes.query()).map(({ id }) => id)).toEqual(before);
  visits.push({
    name: THEME_BUILDER_VISIT,
    kind: "action",
    disposition: "visited",
    reason: "No fields changed; production mint-on-first-edit leaves no new theme.",
  });
  return target;
}

async function connectionAuthoring(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  await category(flow, "connections");
  const content = flow.page.locator(CONTENT);
  await content.getByRole("button", { name: ADD_CONNECTION_PATH.leaf, exact: true }).click();
  const dialog = flow.page.getByRole("dialog");
  const provider = dialog.getByRole("combobox", { name: "Provider", exact: true });
  await expect(provider).toBeVisible();
  await checkpoint(flow, "add-connection-empty-draft", dialog, provider);
  await provider.click();
  const catalog = await controlledPanel(provider);
  await checkpoint(flow, "add-connection-provider-roster", catalog);
  await attachNativeFile(flow.info, flow.info, "config-provider-options", { body: await catalog.ariaSnapshot(), contentType: "text/plain" });
  await flow.page.keyboard.press("Escape");
  await expect(catalog).toBeHidden();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  visits.push({ name: "Connections Add connection/provider roster/Cancel", kind: "action", disposition: "visited" });
  visits.push({
    name: "Connections List models, Check sign-in, submit connection/key, role rebinding/reindex, saved-key replace/revoke",
    kind: "action",
    disposition: "excluded",
    reason:
      "No live provider contact, credential mutation, paid execution, or original role/index changes. Provider choices are inspected without selection or submission.",
  });
}

async function personas(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  await category(flow, "personas");
  const content = flow.page.locator(CONTENT);
  const rows = await flow.client.persona.list.query();
  const index = rows.findIndex((candidate) => flow.run.subjects.personas.some(({ id }) => id === candidate.id));
  const original = rows[index];
  if (original === undefined) {
    visits.push({
      name: "Original persona editor",
      kind: "action",
      disposition: "unvisited",
      reason: "No original persona in source provenance; no synthetic identity is represented as original evidence.",
    });
    return;
  }
  const expanders = content.locator('[data-slot="persona-row-expand"]');
  await expect(expanders).toHaveCount(rows.length);
  const expand = expanders.nth(index);
  if ((await expand.getAttribute("aria-expanded")) !== "true") {
    await expand.click();
  }
  const editor = content.getByRole("group").filter({ has: flow.page.locator('[data-slot="persona-editor-identity"]') });
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(original.name);
  await scroll(flow, "persona-original-editor", content, visits);
  await nestedScroll(flow, "persona-original-editor", editor, visits);
  await editor.getByRole("button", { name: "Connect a character", exact: true }).click();
  const picker = flow.page.getByRole("dialog", { name: "Connect a character", exact: true });
  await checkpoint(flow, "persona-connect-character-picker", picker);
  await controls(flow, "persona-connect-character-picker", picker, visits);
  await flow.page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await teacher(flow, "persona-original", visits);
  visits.push({
    name: "Original persona editor/placement/world-book catalog/connected-character picker",
    kind: "action",
    disposition: "visited",
    reason: "One provenance-owned persona sampled; description, placement and junctions remain unchanged.",
  });
  visits.push({
    name: "Original persona favorite/default/delete/avatar/description/placement/world-book/connect/disconnect",
    kind: "action",
    disposition: "excluded",
    reason: "Original identity and attachments stay read-only; no account-default or relationship changes.",
  });
}

async function remainingDisclosures({ name, scope, visits, seen }: ControlCensus): Promise<void> {
  for (const button of await scope.locator('button[aria-expanded="false"]:not([aria-haspopup])').all()) {
    const target = await identity(button);
    if (!seen.has(target)) {
      const sampledSeparately = (await button.getAttribute("data-slot")) === "persona-row-expand";
      visits.push({
        name: `${name}: disclosure ${target}`,
        target,
        kind: "disclosure",
        disposition: sampledSeparately ? "excluded" : "unvisited",
        reason: sampledSeparately
          ? "Original persona rows use the separately named provenance-bounded sample, not an unbounded owner-data walk."
          : "Closed disclosure was hidden or disabled when traversal ended; it is not counted complete.",
      });
    }
  }
}

async function disclosures(flow: SurfaceFlow, name: string, scope: Locator, visits: Visit[]): Promise<void> {
  const seen = new Set<string>();
  for (;;) {
    let next: Locator | undefined;
    for (const button of await scope.locator('button[aria-expanded="false"]:not([aria-haspopup]):not([data-slot="persona-row-expand"])').all()) {
      const key = await identity(button);
      if (!seen.has(key) && (await button.isVisible()) && (await button.isEnabled())) {
        seen.add(key);
        next = flow.page.locator(key);
        break;
      }
    }
    if (next === undefined) {
      await remainingDisclosures({ name, scope, visits, seen });
      return;
    }
    const label = await next.ariaSnapshot();
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(next).toHaveAttribute("aria-expanded", "true");
    await checkpoint(flow, `${name}-disclosure-${seen.size}`, scope, next);
    await controls(flow, `${name}-disclosure-${seen.size}`, scope, visits);
    visits.push({ name: `${name}: ${label}`, kind: "disclosure", disposition: "visited" });
  }
}

async function aboutOnly(flow: SurfaceFlow, name: string, context: Locator, visits: Visit[]): Promise<void> {
  await expect(context.locator('[data-slot="teacher-about"], [data-slot="teacher-roster"]')).toBeVisible();
  await checkpoint(flow, `${name}-teacher-about`, context);
  visits.push({
    name: `${name}: teacher About`,
    kind: "tab",
    disposition: "visited",
    reason: "The resolved single About body renders without a redundant tab strip.",
  });
}

async function teacher(flow: SurfaceFlow, name: string, visits: Visit[]): Promise<void> {
  const context = flow.page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "collapsed") {
    await flow.page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  await expect(context).toBeVisible();
  const tabs = context.getByRole("tab");
  const names = await tabs.allTextContents();
  if (names.length === 0) {
    await aboutOnly(flow, name, context, visits);
  }
  for (const label of names) {
    const tab = context.getByRole("tab", { name: label.trim(), exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const region = context.getByRole("region", { name: label.trim(), exact: true });
    await expect(region).toBeVisible();
    await disclosures(flow, `${name}-teacher-${label}`, region, visits);
    await checkpoint(flow, `${name}-teacher-${label}`, region);
    await controls(flow, `${name}-teacher-${label}`, region, visits);
    visits.push({ name: `${name}: teacher ${label}`, kind: "tab", disposition: "visited" });
  }
  await closeContext(flow);
}

async function groupDetails(flow: SurfaceFlow, id: ConfigGroupId, visits: Visit[]): Promise<void> {
  if (id === "connections") {
    await connectionAuthoring(flow, visits);
  } else if (id === "personas") {
    await personas(flow, visits);
  } else if (id === "admin") {
    await sameLabelCensusControl(flow, visits);
  }
}

async function sameLabelCensusControl(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const saves = flow.page.locator(CONTENT).getByRole("button", { name: "Save", exact: true });
  const buttons = await saves.all();
  expect(buttons.length, "The actual Admin sections must supply repeated Save controls for this census control").toBeGreaterThanOrEqual(2);
  const targets: string[] = [];
  for (const button of buttons) {
    expect(await button.evaluate((node) => node.id), "This positive control must exercise id-less production buttons").toBe("");
    await expect(button).toHaveAccessibleName("Save");
    targets.push(await identity(button));
  }
  expect(new Set(targets).size, "The actual same-label controls must not coalesce in the census Set").toBe(buttons.length);
  for (const target of targets) {
    const resolved = flow.page.locator(target);
    await expect(resolved).toHaveCount(1);
    await expect(resolved).toHaveAccessibleName("Save");
  }
  await attachNativeFile(flow.info, flow.info, "config-same-label-structural-census-control", {
    body: JSON.stringify({ count: buttons.length, targets }),
    contentType: "application/json",
  });
  visits.push({
    name: "Actual Admin id-less same-label Save controls retain distinct census targets",
    kind: "control",
    disposition: "visited",
    reason: "No Save was activated; each maintained structural target resolves to exactly one real production control.",
  });
}

async function collectionDetails(flow: SurfaceFlow, id: ConfigGroupId, visits: Visit[]): Promise<void> {
  if (id === "worldInfo") {
    await worldInfo(flow, visits);
  } else if (id === "regex") {
    await regex(flow, visits);
  } else if (id === "rosterPreset") {
    await rosterJourney(flow, visits);
  } else {
    throw new Error(`Registered collection ${id} has no member journey; its landing is not coverage`);
  }
}

async function themeFileChooser(flow: SurfaceFlow, section: Locator, visits: Visit[]): Promise<void> {
  const trigger = section.getByRole("button", { name: "Import a theme file", exact: true });
  const transport = section.locator('input[data-slot="file-trigger-input"]');
  await expect(transport).toHaveCount(1);
  await expect(transport).toHaveAttribute("aria-hidden", "true");
  await expect(transport).toHaveAttribute("tabindex", "-1");
  await expect(trigger).toBeVisible();
  const target = await identity(transport);
  const chooser = flow.page.waitForEvent("filechooser");
  await trigger.click();
  const input = (await chooser).element();
  expect(await input.evaluate(diagnosticTarget)).toBe(target);
  visits.push({
    name: "Theme import native chooser transport",
    target,
    kind: "control",
    disposition: "not-applicable",
    reason: "The sr-only aria-hidden non-tabstop FileTrigger input is the exact transport emitted by its witnessed visible theme import button.",
  });
  visits.push({
    name: "Open actual theme import file chooser",
    target: await identity(trigger),
    kind: "action",
    disposition: "visited",
    reason: "The actual visible trigger emitted its matching native file chooser; no file was supplied and no import is claimed.",
  });
}

async function appearanceSectionScroll(flow: SurfaceFlow, name: string, section: Locator, visits: Visit[]): Promise<void> {
  const content = flow.page.locator(CONTENT);
  const seen = new Set<string>();
  await section.locator(":scope > h3").scrollIntoViewIfNeeded();
  for (let window = 0; ; window += 1) {
    await checkpoint(flow, `${name}-window-${window}`, section);
    visits.push({ name: `${name}: scroll window ${window}`, kind: "scroll", disposition: "visited" });
    await inspectControls(flow, { name: `${name}-window-${window}`, scope: section, visits, seen });
    const sectionBox = await section.boundingBox();
    if (sectionBox === null) {
      throw new Error(`${name} lost its production section box`);
    }
    const extent = await content.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        top: node.scrollTop,
        bottom: Math.min(box.bottom, innerHeight),
        stride: Math.min(box.bottom, innerHeight) - Math.max(box.top, 0),
        remaining: node.scrollHeight - node.scrollTop - node.clientHeight,
      };
    });
    if (sectionBox.y + sectionBox.height <= extent.bottom || extent.remaining <= 0) {
      return;
    }
    expect(extent.stride, `${name} must have an actual bounded content viewport`).toBeGreaterThan(0);
    await content.evaluate((node, top) => node.scrollTo({ top, behavior: "instant" }), extent.top + Math.min(extent.stride, extent.remaining));
    await expect.poll(async () => await content.evaluate((node) => node.scrollTop)).toBeGreaterThan(extent.top);
  }
}

async function appearanceJourney(flow: SurfaceFlow, names: readonly string[], visits: Visit[]): Promise<void> {
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
  visits.push({ name: THEME_BUILDER_VISIT, kind: "action", disposition: "unvisited" });
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
        if ((await section.getByRole("button", { name: "Import a theme file", exact: true }).count()) > 0) {
          await themeFileChooser(flow, section, visits);
        }
        await disclosures(flow, `appearance-${label}`, section, visits);
        await appearanceSectionScroll(flow, `appearance-${label}`, section, visits);
        await nestedScroll(flow, `appearance-${label}`, section, visits);
        await neutralDialogs(flow, `appearance-${label}`, section, visits);
        await teacher(flow, `appearance-${label}`, visits);
        visits.push({ name: `appearance: ${label}`, kind: "subsection", disposition: "visited" });
        await attachNativeFile(flow.info, flow.info, `config-appearance-${label}-phase-cost`, {
          body: JSON.stringify({ label, scope: await identity(section), budgetMs: sectionBudgetMs, elapsedMs: performance.now() - startedAt }),
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
      const scope = await themeBuilder(flow, visits);
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
        await observedControl(trigger, await identity(trigger), { name: "appearance-parent-fold", visits });
        visits.push({ name: `appearance: ${label}`, kind: "disclosure", disposition: "visited" });
      }
      await teacher(flow, "appearance-parent", visits);
      visits.push({ name: "appearance", kind: "category", disposition: "visited" });
      await attachNativeFile(flow.info, flow.info, "config-appearance-parent-phase-cost", {
        body: JSON.stringify({ scope: CONTENT, budgetMs: parentBudgetMs, elapsedMs: performance.now() - startedAt }),
        contentType: "application/json",
      });
    },
    { timeout: parentBudgetMs },
  );
}

async function groupJourney(flow: SurfaceFlow, id: ConfigGroupId, visits: Visit[]): Promise<void> {
  const group = await category(flow, id);
  const rows = group.locator('[data-slot="list-row-body"]');
  const names: string[] = [];
  for (const row of await rows.all()) {
    const label = await row.getAttribute("aria-label");
    if (label === null) {
      throw new Error(`Config subsection in ${id} has no production accessible name`);
    }
    names.push(label);
  }
  visits.push(...names.map((name): Visit => ({ name: `${id}: ${name}`, kind: "subsection", disposition: "unvisited" })));
  if (id === "appearance") {
    await appearanceJourney(flow, names, visits);
    return;
  }
  for (const label of names) {
    const list = await map(flow);
    const currentGroup = list.locator(`[data-slot="config-group"][data-config-group="${id}"]`);
    const row = currentGroup.getByRole("button", { name: label, exact: true }).and(currentGroup.locator('[data-slot="list-row-body"]'));
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const content = flow.page.locator(CONTENT);
    await expect(content).toBeVisible();
    await disclosures(flow, `${id}-${label}`, content, visits);
    visits.push({ name: `${id}: ${label}`, kind: "subsection", disposition: "visited" });
    await flow.requestPanes();
    await checkpoint(flow, `${id}-${label}-landing`, content);
    await teacher(flow, `${id}-${label}`, visits);
  }
  const content = flow.page.locator(CONTENT);
  const tabs = content.getByRole("tab");
  const tabNames = await tabs.allTextContents();
  visits.push(...tabNames.map((name): Visit => ({ name: `${id}: ${name}`, kind: "tab", disposition: "unvisited" })));
  for (const label of tabNames) {
    const tab = content.getByRole("tab", { name: label.trim(), exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await disclosures(flow, `${id}-${label}`, content, visits);
    await scroll(flow, `${id}-${label}`, content, visits);
    visits.push({ name: `${id}: ${label}`, kind: "tab", disposition: "visited" });
  }
  await scroll(flow, `${id}-content`, content, visits);
  await nestedScroll(flow, id, content, visits);
  await neutralDialogs(flow, id, content, visits);
  await teacher(flow, id, visits);
  await groupDetails(flow, id, visits);
  if ((await group.getAttribute("data-collection")) !== null) {
    await collectionDetails(flow, id, visits);
  }
  visits.push({ name: id, kind: "category", disposition: "visited" });
}

async function regex(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const name = `Surface regex ${flow.pass} ${Date.now()}`;
  try {
    await category(flow, "regex");
    const content = flow.page.locator(CONTENT);
    await content.getByRole("button", { name: "New script", exact: true }).click();
    const create = content.getByRole("form", { name: "New script", exact: true });
    await create.getByRole("textbox", { name: "Script name", exact: true }).fill(name);
    // eslint-disable-next-line orb/no-hand-copied-label -- This is the collection form submit, not the slash-command group label.
    await create.getByRole("button", { name: "Create", exact: true }).click();
    const editor = content.locator('[data-slot="regex-member-editor"]');
    await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
    await editor.getByRole("textbox", { name: "Find pattern", exact: true }).fill("/surface/g");
    await editor.getByRole("textbox", { name: "Replace with", exact: true }).fill("walk");
    await expect
      .poll(async () => (await flow.client.regex.listScripts.query()).find((script) => script.name === name))
      .toMatchObject({ findRegex: "/surface/g", replaceString: "walk" });
    await editor.getByRole("textbox", { name: "Sample text", exact: true }).fill("surface surface");
    await expect(editor.getByRole("textbox", { name: "Result", exact: true })).toHaveValue("walk walk");
    await editor.getByRole("textbox", { name: "Text going in", exact: true }).fill("surface surface");
    await expect(editor.getByRole("textbox", { name: "Text after the whole stream", exact: true })).toBeVisible();
    await scroll(flow, "regex-editor-and-real-testers", content, visits);
    await teacher(flow, "regex-member-scopes", visits);
    visits.push({ name: "Regex disposable create/autosave/real-engine sample and pipeline", kind: "action", disposition: "visited" });
  } finally {
    for (const script of (await flow.client.regex.listScripts.query()).filter((candidate) => candidate.name === name)) {
      await flow.client.regex.removeScript.mutate({ scriptId: script.id });
    }
  }
}

async function rosterJourney(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const original = (await flow.client.rosterPreset.list.query()).find((candidate) => flow.run.subjects.rosters.some(({ id }) => id === candidate.id));
  if (original === undefined) {
    visits.push({
      name: "Roster original member editor",
      kind: "action",
      disposition: "unvisited",
      reason: "No original owned roster in the source provenance; landing is not presented as member coverage.",
    });
    return;
  }
  await category(flow, "rosterPreset");
  const content = flow.page.locator(CONTENT);
  await content.locator('[data-slot="collection-control-row"]').getByRole("textbox").fill(original.name);
  await content.getByRole("button", { name: original.name, exact: true }).click();
  const editor = content.locator('[data-slot="roster-member-editor"]');
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(original.name);
  await scroll(flow, "roster-original-member-seats-rules", content, visits);
  await teacher(flow, "roster-original-teaching", visits);
  visits.push({ name: "Roster original member seats/rules/campaign/teaching", kind: "action", disposition: "visited" });
  visits.push({
    name: "Roster Start chat, Save, RPG campaign, Delete original",
    kind: "action",
    disposition: "excluded",
    reason: "Original source subject is read-only; this journey does not create a room or replace its stored cast/rules.",
  });
}

async function originalEntry(flow: SurfaceFlow, editor: Locator, title: string, visits: Visit[]): Promise<void> {
  await editor.getByText(title, { exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
  await scroll(flow, "world-info-original-entry", flow.page.locator(CONTENT), visits);
}

async function openBook(flow: SurfaceFlow, name: string): Promise<Locator> {
  await category(flow, "worldInfo");
  const content = flow.page.locator(CONTENT);
  await content.getByRole("textbox", { name: "Filter world info", exact: true }).fill(name);
  await content.getByRole("button", { name, exact: true }).click();
  const editor = content.locator(EDITOR);
  await expect(editor.getByRole("heading", { name, exact: true })).toBeVisible();
  return editor;
}

async function worldInfo(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const originals = (await flow.client.worldInfo.listBooks.query()).filter((book) => flow.run.subjects.worldBooks.some(({ id }) => id === book.id));
  const original = originals[0];
  if (original !== undefined) {
    const editor = await openBook(flow, original.name);
    await scroll(flow, "world-info-original-book", flow.page.locator(CONTENT), visits);
    await teacher(flow, "world-info-original-attachments", visits);
    const entries = await flow.client.worldInfo.listEntries.query({ bookId: original.id });
    const entry = entries[0];
    if (entry !== undefined) {
      await originalEntry(flow, editor, entry.title, visits);
    }
  } else {
    visits.push({
      name: "World Info original source book/entry",
      kind: "action",
      disposition: "unvisited",
      reason: "Provenance contains no original owned world book; no synthetic book is presented as original evidence.",
    });
  }

  const name = `Surface ${flow.pass} ${Date.now()}`;
  try {
    await category(flow, "worldInfo");
    const content = flow.page.locator(CONTENT);
    await content.getByRole("button", { name: "New book", exact: true }).click();
    const create = content.getByRole("form", { name: "New book", exact: true });
    await create.getByRole("textbox", { name: "Book name", exact: true }).fill(name);
    await checkpoint(flow, "world-info-create-controls", create);
    // eslint-disable-next-line orb/no-hand-copied-label -- This is the collection form submit, not the slash-command group label.
    await create.getByRole("button", { name: "Create", exact: true }).click();
    const editor = content.locator(EDITOR);
    await expect(editor.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(editor.getByText("No entries yet", { exact: true })).toBeVisible();
    await flow.checkpoint({
      name: "config-world-info-empty-book",
      scope: editor,
      witnesses: [editor.getByText("No entries yet", { exact: true })],
      state: "empty",
      checks: SURFACE_CHECKS,
    });
    const verbs = editor.locator('[data-slot="config-member-verbs"], [data-slot="config-drill-header"]');
    await verbs.getByRole("button", { name: "Edit details", exact: true }).click();
    const details = flow.page.getByRole("dialog", { name: "Book details", exact: true });
    const description = "Disposable native surface-walk book";
    await details.getByRole("textbox", { name: "Description", exact: true }).fill(description);
    await checkpoint(flow, "world-info-details", details);
    await details.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByText(description, { exact: true })).toBeVisible();
    await verbs.getByRole("button", { name: "New entry", exact: true }).click();
    const title = editor.getByRole("textbox", { name: "Title", exact: true });
    const entryName = `${name} entry`;
    await title.fill(entryName);
    await editor.getByRole("textbox", { name: "Content", exact: true }).fill("Disposable lore, never attached to an original subject.");
    // eslint-disable-next-line orb/no-hand-copied-label -- This is World Info's entry memo, not the RPG journal type.
    await editor.getByRole("textbox", { name: "Note", exact: true }).fill("Native entry autosave readback");
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
    const injection = editor.getByRole("switch", { name: "Inject at a depth in history", exact: true });
    await injection.click();
    await expect(editor.getByRole("textbox", { name: "Depth", exact: true })).toBeVisible();
    await expect(editor.getByRole("combobox", { name: "Role", exact: true })).toBeVisible();
    await scroll(flow, "world-info-disposable-entry-injection", content, visits);
    await injection.click();
    await expect(editor.getByRole("combobox", { name: "Placement", exact: true })).toBeVisible();
    await scroll(flow, "world-info-disposable-entry-placement", content, visits);
    await editor.getByRole("button", { name: `Delete ${entryName}`, exact: true }).click();
    const confirmation = flow.page.getByRole("alertdialog");
    await checkpoint(flow, "world-info-delete-entry-confirmation", confirmation);
    await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(editor.getByText("No entries yet", { exact: true })).toBeVisible();
    await expect.poll(async () => (await flow.client.worldInfo.listEntries.query({ bookId: book.id })).length).toBe(0);
    await category(flow, "worldInfo");
    await content.getByRole("textbox", { name: "Filter world info", exact: true }).fill(name);
    const actions = content.getByRole("button", { name: rowActionsName(name), exact: true });
    await actions.focus();
    await actions.press("Enter");
    const menu = flow.page.getByRole("menu");
    const download = flow.page.waitForEvent("download");
    await menu.getByRole("menuitem", { name: "Export", exact: true }).click();
    const exported = await download;
    const path = join(flow.run.runRoot, `world-info-${flow.pass}-${basename(exported.suggestedFilename())}`);
    await exported.saveAs(path);
    expect(await exported.failure()).toBeNull();
    expect((await stat(path)).size).toBeGreaterThan(0);
    await flow.info.attach("config-world-info-native-export", { path });
    await content.getByRole("button", { name: "More library actions", exact: true }).click();
    const chooser = flow.page.waitForEvent("filechooser");
    await flow.page.getByRole("menuitem", { name: "Import a world-info book", exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(
      flow.page.getByRole("region", { name: "Alerts", exact: true }).getByText("That book is already in your library — nothing was added.", { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await flow.client.worldInfo.listBooks.query()).filter((candidate) => candidate.name === name).length).toBe(1);
    visits.push({
      name: "World Info disposable create/details/autosave/injection/delete/export/native file reimport dedup",
      kind: "action",
      disposition: "visited",
    });
  } finally {
    for (const book of (await flow.client.worldInfo.listBooks.query()).filter((candidate) => candidate.name === name)) {
      await flow.client.worldInfo.removeBook.mutate({ bookId: book.id });
    }
  }
}

async function librarySetting(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const original = (await flow.client.settings.getUserSettings.query()).config.library.pageSize;
  const next = original === 10 ? 20 : 10;
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
    visits.push({ name: "Rows per page native change/readback/native restore", kind: "action", disposition: "visited" });
  } finally {
    await flow.client.settings.updateUserSettingsSection.mutate({ section: "library", patch: { pageSize: original } });
  }
}

async function worldInfoRecovery(flow: SurfaceFlow, visits: Visit[]): Promise<void> {
  const pattern = "**/trpc/*worldInfo.countBooks*";
  const refuse = async (route: import("@playwright/test").Route): Promise<void> => {
    await route.abort("aborted");
  };
  await flow.page.route(pattern, refuse);
  try {
    await flow.page.goto("/config?to=worldInfo");
    await waitForAppReady(flow.page);
    const content = flow.page.locator(CONTENT);
    const retry = content.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    await flow.checkpoint({ name: "config-world-info-real-read-failure", scope: content, witnesses: [retry], state: "error", checks: SURFACE_CHECKS });
    await flow.page.unroute(pattern, refuse);
    await retry.focus();
    await retry.press("Enter");
    const count = await flow.client.worldInfo.countBooks.query();
    const witness =
      count === 0 ? content.getByText("No world info yet", { exact: true }) : content.getByRole("textbox", { name: "Filter world info", exact: true });
    await flow.checkpoint({
      name: "config-world-info-read-recovered",
      scope: content,
      witnesses: [witness],
      state: count === 0 ? "empty" : "loaded",
      checks: SURFACE_CHECKS,
    });
    visits.push({ name: "World Info aborted real census read/keyboard Retry/recovered library", kind: "action", disposition: "visited" });
  } finally {
    await flow.page.unroute(pattern, refuse);
  }
}

async function configCase(flow: SurfaceFlow, name: string, operation: (visits: Visit[]) => Promise<void>): Promise<void> {
  const visits: Visit[] = [{ name, kind: "action", disposition: "unvisited" }];
  try {
    await flow.page.goto("/config");
    await waitForAppReady(flow.page);
    await operation(visits);
    visits.push({ name, kind: "action", disposition: "visited" });
  } catch (error) {
    visits.push({ name, kind: "action", disposition: "failed", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await configInventory(flow, name, visits);
  }
}

async function configInventory(flow: SurfaceFlow, name: string, visits: readonly Visit[]): Promise<void> {
  const raw = visits.map((visit) => ({
    id: visit.target ?? visit.name,
    kind: visit.kind,
    disposition: visit.disposition,
    ...(visit.reason === undefined ? {} : { reason: visit.reason }),
  }));
  const witnessed = new Map<string, (typeof raw)[number]>();
  for (const observation of raw) {
    const key = surfaceCoverageKey(observation);
    const previous = witnessed.get(key);
    // A later scroll window cannot undo a witness collected while the same control was on screen.
    if (observation.disposition !== "unvisited" || previous === undefined || previous.disposition === "unvisited") {
      witnessed.set(key, observation);
    }
  }
  const observations = [...witnessed.values()];
  const expected = [...new Map(observations.map(({ id, kind }) => [surfaceCoverageKey({ id, kind }), { id, kind }])).values()];
  await attachNativeFile(flow.info, flow.info, "config-itinerary", {
    body: JSON.stringify({ name, registeredCategories: CONFIG_GROUP_IDS, visits }, null, 2),
    contentType: "application/json",
  });
  await publishSurfaceInventory(flow.info, { name: `Config ${name}`, expected, observations });
}

/** Traverse the canonical Settings map and search recovery independently of category editors. */
export async function walkConfigMap(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "map-search", async (visits): Promise<void> => {
    visits.push(...CONFIG_GROUP_IDS.map((id): Visit => ({ name: `map: ${id}`, kind: "control", disposition: "unvisited" })));
    const list = await map(flow);
    const actual = await list.locator('[data-slot="config-group"]').evaluateAll((groups) => groups.map((group) => group.getAttribute("data-config-group")));
    expect(
      actual.toSorted((left, right) => String(left).localeCompare(String(right))),
      "The owner must reach every registered production Config category",
    ).toEqual(CONFIG_GROUP_IDS.toSorted((left, right) => left.localeCompare(right)));
    visits.push(...CONFIG_GROUP_IDS.map((id): Visit => ({ name: `map: ${id}`, kind: "control", disposition: "observed" })));
    await checkpoint(flow, "map", list, list.getByRole("combobox", { name: "Search settings", exact: true }));
    const search = list.getByRole("combobox", { name: "Search settings", exact: true });
    const miss = "surface-walk-no-matching-setting";
    await search.fill(miss);
    const empty = list.getByRole("status").filter({ hasText: `No settings match “${miss}”.` });
    await expect(empty).toBeVisible();
    await flow.checkpoint({ name: "config-search-empty", scope: list, witnesses: [empty], state: "empty", checks: SURFACE_CHECKS });
    await search.fill("");
    await expect(list.locator('[data-slot="config-group"]')).toHaveCount(CONFIG_GROUP_IDS.length);
  });
}

/** Traverse one actual registered category; another category's failure cannot hide it. */
export async function walkConfigCategory(flow: SurfaceFlow, id: ConfigGroupId): Promise<void> {
  await configCase(flow, `category-${id}`, async (visits): Promise<void> => {
    visits.push({ name: id, kind: "category", disposition: "unvisited" });
    await groupJourney(flow, id, visits);
  });
}

/** Exercise a real failed read and keyboard Retry without depending on another category case. */
export async function walkConfigRecovery(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "read-recovery", async (visits): Promise<void> => {
    await worldInfoRecovery(flow, visits);
  });
}

/** Change, read back and restore the named user setting in its own native case. */
export async function walkConfigSettings(flow: SurfaceFlow): Promise<void> {
  await configCase(flow, "reversible-setting", async (visits): Promise<void> => {
    await librarySetting(flow, visits);
  });
}
