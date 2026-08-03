// Rail CT — the persistent nav column in isolation: every section + footer action renders as a real
// <button> with an accessible name (a11y baseline, §4a), the active section carries aria-current, and
// the buttons are keyboard-focusable in order.

import { expect, test } from "@playwright/experimental-ct-react";
import { RailBrandActiveStory, RailBrandNavStory, RailStory } from "../_ct-stories.tsx";

test("renders every section + footer action as a named button; active = aria-current", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  await Promise.all(["Chats", "Characters", "Corpus", "Refinery", "Analytics"].map((name) => expect(rail.getByRole("button", { name })).toBeVisible()));
  await expect(rail.getByRole("button", { name: "Switch theme" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Account" })).toBeVisible();

  // Active section (chats) is marked current; a sibling is not.
  await expect(rail.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Corpus" })).not.toHaveAttribute("aria-current");
});

// ── The BRAND cell as home's affordance (home-section-spec §4.1) ───────────────────────────────────
// The glyph used to be a decorative `aria-hidden` div. It is now a REAL named button, derived from the
// `rail.brand` chrome entry the HOME section declares — app-shell still never spells a section id.

test("the brand glyph is a real named affordance, not a decorative aria-hidden div", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  const brand = rail.getByRole("button", { name: "Home" });
  await expect(brand).toBeVisible();
  await expect(rail.locator(".shell-rail-brand[aria-hidden]")).toHaveCount(0);
  // Home's affordance is the BRAND cell, so it gets NO second nav button (one affordance per section).
  await expect(rail.locator(".shell-rail-sections").getByRole("button", { name: "Home" })).toHaveCount(0);
});

test("the brand carries aria-current when home is the active section", async ({ mount }) => {
  const rail = await mount(<RailBrandActiveStory />);

  await expect(rail.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Chats" })).not.toHaveAttribute("aria-current");
});

test("the ACTIVE brand paints — the ember tint and accent bar resolve, not just the data attr", async ({ mount }) => {
  const rail = await mount(<RailBrandActiveStory />);

  const brand = rail.getByRole("button", { name: "Home" });
  const [background, accentWidth, glyphBox] = await brand.evaluate((el) => [
    globalThis.getComputedStyle(el).backgroundColor,
    globalThis.getComputedStyle(el, "::before").width,
    el.querySelector("svg")?.getBoundingClientRect().width ?? 0,
  ]);
  // A transparent background would mean the active skin never landed (the tint is a color-mix over primary).
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(accentWidth)).toBeGreaterThan(0);
  // The glyph must not collapse inside the button's flex box.
  expect(glyphBox).toBeGreaterThan(0);
});

test("the brand's icon COLOUR carries the state, like every nav sibling — no always-ember glyph", async ({ mount }) => {
  // side-eye F5: the glyph painted `--color-primary` unconditionally, so it advertised "you are home"
  // from every other section and the active state had no delta at all. It now takes the nav zone's
  // grammar: muted at rest, ember when active.
  const readGlyphColor = (el: SVGElement | HTMLElement): string => globalThis.getComputedStyle(el).color;

  // RailStory's active section is chats: the brand rests, a nav sibling is active.
  const resting = await mount(<RailStory />);
  const restColor = await resting.getByRole("button", { name: "Home" }).evaluate(readGlyphColor);
  const navActiveColor = await resting.getByRole("button", { name: "Chats" }).evaluate(readGlyphColor);
  await resting.unmount();

  const active = await mount(<RailBrandActiveStory />);
  const activeColor = await active.getByRole("button", { name: "Home" }).evaluate(readGlyphColor);

  expect(restColor).not.toBe(activeColor);
  // PARITY: the active brand resolves to the same ember the active nav buttons use — one state grammar.
  expect(activeColor).toBe(navActiveColor);
});

test("clicking the glyph fires setActiveSection('home') — assert the STORE, not a rendered echo", async ({ mount }) => {
  const rail = await mount(<RailBrandNavStory />);
  const probe = rail.locator("output");
  await expect(probe).not.toHaveText("section=home");

  await rail.getByRole("button", { name: "Home" }).click();
  await expect(probe).toHaveText("section=home");
});

test("rail buttons are keyboard-focusable", async ({ mount }) => {
  const rail = await mount(<RailStory />);
  const chats = rail.getByRole("button", { name: "Chats" });
  await chats.focus();
  await expect(chats).toBeFocused();
});
