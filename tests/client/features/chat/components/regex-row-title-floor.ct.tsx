// @subject packages/client/src/features/chat/components/regex-tier-row.tsx
// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// The room's regex rows put their pattern on the title line beside the name. At the largest browser text on a phone the title floor, a rem
// length, outgrows the row: the floor yields to the row, and the name is cut short inside it.

import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, resolvedLength, setPlatformTextSize, titleReach } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;
// 390px is the common phone; 320px is the narrowest the platform suites name, where a floor of 288px leaves a row no room.
const PHONES = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;
const LARGEST_TEXT = PLATFORM_TEXT_SCALES[2];
const TIER_NAME = "Quotation marks smoothed across every speaker in the long vigil at the lighthouse keeper's cottage";
const SCREEN_NAME = "Narration tinted by speaker through the storm season at the lighthouse keeper's cottage and after";

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

async function hostRoom(root: Harness): Promise<ChatId> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      return room.id;
    }
  }
  throw new Error("The corpus has no room the owner hosts");
}

for (const phone of PHONES) {
  test.describe(`a ${String(phone.width)}px phone`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true });

    test("a tier row and an on-screen row cut a long name inside the row at the largest browser text", async ({ mount, page, corpusMedia }) => {
      await using _textSize = await setPlatformTextSize(page, LARGEST_TEXT);
      await using root = await createCorpusHarness();
      const chatId = await hostRoom(root);
      const host = await root.internalCallerFor(root.ownerId);
      const tier = await host.regex.createScript({
        input: createRegexScriptSchema.parse({ name: TIER_NAME, findRegex: "x", replaceString: "y", placement: ["AI_OUTPUT"], enabled: true }),
      });
      await host.regex.createScript({
        input: createRegexScriptSchema.parse({ name: SCREEN_NAME, findRegex: "x", replaceString: "y", placement: ["DISPLAY"], enabled: true }),
      });
      await host.regex.attachToChat({ chatId, scriptId: tier.id });
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(host, TAB_PROCEDURES));
      await corpusMedia();
      await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId, width: phone.width });
      await page.getByRole("button", { name: /^Regex/u }).click();

      const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, page.locator("body"));
      for (const name of [TIER_NAME, SCREEN_NAME]) {
        const row = page.locator('[data-slot="list-row-root"]').filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
        await expect(row).toHaveCount(1);
        const reach = await titleReach(row, floor);
        expect(reach.pastRowBy).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
        expect(reach.nameKeepsItsFloor).toBe(true);
      }
    });
  });
}
