// @subject packages/client/src/features/chat/components/art-slot.tsx
// A message avatar's touch reach survives the transcript scroller's clip and stays clear of the bubble in every chat style and
// density, and the composer keeps the start edge the transcript rows take, at the narrowest phone, a phone and a desktop.

import { viewImageActionName } from "@orb/client/lib";
import { THEME_CHAT_STYLES, THEME_DENSITIES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { resolvedLength, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty, nameShape } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { CHAT_OPTIONS_NAME, CHAT_SELECT_MESSAGES_NAME } from "#client/features/chat/lib/chat-options-names.ts";
import { MESSAGE_SELECT_NAME } from "#client/features/chat/lib/message-action-names.ts";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROLES = ["user", "assistant"] as const;
const IMAGE_ACTION = nameShape(viewImageActionName);
const ROW = '[data-slot="message-row"]';
const PHONES = [
  { name: "320", viewport: { width: 320, height: 700 }, coarse: true },
  { name: "390", viewport: { width: 390, height: 844 }, coarse: true },
] as const;
const DESKTOP = { name: "desktop", viewport: { width: 1280, height: 800 }, coarse: false } as const;
const REGIMES = [...PHONES, DESKTOP] as const;
// The touch cells the whole reach holds in: the phones, and a landscape phone, whose pane is past the narrow step.
const REACH_CELLS = [...PHONES, { name: "844x390", viewport: { width: 844, height: 390 } }] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

interface Look {
  readonly chatStyle?: (typeof THEME_CHAT_STYLES)[number];
  readonly density: (typeof THEME_DENSITIES)[number];
}

interface RoomRoutes {
  readonly page: Page;
  readonly corpus: Parameters<typeof createShellAmbientReads>[0];
  readonly corpusMedia: () => Promise<unknown>;
}

/** A room whose user and assistant messages both carry a picture, with the shell's reads routed to the corpus. */
async function prepareRoom(
  routes: RoomRoutes,
  root: Root,
  look: Look,
): Promise<{ readonly chatId: ChatId; readonly messageIds: Map<(typeof ROLES)[number], MessageId> }> {
  const { corpus, corpusMedia, page } = routes;
  const caller = await root.internalCallerFor(root.ownerId);
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("Corpus needs an owned pictured character");
  }
  const messageIds = new Map<(typeof ROLES)[number], MessageId>();
  let chatId: ChatId | undefined;
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const user = messages.find((message) => message.role === "user" && message.personaId !== null);
    const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
    if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
      continue;
    }
    await caller.persona.update({ personaId: user.personaId, input: { avatarAssetId: pictured.avatarAssetId } });
    await caller.character.update({ characterId: assistant.characterId, input: { avatarAssetId: pictured.avatarAssetId } });
    chatId = room.id;
    messageIds.set("user", user.id).set("assistant", assistant.id);
    break;
  }
  if (chatId === undefined) {
    throw new Error("Corpus needs a room with pictured persona and character messages");
  }
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({
    section: "appearance",
    patch: {
      showInChatAvatars: true,
      backgroundImageKind: "none",
      density: look.density,
      ...(look.chatStyle === undefined ? {} : { chatStyle: look.chatStyle }),
    },
  });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await corpusMedia();
  return { chatId, messageIds };
}

/** The inline edges of the first transcript row and the composer's track. */
async function roomEdges(page: Page): Promise<{ readonly row: readonly [number, number]; readonly composer: readonly [number, number] }> {
  const edgesOf = async (selector: string): Promise<readonly [number, number]> => {
    const box = await page.locator(selector).last().boundingBox();
    return [box?.x ?? Number.NaN, (box?.x ?? Number.NaN) + (box?.width ?? Number.NaN)];
  };
  return { row: await edgesOf(ROW), composer: await edgesOf('[data-track="composer"]') };
}

