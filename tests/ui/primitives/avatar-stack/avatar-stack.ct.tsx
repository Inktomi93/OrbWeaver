// CT: the avatar-stack seal — N overlapping Avatars + a "+N" overflow chip
// (ui-primitive-carve-out-work-order item 9). Group aria-label carries the full count; each
// avatar keeps its own name as its accessible name.
import { AvatarStack } from "@orb/ui/avatar-stack";
import { SNAPPED_LENGTH_BASE_PX } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const MEMBERS = [{ name: "Nate Ward" }, { name: "Robin Song" }, { name: "Ash Vale" }, { name: "Quinn Rye" }, { name: "Devon Lark" }, { name: "Sam Post" }];

/** A 1x1 transparent GIF — a seat WITH an image, so the `<img>` half of the a11y tree actually renders
 *  (Base UI's Avatar mounts the image only when `src` is set, and swaps to the fallback on load error). */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

test("under max renders every avatar and no overflow chip", async ({ mount }) => {
  const component = await mount(<AvatarStack items={MEMBERS.slice(0, 3)} max={5} />);
  await expect(component.locator('[data-slot="avatar-stack-item"]')).toHaveCount(3);
  await expect(component.locator('[data-slot="avatar-stack-overflow"]')).toHaveCount(0);
});

test("over max collapses the rest into a +N overflow chip", async ({ mount }) => {
  const component = await mount(<AvatarStack items={MEMBERS} max={4} />);
  // max=4 → 3 real avatars + 1 overflow chip (never max+1 visible circles).
  await expect(component.locator('[data-slot="avatar-stack-item"]')).toHaveCount(3);
  const overflow = component.locator('[data-slot="avatar-stack-overflow"]');
  await expect(overflow).toHaveText("+3");
  await expect(overflow).toHaveAccessibleName("3 more");
});

test("the group carries an aria-label with the full member count", async ({ mount, page }) => {
  await mount(<AvatarStack items={MEMBERS} max={4} />);
  // The group role lives on the mount root itself — component.locator only searches its
  // DESCENDANTS (the avatar.ct.tsx `page.locator` precedent for the mount root).
  const group = page.getByRole("group");
  await expect(group).toHaveAttribute("aria-label", "6 people");
});

test("a single member renders singular group wording", async ({ mount, page }) => {
  await mount(<AvatarStack items={MEMBERS.slice(0, 1)} />);
  await expect(page.getByRole("group")).toHaveAttribute("aria-label", "1 person");
});

test("each avatar keeps its own name as its accessible name", async ({ mount }) => {
  const component = await mount(<AvatarStack items={MEMBERS.slice(0, 2)} />);
  const items = component.locator('[data-slot="avatar-stack-item"]');
  await expect(items.nth(0)).toHaveAccessibleName("Nate Ward");
  await expect(items.nth(1)).toHaveAccessibleName("Robin Song");
});

test("falls back to initials when no image src is given", async ({ mount }) => {
  const component = await mount(<AvatarStack items={[{ name: "Nate Ward" }]} />);
  await expect(component.locator('[data-slot="avatar-stack-item"]')).toHaveText("NW");
});

// ── RED-FIRST (#102 review F5): a seat is named ONCE ────────────────────────────────────────────────
// The seat carried its name on the Avatar ROOT (`role="img"` + `aria-label`) AND on the <img> inside it,
// so a three-seat stack inside a named button announced the same person at four nesting levels — measured
// on home's hero, where the room name read out five times.
test("a seat's IMAGE is decorative — the name lives on the seat root, exactly once", async ({ mount }) => {
  const component = await mount(<AvatarStack items={[{ name: "Nate Ward", src: PIXEL }]} />);
  const seat = component.locator('[data-slot="avatar-stack-item"]');

  await expect(seat).toHaveAccessibleName("Nate Ward");
  // The inner image contributes NOTHING to the tree: empty alt, and therefore no nested img role.
  await expect(seat.locator("img")).toHaveAttribute("alt", "");
  await expect(seat.getByRole("img")).toHaveCount(0);
});

test("emptying the image alt does NOT collapse the fallback hue — the seed is the name", async ({ mount }) => {
  // `Avatar` defaults `hueSeed` to `alt`, so the F5 fix would have painted every portrait-less seat the
  // same colour if the stack had not passed the name explicitly.
  const component = await mount(<AvatarStack items={[{ name: "Nate Ward" }, { name: "Robin Song" }]} />);
  const hues = await component.locator('[data-slot="avatar-fallback"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-hue")));

  expect(hues).toHaveLength(2);
  expect(hues[0]).not.toBe(hues[1]);
});

test("shape passes through — the RULED portrait arm, against the circular default", async ({ mount }) => {
  // Circles are roster vocabulary and stay the default; `rounded` is the opt-in for a stack that is ART
  // (home's hearth hero, ruled 2026-08-16 on the #102 review). ONE mount holds both arms — playwright-ct
  // allows a single React root per test, so an A/B is two stacks in one tree, never two `mount` calls.
  const both = await mount(
    <div>
      <div data-testid="round">
        <AvatarStack items={MEMBERS.slice(0, 1)} />
      </div>
      <div data-testid="portrait">
        <AvatarStack items={MEMBERS.slice(0, 1)} shape="rounded" />
      </div>
    </div>,
  );
  const roundRadius = await both
    .getByTestId("round")
    .locator('[data-slot="avatar-stack-item"]')
    .evaluate((el) => globalThis.getComputedStyle(el).borderTopLeftRadius);

  const item = both.getByTestId("portrait").locator('[data-slot="avatar-stack-item"]');
  const shape = await item.evaluate((el) => {
    const probe = el.ownerDocument.createElement("span");
    probe.style.borderRadius = "var(--radius-base)";
    el.ownerDocument.body.append(probe);
    const portraitStep = globalThis.getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    const own = globalThis.getComputedStyle(el);
    return { own: own.borderTopLeftRadius, portraitStep, width: own.width };
  });

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(shape.own).toBe(shape.portraitStep);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(shape.own).not.toBe(roundRadius);
  // …and it is a real rounded RECT, not a capsule wearing a token name.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(shape.own)).toBeLessThan(Number.parseFloat(shape.width) / 2);
});

test("size passes through to every avatar, matching avatar's own size scale", async ({ mount }) => {
  const component = await mount(<AvatarStack items={MEMBERS.slice(0, 2)} size="lg" />);
  const item = component.locator('[data-slot="avatar-stack-item"]').first();
  // lg = --spacing-avatar-lg (2.5rem = 40px), the same DISPLAY-avatar token avatar's own size="lg"
  // resolves to (D62: avatar sizes decoupled from the control-height scale).
  const avatarLgPx = `${SNAPPED_LENGTH_BASE_PX["spacing.avatar-lg"]}px`;
  await expect(item).toHaveCSS("width", avatarLgPx);
});
