// Browser-side subject census for #953. The client supplies the literal selectors; this pass classifies
// every match as sampled, skipped, occluded, or off-viewport and retains one measured representative.

import type { Page } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AppearancePopulationAccounting, AppearanceSubjectReceipt } from "../contract/appearance-invariants.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

interface ProbeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface AppearanceElementFacts {
  readonly className: string;
  readonly attributes: Readonly<Record<string, string | null>>;
  readonly style: Readonly<Record<string, string>>;
  readonly rect: ProbeRect;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly hitOwnsCenter: boolean | null;
  readonly centerHit?: { readonly tagName: string; readonly slot: string | null; readonly className: string } | null;
  readonly parentSlots: readonly string[];
}

export interface AppearanceDomSubject extends AppearanceSubjectReceipt {
  readonly facts: AppearanceElementFacts | null;
  readonly withheldFacts: AppearanceElementFacts | null;
  readonly metrics: {
    readonly minWidth: number | null;
    readonly minHeight: number | null;
    readonly maxHorizontalOverflow: number;
    readonly allHitOwnCenter: boolean;
  };
}

export interface AppearanceDomSnapshot {
  readonly subjects: readonly AppearanceDomSubject[];
  readonly accounting: AppearancePopulationAccounting;
  readonly cls: number | null;
}

interface BrowserStyle {
  readonly display: string;
  readonly visibility: string;
  readonly opacity: string;
  readonly pointerEvents: string;
  readonly color: string;
  readonly backgroundColor: string;
  readonly backgroundImage: string;
  readonly backgroundSize: string;
  readonly backdropFilter: string;
  readonly filter: string;
  readonly borderRadius: string;
  readonly position: string;
  readonly zIndex: string;
  readonly overflowX: string;
  readonly overflowY: string;
  readonly fontSize: string;
  readonly lineHeight: string;
  readonly getPropertyValue: (name: string) => string;
}

interface BrowserElement {
  readonly tagName: string;
  readonly className: unknown;
  readonly parentElement: BrowserElement | null;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly getAttribute: (name: string) => string | null;
  readonly getBoundingClientRect: () => ProbeRect;
  readonly contains: (other: BrowserElement) => boolean;
}

interface BrowserGlobals {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly document: {
    readonly querySelectorAll: (selector: string) => readonly BrowserElement[];
    readonly elementFromPoint: (x: number, y: number) => BrowserElement | null;
  };
  readonly getComputedStyle: (element: BrowserElement) => BrowserStyle;
  readonly __orb?: { readonly motion: () => { readonly nonVirtualizedCls?: unknown } };
}

interface BrowserSubjectPolicy {
  readonly id: string;
  readonly selector: string;
  readonly sample: "carrier" | "geometry" | "interactive" | "pixel";
}

interface BrowserProbeInput {
  readonly subjects: readonly BrowserSubjectPolicy[];
  readonly properties: readonly string[];
}

interface MutableSubjectCensus {
  sampled: number;
  occluded: number;
  offViewport: number;
  readonly skipped: Map<string, number>;
  facts: AppearanceElementFacts | null;
  withheldFacts: AppearanceElementFacts | null;
  matchIndex: number | null;
  readonly widths: number[];
  readonly heights: number[];
  maxHorizontalOverflow: number;
  allHitOwnCenter: boolean;
}

