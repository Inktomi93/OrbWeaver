// CT: the list-row seal — the slot-based entity row (leading/title/subtitle/actions). The
// load-bearing assertion is the a11y contract: a clickable row is ONE role="button" element and
// its trailing actions are SEPARATE tab stops OUTSIDE that element, never nested inside it.

import { Button } from "@orb/ui/button";
import { ListRow } from "@orb/ui/list-row";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("clickable body is a NATIVE <button> element (side-eye item 13), not a role='button' div", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} title="Elara" />);
  const body = page.locator('[data-slot="list-row-body"]');
  await expect(body).toHaveJSProperty("tagName", "BUTTON");
  // A native button needs `type="button"` so it never submits an enclosing form.
  await expect(body).toHaveAttribute("type", "button");
});

test("clickable row exposes button role and activates via Enter/Space", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "0");
  await row.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length, { intervals: [20, 50, 100] }).toBe(2);
});

test("non-clickable row is a static <div> body with no button role", async ({ mount, page }) => {
  await mount(<ListRow title="Elara" />);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator('[data-slot="list-row-body"]')).toHaveJSProperty("tagName", "DIV");
});

test("trailing action is a separate tab stop, not nested in the row's accessible name", async ({ mount, page }) => {
  const rowClicks: string[] = [];
  const actionClicks: string[] = [];
  await mount(
    <ListRow
      actions={
        <button
          onClick={(): void => {
            actionClicks.push("hit");
          }}
          type="button"
        >
          Edit
        </button>
      }
      clickable={true}
      onClick={(): void => {
        rowClicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  const action = page.getByRole("button", { name: "Edit" });

  // The row's accessible name excludes the action (proves the action is not nested inside it).
  await expect(row).toHaveAccessibleName("Elara");

  // Tab order proves the action is a SIBLING tab stop, not content inside the row button.
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();

  // Clicking the action does not also fire the row's onClick (they're disjoint elements).
  await action.click();
  expect(actionClicks.length).toBe(1);
  expect(rowClicks.length).toBe(0);
});

// Finding #1 (2026-07-25 a11y sweep): the clickable row's accessible NAME is the TITLE ALONE — the
// subtitle no longer runs into the name ("Mara mara-soul-check" → "Mara"). The subtitle stays reachable
// for SR users via aria-describedby, so it's a description, not name pollution. Name-from-content used to
// concatenate every descendant span; aria-label + an aria-hidden title span makes the name authoritative.
test("clickable row's accessible name is the TITLE ALONE — subtitle rides aria-describedby, not the name", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="mara-soul-check" title="Mara" />);
  const row = page.getByRole("button");
  // The name is the title with the subtitle NOWHERE in it.
  await expect(row).toHaveAccessibleName("Mara");
  // The subtitle survives as the row's DESCRIPTION (SR announces it after the name).
  await expect(row).toHaveAccessibleDescription("mara-soul-check");
  // The visible subtitle text is still on screen.
  await expect(page.getByText("mara-soul-check")).toBeVisible();
});

// The OTHER half of finding #1 (side-eye 2026-08-06, config sweep): the title span was `aria-hidden`
// UNCONDITIONALLY, which is only correct when the body is a `<button>` carrying the same string as its
// `aria-label`. A NON-clickable row has no label and no role, so hiding its title deleted the row's whole
// accessible name — live receipt: five chat-rack rows announced their size and never their document name.
test("NON-clickable row's title is IN the a11y tree — it is the row's only possible name", async ({ mount, page }) => {
  await mount(<ListRow subtitle="Wiki · 91.7 KB" title="Duskwater Barony" />);
  const snapshot = await page.locator('[data-slot="list-row-body"]').ariaSnapshot();
  // `ariaSnapshot` walks the ACCESSIBILITY tree, so an aria-hidden span is simply absent from it.
  expect(snapshot).toContain("Duskwater Barony");
  expect(snapshot).toContain("Wiki · 91.7 KB");
});

// …and the clickable arm is unchanged: the title stays hidden there, so the button's `aria-label` is the
// name ONCE rather than "Elara Elara" (name + name-from-content).
test("clickable row's title stays out of the a11y tree — the name is not doubled", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} title="Elara" />);
  const row = page.getByRole("button");
  await expect(row).toHaveAccessibleName("Elara");
  const snapshot = await row.ariaSnapshot();
  // One occurrence: the button's own name. A visible title span would add a second text node.
  expect(snapshot.match(/Elara/g)?.length).toBe(1);
});

