// CT: `<ListPaneHeader>` — the client-shared LIST chrome-band cluster (list-pane-projection §11.2/D12).
// The three landed band headers (chat · corpus · analytics) and the character screen's two modal modes all
// render through it, so the conformance the private copies each held by hand is pinned ONCE here:
//
//   · the title voice is micro-caps against the GENERATED token map (not a hardcoded px), the count is mono;
//   · the accent half (`CHATS · Azarael`) carries the foreground tone while inheriting the caps transform;
//   · a zero count renders NOTHING (a zero census is noise) while a real count renders;
//   · `back` is a real focusable button carrying its accessible name (the glyph has no text);
//   · exactly ONE action node renders (D66 A2 — one primary per pane per mode).

import { ListPaneHeader } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { EmptyListBandInShell, ListBandInShell } from "./list-pane-header.fixtures.tsx";

const MICRO_PX = `${Number.parseFloat(TOKENS["text.micro"].value) * 16}px`;
const MICRO_TRACKING = TOKENS["tracking.micro"].value;
const MONO_STACK_RE = /mono/iu;

test("the title is the micro-caps section voice, sized off the generated token", async ({ mount }) => {
  const component = await mount(<ListPaneHeader count={12} title="Characters" />);

  const heading = component.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCSS("font-size", MICRO_PX);
  await expect(heading).toHaveCSS("text-transform", "uppercase");
  await expect(heading).toHaveCSS("letter-spacing", `${Number.parseFloat(MICRO_TRACKING) * Number.parseFloat(MICRO_PX)}px`);
});

test("the count is mono and micro; a ZERO count renders nothing at all", async ({ mount, page }) => {
  const component = await mount(<ListPaneHeader count={12} title="Chats" />);
  const count = component.getByText("12", { exact: true });
  await expect(count).toHaveCSS("font-size", MICRO_PX);
  await expect.poll(() => count.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(MONO_STACK_RE);

  await component.update(<ListPaneHeader count={0} title="Chats" />);
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);
});

test("the accent half carries the foreground tone and inherits the caps transform", async ({ mount }) => {
  const component = await mount(<ListPaneHeader accent="Azarael" title="Chats" />);

  // The whole cluster reads as one line: "CHATS · AZARAEL".
  await expect(component.getByRole("heading", { level: 2 })).toContainText("Azarael");
  const accent = component.getByText("Azarael", { exact: true });
  await expect(accent).toHaveCSS("text-transform", "uppercase");
  // The accent stands FORWARD of the muted title — different resolved colors, not a shared muted tone.
  const [accentColor, titleColor] = await Promise.all([
    accent.evaluate((el) => getComputedStyle(el).color),
    component.getByRole("heading", { level: 2 }).evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(accentColor).not.toBe(titleColor);
});

test("back is a real focusable button named by its label; absent when not supplied", async ({ mount, page }) => {
  const component = await mount(<ListPaneHeader accent="Azarael" back={{ label: "Back to all characters", onClick: (): void => undefined }} title="Chats" />);

  const back = component.getByRole("button", { name: "Back to all characters", exact: true });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();

  await component.update(<ListPaneHeader accent="Azarael" title="Chats" />);
  await expect(page.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
});

test("back fires its handler; exactly one action node renders (A2 — one primary per mode)", async ({ mount }) => {
  let backs = 0;
  const component = await mount(
    <ListPaneHeader
      action={<Button intent="primary">New chat</Button>}
      back={{
        label: "Back to all characters",
        onClick: (): void => {
          backs += 1;
        },
      }}
      title="Chats"
    />,
  );

  await expect(component.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
  await component.getByRole("button", { name: "Back to all characters", exact: true }).click();
  expect(backs).toBe(1);
  // Two buttons total: back + the ONE primary. No hidden second create.
  await expect(component.getByRole("button")).toHaveCount(2);
});

// ── THE MOBILE BAND (side-eye 2026-08-06 P2) ─────────────────────────────────────────────────────────
// The ONE-SHELL rule sheds this band's UNSCOPED title on a phone (the topbar already prints the section's
// name ~50px above). What it used to leave behind was a 48px bordered chrome row containing an empty flex
// cluster — an empty strip on config/corpus/refinery — and, where a count was set, an orphan number with no
// noun. `:empty` cannot see the strip: the identity `Row` is still in the DOM, 0×0. Driven at 320px through
// the real shell selector chain, because the whole decision lives in that chain.

const PHONE = { width: 320, height: 800 };

test("MOBILE: a band with nothing left to paint is GONE, not an empty 48px strip", async ({ mount, page }) => {
  await page.setViewportSize(PHONE);
  await mount(<ListBandInShell />);
  await expect(page.locator(".shell-panel-header")).toHaveCSS("display", "none");
});

test("MOBILE: the count travels with the title — no orphan number on a nameless band", async ({ mount, page }) => {
  await page.setViewportSize(PHONE);
  await mount(<ListBandInShell count={8} />);
  // The whole band goes, so the census cannot survive its noun.
  await expect(page.locator(".shell-panel-header")).toHaveCSS("display", "none");
  await expect(page.getByText("8", { exact: true })).toBeHidden();
});

test("MOBILE: a band that still has something to say KEEPS its row (a scoped title, or the pane's action)", async ({ mount, page }) => {
  await page.setViewportSize(PHONE);
  const scoped = await mount(<ListBandInShell accent="Sera" count={8} />);
  await expect(page.locator(".shell-panel-header")).not.toHaveCSS("display", "none");
  // A SCOPED band names a swapped pane — a different fact from the topbar's — so title AND count stay.
  await expect(scoped.getByText("Sera", { exact: true })).toBeVisible();
  await expect(scoped.getByText("8", { exact: true })).toBeVisible();

  await scoped.update(<ListBandInShell withAction={true} />);
  await expect(page.locator(".shell-panel-header")).not.toHaveCSS("display", "none");
  await expect(page.getByRole("button", { name: "New tag" })).toBeVisible();
});

test("DESKTOP: the band is untouched — title, count and action all paint", async ({ mount, page }) => {
  const band = await mount(<ListBandInShell count={8} withAction={true} />);
  await expect(page.locator(".shell-panel-header")).not.toHaveCSS("display", "none");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Configuration");
  await expect(band.getByText("8", { exact: true })).toBeVisible();
});

// THE CHILDLESS BAND (side-eye re-verify 2026-08-06). Refinery declares no `listHeader` at all, so its band
// has zero children — the `:has()` chain that sheds a band whose cluster stopped painting has nothing to
// anchor on, and 48px of bordered nothing survived on the one section with the least to say. This is the
// CONTEXT side's own `:empty` collapse, finally spelled for the LIST band.
test("MOBILE: a band with NO header content at all collapses out", async ({ mount, page }) => {
  await page.setViewportSize(PHONE);
  await mount(<EmptyListBandInShell />);
  await expect(page.locator(".shell-panel-header")).toHaveCSS("display", "none");
});

test("DESKTOP: the same childless band KEEPS its row — the D66 A1 baseline horizon is a desktop rule", async ({ mount, page }) => {
  await mount(<EmptyListBandInShell />);
  await expect(page.locator(".shell-panel-header")).not.toHaveCSS("display", "none");
});
