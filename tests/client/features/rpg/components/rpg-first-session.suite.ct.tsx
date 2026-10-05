import { rpgConfigViewSchema } from "@orb/contracts/rpg";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ctSnapPath } from "../../../../support/node/snap-out.ts";
import { CtToastSurface } from "../../../lib/_ct-stories.tsx";
import { MessageContentSpansStory } from "../../chat/_ct-stories.tsx";
import { CHAT_ID } from "../../chat/fixtures.ts";
import { RpgFirstSessionStory } from "../_first-session-stories.tsx";
import { FIRST_SESSION_USER, firstSessionConfig, firstSessionTracker } from "../first-session-fixtures.ts";
import { makeRpgGameView } from "../fixtures.ts";

async function routeFirstSession(page: Page, roll?: ReturnType<typeof trpcHold>, initial = firstSessionConfig()): Promise<void> {
  let config = initial;
  const attributes: Record<string, number> = {};
  await routeTrpc(page, {
    "settings.getUserSettings": { userId: FIRST_SESSION_USER, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
    "chat.getChat": {
      participants: [],
      viewerUserId: FIRST_SESSION_USER,
      viewerIsHost: true,
      viewerActivePersonaId: null,
      rpg: { gameId: "rpg_game_ct_first_session", engaged: true },
    },
    "rpg.getGame": () => {
      const game = makeRpgGameView(CHAT_ID, { ruleset: config.ruleset });
      return { ...game, publicConfig: { ...game.publicConfig, statProfile: config.statProfile } };
    },
    "rpg.getTrackerView": () => firstSessionTracker(attributes),
    "rpg.getConfigView": () => config,
    "preset.list": [],
    "rpg.updateConfig": (input): undefined => {
      config = rpgConfigViewSchema.parse({
        ...config,
        ...input.patch,
        ...(input.extractionMode === undefined ? {} : { extractionMode: input.extractionMode }),
      });
    },
    "rpg.patchSheet": (input): undefined => {
      for (const [key, value] of Object.entries(input.patch.attributes ?? {})) {
        if (value === null) {
          delete attributes[key];
        } else {
          attributes[key] = value;
        }
      }
    },
    "rpg.rollDice": roll ?? (() => ({ notation: "4d6", rolls: [1, 6, 6, 4], modifier: 0, total: 17, stamp: "[dice: 4d6 → 17]" })),
  });
}

test("setup leads with ruleset, stats and play style; Advanced retains and autosaves the other settings", async ({ mount, page }) => {
  await routeFirstSession(page);
  const component = await mount(<RpgFirstSessionStory />);
  await expect(component.getByText("Play style", { exact: true })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Steering note", exact: true })).toBeHidden();
  await component.screenshot({ path: ctSnapPath("rpg-first-session-setup") });
  await component.getByRole("button", { name: "Advanced", exact: true }).click();
  const note = component.getByRole("textbox", { name: "Steering note", exact: true });
  await expect(note).toHaveValue("Keep the mystery.");
  await note.fill("Keep the moonlit mystery.");
  await component.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(note).toBeHidden();
  await component.getByRole("switch", { name: "Offer story choices", exact: true }).click();
  await component.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(note).toHaveValue("Keep the moonlit mystery.");
  await expect(component.getByText("Events outside the party's view", { exact: true })).toBeVisible();
  await expect(component.getByText("When state updates", { exact: true })).toBeVisible();
  await component.screenshot({ path: ctSnapPath("rpg-first-session-advanced") });
});

test("D20 fills six scores with the standard array or server rolls and keeps manual entry", async ({ mount, page }) => {
  await routeFirstSession(page);
  const component = await mount(<RpgFirstSessionStory character={true} />);
  await component.getByRole("button", { name: "Use standard array", exact: true }).click();
  await expect(component.getByRole("button", { name: "Strength value", exact: true })).toHaveText("15");
  await expect(component.getByRole("button", { name: "Charisma value", exact: true })).toHaveText("8");
  await component.getByRole("button", { name: "Roll 4d6 drop lowest", exact: true }).click();
  await expect(component.getByRole("button", { name: "Strength value", exact: true })).toHaveText("16");
  await expect(component.getByRole("button", { name: "Charisma value", exact: true })).toHaveText("16");
  await component.getByRole("button", { name: "Enter by hand", exact: true }).click();
  await expect(component.getByText("Select any score below to edit it.", { exact: true })).toBeVisible();
  await component.getByRole("button", { name: "Strength value", exact: true }).click();
  const score = component.getByRole("textbox", { name: "Strength value", exact: true });
  await score.fill("13");
  await score.press("Enter");
  await expect(component.getByRole("button", { name: "Strength value", exact: true })).toHaveText("13");
  await component.screenshot({ path: ctSnapPath("rpg-first-session-attributes") });
});

test("ability stamps stay in the same paragraph and preserve spanning formatting", async ({ mount }) => {
  const body = "**I push. [dice: Strength d20+2 → 16] The door opens. [dice: Wisdom d20-1 → 8] We enter.**\n\nNext paragraph.";
  const component = await mount(<MessageContentSpansStory content={body} />);
  const paragraphs = component.locator("p");
  await expect(paragraphs).toHaveCount(2);
  const first = paragraphs.first();
  await expect(first.locator("[data-streamdown=strong] [data-slot=message-dice-chip]")).toHaveCount(2);
  await expect(first).toHaveText("I push. Strength d20+2 → 16 The door opens. Wisdom d20-1 → 8 We enter.");
  await expect
    .poll(async () => {
      const bounds = await first.evaluate((paragraph) => {
        const chips = [...paragraph.querySelectorAll("[data-slot=message-dice-chip]")].map((element) => element.getBoundingClientRect());
        const range = document.createRange();
        range.selectNodeContents(paragraph.querySelector("[data-streamdown=strong]")?.firstChild ?? paragraph);
        const prose = range.getBoundingClientRect();
        return {
          prose: { top: prose.top, bottom: prose.bottom, right: prose.right },
          chips: chips.map((rect) => ({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width })),
        };
      });
      const [chip] = bounds.chips;
      return chip === undefined
        ? null
        : {
            hasWidth: chip.width > 0,
            followsProse: chip.left >= bounds.prose.right,
            topOverlaps: chip.top < bounds.prose.bottom,
            bottomOverlaps: chip.bottom > bounds.prose.top,
          };
    })
    .toEqual({ hasWidth: true, followsProse: true, topOverlaps: true, bottomOverlaps: true });
  await component.screenshot({ path: ctSnapPath("rpg-first-session-dice-chip") });
});

test("a pending generation describes disabled controls and a failed roll leaves saved scores intact", async ({ mount, page }) => {
  const roll = trpcHold();
  await routeFirstSession(page, roll);
  const component = await mount(
    <CtToastSurface>
      <RpgFirstSessionStory character={true} />
    </CtToastSurface>,
  );
  await component.getByRole("button", { name: "Use standard array", exact: true }).click();
  const strength = component.getByRole("button", { name: "Strength value", exact: true });
  await expect(strength).toHaveText("15");
  const generate = component.getByRole("button", { name: "Roll 4d6 drop lowest", exact: true });
  await generate.click();
  await roll.requested;
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAccessibleDescription("Filling scores…");
  await expect(component.getByRole("status")).toHaveText("Filling scores…");
  roll.release(trpcError({ message: "dice unavailable" }));
  await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: "Couldn't fill the attributes. Your saved scores are unchanged." })).toBeVisible();
  await expect(generate).toBeEnabled();
  await expect(strength).toHaveText("15");
  await expect(component.getByRole("button", { name: "Charisma value", exact: true })).toHaveText("8");
});

test("Freeform keeps saved attributes and offers manual scores without promising D20 generation", async ({ mount, page }) => {
  await routeFirstSession(page, undefined, { ...firstSessionConfig(), ruleset: "freeform" });
  const component = await mount(<RpgFirstSessionStory />);
  await expect(component.locator('[data-slot="badge"]').filter({ hasText: /^Strength$/ })).toBeVisible();
  await expect(component.getByText("Enter and edit character scores in Status. Customize stat definitions in Advanced.", { exact: true })).toBeVisible();
  await expect(
    component.getByText("Fill character scores in Status: roll 4d6 drop lowest, use the standard array, or enter them by hand.", { exact: true }),
  ).toHaveCount(0);
});
