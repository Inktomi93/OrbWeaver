// The one disclosure and native-details walkers the full-stack surface walks share. A walk opens every closed
// collapsible and `<details>` under a scope, checkpoints each body, then restores what it opened; the caller owns
// the journey bookkeeping (action, checkpoint and coverage record) and hands it in as hooks.

import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SurfaceWitnessDisposition } from "../iso/surface-coverage.ts";
import { controlledPanel } from "./shell-drive.ts";

const TRIGGER = '[data-slot="collapsible-trigger"]';
const ROOT = '[data-slot="collapsible-root"]';
const CLOSED_TRIGGER = `${TRIGGER}[aria-expanded="false"]:not([aria-haspopup])`;

export interface DisclosureWalkHooks {
  /** The most disclosures one scope opens, and the deepest `<details>` nesting the walk follows. */
  readonly limit: number;
  readonly depthLimit: number;
  /** The coverage id of the `index`th disclosure or details element under `path`. */
  readonly id: (path: string, kind: "disclosure" | "details", index: number) => string;
  readonly expect: (id: string, kind: "disclosure" | "native-details") => void;
  readonly action: (id: string, step: { readonly action: () => Promise<void>; readonly ready: () => Promise<void> }) => Promise<unknown>;
  readonly checkpoint: (id: string, scope: Locator) => Promise<void>;
  readonly record: (id: string, disposition: SurfaceWitnessDisposition, detail: string) => void;
  /** The disposition of a scope whose disclosures were all opened. */
  readonly completed: SurfaceWitnessDisposition;
  /** The body a disclosure opened is settled: visible, loaded and carrying text. */
  readonly ready: (body: Locator) => Promise<void>;
  /** The scope with its disclosures open, before the walk restores them. */
  readonly opened?: (scope: Locator, path: string) => Promise<void>;
  /** Names the walk in `record` details: the roots, the `${path}/disclosures` and `${path}/nested-details` ids. */
  readonly summary: (path: string) => { readonly disclosures: string; readonly nestedDetails: string };
}

/** Open every closed disclosure under `scope`, depth first, then close what this walk opened. */
export async function walkDisclosures(scope: Locator, path: string, hooks: DisclosureWalkHooks): Promise<void> {
  const opened: Locator[] = [];
  for (let index = 0; index < hooks.limit; index += 1) {
    const closed = scope.locator(`${CLOSED_TRIGGER}:visible`);
    if ((await closed.count()) === 0) {
      break;
    }
    const rootIndex = await closed.first().evaluate(
      (node, container) => {
        const host = node.closest('[data-slot="collapsible-root"]');
        if (host === null) {
          throw new Error("The disclosure has no semantic host");
        }
        return [...container.querySelectorAll('[data-slot="collapsible-root"]')].indexOf(host);
      },
      await scope.elementHandle(),
    );
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    const trigger = scope.locator(ROOT).nth(rootIndex).locator(TRIGGER).first();
    const id = hooks.id(path, "disclosure", index);
    hooks.expect(id, "disclosure");
    await hooks.action(id, {
      action: async () => {
        await trigger.click();
      },
      ready: async () => {
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toHaveAttribute("aria-controls", /.+/u);
        await hooks.ready(await controlledPanel(trigger));
      },
    });
    opened.push(trigger);
    const body = await controlledPanel(trigger);
    await hooks.checkpoint(id, body);
    await walkNativeDetails(body, id, hooks);
  }
  const remaining = await scope.locator(`${CLOSED_TRIGGER}:visible`).count();
  hooks.record(
    hooks.summary(path).disclosures,
    remaining === 0 ? hooks.completed : "unvisited",
    `${String(opened.length)} nested disclosures opened; ${String(remaining)} remain beyond the safety bound`,
  );
  await hooks.opened?.(scope, path);
  for (const trigger of opened.toReversed()) {
    const body = await controlledPanel(trigger);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // A closing panel stays visible through its exit transition; the scope's next census must not count its controls.
    await expect(body).toBeHidden();
  }
  await walkNativeDetails(scope, path, hooks);
}

/** Open every visible `<details>` under `scope` that is not nested in another, recurse into each, then restore it. */
async function walkNativeDetails(scope: Locator, path: string, hooks: DisclosureWalkHooks, depth = 0): Promise<void> {
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
  if (depth >= hooks.depthLimit && indices.length > 0) {
    hooks.record(hooks.summary(path).nestedDetails, "unvisited", `${String(indices.length)} native details exceed the traversal bound`);
    return;
  }
  for (const index of indices) {
    const detail = candidates.nth(index);
    const id = hooks.id(path, "details", index);
    hooks.expect(id, "native-details");
    const wasOpen = await detail.evaluate((node) => node.hasAttribute("open"));
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
    await expect(detail).toHaveAttribute("open", /.*/u);
    await hooks.checkpoint(id, detail);
    await walkNativeDetails(detail, id, hooks, depth + 1);
    if (!wasOpen) {
      await detail.locator(":scope > summary").click();
    }
  }
}

/** Mobile WebKit cannot deliver a wheel, so a walk there positions the scroller through the CSSOM and says so. */
export function usesProgrammaticScroll(page: Page, info: TestInfo): boolean {
  return page.context().browser()?.browserType().name() === "webkit" && info.project.use.isMobile === true;
}
