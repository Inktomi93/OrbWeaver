// The Message-style appearance section as the settings pane mounts it: the picker's selection and keyboard model, what a
// pick saves, the schematic geometry of every chat style's diagram against its production skin, and the readability of
// the picker's text and artwork in every shipped palette. Production runs through the registered section on a corpus root.
// @subject packages/client/src/features/chat/components/appearance-message-style-section.tsx
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { AA_NON_TEXT_RATIO, AA_NORMAL_RATIO } from "@orb/kit/theme-derivation";
import { pixelContrast } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { APPEARANCE_MESSAGE_STYLE_KEYS, APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-style-model.ts";
import { CHAT_STYLE_ITEMS } from "#client/features/chat/lib/appearance-select-items.ts";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import { DATA_THEME_ATTR } from "#client/state/appearance-boot-hint.ts";
import type { AppearanceChatStylePickerStory } from "./_appearance-chat-style-picker-stories.tsx";

const STORY = "tests/client/features/chat/components/_appearance-chat-style-picker-stories/AppearanceChatStylePickerStory";
const DESKTOP_WIDTH = 960;
const PHONE_WIDTH = 390;
const NARROW_WIDTH = 360;
const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const PHONE_VIEWPORT = { width: PHONE_WIDTH, height: 844 } as const;
const SPEAKERS = [
  { role: "user", kind: "persona" },
  { role: "assistant", kind: "character" },
] as const;

// The WebKit project's phone descriptor is narrower than the desktop container, so each case states its own viewport.
test.use({ isMobile: false, hasTouch: false, viewport: DESKTOP_VIEWPORT });

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The section's own settings as a fresh account has them, served from the corpus root's real settings verbs. */
async function serveSection(page: Page): Promise<Awaited<ReturnType<typeof root.internalCallerFor>>> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.updateUserSettingsSection"]));
  return caller;
}

function optionFor(style: ThemeChatStyle): { readonly label: string; readonly description: string } {
  const option = CHAT_STYLE_ITEMS.find((item) => item.value === style);
  if (option?.description === undefined) {
    throw new Error(`chat style ${style} has no label and gloss in the picker's items`);
  }
  return { label: option.label, description: option.description };
}

function settingLabel(id: string): string {
  const setting = APPEARANCE_MESSAGE_STYLE_SUBCATEGORY.settings.find((row) => row.id === id);
  if (setting === undefined) {
    throw new Error(`the message-style section declares no setting ${id}`);
  }
  return setting.label;
}

function cellsOf(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("radiogroup");
}

test("every chat style is one radio with its label, its gloss and a decorative diagram, and exactly the saved style is checked", async ({ mount, page }) => {
  await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });

  await expect(page.getByRole("heading", { name: APPEARANCE_MESSAGE_STYLE_SUBCATEGORY.label })).toBeVisible();
  const cards = cellsOf(page);
  await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);
  await expect(cards.locator('[data-slot="chat-style-diagram"]')).toHaveCount(THEME_CHAT_STYLES.length);
  await expect(cards.getByRole("img")).toHaveCount(0);
  for (const diagram of await cards.locator('[data-slot="chat-style-diagram"]').all()) {
    await expect(diagram).toBeVisible();
    await expect(diagram).toHaveAttribute("aria-hidden", "true");
    await expect(diagram).toHaveAttribute("focusable", "false");
  }

  for (const style of THEME_CHAT_STYLES) {
    const { label, description } = optionFor(style);
    const cell = cards.getByRole("radio", { name: label, exact: true });
    await expect(cell.getByText(description, { exact: true })).toBeVisible();
    await expect(cell).toHaveAccessibleDescription(description);
    await expect(cell).toHaveAttribute("aria-checked", String(style === DEFAULT_APPEARANCE_SETTINGS.chatStyle));
  }
  await expect(cards.locator('[aria-checked="true"]')).toHaveCount(1);
});

