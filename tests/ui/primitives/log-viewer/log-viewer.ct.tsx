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