/** Whether the whole reach square of an opener hits it (four edge points), and which bubble-edge points it covers. */
function probeReach(element: Element, reach: number): { readonly hits: readonly boolean[]; readonly covered: readonly number[]; readonly geometry?: string } {
  const box = element.getBoundingClientRect();
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;
  const inset = reach / 2 - 1;
  const edges = [
    [centreX - inset, centreY],
    [centreX + inset, centreY],
    [centreX, centreY - inset],
    [centreX, centreY + inset],
  ] as const;
  const found = edges.map(([x, y]) => element.ownerDocument.elementFromPoint(x, y));
  const hits = found.map((hit) => element.contains(hit));
  const bubble = element.closest('[data-slot="message-row"]')?.querySelector('[data-slot="message-content-column"]')?.getBoundingClientRect();
  // An avatar seated inside its card (whisper, hush, echo's header, ripple's welded portrait) belongs to the card; the reach
  // covers a bubble point only for a chip standing outside the card.
  const inCard = bubble !== undefined && box.left >= bubble.left && box.right <= bubble.right;
  const covered =
    bubble === undefined || inCard
      ? []
      : [bubble.left + 1, bubble.right - 1].flatMap((x) =>
          [bubble.top + 1, bubble.top + bubble.height / 2, bubble.bottom - 1].filter((y) => element.contains(element.ownerDocument.elementFromPoint(x, y))),
        );
  const scroller = element.closest('[data-slot="message-list-scroll"]')?.getBoundingClientRect();
  const span = (rect: DOMRect | undefined): string => (rect === undefined ? "none" : `${rect.left}..${rect.right} x ${rect.top}..${rect.bottom}`);
  // Only a failing probe carries its geometry, so the failure names the cell without a rerun.
  const whole = hits.every(Boolean) && covered.length === 0;
  return whole
    ? { hits, covered }
    : {
        hits,
        covered,
        geometry: `chip ${span(box)}; bubble ${span(bubble)}; scroller ${span(scroller)}; edges hit ${found.map((hit) => hit?.getAttribute("data-slot") ?? hit?.tagName).join(", ")}`,
      };
}

/** The other controls whose hit area the opener's reach square wins from them: every point of the square, sampled every two
 *  pixels, where the opener is topmost and a control of the row lies beneath it. A neighbour's own touch pseudo counts as its
 *  hit area, not only its box, so this reads the browser's hit test rather than comparing boxes. */
function controlsBeneath(element: Element, reach: number): readonly string[] {
  // A picture with no reach pseudo (ripple's welded portrait) wins nothing from its neighbours: its own box is its hit area.
  if (getComputedStyle(element, "::before").content === "none") {
    return [];
  }
  const box = element.getBoundingClientRect();
  const left = box.left + box.width / 2 - reach / 2;
  const top = box.top + box.height / 2 - reach / 2;
  const ticks = Array.from({ length: Math.floor(reach / 2) }, (_, index) => 1 + 2 * index);
  const stacks = ticks.flatMap((dx) => ticks.map((dy) => element.ownerDocument.elementsFromPoint(left + dx, top + dy)));
  const controls = stacks
    .filter(([topmost]) => topmost !== undefined && element.contains(topmost))
    .flatMap((stack) => stack.filter((candidate) => candidate.matches('button, a[href], [role="button"], [role="menuitem"], [role="checkbox"], input')))
    .filter((control) => !(control.contains(element) || element.contains(control)));
  // Only a failing probe has anything to list, so each entry carries both boxes and the failure names the cell without a rerun.
  const span = (target: Element): string => {
    const rect = target.getBoundingClientRect();
    return `${rect.left}..${rect.right} x ${rect.top}..${rect.bottom}`;
  };
  return [...new Set(controls.map((control) => `${control.getAttribute("aria-label") ?? control.tagName} ${span(control)} under chip ${span(element)}`))];
}

for (const density of THEME_DENSITIES) {
  for (const regime of REGIMES) {
    test.describe(`${regime.name} ${density}`, () => {
      test.use({ hasTouch: regime.coarse, isMobile: regime.coarse, viewport: regime.viewport });

      test("the composer and the transcript rows share their edges on a phone and nest on a desktop", async ({ corpus, corpusMedia, mount, page }) => {
        await using root = await createCorpusHarness();
        const { chatId } = await prepareRoom({ corpus, corpusMedia, page }, root, { density });
        await mount<typeof ChatRoomShellStory>(STORY, { chatId });
        await page.locator('[data-track="composer"]').last().waitFor();
        const { row, composer } = await roomEdges(page);
        // A phone's room is one column, so both edges meet; a desktop centres both on one track and the composer sits inside the rows.
        const expected = regime.coarse ? row : [composer[0], composer[1]];
        expect(composer).toEqual(expected);
        expect(composer[0]).toBeGreaterThanOrEqual(row[0]);
      });
    });
  }
}

