// CT: the dev bug-found button (#1095 — features/app-shell/components/bug-report-button.tsx).
//
// MOUNTED DIRECTLY, on purpose. playwright-ct builds with `vite build`, i.e. PRODUCTION mode, so `IS_DEV` is
// false here and the component's own chrome entry (`lib/bug-report-chrome.tsx`, `useVisible: () => IS_DEV`)
// renders nothing in a CT. A direct mount is the sanctioned shape for a dev-gated arm, not a workaround — and
// the same production build is what makes the `bridge: false` assertion below REAL rather than simulated:
// `window.__orb` genuinely does not exist in this bundle.
//
// The POST is intercepted so the CT proves the WIRE (what the button would actually send) without writing a
// file into the repo from a browser test.

import { expect, test } from "@playwright/experimental-ct-react";
import { BugReportButton } from "../../../../../packages/client/src/features/app-shell/components/bug-report-button.tsx";

const ROUTE = "**/api/_debug/bug-report";

/** The one POSTed body, or a loud failure — an empty list means the button never fired, which must not read
 *  as a passing assertion against `undefined`. */
function firstPosted(posted: readonly PostedBody[]): PostedBody {
  const body = posted[0];
  if (body === undefined) {
    throw new Error("the button posted no bug report");
  }
  return body;
}

interface PostedBody {
  readonly note: string;
  readonly windowMinutes: number | null;
  readonly client: {
    readonly window: { readonly requestedMinutes: number | null; readonly padMs: number; readonly fromAt: number | null };
    readonly sources: readonly {
      readonly source: string;
      readonly windowFilterable: boolean;
      readonly reason?: string;
      readonly cap: number | null;
      readonly truncatedAt: number | null;
    }[];
    readonly route: { readonly pathname: string };
    readonly environment: { readonly userAgent: string; readonly devicePixelRatio: number };
    readonly checkpointTotals: Record<string, unknown>;
  };
}

test("captures the note + the window, and the status line names the written report", async ({ mount, page }) => {
  const posted: PostedBody[] = [];
  await page.route(ROUTE, async (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "{}") as PostedBody);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "report-id-1",
        capturedAt: "2026-09-02T08:00:00.000Z",
        written: { json: "/repo/bug-reports/2026-09-02T08-00-00-report-id-1.json" },
      }),
    });
  });

  await mount(<BugReportButton />);
  const trigger = page.getByRole("button", { name: "Report a bug" });
  await expect(trigger).toBeVisible();

  await trigger.click();
  const note = page.getByRole("textbox", { name: "What happened?" });
  await expect(note).toBeVisible();

  // The submit is REFUSED while the note is empty — a report with no words is not a report.
  const submit = page.getByRole("button", { name: "Capture report" });
  await expect(submit).toBeDisabled();

  await note.fill("the roster pane painted empty after I renamed a character");
  await page.getByRole("radio", { name: "~5 minutes ago" }).check();
  await expect(submit).toBeEnabled();
  await submit.click();

  // The SETTLED arm: the status line naming the file is the only thing that tells the owner it fired.
  const status = page.locator('[data-slot="bug-report-status"]');
  await expect(status).toHaveText(/Captured report-id-1 → \/repo\/bug-reports\//u);

  expect(posted).toHaveLength(1);
  const body = firstPosted(posted);
  expect(body.note).toBe("the roster pane painted empty after I renamed a character");
  expect(body.windowMinutes).toBe(5);
});

