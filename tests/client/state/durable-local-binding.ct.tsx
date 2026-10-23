import { createCorpusHarness } from "@orb/testkit/node/corpus.ts";
import { seedCorpusAccount } from "@orb/testkit/node/corpus-auth.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/test";
import type { SessionFreshnessStory } from "../data/_session-freshness-stories.tsx";

const STORY = "tests/client/data/_session-freshness-stories/SessionFreshnessStory";

test("verified binding preserves returning-user bytes and rejects another user's boot hint", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const foreign = await seedCorpusAccount(root);
  const other = await root.internalCallerFor(foreign.userId);
  let viewer = await owner.sessions.me();
  const ownerKey = `orb:u/${viewer.userId}/shell`;
  await routeTrpc(page, { "sessions.me": () => viewer });

  const first = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("home");
  await page.getByRole("button", { name: "Open Corpus", exact: true }).click();
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ownerKey)).not.toBeNull();
  const saved = await page.evaluate((key) => localStorage.getItem(key), ownerKey);
  await first.unmount();

  const returning = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  expect(await page.evaluate((key) => localStorage.getItem(key), ownerKey)).toBe(saved);
  await returning.unmount();

  viewer = await other.sessions.me();
  const foreignKey = `orb:u/${viewer.userId}/shell`;
  const changed = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("home");
  expect(await page.evaluate((key) => localStorage.getItem(key), ownerKey)).toBe(saved);
  expect(await page.evaluate((key) => localStorage.getItem(key), foreignKey)).toBeNull();
  await changed.unmount();
});

test("first verified binding adopts the actual legacy store bytes without clearing the projection", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const viewer = await (await root.internalCallerFor(root.ownerId)).sessions.me();
  const ownerKey = `orb:u/${viewer.userId}/shell`;
  await routeTrpc(page, { "sessions.me": () => viewer });
  const initial = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Corpus", exact: true }).click();
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ownerKey)).not.toBeNull();
  const saved = await page.evaluate((key) => localStorage.getItem(key), ownerKey);
  if (saved === null) {
    throw new Error("The production shell action did not persist its state");
  }
  await initial.unmount();
  await page.evaluate(
    ({ key, bytes }) => {
      localStorage.setItem("orb:shell", bytes);
      localStorage.removeItem(key);
      localStorage.removeItem("orb:active-user");
    },
    { key: ownerKey, bytes: saved },
  );

  const adopted = await mount<typeof SessionFreshnessStory>(STORY, {});
  await expect(page.getByRole("status", { name: "Bound workspace", exact: true })).toHaveText("corpus");
  expect(await page.evaluate((key) => localStorage.getItem(key), ownerKey)).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem("orb:shell"))).toBeNull();
  await adopted.unmount();
});
