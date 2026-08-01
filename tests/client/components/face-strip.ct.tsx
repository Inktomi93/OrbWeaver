// CT: `<FaceStrip>` — the client-shared strip of clickable faces (list-pane-projection §11.2, D12), which
// the character library's favorites strip and the chats pane's Arm B strip both render.
//
// Pins what a portrait-only shortcut row can silently get wrong:
//   · each face is a REAL button with the full name as its accessible name (the portrait carries no text),
//     and the selected one announces `aria-current` — the ring is reinforcement, never the datum;
//   · the caption TRUNCATES instead of warping the strip's rhythm, and the full name survives in the name;
//   · an empty set renders NOTHING (a shortcut to nowhere is chrome, not an empty state);
//   · the face's own box meets the per-pointer touch floor even though `size="media"` is content-sized.

import { FaceStrip } from "@orb/client/components";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const AZARAEL = { id: "char_azarael", name: "Azarael", avatarHash: null };
const SERA = { id: "char_sera", name: "Sera of the Long Winter Court", avatarHash: null };
const AVATAR_MD_PX = Number.parseFloat(TOKENS["spacing.avatar-md"].value) * 16;
/** WCAG 2.5.5's target floor — the law's coarse-pointer bar (D62 P1 / touch-target-floor.suite.ct.tsx). */
const WCAG_FLOOR = 44;

test("each face is a named button; the selected one announces aria-current", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[AZARAEL, SERA]} label="Recent characters" onSelect={(): void => undefined} selectedId={AZARAEL.id} />);

  const selected = component.getByRole("button", { name: "Open Azarael", exact: true });
  await expect(selected).toHaveAttribute("aria-current", "true");
  // The other face is present and NOT current — state is on exactly one.
  await expect(component.getByRole("button", { name: `Open ${SERA.name}`, exact: true })).not.toHaveAttribute("aria-current", "true");
  // The strip IS the mount root, so assert on it directly (a descendant query would never reach it).
  await expect(component).toHaveAttribute("role", "list");
  await expect(component).toHaveAttribute("aria-label", "Recent characters");
});

test("tapping a face fires onSelect with its id", async ({ mount }) => {
  let picked = "";
  const component = await mount(
    <FaceStrip
      items={[AZARAEL, SERA]}
      label="Recent characters"
      onSelect={(id): void => {
        picked = id;
      }}
      selectedId={null}
      verb="Show chats with"
    />,
  );

  await component.getByRole("button", { name: "Show chats with Azarael", exact: true }).click();
  expect(picked).toBe(AZARAEL.id);
});

test("the caption truncates to the strip's rhythm while the FULL name stays the accessible name", async ({ mount }) => {
  const component = await mount(<FaceStrip caption={true} items={[SERA]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);

  const caption = component.getByText(SERA.name, { exact: true });
  const clipping = await caption.evaluate((el) => {
    const style = getComputedStyle(el);
    return { overflow: style.overflow, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, width: el.getBoundingClientRect().width };
  });
  expect(clipping.overflow).toBe("hidden");
  expect(clipping.textOverflow).toBe("ellipsis");
  expect(clipping.whiteSpace).toBe("nowrap");
  // Nothing is lost: the button still announces the whole name.
  await expect(component.getByRole("button", { name: `Open ${SERA.name}`, exact: true })).toBeVisible();
});

test("no caption by default (the favorites-strip posture: portraits only)", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[SERA]} label="Favorite characters" onSelect={(): void => undefined} selectedId={null} />);
  await expect(component.getByText(SERA.name, { exact: true })).toHaveCount(0);
});

test("an empty set renders NOTHING — never an empty shell", async ({ mount, page }) => {
  await mount(<FaceStrip items={[]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
  await expect(page.getByRole("list")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the face's hit box is the avatar token square — content-sized, not a collapsed control", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[AZARAEL]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
  const button = component.getByRole("button", { name: "Open Azarael", exact: true });
  const box = await button.boundingBox();
  // `size="media"` is content-sized, so the button IS its avatar child — never smaller than it (the F2 defect).
  expect(box?.width).toBeGreaterThanOrEqual(AVATAR_MD_PX);
  expect(box?.height).toBeGreaterThanOrEqual(AVATAR_MD_PX);
  // …and the MIN box is the control token, not the portrait: the face is a control, so it rides the same
  // per-pointer floor as its sibling icon buttons (side-eye P1-3), with the 32px avatar centered inside it.
  const controlMd = await button.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
  expect(box?.width).toBeGreaterThanOrEqual(controlMd);
  expect(box?.height).toBeGreaterThanOrEqual(controlMd);
});

// The floor the law actually governs is the COARSE one (D62 P1): a 32px portrait was a 32px tap target on
// every touch device — under WCAG's 44px and under this app's own 48px coarse control box.
test.describe("coarse pointer — the face meets the touch floor", () => {
  test.use({ hasTouch: true });

  test("a face is at least the 44px WCAG floor, and in practice the 48px coarse control box", async ({ mount, page }) => {
    // ONESHOT-OK: a media-query match on a context flag set BEFORE the page opened — nothing async can
    // change it (the touch-target-floor suite's own R6 probe reads it the same way).
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<FaceStrip items={[AZARAEL]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
    const button = component.getByRole("button", { name: "Open Azarael", exact: true });
    const shortSide = async (): Promise<number> => {
      const box = await button.boundingBox();
      return Math.min(box?.width ?? 0, box?.height ?? 0);
    };
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(WCAG_FLOOR);
    // The box is the resolved TOKEN (48px at coarse), never hand math — and the avatar inside it is untouched.
    const controlMd = await button.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBe(controlMd);
    await expect
      .poll(() => component.locator('[data-slot="avatar-root"]').evaluate((el) => el.getBoundingClientRect().width), { intervals: [20, 50, 100] })
      .toBe(AVATAR_MD_PX);
  });
});