test("the bundle carries the honesty receipts — the unfilterable sources say WHY, and an absent bridge says so", async ({ mount, page }) => {
  const posted: PostedBody[] = [];
  await page.route(ROUTE, async (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "{}") as PostedBody);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "x", written: { json: "/repo/bug-reports/x.json" } }) });
  });

  await mount(<BugReportButton />);
  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByRole("textbox", { name: "What happened?" }).fill("something looked wrong");
  await page.getByRole("radio", { name: "~5 minutes ago" }).check();
  await page.getByRole("button", { name: "Capture report" }).click();
  await expect(page.locator('[data-slot="bug-report-status"]')).toHaveText(/Captured x/u);

  const bundle = firstPosted(posted).client;

  // THE INCLUSIVE-AROUND PAD is applied, and stated: `fromAt` sits a minute BEFORE the requested start.
  expect(bundle.window.requestedMinutes).toBe(5);
  expect(bundle.window.padMs).toBe(60_000);

  const byName = new Map(bundle.sources.map((meta) => [meta.source, meta]));

  // The console-error ring is real in ANY build (it is not a bridge member), and declares its cap.
  expect(byName.get("consoleErrors()")).toMatchObject({ windowFilterable: true, cap: 128 });

  // A CT is a PRODUCTION build, so `window.__orb` genuinely does not exist. EVERY bridge-fed source therefore
  // reports itself ABSENT WITH A REASON — the alternative (silent empty censuses) would read to a cold reviewer
  // as "the page was quiet", which is the exact lie this bundle exists to prevent.
  expect(bundle.checkpointTotals["bridge"]).toBe(false);
  for (const source of ["queries()", "bus().events", "motion().shifts", "motion().loafs", "flags()", "renders()"]) {
    expect(byName.get(source), source).toMatchObject({ windowFilterable: false, held: 0, kept: 0 });
    expect(byName.get(source)?.reason, source).toContain("not installed");
  }

  // The browser facts always land, bridge or no bridge.
  expect(bundle.environment.userAgent.length).toBeGreaterThan(0);
  expect(bundle.environment.devicePixelRatio).toBeGreaterThan(0);
  expect(bundle.route.pathname.length).toBeGreaterThan(0);
});

