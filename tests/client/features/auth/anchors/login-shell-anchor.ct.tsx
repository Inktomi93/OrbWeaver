// CT: the login SCENE (anchors/login-shell-anchor.tsx + the web backdrop — docs/design/
// login-loading-screen.md §3/§9.8). The §0 container-model law made flesh: the same anchored scene
// is proven at a PHONE-width container (390px — the class of defect a wide-viewport CT structurally
// cannot see) AND at desktop width. What it pins:
//   • the card + wordmark render inside the container with NO horizontal overflow at 390px;
//   • the brand web canvas mounts BEHIND the card and actually paints;
//   • the first-run arm drives the backdrop to the HALF-WOVEN (`partial`) web (the §3 mode→web map).
// The auth config is stubbed at the network (`page.route`) — the backdrop reads it through the real
// query layer.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { AuthConfig } from "../../../../../packages/client/src/data/auth-config.ts";
import { LoginSceneStory } from "../_ct-stories.tsx";

const PHONE_W = 390;
const DESKTOP_W = 1280;

function config(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "local",
    requiresLogin: true,
    localEnabled: true,
    oidcEnabled: false,
    oidcProviderName: "Test IdP",
    localFirstRun: false,
    discreetLogin: false,
    defaultHandle: "owner",
    multiHumanCapable: false,
    forbidExternalMedia: true,
    trustHtml: false,
    uploads: DEFAULT_UPLOAD_CAPS,
    ...overrides,
  };
}

async function stubAuthConfig(page: Page, body: AuthConfig): Promise<void> {
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
}

function paintedPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (ctx === null) {
      return -1;
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] as number) > 0) {
        painted += 1;
      }
    }
    return painted;
  });
}

test("PHONE container (390px): card + wordmark contained, no horizontal overflow, web painted behind", async ({ mount, page }) => {
  const cfg = config({});
  await stubAuthConfig(page, cfg);
  await mount(<LoginSceneStory width={PHONE_W} config={cfg} />);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("orbweaver")).toBeVisible();
  await expect(page.getByTestId("login-handle")).toBeVisible();
  // The container-model overflow check: the scene box must not scroll horizontally at phone width.
  await expect.poll(async () => page.getByTestId("ct-login-scene").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  // The card itself fits the 390px container.
  const cardBox = await page.locator('[data-slot="card-root"]').boundingBox();
  expect(cardBox).not.toBeNull();
  // ONESHOT-OK: layout settled — the visibility asserts above already awaited the rendered scene.
  expect((cardBox?.width ?? Number.POSITIVE_INFINITY) <= PHONE_W).toBe(true);
  // The brand web is mounted behind and genuinely painting.
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(1000);
});

test("DESKTOP container (1280px): the same ONE surface — card centered at max-w-sm, web painted", async ({ mount, page }) => {
  const cfg = config({});
  await stubAuthConfig(page, cfg);
  await mount(<LoginSceneStory width={DESKTOP_W} config={cfg} />);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const cardBox = await page.locator('[data-slot="card-root"]').boundingBox();
  expect(cardBox).not.toBeNull();
  // ONESHOT-OK: layout settled (heading visibility awaited above).
  // max-w-sm = 24rem = 384px — the card never balloons to the desktop container.
  expect((cardBox?.width ?? 0) <= 384).toBe(true);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(1000);
});

test("the first-run arm drives the HALF-WOVEN backdrop (mode→web map, B4)", async ({ mount, page }) => {
  const cfg = config({ localFirstRun: true });
  await stubAuthConfig(page, cfg);
  await mount(<LoginSceneStory width={DESKTOP_W} config={cfg} />);
  await expect(page.getByRole("heading", { name: "Set up your server" })).toBeVisible();
  // The backdrop reaches the same config through the query layer and lands on `partial`.
  await expect(page.locator('[data-slot="web-weave"]')).toHaveAttribute("data-weave-state", "partial");
});