// The relative-time meta now rides the `meta` slot INSIDE the row's accessible content (part of the
// description), not stranded in the `actions` sibling outside the accessible name (the old chats-row bug
// where "18m ago" was invisible to a SR walking the row button).
test("meta (timestamp) is inside the accessible content — part of the description, kept for SR users", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} meta="18m ago" subtitle="You, Mara, Niko" title="Group UX review" />);
  const row = page.getByRole("button");
  await expect(row).toHaveAccessibleName("Group UX review");
  // Both the subtitle and the meta land in the description (space-joined via aria-describedby).
  await expect(row).toHaveAccessibleDescription("You, Mara, Niko 18m ago");
  // The meta renders inside the row body, not as an actions sibling.
  await expect(page.locator('[data-slot="list-row-body"] [data-slot="list-row-meta"]')).toHaveText("18m ago");
});

// The `markers` slot: rest-visible STATE on the title line (the ⚔/★/Archived cluster a chats row shows),
// so a row whose controls are all hover-revealed can float its whole `actions` cluster. Same a11y contract
// as `meta` — the marker labels are a DESCRIPTION, never part of the row's name.
test("markers ride the title line and join the description — never the accessible name", async ({ mount, page }) => {
  await mount(
    <ListRow
      clickable={true}
      markers={
        <span aria-label="Starred" role="img">
          ★
        </span>
      }
      meta="18m ago"
      subtitle="You, Mara"
      title="Group UX review"
    />,
  );
  const row = page.getByRole("button");
  await expect(row).toHaveAccessibleName("Group UX review");
  await expect(row).toHaveAccessibleDescription("You, Mara 18m ago Starred");
  // In the TITLE ROW (the text column), not a trailing `actions` sibling — that placement is the whole
  // point: markers spend width where the text already is, leaving the cluster free to float.
  await expect(page.locator('[data-slot="list-row-title-row"] [data-slot="list-row-markers"]')).toHaveCount(1);
});

// The `subtitleLead` slot: a status chip on the SUBTITLE line instead of the title line, for a mark that
// belongs to the row's scent (databank's ingest phase). It sits INSIDE the subtitle's own span, which is
// what makes its text ride the same `aria-describedby` entry — no second id, no silent chip.
test("subtitleLead sits inside the SUBTITLE span and joins that same description entry", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="Wiki · 91.7 KB · 39 chunks" subtitleLead={<span>Indexing</span>} title="Duskwater Barony" />);
  const row = page.getByRole("button");
  await expect(row).toHaveAccessibleName("Duskwater Barony");
  await expect(row).toHaveAccessibleDescription("Indexing Wiki · 91.7 KB · 39 chunks");
  // Inside the subtitle, NOT the title row: on the title line a variable-width chip steals the name's width
  // on exactly the rows that carry one (measured at a 320px pane: "Duskwater B…").
  await expect(page.locator('[data-slot="list-row-title-row"] [data-slot="list-row-subtitle"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="list-row-subtitle"]')).toContainText("Indexing");
});

test("no markers ⇒ no marker slot at all (a data-driven zone, never a reserved empty box)", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} meta="18m ago" title="Group UX review" />);
  await expect(page.locator('[data-slot="list-row-markers"]')).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveAccessibleDescription("18m ago");
});

test("selected reads via a 2px left ember bar (rides --color-primary) + aria-current", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} selected={true} title="Elara" />);
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("aria-current", "true");
  // north-star §4 N2: the flat --color-accent fill is replaced by a 2px left bar + 10% primary tint,
  // both riding --color-primary so a custom theme retints selection.
  await expect(row).toHaveCSS("border-left-width", "2px");
  await expect(row).toHaveCSS("border-left-color", TOKENS["color.primary"].value);
});

