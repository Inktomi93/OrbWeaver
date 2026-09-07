// Standing #883 contrast floor: the real room is painted over the legal minimum scrim and the worst
// one-pixel art for its derived polarity, then EVERY visual text node is discovered from the rendered DOM.
// No copied token-pair table decides membership: the owning element and its framebuffer backdrop are the
// pair. The controls below are hostile on purpose and prove the instrument refuses blind populations.

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { auditRenderedTextContrast, pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { WorstLegalArtRoomStory, WorstLegalArtThemePairsStory } from "../_contrast-stories.tsx";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../fixtures.ts";

const AA_NORMAL = 4.5;

function routeRoom(page: Page): Promise<{ readonly count: (path: string) => number }> {
  return routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    "chat.previewContextFit": (): unknown => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: null;
      identities: readonly ChatIdentity[];
      group: GroupConfig;
    } => ({ participants: [], anchorPersonaId: null, identities: [], group: DEFAULT_GROUP_CONFIG }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([
        makeMessageView({ id: castId<MessageId>("msg_contrast_user"), role: "user", content: "Is the path clear?", seq: 1 }),
        makeMessageView({ id: castId<MessageId>("msg_contrast_ai"), role: "assistant", content: "The lanterns answer in amber.", seq: 2 }),
      ]),
    "chat.send": (): unknown => ({ ok: true }),
  });
}

const PALETTE_ARMS = [
  { palette: "hearth", polarity: "dark", art: "#000000" },
  { palette: "mocha", polarity: "dark", art: "#000000" },
  { palette: "light", polarity: "light", art: "#ffffff" },
  { palette: "custom-dark", polarity: "dark", art: "#000000" },
  { palette: "custom-light", polarity: "light", art: "#ffffff" },
  { palette: "custom-pivot-dark", polarity: "dark", art: "#000000" },
  { palette: "custom-pivot-light", polarity: "light", art: "#ffffff" },
] as const;

for (const arm of PALETTE_ARMS) {
  test(`#883 ${arm.palette} (${arm.polarity}) — every real room text node clears AA over worst legal art`, async ({ mount, page }) => {
    await routeRoom(page);
    const component = await mount(<WorstLegalArtRoomStory art={arm.art} palette={arm.palette} />);
    await expect(component.getByText("The lanterns answer in amber.")).toBeVisible();
    await expect(component.locator('[data-slot="chat-controls"]')).toBeVisible();

    const contrastRoot = component.locator("[data-has-bg-image]");
    const receipt = await auditRenderedTextContrast(page, contrastRoot, {
      floor: AA_NORMAL,
      label: `${arm.palette}/${arm.polarity}/room`,
    });
    expect(receipt.declared).toBeGreaterThan(0);
    expect(receipt.reached).toBe(receipt.declared);
    expect(receipt.sampled).toBe(receipt.declared);
  });

  test(`#883 ${arm.palette} (${arm.polarity}) — every painted ThemeScope pair clears AA over its framebuffer host`, async ({ mount, page }) => {
    const component = await mount(<WorstLegalArtThemePairsStory art={arm.art} palette={arm.palette} />);
    await expect(component.getByText("Reading plate ink")).toBeVisible();

    const receipt = await auditRenderedTextContrast(page, component.locator("[data-has-bg-image]"), {
      floor: AA_NORMAL,
      label: `${arm.palette}/${arm.polarity}/theme-scope`,
    });
    expect(receipt.declared).toBeGreaterThan(0);
    expect(receipt.reached).toBe(receipt.declared);
    expect(receipt.sampled).toBe(receipt.declared);
  });
}

test("#883 control: a zero-node surface is an instrument error, never a clean population", async ({ mount, page }) => {
  const component = await mount(<div data-has-bg-image="" />);
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "zero control" })).rejects.toThrow("declared=0 reached=0 sampled=0");
});

test("#883 control: a known no-backing composition fails the rendered floor", async ({ mount, page }) => {
  const component = await mount(
    <div data-has-bg-image="" style={{ background: "#ffffff" }}>
      <span style={{ color: "#ffffff" }}>No backing</span>
    </div>,
  );
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "no-backing control" })).rejects.toThrow("below 4.5");
});

test("#883 control: a bad light-polarity token pairing fails", async ({ mount, page }) => {
  const component = await mount(
    <div data-has-bg-image="" data-theme="light" style={{ background: "var(--color-background)" }}>
      <span style={{ color: "var(--color-primary-foreground)" }}>Wrong light pair</span>
    </div>,
  );
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "light-pair control" })).rejects.toThrow("below 4.5");
});

test("#883 control: an off-viewport subject stays declared but cannot count as reached", async ({ mount, page }) => {
  const component = await mount(
    <div data-has-bg-image="" style={{ background: "#000000", color: "#ffffff" }}>
      <span style={{ left: 0, position: "fixed", top: 2000 }}>Off viewport</span>
    </div>,
  );
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "viewport control" })).rejects.toThrow("declared=1 reached=0 sampled=0");
});

test("#883 control: a fully occluded subject stays declared but cannot count as reached", async ({ mount, page }) => {
  const component = await mount(
    <div data-has-bg-image="" style={{ background: "#000000", color: "#ffffff", position: "relative" }}>
      <span>Occluded text</span>
      <span aria-hidden="true" style={{ background: "#000000", inset: 0, position: "absolute", zIndex: 1 }} />
    </div>,
  );
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "occlusion control" })).rejects.toThrow(
    /declared=1 reached=0 sampled=0.*fully occluded/u,
  );
});

test("#883 control: an unmeasurable subject cannot become a passing ratio", async ({ mount, page }) => {
  const component = await mount(
    <div data-has-bg-image="" style={{ background: "#000000", color: "#ffffff" }}>
      <span style={{ opacity: 0.01 }}>Too faint to measure honestly</span>
    </div>,
  );
  await expect(auditRenderedTextContrast(page, component, { floor: AA_NORMAL, label: "unmeasurable control" })).rejects.toThrow("below the measurable floor");
});

test("#883 control: equal computed backgrounds can have opposite framebuffer verdicts", async ({ mount, page }) => {
  const component = await mount(
    <div>
      <div style={{ background: "#000000", padding: 8 }}>
        <span data-testid="good" style={{ color: "#ffffff" }}>
          Composited ink
        </span>
      </div>
      <div style={{ background: "#ffffff", padding: 8 }}>
        <span data-testid="bad" style={{ color: "#ffffff" }}>
          Composited ink
        </span>
      </div>
    </div>,
  );
  const good = component.getByTestId("good");
  const bad = component.getByTestId("bad");
  await expect(good).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(bad).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const [goodPixels, badPixels] = await Promise.all([pixelContrast(page, good), pixelContrast(page, bad)]);
  expect(goodPixels.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  expect(badPixels.ratio).toBeLessThan(AA_NORMAL);
});
