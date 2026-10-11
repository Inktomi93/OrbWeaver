// CT: `useCoarsePointer` (`@orb/ui/lib`) — the subscribed `(pointer: coarse)` read. Pinned live: a flip after
// mount reaches the mounted component, which is the property the point-in-time `coarsePointerNow()` lacks.
import { expect, test } from "@playwright/experimental-ct-react";
import { CoarsePointerProbe } from "./coarse-pointer-now.fixtures.tsx";

test("reads a fine pointer at mount", async ({ mount }) => {
  const component = await mount(<CoarsePointerProbe />);
  await expect(component).toHaveText("false");
});

test.describe("a touch device", () => {
  test.use({ hasTouch: true });

  test("reads a coarse pointer at mount", async ({ mount }) => {
    const component = await mount(<CoarsePointerProbe />);
    await expect(component).toHaveText("true");
  });
});

test("stays live: a pointer that turns coarse after mount updates the component without remounting", async ({ mount, page }) => {
  // Touch emulation set over CDP outlives the test that set it, so this one starts from a known fine pointer.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  const component = await mount(<CoarsePointerProbe />);
  await expect(component).toHaveText("false");

  try {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect(component).toHaveText("true");
  } finally {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
});
