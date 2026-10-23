import { routeTrpc } from "@orb/testkit/ct";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SessionFreshnessStory } from "./_session-freshness-stories.tsx";

const STORY = "tests/client/data/_session-freshness-stories/SessionFreshnessStory";
const FLOOR_MS = 300_000;

interface SessionCapture {
  readonly reads: () => number;
  readonly viewerReads: () => number;
  readonly recover: () => void;
  readonly unreachable: (value: boolean) => void;
  readonly authenticated: (value: boolean) => void;
}

async function captureSession(page: Page, root: Awaited<ReturnType<typeof createCorpusHarness>>): Promise<SessionCapture> {
  const caller = await root.internalCallerFor(root.ownerId);
  const viewer = await caller.sessions.me();
  const admitted = await captureCookieAuth(root, await root.principalFor(root.ownerId), "session-probe-password");
  const liveResponse = await root.http.request("/api/auth/me", { headers: { cookie: admitted.cookie } });
  const live = await liveResponse.text();
  const dead = await (await root.http.request("/api/auth/me")).text();
  const config = await (await root.http.request("/api/auth/config")).text();
  const refusedResponse = await root.http.request("/api/trpc/sessions.me?batch=1");
  const refused = await refusedResponse.text();
  expect(liveResponse.status).toBe(200);
  expect(refusedResponse.status).toBe(401);
  let refuseNext = false;
  let reads = 0;
  let viewerReads = 0;
  let unreachable = false;
  let authenticated = true;
  await routeTrpc(page, {
    "sessions.me": () => {
      viewerReads += 1;
      return viewer;
    },
  });
  await page.route("**/api/trpc/sessions.me*", async (route) => {
    if (!refuseNext) {
      return route.fallback();
    }
    refuseNext = false;
    await route.fulfill({ status: refusedResponse.status, contentType: "application/json", body: refused });
  });
  await page.route("**/api/auth/config", (route) => route.fulfill({ contentType: "application/json", body: config }));
  await page.route("**/api/auth/me", async (route) => {
    reads += 1;
    if (unreachable) {
      await route.abort("aborted");
    } else {
      await route.fulfill({ contentType: "application/json", body: authenticated ? live : dead });
    }
  });
  return {
    reads: (): number => reads,
    viewerReads: (): number => viewerReads,
    recover: (): void => {
      refuseNext = true;
    },
    unreachable: (value: boolean): void => {
      unreachable = value;
    },
    authenticated: (value: boolean): void => {
      authenticated = value;
    },
  };
}

test("a genuine recovery confirms the injected clock; hidden and under-floor edges stay quiet and teardown unsubscribes", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const session = await captureSession(page, root);
  const component = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toBeVisible();
  const before = session.viewerReads();
  session.recover();
  await page.getByRole("button", { name: "Read session", exact: true }).click();
  await expect.poll(session.reads).toBe(1);
  await expect.poll(session.viewerReads).toBeGreaterThan(before);
  await expect(page.getByRole("status", { name: "Document navigation", exact: true })).toHaveText("none");

  await component.update({ nowMs: FLOOR_MS - 1 });
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect(page.getByRole("status", { name: "Visibility delivery", exact: true })).toHaveText("1");
  expect(session.reads()).toBe(1);
  await component.update({ nowMs: FLOOR_MS, visible: false });
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect(page.getByRole("status", { name: "Visibility delivery", exact: true })).toHaveText("2");
  expect(session.reads()).toBe(1);
  await component.update({ nowMs: FLOOR_MS });
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect.poll(session.reads).toBe(2);
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect(page.getByRole("status", { name: "Visibility delivery", exact: true })).toHaveText("4");
  expect(session.reads()).toBe(2);
  await page.getByRole("button", { name: "Unmount session owner", exact: true }).click();
  await expect(page.getByText("Session owner unmounted", { exact: true })).toBeVisible();
  await component.update({ nowMs: FLOOR_MS * 2 });
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect(page.getByRole("status", { name: "Visibility delivery", exact: true })).toHaveText("5");
  expect(session.reads()).toBe(2);
  await component.unmount();
});

test("an unreachable visibility read retries, while a real signed-out verdict opens recovery without discarding the workspace", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const session = await captureSession(page, root);
  const component = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toBeVisible();
  session.recover();
  const before = session.viewerReads();
  await page.getByRole("button", { name: "Read session", exact: true }).click();
  await expect.poll(session.viewerReads).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Open Corpus", exact: true }).click();
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  session.unreachable(true);
  await component.update({ nowMs: FLOOR_MS });
  const failed = page.waitForEvent("requestfailed", (request) => new URL(request.url()).pathname === "/api/auth/me");
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await failed;
  await expect(page.getByRole("status", { name: "Session prompt", exact: true })).toHaveText("none");
  await expect(page.getByRole("status", { name: "Document navigation", exact: true })).toHaveText("none");
  session.unreachable(false);
  session.authenticated(false);
  await page.getByRole("button", { name: "Visibility edge", exact: true }).click();
  await expect(page.getByRole("status", { name: "Session prompt", exact: true })).toHaveText("reauth");
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  await component.unmount();
});