// `expanded` is the DISCLOSURE arm — a parent row that owns child rows. It never implies aria-current: the
// "you are here" marker belongs to the leaf, and a parent+child both carrying it announces two current
// items for one location (the settings-nav defect, side-eye 2026-08-01).
test("expanded exposes aria-expanded and never aria-current", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} expanded={true} title="Appearance" />);
  const row = page.getByRole("button", { name: "Appearance" });
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(row).not.toHaveAttribute("aria-current", "true");
});

// `fullTitle` is the ABBREVIATION arm: the row reads short (a nav column too narrow for the real name) but
// hovering recovers the full string. It moves the native tooltip ONLY — the accessible name stays the
// VISIBLE title, or voice control would fail on the words the user can actually read (WCAG 2.5.3).
test("fullTitle sets the native tooltip while the accessible name stays the visible title", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} fullTitle="Message details & actions" title="Message details" />);
  await expect(page.getByRole("button", { name: "Message details", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="list-row-title"]')).toHaveAttribute("title", "Message details & actions");
});

test("without fullTitle the tooltip is the title itself", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} title="Elara" />);
  await expect(page.locator('[data-slot="list-row-title"]')).toHaveAttribute("title", "Elara");
});

test("disabled removes the row from tab order and marks aria-disabled", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      disabled={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "-1");
  await expect(row).toHaveAttribute("aria-disabled", "true");
  // Programmatic focus still works with tabindex=-1; Enter should be a no-op — disabled drops the
  // onClick handler entirely rather than relying on a pointer-events CSS trick to swallow clicks.
  await row.focus();
  await page.keyboard.press("Enter");
  expect(clicks.length).toBe(0);
});

test("title and subtitle truncate with the full text recoverable via the title attribute", async ({ mount, page }) => {
  const longTitle = "A".repeat(200);
  const longSubtitle = "B".repeat(200);
  await mount(<ListRow subtitle={longSubtitle} title={longTitle} />);
  await expect(page.getByText(longTitle)).toHaveAttribute("title", longTitle);
  await expect(page.getByText(longSubtitle)).toHaveAttribute("title", longSubtitle);
});

test("subtitleWrap clamps a GLOSS subtitle to two lines instead of truncating a sentence to one", async ({ mount, page }) => {
  const sentence = "Your world books live here — pick one to edit its keyword-triggered lore and where it attaches.";
  await mount(
    <div style={{ width: 280 }}>
      <ListRow subtitle={sentence} subtitleWrap={true} title="World Info" />
    </div>,
  );
  const subtitle = page.locator('[data-slot="list-row-subtitle"]');
  const style = await subtitle.evaluate((el) => {
    const s = globalThis.getComputedStyle(el);
    return { clamp: s.webkitLineClamp, whitespace: s.whiteSpace, height: el.getBoundingClientRect().height };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(style.clamp).toBe("2");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(style.whitespace).not.toBe("nowrap");
  // RENDERED: the clamped block is genuinely two lines tall at this width, not one ellipsised line.
  const oneLine = await page.locator('[data-slot="list-row-title"]').evaluate((el) => el.getBoundingClientRect().height);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(style.height).toBeGreaterThan(oneLine);
});

test("subtitleReveal swaps the subtitle by VISIBILITY on :focus-within, with the row's geometry unchanged", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="the pitch" subtitleReveal="handle · 42" title="Elara" />);
  const subtitle = page.locator('[data-slot="list-row-subtitle"]');
  const reveal = page.locator('[data-slot="list-row-subtitle-reveal"]');
  const body = page.locator('[data-slot="list-row-body"]');
  // Rest: the subtitle shows, the reveal is visibility:hidden — its BOX is reserved (the stack cell holds
  // both spans), which is the whole point: a display swap here moved layout under a stationary pointer and
  // oscillated the hover boundary at ~85 crossings/sec (packages/client/src/components/row-reveal.ts).
  await expect(subtitle).toBeVisible();
  await expect(reveal).toBeHidden();
  await expect(reveal).toHaveCSS("visibility", "hidden");
  await expect(reveal).toHaveCSS("display", "block");
  const restBox = await body.boundingBox();
  // Focusing the body (:focus-within) swaps them on the SAME content line — no layout shift, no `actions`
  // contention. The reveal is in the content column, not the trailing slot.
  await body.focus();
  await expect(reveal).toBeVisible();
  await expect(subtitle).toBeHidden();
  await expect(subtitle).toHaveCSS("visibility", "hidden");
  await expect(reveal).toHaveAttribute("title", "handle · 42");
  // THE LAW: byte-identical geometry rest ⇄ revealed. Nothing enters or leaves layout.
  await expect.poll(() => body.boundingBox()).toEqual(restBox);
});