function browserAppearanceCensus(input: BrowserProbeInput): AppearanceDomSnapshot {
  const MaxParentSlots = 8;
  const browser = globalThis as unknown as BrowserGlobals;
  const attributes = ["data-density", "data-theme", "data-chat-style", "data-has-bg-image", "data-reduced-motion", "data-slot", "data-placement"];
  const styleProperties = [
    ...new Set(["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section", "--font-scale", "--color-background", ...input.properties]),
  ];
  const inViewport = (rect: ProbeRect): boolean =>
    rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < browser.innerHeight && rect.left < browser.innerWidth;
  const centerHit = (
    element: BrowserElement,
    rect: ProbeRect,
    pointerEvents: string,
  ): { readonly owns: boolean | null; readonly hit: NonNullable<AppearanceElementFacts["centerHit"]> | null } => {
    if (pointerEvents === "none") {
      return { owns: null, hit: null };
    }
    const x = Math.max(0, Math.min(browser.innerWidth - 1, (Math.max(0, rect.left) + Math.min(browser.innerWidth, rect.right)) / 2));
    const y = Math.max(0, Math.min(browser.innerHeight - 1, (Math.max(0, rect.top) + Math.min(browser.innerHeight, rect.bottom)) / 2));
    const hit = browser.document.elementFromPoint(x, y);
    return {
      owns: hit !== null && (hit === element || element.contains(hit) || hit.contains(element)),
      hit:
        hit === null
          ? null
          : {
              tagName: hit.tagName,
              slot: hit.getAttribute("data-slot"),
              className: typeof hit.className === "string" ? hit.className : "",
            },
    };
  };
  const factsFor = (element: BrowserElement, style: BrowserStyle, rect: ProbeRect): AppearanceElementFacts => {
    const parentSlots: string[] = [];
    for (let parent = element.parentElement; parent !== null && parentSlots.length < MaxParentSlots; parent = parent.parentElement) {
      const slot = parent.getAttribute("data-slot");
      if (slot !== null) {
        parentSlots.push(slot);
      }
    }
    const hit = centerHit(element, rect, style.pointerEvents);
    return {
      className: typeof element.className === "string" ? element.className : "",
      attributes: Object.fromEntries(attributes.map((name) => [name, element.getAttribute(name)])),
      style: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backdropFilter: style.backdropFilter,
        filter: style.filter,
        borderRadius: style.borderRadius,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        display: style.display,
        position: style.position,
        zIndex: style.zIndex,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        ...Object.fromEntries(styleProperties.map((name) => [name, style.getPropertyValue(name).trim()])),
      },
      rect,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      hitOwnsCenter: hit.owns,
      centerHit: hit.hit,
      parentSlots,
    };
  };
  const invisibleReason = (policy: BrowserSubjectPolicy, style: BrowserStyle): string | null => {
    if (style.display === "none") {
      return "display-none";
    }
    if (style.visibility === "hidden") {
      return "visibility-hidden";
    }
    return policy.sample !== "carrier" && Number(style.opacity) === 0 ? "opacity-zero" : null;
  };
  const withhold = (census: MutableSubjectCensus, reason: string, facts: AppearanceElementFacts | null): void => {
    census.skipped.set(reason, (census.skipped.get(reason) ?? 0) + 1);
    census.withheldFacts ??= facts;
  };
  const requireRenderedFacts = (facts: AppearanceElementFacts | null): AppearanceElementFacts => {
    if (facts === null) {
      throw new Error("appearance census reached a visible subject without rendered facts");
    }
    return facts;
  };
  const classifyElement = (policy: BrowserSubjectPolicy, element: BrowserElement, census: MutableSubjectCensus, matchIndex: number): void => {
    const style = browser.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const carrierReached = policy.sample === "carrier" && style.display !== "none" && style.visibility !== "hidden";
    const renderedFacts = style.display === "none" || style.visibility === "hidden" ? null : factsFor(element, style, rect);
    const reason = invisibleReason(policy, style);
    if (reason !== null) {
      withhold(census, reason, renderedFacts);
      return;
    }
    if (!(carrierReached || inViewport(rect))) {
      census.offViewport += 1;
      // The geometry that MADE it off-viewport is the only thing a reader needs to tell a scrolled-away
      // subject from a zero-box one, and a refusal that prints neither reads as "the subject is missing".
      census.withheldFacts ??= renderedFacts;
      return;
    }
    const measured = requireRenderedFacts(renderedFacts);
    if ((policy.sample === "interactive" || policy.sample === "pixel") && measured.hitOwnsCenter === false) {
      census.occluded += 1;
      census.allHitOwnCenter = false;
      census.withheldFacts ??= measured;
      return;
    }
    census.sampled += 1;
    // `many` subjects may begin with a virtualized/offscreen sibling. The representative must be one of
    // the rows the denominator actually sampled or later semantic checks would judge a different member.
    if (census.facts === null) {
      census.facts = measured;
      census.matchIndex = matchIndex;
    }
    census.widths.push(rect.width);
    census.heights.push(rect.height);
    census.maxHorizontalOverflow = Math.max(census.maxHorizontalOverflow, Math.max(0, measured.scrollWidth - measured.clientWidth));
  };
  const censusSubject = (policy: BrowserSubjectPolicy): AppearanceDomSubject => {
    const candidates = [...browser.document.querySelectorAll(policy.selector)];
    const census: MutableSubjectCensus = {
      sampled: 0,
      occluded: 0,
      offViewport: 0,
      skipped: new Map<string, number>(),
      facts: null,
      withheldFacts: null,
      matchIndex: null,
      widths: [],
      heights: [],
      maxHorizontalOverflow: 0,
      allHitOwnCenter: true,
    };
    for (const [matchIndex, element] of candidates.entries()) {
      classifyElement(policy, element, census, matchIndex);
    }
    const skippedRows = [...census.skipped].map(([reason, count]) => ({ reason, count }));
    const reached = census.sampled + census.occluded + census.offViewport;
    return {
      id: policy.id,
      selector: policy.selector,
      accounting: {
        declared: 1,
        candidates: candidates.length,
        reached,
        sampled: census.sampled,
        skipped: skippedRows,
        occluded: census.occluded,
        offViewport: census.offViewport,
      },
      facts: census.facts,
      withheldFacts: census.withheldFacts,
      matchIndex: census.matchIndex,
      metrics: {
        minWidth: census.widths.length === 0 ? null : Math.min(...census.widths),
        minHeight: census.heights.length === 0 ? null : Math.min(...census.heights),
        maxHorizontalOverflow: census.maxHorizontalOverflow,
        allHitOwnCenter: census.allHitOwnCenter,
      },
    };
  };
  const subjects = input.subjects.map(censusSubject);
  const accounting: AppearancePopulationAccounting = {
    declared: subjects.reduce((sum, subject) => sum + subject.accounting.declared, 0),
    candidates: subjects.reduce((sum, subject) => sum + subject.accounting.candidates, 0),
    reached: subjects.reduce((sum, subject) => sum + subject.accounting.reached, 0),
    sampled: subjects.reduce((sum, subject) => sum + subject.accounting.sampled, 0),
    skipped: subjects.flatMap((subject) => subject.accounting.skipped),
    occluded: subjects.reduce((sum, subject) => sum + subject.accounting.occluded, 0),
    offViewport: subjects.reduce((sum, subject) => sum + subject.accounting.offViewport, 0),
  };
  const rawCls = browser.__orb?.motion().nonVirtualizedCls;
  return { subjects, accounting, cls: typeof rawCls === "number" ? rawCls : null };
}

export async function probeAppearanceDom(page: Page, row: RuntimeAppearanceHistoricalRow): Promise<AppearanceDomSnapshot> {
  return await page.evaluate(browserAppearanceCensus, { subjects: row.subjects, properties: row.cascade.map((query) => query.property) });
}
