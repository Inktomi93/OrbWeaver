import { expect, test } from "@playwright/test";
import type { MathStory } from "./_math-stories.tsx";

const STORY = "tests/ui/markdown/_math-stories/MathStory";
const INLINE_TEX = String.raw`x_1^2 + \sqrt[3]{y}`;
const DISPLAY_TEX = String.raw`\sum_{i=1}^{n}\frac{\overline{a_i}}{\sqrt{x}}+\begin{pmatrix}1&2\\3&4\end{pmatrix}`;
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
const PROBE_ORIGIN = "https://math-accessibility.invalid";

for (const trust of ["trusted", "untrusted"] as const) {
  for (const mode of ["static", "streaming"] as const) {
    test(`${trust} ${mode} math retains accessible inline and display semantics`, async ({ mount }) => {
      const component = await mount<typeof MathStory>(STORY, {
        trust,
        mode,
        children: `Inline $${INLINE_TEX}$.\n\n$$\n${DISPLAY_TEX}\n$$\n\nMath complete.`,
      });
      await expect(component.getByText("Math complete.", { exact: true })).toBeVisible();
      await expect(component.getByRole("math")).toHaveCount(2);
      await expect(component.locator("math annotation").nth(0)).toHaveText(INLINE_TEX);
      await expect(component.locator("math annotation").nth(1)).toHaveText(DISPLAY_TEX);
      await expect(component.locator("math msubsup")).toHaveCount(1);
      await expect(component.locator("math mroot")).toHaveCount(1);
      await expect(component.locator("math mfrac")).toHaveCount(1);
      await expect(component.locator("math munderover")).toHaveCount(1);
      await expect(component.locator("math mtable")).toHaveCount(1);
      await expect(component.locator('.katex-html[aria-hidden="true"]')).toHaveCount(2);
      expect(await component.locator("math").evaluateAll((nodes) => nodes.map((node) => node.namespaceURI))).toEqual([MATHML_NAMESPACE, MATHML_NAMESPACE]);
    });
  }

  test(`${trust} math refuses executable, foreign and fetching markup and TeX`, async ({ mount, page }) => {
    const requests: string[] = [];
    await page.route(`${PROBE_ORIGIN}/**`, async (route) => {
      requests.push(route.request().url());
      await route.abort("aborted");
    });
    const marker = "document.documentElement.setAttribute('data-math-attack','executed')";
    const component = await mount<typeof MathStory>(STORY, {
      trust,
      mode: "static",
      children: `Valid $x+1$.

<math href="${PROBE_ORIGIN}/math"><mtext onclick="${marker}">Raw math</mtext><annotation-xml encoding="text/html"><img src="${PROBE_ORIGIN}/annotation" onerror="${marker}"></annotation-xml><mglyph src="${PROBE_ORIGIN}/glyph"></mglyph></math>

<svg><foreignObject><iframe src="${PROBE_ORIGIN}/frame"></iframe></foreignObject></svg>

<script>${marker};fetch('${PROBE_ORIGIN}/script')</script>

<img src="${PROBE_ORIGIN}/image" onerror="${marker}">

<p style="background-image:url(${PROBE_ORIGIN}/style)" onmouseover="${marker}">Styled payload</p>

$\\href{${PROBE_ORIGIN}/tex-link}{link}$

$\\includegraphics{${PROBE_ORIGIN}/tex-image}$

$\\htmlStyle{background-image:url(${PROBE_ORIGIN}/tex-style)}{styled}$

Security boundary reached.`,
    });
    await expect(component.getByText("Security boundary reached.", { exact: true })).toBeVisible();
    await expect(component.locator("math annotation").filter({ hasText: /^x\+1$/u })).toHaveCount(1);
    await expect(component.locator("script, annotation-xml, foreignObject, iframe, object, embed, mglyph, img, a")).toHaveCount(0);
    const unsafeAttributes = await component.evaluate((root) =>
      [...root.querySelectorAll("*")].flatMap((element) =>
        element
          .getAttributeNames()
          .filter(
            (name) =>
              name.startsWith("on") ||
              ["href", "src", "srcset", "xlink:href", "background"].includes(name) ||
              (name === "style" && /url\s*\(/iu.test(element.getAttribute(name) ?? "")),
          ),
      ),
    );
    expect(unsafeAttributes).toEqual([]);
    await expect(page.locator("html")).not.toHaveAttribute("data-math-attack", "executed");
    expect(requests).toEqual([]);
  });
}