// A skin that paints no avatar (the stock document) has no reach to test.
forEachNonEmpty(
  THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].avatarTreatment("character") !== "none"),
  "chat styles that paint an avatar",
  (chatStyle) => {
    for (const density of THEME_DENSITIES) {
      for (const regime of REACH_CELLS) {
        test.describe(`${regime.name} ${density} ${chatStyle} avatar reach`, () => {
          test.use({ hasTouch: true, isMobile: true, viewport: regime.viewport });

          test("each avatar's whole reach hits the avatar inside the scroller and covers no bubble point", async ({ corpus, corpusMedia, mount, page }) => {
            await using root = await createCorpusHarness();
            const { chatId, messageIds } = await prepareRoom({ corpus, corpusMedia, page }, root, { chatStyle, density });
            await mount<typeof ChatRoomShellStory>(STORY, { chatId });
            for (const role of ROLES) {
              const opener = await openerOf(page, messageIds.get(role));
              const floor = await resolvedLength(page, `var(${TOKENS["size.touch-target"].cssVar})`, opener);
              // The row has just scrolled into view; a hit read mid-scroll is not a settled position, so the probe polls.
              await expect
                .poll(() => opener.evaluate(probeReach, floor), { message: `${role} avatar reach (edges start, end, top, bottom; bubble points covered)` })
                .toEqual({ hits: [true, true, true, true], covered: [] });
              await expect.poll(() => opener.evaluate(controlsBeneath, floor), { message: `${role} avatar reach: controls beneath it` }).toEqual([]);
            }
          });
        });
      }
    }
  },
);

// A pane enlarged by text scale: from the `cq-16` step down the avatar keeps the 44px physical floor, which does not grow with the
// text (the `avatar-reach.ts` header). The sweep crosses that step at both phone widths, in every chip style and density: the reach
// is the opener's own pseudo square, it holds the floor, it is hit whole inside the scroller, and it covers neither a bubble point
// nor any other control of the row (the header's edit and actions controls).
const ENLARGED_WIDTHS = [
  { name: "320", viewport: { width: 320, height: 700 } },
  { name: "390", viewport: { width: 390, height: 844 } },
] as const;
const ENLARGED_FACTORS = [1.1, 1.15, 1.2, 1.25] as const;

/** The square an opener lays over its row: its `::before` hit area when it has one, else the picture itself. */
function reachSizeOf(element: Element): number {
  const pseudo = Number.parseFloat(getComputedStyle(element, "::before").width);
  return Number.isFinite(pseudo) ? pseudo : element.getBoundingClientRect().width;
}

forEachNonEmpty(
  THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].avatarTreatment("character") !== "none"),
  "chat styles that paint an avatar at enlarged text",
  (chatStyle) => {
    for (const density of THEME_DENSITIES) {
      for (const width of ENLARGED_WIDTHS) {
        for (const factor of ENLARGED_FACTORS) {
          test.describe(`${width.name} ${String(Math.round(factor * 100))}% text ${density} ${chatStyle} avatar reach`, () => {
            test.use({ hasTouch: true, isMobile: true, viewport: width.viewport });

            test("each avatar's reach holds the physical 44px floor, hit whole inside the scroller, covering no bubble point and no other control", async ({
              corpus,
              corpusMedia,
              mount,
              page,
            }) => {
              await using root = await createCorpusHarness();
              const { chatId, messageIds } = await prepareRoom({ corpus, corpusMedia, page }, root, { chatStyle, density });
              await mount<typeof ChatRoomShellStory>(STORY, { chatId });
              await setRootFontScale(page, channelName("fontScale"), factor);
              const physical = await resolvedLength(page, `var(${TOKENS["size.touch-target-physical"].cssVar})`);
              for (const role of ROLES) {
                const opener = await openerOf(page, messageIds.get(role));
                await expect.poll(() => opener.evaluate(reachSizeOf), { message: `${role} avatar reach square` }).toBeGreaterThanOrEqual(physical);
                const reach = await opener.evaluate(reachSizeOf);
                await expect
                  .poll(() => opener.evaluate(probeReach, reach), {
                    message: `${role} avatar physical reach (edges start, end, top, bottom; bubble points covered)`,
                  })
                  .toEqual({ hits: [true, true, true, true], covered: [] });
                await expect.poll(() => opener.evaluate(controlsBeneath, reach), { message: `${role} avatar reach: controls beneath it` }).toEqual([]);
              }
            });
          });
        }
      }
    }
  },
);

