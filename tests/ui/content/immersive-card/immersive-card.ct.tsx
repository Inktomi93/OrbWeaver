// CT: the P4 immersive-card lifecycle chrome (parity-plus §4.7) — collapsed sandbox + view-raw + expand.
// The SECURITY boundary is SandboxFrame's own (sandbox-frame.ct.tsx pins it); this suite pins the chrome:
// the title label, the lenient-origin marker, the raw-source toggle showing the EXACT stored bytes, and
// the expand lightbox labelled by the title.

import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import { expect, test } from "@playwright/experimental-ct-react";

const HTML = "<div>an in-world page</div>";

test("the collapsed card renders the title chrome over a sandboxed iframe (never main-DOM HTML)", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  await expect(cmp.locator("div", { hasText: "an in-world page" })).toHaveCount(0);
});

test("a title-less card falls back to the untitled label; a lenient card carries the auto marker", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} origin="lenient" />);
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Immersive card");
  await expect(cmp.locator('[data-slot="immersive-card-origin"]')).toContainText("auto");
  await expect(cmp).toHaveAttribute("data-origin", "lenient");
});

test("view-raw shows the EXACT stored source and toggles back to the sandbox", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Terminal" origin="fence" />);
  await cmp.getByRole("button", { name: "View raw source" }).click();
  await expect(cmp.locator('[data-slot="immersive-card-raw"]')).toHaveText(HTML);
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await cmp.getByRole("button", { name: "Show rendered card" }).click();
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

// RV-1 — the §4.7 formed-COLLAPSED state: the card comes down to its bare title bar and back.
test("collapse takes the card down to the title bar (body unmounted) and re-showing restores the sandbox", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);

  const collapse = cmp.getByRole("button", { name: "Collapse card" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();

  // The title bar survives; the body (and with it the sandboxed frame) is gone — not merely hidden.
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  // View-raw acts on the body, so it is applicability-omitted while collapsed (never a disabled twin).
  await expect(cmp.getByRole("button", { name: "View raw source" })).toHaveCount(0);

  const show = cmp.getByRole("button", { name: "Show card" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  await expect(cmp.getByRole("button", { name: "View raw source" })).toHaveCount(1);
});

test("the collapse control is keyboard-operable and wears the same chrome box as the expand control", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  const collapse = cmp.getByRole("button", { name: "Collapse card" });
  const expand = cmp.getByRole("button", { name: "Open card fullscreen" });

  // Uniform header band: the disclosure is the same ghost icon button as the lightbox control beside it
  // (the Collapsible trigger renders THROUGH Button, so its box is the button box, not a text trigger's).
  const [collapseBox, expandBox] = await Promise.all([collapse.boundingBox(), expand.boundingBox()]);
  expect(collapseBox?.width).toBe(expandBox?.width);
  expect(collapseBox?.height).toBe(expandBox?.height);

  await collapse.focus();
  await collapse.press("Enter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await cmp.getByRole("button", { name: "Show card" }).press(" ");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

test("expand opens the lightbox dialog labelled by the title, with its own sandboxed frame", async ({ mount, page }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Poster" origin="fence" />);
  await cmp.getByRole("button", { name: "Open card fullscreen" }).click();
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-slot="immersive-card-lightbox-header"]')).toContainText("Poster");
  await expect(dialog.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

// ── The ROUTED delivery, end to end in a real browser ────────────────────────────────────────────────
// `frameSrc` threads to `SandboxFrame.src` (the `/api/card-frame/<id>` mint) — the sandbox-frame suite pins
// the ATTRIBUTE-level contract (src/no-srcdoc, the per-delivery sandbox grant, the height channel, CSP is
// the response's own); this pins that a real navigation to that URL actually PAINTS content inside the
// sandboxed frame, which attribute assertions alone cannot prove (a routed src could 404 or be blocked by
// the CSP and every attribute assertion above would still pass).

test("the ROUTED delivery: a real navigation to frameSrc renders the served page inside the sandboxed iframe", async ({ mount, page }) => {
  const routedUrl = "/api/card-frame/0123456789abcdef0123456789abcdef";
  await page.route(routedUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
      body: "<!doctype html><html><body><p>routed card body</p></body></html>",
    });
  });

  const cmp = await mount(<ImmersiveCard html={HTML} title="Routed" origin="fence" frameSrc={routedUrl} />);
  const frame = cmp.locator('iframe[data-slot="sandbox-frame"]');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute("src", routedUrl);
  // The routed arm's grant since the 2026-08-16 tier-B pass (#91): EXACTLY `allow-scripts` — the whole
  // attribute value, so a widened grant reds here — and never `allow-same-origin`. What that buys is the
  // one hash-pinned height script; card-authored scripts stay refused (sandbox-frame.ct.tsx proves both).
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  // srcdoc would win over src per the HTML spec if both were emitted — prove the routed arm never does.
  await expect.poll(() => frame.getAttribute("srcdoc")).toBeNull();

  // The actual navigation completed and the served bytes painted — the content check attribute
  // assertions can't give: reach INTO the null-origin iframe's own document.
  const frameHandle = await frame.elementHandle();
  const contentFrame = await frameHandle?.contentFrame();
  if (contentFrame === null || contentFrame === undefined) {
    throw new Error("routed iframe has no content frame — navigation never completed");
  }
  await expect(contentFrame.locator("p")).toHaveText("routed card body");
});

// #91 THROUGH THE REAL CHROME. `sandbox-frame.ct.tsx` proves the height channel on a bare frame; this
// proves the card's own chrome does not fight it — the collapsible panel, the `rounded-none border-0`
// className override and the `heightPx` ImmersiveCard passes must all yield to the measured size, or the
// 195px void survives inside exactly the component the defect was reported against.

test("#91: a SHORT routed card shrinks the frame inside the card chrome — no void under the content", async ({ mount, page }) => {
  const routedUrl = "/api/card-frame/0123456789abcdef0123456789abcdef";
  await page.route(routedUrl, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static"),
      },
      body: buildCardFrameDocument({
        html: '<div style="height:110px">a short in-world note</div>',
        css: undefined,
        themeTokens: undefined,
        fontFamily: undefined,
      }),
    });
  });

  const cmp = await mount(<ImmersiveCard html={HTML} title="Short note" origin="fence" frameSrc={routedUrl} />);
  const frame = cmp.locator('iframe[data-slot="sandbox-frame"]');
  await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBe(110);
});