test("a pick moves the checked cell and saves only the section's own keys, so a sibling written meanwhile survives", async ({ mount, page }) => {
  const caller = await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
  const cards = cellsOf(page);
  await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

  // A sibling section's key is written after this section loaded: a patch carrying the whole appearance blob would undo it.
  expect(APPEARANCE_MESSAGE_STYLE_KEYS).not.toContain("showTimestamps");
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { showTimestamps: !DEFAULT_APPEARANCE_SETTINGS.showTimestamps } });

  const picked = THEME_CHAT_STYLES.find((style) => style !== DEFAULT_APPEARANCE_SETTINGS.chatStyle);
  if (picked === undefined) {
    throw new Error("the picker offers a single chat style");
  }
  await cards.getByRole("radio", { name: optionFor(picked).label, exact: true }).click();
  await expect(cards.getByRole("radio", { name: optionFor(picked).label, exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(cards.locator('[aria-checked="true"]')).toHaveCount(1);

  await expect.poll(async () => (await caller.settings.getUserSettings()).config.appearance.chatStyle).toBe(picked);
  const saved = (await caller.settings.getUserSettings()).config.appearance;
  expect(saved.showTimestamps).toBe(!DEFAULT_APPEARANCE_SETTINGS.showTimestamps);
});

test("the section's two switches save their own keys and leave the picked style alone", async ({ mount, page }) => {
  const caller = await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
  await expect(cellsOf(page).getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

  const autoFix = page.getByRole("switch", { name: settingLabel("auto-fix-markdown") });
  const quoted = page.getByRole("switch", { name: settingLabel("color-quoted-speech") });
  await autoFix.click();
  await quoted.click();

  await expect
    .poll(async () => {
      const { autoFixMarkdown, colorQuotedSpeech } = (await caller.settings.getUserSettings()).config.appearance;
      return { autoFixMarkdown, colorQuotedSpeech };
    })
    .toEqual({ autoFixMarkdown: !DEFAULT_APPEARANCE_SETTINGS.autoFixMarkdown, colorQuotedSpeech: !DEFAULT_APPEARANCE_SETTINGS.colorQuotedSpeech });
  expect((await caller.settings.getUserSettings()).config.appearance.chatStyle).toBe(DEFAULT_APPEARANCE_SETTINGS.chatStyle);
});

test("the picker is one tab stop on the checked cell and the arrow keys move the selection", async ({ mount, page }) => {
  await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
  const cards = cellsOf(page);
  const order = THEME_CHAT_STYLES.map((style) => cards.getByRole("radio", { name: optionFor(style).label, exact: true }));
  const checked = THEME_CHAT_STYLES.indexOf(DEFAULT_APPEARANCE_SETTINGS.chatStyle);
  const next = order[checked + 1];
  const current = order[checked];
  if (next === undefined || current === undefined) {
    throw new Error("the default chat style has no successor in the picker");
  }

  await current.focus();
  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute("tabindex", "0");
  await expect(next).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(next).toHaveAttribute("aria-checked", "true");
  await expect(current).toHaveAttribute("aria-checked", "false");
});

interface SpeakerAnatomy {
  readonly role: string;
  readonly avatars: number;
  readonly bubbles: number;
  readonly stripes: number;
  readonly portrait: "welded" | "left" | "right" | null;
  readonly banner: boolean;
}

interface Anatomy {
  readonly headerPlacement: string;
  readonly headers: number;
  readonly trains: number;
  readonly speakers: readonly SpeakerAnatomy[];
}

function bubblesFor(box: string, layout: string, stripe: boolean): number {
  if (box !== "bubble" || stripe) {
    return 0;
  }
  return layout === "trains" ? 2 : 1;
}

/** What a style's diagram must draw, read off its production skin and the decoration its art slot paints. */
function anatomyOf(style: ThemeChatStyle): Anatomy {
  const skin = MESSAGE_ROW_SKINS[style];
  return {
    headerPlacement: skin.headerPlacement,
    headers: skin.actionsRow.identity ? SPEAKERS.length : 0,
    trains: skin.bubbleLayout === "trains" ? SPEAKERS.length : 0,
    speakers: SPEAKERS.map(({ role, kind }) => {
      const decoration = skin.bubbleDecoration?.({ kind, avatarHash: null, name: "Speaker", hueSeed: "speaker", role, showInChatAvatars: true }) ?? null;
      const stripe = decoration?.treatment === "stripeStart";
      const treatment = skin.avatarTreatment(kind);
      return {
        role,
        avatars: treatment === "icon-left" ? 1 : 0,
        bubbles: bubblesFor(skin.box, skin.bubbleLayout, stripe),
        stripes: stripe ? 1 : 0,
        portrait: treatment === "sticky-portrait" ? "welded" : (decoration?.art?.side ?? null),
        // The diagram draws the banner on the character's row alone, where the skeleton needs one.
        banner: role === "assistant" && decoration?.headerBand !== undefined,
      };
    }),
  };
}

// The three readers below run inside the page: each is self-contained and takes its inputs as arguments.

function readCounts(
  svg: SVGSVGElement,
  roles: readonly string[],
): { readonly headers: number; readonly trains: number; readonly prose: number; readonly speakers: readonly object[] } {
  const count = (scope: Element, slot: string): number => scope.querySelectorAll(`[data-slot="${slot}"]`).length;
  return {
    headers: count(svg, "chat-style-header"),
    trains: count(svg, "chat-style-train"),
    prose: count(svg, "chat-style-prose"),
    speakers: roles.map((role) => {
      const message = svg.querySelector(`[data-role="${role}"]`) ?? svg;
      return {
        role,
        avatars: count(message, "chat-style-avatar"),
        bubbles: count(message, "chat-style-bubble"),
        stripes: count(message, "chat-style-stripe"),
        portraits: count(message, "chat-style-portrait"),
        banners: count(message, "chat-style-banner"),
      };
    }),
  };
}

function readContained(svg: SVGSVGElement): boolean {
  const view = svg.viewBox.baseVal;
  return [...svg.querySelectorAll("rect,circle,path")].every((element) => {
    if (!(element instanceof SVGGraphicsElement)) {
      return false;
    }
    const rect = element.getBBox();
    const computed = getComputedStyle(element);
    const stroke = computed.stroke === "none" ? 0 : Number.parseFloat(computed.strokeWidth) / 2;
    const insideX = rect.x - stroke >= view.x && rect.x + rect.width + stroke <= view.x + view.width;
    const insideY = rect.y - stroke >= view.y && rect.y + rect.height + stroke <= view.y + view.height;
    return rect.width > 0 && rect.height > 0 && insideX && insideY;
  });
}

function readFrames(
  svg: SVGSVGElement,
  roles: readonly string[],
): readonly {
  readonly portraitSide: string | null;
  readonly portraitSpansBubble: boolean | null;
  readonly proseInside: boolean;
  readonly headerBeforeBody: boolean | null;
}[] {
  const box = (scope: Element, slot: string): DOMRect | undefined => {
    const element = scope.querySelector(`[data-slot="${slot}"]`);
    return element instanceof SVGGraphicsElement ? element.getBBox() : undefined;
  };
  const sideOf = (portrait: DOMRect | undefined, bubble: DOMRect | undefined): string | null => {
    if (portrait === undefined || bubble === undefined) {
      return null;
    }
    if (portrait.x === bubble.x) {
      return "left";
    }
    return portrait.x + portrait.width === bubble.x + bubble.width ? "right" : "loose";
  };
  const within = (inner: DOMRect, outer: DOMRect | undefined): boolean =>
    outer === undefined ||
    (inner.x >= outer.x && inner.x + inner.width <= outer.x + outer.width && inner.y >= outer.y && inner.y + inner.height <= outer.y + outer.height);
  return roles.map((role) => {
    const message = svg.querySelector(`[data-role="${role}"]`) ?? svg;
    const bubble = box(message, "chat-style-bubble");
    const portrait = box(message, "chat-style-portrait");
    const header = box(message, "chat-style-header");
    const banner = box(message, "chat-style-banner");
    const prose = box(message, "chat-style-prose");
    const train = box(message, "chat-style-train");
    const aboveBubble = header !== undefined && bubble !== undefined && header.y + header.height <= bubble.y;
    const belowBanner = header !== undefined && banner !== undefined && header.y >= banner.y + banner.height;
    return {
      portraitSide: sideOf(portrait, bubble),
      portraitSpansBubble: portrait !== undefined && bubble !== undefined ? portrait.y === bubble.y && portrait.height === bubble.height : null,
      // Prose sits inside its bubble and its train, so no row of text hangs off its box.
      proseInside: prose !== undefined && within(prose, bubble) && within(prose, train),
      headerBeforeBody: header === undefined ? null : aboveBubble || belowBanner,
    };
  });
}

for (const style of THEME_CHAT_STYLES) {
  test(`the ${style} diagram draws its skin's anatomy inside its frame`, async ({ mount, page }) => {
    await serveSection(page);
    await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
    const diagram = page.locator(`[data-chat-style="${style}"] [data-slot="chat-style-diagram"]`);
    await expect(diagram).toBeVisible();
    const expected = anatomyOf(style);
    await expect(diagram).toHaveAttribute("data-header-placement", expected.headerPlacement);
    await expect(diagram.locator('[data-slot="chat-style-diagram-message"]')).toHaveCount(SPEAKERS.length);

    const roles = SPEAKERS.map(({ role }) => role);
    const counts = await diagram.evaluate(readCounts, roles);
    const frames = await diagram.evaluate(readFrames, roles);
    expect(await diagram.evaluate(readContained)).toBe(true);
    expect(counts.headers).toBe(expected.headers);
    expect(counts.trains).toBe(expected.trains);
    // Positive control: every speaker has prose, so the per-row reads below are of a populated diagram.
    expect(counts.prose).toBeGreaterThanOrEqual(SPEAKERS.length);
    expect(counts.speakers).toEqual(
      expected.speakers.map((want) => ({
        role: want.role,
        avatars: want.avatars,
        bubbles: want.bubbles,
        stripes: want.stripes,
        portraits: want.portrait === null ? 0 : 1,
        banners: want.banner ? 1 : 0,
      })),
    );
    for (const [index, want] of expected.speakers.entries()) {
      const got = frames[index];
      expect(got?.proseInside).toBe(true);
      expect(got?.portraitSpansBubble).toBe(want.portrait === null ? null : true);
      expect(want.portrait === "welded" ? ["left", "right"] : [want.portrait]).toContain(got?.portraitSide);
      const ordered = want.banner || expected.headerPlacement === "outside";
      expect(!ordered || got?.headerBeforeBody === true).toBe(true);
    }
  });
}

for (const [width, viewport, label] of [
  [DESKTOP_WIDTH, DESKTOP_VIEWPORT, "desktop"],
  [PHONE_WIDTH, PHONE_VIEWPORT, "phone"],
] as const) {
  test(`at ${label} width every picker aperture frames its diagram at the diagram's own aspect and nothing overflows`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    await serveSection(page);
    await mount<typeof AppearanceChatStylePickerStory>(STORY, { width });
    const cards = cellsOf(page);
    await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

    await expect
      .poll(() =>
        cards.locator('[data-slot="picker-cell-art"]').evaluateAll((apertures) =>
          apertures.map((aperture) => {
            const frame = aperture.getBoundingClientRect();
            const svg = aperture.querySelector('[data-slot="chat-style-diagram"]');
            const view = svg instanceof SVGSVGElement ? svg.viewBox.baseVal : undefined;
            const picture = svg?.getBoundingClientRect();
            const aspect = view === undefined || view.width === 0 ? Number.NaN : view.height / view.width;
            return (
              frame.width > 0 &&
              picture !== undefined &&
              Math.round(frame.height) === Math.round(frame.width * aspect) &&
              picture.width === frame.width &&
              picture.height === frame.height
            );
          }),
        ),
      )
      .toEqual(THEME_CHAT_STYLES.map(() => true));
    await expect.poll(() => page.locator("body").evaluate((body) => body.scrollWidth > body.clientWidth)).toBe(false);
  });
}

test("the picker lays out in more columns on a desktop than on a phone", async ({ mount, page }) => {
  await serveSection(page);
  const columns = async (width: number, viewport: { readonly width: number; readonly height: number }): Promise<number> => {
    await page.setViewportSize(viewport);
    await mount<typeof AppearanceChatStylePickerStory>(STORY, { width });
    const cards = cellsOf(page);
    await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);
    return await cards.evaluate((group) => getComputedStyle(group).gridTemplateColumns.split(" ").length);
  };
  const narrow = await columns(NARROW_WIDTH, PHONE_VIEWPORT);
  const desktop = await columns(DESKTOP_WIDTH, DESKTOP_VIEWPORT);
  expect(narrow).toBeGreaterThanOrEqual(1);
  expect(desktop).toBeGreaterThan(narrow);
});