// Selection mode puts a "Select message" checkbox in every row's stack, directly above the next row's chip: its touch square and the
// chip's reach must not overlap. A fine pointer reveals a row's controls only on hover, so that cell hovers the row before it probes.
const SELECTION_CELLS = [
  { name: "320", viewport: { width: 320, height: 700 }, coarse: true, factor: 1 },
  { name: "320 at 125%", viewport: { width: 320, height: 700 }, coarse: true, factor: 1.25 },
  { name: "390", viewport: { width: 390, height: 844 }, coarse: true, factor: 1 },
  { name: "1280 fine", viewport: { width: 1280, height: 800 }, coarse: false, factor: 1 },
] as const;

forEachNonEmpty(
  THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].avatarTreatment("character") !== "none"),
  "chat styles that paint an avatar in selection mode",
  (chatStyle) => {
    for (const density of THEME_DENSITIES) {
      for (const cell of SELECTION_CELLS) {
        test.describe(`${cell.name} ${density} ${chatStyle} avatar reach in selection mode`, () => {
          test.use({ hasTouch: cell.coarse, isMobile: cell.coarse, viewport: cell.viewport });

          test("the avatar's reach and the Select message checkbox's touch square do not overlap", async ({ corpus, corpusMedia, mount, page }) => {
            await using root = await createCorpusHarness();
            const { chatId, messageIds } = await prepareRoom({ corpus, corpusMedia, page }, root, { chatStyle, density });
            await mount<typeof ChatRoomShellStory>(STORY, { chatId });
            await setRootFontScale(page, channelName("fontScale"), cell.factor);
            await page.getByRole("button", { name: CHAT_OPTIONS_NAME, exact: true }).click();
            await page.getByRole("menuitem", { name: CHAT_SELECT_MESSAGES_NAME, exact: true }).click();
            await expect(page.getByRole("checkbox", { name: MESSAGE_SELECT_NAME }).first()).toBeVisible();
            for (const role of ROLES) {
              const opener = await openerOf(page, messageIds.get(role));
              if (!cell.coarse) {
                await page.locator(`${ROW}[data-message-id="${messageIds.get(role) ?? ""}"]`).hover();
              }
              const reach = await opener.evaluate(reachSizeOf);
              await expect.poll(() => opener.evaluate(controlsBeneath, reach), { message: `${role} avatar reach: controls beneath it` }).toEqual([]);
            }
          });
        });
      }
    }
  },
);

// The header's gap that keeps the chip's reach clear of the glyph controls is a block-axis step: at a phone width and enlarged text the
// whisper header still fits its chip, name and actions on one line.
test.describe("390 compact whisper at 125% text avatar header", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("the chip, the name and the actions share one line", async ({ corpus, corpusMedia, mount, page }) => {
    await using root = await createCorpusHarness();
    const { chatId, messageIds } = await prepareRoom({ corpus, corpusMedia, page }, root, { chatStyle: "whisper", density: "compact" });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await setRootFontScale(page, channelName("fontScale"), 1.25);
    const opener = await openerOf(page, messageIds.get("assistant"));
    const header = page.locator(`${ROW}[data-message-id="${messageIds.get("assistant") ?? ""}"] [data-slot="message-name-row"]`).first();
    await expect(opener).toBeVisible();
    await expect
      .poll(() =>
        header.evaluate((node) => {
          const centres = [...node.children]
            .map((child) => child.getBoundingClientRect())
            .filter((rect) => rect.height > 0)
            .map((rect) => rect.top + rect.height / 2);
          return Math.max(...centres) - Math.min(...centres);
        }),
      )
      .toBeLessThan(2);
  });
});

/** A message's avatar opener, scrolled into view. */
async function openerOf(page: Page, messageId: MessageId | undefined): Promise<Locator> {
  const row = page.locator(`${ROW}[data-message-id="${messageId ?? ""}"]`);
  // Centred in the port: a reach clipped at the port's block edge by the scroll position is not the row's layout.
  await row.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const opener = row.getByRole("button", { name: IMAGE_ACTION });
  await expect(opener).toHaveCount(1);
  return opener;
}
