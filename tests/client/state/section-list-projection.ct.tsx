// section-list-projection CT — the two `#state` answers a feature is allowed to ask about its LIST pane:
// "is this section in the mobile LIST-AS-SCREEN arm?" (`useSectionListIsScreen`) and "is my list docked?"
// (`useListDocked`). Both are driven here over the REAL config selection seam and the REAL registry, so the
// projection is proven against the production store — the M10 lesson is that a hand-copied mirror of this
// answer is exactly how the tiers drift.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionListProjectionProbe } from "./_ct-stories.tsx";

test("useSectionListIsScreen: a section that DECLARES a list with nothing selected is in the arm; a section with no list never is", async ({ mount }) => {
  const probe = await mount(<SectionListProjectionProbe />);
  const state = probe.locator("output");

  // config declares a list (and therefore a selection seam) and nothing is open ⇒ the arm.
  await expect(state).toContainText("config-screen=true");
  // refinery declares no list at all — there is nothing to make the screen, in any viewport.
  await expect(state).toContainText("refinery-screen=false");

  // Opening a member ENDS the arm (CONTENT is the screen on a phone), and clearing restores it — read
  // through the section's own intents, which is what its rows and the shell's back affordance both call.
  await probe.getByRole("button", { name: "open member" }).click();
  await expect(state).toContainText("config-screen=false");
  await probe.getByRole("button", { name: "clear member" }).click();
  await expect(state).toContainText("config-screen=true");
});

test("useListDocked agrees with the shell on mobile: the roster IS docked while nothing is selected, and is not once a member is open", async ({ mount }) => {
  const probe = await mount(<SectionListProjectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("config-docked=true");

  // On a phone the answer used to be an unconditional `false` (a list was always a closed sheet). Under the
  // ONE-SHELL rule the roster is the screen — which IS docked — so this projection must say so, or a feature
  // asking "is my list visible?" gets a different answer from the pixels.
  await probe.getByRole("button", { name: "enter mobile viewport" }).click();
  await expect(state).toContainText("config-docked=true");

  await probe.getByRole("button", { name: "open member" }).click();
  await expect(state).toContainText("config-docked=false");

  // …and back on the desktop the pre-existing algebra is untouched: the section's own `docked` default wins.
  await probe.getByRole("button", { name: "enter desktop viewport" }).click();
  await expect(state).toContainText("config-docked=true");
});

// ── ONE DOOR BACK (side-eye P2), the rendered half ───────────────────────────────────────────────────
// A section's `clear` — the SAME function the shell's mobile back affordance calls and the SAME one a
// surface's in-content "Back" calls — must also RELEASE the slide-over request, or the two doors land the
// user in two different states (measured: `clear*Selection` alone left an open LIST sheet request behind).
// `null`, not `"none"`: the release restores the regime DEFAULT (on a phone, the roster as the screen);
// `"none"` would suppress it.

test("clearing a selection releases the LIST slide-over request — every back door lands in ONE state", async ({ mount }) => {
  const probe = await mount(<SectionListProjectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("overlay=none");

  await probe.getByRole("button", { name: "open list overlay" }).click();
  await expect(state).toContainText("overlay=list");
  await probe.getByRole("button", { name: "open member" }).click();

  await probe.getByRole("button", { name: "clear member" }).click();
  await expect(state).toContainText("config-screen=true");
  await expect(state).toContainText("overlay=none");
});
