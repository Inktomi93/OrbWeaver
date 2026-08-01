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
  const box = await component.getByRole("button", { name: "Open Azarael", exact: true }).boundingBox();
  // `size="media"` is content-sized, so the button IS its avatar child — never smaller than it (the F2 defect).
  expect(box?.width).toBeGreaterThanOrEqual(AVATAR_MD_PX);
  expect(box?.height).toBeGreaterThanOrEqual(AVATAR_MD_PX);
});