// Density rides the control-height min-heights (compact = min-h-control-sm, default = min-h-control-md),
// which are pointer-CONDITIONAL (D62 P1): at coarse they are 44/48 (the min-h dominates and the rows
// differ); at fine they narrow to 28/34, both BELOW this row's ~35px content height, so the min-h is
// inert and the two collapse to the same content-driven height. The density RELATIONSHIP is therefore
// asserted under a coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx precedent).
test.describe("coarse pointer — density heights", () => {
  test.use({ hasTouch: true });

  test("compact density is shorter than the default density", async ({ mount, page }) => {
    const compact = await mount(<ListRow density="compact" title="Elara" />);
    await expect(page.locator('[data-slot="list-row-body"]')).toBeVisible();
    const compactHeight = await page.locator('[data-slot="list-row-body"]').evaluate((el) => el.getBoundingClientRect().height);
    await compact.unmount();
    const defaultRow = await mount(<ListRow title="Elara" />);
    await expect(page.locator('[data-slot="list-row-body"]')).toBeVisible();
    const defaultHeight = await page.locator('[data-slot="list-row-body"]').evaluate((el) => el.getBoundingClientRect().height);
    await defaultRow.unmount();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): web-first visibility settled each row before its cross-mount height sample.
    expect(compactHeight).toBeLessThan(defaultHeight);
  });
});

// side-eye P1-2b: a trailing cluster that is HIDDEN at rest was still reserving its full width, starving
// the title/subtitle in a ~307px LIST pane. `actionsFloat` lifts it out of flow at the row's inline end, so
// the text column keeps the width at rest — and (the reason it is an overlay rather than a width
// transition) the reveal reflows NOTHING: the meta stamp and the truncation point do not move mid-read.
test("actionsFloat gives the text column back the width a rest-hidden cluster reserved", async ({ mount, page }) => {
  // Two `size="icon"` controls — the grammar's real cap (a state toggle + the kebab), on the token box.
  const Cluster = (
    <>
      <Button aria-label="Star" intent="ghost" size="icon" />
      <Button aria-label="Actions" intent="ghost" size="icon" />
    </>
  );
  const content = '[data-slot="list-row-content"]';

  const reserved = await mount(<ListRow actions={Cluster} clickable={true} meta="2h" subtitle="the pitch" title="Elara" />);
  const starved = await page.locator(content).evaluate((el) => el.getBoundingClientRect().width);
  const metaAtRest = await page.locator('[data-slot="list-row-meta"]').evaluate((el) => el.getBoundingClientRect().x);
  await reserved.unmount();

  const floated = await mount(<ListRow actions={Cluster} actionsFloat={true} clickable={true} meta="2h" subtitle="the pitch" title="Elara" />);
  const roomy = await page.locator(content).evaluate((el) => el.getBoundingClientRect().width);
  expect(roomy - starved).toBeGreaterThanOrEqual(60);
  // …and the row is not merely wider at rest: hovering it (the reveal) leaves the text column exactly where
  // it was — the layout-jump the width-collapse alternative would have shipped.
  await floated.hover();
  await expect.poll(async () => await page.locator(content).evaluate((el) => el.getBoundingClientRect().width)).toBe(roomy);
  await expect
    .poll(() => page.locator('[data-slot="list-row-meta"]').evaluate((el) => el.getBoundingClientRect().x), { intervals: [20, 50, 100] })
    .toBeGreaterThan(metaAtRest);
});

