// Every chat style's message row skin as the room renders it, with and without a wallpaper: the track and alignment,
// the box each style gives its prose, the corners its art and welded portrait take, the plate over art, the action
// reveal and the pinned header bar. Each expected value comes from the style's skin row and the resolved design tokens.
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { RowSkin } from "#client/features/chat/lib/message-row-variants.ts";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const VIEWPORT = { width: 1440, height: 900 } as const;
// Enough of a room's last messages that an earlier row of each role is on screen.
const TAIL_MESSAGES = 6;
const ROLES = ["user", "assistant"] as const satisfies readonly MessageRole[];
// Paragraphs enough that one reply runs past the scrollport, so its header pins.
const LONG_REPLY_PARAGRAPHS = 40;
// How far into the long reply the transcript scrolls, past its header and well inside its body.
const PIN_SCROLL_PX = 400;
// The room the corpus ends on a reply in is a game room, which reads its game too.
const GAME_PROCEDURES = ["rpg.getGame", "rpg.listTurnToolCalls"] as const;
const ROW = '[data-slot="message-row"]';
const BUBBLE = '[data-slot="message-bubble"]';
const TRANSPARENT = "rgba(0, 0, 0, 0)";
// The prose that runs long; any reply text serves.
const FILLER = "The lamp burned low while the rain kept time on the shutters.";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Role = (typeof ROLES)[number];

let root: Root;
let roomId: ChatId;
let longReplyId: string;

test.use({ viewport: VIEWPORT });

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: row.id, limit: TAIL_MESSAGES });
    const replies = messages.filter((message) => message.role === "assistant");
    const spoken = new Set(messages.map((message) => message.role));
    const earlier = replies.at(-2);
    if (ROLES.every((role) => spoken.has(role)) && messages.at(-1)?.role === "assistant" && earlier !== undefined) {
      roomId = row.id;
      longReplyId = earlier.id;
      const content = Array.from({ length: LONG_REPLY_PARAGRAPHS }, () => FILLER).join("\n\n");
      await caller.chat.editMessage({ chatId: row.id, messageId: earlier.id, content, timeZone: UTC_TIME_ZONE });
      return;
    }
  }
  throw new Error("No corpus room ends on a reply with an earlier reply and both roles in its tail");
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The corpus viewer's first saved wallpaper, as the appearance fields that select it. */
function wallpaper(corpus: CorpusWire): Partial<AppearanceSettings> {
  const entry = corpus.reads["settings.getUserSettings"][0]?.output.config.appearance.backgroundLibrary[0];
  if (entry === undefined) {
    throw new Error("The corpus viewer has no saved wallpaper");
  }
  return { backgroundImageKind: "asset", backgroundAssetId: entry.assetId, backgroundAssetHash: entry.assetHash, backgroundAssetMime: entry.mime };
}

/** Open the room in `chatStyle`, over a wallpaper or not, at the glow elevation, which lifts every card that follows it. */
async function openRoom(page: Page, corpus: CorpusWire, chatStyle: ThemeChatStyle, art: boolean): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({
    section: "appearance",
    patch: {
      chatStyle,
      elevation: "glow",
      blurSurfaces: [],
      showInChatAvatars: true,
      messageActions: "hover",
      ...(art ? wallpaper(corpus) : { backgroundImageKind: "none" }),
    },
  });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...GAME_PROCEDURES]),
  });
}

function computed(locator: Locator, property: string, pseudo: string | null = null): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo] as const);
}

