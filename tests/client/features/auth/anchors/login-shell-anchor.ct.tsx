// CT: the login SCENE (anchors/login-shell-anchor.tsx + the web backdrop).
// The §0 container-model law made flesh: the same anchored scene
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
import { ambientCeiling, fingerprintDelta, frameFingerprint, touchDrag, waitFrames } from "../../../../support/browser/weave-drive.ts";
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
    allowInteractiveCards: false,
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
  await expect.poll(async () => (await page.locator('[data-slot="card-root"]').boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(PHONE_W);
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
  // max-w-sm = 24rem = 384px — the card never balloons to the desktop container.
  await expect.poll(async () => (await page.locator('[data-slot="card-root"]').boundingBox())?.width ?? 0).toBeLessThanOrEqual(384);
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

// ── The backdrop is LIVE under a thumb (#152) ─────────────────────────────────────────────────────
// The owner's report: "if I move my thumb over the web nothing happens". The primitive's touch seam
// works (tests/ui/art/web-weave/web-weave-touch.ct.tsx proves a finger rings it) — what was missing is
// that the login backdrop, the one web a user can dwell on, never opted INTO it. These pin the
// PRODUCTION surface. The forward-header arm is used deliberately: it is the login arm whose web is
// SETTLED at mount, so the pluck gate (`listening` — she ignores a hand while she is still building)
// is open with no ~12s weave to wait out, and the capture spiral gives a finger something to catch.
//
// The path is derived from the weave's own box and each end is confirmed with `elementFromPoint`: a
// coordinate that silently landed on the login card would fail as "the web ignored a thumb" and send
// the next reader after the wrong defect.
const PROXY_HEADING = "Authentication happens at your proxy";
/** How far past the worst ambient beat a drive must move the frame to count as a ring. */
const RING_FACTOR = 3;

test.describe("under a coarse pointer", () => {
  test.use({ hasTouch: true });

  /** A drag path across the upper web, clear of the centred card column, in page coordinates. */
  async function silkPath(weave: Locator): Promise<{ readonly from: { x: number; y: number }; readonly to: { x: number; y: number } }> {
    const box = await weave.boundingBox();
    const left = box?.x ?? 0;
    const top = box?.y ?? 0;
    const w = box?.width ?? 0;
    const h = box?.height ?? 0;
    return { from: { x: left + w * 0.14, y: top + h * 0.1 }, to: { x: left + w * 0.7, y: top + h * 0.26 } };
  }

  test("a THUMB drawn across the login backdrop RINGS the silk", async ({ mount, page }) => {
    const cfg = config({ mode: "forward-header", requiresLogin: false, localEnabled: false });
    await stubAuthConfig(page, cfg);
    await mount(<LoginSceneStory width={PHONE_W} config={cfg} />);
    await expect(page.getByRole("heading", { name: PROXY_HEADING })).toBeVisible();
    const weave = page.locator('[data-slot="web-weave"]');
    await expect(weave).toHaveAttribute("data-weave-state", "settled");
    // The backdrop must be reachable by a finger at all — decoration that answers a pointer.
    await expect(weave).toHaveCSS("pointer-events", "auto");
    const canvas = page.locator('[data-slot="web-weave-canvas"]');
    await expect.poll(async () => Number(await canvas.getAttribute("data-orb-weave-frames"))).toBeGreaterThan(2);
    const path = await silkPath(weave);
    // Both ends genuinely land on the weave, not on the card column above it.
    const hits = await page.evaluate(
      (p) => [document.elementFromPoint(p.from.x, p.from.y), document.elementFromPoint(p.to.x, p.to.y)].map((el) => el?.getAttribute("data-slot") ?? "none"),
      path,
    );
    expect(hits, "the drag path must land on the weave canvas").toEqual(["web-weave-canvas", "web-weave-canvas"]);
    // The ambient motion CEILING first (dew, glint, the weaver — see weave-drive.ts on why a single
    // short sample is a lottery, not a floor) …
    const ceiling = await ambientCeiling(page, canvas);
    const before = await frameFingerprint(canvas);
    // … then a real finger across the silk.
    await touchDrag(page, path.from, path.to, 12);
    await waitFrames(page, 2);
    const rung = fingerprintDelta(before, await frameFingerprint(canvas));
    expect(rung, "the login web must answer a thumb").toBeGreaterThan(ceiling * RING_FACTOR);
  });

  test("the login page still does not scroll under the gesture (the backdrop is decoration, not a surface)", async ({ mount, page }) => {
    const cfg = config({ mode: "forward-header", requiresLogin: false, localEnabled: false });
    await stubAuthConfig(page, cfg);
    await mount(<LoginSceneStory width={PHONE_W} config={cfg} />);
    const scene = page.getByTestId("ct-login-scene");
    await expect(scene).toBeVisible();
    const canvas = page.locator('[data-slot="web-weave-canvas"]');
    await expect.poll(async () => Number(await canvas.getAttribute("data-orb-weave-frames"))).toBeGreaterThan(2);
    const path = await silkPath(page.locator('[data-slot="web-weave"]'));
    await touchDrag(page, path.from, { x: path.from.x, y: path.from.y + 240 }, 12);
    // The scene box is `overflow-hidden min-h-dvh` — nothing to scroll, and the explainer stays put.
    await expect.poll(async () => scene.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByRole("heading", { name: PROXY_HEADING })).toBeVisible();
  });
});
