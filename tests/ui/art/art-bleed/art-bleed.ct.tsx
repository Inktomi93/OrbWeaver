// <ArtBleed> CT (#205) — the decorative art band's whole contract, which is geometry plus silence:
//   • it starts one `--reading-measure-min` (+ the host-padding clearance) in from the host's inline
//     start, which is what lets a host guarantee no ink over art by capping its own column at the SAME
//     measure — the pair moved from the 75ch measure to the 65ch one at #1121 (the wider one collapsed
//     the band to zero width at the shipped 1280 desktop default, so #205's art rendered at no width
//     anyone runs). The token this probe resolves is the contract; it is deliberately not a literal;
//   • it COLLAPSES to nothing on a host narrower than that, with no media query — the "desktop
//     hierarchy only" scoping of the ruling, enforced by the recipe rather than remembered by callers;
//   • it is invisible to AT and takes no hit target, in every arm.

import { expect, test } from "@playwright/experimental-ct-react";
import { ArtBleedNarrowStory, ArtBleedWideStory } from "./art-bleed.fixtures.tsx";

test("the band starts a reading measure in from the host's inline start — the no-ink-over-art seam", async ({ mount }) => {
  const host = await mount(<ArtBleedWideStory />);
  const band = host.locator('[data-slot="art-bleed"]');
  await expect(band).toBeAttached();

  const geometry = await host.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const bandBox = el.querySelector('[data-slot="art-bleed"]')?.getBoundingClientRect();
    // The measure resolved in the HOST's own font — a `ch` is font-relative, so a literal would lie the
    // moment the font scale moves.
    const probe = el.ownerDocument.createElement("div");
    probe.style.inlineSize = "var(--reading-measure-min)";
    el.append(probe);
    const measure = probe.getBoundingClientRect().width;
    probe.remove();
    return { hostLeft: box.left, hostRight: box.right, bandLeft: bandBox?.left ?? 0, bandRight: bandBox?.right ?? 0, measure };
  });

  // It bleeds to the host's own end edge…
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(geometry.bandRight).toBeCloseTo(geometry.hostRight, 0);
  // …and it begins AT or AFTER the measure — never inside the column a host reserves for prose. The
  // clearance above the measure is the host-padding allowance the recipe documents.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(geometry.bandLeft).toBeGreaterThanOrEqual(geometry.hostLeft + geometry.measure);
  expect(geometry.bandLeft - geometry.hostLeft - geometry.measure).toBeLessThan(geometry.measure);
});

test("a host NARROWER than the measure gets no band at all — 'desktop only' with no media query", async ({ mount }) => {
  const host = await mount(<ArtBleedNarrowStory />);
  await expect.poll(async () => await host.locator('[data-slot="art-bleed"]').evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
});

test("it is decoration: no a11y stop, and it never takes the host's hit target", async ({ mount, page }) => {
  const host = await mount(<ArtBleedWideStory />);
  await expect(host.locator('[data-slot="art-bleed"]')).toHaveAttribute("aria-hidden", "true");
  // Nothing in the mounted tree announces itself…
  await expect(page.locator("[data-testid='host'] [role]")).toHaveCount(0);
  // …and a pointer over the band's own pixels lands on the HOST, not on the decoration.
  await expect
    .poll(
      async () =>
        await host.evaluate((el) => {
          const band = el.querySelector('[data-slot="art-bleed"]')?.getBoundingClientRect();
          const at = el.ownerDocument.elementFromPoint((band?.left ?? 0) + (band?.width ?? 0) / 2, (band?.top ?? 0) + (band?.height ?? 0) / 2);
          return at?.getAttribute("data-testid") ?? at?.getAttribute("data-slot") ?? "none";
        }),
    )
    .toBe("host");
});
