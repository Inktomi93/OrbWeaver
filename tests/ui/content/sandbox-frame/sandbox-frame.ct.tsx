import { SandboxFrame } from "@orb/ui/sandbox-frame";
import { expect, test } from "@playwright/experimental-ct-react";

test("the iframe is sandboxed with NO allow-scripts and NO allow-same-origin", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>card</p>" title="card" />);
  const sandbox = await cmp.getAttribute("sandbox");
  expect(sandbox).not.toBeNull();
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
});

test("the srcdoc carries the deny-by-default CSP", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("Content-Security-Policy");
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).not.toContain("connect-src");
});

test("FAIL-CLOSED: with no external-media verdict the frame CSP allows no https: media", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self'; media-src 'self';");
  expect(srcdoc).not.toContain("https:");
});

test("allowExternalMedia widens EXACTLY img-src + media-src to https: — nothing else moves", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" allowExternalMedia={true} />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self' https:");
  expect(srcdoc).toContain("media-src 'self' https:");
  // The deny-by-default base + the no-exfil posture are untouched, and http: stays barred.
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).not.toContain("connect-src");
  expect(srcdoc).not.toContain("script-src");
  expect(srcdoc).toContain("font-src 'self'");
  expect(srcdoc).not.toContain("http:");
});

test("a <script> inside the untrusted html does not reach the parent (sandboxed, scripts off)", async ({ mount, page }) => {
  const payload = ["<scr", "ipt>window.parent.__pwned=1</scr", "ipt>"].join("");
  await mount(<SandboxFrame html={`<p>hi</p>${payload}`} title="c" />);
  // scripts are disabled by the empty sandbox → the injected script can never run in the parent realm.
  const pwned = await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned);
  expect(pwned).toBeUndefined();
});

test("render-on-complete: incomplete shows a skeleton, not the frame", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" complete={false} />);
  await expect(cmp).toHaveAttribute("data-slot", "sandbox-frame-skeleton");
  await expect.poll(() => cmp.evaluate((el) => el.tagName.toLowerCase())).not.toBe("iframe");
});

test("an unstyled card lands in the theme: the srcdoc carries a token-driven base body rule", async ({ mount }) => {
  const cmp = await mount(
    <SandboxFrame html="<p>bare</p>" title="bare" themeTokens={{ "--sandbox-bg": "#101010", "--sandbox-fg": "#eeeeee" }} fontFamily="Geist, sans-serif" />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  // The body USES the injected surface/text vars (not browser-default white/serif) and the UI font list.
  expect(srcdoc).toContain("--sandbox-bg: #101010");
  expect(srcdoc).toContain("background: var(--sandbox-bg)");
  expect(srcdoc).toContain("color: var(--sandbox-fg)");
  expect(srcdoc).toContain("font-family: Geist, sans-serif");
});

test("a hostile fontFamily is dropped at the boundary; the base body falls back to sans-serif", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" fontFamily="Geist; } body { background: url(//evil) } /*" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toContain("url(//evil");
  expect(srcdoc).toContain("font-family: sans-serif");
});

test("hostile themeTokens are dropped at the boundary, not smuggled into the srcdoc", async ({ mount }) => {
  const cmp = await mount(
    <SandboxFrame
      html="<p>x</p>"
      title="x"
      themeTokens={{
        "--accent": "url(//evil.test/x.png)",
        "--evil": "red; } </style><script>window.__pwned=1</script>",
        "not-a-custom-prop": "#336699",
        "--safe": "#336699",
      }}
    />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toContain("url(//evil");
  expect(srcdoc).not.toContain("<script>");
  expect(srcdoc).not.toContain("not-a-custom-prop");
  expect(srcdoc).toContain("--safe: #336699");
});
