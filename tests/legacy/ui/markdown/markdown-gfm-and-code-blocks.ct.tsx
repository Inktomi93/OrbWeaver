// Seal-level CT for @orb/ui/markdown — GFM, Shiki-highlighted code blocks with their controls, and KaTeX math.

import { AA_NORMAL_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import type { Rgb } from "@orb/tooling/floor/instrument/wcag";
import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";
import { ERROR_FALLBACK } from "./_support.ts";

const COPY_CODE_BTN = /copy code/iu;

const DOWNLOAD_BTN = /download/iu;

test("trusted: a GFM table renders", async ({ mount }) => {
  const md = "| a | b |\n| - | - |\n| 1 | 2 |";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp.locator("table")).toBeVisible();
});

test("gfm singleTilde:false — prose like 10~20°C is NOT struck through", async ({ mount }) => {
  // remark-gfm defaults singleTilde:true (a lone ~ starts strikethrough); the seal re-pins it false
  // (§11.6). The range text must survive with no <del>/line-through wrapping it.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      The range is 10~20°C today.
    </Markdown>,
  );
  await expect(cmp).toContainText("10~20°C");
  // No strikethrough element swallowed the range (a single ~ must stay literal).
  await expect(cmp.locator("del")).toHaveCount(0);
  await expect(cmp.locator("s")).toHaveCount(0);
});

test("trusted: ~~real strikethrough~~ (double tilde) still works", async ({ mount }) => {
  // singleTilde:false disables only the LONE-tilde form; paired ~~…~~ strikethrough must remain.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      This is ~~struck~~ text.
    </Markdown>,
  );
  await expect(cmp.getByText("struck")).toBeVisible();
  await expect.poll(() => cmp.locator('del, s, [data-streamdown="del"]').count()).toBeGreaterThan(0);
});

