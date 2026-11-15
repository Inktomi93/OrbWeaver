// A routed card's links through the real transcript (`MessageListSurface`) beside an app field, over a corpus room whose
// card-frame mint and serve the corpus root's own HTTP entry answers. A link counts only from a frame the focus gate
// admitted: a card whose script posts and then takes focus raises nothing off a click in the app. The confirm shows the
// address the URL parser serialized, host on its own line, and opens exactly that; an address with credentials, or a
// mail link that names an attachment, raises nothing. A confirm the pace raised later gives focus back to where the
// reader was.

import { expect, test } from "@orb/testkit/ct-corpus";
import type { Locator, Page } from "@playwright/test";
import {
  FRAMED_LINK_ADDRESS_NAME,
  FRAMED_LINK_CONFIRM_LABEL,
  FRAMED_LINK_CONFIRM_TITLE,
  FRAMED_LINK_PART_ATTRIBUTE,
  FRAMED_LINK_PARTS,
  FRAMED_MAIL_CONFIRM_DESCRIPTION,
  FRAMED_MAIL_CONFIRM_TITLE,
} from "#client/components/framed-link-names.ts";
import { FRAMED_LINK_FIRST_WAIT_MS, FRAMED_LINK_FREE_CANCELS } from "#client/components/framed-link-pace.ts";
import { openCardRoom, recordExternalPages, serveCardRoom } from "./_card-frame-room.ts";
import type { RoutedReplyBesideFieldStory } from "./_routed-card-text-scale-stories.tsx";

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedReplyBesideFieldStory";
const CARD_ROOT = '[data-slot="immersive-card"]';
const CARD_HEADER = '[data-slot="immersive-card-header"]';
const ROUTED_CARD = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const POPUP = '[data-slot="alert-dialog-popup"]';
const OUTSIDE_FIELD = { name: "Outside the frame", exact: true } as const;
const CANCEL = { name: "Cancel", exact: true } as const;
const LINK_URL = "https://example.test/tide-tables";
const RIDE_URL = "https://ride.test/rode-a-click";
const RIDE_EVENT = "link-gate-ride";
const FOCUS_PRESS_BUDGET = 4;
const TIDE_LINK = `<a id="tide-link" href="${LINK_URL}">Full tables</a>`;
const PHONE = { width: 360, height: 740 } as const;
const DESKTOP = { width: 1280, height: 800 } as const;

const HOST_PART = `[${FRAMED_LINK_PART_ATTRIBUTE}="${FRAMED_LINK_PARTS.host}"]`;
const MAILBOX_PART = `[${FRAMED_LINK_PART_ATTRIBUTE}="${FRAMED_LINK_PARTS.mailbox}"]`;
const ADDRESS_PART = `[${FRAMED_LINK_PART_ATTRIBUTE}="${FRAMED_LINK_PARTS.address}"]`;

/** A card whose script, on `RIDE_EVENT`, posts a link and takes focus in the order named, with no click in it. */
function ridingCard(order: "post-then-focus" | "focus-then-post"): string {
  const post = `parent.postMessage({orbCardFrameLink:"${RIDE_URL}"},"*");`;
  const focus = 'document.getElementById("ride-field").focus();';
  const ride = order === "post-then-focus" ? `${post}${focus}` : `${focus}${post}`;
  return [
    ':::card title="Tide tables"',
    `<input id="ride-field" aria-label="Card field">${TIDE_LINK}`,
    `<script>document.body.dataset.ran="";document.body.addEventListener("${RIDE_EVENT}",function(){${ride}document.body.dataset.rode="";});</script>`,
    ":::",
  ].join("\n");
}

for (const order of ["post-then-focus", "focus-then-post"] as const) {
  test(`a card script that posts a link around its own focus grab (${order}) raises nothing off a click in the app`, async ({ corpus, mount, page }) => {
    const room = await openCardRoom(ridingCard(order), "interactive");
    await using root = room.root;
    await using _routes = await serveCardRoom(page, root, corpus);
    await mount<typeof RoutedReplyBesideFieldStory>(STORY, { chatId: room.chatId });
    const card = page.frameLocator(ROUTED_CARD);
    await expect(card.locator("body[data-ran]")).toHaveCount(1);
    // The reader's click in the app: the page holds a live activation from here on.
    const field = page.getByRole("textbox", OUTSIDE_FIELD);
    await field.click();
    await card.locator("body").evaluate((body, cue) => body.dispatchEvent(new Event(cue)), RIDE_EVENT);
    await expect(card.locator("body[data-rode]")).toHaveCount(1);
    // The posted link raised nothing, and the gate sent the grab back to the field the reader held.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(field).toBeFocused();
    // Positive control: the reader's own click on the card's link raises the confirm for that link.
    await card.locator("#tide-link").click();
    await expect(page.getByRole("alertdialog").locator(ADDRESS_PART)).toHaveText(LINK_URL);
  });
}

