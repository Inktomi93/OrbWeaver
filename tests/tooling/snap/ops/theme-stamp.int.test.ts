// @instrument-proof: #1227's defect, reproduced and closed in ONE test against a real browser — a page
// whose `html[data-theme]` lands LATE (exactly the app's behaviour: the stamp follows a second settings
// hop after `data-app-ready`) reads `(none)` on the immediate sample the instrument used to take, and
// reads the requested theme once the shipped gate has waited. The immediate read IS the old behaviour,
// so the two assertions in that test are the red and the green side by side.
//
// @instrument-absence-proof: a page that NEVER stamps must produce an evidence gap naming the missing
// stamp — the run exits 2 rather than reporting a default-palette measurement under a theme label. And
// the arms whose stamp this instrument cannot predict (a CUSTOM theme, `--theme none`) must be UNGATED
// with a stated reason, never silently gated into a false refusal on every --matrix cell.
import type { SettingsShimEvidence } from "@orb/tooling/_shared/appearance";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import { vi } from "vitest";
import type { CaptureOutcome } from "../../../../tooling/src/snap/contract/types.ts";
import { awaitThemeStamp, themeStampExit, themeStampExpectation, themeStampGap } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(90_000);
vi.setConfig({ testTimeout: BROWSER_TIMEOUT_MS, hookTimeout: BROWSER_TIMEOUT_MS });

/** How late the fixture stamps. Long enough that an immediate read cannot win the race by accident. */
const STAMP_DELAY_MS = 900;

const LATE_STAMP_HTML = `<!doctype html><html lang="en" data-app-ready="settled"><head><title>late</title>
<script>setTimeout(() => document.documentElement.setAttribute("data-theme", "light"), ${STAMP_DELAY_MS});</script>
</head><body><main><h1>Late stamp</h1></main></body></html>`;
const NEVER_STAMPS_HTML = `<!doctype html><html lang="en" data-app-ready="settled"><head><title>never</title></head>
<body><main><h1>No stamp</h1></main></body></html>`;

function shimEvidence(overrides: Partial<SettingsShimEvidence["themeResolution"]> = {}): SettingsShimEvidence {
  return {
    appearanceApplied: null,
    themeApplied: true,
    themeResolution: { request: "Light", id: "theme_light", name: "Light", source: "seed", ...overrides },
    themeCatalog: null,
    backgroundLibraryFirst: null,
  };
}

async function withPage<T>(html: string, body: (page: Awaited<ReturnType<typeof launchProbeSession>>["page"]) => Promise<T>): Promise<T> {
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 1280, height: 800 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    await session.page.setContent(html);
    return await body(session.page);
  } finally {
    await closeProbeSession(session);
  }
}

test("a LATE stamp is what the old immediate read missed, and what the shipped gate waits for", async () => {
  await withPage(LATE_STAMP_HTML, async (page) => {
    // RED, reproduced: the sample the instrument used to take the moment readiness went up.
    expect(await page.locator("html").first().getAttribute("data-theme")).toBeNull();

    const receipt = await awaitThemeStamp(page, shimEvidence());

    // GREEN: the gate waited, so everything downstream samples the requested theme.
    expect(receipt.gap).toBeNull();
    // …and it WAITED rather than getting lucky on the first read: the instrument's own poll count is the
    // receipt, never the test's wall clock (#1252).
    expect(receipt.polls).toBeGreaterThan(1);
    expect(await page.locator("html").first().getAttribute("data-theme")).toBe("light");
  });
});

test("a page that NEVER stamps is refused by name — not measured under a theme label", async () => {
  await withPage(NEVER_STAMPS_HTML, async (page) => {
    const { gap, polls } = await awaitThemeStamp(page, shimEvidence());

    expect(gap).not.toBeNull();
    expect(gap?.evidence).toContain("data-theme");
    expect(gap?.evidence).toContain("Light");
    expect(gap?.detail).toContain("was ABSENT");
    expect(gap?.detail).toContain("DEFAULT palette");
    // The refusal is over a REAL population: it read the attribute repeatedly and every read came back
    // absent. A refusal after zero reads would be an instrument failure wearing a finding's clothes.
    expect(polls).toBeGreaterThan(1);
  });
});

test("an UNGATED theme arm never waits and never refuses — a custom theme stamps no html attribute", async () => {
  await withPage(NEVER_STAMPS_HTML, async (page) => {
    const receipt = await awaitThemeStamp(page, shimEvidence({ source: "custom", name: "Neon" }));

    expect(receipt.gap).toBeNull();
    // THE PROOF IT DID NOT BURN THE STAMP BUDGET on an arm it cannot judge — read off the instrument's own
    // accounting, not off the clock. A wall-time assertion here would measure the box under lane load
    // (Spine-Testing.md §3); `polls === 0` says the page was never touched, which is the actual claim.
    expect(receipt.polls).toBe(0);
  });
});

test("a seed theme that owns no [data-theme] block (Hearth IS the base ramp) is UNGATED, never refused", () => {
  const hearth = themeStampExpectation(shimEvidence({ name: "Hearth", id: "theme_hearth" }));

  expect(hearth.kind).toBe("ungated");
  expect(hearth.kind === "ungated" ? hearth.reason : "").toContain("owns no generated [data-theme] block");
});

test("the expectation names what it can and cannot predict, and says why", () => {
  const seed = themeStampExpectation(shimEvidence());
  expect(seed).toEqual({ kind: "gated", stamp: "light", themeName: "Light" });

  const custom = themeStampExpectation(shimEvidence({ source: "custom", name: "Neon" }));
  expect(custom.kind).toBe("ungated");
  expect(custom.kind === "ungated" ? custom.reason : "").toContain("ThemeScope");

  const none = themeStampExpectation(shimEvidence({ source: "default", id: null, name: null, request: "none" }));
  expect(none.kind).toBe("ungated");

  const absent = themeStampExpectation(undefined);
  expect(absent.kind).toBe("ungated");
});

test("a stamp that read the WRONG theme is reported as that, not as absent", () => {
  const gap = themeStampGap({ stamp: "light", themeName: "Light" }, "hearth");

  expect(gap.detail).toContain('read "hearth"');
  expect(gap.detail).not.toContain("was ABSENT");
});

test("the exit door downgrades a run to a tool error only when a stamp is missing", () => {
  const clean: readonly Pick<CaptureOutcome, "themeStampGap">[] = [{ themeStampGap: null }];
  const missed: readonly Pick<CaptureOutcome, "themeStampGap">[] = [{ themeStampGap: themeStampGap({ stamp: "light", themeName: "Light" }, null) }];

  expect(themeStampExit(clean, 0)).toBe(0);
  expect(themeStampExit(clean, 1)).toBe(1);
  expect(themeStampExit(missed, 0)).toBe(2);
  expect(themeStampExit(missed, 1)).toBe(2);
});