test("trusted: a fenced code block renders with the language header + copy/download controls", async ({ mount }) => {
  // The code block renders (text present) and the `controls` default (copy + download) is wired.
  const md = "```js\nconst answer = 42;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const answer = 42;");
  await expect(cmp.getByRole("button", { name: COPY_CODE_BTN })).toBeVisible();
  await expect(cmp.getByRole("button", { name: DOWNLOAD_BTN })).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("trusted: a fenced code block is REAL Shiki-highlighted, not inert (D44 §12/UI-Gates §11.6)", async ({ mount }) => {
  // The regression this plugin fixes: Streamdown 2.5 dropped bundled Shiki, so an unwired `plugins.code`
  // renders every token at `--sdm-c:inherit` (no color ever written, verified empirically pre-fix — every
  // span shared one `text-[var(--sdm-c,inherit)]` with no inline `--sdm-c`). Assert the OPPOSITE — the
  // rendered token spans carry REAL per-token `--sdm-c`/`--shiki-dark` inline custom properties resolved
  // from `MARKDOWN_SHIKI_PLUGIN.highlight()` (the JS-regex engine + lazy grammar load complete well
  // inside the CT mount), not the single shared `inherit` fallback the un-highlighted state produces.
  const md = "```ts\nconst answer: number = 42;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  const codeSpans = cmp.locator("pre code span");
  await expect(codeSpans.first()).toBeVisible();
  // Poll on the FINAL assertion directly (distinct real colors across tokens) rather than a two-step
  // "some color present" then "read colors" — `highlight()`'s callback re-render can land in more than
  // one paint, so reading colors in a separate step after only the FIRST non-empty poll can race a
  // still-settling render. The "keyword" token (`const`) and identifiers (`answer`) must land on
  // DIFFERENT colors — real scope-aware highlighting, not every token painted the same single hue.
  await expect
    .poll(
      async () =>
        codeSpans.evaluateAll((spans) => {
          const colors = spans.map((s) => s.style.getPropertyValue("--sdm-c").trim()).filter(Boolean);
          return new Set(colors).size;
        }),
      { timeout: 5000 },
    )
    .toBeGreaterThan(1);
});

// THE APP THEME, NOT THE DEVICE, PICKS THE CODE PALETTE. A dark theme sets `color-scheme: dark` on its scope;
// Streamdown's own `dark:` switch is the OS query, so a dark theme on a light-mode phone painted light tokens on
// the dark ground (1.19:1), and the reverse at 1.07:1. Each token's contrast against the block's own ground is
// read from the rendered colours.
async function minimumTokenContrast(component: import("@playwright/experimental-ct-react").MountResult): Promise<number> {
  const pairs = await component.evaluate((root): { token: Rgb; ground: Rgb }[] => {
    const canvas = document.createElement("canvas").getContext("2d");
    if (canvas === null) {
      throw new Error("no canvas");
    }
    const rgb = (css: string): Rgb => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = css;
      canvas.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    // The ground is what actually paints behind a token: its nearest ancestor with an opaque background.
    const groundOf = (el: Element): string => {
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        const paint = getComputedStyle(node).backgroundColor;
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = paint;
        canvas.fillRect(0, 0, 1, 1);
        if (canvas.getImageData(0, 0, 1, 1).data[3] === 255) {
          return paint;
        }
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const tokens = [...root.querySelectorAll('pre code span[style*="--sdm-c"]')].filter((span) => (span.textContent ?? "").trim() !== "");
    return tokens.map((span) => ({ token: rgb(getComputedStyle(span).color), ground: rgb(groundOf(span)) }));
  });
  // No highlighted token yet reads 0 so the poll keeps waiting rather than passing on an empty set.
  return pairs.length === 0 ? 0 : Math.min(...pairs.map(({ token, ground }) => wcagContrastRatio(token, ground)));
}

const THEMED_CODE = "```ts\nconst tideHeightCm: number = measure(42); // reading\n```";
const BUTTONED_CODE = "```js\nconst answer = 42;\n```";

for (const { theme, device } of [
  { theme: "dark", device: "light" },
  { theme: "light", device: "dark" },
] as const) {
  test(`a ${theme} app theme on a ${device}-mode device keeps every code token at AA contrast`, async ({ mount, page }) => {
    await page.emulateMedia({ colorScheme: device, reducedMotion: "no-preference" });
    const cmp = await mount(
      <div data-theme={theme === "light" ? "light" : undefined}>
        <Markdown trust="trusted" mode="static">
          {THEMED_CODE}
        </Markdown>
      </div>,
    );
    // Streamdown paints the fence as plain inherited text until the grammar loads; measure the highlighted tokens.
    await expect(cmp.locator('pre code span[style*="--shiki-dark"]').first()).toBeVisible();
    await expect.poll(() => minimumTokenContrast(cmp), { timeout: 5000 }).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  });
}

test.describe("code block controls at a touch pointer", () => {
  test.use({ hasTouch: true });

  test("Copy and Download are hit across the whole touch floor", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const cmp = await mount(
      <div style={{ paddingTop: 48 }}>
        <Markdown trust="trusted" mode="static">
          {BUTTONED_CODE}
        </Markdown>
      </div>,
    );
    await expect(cmp.locator('[data-streamdown="code-block-copy-button"]')).toBeVisible();
    await expect
      .poll(() =>
        cmp.evaluate((root) => {
          const probe = document.createElement("div");
          probe.style.width = "var(--spacing-touch-target)";
          document.body.append(probe);
          const half = probe.getBoundingClientRect().width / 2 - 1;
          probe.remove();
          const edges = [
            [0, -half],
            [0, half],
            [-half, 0],
            [half, 0],
          ] as const;
          // One probe per edge of a button's touch floor; a miss names the button.
          const missed = (button: Element): boolean => {
            const box = button.getBoundingClientRect();
            return edges.some(([dx, dy]) => {
              const hit = document.elementFromPoint(box.left + box.width / 2 + dx, box.top + box.height / 2 + dy);
              return hit === null || !button.contains(hit);
            });
          };
          const buttons = [...root.querySelectorAll('[data-streamdown="code-block-copy-button"], [data-streamdown="code-block-download-button"]')];
          return buttons.filter(missed).map((button) => button.getAttribute("data-streamdown"));
        }),
      )
      .toEqual([]);
  });
});

test("trusted: inline math ($…$) renders a KaTeX element", async ({ mount }) => {
  // The KaTeX plugin (remark-math → rehype-katex) is wired via plugins.math. A rendered equation
  // produces a `.katex` container.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {"Euler: $e^{i\\pi} + 1 = 0$ is neat."}
    </Markdown>,
  );
  await expect(cmp.locator(".katex").first()).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});
