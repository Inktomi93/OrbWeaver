// Browser contract for the active-animation bridge. Constructor identity and lifecycle launch timing do
// not exist in node fixtures, so these controls create real CSS transitions and a real WAAPI effect.

import { expect, test } from "@playwright/experimental-ct-react";
import type { AnimationRecord } from "../../../packages/client/src/lib/motion-animation-record.ts";
import { AnimationRecordStory } from "./_motion-animation-record-ct-stories.tsx";

declare global {
  var __readAnimationRecords: (() => readonly AnimationRecord[]) | undefined;
}

test("records Base UI lifecycle, application CSS, and unattributed WAAPI ownership from real animations", async ({ mount, page }) => {
  await mount(<AnimationRecordStory />);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const library = document.querySelector<HTMLElement>('[data-testid="library-transition"]');
            const concurrent = document.querySelector<HTMLElement>('[data-testid="concurrent-transition"]');
            const application = document.querySelector<HTMLElement>('[data-testid="application-transition"]');
            const waapi = document.querySelector<HTMLElement>('[data-testid="waapi-animation"]');
            if (library === null || concurrent === null || application === null || waapi === null) {
              throw new Error("animation record plant failed to mount");
            }
            const startLibraryLifecycle = (event: TransitionEvent): void => {
              if (event.propertyName !== "width") {
                return;
              }
              library.removeEventListener("transitionrun", startLibraryLifecycle);
              library.style.height = "100px";
              library.removeAttribute("data-starting-style");
            };
            library.addEventListener("transitionrun", startLibraryLifecycle);
            library.style.width = "100px";
            const startConcurrentLifecycle = (event: TransitionEvent): void => {
              if (event.propertyName !== "height") {
                return;
              }
              concurrent.removeEventListener("transitionrun", startConcurrentLifecycle);
              concurrent.style.opacity = "0.5";
              concurrent.removeAttribute("data-starting-style");
            };
            concurrent.addEventListener("transitionrun", startConcurrentLifecycle);
            concurrent.style.height = "100px";
            application.style.height = "100px";
            waapi.animate([{ height: "10px" }, { height: "100px" }], { duration: 30_000, fill: "both" });
            resolve();
          });
        });
      }),
  );

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const read = globalThis.__readAnimationRecords;
          if (read === undefined) {
            throw new Error("animation record reader was not installed");
          }
          return read().filter((record) => record.target.includes("transition") || record.target.includes("waapi-animation"));
        }),
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "[data-testid=library-transition]",
          properties: ["height"],
          compositorClean: false,
          targetState: { startingStyle: false, endingStyle: false },
          lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
          attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
        }),
        expect.objectContaining({
          target: "[data-testid=library-transition]",
          properties: ["width"],
          lifecycleState: null,
          attribution: { owner: "application", mechanism: "css-transition" },
        }),
        expect.objectContaining({
          target: "[data-testid=concurrent-transition]",
          properties: ["height"],
          lifecycleState: null,
          attribution: { owner: "application", mechanism: "css-transition" },
        }),
        expect.objectContaining({
          target: "[data-testid=concurrent-transition]",
          properties: ["opacity"],
          lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
          attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
        }),
        expect.objectContaining({
          target: "[data-testid=application-transition]",
          properties: ["height"],
          lifecycleState: null,
          attribution: { owner: "application", mechanism: "css-transition" },
        }),
        expect.objectContaining({
          target: "[data-testid=waapi-animation]",
          properties: ["height"],
          lifecycleState: null,
          attribution: { owner: "unattributed", mechanism: "web-animation" },
        }),
      ]),
    );

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const library = document.querySelector<HTMLElement>('[data-testid="library-transition"]');
        if (library === null) {
          throw new Error("same-target stale-attribution plant failed to mount");
        }
        for (const animation of library.getAnimations()) {
          animation.cancel();
        }
        library.style.transition = "width 30s linear";
        library.style.width = "10px";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            library.style.width = "100px";
            resolve();
          });
        });
      }),
  );

  await expect
    .poll(async () => await page.evaluate(() => globalThis.__readAnimationRecords?.().find((record) => record.target.includes("library-transition"))))
    .toEqual(
      expect.objectContaining({
        properties: ["width"],
        targetState: { startingStyle: false, endingStyle: false },
        lifecycleState: null,
        attribution: { owner: "application", mechanism: "css-transition" },
      }),
    );
});
