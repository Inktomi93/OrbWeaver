// CT: the log-viewer seal — a role="log"/aria-live="polite" line panel (ui-package-design item
// 12). Read-only, monospace, level glyph+intent-token pairs (never color alone), pinned-to-bottom
// autoscroll respecting prefers-reduced-motion, a copy-to-clipboard affordance, and maxLines.
import { LogViewer } from "@orb/ui/log-viewer";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

function makeLines(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `line ${index}`);
}

test("the line region exposes role=log and aria-live=polite", async ({ mount }) => {
  const component = await mount(<LogViewer lines={["booted"]} />);
  const log = component.getByRole("log");
  await expect(log).toBeVisible();
  await expect(log).toHaveAttribute("aria-live", "polite");
});

test("warn and error lines carry a non-color glyph plus the intent token color", async ({
  mount,
}) => {
  const component = await mount(
    <LogViewer
      lines={[
        { text: "boot ok", level: "info" },
        { text: "disk almost full", level: "warn" },
        { text: "connection refused", level: "error" },
      ]}
    />,
  );
  const infoLine = component.locator('[data-level="info"]');
  const warnLine = component.locator('[data-level="warn"]');
  const errorLine = component.locator('[data-level="error"]');

  await expect(infoLine.locator("svg")).toBeVisible();
  await expect(warnLine.locator("svg")).toBeVisible();
  await expect(errorLine.locator("svg")).toBeVisible();

  await expect(warnLine).toHaveCSS("color", TOKENS["color.warning"].value);
  await expect(errorLine).toHaveCSS("color", TOKENS["color.destructive"].value);
  await expect(infoLine).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("unleveled lines render plain, with no glyph", async ({ mount }) => {
  const component = await mount(<LogViewer lines={["plain line"]} />);
  const line = component.locator("[data-log-line]");
  await expect(line).not.toHaveAttribute("data-level");
  await expect(line.locator("svg")).toHaveCount(0);
});

test("maxLines caps the rendered window to the most recent N lines", async ({ mount }) => {
  const component = await mount(<LogViewer lines={makeLines(10)} maxLines={3} />);
  await expect(component.locator("[data-log-line]")).toHaveCount(3);
  await expect(component.getByText("line 9", { exact: true })).toBeVisible();
  await expect(component.getByText("line 0", { exact: true })).toHaveCount(0);
});

test("appending lines autoscrolls the line region to the new bottom", async ({ mount }) => {
  const component = await mount(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(20)} className="h-full" />
    </div>,
  );
  const log = component.getByRole("log");
  await component.update(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(40)} className="h-full" />
    </div>,
  );
  await expect(log.getByText("line 39", { exact: true })).toBeVisible();
  await expect(log.getByText("line 0", { exact: true })).not.toBeInViewport();
});

test("a reader scrolled up is not yanked back to the bottom by an append (pin, not yank)", async ({
  mount,
}) => {
  const component = await mount(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(20)} className="h-full" />
    </div>,
  );
  const log = component.getByRole("log");
  await expect(log.getByText("line 19", { exact: true })).toBeInViewport();

  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(0);

  await component.update(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(40)} className="h-full" />
    </div>,
  );

  // Still reading from the top — the append below did NOT yank scrollTop back to the bottom.
  await expect(log.getByText("line 0", { exact: true })).toBeInViewport();
  await expect(log.getByText("line 39", { exact: true })).not.toBeInViewport();
});

test("a reader pinned to the bottom stays pinned through an append", async ({ mount }) => {
  const component = await mount(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(20)} className="h-full" />
    </div>,
  );
  const log = component.getByRole("log");
  // Wait for the mount's own smooth-scroll-to-bottom to SETTLE (not just for the last line to
  // enter the viewport partway through the animation) before appending, so the append's pin check
  // reads a stable "already at the bottom", not a mid-flight scroll position.
  await expect
    .poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThanOrEqual(4);

  await component.update(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(40)} className="h-full" />
    </div>,
  );

  await expect
    .poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThanOrEqual(4);
  await expect(log.getByText("line 39", { exact: true })).toBeInViewport();
});

test("the line region is keyboard-scrollable (tabIndex=0, WCAG 2.1.1)", async ({ mount, page }) => {
  await mount(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(20)} className="h-full" />
    </div>,
  );
  const log = page.getByRole("log");
  await expect(log).toHaveAttribute("tabindex", "0");
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  await log.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test("autoscroll is instant (not smooth) under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    (globalThis as unknown as { __behavior: string | null }).__behavior = null;
    const proto = Element.prototype as unknown as {
      scrollTo: (options?: ScrollToOptions) => void;
    };
    const original = proto.scrollTo;
    proto.scrollTo = (options?: ScrollToOptions): void => {
      if (options !== undefined) {
        (globalThis as unknown as { __behavior: string | null }).__behavior =
          options.behavior ?? null;
      }
      original.call(proto, options);
    };
  });

  await mount(
    <div style={{ height: 100 }}>
      <LogViewer lines={makeLines(20)} className="h-full" />
    </div>,
  );

  const behavior = await page.evaluate(
    () => (globalThis as unknown as { __behavior: string | null }).__behavior,
  );
  expect(behavior).toBe("auto");
});

test("a long log windows its DOM via the virtual-list seal instead of rendering every line", async ({
  mount,
}) => {
  const component = await mount(
    <div style={{ height: 200 }}>
      <LogViewer lines={makeLines(500)} className="h-full" />
    </div>,
  );
  const rendered = await component.locator("[data-log-line]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(500);
  await expect(component.getByRole("log")).toHaveAttribute("aria-live", "polite");
  await expect(component.getByText("line 499", { exact: true })).toBeVisible();
  await expect(component.getByText("line 0", { exact: true })).toHaveCount(0);
});

test("the copy affordance writes the visible lines to the clipboard", async ({ mount, page }) => {
  await page.evaluate(() => {
    (globalThis as unknown as { __copied: string | null }).__copied = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string): Promise<void> => {
          (globalThis as unknown as { __copied: string | null }).__copied = text;
          return Promise.resolve();
        },
      },
    });
  });

  const component = await mount(<LogViewer lines={["alpha", "beta"]} />);
  await component.getByRole("button", { name: "Copy log" }).click();

  const copied = await page.evaluate(
    () => (globalThis as unknown as { __copied: string | null }).__copied,
  );
  expect(copied).toBe("alpha\nbeta");
});
