import { SandboxFrame } from "@orb/ui/content";
import { expect, test } from "@playwright/experimental-ct-react";

test("the iframe is sandboxed with NO allow-scripts and NO allow-same-origin", async ({
  mount,
}) => {
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

test("a <script> inside the untrusted html does not reach the parent (sandboxed, scripts off)", async ({
  mount,
  page,
}) => {
  const payload = ["<scr", "ipt>window.parent.__pwned=1</scr", "ipt>"].join("");
  await mount(<SandboxFrame html={`<p>hi</p>${payload}`} title="c" />);
  // scripts are disabled by the empty sandbox → the injected script can never run in the parent realm.
  const pwned = await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned);
  expect(pwned).toBeUndefined();
});

test("render-on-complete: incomplete shows a skeleton, not the frame", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" complete={false} />);
  await expect(cmp).toHaveAttribute("data-slot", "sandbox-frame-skeleton");
  expect(await cmp.evaluate((el) => el.tagName.toLowerCase())).not.toBe("iframe");
});
