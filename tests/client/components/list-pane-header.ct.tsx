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
import { resolveSpacingPxIn } from "../../support/browser/touch-floor.ts";
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
  // where this datum LANDS is the band's own arithmetic, pinned by the #1154 case at the end of this file
  // (the 47px content box that decided it is gone — the band's separator is an inset shadow now).
  await expect(count).toHaveCSS("font-size", LABEL_PX);
  await expect.poll(() => count.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(MONO_STACK_RE);

  await component.update(<ListPaneHeader count={0} title="Chats" />);
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);

  // `count` is `number | string`, and a caller that formats its own datum hands over the SAME fact as a
  // string — which a numeric-only suppression rendered as a lone "0" beside the name. A composed census
  // still paints: `"0 of 896"` is a sentence about a filter, not the empty datum this arm hides.
  await component.update(<ListPaneHeader count="0" title="Chats" />);
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);
  await component.update(<ListPaneHeader count="0 of 896" title="Chats" />);
  await expect(page.getByText("0 of 896", { exact: true })).toBeVisible();
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
  // Resolved through a PROBE in the heading's own inherited scope: `--spacing-field/row` are rebound per
  // density tier, and since #1640 the custom property's computed value is the belted `round(up, …, 1px)`
  // token stream, which `parseFloat` reads as NaN.
  const fieldStep = await resolveSpacingPxIn(heading, "--spacing-field");
  const rowStep = await resolveSpacingPxIn(heading, "--spacing-row");
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

// ── #2463: THE ACTION IS THE BOX SHELL.CSS COUNTERS, AND THIS IS THE COUPLING ────────────────────────
// `shell.css`'s fourth alignment class selects `[data-slot="list-pane-action"]` to cancel the LIST pane's
// own width reflow on a context toggle (measured 304 → 269 in one frame before it). The geometry is pinned
// in `app-shell.ct.tsx`'s door census, but that story hand-authors its band — so without THIS assertion
// the shell's rule could keep passing there while every real section's action had stopped wearing the
// marker. Two tiers, one fact: the composite emits it, the shell counters it.
//
// AND THE WRAPPER IS CONDITIONAL, which is the half that keeps `shell.css`'s mobile band-shed test honest:
// that rule detects "the band has a child that is not the identity cluster", so an unconditional wrapper
// would make a browse-shaped pane (corpus · analytics · config — no create verb) look like it had an
// action and stop shedding an otherwise-empty 48px chrome row.
test("#2463 the primary action is wrapped in the marker shell.css counters — and only when there IS one", async ({ mount }) => {
  const component = await mount(<ListPaneHeader action={<Button intent="primary">New chat</Button>} count={12} title="Chats" />);

  const marked = component.locator('[data-slot="list-pane-action"]');
  await expect(marked).toHaveCount(1);
  await expect(marked.getByRole("button", { name: "New chat", exact: true })).toBeVisible();

  await component.update(<ListPaneHeader count={12} title="Chats" />);
  await expect(component.locator('[data-slot="list-pane-action"]'), "no action ⇒ no marker, or the band never sheds on a phone").toHaveCount(0);
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

// ── #1154 · THE BAND'S OWN ARITHMETIC: EVERY OCCUPANT LANDS ON A DEVICE PIXEL ──────────────────────
// side-eye Characters F8 addendum. `.shell-panel-header` was `height: 3rem` PLUS a `border-block-end`, i.e.
// a 48px border box with a 47px CONTENT box, and `align-items: center` halves the odd remainder: the
// display-voice heading landed at top 8.5, the label-voice count at 15.5, a 32px control at 7.5. The pane
// was ALSO a `backdrop-filter` layer, so those halves were rasterized once rather than re-snapped every
// paint (docs/law/integer-line-boxes.md Law 3/4) — which is what made them visible.
//
// IT IS NOT RE-VOICEABLE, which is why the box moved and not the type: every leading token at or above
// 21px is EVEN (display 30 · headline 26 · title 22), so a display-voice band title (#1136) and an integer
// landing were mutually exclusive while the content box was odd. The separator is an inset shadow now,
// which paints the same hairline without consuming box height.
//
// The assertion is the LANDING, not three magic numbers — the numbers are annotated so a token move reads
// in the report, but what REDs is a fractional device-pixel offset, normalized exactly as the runtime
// oracle normalizes it (`tooling/src/ui-audit/ops/walker/census-grid.ts` `gridDeviceFrac`).
test("#1154 the band is an EVEN content box and every occupant lands on the device-pixel grid", async ({ mount, page }) => {
  await mount(<ListBandInShell count={8} withAction={true} />);
  const header = page.locator(".shell-panel-header");
  await expect(header).toBeVisible();

  const landing = await header.evaluate((el) => {
    const dpr = window.devicePixelRatio;
    const bandTop = el.getBoundingClientRect().top;
    // `clientHeight` is the CONTENT box: it excludes the border the old separator spent, which IS the
    // defect. An odd content box cannot centre an even child on a whole pixel.
    const contentHeight = el.clientHeight;
    const deviceFraction = (value: number): number => value * dpr - Math.round(value * dpr);
    const occupants = [...el.querySelectorAll("h2, span, button")].map((node) => ({
      name: `${node.tagName.toLowerCase()}:${(node.textContent ?? "").slice(0, 10)}`,
      top: Number((node.getBoundingClientRect().top - bandTop).toFixed(3)),
      height: Number(node.getBoundingClientRect().height.toFixed(3)),
      topFraction: Number(deviceFraction(node.getBoundingClientRect().top).toFixed(4)),
    }));
    return { contentHeight, dpr, occupants };
  });

  test.info().annotations.push({
    description: `content box ${String(landing.contentHeight)}px at DPR ${String(landing.dpr)} · ${landing.occupants.map((o) => `${o.name} top ${String(o.top)} h ${String(o.height)}`).join(" · ")}`,
    type: "band-arithmetic",
  });

  expect(landing.occupants.length, "the band must actually have occupants, or this pin measures nothing").toBeGreaterThan(2);
  expect(landing.contentHeight % 2, `the band's CONTENT box is ${String(landing.contentHeight)}px — an odd box half-pixels every centred child`).toBe(0);
  for (const occupant of landing.occupants) {
    expect(occupant.topFraction, `${occupant.name} lands ${String(occupant.topFraction)} device px off the grid (top ${String(occupant.top)})`).toBe(0);
  }
});