// side-eye P3, re-homed: a hidden cluster that FLOATS sits over the title column, so at rest the whole
// cluster — the wrapper AND its controls — must be un-hit-testable, or an invisible button eats a click
// aimed at the text under it. The wrapper alone is not enough: a child that re-declares `pointer-events:
// auto` stays hit-testable through a `pointer-events: none` parent. Computed + elementFromPoint, never the
// class string. (The in-flow arm is deliberately NOT inert — it overlays nothing, and a control that is
// only conditionally hit-testable is unreachable to any click whose hit-test precedes the hover.)
test("a FLOATED cluster is inert over the text at rest and comes live on the row's hover", async ({ mount, page }) => {
  // `className="group"` is what the reveal keys on — every real consumer passes it.
  await mount(
    <ListRow
      actions={<Button aria-label="Actions" intent="ghost" size="icon" />}
      actionsFloat={true}
      className="group"
      clickable={true}
      meta="2h"
      subtitle="the pitch"
      title="Elara"
    />,
  );
  const kebab = page.getByRole("button", { name: "Actions" });
  const hitAt = async (): Promise<string> => {
    const box = await kebab.boundingBox();
    if (box === null) {
      throw new Error("the floated cluster has no box");
    }
    return await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-slot") ?? "none", [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ] as const);
  };

  await expect(page.locator('[data-slot="list-row-actions"]')).toHaveCSS("pointer-events", "none");
  await expect(kebab).toHaveCSS("pointer-events", "none");
  // A click over the hidden cluster reaches the ROW's own content, not the invisible control.
  expect(await hitAt()).toBe("list-row-meta");

  await page.locator('[data-slot="list-row-root"]').hover();
  await expect(kebab).toHaveCSS("pointer-events", "auto");
  expect(await hitAt()).toBe("button");
});

// A RESERVED in-flow cluster is a sibling OUTSIDE the body, so the default body-painted hover tint stops
// short of it and the controls sit on the pane background — which is exactly what pushed the preset row's
// cluster into painting its own darker panel (the box-in-box double highlight, crunch-list item 18).
// `rowTint="row"` moves the tint to the ROOT. Asserted on COMPUTED colors: the body's own tint must be
// neutralized in this arm (two painted boxes double the alpha) and the root's must be live on hover.
test("rowTint=row paints the hover tint on the ROOT, and the body stops painting its own", async ({ mount, page }) => {
  await mount(
    <ListRow
      actions={<Button aria-label="Actions" intent="ghost" size="icon" />}
      className="group"
      clickable={true}
      rowTint="row"
      subtitle="the pitch"
      title="Elara"
    />,
  );
  const root = page.locator('[data-slot="list-row-root"]');
  const body = page.locator('[data-slot="list-row-body"]');
  const cluster = page.locator('[data-slot="list-row-actions"]');

  const accent = TOKENS["color.accent"].value;
  await expect(root).not.toHaveCSS("background-color", accent);
  await expect(body).not.toHaveCSS("background-color", accent);

  await root.hover();
  await expect(root, "the ROW wears the hover tint").toHaveCSS("background-color", accent);
  // The body would otherwise stack a second identical tint over the first, and the cluster would still be
  // outside both.
  await expect(body).not.toHaveCSS("background-color", accent);
  await expect(cluster).not.toHaveCSS("background-color", accent);
  // The cluster is INSIDE the painted box — that is what "the glyphs ride the row tint" means in geometry.
  // Settled snapshot: the tint assertions above already awaited the row's hover transition, and this
  // reads STATIC layout (no animation moves the cluster relative to the root).
  const boxes = await root.evaluate((el) => {
    const rootRect = el.getBoundingClientRect();
    const actionsRect = (el.querySelector(`[data-slot="list-row-actions"]`) as HTMLElement).getBoundingClientRect();
    return { rootRight: rootRect.right, actionsRight: actionsRect.right, rootLeft: rootRect.left, actionsLeft: actionsRect.left };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(boxes.actionsLeft).toBeGreaterThanOrEqual(boxes.rootLeft);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(boxes.actionsRight).toBeLessThanOrEqual(boxes.rootRight);
});

test("renders the leading slot", async ({ mount, page }) => {
  await mount(<ListRow leading={<span data-testid="glyph">*</span>} title="Elara" />);
  await expect(page.getByTestId("glyph")).toBeVisible();
});

// Regression guard: the leading slot (avatar initials / icon) is DECORATIVE — it must NOT leak into
// the row's accessible name. Before the `aria-hidden` on the leading wrapper, a fallback avatar made a
// chat row announce as "UC Untitled chat owner, Niko" instead of "Untitled chat, owner Niko". The
// leading glyph is still VISIBLE (in the DOM) but hidden from the accessibility tree, so `getByRole`
// (Playwright, screen readers, agent nav) resolves the row by its title alone.
test("leading slot is aria-hidden — its text never leaks into the row's accessible name", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} leading={<span>ZZ</span>} title="Elara" />);
  await expect(page.getByText("ZZ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Elara", exact: true })).toBeVisible();
  await expect(page.getByRole("button")).toHaveAccessibleName("Elara");
});

