// The Message-style appearance section as the settings pane mounts it: the picker's selection and keyboard model, what a
// pick saves, the schematic geometry of every chat style's diagram, and the readability of the picker's text and artwork
// in every shipped palette. Production runs through the registered section on a corpus root.
// @subject packages/client/src/features/chat/components/appearance-message-style-section.tsx
import { DATA_THEME_ATTR } from "@orb/client/state";
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
import type { AppearanceChatStylePickerStory } from "./_appearance-chat-style-picker-stories.tsx";

const STORY = "tests/client/features/chat/components/_appearance-chat-style-picker-stories/AppearanceChatStylePickerStory";
const DESKTOP_WIDTH = 960;
const PHONE_WIDTH = 390;
const NARROW_WIDTH = 360;
const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const PHONE_VIEWPORT = { width: PHONE_WIDTH, height: 844 } as const;
const ROLES = ["user", "assistant"] as const;
// Each cell names itself and its gloss through `aria-labelledby` and `aria-describedby` on these id suffixes.
const LABEL = '[id$="-label"]';
const GLOSS = '[id$="-description"]';

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

function pickerOf(page: Page): Locator {
  return page.getByRole("radiogroup");
}

/** The cell of `style`: the picker draws one cell per chat style, in the order of `THEME_CHAT_STYLES`. */
function cellOf(page: Page, style: ThemeChatStyle): Locator {
  return pickerOf(page).getByRole("radio").nth(THEME_CHAT_STYLES.indexOf(style));
}

test("every chat style is one named radio with a gloss and a decorative diagram, and exactly the saved style is checked", async ({ mount, page }) => {
  await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });

  await expect(page.getByRole("heading").first()).toBeVisible();
  const cards = pickerOf(page);
  await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);
  await expect(cards.locator('[data-slot="chat-style-diagram"]')).toHaveCount(THEME_CHAT_STYLES.length);
  await expect(cards.getByRole("img")).toHaveCount(0);
  for (const diagram of await cards.locator('[data-slot="chat-style-diagram"]').all()) {
    await expect(diagram).toBeVisible();
    await expect(diagram).toHaveAttribute("aria-hidden", "true");
    await expect(diagram).toHaveAttribute("focusable", "false");
  }

  const names: string[] = [];
  for (const style of THEME_CHAT_STYLES) {
    const cell = cellOf(page, style);
    const label = cell.locator(LABEL);
    const gloss = cell.locator(GLOSS);
    await expect(label).toBeVisible();
    await expect(gloss).toBeVisible();
    // The name is the visible label and the description is the visible gloss, never a second spelling of either.
    const name = (await label.textContent()) ?? "";
    await expect(cell).toHaveAccessibleName(name);
    await expect(cell).toHaveAccessibleDescription((await gloss.textContent()) ?? "");
    expect(name.trim()).not.toBe("");
    names.push(name);
    await expect(cell).toHaveAttribute("aria-checked", String(style === DEFAULT_APPEARANCE_SETTINGS.chatStyle));
  }
  expect(new Set(names).size).toBe(THEME_CHAT_STYLES.length);
  await expect(cards.locator('[aria-checked="true"]')).toHaveCount(1);
});

test("a pick moves the checked cell and saves only the section's own keys, so a sibling written meanwhile survives", async ({ mount, page }) => {
  const caller = await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
  const cards = pickerOf(page);
  await expect(cards.getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

  // A sibling section's key is written after this section loaded: a patch carrying the whole appearance blob would undo it.
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { showTimestamps: !DEFAULT_APPEARANCE_SETTINGS.showTimestamps } });

  const picked = THEME_CHAT_STYLES.find((style) => style !== DEFAULT_APPEARANCE_SETTINGS.chatStyle);
  if (picked === undefined) {
    throw new Error("the picker offers a single chat style");
  }
  await cellOf(page, picked).click();
  await expect(cellOf(page, picked)).toHaveAttribute("aria-checked", "true");
  await expect(cards.locator('[aria-checked="true"]')).toHaveCount(1);

  await expect.poll(async () => (await caller.settings.getUserSettings()).config.appearance.chatStyle).toBe(picked);
  const saved = (await caller.settings.getUserSettings()).config.appearance;
  expect(saved.showTimestamps).toBe(!DEFAULT_APPEARANCE_SETTINGS.showTimestamps);
});