const PALETTES: readonly (string | null)[] = [null, ...Object.keys(SEED_THEME_VALUE_SETS)];

for (const palette of PALETTES) {
  test(`in the ${palette ?? "base"} palette every label and gloss reads at AA and every diagram holds its non-text floor`, async ({ mount, page }) => {
    await serveSection(page);
    await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
    await page.evaluate(
      ([attribute, name]) => (name === null ? document.documentElement.removeAttribute(attribute) : document.documentElement.setAttribute(attribute, name)),
      [DATA_THEME_ATTR, palette] as const,
    );
    const cards = cellsOf(page);
    await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

    const measure = async (target: Locator): Promise<Awaited<ReturnType<typeof pixelContrast>>> => {
      await target.scrollIntoViewIfNeeded();
      return await pixelContrast(page, target);
    };
    for (const style of THEME_CHAT_STYLES) {
      const { label, description } = optionFor(style);
      const cell = cards.getByRole("radio", { name: label, exact: true });
      const name = await measure(cell.getByText(label, { exact: true }));
      expect(name.ratio, `${style} label: ${name.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      const gloss = await measure(cell.getByText(description, { exact: true }));
      expect(gloss.ratio, `${style} gloss: ${gloss.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      const ink = await measure(cell.locator('[data-slot="chat-style-preview"]'));
      expect(ink.ratio, `${style} diagram: ${ink.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