test("with a bridge present: the window FILTERS the timestamped censuses and the two unfilterable ones say WHY", async ({ mount, page }) => {
  const posted: PostedBody[] = [];
  await page.route(ROUTE, async (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "{}") as PostedBody);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "y", written: { json: "/repo/bug-reports/y.json" } }) });
  });

  await mount(<BugReportButton />);

  // A CT bundle has no `__orb` (production build), so the bridge-PRESENT arm is exercised by installing the
  // reads the capture actually consumes. This is the shape of the real handle, not a mock of the capture:
  // one entry per census, half of it deliberately OLDER than the window so the filter has something to drop.
  // NO AMBIENT CLOCK READ (`test-determinism`): every stamp below is a LITERAL, and the two that must land
  // inside the window are expressed as `performance.now()` OFFSETS — which is what the motion rings actually
  // record, and which the capture converts by adding `performance.timeOrigin`. Offsets near zero mean "at page
  // load", i.e. seconds ago, inside any window; a MISSING conversion would place them at 1970 and the filter
  // would drop them. So `kept` here is the conversion's own proof, with no clock arithmetic in this file.
  await page.evaluate(() => {
    const anHourBeforeLoad = -60 * 60_000;
    // `Object.assign` rather than a cast: the stub is a stand-in for `window.__orb`, which a CT's production
    // bundle never installs (agent-bridge.ts early-returns outside dev), and a `as unknown as` here would be
    // a fabricated TYPE claim about a handle this file does not own. The members below are exactly the reads
    // `captureBugReportBundle` consumes — a missing one fails the capture, which is the coupling worth having.
    Object.assign(globalThis, {
      __orb: {
        queries: () => [{ key: ["recent"], status: "success", fetch: "idle", stale: false, updatedAt: 0 }],
        bus: () => ({ live: 1, events: [{ at: 0, type: "message", chatId: "c", keys: [] }] }),
        motion: () => ({
          shifts: [
            { startTime: 0, value: 0.02 },
            { startTime: anHourBeforeLoad, value: 0.9 },
          ],
          loafs: [{ startTime: 1000, duration: 120 }],
          cls: 0.92,
          observedCls: 0.92,
          nonVirtualizedCls: 0.92,
          observedVirtualizedCls: 0,
          virtualizedCls: 0,
          worstShift: 0.9,
          worstBlocking: 120,
        }),
        // Deduped at its FIRST raise, long before the window — the record a naive filter would have dropped.
        flags: () => [{ tag: "anim", at: anHourBeforeLoad, offender: ".card", detail: "animating height", overBudget: true }],
        renders: () => [{ id: "region:content", count: 19, mounts: 1, updates: 18, totalMs: 40, avgMs: 2, maxMs: 21 }],
        perf: () => [{ name: "app-ready", ms: 300 }],
        shell: () => ({ section: "Chats", panels: [], chatOpen: true, focus: false }),
      },
    });
  });

  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByRole("textbox", { name: "What happened?" }).fill("with a bridge installed");
  await page.getByRole("radio", { name: "~5 minutes ago" }).check();
  await page.getByRole("button", { name: "Capture report" }).click();
  await expect(page.locator('[data-slot="bug-report-status"]')).toHaveText(/Captured y/u);

  const bundle = firstPosted(posted).client;
  const byName = new Map(bundle.sources.map((meta) => [meta.source, meta]));

  expect(bundle.checkpointTotals["bridge"]).toBe(true);
  // The CLS scalars ride `checkpointTotals`, never the windowed evidence — they answer no time question.
  expect(bundle.checkpointTotals["cls"]).toBe(0.92);

  // THE CONVERSION, proven by the filter: the motion records are `performance.now()` offsets, so the one at
  // offset 0 (page load, seconds ago) must be KEPT and the one an hour before load must be DROPPED. Without the
  // `performance.timeOrigin` addition both would compare as 1970 and `kept` would be 0.
  expect(byName.get("motion().shifts")).toMatchObject({ windowFilterable: true, held: 2, kept: 1, cap: 32 });
  expect(byName.get("motion().loafs")).toMatchObject({ windowFilterable: true, held: 1, kept: 1, cap: 64 });

  // The EPOCH-clock sources are wired and filterable; the 1970 stamps above are outside every window, which is
  // what a source fed a raw offset would look like — so a `kept: 0` here is the honest answer, not a hole.
  // (The window ARITHMETIC itself is pinned with posed timestamps in tests/kit/evidence-window/index.test.ts.)
  expect(byName.get("queries()")).toMatchObject({ windowFilterable: true, held: 1, kept: 0 });
  expect(byName.get("bus().events")).toMatchObject({ windowFilterable: true, held: 1, kept: 0, cap: 64 });

  // NOT FILTERED, and the bundle says why — the flag's `at` is its first raise, so dropping it would hide a
  // defect that is still happening (owner ruling 2026-09-02, fork 2).
  expect(byName.get("flags()")).toMatchObject({ windowFilterable: false, held: 1, kept: 1, cap: 128 });
  expect(byName.get("flags()")?.reason).toContain("FIRST raise");
  expect(byName.get("renders()")).toMatchObject({ windowFilterable: false, held: 1, kept: 1 });
  expect(byName.get("renders()")?.reason).toContain("no timestamps");

  // TRUNCATION: the shift ring still holds an entry from an hour before the ask, so it DID reach the whole
  // window and must not claim truncation. (The opposite case — a ring that no longer reaches back — is pinned
  // in tests/kit/evidence-window/index.test.ts, where a ring's contents can be posed directly.)
  expect(byName.get("motion().shifts")?.truncatedAt).toBeNull();
});

test("a refused capture SAYS SO — a silent failure would be indistinguishable from a silent success", async ({ mount, page }) => {
  await page.route(ROUTE, async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) });
  });

  await mount(<BugReportButton />);
  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByRole("textbox", { name: "What happened?" }).fill("this one will be refused");
  await page.getByRole("button", { name: "Capture report" }).click();

  await expect(page.locator('[data-slot="bug-report-status"]')).toHaveText(/Capture failed: HTTP 401/u);
});