test("Tab into a card and Enter on its link raises the confirm", async ({ corpus, mount, page }) => {
  const room = await openCardRoom(`:::card title="Tide tables"\n${TIDE_LINK}\n:::`, "static");
  await using root = room.root;
  await using _routes = await serveCardRoom(page, root, corpus);
  await mount<typeof RoutedReplyBesideFieldStory>(STORY, { chatId: room.chatId });
  const frame = page.locator(ROUTED_CARD);
  await expect(frame).toHaveAttribute("data-drawn", "");
  await page.locator(`${CARD_HEADER} button`).last().focus();
  const inFrame = page.frameLocator(ROUTED_CARD).locator("html");
  for (let presses = 1; presses <= FOCUS_PRESS_BUDGET && (await inFrame.evaluate(() => document.activeElement?.id)) !== "tide-link"; presses += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(frame).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog").locator(ADDRESS_PART)).toHaveText(LINK_URL);
});

// Each address a card script posts on a click of its button, built from code points so no source byte is invisible.
const CYRILLIC_A = String.fromCodePoint(0x4_30);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x20_2e);
const LONG_HOST = "accounts.google.com.secure.signin.verification.authorization.example.test";
const POSTED = {
  credentials: "https://reader:secret@example.test/creds",
  userAsHost: "https://www.google.com@example.test/at",
  lookalike: `https://${CYRILLIC_A}pple.test/idn`,
  override: `https://example.test/${RIGHT_TO_LEFT_OVERRIDE}txt.exe`,
  longPath: `https://example.test/${"tide".repeat(600)}`,
  attachment: "mailto:someone@example.test?attach=/etc/passwd",
  mail: "mailto:someone@example.test?subject=Tides",
} as const;
type Posted = keyof typeof POSTED;

/** One button per posted address, and a real link to the long host, which needs no script at all. */
const ADDRESS_CARD = [
  ':::card title="Addresses"',
  `<a id="long-host" href="https://${LONG_HOST}/login">Long host</a>`,
  ...Object.keys(POSTED).map((id) => `<button id="${id}">${id}</button>`),
  `<script>var posted=${JSON.stringify(POSTED)};document.querySelectorAll("button").forEach(function(button){button.addEventListener("click",function(){parent.postMessage({orbCardFrameLink:posted[button.id]},"*");});});</script>`,
  ":::",
].join("\n");

// The code points that could hide or reorder an address's text: C0 and C1 controls and every bidi mark or override.
const HIDING_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x6_1c, 0x6_1c],
  [0x20_0e, 0x20_0f],
  [0x20_2a, 0x20_2e],
  [0x20_66, 0x20_69],
];

function hidingCodePoints(text: string): number[] {
  const found: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (HIDING_RANGES.some(([from, to]) => code >= from && code <= to)) {
      found.push(code);
    }
  }
  return found;
}

/** Neither line runs past its own box or past the dialog's edge. */
async function expectUnclipped(part: Locator, page: Page): Promise<void> {
  const popup = await page.locator(POPUP).boundingBox();
  const box = await part.boundingBox();
  const overflow = await part.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(box?.x).toBeGreaterThanOrEqual(popup?.x ?? Number.POSITIVE_INFINITY);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((popup?.x ?? 0) + (popup?.width ?? 0));
}

