// The rendered half of the density and hierarchy law, read off a settled page. Each rule is a fact the DOM
// shows: UI-Architecture-and-Layout.md §4.3 rule 3 and UI-Density-Law.md §3 (a surface has one tier) and §3.2
// (CD2: a box holds no box). Judgment rules such as "is this grouping a read-only grouping" stay in review.
// Each probe runs in the page and takes its selectors as arguments.
import type { Page } from "@playwright/test";

export interface DensityFinding {
  readonly rule: "second-primary" | "same-tier-surface" | "nested-box";
  readonly detail: string;
}

/** The regions a person sees as one place: a dialog, a side panel, the content pane. */
const REGION_SELECTOR = '[role="dialog"],[role="alertdialog"],.shell-panel,.shell-content';
/** The primary call to action: the Button stamps `data-cta` from its resolved intent. */
const PRIMARY_SELECTOR = '[data-slot="button"][data-cta]:not([disabled]):not([aria-disabled="true"])';
const TIER_SELECTOR = "[data-surface-tier]";
const CARD_SELECTOR = '[data-slot="card-root"]';

async function secondPrimaries(page: Page): Promise<DensityFinding[]> {
  const details = await page.evaluate(
    ([regionSelector, primarySelector]: readonly [string, string]) => {
      const regions = new Map<Element | null, Element[]>();
      for (const control of document.querySelectorAll(primarySelector)) {
        if (control.checkVisibility({ checkOpacity: true, visibilityProperty: true })) {
          const region = control.closest(regionSelector);
          regions.set(region, [...(regions.get(region) ?? []), control]);
        }
      }
      const name = (element: Element): string => element.getAttribute("aria-label") ?? element.textContent.trim().replaceAll(/\s+/gu, " ").slice(0, 48);
      return [...regions]
        .filter(([, controls]) => controls.length > 1)
        .map(
          ([region, controls]) =>
            `${controls.length} primary controls in ${region === null ? "the page" : (region.getAttribute("aria-label") ?? region.tagName)}: ${controls.map(name).join(" | ")}`,
        );
    },
    [REGION_SELECTOR, PRIMARY_SELECTOR] as const,
  );
  return details.map((detail) => ({ rule: "second-primary", detail }));
}

async function sameTierSurfaces(page: Page): Promise<DensityFinding[]> {
  const details = await page.evaluate((tierSelector: string) => {
    const nested: string[] = [];
    for (const surface of document.querySelectorAll(tierSelector)) {
      const tier = surface.getAttribute("data-surface-tier");
      const outer = surface.parentElement?.closest(tierSelector);
      if (outer?.getAttribute("data-surface-tier") === tier && surface.checkVisibility()) {
        nested.push(`a ${tier} Surface inside a ${tier} Surface`);
      }
    }
    return nested;
  }, TIER_SELECTOR);
  return details.map((detail) => ({ rule: "same-tier-surface", detail }));
}

/** CD1 defines a box as border, radius and fill together; CD2 refuses a box inside a box. */
async function nestedBoxes(page: Page): Promise<DensityFinding[]> {
  const details = await page.evaluate((cardSelector: string) => {
    const boxed = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const edged = ["top", "right", "bottom", "left"].some(
        (side) => style.getPropertyValue(`border-${side}-style`) !== "none" && Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0,
      );
      const rounded = ["top-left", "top-right", "bottom-right", "bottom-left"].some(
        (corner) => Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`)) > 0,
      );
      return edged && rounded && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
    };
    const name = (element: Element): string => element.getAttribute("aria-label") ?? element.textContent.trim().replaceAll(/\s+/gu, " ").slice(0, 48);
    const nested: string[] = [];
    for (const card of document.querySelectorAll(cardSelector)) {
      const outer = card.parentElement?.closest(cardSelector);
      if (outer !== null && outer !== undefined && card.checkVisibility() && boxed(card) && boxed(outer)) {
        nested.push(`a boxed card inside a boxed card: ${name(outer)} > ${name(card)}`);
      }
    }
    return nested;
  }, CARD_SELECTOR);
  return details.map((detail) => ({ rule: "nested-box", detail }));
}

/** Every density finding on the page. Hidden elements are skipped: only what a person can see counts. */
export async function densityFindings(page: Page): Promise<DensityFinding[]> {
  return [...(await secondPrimaries(page)), ...(await sameTierSurfaces(page)), ...(await nestedBoxes(page))];
}

export function formatDensityFindings(findings: readonly DensityFinding[]): string {
  return findings.map(({ rule, detail }) => `${rule}: ${detail}`).join("\n");
}