// ── The INLINE-subtitle arm (side-eye F-01's structural fix) ──────────────────────────────────────────
// The default `block` arm gives the title the whole line, so it can safely be `flex-1 min-w-0`. The
// INLINE arm puts the subtitle ON that line, which is where a `shrink-0` sibling could squeeze the title
// to zero — the P0 the preset Actions list shipped. The arm therefore inverts the priority: the SUBTITLE
// takes the flexing column and the TITLE keeps a width floor.

test("subtitlePlacement=inline puts the scent on the title line and the NAME never reaches 0px", async ({ mount, page }) => {
  await mount(
    <div style={{ width: "260px" }}>
      <ListRow
        clickable={true}
        subtitle="an extremely long scent line that would happily consume the entire row if nothing stopped it"
        subtitlePlacement="inline"
        title="Greeting rewrite"
      />
    </div>,
  );
  const title = page.locator('[data-slot="list-row-title"]');
  const subtitle = page.locator('[data-slot="list-row-subtitle"]');

  // INLINE: both share one line (their vertical centers agree).
  const [titleBox, subtitleBox] = await Promise.all([title.boundingBox(), subtitle.boundingBox()]);
  const center = (box: { y: number; height: number } | null): number => (box === null ? -1 : Math.round(box.y + box.height / 2));
  expect(Math.abs(center(titleBox) - center(subtitleBox))).toBeLessThanOrEqual(2);

  // THE PIN: at a width that cannot hold both, the NAME still measures — and the gloss is what shortened.
  expect(titleBox?.width ?? 0).toBeGreaterThan(0);
  await expect(subtitle).toHaveCSS("text-overflow", "ellipsis");
});

test("the BLOCK arm is untouched — the subtitle stays on its own line below the title", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="second line" title="Elara" />);
  const [titleBox, subtitleBox] = await Promise.all([
    page.locator('[data-slot="list-row-title"]').boundingBox(),
    page.locator('[data-slot="list-row-subtitle"]').boundingBox(),
  ]);
  expect(subtitleBox?.y ?? 0).toBeGreaterThan((titleBox?.y ?? 0) + (titleBox?.height ?? 0) - 2);
});

// A DECORATIVE subtitle stays visible and drops out of the announcement — for a mono preview of a body
// the row is not describing (side-eye F-20: an Actions row read out its whole ~600-character template).
test("subtitleDecorative keeps the subtitle visible but out of the row's description", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} meta="fires on every reply" subtitle="{{input}} a long mono preview" subtitleDecorative={true} title="Response" />);
  const row = page.getByRole("button", { name: "Response" });

  await expect(page.getByText("{{input}} a long mono preview")).toBeVisible();
  const describedBy = (await row.getAttribute("aria-describedby")) ?? "";
  expect(describedBy).not.toBe("");
  const described = await page.locator(`#${describedBy.split(" ").join(", #")}`).allTextContents();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(described.join(" ")).toContain("fires on every reply");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(described.join(" ")).not.toContain("{{input}}");
});
