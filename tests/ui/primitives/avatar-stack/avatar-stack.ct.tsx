// CT: the avatar-stack seal — N overlapping Avatars + a "+N" overflow chip
// (ui-primitive-carve-out-work-order item 9). Group aria-label carries the full count; each
// avatar keeps its own name as its accessible name.
import { AvatarStack } from "@orb/ui/avatar-stack";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// avatar tokens are authored in rem; the rendered box resolves to px (root = 16px).
const ROOT_PX = 16;

const MEMBERS = [
  { name: "Nate Ward" },
  { name: "Robin Song" },
  { name: "Ash Vale" },
  { name: "Quinn Rye" },
  { name: "Devon Lark" },
  { name: "Sam Post" },
];

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

test("size passes through to every avatar, matching avatar's own size scale", async ({ mount }) => {
  const component = await mount(<AvatarStack items={MEMBERS.slice(0, 2)} size="lg" />);
  const item = component.locator('[data-slot="avatar-stack-item"]').first();
  // lg = --spacing-avatar-lg (2.125rem = 34px), the same DISPLAY-avatar token avatar's own size="lg"
  // resolves to (D62: avatar sizes decoupled from the control-height scale).
  const avatarLgPx = `${Number.parseFloat(TOKENS["spacing.avatar-lg"].value) * ROOT_PX}px`;
  await expect(item).toHaveCSS("width", avatarLgPx);
});
