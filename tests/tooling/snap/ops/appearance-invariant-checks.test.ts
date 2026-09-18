import { describe } from "vitest";
import type { RuntimeAppearanceHistoricalRow } from "../../../../tooling/src/_shared/appearance-matrix.ts";
import type { BrowserEnvironmentEvidence } from "../../../../tooling/src/_shared/browser-environment.ts";
import type { AppearanceCheckContext } from "../../../../tooling/src/snap/ops/appearance-invariant-check-context.ts";
import { buildAppearanceInvariantChecks } from "../../../../tooling/src/snap/ops/appearance-invariant-checks.ts";
import type { AppearanceDomSnapshot, AppearanceDomSubject, AppearanceElementFacts } from "../../../../tooling/src/snap/ops/appearance-invariant-dom.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DESKTOP_ENVIRONMENT: BrowserEnvironmentEvidence = {
  requested: {
    device: null,
    viewport: { width: 1280, height: 800 },
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  applied: {
    device: null,
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    userAgent: null,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  actual: {
    device: { kind: "desktop" },
    viewport: { width: 1280, height: 800 },
    innerViewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 desktop",
    deviceScaleFactor: 1,
    maxTouchPoints: 0,
    hasTouch: false,
    pointer: "fine",
    hover: "hover",
    colorScheme: "light",
    reducedMotion: false,
    contrast: "no-preference",
    reducedTransparency: false,
    isMobile: false,
  },
  mismatches: [],
};

const MOBILE_ENVIRONMENT: BrowserEnvironmentEvidence = {
  requested: {
    device: "iPhone 14 Pro Max",
    viewport: { width: 430, height: 932 },
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  applied: {
    device: "iPhone 14 Pro Max",
    viewport: { width: 430, height: 932 },
    screen: { width: 430, height: 932 },
    userAgent: "Mozilla/5.0 mobile",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
  },
  actual: {
    device: { kind: "named", name: "iPhone 14 Pro Max" },
    viewport: { width: 430, height: 932 },
    innerViewport: { width: 430, height: 932 },
    screen: { width: 430, height: 932 },
    userAgent: "Mozilla/5.0 mobile",
    deviceScaleFactor: 3,
    maxTouchPoints: 1,
    hasTouch: true,
    pointer: "coarse",
    hover: "none",
    colorScheme: "light",
    reducedMotion: false,
    contrast: "no-preference",
    reducedTransparency: false,
    isMobile: true,
  },
  mismatches: [],
};

const BASE_STYLE = {
  color: "rgb(25, 25, 25)",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  backgroundSize: "auto",
  backdropFilter: "none",
  filter: "none",
  borderRadius: "0px",
  opacity: "1",
  pointerEvents: "auto",
  display: "block",
  position: "static",
  zIndex: "auto",
  overflowX: "visible",
  overflowY: "visible",
  fontSize: "16px",
  lineHeight: "24px",
} as const;

function facts(over: Partial<AppearanceElementFacts> = {}): AppearanceElementFacts {
  return {
    className: "fixture",
    attributes: {},
    style: BASE_STYLE,
    rect: { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 },
    scrollWidth: 200,
    clientWidth: 200,
    hitOwnsCenter: true,
    parentSlots: [],
    ...over,
  };
}

function subject(id: string, elementFacts: AppearanceElementFacts | null, withheld: AppearanceElementFacts | null = null): AppearanceDomSubject {
  return {
    id,
    selector: `[data-appearance-fixture="${id}"]`,
    matchIndex: 0,
    accounting: { declared: 1, candidates: 1, reached: 1, sampled: 1, skipped: [], occluded: 0, offViewport: 0 },
    facts: elementFacts,
    withheldFacts: withheld,
    metrics: { minWidth: 200, minHeight: 100, maxHorizontalOverflow: 0, allHitOwnCenter: true },
  };
}

function snapshot(subjects: readonly AppearanceDomSubject[]): AppearanceDomSnapshot {
  return {
    subjects,
    accounting: {
      declared: subjects.length,
      candidates: subjects.length,
      reached: subjects.length,
      sampled: subjects.length,
      skipped: [],
      occluded: 0,
      offViewport: 0,
    },
    cls: 0,
  };
}

function row(id: RuntimeAppearanceHistoricalRow["id"]): RuntimeAppearanceHistoricalRow {
  return {
    id,
    surface: "chat",
    subjects: [],
    cascade: [],
    merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: "fixture", owner: "fixture" },
    requiredChecks: [],
    optionalSubjectIds: [],
  };
}

function context(current: AppearanceDomSnapshot, before?: AppearanceDomSnapshot): AppearanceCheckContext {
  return {
    current,
    ...(before === undefined ? {} : { before }),
    environment: DESKTOP_ENVIRONMENT,
    settings: { appearanceApplied: true, themeApplied: null, themeResolution: null, themeCatalog: null, backgroundLibraryFirst: null },
    pixel: { "composited-contrast": { sampled: 1, passed: true, actual: "7:1" } },
    animations: { total: 0, dirty: 0, properties: [] },
  };
}

function result(checks: ReturnType<typeof buildAppearanceInvariantChecks>, id: string): boolean | undefined {
  return checks.find((candidate) => candidate.id === id)?.passed;
}

describe("#953 literal appearance semantic checks", () => {
  test("R4 consumes the live MessageRow registry and the content region rather than count-only DOM stand-ins", () => {
    const clean = snapshot([
      subject("html", facts({ style: { ...BASE_STYLE, "--font-scale": "1.25" } })),
      subject("common-scope", facts({ attributes: { "data-density": "compact" } })),
      subject("grid", facts({ rect: { left: 0, top: 0, right: 430, bottom: 932, width: 430, height: 932 } })),
      subject("main", facts({ rect: { left: 0, top: 0, right: 430, bottom: 932, width: 430, height: 932 } })),
      subject("topbar", facts({ rect: { left: 0, top: 0, right: 430, bottom: 60, width: 430, height: 60 } })),
      subject("content", facts({ rect: { left: 0, top: 60, right: 430, bottom: 932, width: 430, height: 872 } })),
      subject("visible-interactives", facts({ rect: { left: 10, top: 70, right: 54, bottom: 114, width: 44, height: 44 } })),
    ]);
    const registry = { mounted: 2, registered: 2, matched: 2, missingIds: [], staleIds: [] } as const;
    const cleanContext: AppearanceCheckContext = {
      ...context(clean),
      environment: MOBILE_ENVIRONMENT,
      messageCarrier: { registry, chatStyles: ["document", "document"] },
    };
    expect(result(buildAppearanceInvariantChecks(row("mobile-compact-large-document"), cleanContext), "root-scale-density-layout")).toBe(true);
    expect(result(buildAppearanceInvariantChecks(row("mobile-compact-large-document"), cleanContext), "topbar-content-separation")).toBe(true);

    const sameCountWrongValue = { ...cleanContext, messageCarrier: { registry, chatStyles: ["document", "bubble"] } };
    expect(result(buildAppearanceInvariantChecks(row("mobile-compact-large-document"), sameCountWrongValue), "root-scale-density-layout")).toBe(false);
    const staleRegistry = {
      ...cleanContext,
      messageCarrier: { registry: { ...registry, registered: 3, staleIds: ["stale-row"] }, chatStyles: ["document", "document"] },
    };
    expect(result(buildAppearanceInvariantChecks(row("mobile-compact-large-document"), staleRegistry), "root-scale-density-layout")).toBe(false);

    const overlappedContent = snapshot(
      clean.subjects.map((candidate) =>
        candidate.id === "content" ? subject("content", facts({ rect: { left: 0, top: 0, right: 430, bottom: 932, width: 430, height: 932 } })) : candidate,
      ),
    );
    expect(
      result(
        buildAppearanceInvariantChecks(row("mobile-compact-large-document"), { ...cleanContext, current: overlappedContent }),
        "topbar-content-separation",
      ),
    ).toBe(false);
  });

  test("R5 judges the explicit opacity-zero control without counting it as a sampled current subject", () => {
    const rect = { left: 20, top: 20, right: 180, bottom: 60, width: 160, height: 40 } as const;
    const hidden = facts({ style: { ...BASE_STYLE, opacity: "0", pointerEvents: "none" }, rect });
    const revealed = facts({ style: { ...BASE_STYLE, opacity: "1", pointerEvents: "auto" }, rect });
    const beforeActions = {
      ...subject("actions-row", null, hidden),
      matchIndex: null,
      accounting: { declared: 1, candidates: 1, reached: 0, sampled: 0, skipped: [{ reason: "opacity-zero", count: 1 }], occluded: 0, offViewport: 0 },
    };
    const before = snapshot([beforeActions]);
    const current = snapshot([
      subject("actions-row", revealed),
      subject("bubble", facts({ rect: { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 } })),
      subject("action-buttons", facts({ rect: { left: 20, top: 20, right: 64, bottom: 64, width: 44, height: 44 } })),
    ]);
    const clean = buildAppearanceInvariantChecks(row("hover-pointer"), context(current, before));
    expect(result(clean, "rest-reveal-polarity")).toBe(true);
    expect(result(clean, "footprint-stable")).toBe(true);

    const escaped = snapshot([
      subject("actions-row", facts({ style: { ...BASE_STYLE, opacity: "1", pointerEvents: "auto" }, rect: { ...rect, top: 90, bottom: 130 } })),
      subject("bubble", facts({ rect: { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 } })),
      subject("action-buttons", facts({ rect: { left: 20, top: 20, right: 64, bottom: 64, width: 44, height: 44 } })),
    ]);
    const escapedCheck = buildAppearanceInvariantChecks(row("hover-pointer"), context(escaped, before)).find(
      (candidate) => candidate.id === "footprint-stable",
    );
    expect(escapedCheck).toMatchObject({ passed: false, actual: expect.stringContaining('"contained":false') });

    const counterfeit = snapshot([subject("actions-row", hidden)]);
    expect(result(buildAppearanceInvariantChecks(row("hover-pointer"), context(current, counterfeit)), "rest-reveal-polarity")).toBe(false);

    const coarseContext: AppearanceCheckContext = { ...context(current, current), environment: MOBILE_ENVIRONMENT };
    expect(result(buildAppearanceInvariantChecks(row("hover-pointer"), coarseContext), "rest-reveal-polarity")).toBe(true);
    const coarseCounterfeit: AppearanceCheckContext = { ...context(current, before), environment: MOBILE_ENVIRONMENT };
    expect(result(buildAppearanceInvariantChecks(row("hover-pointer"), coarseCounterfeit), "rest-reveal-polarity")).toBe(false);
  });

  test("R2 rejects a same-count substitution that omits the timestamp relationship", () => {
    const bubble = facts({ rect: { left: 20, top: 10, right: 180, bottom: 90, width: 160, height: 80 } });
    const name = facts({ parentSlots: ["message-bubble"], rect: { left: 30, top: 20, right: 170, bottom: 40, width: 140, height: 20 } });
    const attribution = facts({
      parentSlots: ["message-name-row", "message-bubble"],
      rect: { left: 40, top: 20, right: 100, bottom: 40, width: 60, height: 20 },
    });
    const timestamp = facts({
      parentSlots: ["message-name-row", "message-bubble"],
      rect: { left: 110, top: 20, right: 160, bottom: 40, width: 50, height: 20 },
    });
    // MessageRow owns this hierarchy: the bubble is one child of the content column, never its parent.
    const content = facts({ rect: { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 } });
    const cleanSubjects = [
      subject("bubble", bubble),
      subject("name-row", name),
      subject("attribution", attribution),
      subject("timestamp", timestamp),
      subject("content-column", content),
    ];
    const substituted = [...cleanSubjects.filter((candidate) => candidate.id !== "timestamp"), subject("unrelated-label", timestamp)];

    expect(result(buildAppearanceInvariantChecks(row("dark-name-time-short-bubble"), context(snapshot(cleanSubjects))), "header-structure")).toBe(true);
    expect(result(buildAppearanceInvariantChecks(row("dark-name-time-short-bubble"), context(snapshot(cleanSubjects))), "content-contained")).toBe(true);
    expect(substituted).toHaveLength(cleanSubjects.length);
    expect(result(buildAppearanceInvariantChecks(row("dark-name-time-short-bubble"), context(snapshot(substituted))), "header-structure")).toBe(false);
  });

  test("R6 requires preview-only token change and rejects a same-count outer-carrier mutation", () => {
    const compact = {
      ...BASE_STYLE,
      "--spacing-field": "6px",
      "--spacing-row": "8px",
      "--spacing-block": "10px",
      "--spacing-section": "12px",
    };
    const comfortable = {
      ...BASE_STYLE,
      "--spacing-field": "10px",
      "--spacing-row": "12px",
      "--spacing-block": "16px",
      "--spacing-section": "20px",
    };
    const previewBefore = facts({
      attributes: { "data-density": "comfortable" },
      style: comfortable,
      rect: { left: 0, top: 0, right: 767, bottom: 100, width: 767, height: 100 },
    });
    const previewAfter = facts({
      attributes: { "data-density": "compact" },
      style: compact,
      rect: { left: 0, top: 0, right: 767, bottom: 100, width: 767, height: 100 },
    });
    const outer = facts({ attributes: { "data-density": "comfortable" }, style: comfortable });
    const popup = facts({ style: comfortable });
    const viewport = facts({ rect: { left: -1, top: -1, right: 201, bottom: 101, width: 202, height: 102 } });
    const before = snapshot([
      subject("density-preview", previewBefore),
      subject("outer-scope", outer),
      subject("dialog-popup", popup),
      subject("dialog-viewport", viewport),
    ]);
    const clean = snapshot([
      subject("density-preview", previewAfter),
      subject("outer-scope", outer),
      subject("dialog-popup", popup),
      subject("dialog-viewport", viewport),
    ]);
    const mutated = snapshot([
      subject("density-preview", previewAfter),
      subject("outer-scope", facts({ attributes: { "data-density": "comfortable" }, style: { ...comfortable, "--spacing-field": "11px" } })),
      subject("dialog-popup", popup),
      subject("dialog-viewport", viewport),
    ]);
    const popupShifted = snapshot([
      subject("density-preview", previewAfter),
      subject("outer-scope", outer),
      subject("dialog-popup", facts({ style: comfortable, rect: { left: 0, top: 0, right: 180, bottom: 100, width: 180, height: 100 } })),
      subject("dialog-viewport", viewport),
    ]);

    const isolated = {
      attempted: 1,
      exact: 1,
      fulfilled: 1,
      continued: 0,
      section: "appearance",
      density: "compact",
    } as const;
    const cleanContext = { ...context(clean, before), mutationIsolation: isolated };
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), cleanContext), "token-isolation")).toBe(true);
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), context(clean, before)), "rect-stable")).toBe(true);
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), cleanContext), "persistence-isolation")).toBe(true);
    expect(
      result(
        buildAppearanceInvariantChecks(row("density-preview"), { ...cleanContext, mutationIsolation: { ...isolated, continued: 1 } }),
        "persistence-isolation",
      ),
    ).toBe(false);
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), context(clean, before)), "persistence-isolation")).toBe(false);
    expect(mutated.subjects).toHaveLength(clean.subjects.length);
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), context(mutated, before)), "token-isolation")).toBe(false);
    expect(popupShifted.subjects).toHaveLength(clean.subjects.length);
    expect(result(buildAppearanceInvariantChecks(row("density-preview"), context(popupShifted, before)), "rect-stable")).toBe(false);
  });
});