/** A colour token as `box`'s own scope paints it, read off a probe beside it, so a carried palette resolves alike. */
function tokenColor(box: Locator, token: string, property: "background-color" | "color"): Promise<string> {
  return box.evaluate(
    (element, [name, prop]) => {
      const probe = element.ownerDocument.createElement("div");
      probe.style.setProperty(prop, `var(${name})`);
      element.parentElement?.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [token, property] as const,
  );
}

const CORNERS = ["start-start", "start-end", "end-end", "end-start"] as const;

function corners(box: Locator): Promise<readonly number[]> {
  return Promise.all(CORNERS.map(async (corner) => Number.parseFloat(await computed(box, `border-${corner}-radius`))));
}

function px(value: string): number {
  return Number.parseFloat(value);
}

interface Box {
  readonly fill: string;
  readonly corners: readonly number[];
  readonly shadow: string;
  readonly blurred: boolean;
  /** Inline start, inline end, block start, block end. */
  readonly inset: readonly [number, number, number, number];
  readonly ink: string | null;
}

async function measureBox(box: Locator, inked: boolean): Promise<Box> {
  return {
    fill: await computed(box, "background-color"),
    corners: await corners(box),
    shadow: await computed(box, "box-shadow"),
    blurred: (await computed(box, "backdrop-filter")).includes("blur("),
    inset: [
      px(await computed(box, "padding-inline-start")),
      px(await computed(box, "padding-inline-end")),
      px(await computed(box, "padding-block-start")),
      px(await computed(box, "padding-block-end")),
    ],
    ink: inked ? await computed(box, "color") : null,
  };
}

/** The art slot the skin's decorator draws for a speaker of `kind`, the production decorator's own answer. */
function decorationFor(skin: RowSkin, kind: string | null, role: Role): ReturnType<NonNullable<RowSkin["bubbleDecoration"]>> {
  const speaker = kind === "persona" || kind === "character" ? kind : null;
  return skin.bubbleDecoration?.({ kind: speaker, avatarHash: null, name: "Speaker", hueSeed: "speaker", role, showInChatAvatars: true }) ?? null;
}

/** A bubble skin's box: the role's fill at the card radius with no shadow, inset unless its art takes the inset. */
async function expectedBubble(page: Page, box: Locator, skin: RowSkin, row: { readonly role: Role; readonly kind: string | null }): Promise<Box> {
  const { role, kind } = row;
  const card = await resolvedLength(page, "var(--radius-card)");
  // Whisper's band and ripple's welded portrait hand the inset to the stack beside them.
  const decoration = decorationFor(skin, kind, role);
  const handed = decoration?.headerBand !== undefined || skin.avatarTreatment(kind === null ? null : "character") === "sticky-portrait";
  const block = await resolvedLength(page, "var(--spacing-block)");
  const rowStep = await resolvedLength(page, "var(--spacing-row)");
  // Echo's art side is inset by its art pane, so the prose clears the tile.
  const pane = decoration?.art === undefined ? null : ((await box.locator('[data-slot="message-echo-art"]').boundingBox())?.width ?? Number.NaN);
  const start = pane !== null && decoration?.art?.side === "left" ? pane : block;
  const end = pane !== null && decoration?.art?.side === "right" ? pane : block;
  return {
    fill: await tokenColor(box, role === "user" ? "--color-user-bubble" : "--color-ai-bubble", "background-color"),
    corners: [card, card, card, card],
    shadow: "none",
    blurred: false,
    inset: handed ? [0, 0, 0, 0] : [start, end, rowStep, rowStep],
    ink: null,
  };
}

/** What the skin row says this role's box paints. */
async function expectedBox(
  page: Page,
  box: Locator,
  facts: { readonly skin: RowSkin; readonly role: Role; readonly kind: string | null; readonly art: boolean },
): Promise<Box> {
  const { skin, role, kind, art } = facts;
  if (skin.box === "bubble") {
    return expectedBubble(page, box, skin, { role, kind });
  }
  const rowStep = await resolvedLength(page, "var(--spacing-row)");
  const isPage = skin.box === "page";
  return {
    fill: art ? await tokenColor(box, "--color-reading-plate", "background-color") : TRANSPARENT,
    corners: [0, 0, 0, 0],
    shadow: "none",
    blurred: art,
    inset: isPage
      ? [await resolvedLength(page, "var(--spacing-gutter)"), await resolvedLength(page, "var(--spacing-gutter)"), rowStep, 0]
      : [await resolvedLength(page, "var(--spacing-section)"), await resolvedLength(page, "var(--spacing-section)"), rowStep, rowStep],
    ink: isPage || art ? await tokenColor(box, "--color-prose-body", "color") : await tokenColor(box, "--color-foreground", "color"),
  };
}

/** The corners of the art the skin draws in its box (echo's tile, whisper's band, ripple's portrait), else null. */
async function measureArt(box: Locator): Promise<readonly number[] | null> {
  const art = box.locator('[data-slot="message-echo-art"], [data-slot="message-band"], [data-slot="avatar-root"]').first();
  return (await art.count()) === 0 ? null : corners(art);
}

async function expectedArt(page: Page, skin: RowSkin, kind: string | null, role: Role): Promise<readonly number[] | null> {
  const card = await resolvedLength(page, "var(--radius-card)");
  const decoration = decorationFor(skin, kind, role);
  if (decoration?.art !== undefined) {
    return decoration.art.side === "left" ? [card, 0, 0, 0] : [0, card, 0, 0];
  }
  if (decoration?.headerBand !== undefined) {
    return [card, card, 0, 0];
  }
  if (skin.avatarTreatment(kind === null ? null : "character") === "sticky-portrait") {
    return role === "user" && skin.mirrorUser ? [0, card, card, 0] : [card, 0, 0, card];
  }
  return null;
}

const ALIGN: Record<"start" | "center" | "end", string> = { start: "flex-start", center: "center", end: "flex-end" };

function expectedAlign(skin: RowSkin, role: Role): string {
  if (skin.rowAlign === "role") {
    return role === "user" ? ALIGN.end : ALIGN.start;
  }
  return ALIGN[skin.rowAlign];
}

function expectedTrack(page: Page, skin: RowSkin): Promise<number> {
  return resolvedLength(page, skin.track === "echo" ? "calc(var(--width-shell-content) + var(--immersive-echo-art-width))" : "var(--width-shell-content)");
}

/** The row's placement and box for one role, measured and expected. */
async function rowFacts(page: Page, skin: RowSkin, role: Role, art: boolean): Promise<{ readonly measured: object; readonly expected: object }> {
  const row = page.locator(`${ROW}[data-role="${role}"]`).first();
  const box = row.locator(BUBBLE).first();
  const kind = await row.getAttribute("data-kind");
  const inked = skin.box !== "bubble";
  return {
    measured: {
      align: await computed(row, "align-items"),
      track: px(await computed(row, "max-inline-size")),
      body: await computed(row.locator('[data-slot="message-row-body"]'), "display"),
      box: await measureBox(box, inked),
      art: await measureArt(box),
    },
    expected: {
      align: expectedAlign(skin, role),
      track: await expectedTrack(page, skin),
      body: skin.columnPlacement === "gutterCentred" ? "grid" : "flex",
      box: await expectedBox(page, box, { skin, role, kind, art }),
      art: await expectedArt(page, skin, kind, role),
    },
  };
}

/** An earlier reply's action cluster at rest (pointer away) and while its row is hovered, and the chip it paints. */
async function revealFacts(page: Page, skin: RowSkin): Promise<{ readonly measured: object; readonly expected: object }> {
  const row = page.locator(`${ROW}[data-message-id="${longReplyId}"]`);
  const actions = row.locator('[data-slot="message-actions-row"]');
  await page.mouse.move(0, 0);
  const rest = { opacity: await computed(actions, "opacity"), pointer: await computed(actions, "pointer-events") };
  await row
    .locator(BUBBLE)
    .first()
    .hover({ position: { x: 4, y: 4 } });
  await expect.poll(() => computed(actions, "opacity")).toBe("1");
  const card = await resolvedLength(page, "var(--radius-card)");
  return {
    measured: {
      rest,
      hovered: await computed(actions, "pointer-events"),
      chip: { fill: await computed(actions, "background-color"), corners: await corners(actions) },
    },
    expected: {
      rest: { opacity: "0", pointer: "none" },
      hovered: "auto",
      chip: skin.actionsRow.chip
        ? { fill: await tokenColor(actions, "--color-reading-band", "background-color"), corners: [card, card, card, card] }
        : { fill: TRANSPARENT, corners: [0, 0, 0, 0] },
    },
  };
}

// The token each pinned fill paints; the long reply is the assistant's.
const PINNED_FILL = { role: "--color-ai-bubble", band: "--color-reading-band" } as const;

/** The long reply's header once the transcript scrolls into its body. */
async function pinFacts(page: Page, skin: RowSkin): Promise<{ readonly measured: object; readonly expected: object }> {
  const row = page.locator(`${ROW}[data-message-id="${longReplyId}"]`);
  const header = row.locator('[data-slot="message-name-row"]');
  const sticky = skin.actionsRow.identity;
  await expect.poll(() => header.getAttribute("data-sticky")).toBe(sticky ? "" : null);
  await row.evaluate((element, by) => {
    const scroller = element.closest('[data-slot="message-list-scroll"]');
    if (scroller !== null) {
      scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + by;
    }
  }, PIN_SCROLL_PX);
  await expect.poll(() => header.getAttribute("data-pinned")).toBe(sticky ? "" : null);
  const card = await resolvedLength(page, "var(--radius-card)");
  const fill = skin.pinnedHeader.fill;
  const top = skin.pinnedHeader.corners === "top" ? [card, card, 0, 0] : [card, card, card, card];
  return {
    measured: {
      pinned: (await header.getAttribute("data-pinned")) !== null,
      fill: await computed(header, "background-color"),
      corners: await corners(header),
      fade: (await computed(header, "background-image", "::after")).includes("gradient"),
    },
    expected: {
      pinned: sticky,
      fill: sticky && fill !== "none" ? await tokenColor(header, PINNED_FILL[fill], "background-color") : TRANSPARENT,
      corners: skin.pinnedHeader.corners === undefined || !sticky ? [0, 0, 0, 0] : top,
      fade: sticky && fill !== "none",
    },
  };
}

/** The last reply's swipe foot: its fill, the card corners it follows and its inline inset. */
async function footFacts(page: Page, skin: RowSkin, art: boolean): Promise<{ readonly measured: object; readonly expected: object }> {
  const foot = page.locator(`${ROW}[data-role="assistant"]`).last().locator('[data-slot="swipe-strip"]');
  await expect(foot).toBeVisible();
  const card = await resolvedLength(page, "var(--radius-card)");
  const edge = skin.swipeFoot.edge;
  const plated = edge === "plate" && art;
  const fill = edge === "card" ? await tokenColor(foot, "--color-ai-bubble", "background-color") : TRANSPARENT;
  return {
    measured: { fill: await computed(foot, "background-color"), corners: await corners(foot), inset: px(await computed(foot, "padding-inline-start")) },
    expected: {
      fill: plated ? await tokenColor(foot, "--color-card", "background-color") : fill,
      corners: FOOT_CORNERS[edge](card, art),
      inset: edge === "inset" ? 0 : await resolvedLength(page, edge === "card" ? "var(--spacing-block)" : "var(--spacing-field)"),
    },
  };
}

// The corners each foot edge follows: echo's card bottom, the pager plate's island over art, or none.
const FOOT_CORNERS: Record<RowSkin["swipeFoot"]["edge"], (card: number, art: boolean) => readonly number[]> = {
  inset: () => [0, 0, 0, 0],
  card: (card) => [0, 0, card, card],
  plate: (card, art) => (art ? [card, card, card, card] : [0, 0, 0, 0]),
};

/** Every measured fact of one style's room against what its skin row says. */
async function skinFacts(page: Page, skin: RowSkin, art: boolean): Promise<{ readonly measured: object; readonly expected: object }> {
  for (const role of ROLES) {
    await expect(page.locator(`${ROW}[data-role="${role}"] ${BUBBLE}`).first()).toBeVisible();
  }
  const rows = await Promise.all(ROLES.map(async (role) => rowFacts(page, skin, role, art)));
  const foot = await footFacts(page, skin, art);
  const reveal = await revealFacts(page, skin);
  const pin = await pinFacts(page, skin);
  return {
    measured: { rows: rows.map((row) => row.measured), foot: foot.measured, reveal: reveal.measured, pin: pin.measured },
    expected: { rows: rows.map((row) => row.expected), foot: foot.expected, reveal: reveal.expected, pin: pin.expected },
  };
}

function roomStoryProps(): { readonly chatId: ChatId } {
  return { chatId: roomId };
}

for (const chatStyle of THEME_CHAT_STYLES) {
  for (const art of [false, true]) {
    test(`${chatStyle} ${art ? "over a wallpaper" : "on a plain room"} paints its skin row`, async ({ corpus, mount, page }) => {
      await openRoom(page, corpus, chatStyle, art);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      await expect.poll(() => page.locator(".shell-grid").getAttribute("data-has-bg-image")).toBe(art ? "true" : null);
      const facts = await skinFacts(page, MESSAGE_ROW_SKINS[chatStyle], art);
      expect(facts.measured).toEqual(facts.expected);
    });
  }
}

// Owner CSS that restyles how an art hook's image fills its box: none of these is the art slot's own value.
const OWNER_FIT = { "background-size": "10px 10px", "background-position": "0% 0%", "background-repeat": "repeat" } as const;
const OWNER_FIT_HOOKS = { echo: "message-echo-art", whisper: "message-band" } as const satisfies Partial<Record<ThemeChatStyle, string>>;

/** Select a custom theme named `name` carrying `css` for the owner, run `body`, then restore the owner's own selection. */
async function withOwnerCss(name: string, css: string, body: () => Promise<void>): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const before = (await caller.settings.getUserSettings()).config.theme.selectedThemeId;
  const theme = await caller.settings.createTheme({ name, override: {}, css });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: theme.id } });
  try {
    await body();
  } finally {
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: before } });
  }
}

