// @subject packages/client/src/features/chat/components/chat-controls-band.tsx
// A quick-reply chip whose label is a whole sentence lies inside the band that holds it at the largest browser text on a phone: the label breaks
// inside the chip, so the chip is neither cut at the band's edge nor pushed past it.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import { ID_PREFIX } from "@orb/kit/ids";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ChatControlsBandStory } from "./_chat-controls-band-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-controls-band-stories/ChatControlsBandStory";
const PHONE = { width: 390, height: 844 } as const;
const LARGEST_TEXT = PLATFORM_TEXT_SCALES[2];
// An opener deck as a rule author writes one: starters that are whole sentences, each longer than the band at this text size.
const LABELS = ["Continue.", "Time skip — later that day, once the rain has stopped.", "New scene: the harbour at first light."] as const;

type SurfacedChips = Extract<AutomationBusEvent, { type: "quickReplySurfaced" }>;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("every quick-reply chip lies inside its band at the largest browser text on a phone", async ({ corpus, mount, page }) => {
  await using _textSize = await setPlatformTextSize(page, LARGEST_TEXT);
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = corpus.reads["chat.getChat"][0]?.output;
  if (room === undefined) {
    throw new Error("The committed corpus omitted a room");
  }
  const automationRoom = ({ ref }: { readonly ref: { readonly channel: string } }): null | ReturnType<typeof trpcError> =>
    ref.channel === "automation" ? null : trpcError({ code: "NOT_FOUND" });
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "stream.attach": automationRoom,
    "stream.detach": automationRoom,
  });
  const surfaced: SurfacedChips = {
    type: "quickReplySurfaced",
    chatId: room.id,
    source: { kind: "rule", ruleId: root.idSource.typeId(ID_PREFIX.automationRule) },
    choices: LABELS.map((label) => ({ label, sendText: label, mode: "compose" })),
  };
  await routeOrbSocket(page, {
    awaitRooms: [{ channel: "automation", chatId: room.id }],
    frames: [{ channel: "automation", chatId: room.id, event: surfaced }],
  });
  await mount<typeof ChatControlsBandStory>(STORY, { chatId: room.id });

  const band = page.locator('[data-slot="chat-controls"]');
  const chips = band.locator('[data-slot="chat-control-chips"] button[data-mode]');
  // The deck is shown whole: every chip is there to be measured.
  await expect(chips).toHaveCount(LABELS.length);
  const outside = await band.evaluate(
    (card, { chipSelector, subpixel }) => {
      const edges = card.getBoundingClientRect();
      return [...card.querySelectorAll(chipSelector)]
        .map((chip) => chip.getBoundingClientRect())
        .map((box) => Math.max(0, edges.left - box.left, box.right - edges.right))
        .filter((overshoot) => overshoot > subpixel);
    },
    { chipSelector: '[data-slot="chat-control-chips"] button[data-mode]', subpixel: LAYOUT_SUBPIXEL_PX },
  );
  expect(outside).toEqual([]);
});