test("the section's two switches save their own keys and leave the picked style alone", async ({ mount, page }) => {
  const caller = await serveSection(page);
  await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
  await expect(pickerOf(page).getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

  const switches = page.getByRole("switch");
  await expect(switches).toHaveCount(2);
  for (const control of await switches.all()) {
    await control.click();
  }

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
  await expect(pickerOf(page).getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);
  const checked = THEME_CHAT_STYLES.indexOf(DEFAULT_APPEARANCE_SETTINGS.chatStyle);
  const following = THEME_CHAT_STYLES[checked + 1];
  if (following === undefined) {
    throw new Error("the default chat style has no successor in the picker");
  }
  const current = cellOf(page, DEFAULT_APPEARANCE_SETTINGS.chatStyle);
  const next = cellOf(page, following);

  await current.focus();
  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute("tabindex", "0");
  await expect(next).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(next).toHaveAttribute("aria-checked", "true");
  await expect(current).toHaveAttribute("aria-checked", "false");
});

interface SpeakerAnatomy {
  readonly avatars: number;
  readonly bubbles: number;
  readonly stripes: number;
  /** A portrait flush on this edge of its bubble, or welded on whichever edge the speaker's side puts it. */
  readonly portrait: "welded" | "left" | "right" | null;
  readonly banner: boolean;
}

interface Anatomy {
  readonly headerPlacement: "inside" | "outside";
  readonly headers: number;
  readonly trains: number;
  readonly speakers: readonly [SpeakerAnatomy, SpeakerAnatomy];
}

const CHIP: SpeakerAnatomy = { avatars: 1, bubbles: 0, stripes: 0, portrait: null, banner: false };
const BUBBLED = { ...CHIP, bubbles: 1 };
const WELDED: SpeakerAnatomy = { ...BUBBLED, avatars: 0, portrait: "welded" };
const STRIPED = { ...CHIP, stripes: 1 };
const TRAINED = { ...CHIP, bubbles: 2 };
const UNMARKED = { ...CHIP, avatars: 0 };

// What each style's diagram draws for the user and the character, one row per style. The skin table that decides this
// anatomy in production is not behind a client door, so the expectation is spelled here; a new chat style fails `tsc`
// until it has a row, and the document row is also held to its production skin by the platform picker suite.
const ANATOMY: Record<ThemeChatStyle, Anatomy> = {
  bubble: { headerPlacement: "inside", headers: 2, trains: 0, speakers: [BUBBLED, BUBBLED] },
  flat: { headerPlacement: "inside", headers: 2, trains: 0, speakers: [CHIP, CHIP] },
  document: { headerPlacement: "inside", headers: 0, trains: 0, speakers: [UNMARKED, UNMARKED] },
  echo: {
    headerPlacement: "inside",
    headers: 2,
    trains: 0,
    speakers: [
      { ...BUBBLED, portrait: "left" },
      { ...BUBBLED, portrait: "right" },
    ],
  },
  whisper: { headerPlacement: "inside", headers: 2, trains: 0, speakers: [BUBBLED, { ...BUBBLED, banner: true }] },
  hush: { headerPlacement: "inside", headers: 2, trains: 0, speakers: [STRIPED, STRIPED] },
  ripple: { headerPlacement: "inside", headers: 2, trains: 0, speakers: [WELDED, WELDED] },
  tide: { headerPlacement: "outside", headers: 2, trains: 2, speakers: [TRAINED, TRAINED] },
};

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
  test(`the ${style} diagram draws its anatomy inside its frame`, async ({ mount, page }) => {
    await serveSection(page);
    await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: DESKTOP_WIDTH });
    const diagram = page.locator(`[data-chat-style="${style}"] [data-slot="chat-style-diagram"]`);
    await expect(diagram).toBeVisible();
    const expected = ANATOMY[style];
    await expect(diagram).toHaveAttribute("data-header-placement", expected.headerPlacement);
    await expect(diagram.locator('[data-slot="chat-style-diagram-message"]')).toHaveCount(ROLES.length);

    const counts = await diagram.evaluate(readCounts, ROLES);
    const frames = await diagram.evaluate(readFrames, ROLES);
    expect(await diagram.evaluate(readContained)).toBe(true);
    expect(counts.headers).toBe(expected.headers);
    expect(counts.trains).toBe(expected.trains);
    // Positive control: every speaker has prose, so the per-row reads below are of a populated diagram.
    expect(counts.prose).toBeGreaterThanOrEqual(ROLES.length);
    expect(counts.speakers).toEqual(
      expected.speakers.map((want) => ({
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
    const cards = pickerOf(page);
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
    const cards = pickerOf(page);
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
    await expect(pickerOf(page).getByRole("radio")).toHaveCount(THEME_CHAT_STYLES.length);

    const measure = async (target: Locator): Promise<Awaited<ReturnType<typeof pixelContrast>>> => {
      await target.scrollIntoViewIfNeeded();
      return await pixelContrast(page, target);
    };
    for (const style of THEME_CHAT_STYLES) {
      const cell = cellOf(page, style);
      const name = await measure(cell.locator(LABEL));
      expect(name.ratio, `${style} label: ${name.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      const gloss = await measure(cell.locator(GLOSS));
      expect(gloss.ratio, `${style} gloss: ${gloss.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      const ink = await measure(cell.locator('[data-slot="chat-style-preview"]'));
      expect(ink.ratio, `${style} diagram: ${ink.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
