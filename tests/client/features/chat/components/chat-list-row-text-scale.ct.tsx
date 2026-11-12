// A chats-list row keeps a readable share of its name at every app font setting. Rooms that share a title carry a date qualifier. At the
// default font setting the name fits beside it and they share one line; at a larger setting the qualifier gives way to its own line before
// the name is squeezed under the title floor.
// The rows are the production Chats list of the real shell, over rooms a real server holds.
// @subject packages/client/src/features/chat/components/chat-summary-row.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { FONT_SCALE } from "@orb/kit/font-scale";
import { MS_PER_HOUR, UTC_TIME_ZONE } from "@orb/kit/time";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness, seedCorpusConnections } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { CHAT_COMPOSER_NAME, CHAT_LIST_NAME } from "#client/features/chat/lib/chat-surface-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SAME_TITLE_ROOMS = 3;
// The default font setting, a larger one, and the largest the appearance control offers; the date shares the name's line only at the first.
const FONT_SETTINGS = [
  { scale: 1, dateBesideName: true },
  { scale: 1.25, dateBesideName: false },
  { scale: FONT_SCALE.max, dateBesideName: false },
] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const { scale, dateBesideName } of FONT_SETTINGS) {
  test(`rooms sharing a title keep the name at its floor, with the date ${dateBesideName ? "beside it" : "on its own line"}, at an app font scale of ${String(scale)}`, async ({
    corpus,
    mount,
    page,
  }) => {
    await using root = await createFirstBootHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await seedCorpusConnections(root, await root.principalFor(root.ownerId));
    const keeper = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "native-keeper", name: "Keeper", description: "Keeps the light." }),
    });
    for (let room = 0; room < SAME_TITLE_ROOMS; room += 1) {
      const { chat } = await caller.chat.startChat({ characterIds: [keeper.id], opening: "none" });
      root.clock.advance(MS_PER_HOUR);
      await caller.chat.commitMessage({ chatId: chat.id, content: `Entry number ${String(room)}.`, timeZone: UTC_TIME_ZONE });
    }
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...ROOM_PROCEDURES]));
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    await setRootFontScale(page, channelName("fontScale"), scale);

    const rows = page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).locator('[data-slot="list-row-root"]');
    await expect(rows).toHaveCount(SAME_TITLE_ROOMS);
    await rows.first().click();
    await expect(page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true })).toBeVisible();
    // The least width a row title keeps, as the browser resolves the token under this font setting.
    const floor = await rows.first().evaluate((row, floorVar) => {
      const probe = document.createElement("div");
      probe.style.inlineSize = `var(${floorVar})`;
      row.append(probe);
      const resolved = probe.getBoundingClientRect().width;
      probe.remove();
      return resolved;
    }, TOKENS["width.title-floor"].cssVar);
    expect(floor).toBeGreaterThan(0);
    const shown = await rows.evaluateAll((nodes) =>
      nodes.map((row) => {
        const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]');
        const qualifier = row.querySelector('[data-slot="list-row-title-qualifier"]')?.getBoundingClientRect();
        const box = title?.getBoundingClientRect();
        // The name's own text width, whatever width the title box was given.
        const text = document.createRange();
        if (title !== null) {
          text.selectNodeContents(title);
        }
        return {
          title: box?.width ?? 0,
          natural: text.getBoundingClientRect().width,
          beside: qualifier !== undefined && box !== undefined && qualifier.top < box.bottom,
          qualifierRight: qualifier?.right ?? 0,
          rowRight: row.getBoundingClientRect().right,
        };
      }),
    );
    for (const row of shown) {
      // A name shorter than the floor keeps its own width; a longer one keeps the floor.
      expect(row.title).toBeGreaterThanOrEqual(Math.min(floor, row.natural) - SUBPIXEL);
      expect(row.beside).toBe(dateBesideName);
      // The positive control: the qualifier is on the row, whole, so the title is not at its floor only because the qualifier is gone.
      expect(row.qualifierRight).toBeGreaterThan(0);
      expect(row.qualifierRight).toBeLessThanOrEqual(row.rowRight + SUBPIXEL);
    }
  });
}
