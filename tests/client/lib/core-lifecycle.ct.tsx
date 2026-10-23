import { expect, test } from "@playwright/test";
import type { NativeSectionSwapStory, SafeErrorObserverStory } from "./_core-lifecycle-stories.tsx";

test("one section intent coalesces native transitions and completes follow-up work after visual settlement", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light", forcedColors: "none", contrast: "no-preference" });
  await page.addInitScript(() => {
    const nativeStart = document.startViewTransition.bind(document);
    let started = 0;
    let finished = 0;
    document.startViewTransition = (options): ViewTransition => {
      started += 1;
      document.documentElement.dataset["nativeTransitionsStarted"] = String(started);
      const transition = nativeStart(options);
      void transition.finished.then(
        () => {
          finished += 1;
          document.documentElement.dataset["nativeTransitionsFinished"] = String(finished);
        },
        (error: Error) => {
          document.documentElement.dataset["nativeTransitionFailure"] = error.name;
        },
      );
      return transition;
    };
  });
  await mount<typeof NativeSectionSwapStory>("tests/client/lib/_core-lifecycle-stories/NativeSectionSwapStory", {});
  await page.getByRole("button", { name: "Swap sections in one intent", exact: true }).click();
  await expect(page.getByText("Active section: config", { exact: true })).toBeVisible();
  await expect(page.getByText("Section swap settled", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-native-transitions-started", "1");
  await expect(page.locator("html")).toHaveAttribute("data-native-transitions-finished", "1");
});

test("installed browser error observers retain safe frames without private messages, hosts, paths or query tokens", async ({ mount, page }) => {
  await mount<typeof SafeErrorObserverStory>("tests/client/lib/_core-lifecycle-stories/SafeErrorObserverStory", {});
  await page.getByRole("button", { name: "Capture browser errors", exact: true }).click();
  const read = page.getByRole("status", { name: "Captured safe errors", exact: true });
  await expect(read).toContainText('"source":"uncaught"');
  await expect(read).toContainText('"source":"rejection"');
  await expect(read).toContainText('"errorType":"TypeError"');
  await expect(read).toContainText("kept@/assets/client.js:12:34");
  await expect(read).not.toContainText("private-message-canary");
  await expect(read).not.toContainText("private-token-canary");
  await expect(read).not.toContainText("private-host-canary");
  await expect(read).not.toContainText("private-path-canary");
});
