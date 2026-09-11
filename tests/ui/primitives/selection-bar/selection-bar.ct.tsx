// CT: the selection-bar bulk-action chrome — the live-announcing count, Escape/clear firing
// onClear, and the caller-owned actions slot (ui-package-design §12 Wave 3-C; work-order #21).

import { Button } from "@orb/ui/button";
import { SelectionBar } from "@orb/ui/selection-bar";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("placement variants ride the token surface (sticky vs floating)", async ({ mount }) => {
  const sticky = await mount(<SelectionBar count={1} onClear={(): void => undefined} />);
  await expect(sticky).toHaveCSS("background-color", TOKENS["color.background"].value);
  await sticky.unmount();

  const floating = await mount(<SelectionBar count={1} onClear={(): void => undefined} placement="floating" />);
  await expect(floating).toHaveCSS("background-color", TOKENS["color.popover"].value);
});

test("the count region is aria-live polite", async ({ mount }) => {
  const bar = await mount(
    <SelectionBar count={3} onClear={(): void => undefined}>
      <button type="button">Archive</button>
    </SelectionBar>,
  );
  await expect(bar.getByText("3 selected")).toHaveAttribute("aria-live", "polite");
});

test("the clear button fires onClear", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <SelectionBar
      count={2}
      onClear={(): void => {
        cleared = true;
      }}
    />,
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(cleared).toBe(true);
});

test("Escape fires onClear when focus is within the bar", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <SelectionBar
      count={2}
      onClear={(): void => {
        cleared = true;
      }}
    >
      <button type="button">Archive</button>
    </SelectionBar>,
  );
  await page.getByRole("button", { name: "Archive" }).focus();
  await page.keyboard.press("Escape");
  expect(cleared).toBe(true);
});

test("Escape does nothing when focus is outside the bar", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <div>
      <input data-testid="outside" />
      <SelectionBar
        count={2}
        onClear={(): void => {
          cleared = true;
        }}
      />
    </div>,
  );
  await page.getByTestId("outside").focus();
  await page.keyboard.press("Escape");
  expect(cleared).toBe(false);
});

test("the actions slot renders the caller's children", async ({ mount, page }) => {
  await mount(
    <SelectionBar count={1} onClear={(): void => undefined}>
      <button type="button">Archive</button>
      <button type="button">Delete</button>
    </SelectionBar>,
  );
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
});

// #843 — `1 selected` BROKE MID-PHRASE in the characters LIST pane at its docked 290px: `1` on one line,
// `selected` on the next. The count is one indivisible phrase (a number and one word); the ACTION cluster
// is the thing that should give, and it reads fine on a second line. Measured as RENDERED height, at the
// width the review measured at, against a single line of the same text — a class assertion would pass
// while the pixels wrapped.
test("#843 the count never breaks mid-phrase at the narrowest real pane", async ({ mount }) => {
  // A FIXED-WIDTH host, not a narrow viewport: the CT mount root is CONTENT-sized, so a bar mounted bare
  // sizes itself to its own contents and agrees with the bug. The characters LIST pane docks at 290px and
  // carries exactly this action set (`character-bulk-bar.tsx`), which is where the break was measured.
  const bar = await mount(
    <div style={{ width: "290px", overflow: "visible" }}>
      <SelectionBar count={1} onClear={(): void => undefined}>
        {/* The REAL `@orb/ui` Buttons at the size the character bulk bar uses, not bare intrinsics: a plain
            `<button>` is ~40% narrower than an `sm` control box, and with three of them the row does not
            over-constrain at all — the defect is a WIDTH budget, so a cheaper stand-in cannot reproduce it. */}
        <Button intent="secondary" size="sm">
          Tag
        </Button>
        <Button intent="secondary" size="sm">
          Archive
        </Button>
        <Button intent="destructive" size="sm">
          Delete
        </Button>
      </SelectionBar>
    </div>,
  );

  const count = bar.getByText("1 selected");
  await expect(count).toBeVisible();
  const lines = await count.evaluate((el: HTMLElement) => {
    const style = globalThis.getComputedStyle(el);
    return Math.round(el.getBoundingClientRect().height / Number.parseFloat(style.lineHeight));
  });
  expect(lines, "the count is one line").toBe(1);
});

// #1137 (side-eye Characters F10) — THE BAR'S EXIT WAS THE LEAST DISCOVERABLE THING IN IT. At the same
// docked 290px the #843 arm above measures at, `Clear selection` rendered as a lone 34x34 glyph on its own
// row 40px BELOW the count, left-aligned: the root carried the wrap and the dismiss is the root's last
// child, so the dismiss is what went to the second line. The claim is positional, so it is measured
// positionally — same row as the count, at the bar's trailing edge — with the #843 pin above unchanged
// beside it (the count still may not break).
test("#1137 the dismiss stays on the count's row, at the bar's trailing edge, at the narrowest real pane", async ({ mount }) => {
  const bar = await mount(
    <div style={{ width: "290px", overflow: "visible" }}>
      <SelectionBar count={1} onClear={(): void => undefined}>
        <Button intent="secondary" size="sm">
          Tag
        </Button>
        <Button intent="secondary" size="sm">
          Archive
        </Button>
        <Button intent="secondary" size="sm">
          Delete
        </Button>
      </SelectionBar>
    </div>,
  );

  const geometry = await bar.evaluate((host: HTMLElement) => {
    const rect = (selector: string): DOMRect | null => host.querySelector(selector)?.getBoundingClientRect() ?? null;
    const count = rect('[data-slot="selection-bar-count"]');
    const clear = rect('[data-slot="selection-bar-clear"]');
    const root = rect('[data-slot="selection-bar-root"]');
    return {
      countTop: Math.round(count?.top ?? -1),
      countBottom: Math.round(count?.bottom ?? -1),
      clearTop: Math.round(clear?.top ?? -2),
      clearRight: Math.round(clear?.right ?? -1),
      rootRight: Math.round(root?.right ?? -2),
      rootPaddingRight: Math.round(
        Number.parseFloat(globalThis.getComputedStyle(host.querySelector('[data-slot="selection-bar-root"]') as HTMLElement).paddingRight),
      ),
    };
  });
  // Positive control: a missing element reads as -1/-2 and would make both claims below meaningless.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): one settled evaluate over a static bar at a fixed host width — no images, no transitions, one snapshot.
  expect(geometry.countTop).toBeGreaterThanOrEqual(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same snapshot
  expect(geometry.clearTop).toBeGreaterThanOrEqual(0);
  // SAME ROW: the dismiss's top edge sits inside the count's line box, not on a row beneath it.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same snapshot
  expect(geometry.clearTop).toBeLessThan(geometry.countBottom);
  // TRAILING EDGE: the dismiss ends at the bar's inner right edge (its padding), never mid-row.
  expect(geometry.rootRight - geometry.clearRight).toBeLessThanOrEqual(geometry.rootPaddingRight + 1);
});