/** The fill properties owner CSS sets, as `hook`'s first element computes them. */
async function paintedFit(page: Page, hook: string): Promise<Record<string, string>> {
  const art = page.locator(`[data-slot="${hook}"]`).first();
  await expect(art).toBeAttached();
  return Object.fromEntries(await Promise.all(Object.keys(OWNER_FIT).map(async (property) => [property, await computed(art, property)] as const)));
}

function ownerFitCss(hook: string): string {
  const declarations = Object.entries(OWNER_FIT).map(([property, value]) => `${property}: ${value};`);
  return `[data-slot="${hook}"] { ${declarations.join(" ")} }`;
}

for (const [chatStyle, hook] of Object.entries(OWNER_FIT_HOOKS) as [ThemeChatStyle, string][]) {
  test(`owner CSS on the ${hook} hook decides how the ${chatStyle} art fills its box`, async ({ corpus, mount, page }) => {
    let painted: Record<string, string> = {};
    await withOwnerCss(`Owner CSS on ${hook}`, ownerFitCss(hook), async () => {
      await openRoom(page, corpus, chatStyle, false);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      painted = await paintedFit(page, hook);
    });
    expect(painted).toEqual(OWNER_FIT);
  });
}

/** Hide the room's first tail reply from the model, run `body` on its id, then show it again. */
async function withHiddenReply(body: (messageId: string) => Promise<void>): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const reply = (await caller.chat.listMessages({ chatId: roomId, limit: TAIL_MESSAGES })).messages.find((message) => message.role === "assistant");
  if (reply === undefined) {
    throw new Error("The room's tail holds no reply");
  }
  await caller.chat.setMessageHidden({ chatId: roomId, messageId: reply.id, hidden: true });
  try {
    await body(reply.id);
  } finally {
    await caller.chat.setMessageHidden({ chatId: roomId, messageId: reply.id, hidden: false });
  }
}

test("a message hidden from the model recedes to the receded step", async ({ corpus, mount, page }) => {
  let opacity = Number.NaN;
  await withHiddenReply(async (messageId) => {
    await openRoom(page, corpus, "bubble", false);
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const box = page.locator(`${ROW}[data-message-id="${messageId}"] ${BUBBLE}`).first();
    await expect(box).toBeVisible();
    opacity = Number(await computed(box, "opacity"));
  });
  expect(opacity).toBe(Number.parseFloat(TOKENS["opacity.receded"].value) / 100);
});
