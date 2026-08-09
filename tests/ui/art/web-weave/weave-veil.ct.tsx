// <WeaveVeil> CT (docs/design/login-loading-screen.md §4.3/§9.4/§9.8) — the boot veil's contract:
//   • it renders a labelled role="status" layer over the page, riding the BACKGROUND token;
//   • the exit is a real transition that finishes into an UNMOUNT (transitionend, not a timer) and
//     fires `onExited` exactly at that seam — the load-gated dissolve the boot veil builds on;
//   • the enter/exit ride ONE declared transition (`opacity, filter` — interruptible, §3.2), never
//     `all` (the focus-ring/`transition-all` class of defect);
//   • reduced motion = instant removal (§3.9), `onExited` still fires.

import { expect, test } from "@playwright/experimental-ct-react";
import { VeilStory } from "./web-weave.fixtures.tsx";

test("mounts as a labelled status veil riding the background token, with the entered beat stamped", async ({ mount, page }) => {
  await mount(<VeilStory />);
  const veil = page.getByRole("status", { name: "Loading" });
  await expect(veil).toBeVisible();
  // The enter beat lands (double-rAF): the veil reaches its opaque resting state.
  await expect(veil).toHaveAttribute("data-entered", "");
  await expect(veil).toHaveCSS("opacity", "1");
  // Token-riding, compared against a probe resolving the SAME token — not a hardcoded literal
  // (Chromium's computed serialization of oklch is not worth hardcoding either).
  const veilBg = await veil.evaluate((el) => getComputedStyle(el).backgroundColor);
  const tokenBg = await veil.evaluate((el) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-background)";
    el.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  });
  // ONESHOT-OK: both reads are of settled computed style (the entered state was awaited above).
  expect(veilBg).toBe(tokenBg);
  // The transition NAMES its properties (interruptibility without animating focus rings/layout).
  const transitionProperty = await veil.evaluate((el) => getComputedStyle(el).transitionProperty);
  // ONESHOT-OK: transitionProperty is a static declaration, not mutable async state.
  expect(transitionProperty).toBe("opacity, filter");
});

test("closing plays the dissolve, then UNMOUNTS via transitionend and fires onExited", async ({ mount, page }) => {
  await mount(<VeilStory />);
  const veil = page.getByRole("status", { name: "Loading" });
  await expect(veil).toHaveAttribute("data-entered", "");
  await page.getByTestId("ct-veil-close").click();
  // The exit completes: the veil is GONE from the DOM (not opacity-0-but-mounted) and the story's
  // exited flag — driven by onExited — has rendered.
  await expect(page.getByTestId("ct-veil-exited")).toBeVisible();
  await expect(veil).toHaveCount(0);
});

test("reduced motion: the close is an INSTANT removal and onExited still fires (§3.9 REMOVE)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<VeilStory />);
  const veil = page.getByRole("status", { name: "Loading" });
  await expect(veil).toBeVisible();
  await page.getByTestId("ct-veil-close").click();
  await expect(page.getByTestId("ct-veil-exited")).toBeVisible();
  await expect(veil).toHaveCount(0);
});