for (const [width, viewport] of [
  ["phone", PHONE],
  ["desktop", DESKTOP],
] as const) {
  test(`at ${width} width the confirm shows the parsed host and address whole, opens exactly them, and refuses credentials`, async ({
    corpus,
    mount,
    page,
  }) => {
    await page.setViewportSize(viewport);
    const room = await openCardRoom(ADDRESS_CARD, "interactive");
    await using root = room.root;
    await using _routes = await serveCardRoom(page, root, corpus);
    const requested = await recordExternalPages(page);
    await mount<typeof RoutedReplyBesideFieldStory>(STORY, { chatId: room.chatId });
    const card = page.frameLocator(ROUTED_CARD);
    const confirm = page.getByRole("alertdialog");
    const post = async (id: Posted): Promise<void> => {
      await card.locator(`#${id}`).click();
    };
    const open = async (href: string): Promise<void> => {
      await confirm.getByRole("button", { name: FRAMED_LINK_CONFIRM_LABEL, exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect.poll(() => requested.at(-1)).toBe(href);
    };

    // A host too long for one line wraps on its own line, its registrable end inside the dialog.
    await card.locator("#long-host").click();
    await expect(confirm).toHaveAccessibleName(FRAMED_LINK_CONFIRM_TITLE);
    // Cancel takes the first focus, ahead of the address region's own tab stop.
    await expect(confirm.getByRole("button", CANCEL)).toBeFocused();
    await expect(confirm.locator(HOST_PART)).toHaveText(LONG_HOST);
    await expect(confirm.locator(ADDRESS_PART)).toHaveText(`https://${LONG_HOST}/login`);
    await expectUnclipped(confirm.locator(HOST_PART), page);
    await expectUnclipped(confirm.locator(ADDRESS_PART), page);
    await open(`https://${LONG_HOST}/login`);

    // Credentials raise nothing: the lookalike posted after them is the confirm's first address.
    await post("credentials");
    await post("userAsHost");
    await post("lookalike");
    await expect(confirm.locator(HOST_PART)).toHaveText("xn--pple-43d.test");
    await expect(confirm.locator(ADDRESS_PART)).toHaveText("https://xn--pple-43d.test/idn");
    await open("https://xn--pple-43d.test/idn");

    await post("override");
    await expect(confirm.locator(ADDRESS_PART)).toHaveText("https://example.test/%E2%80%AEtxt.exe");
    expect(hidingCodePoints((await confirm.textContent()) ?? "")).toEqual([]);
    await open("https://example.test/%E2%80%AEtxt.exe");

    // A long path wraps inside its own scroll region, and the dialog's actions stay on screen.
    await post("longPath");
    await expect(confirm.getByRole("region", { name: FRAMED_LINK_ADDRESS_NAME, exact: true })).toHaveText(POSTED.longPath);
    await expectUnclipped(confirm.locator(ADDRESS_PART), page);
    await expect(confirm.getByRole("button", { name: FRAMED_LINK_CONFIRM_LABEL, exact: true })).toBeInViewport();
    await open(POSTED.longPath);

    // A mail link naming an attachment raises nothing; a plain one shows its address and says it opens the mail app.
    await post("attachment");
    await post("mail");
    await expect(confirm).toHaveAccessibleName(FRAMED_MAIL_CONFIRM_TITLE);
    await expect(confirm).toContainText(FRAMED_MAIL_CONFIRM_DESCRIPTION);
    await expect(confirm.locator(MAILBOX_PART)).toHaveText("someone@example.test");
    await expect(confirm.locator(ADDRESS_PART)).toHaveText(POSTED.mail);
    // Enter answers the focused Cancel: nothing opens.
    await page.keyboard.press("Enter");
    await expect(confirm).toHaveCount(0);
    expect(requested.at(-1)).toBe(POSTED.longPath);
  });
}

test("a confirm the pace raised later returns focus to the field the reader held, and one raised over the frame to the card", async ({
  corpus,
  mount,
  page,
}) => {
  const room = await openCardRoom(`:::card title="Tide tables"\n<p id="tide-line">High water at dusk.</p>${TIDE_LINK}\n:::`, "static");
  await using root = room.root;
  await using _routes = await serveCardRoom(page, root, corpus);
  await mount<typeof RoutedReplyBesideFieldStory>(STORY, { chatId: room.chatId });
  const card = page.frameLocator(ROUTED_CARD);
  const confirm = page.getByRole("alertdialog");
  const field = page.getByRole("textbox", OUTSIDE_FIELD);
  // The free Cancels, then one more: the next link waits.
  for (let cancel = 0; cancel <= FRAMED_LINK_FREE_CANCELS; cancel += 1) {
    await card.locator("#tide-link").click();
    await confirm.getByRole("button", CANCEL).click();
    await expect(confirm).toHaveCount(0);
  }
  await card.locator("#tide-link").click();
  await expect(confirm).toHaveCount(0);
  // The reader moves on to the field; the waiting link raises its confirm over it, and a Cancel gives the field back.
  await field.click();
  await expect(confirm).toBeVisible({ timeout: 2 * FRAMED_LINK_FIRST_WAIT_MS });
  await confirm.getByRole("button", CANCEL).click();
  await expect(confirm).toHaveCount(0);
  await expect(field).toBeFocused();
  // A confirm that opens while the reader is in the frame returns to the card's own stop, never into the frame.
  await card.locator("#tide-link").click();
  await card.locator("#tide-line").click();
  await expect(confirm).toBeVisible({ timeout: 4 * FRAMED_LINK_FIRST_WAIT_MS });
  await confirm.getByRole("button", CANCEL).click();
  await expect(page.locator(CARD_ROOT)).toBeFocused();
});
