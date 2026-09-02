// CT: `<ListPaneHeader>` — the client-shared LIST chrome-band cluster (list-pane-projection §11.2/D12).
// The three landed band headers (chat · corpus · analytics) and the character screen's two modal modes all
// render through it, so the conformance the private copies each held by hand is pinned ONCE here:
//
//   · the title is the DISPLAY step against the GENERATED token map (not a hardcoded px), the count is mono;
//   · the accent half (`Chats · Azarael`) recedes to the muted tone behind the name it qualifies;
//   · a zero count renders NOTHING (a zero census is noise) while a real count renders;
//   · `back` is a real focusable button carrying its accessible name (the glyph has no text);
//   · exactly ONE action node renders (D66 A2 — one primary per pane per mode).

import { ListPaneHeader } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { ListBandInShell } from "./list-pane-header.fixtures.tsx";

const MICRO_PX = Number.parseFloat(TOKENS["text.micro"].value) * 16;
const LABEL_PX = `${Number.parseFloat(TOKENS["text.label"].value) * 16}px`;
const DISPLAY_PX = `${Number.parseFloat(TOKENS["text.display"].value) * 16}px`;
const MONO_STACK_RE = /mono/iu;

/** `flat-type-hierarchy`'s own floor (tooling/src/ui-audit/lib/checks-font-census.ts
 *  FLAT_HIERARCHY_MIN_RATIO): a page whose largest step is under 2.0× its smallest reads as one voice. The
 *  smallest step on every rail surface is the 10.5px kicker, so this band's name is what has to clear it. */
const FLAT_HIERARCHY_MIN_RATIO = 2;

// #1136 (side-eye 2026-09-02 F9 · the Config drive's F24 — one file, two surfaces). The band's `<h2>` was
// the 10.5px caps KICKER, i.e. the pane's own heading was smaller than the body text under it and the
// largest type on a rail surface was 16px. This pins the STEP and the RATIO, not a look: 24px is not a
// taste choice here, it is the only ramp step that clears the ratio the rule fails the page on.
test("#1136 the title is the DISPLAY step and clears the flat-hierarchy ratio against the micro kicker", async ({ mount }) => {
  const component = await mount(<ListPaneHeader count={12} title="Characters" />);

  const heading = component.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCSS("font-size", DISPLAY_PX);
  await expect(heading, "a pane's own name is not a kicker — the caps micro voice names the groups INSIDE it").toHaveCSS("text-transform", "none");
  expect(MICRO_PX, "the token probe itself must resolve, or the ratio below is vacuous").toBeGreaterThan(0);
  expect(Number.parseFloat(DISPLAY_PX) / MICRO_PX, "under 2.0 and design-audit calls the whole page one voice").toBeGreaterThanOrEqual(
    FLAT_HIERARCHY_MIN_RATIO,
  );
});

test("the count is mono at the LABEL step; a ZERO count renders nothing at all", async ({ mount, page }) => {
  const component = await mount(<ListPaneHeader count={12} title="Chats" />);
  const count = component.getByText("12", { exact: true });
  // #1136 — micro beside a 24px name is not quiet, it is unreadable. A legibility step, not a grid one:
  // the band's own 47px content box decides this datum's half-pixel landing either way (see the source).
  await expect(count).toHaveCSS("font-size", LABEL_PX);
  await expect.poll(() => count.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(MONO_STACK_RE);

  await component.update(<ListPaneHeader count={0} title="Chats" />);
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);
});

// #525 (side-eye 2026-08-22 rail-chats). A FILTERED census is a phrase, not a number — and it inherited the
// heading's caps, so `CHATS 129 of 896` painted as `CHATS 129 OF 896`: one uninterrupted run of caps at 6px
// of separation, which is why the band read as a single token instead of name-then-number. #1136 retired
// the heading's caps outright, so the INHERITANCE this was minted against can no longer exist — the pin
// stays as the fence that says so (no caps anywhere in the cluster), plus the step of air it also bought.
test("#525 the census reads as a datum beside the name: no caps anywhere in the cluster, and a step of air", async ({ mount }) => {
  const component = await mount(<ListPaneHeader count="129 of 896" title="Chats" />);

  const heading = component.getByRole("heading", { level: 2 });
  const count = component.getByText("129 of 896", { exact: true });
  await expect(heading, "#1136 — the pane's own name is not a kicker").toHaveCSS("text-transform", "none");
  await expect(count, "a census is a datum — caps would shout the joining word at the title's weight").toHaveCSS("text-transform", "none");

  let gap = await heading.evaluate((el) => Number.parseFloat(getComputedStyle(el).columnGap));
  const [fieldStep, rowStep] = await heading.evaluate((el) => {
    const styles = getComputedStyle(el);
    return [styles.getPropertyValue("--spacing-field"), styles.getPropertyValue("--spacing-row")].map((value) => Number.parseFloat(value) * 16);
  });
  expect(fieldStep, "the token probe itself must resolve, or the comparison below is vacuous").toBeGreaterThan(0);
  expect(gap, "the datum sits one spacing step further out than a within-field gap").toBeCloseTo(rowStep ?? 0, 1);
  await expect
    .poll(async () => {
      gap = await heading.evaluate((el) => Number.parseFloat(getComputedStyle(el).columnGap));
      return gap;
    })
    .toBeGreaterThan(fieldStep ?? 0);
});

test("the accent half rides the title's step and recedes behind it in tone", async ({ mount }) => {
  const component = await mount(<ListPaneHeader accent="Azarael" title="Chats" />);

  // The whole cluster reads as one line: "Chats · Azarael".
  await expect(component.getByRole("heading", { level: 2 })).toContainText("Azarael");
  const accent = component.getByText("Azarael", { exact: true });
  await expect(accent, "#1136 — the entity half is the same step as the name it qualifies").toHaveCSS("font-size", DISPLAY_PX);
  // The accent RECEDES behind the foreground title (#1136 flipped which half is muted) — the pin is that
  // they are two resolved colors, so the pane still reads as "Chats, scoped to HER" and not two equal nouns.
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

// NO CHILDLESS-BAND CTs (side-eye 2026-08-08, RULED). Two tests here used to drive an `EmptyListBandInShell`
// fixture against a `:empty` rule aimed at the then-planned refinery — a DOM the shell cannot produce: a
// childless LIST band only exists for a section with no `listHeader`, and the one such section (home — its
// list is `unavailable`) can never reach `data-list-mode="docked"` at ≤48rem. (Refinery graduated in R3 with
// a `listHeader` + `selection` pair, which only strengthens the ruling.) The rule and its fixture went with
// them; see the ruling comment in shell.css.
