// RevealGate keeps a secret out of the DOM until an explicit reveal and carries focus through both transitions.
import { expect, test } from "@playwright/test";
import type { ExternallyRevealedGateStory, PinnedHiddenGateStory, UncontrolledGateStory } from "./reveal-gate-stories.tsx";

const STORIES = "tests/ui/primitives/reveal-gate/reveal-gate-stories";
const SECRET = "the private passphrase";

test("the secret is unmounted until the reveal, and unmounted again after the hide", async ({ mount, page }) => {
  await mount<typeof UncontrolledGateStory>(`${STORIES}/UncontrolledGateStory`, { secret: SECRET, hideable: true, disabled: false });
  const secret = page.getByText(SECRET);
  const reveal = page.locator('[data-slot="reveal-gate-trigger"]');
  // A CSS-hidden secret is still in the DOM, so the absence is a count, not a visibility check.
  await expect(reveal).toBeVisible();
  await expect(secret).toHaveCount(0);

  await reveal.click();
  await expect(secret).toBeVisible();
  const hide = page.locator('[data-slot="reveal-gate-hide"]');

  await hide.click();
  await expect(secret).toHaveCount(0);
  await expect(reveal).toBeVisible();
  await expect(page.getByRole("status", { name: "Reported toggles" })).toHaveText("2");
});

test("the live region names the gate on reveal and again, differently, on hide", async ({ mount, page }) => {
  await mount<typeof UncontrolledGateStory>(`${STORIES}/UncontrolledGateStory`, { secret: SECRET, hideable: true, disabled: false });
  const announcement = page.locator('[data-slot="reveal-gate-announcement"]');
  await expect(announcement).toBeEmpty();
  await page.locator('[data-slot="reveal-gate-trigger"]').click();
  await expect(announcement).toContainText("Passphrase");
  const [revealed = ""] = await announcement.allTextContents();
  await page.locator('[data-slot="reveal-gate-hide"]').click();
  await expect(announcement).toContainText("Passphrase");
  await expect(announcement).not.toHaveText(revealed);
});

test("a gate with no hide trigger hands focus to the revealed content", async ({ mount, page }) => {
  await mount<typeof UncontrolledGateStory>(`${STORIES}/UncontrolledGateStory`, { secret: SECRET, hideable: false, disabled: false });
  await page.locator('[data-slot="reveal-gate-trigger"]').click();
  await expect(page.locator('[data-slot="reveal-gate-content"]')).toBeFocused();
  await expect(page.locator('[data-slot="reveal-gate-hide"]')).toHaveCount(0);
});

test("a disabled gate cannot be revealed", async ({ mount, page }) => {
  await mount<typeof UncontrolledGateStory>(`${STORIES}/UncontrolledGateStory`, { secret: SECRET, hideable: true, disabled: true });
  const reveal = page.locator('[data-slot="reveal-gate-trigger"]');
  await expect(reveal).toBeDisabled();
  await expect(page.getByText(SECRET)).toHaveCount(0);
});

test("a controlled gate reports the request and stays hidden until its caller reveals", async ({ mount, page }) => {
  await mount<typeof PinnedHiddenGateStory>(`${STORIES}/PinnedHiddenGateStory`, { secret: SECRET });
  await page.locator('[data-slot="reveal-gate-trigger"]').click();
  await expect(page.getByRole("status", { name: "Reported toggles" })).toHaveText("1");
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.locator('[data-slot="reveal-gate-trigger"]')).toBeVisible();
});

// The Reveal and Hide buttons share a child position, so React keeps one DOM node across a click and focus stays on it
// whether or not the effect runs. A reveal driven from outside starts focus elsewhere, so only the effect can move it.
test("a reveal driven from outside moves focus to the hide trigger", async ({ mount, page }) => {
  await mount<typeof ExternallyRevealedGateStory>(`${STORIES}/ExternallyRevealedGateStory`, { secret: SECRET });
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal from outside" }).click();
  await expect(page.getByText(SECRET)).toBeVisible();
  await expect(page.locator('[data-slot="reveal-gate-hide"]')).toBeFocused();
});
